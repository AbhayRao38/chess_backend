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
    // Send initial games list to new user
    this.sendGamesList(socket);
  }

  removeUser(socket: WebSocket) {
    this.users = this.users.filter(user => user !== socket);
    // Remove user from any games they're spectating
    this.games.forEach(game => game.removeSpectator(socket));
    
    // Remove game if a player disconnects
    const gameIndex = this.games.findIndex(
      game => game.player1 === socket || game.player2 === socket
    );
    
    if (gameIndex !== -1) {
      const game = this.games[gameIndex];
      // Notify remaining players and spectators
      [game.player1, game.player2, ...game.getSpectators()].forEach(client => {
        if (client && client !== socket) {
          client.send(JSON.stringify({
            type: 'game_ended',
            payload: { reason: 'player_disconnected' }
          }));
        }
      });
      this.games.splice(gameIndex, 1);
      // Update all users with new games list
      this.broadcastGamesList();
    }
  }

  private sendGamesList(socket: WebSocket) {
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
            if (this.pendingUser) {
              const game = new Game(this.pendingUser, socket);
              this.games.push(game);
              this.pendingUser = null;
              // Broadcast updated games list to all users
              this.broadcastGamesList();
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
              // Update games list after move
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
              // Update games list to reflect new spectator
              this.broadcastGamesList();
            }
            break;
        }
      } catch (error) {
        console.error('Error handling message:', error);
      }
    });
  }
}