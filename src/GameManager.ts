import { WebSocket } from "ws";
import { INIT_GAME, MOVE, FETCH_GAMES, GAMES_LIST, JOIN_SPECTATE } from "./messages";
import { Game } from "./Game";

export class GameManager {
  private games: Map<string, Game>;
  private pendingUser: WebSocket | null;
  private users: Set<WebSocket>;

  constructor() {
    this.games = new Map();
    this.pendingUser = null;
    this.users = new Set();
    console.log("GameManager initialized");
  }

  addUser(socket: WebSocket) {
    this.users.add(socket);
    this.addHandler(socket);
    console.log(`User added. Total users: ${this.users.size}`);
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
      const activeGames = Array.from(this.games.values()).map((game, index) => ({
        id: game.id,
        player1: `Player ${index * 2 + 1}`,
        player2: `Player ${index * 2 + 2}`,
        status: game.getStatus()
      }));

      console.log(`Fetching games, total active games: ${this.games.size}`);
      console.log("Active games:", activeGames);

      const response = JSON.stringify({
        type: GAMES_LIST,
        payload: { games: activeGames }
      });
      
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(response);
        console.log("GAMES_LIST sent to client");
      } else {
        console.warn("Socket not open, cannot send GAMES_LIST");
      }
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
    try {
      socket.send(JSON.stringify({
        type: 'error',
        payload: { message }
      }));
    } catch (error) {
      console.error('Error sending error message:', error);
    }
  }

  public getActiveGamesCount(): number {
    return this.games.size;
  }

  // Add this method to the GameManager class
  public getGames(): Map<string, Game> {
    return this.games;
  }
}