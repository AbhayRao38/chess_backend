import { WebSocket } from "ws";
import { INIT_GAME, MOVE, FETCH_GAMES, GAMES_LIST, JOIN_SPECTATE, GAME_STATES_UPDATE, GAME_OVER } from "./messages";
import { Game, GameState } from "./Game";

export class GameManager {
  private games: Map<string, Game>;
  private pendingUser: WebSocket | null;
  private users: Set<WebSocket>;

  constructor() {
    this.games = new Map();
    this.pendingUser = null;
    this.users = new Set();
    console.log("[GameManager] Initialized GameManager");
    setInterval(() => this.broadcastGameStates(), 1000);
  }

  addUser(socket: WebSocket) {
    this.users.add(socket);
    this.addHandler(socket);
    console.log(`[GameManager] Added user. Total users: ${this.users.size}`);
  }

  removeUser(socket: WebSocket) {
    this.users.delete(socket);
    if (this.pendingUser === socket) {
      this.pendingUser = null;
      console.log("[GameManager] Removed pending user");
    }
    this.games.forEach((game, id) => {
      if (game.player1 === socket || game.player2 === socket) {
        const opponent = game.player1 === socket ? game.player2 : game.player1;
        if (opponent && opponent.readyState === WebSocket.OPEN) {
          opponent.send(JSON.stringify({
            type: GAME_OVER,
            payload: {
              winner: opponent === game.player1 ? "white" : "black",
              gameId: game.id,
              reason: "Opponent disconnected"
            }
          }));
        }
        game.cleanup();
        this.games.delete(id);
        console.log(`[GameManager] Removed game ${id} due to player disconnection`);
      } else {
        game.removeSpectator(socket);
      }
    });
    console.log(`[GameManager] Removed user. Total users: ${this.users.size}`);
  }

  private addHandler(socket: WebSocket) {
    socket.on("message", (data) => {
      try {
        const messageStr = data.toString();
        console.log(`[GameManager] Received message:`, messageStr);
        const message = JSON.parse(messageStr);
        console.log(`[GameManager] Parsed message:`, message);

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
          default:
            console.warn(`[GameManager] Unknown message type: ${message.type}`);
        }
      } catch (error) {
        console.error(`[GameManager] Error handling message:`, error);
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
        console.log(`[GameManager] Created game ${game.id}. Total games: ${this.games.size}`);
        this.broadcastGameStates();
      } else {
        this.pendingUser = socket;
        console.log(`[GameManager] Added user to pending list`);
      }
    } catch (error) {
      console.error(`[GameManager] Error initializing game:`, error);
      this.sendError(socket, 'Failed to initialize game');
    }
  }

  private handleMove(socket: WebSocket, message: any) {
    try {
      const game = this.findGameByPlayer(socket);
      if (game) {
        console.log(`[GameManager] Processing move for game ${game.id}:`, message.payload);
        game.makeMove(socket, message.payload.move);
      } else {
        console.warn(`[GameManager] No game found for move`);
        this.sendError(socket, 'Game not found');
      }
    } catch (error) {
      console.error(`[GameManager] Error handling move:`, error);
      this.sendError(socket, 'Failed to make move');
    }
  }

  private handleFetchGames(socket: WebSocket) {
    try {
      console.log(`[GameManager] Processing FETCH_GAMES`);
      const gameStates = this.getGameStates();
      const response = {
        type: GAMES_LIST,
        payload: { games: gameStates }
      };
      console.log(`[GameManager] Sending GAMES_LIST with ${gameStates.length} games:`, JSON.stringify(gameStates));
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify(response));
        console.log(`[GameManager] Sent GAMES_LIST to client`);
      } else {
        console.warn(`[GameManager] Cannot send GAMES_LIST: socket not open`);
      }
    } catch (error) {
      console.error(`[GameManager] Error fetching games:`, error);
      this.sendError(socket, 'Failed to fetch games');
    }
  }

  private handleJoinSpectate(socket: WebSocket, message: any) {
    try {
      const game = this.games.get(message.payload.gameId);
      if (game) {
        console.log(`[GameManager] Spectator joining game ${message.payload.gameId}`);
        game.addSpectator(socket);
      } else {
        console.warn(`[GameManager] Game not found: ${message.payload.gameId}`);
        this.sendError(socket, 'Game not found');
      }
    } catch (error) {
      console.error(`[GameManager] Error joining spectate:`, error);
      this.sendError(socket, 'Failed to join game as spectator');
    }
  }

  private findGameByPlayer(socket: WebSocket): Game | undefined {
    return Array.from(this.games.values()).find(game => 
      game.player1 === socket || game.player2 === socket
    );
  }

  private sendError(socket: WebSocket, message: string) {
    try {
      socket.send(JSON.stringify({
        type: 'error',
        payload: { message }
      }));
      console.log(`[GameManager] Sent error: ${message}`);
    } catch (error) {
      console.error(`[GameManager] Error sending error message:`, error);
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
    const message = {
      type: GAME_STATES_UPDATE,
      payload: { games: gameStates }
    };
    console.log(`[GameManager] Broadcasting GAME_STATES_UPDATE with ${gameStates.length} games`);
    this.users.forEach(user => {
      if (user.readyState === WebSocket.OPEN) {
        user.send(JSON.stringify(message));
      }
    });
  }
}