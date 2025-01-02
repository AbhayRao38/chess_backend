import { WebSocket } from "ws";
import { INIT_GAME, MOVE, FETCH_GAMES, GAMES_LIST, JOIN_SPECTATE, GAME_STATES_UPDATE, HEARTBEAT } from "./messages";
import { Game, GameState } from "./Game";

export class GameManager {
  private games: Map<string, Game>;
  private pendingUser: WebSocket | null;
  private users: Set<WebSocket>;
  private heartbeatInterval: NodeJS.Timeout;

  constructor() {
    this.games = new Map();
    this.pendingUser = null;
    this.users = new Set();
    console.log("GameManager initialized");
    setInterval(() => this.broadcastGameStates(), 1000); // Broadcast game states every second
    this.heartbeatInterval = setInterval(() => this.sendHeartbeat(), 30000); // Send heartbeat every 30 seconds
  }

  addUser(socket: WebSocket) {
    this.users.add(socket);
    this.addHandler(socket);
    console.log(`User added. Total users: ${this.users.size}`);
    this.sendGameStates(socket);
  }

  removeUser(socket: WebSocket) {
    this.users.delete(socket);
    
    if (this.pendingUser === socket) {
      this.pendingUser = null;
      console.log("Pending user removed");
    }

    this.games.forEach((game, id) => {
      if (game.player1 === socket || game.player2 === socket) {
        game.cleanup();
        this.games.delete(id);
        console.log(`Game ${id} removed due to player disconnection`);
        this.broadcastGameStates();
      } else {
        game.removeSpectator(socket);
      }
    });

    console.log(`User removed. Total users: ${this.users.size}`);
  }

  private addHandler(socket: WebSocket) {
    socket.on("message", (data) => {
      try {
        const message = JSON.parse(data.toString());
        console.log("GameManager received message:", message);

        switch (message.type) {
          case INIT_GAME:
            this.handleInitGame(socket);
            break;

          case MOVE:
            this.handleMove(socket, message);
            break;

          case FETCH_GAMES:
            this.handleFetchGames(socket);
            break;

          case JOIN_SPECTATE:
            this.handleJoinSpectate(socket, message);
            break;

          case HEARTBEAT:
            // Respond to heartbeat
            this.sendToUser(socket, { type: HEARTBEAT });
            break;

          default:
            console.warn('Unknown message type:', message.type);
        }
      } catch (error) {
        console.error('Error handling message:', error);
        this.sendError(socket, 'Invalid message format');
      }
    });
  }

  private handleInitGame(socket: WebSocket) {
    try {
      if (this.pendingUser) {
        const game = new Game(this.pendingUser, socket);
        this.games.set(game.id, game);
        this.pendingUser = null;
        console.log(`New game created with ID: ${game.id}`);
        console.log(`Total active games: ${this.games.size}`);
        this.broadcastGameStates();
      } else {
        this.pendingUser = socket;
        console.log("User added to pending list");
      }
    } catch (error) {
      console.error('Error initializing game:', error);
      this.sendError(socket, 'Failed to initialize game');
    }
  }

  private handleMove(socket: WebSocket, message: any) {
    try {
      const game = this.findGameByPlayer(socket);
      if (game) {
        game.makeMove(socket, message.payload.move);
        this.broadcastGameStates();
      } else {
        console.log("Move attempted for non-existent game");
      }
    } catch (error) {
      console.error('Error handling move:', error);
      this.sendError(socket, 'Failed to make move');
    }
  }

  private handleFetchGames(socket: WebSocket) {
    try {
      console.log("Handling FETCH_GAMES request");
      this.sendGameStates(socket);
    } catch (error) {
      console.error('Error fetching games:', error);
      this.sendError(socket, 'Failed to fetch games');
    }
  }

  private handleJoinSpectate(socket: WebSocket, message: any) {
    try {
      const game = this.games.get(message.payload.gameId);
      if (game) {
        game.addSpectator(socket);
        console.log(`Spectator joined game: ${message.payload.gameId}`);
        this.sendGameState(socket, game.getGameState());
      } else {
        console.log(`Game not found: ${message.payload.gameId}`);
        this.sendError(socket, 'Game not found');
      }
    } catch (error) {
      console.error('Error joining spectate:', error);
      this.sendError(socket, 'Failed to join game as spectator');
    }
  }

  private findGameByPlayer(socket: WebSocket): Game | undefined {
    return Array.from(this.games.values()).find(game => 
      game.player1 === socket || game.player2 === socket
    );
  }

  private sendError(socket: WebSocket, message: string) {
    this.sendToUser(socket, {
      type: 'error',
      payload: { message }
    });
  }

  private sendToUser(socket: WebSocket, message: any) {
    try {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify(message));
      }
    } catch (error) {
      console.error('Error sending message to user:', error);
    }
  }

  public getActiveGamesCount(): number {
    return this.games.size;
  }

  public getGameStates(): GameState[] {
    return Array.from(this.games.values()).map(game => game.getGameState());
  }

  private broadcastGameStates() {
    const gameStates = this.getGameStates();
    this.broadcast({
      type: GAME_STATES_UPDATE,
      payload: { games: gameStates }
    });
  }

  private sendGameStates(socket: WebSocket) {
    const gameStates = this.getGameStates();
    this.sendToUser(socket, {
      type: GAMES_LIST,
      payload: { games: gameStates }
    });
  }

  private sendGameState(socket: WebSocket, gameState: GameState) {
    this.sendToUser(socket, {
      type: GAME_STATES_UPDATE,
      payload: { games: [gameState] }
    });
  }

  private broadcast(message: any) {
    const jsonMessage = JSON.stringify(message);
    this.users.forEach(user => {
      if (user.readyState === WebSocket.OPEN) {
        user.send(jsonMessage);
      }
    });
  }

  private sendHeartbeat() {
    this.broadcast({ type: HEARTBEAT });
  }

  public cleanup() {
    clearInterval(this.heartbeatInterval);
  }
}