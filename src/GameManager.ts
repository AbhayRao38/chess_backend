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
  }

  addUser(socket: WebSocket) {
    this.users.add(socket);
    this.addHandler(socket);
  }

  removeUser(socket: WebSocket) {
    this.users.delete(socket);
    
    // Remove user from pending if they were waiting
    if (this.pendingUser === socket) {
      this.pendingUser = null;
    }

    // Remove user from any games they're spectating or playing
    this.games.forEach((game, id) => {
      if (game.player1 === socket || game.player2 === socket) {
        game.cleanup();
        this.games.delete(id);
      } else {
        game.removeSpectator(socket);
      }
    });
  }

  private addHandler(socket: WebSocket) {
    socket.on("message", (data) => {
      try {
        const message = JSON.parse(data.toString());

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
      } else {
        this.pendingUser = socket;
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
      }
    } catch (error) {
      console.error('Error handling move:', error);
      this.sendError(socket, 'Failed to make move');
    }
  }

  private handleFetchGames(socket: WebSocket) {
    try {
      const activeGames = Array.from(this.games.values()).map((game, index) => ({
        id: game.id,
        player1: `Player ${index * 2 + 1}`,
        player2: `Player ${index * 2 + 2}`,
        status: game.getStatus()
      }));

      socket.send(JSON.stringify({
        type: GAMES_LIST,
        payload: { games: activeGames }
      }));
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
}