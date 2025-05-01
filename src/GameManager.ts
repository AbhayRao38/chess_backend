import { WebSocket } from 'ws';
import { Game } from './Game';
import { INIT_GAME, MOVE, FETCH_GAMES, GAMES_LIST, Message } from './messages';

export class GameManager {
  private games: Map<string, Game>;
  private pendingGame: Game | null;
  private sockets: Map<string, WebSocket[]>;

  constructor() {
    this.games = new Map();
    this.pendingGame = null;
    this.sockets = new Map();
  }

  addSocket(socket: WebSocket, clientId: string) {
    console.log(`[GameManager] Adding socket for client: ${clientId}`);
    const clientSockets = this.sockets.get(clientId) || [];
    clientSockets.push(socket);
    this.sockets.set(clientId, clientSockets);
    socket.on('message', (data) => this.handleMessage(socket, clientId, data));
    socket.on('close', () => this.removeSocket(socket, clientId));
  }

  private removeSocket(socket: WebSocket, clientId: string) {
    console.log(`[GameManager] Removing socket for client: ${clientId}`);
    const clientSockets = this.sockets.get(clientId)?.filter(s => s !== socket) || [];
    if (clientSockets.length === 0) {
      this.sockets.delete(clientId);
    } else {
      this.sockets.set(clientId, clientSockets);
    }
  }

  private handleMessage(socket: WebSocket, clientId: string, data: any) {
    try {
      const message: Message = JSON.parse(data.toString());
      console.log(`[GameManager] Received message from ${clientId}:`, message);

      switch (message.type) {
        case INIT_GAME:
          this.handleInitGame(socket, clientId);
          break;
        case MOVE:
          if (!message.payload?.move || !message.payload.move.from || !message.payload.move.to) {
            console.error(`[GameManager] Invalid move payload from ${clientId}:`, message.payload);
            socket.send(JSON.stringify({ type: 'error', payload: { message: 'Invalid move payload' } }));
            return;
          }
          this.handleMove(clientId, message.payload.move);
          break;
        case FETCH_GAMES:
          this.handleFetchGames(socket);
          break;
        default:
          console.warn(`[GameManager] Unknown message type from ${clientId}:`, message.type);
      }
    } catch (error) {
      console.error(`[GameManager] Error processing message from ${clientId}:`, error);
      socket.send(JSON.stringify({ type: 'error', payload: { message: 'Invalid message format' } }));
    }
  }

  private handleInitGame(socket: WebSocket, clientId: string) {
    console.log(`[GameManager] Handling INIT_GAME for client: ${clientId}`);
    if (this.pendingGame) {
      const game = this.pendingGame;
      game.addPlayer(socket, clientId, 'black');
      this.games.set(game.id, game);
      this.pendingGame = null;
      console.log(`[GameManager] Game started: ${game.id}`);
    } else {
      const game = new Game(socket, clientId, 'white');
      this.pendingGame = game;
      console.log(`[GameManager] Created pending game for client: ${clientId}`);
    }
  }

  private handleMove(clientId: string, move: { from: string; to: string; promotion?: string }) {
    console.log(`[GameManager] Processing move for client ${clientId}:`, move);
    const game = Array.from(this.games.values()).find(g => g.hasPlayer(clientId));
    if (game) {
      game.handleMove(clientId, move);
    } else {
      console.error(`[GameManager] No game found for client: ${clientId}`);
    }
  }

  private handleFetchGames(socket: WebSocket) {
    console.log(`[GameManager] Processing FETCH_GAMES`);
    const gamesList = Array.from(this.games.values()).map(game => ({
      id: game.id,
      fen: game.getFen(),
      turn: game.getTurn(),
      status: game.getStatus(),
      lastMove: game.getLastMove()
    }));
    const message = {
      type: GAMES_LIST,
      payload: { games: gamesList }
    };
    console.log(`[GameManager] Sending GAMES_LIST with ${gamesList.length} games:`, gamesList);
    socket.send(JSON.stringify(message));
  }

  broadcastToSpectators(gameId: string, message: Message) {
    console.log(`[GameManager] Broadcasting to spectators for game ${gameId}:`, message);
    this.sockets.forEach((sockets, clientId) => {
      const game = this.games.get(gameId);
      if (!game?.hasPlayer(clientId)) {
        sockets.forEach(socket => socket.send(JSON.stringify(message)));
      }
    });
  }
}