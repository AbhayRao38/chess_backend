import { WebSocket } from 'ws';
import { Chess } from 'chess.js';
import { v4 as uuidv4 } from 'uuid';
import { INIT_GAME, MOVE, GAME_OVER, GAME_UPDATE } from './messages';

export class Game {
  public id: string;
  private chess: Chess;
  private whitePlayer: { socket: WebSocket; clientId: string } | null;
  private blackPlayer: { socket: WebSocket; clientId: string } | null;
  private whiteTime: number;
  private blackTime: number;
  private lastMoveTime: number;
  private interval: NodeJS.Timeout | null;

  constructor(socket: WebSocket, clientId: string, color: 'white') {
    this.id = uuidv4();
    this.chess = new Chess();
    this.whitePlayer = { socket, clientId };
    this.blackPlayer = null;
    this.whiteTime = 600;
    this.blackTime = 600;
    this.lastMoveTime = Date.now();
    this.interval = null;
    console.log(`[Game ${this.id}] Created for client ${clientId} as white`);
  }

  addPlayer(socket: WebSocket, clientId: string, color: 'black') {
    this.blackPlayer = { socket, clientId };
    console.log(`[Game ${this.id}] Added client ${clientId} as black`);
    this.startGame();
  }

  private startGame() {
    console.log(`[Game ${this.id}] Starting game`);
    this.interval = setInterval(() => this.updateTimers(), 1000);
    this.broadcast({
      type: INIT_GAME,
      payload: {
        gameId: this.id,
        color: 'white',
        whiteTime: Math.floor(this.whiteTime),
        blackTime: Math.floor(this.blackTime)
      }
    }, this.whitePlayer!.socket);
    this.broadcast({
      type: INIT_GAME,
      payload: {
        gameId: this.id,
        color: 'black',
        whiteTime: Math.floor(this.whiteTime),
        blackTime: Math.floor(this.blackTime)
      }
    }, this.blackPlayer!.socket);
  }

  private updateTimers() {
    const now = Date.now();
    const elapsed = Math.floor((now - this.lastMoveTime) / 1000);
    this.lastMoveTime = now;

    if (this.chess.turn() === 'w') {
      this.whiteTime = Math.max(0, Math.floor(this.whiteTime - elapsed));
    } else {
      this.blackTime = Math.max(0, Math.floor(this.blackTime - elapsed));
    }

    console.log(`[Game ${this.id}] Timer update: whiteTime=${this.whiteTime}, blackTime=${this.blackTime}, turn=${this.chess.turn()}`);

    if (this.whiteTime <= 0) {
      this.endGame('black', 'timeout');
    } else if (this.blackTime <= 0) {
      this.endGame('white', 'timeout');
    } else {
      this.broadcastGameState();
    }
  }

  handleMove(clientId: string, move: { from: string; to: string; promotion?: string }) {
    console.log(`[Game ${this.id}] Handling move from client ${clientId}:`, move);
    const player = this.whitePlayer?.clientId === clientId ? this.whitePlayer : this.blackPlayer;
    if (!player || this.chess.turn() !== (clientId === this.whitePlayer?.clientId ? 'w' : 'b')) {
      console.error(`[Game ${this.id}] Invalid move attempt by client ${clientId}: not their turn`);
      player?.socket.send(JSON.stringify({ type: 'error', payload: { message: 'Not your turn' } }));
      return;
    }

    try {
      const result = this.chess.move(move);
      if (result) {
        console.log(`[Game ${this.id}] Move applied:`, result);
        this.lastMoveTime = Date.now();
        this.broadcast({
          type: MOVE,
          payload: { move: { from: move.from, to: move.to, promotion: move.promotion } }
        });
        this.broadcastGameState();

        if (this.chess.isGameOver()) {
          const reason = this.chess.isCheckmate() ? 'checkmate' : this.chess.isStalemate() ? 'stalemate' : 'draw';
          const winner = this.chess.isCheckmate() ? (this.chess.turn() === 'w' ? 'black' : 'white') : 'none';
          this.endGame(winner, reason);
        }
      } else {
        console.error(`[Game ${this.id}] Invalid move by client ${clientId}:`, move);
        player.socket.send(JSON.stringify({ type: 'error', payload: { message: 'Invalid move' } }));
      }
    } catch (error) {
      console.error(`[Game ${this.id}] Error applying move by client ${clientId}:`, error);
      player.socket.send(JSON.stringify({ type: 'error', payload: { message: 'Move error' } }));
    }
  }

  private broadcastGameState() {
    const message = {
      type: GAME_UPDATE,
      payload: {
        fen: this.chess.fen(),
        whiteTime: Math.floor(this.whiteTime),
        blackTime: Math.floor(this.blackTime),
        turn: this.chess.turn()
      }
    };
    console.log(`[Game ${this.id}] Broadcasting GAME_UPDATE:`, message);
    this.broadcast(message);
  }

  private endGame(winner: string, reason: string) {
    console.log(`[Game ${this.id}] Game over: winner=${winner}, reason=${reason}`);
    this.broadcast({
      type: GAME_OVER,
      payload: { winner, reason }
    });
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  private broadcast(message: any, specificSocket?: WebSocket) {
    if (specificSocket) {
      specificSocket.send(JSON.stringify(message));
    } else {
      this.whitePlayer?.socket.send(JSON.stringify(message));
      this.blackPlayer?.socket.send(JSON.stringify(message));
    }
  }

  getFen() {
    return this.chess.fen();
  }

  getTurn() {
    return this.chess.turn();
  }

  getStatus() {
    if (this.chess.isCheckmate()) return 'Checkmate';
    if (this.chess.isStalemate()) return 'Stalemate';
    if (this.chess.isCheck()) return 'Check';
    return 'In Progress';
  }

  getLastMove() {
    const history = this.chess.history({ verbose: true });
    const lastMove = history[history.length - 1];
    return lastMove ? { from: lastMove.from, to: lastMove.to } : undefined;
  }

  hasPlayer(clientId: string) {
    return this.whitePlayer?.clientId === clientId || this.blackPlayer?.clientId === clientId;
  }
}