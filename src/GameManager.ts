import { WebSocket } from "ws";
import { INIT_GAME, MOVE, FETCH_GAMES, GAMES_LIST, JOIN_SPECTATE, GAME_STATE, GAME_UPDATE } from "./messages";
import { Game } from "./Game";

export class GameManager {
  private games: Game[];
  private pendingUser: WebSocket | null;
  private users: WebSocket[];
  private spectators: Map<string, Set<WebSocket>>;

  constructor() {
    this.games = [];
    this.pendingUser = null;
    this.users = [];
    this.spectators = new Map();
  }

  addUser(socket: WebSocket) {
    this.users.push(socket);
    this.addHandler(socket);
  }

  removeUser(socket: WebSocket) {
    this.users = this.users.filter(user => user !== socket);
    // Remove from spectators if present
    this.spectators.forEach((spectators, gameId) => {
      spectators.delete(socket);
      if (spectators.size === 0) {
        this.spectators.delete(gameId);
      }
    });
  }

  private broadcastGameState(game: Game) {
    const spectators = this.spectators.get(game.id);
    if (!spectators) return;

    const gameState = {
      type: GAME_UPDATE,
      payload: {
        fen: game.board.fen(),
        whiteTime: game.getWhiteTime(),
        blackTime: game.getBlackTime(),
        move: game.getLastMove()
      }
    };

    spectators.forEach(spectator => {
      spectator.send(JSON.stringify(gameState));
    });
  }

  private addHandler(socket: WebSocket) {
    socket.on("message", (data) => {
      const message = JSON.parse(data.toString());

      switch (message.type) {
        case INIT_GAME:
          if (this.pendingUser) {
            const game = new Game(this.pendingUser, socket);
            this.games.push(game);
            this.pendingUser = null;
          } else {
            this.pendingUser = socket;
          }
          break;

        case MOVE:
          const game = this.games.find(game => 
            game.player1 === socket || game.player2 === socket
          );
          if (game) {
            game.makeMove(socket, message.payload.move);
            this.broadcastGameState(game);
          }
          break;

        case FETCH_GAMES:
          const activeGames = this.games.map(game => ({
            id: game.id,
            player1: "Player 1",
            player2: "Player 2",
            status: game.getStatus()
          }));
          socket.send(JSON.stringify({
            type: GAMES_LIST,
            payload: { games: activeGames }
          }));
          break;

        case JOIN_SPECTATE:
          const targetGame = this.games.find(g => g.id === message.payload.gameId);
          if (targetGame) {
            if (!this.spectators.has(targetGame.id)) {
              this.spectators.set(targetGame.id, new Set());
            }
            this.spectators.get(targetGame.id)!.add(socket);
            
            socket.send(JSON.stringify({
              type: GAME_STATE,
              payload: {
                fen: targetGame.board.fen(),
                whiteTime: targetGame.getWhiteTime(),
                blackTime: targetGame.getBlackTime()
              }
            }));
          }
          break;
      }
    });
  }
}