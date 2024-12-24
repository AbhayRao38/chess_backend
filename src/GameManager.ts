import { WebSocket } from "ws";
import { INIT_GAME, MOVE, FETCH_GAMES, GAMES_LIST, JOIN_SPECTATE } from "./messages";
import { Game } from "./Game";

export class GameManager {
  private games: Game[];
  private pendingUser: WebSocket | null;
  private users: WebSocket[];

  constructor() {
    this.games = [];
    this.pendingUser = null;
    this.users = [];
  }

  addUser(socket: WebSocket) {
    this.users.push(socket);
    this.addHandler(socket);
  }

  removeUser(socket: WebSocket) {
    this.users = this.users.filter(user => user !== socket);
    // Remove user from any games they're spectating
    this.games.forEach(game => game.removeSpectator(socket));
  }

  private addHandler(socket: WebSocket) {
    socket.on("message", (data) => {
      try {
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
            }
            break;

          case FETCH_GAMES:
            const activeGames = this.games.map((game, index) => ({
              id: game.id,
              player1: `Player ${index * 2 + 1}`,
              player2: `Player ${index * 2 + 2}`,
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
              targetGame.addSpectator(socket);
            }
            break;
        }
      } catch (error) {
        console.error('Error handling message:', error);
      }
    });
  }
}