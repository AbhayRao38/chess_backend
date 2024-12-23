import { WebSocket } from "ws";
import { INIT_GAME, MOVE, SPECTATE } from "./messages";
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
        // Remove games where this user was a player
        this.games = this.games.filter(game => 
            game.player1 !== socket && game.player2 !== socket
        );
    }

    private addHandler(socket: WebSocket) {
        socket.on("message", (data) => {
            try {
                const message = JSON.parse(data.toString());
                console.log('Received message:', message.type); // Debug log

                switch (message.type) {
                    case INIT_GAME:
                        if (this.pendingUser) {
                            const game = new Game(this.pendingUser, socket);
                            this.games.push(game);
                            console.log('New game created:', game.id); // Debug log
                            this.pendingUser = null;
                        } else {
                            this.pendingUser = socket;
                        }
                        break;

                    case "GET_ACTIVE_GAMES":
                        console.log('Active games:', this.games.length); // Debug log
                        const activeGames = this.games.map(game => ({
                            id: game.id,
                            white: "Player 1",
                            black: "Player 2"
                        }));
                        socket.send(JSON.stringify({
                            type: "ACTIVE_GAMES",
                            payload: { games: activeGames }
                        }));
                        break;

                    case MOVE:
                        const game = this.games.find(game => 
                            game.player1 === socket || game.player2 === socket
                        );
                        if (game) {
                            game.makeMove(socket, message.payload.move);
                            // Broadcast move to spectators
                            const spectators = this.spectators.get(game.id);
                            if (spectators) {
                                spectators.forEach(spectator => {
                                    spectator.send(JSON.stringify({
                                        type: MOVE,
                                        payload: message.payload.move
                                    }));
                                });
                            }
                        }
                        break;

                    case SPECTATE:
                        const gameId = message.payload.gameId;
                        const gameToSpectate = this.games.find(g => g.id === gameId);
                        if (gameToSpectate) {
                            if (!this.spectators.has(gameId)) {
                                this.spectators.set(gameId, new Set());
                            }
                            this.spectators.get(gameId)?.add(socket);
                            
                            socket.send(JSON.stringify({
                                type: INIT_GAME,
                                payload: { 
                                    board: gameToSpectate.board.board(),
                                    gameId: gameId
                                }
                            }));
                        }
                        break;
                }
            } catch (error) {
                console.error('Error handling message:', error);
            }
        });
    }
}