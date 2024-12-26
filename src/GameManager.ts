import { WebSocket } from "ws";
import { INIT_GAME, MOVE, FETCH_GAMES, GAMES_LIST, JOIN_SPECTATE } from "./messages";
import { Game } from "./Game";

export class GameManager {
  private games: Game[];
  private pendingUser: WebSocket | null;
  private users: Set<WebSocket>;

  constructor() {
    this.games = [];
    this.pendingUser = null;
    this.users = new Set();
  }

  addUser(socket: WebSocket) {
    this.users.add(socket);
    this.addHandler(socket);
    this.sendGamesList(socket);
  }

  removeUser(socket: WebSocket) {
    this.users.delete(socket);
    
    // Remove user from any games they're spectating
    this.games.forEach(game => game.removeSpectator(socket));
    
    // Handle player disconnection
    const gameIndex = this.games.findIndex(
      game => game.player1 === socket || game.player2 === socket
    );
    
    if (gameIndex !== -1) {
      const game = this.games[gameIndex];
      // Notify remaining players and spectators
      [game.player1, game.player2, ...game.getSpectators()].forEach(client => {
        if (client && client !== socket && client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({
            type: 'game_ended',
            payload: { reason: 'player_disconnected', gameId: game.id }
          }));
        }
      });
      this.games.splice(gameIndex, 1);
      this.broadcastGamesList();
    }

    // Reset pending user if they disconnect
    if (this.pendingUser === socket) {
      this.pendingUser = null;
    }
  }

  private sendGamesList(socket: WebSocket) {
    if (socket.readyState !== WebSocket.OPEN) return;

    const activeGames = this.games.map(game => ({
      id: game.id,
      player1: `Player ${game.id.substring(0, 4)}`,
      player2: `Player ${game.id.substring(4, 8)}`,
      status: game.getStatus(),
      spectators: game.getSpectatorsCount()
    }));
    
    socket.send(JSON.stringify({
      type: GAMES_LIST,
      payload: { games: activeGames }
    }));
  }

  private broadcastGamesList() {
    this.users.forEach(user => this.sendGamesList(user));
  }

  private addHandler(socket: WebSocket) {
    socket.on("message", (data) => {
      try {
        const message = JSON.parse(data.toString());

        switch (message.type) {
          case INIT_GAME:
            if (this.pendingUser && this.pendingUser !== socket) {
              const game = new Game(this.pendingUser, socket);
              this.games.push(game);
              this.pendingUser = null;
              this.broadcastGamesList();
            } else if (!this.pendingUser) {
              this.pendingUser = socket;
            }
            break;

          case MOVE:
            const game = this.games.find(game => 
              game.player1 === socket || game.player2 === socket
            );
            if (game) {
              game.makeMove(socket, message.payload.move);
              this.broadcastGamesList();
            }
            break;

          case FETCH_GAMES:
            this.sendGamesList(socket);
            break;

          case JOIN_SPECTATE:
            const targetGame = this.games.find(g => g.id === message.payload.gameId);
            if (targetGame) {
              targetGame.addSpectator(socket);
              this.broadcastGamesList();
            } else {
              socket.send(JSON.stringify({
                type: 'error',
                payload: { message: 'Game not found' }
              }));
            }
            break;
        }
      } catch (error) {
        console.error('Error handling message:', error);
        socket.send(JSON.stringify({
          type: 'error',
          payload: { message: 'Invalid message format' }
        }));
      }
    });
  }
}