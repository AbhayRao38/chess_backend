import { WebSocket } from "ws";
import { Chess, Move } from "chess.js";
import { GAME_OVER, INIT_GAME, MOVE, GAME_UPDATE, PLAYER_JOINED, GAME_STATE } from "./messages";

export interface GameState {
  id: string;
  fen: string;
  turn: 'w' | 'b';
  status: string;
  lastMove?: {
    from: string;
    to: string;
    promotion?: string;
  };
}

export class Game {
  public player1: WebSocket;
  public player2: WebSocket;
  public board: Chess;
  public id: string;
  private startTime: Date;
  private moveCount: number;
  private lastMove: Move | null;
  private spectators: Set<WebSocket>;
  private isGameOver: boolean;
  private whiteTimeRemaining: number;
  private blackTimeRemaining: number;
  private lastUpdateTime: number;

  constructor(player1: WebSocket, player2: WebSocket) {
    this.player1 = player1;
    this.player2 = player2;
    this.board = new Chess();
    this.startTime = new Date();
    this.moveCount = 0;
    this.lastMove = null;
    this.id = Math.random().toString(36).substring(7);
    this.spectators = new Set();
    this.isGameOver = false;
    this.whiteTimeRemaining = 600;
    this.blackTimeRemaining = 600;
    this.lastUpdateTime = Date.now();
    console.log(`[Game ${this.id}] Created new game with players`);
    this.initializeGame();
    setInterval(() => {
      console.log(`[Game ${this.id}] Timer interval triggered`);
      this.broadcastGameState();
    }, 1000);
  }

  private initializeGame() {
    try {
      const initMessage1 = {
        type: INIT_GAME,
        payload: { 
          color: "white",
          gameId: this.id,
          fen: this.board.fen(),
          whiteTime: this.whiteTimeRemaining,
          blackTime: this.blackTimeRemaining
        }
      };
      const initMessage2 = {
        type: INIT_GAME,
        payload: { 
          color: "black",
          gameId: this.id,
          fen: this.board.fen(),
          whiteTime: this.whiteTimeRemaining,
          blackTime: this.blackTimeRemaining
        }
      };
      console.log(`[Game ${this.id}] Sending INIT_GAME to player1:`, JSON.stringify(initMessage1));
      console.log(`[Game ${this.id}] Sending INIT_GAME to player2:`, JSON.stringify(initMessage2));
      this.sendToPlayer(this.player1, initMessage1);
      this.sendToPlayer(this.player2, initMessage2);
      this.broadcastGameState();
    } catch (error) {
      console.error(`[Game ${this.id}] Error initializing game:`, error);
    }
  }

  private sendToPlayer(player: WebSocket, message: any) {
    try {
      if (player.readyState === WebSocket.OPEN) {
        player.send(JSON.stringify(message));
        console.log(`[Game ${this.id}] Sent ${message.type} to player`);
      } else {
        console.warn(`[Game ${this.id}] Player socket not open for ${message.type}`);
      }
    } catch (error) {
      console.error(`[Game ${this.id}] Error sending ${message.type}:`, error);
    }
  }

  private broadcastGameState() {
    if (this.isGameOver) {
      console.log(`[Game ${this.id}] Skipping GAME_UPDATE: game is over`);
      return;
    }
    const now = Date.now();
    const elapsed = (now - this.lastUpdateTime) / 1000;
    if (this.board.turn() === 'w') {
      this.whiteTimeRemaining = Math.max(0, this.whiteTimeRemaining - elapsed);
    } else {
      this.blackTimeRemaining = Math.max(0, this.blackTimeRemaining - elapsed);
    }
    this.lastUpdateTime = now;

    const gameState = {
      type: GAME_UPDATE,
      payload: {
        fen: this.board.fen(),
        whiteTime: this.whiteTimeRemaining,
        blackTime: this.blackTimeRemaining,
        lastMove: this.lastMove ? {
          from: this.lastMove.from,
          to: this.lastMove.to,
          promotion: this.lastMove.promotion
        } : null,
        gameId: this.id,
        status: this.getStatus(),
        moveCount: this.moveCount,
        turn: this.board.turn()
      }
    };
    console.log(`[Game ${this.id}] Broadcasting GAME_UPDATE:`, JSON.stringify(gameState));
    this.broadcastToAll(gameState);
  }

  private broadcastToAll(message: any) {
    const jsonMessage = JSON.stringify(message);
    const clients = [this.player1, this.player2, ...this.spectators];
    console.log(`[Game ${this.id}] Broadcasting ${message.type} to ${clients.length} clients`);
    clients.forEach(client => {
      try {
        if (client && client.readyState === WebSocket.OPEN) {
          client.send(jsonMessage);
        } else {
          console.warn(`[Game ${this.id}] Client not open for ${message.type}`);
        }
      } catch (error) {
        console.error(`[Game ${this.id}] Error broadcasting ${message.type}:`, error);
      }
    });
  }

  addSpectator(socket: WebSocket) {
    try {
      this.spectators.add(socket);
      const gameStateMessage = {
        type: GAME_STATE,
        payload: {
          fen: this.board.fen(),
          whiteTime: this.whiteTimeRemaining,
          blackTime: this.blackTimeRemaining,
          gameId: this.id,
          status: this.getStatus(),
          moveCount: this.moveCount,
          turn: this.board.turn()
        }
      };
      console.log(`[Game ${this.id}] Sending GAME_STATE to spectator:`, JSON.stringify(gameStateMessage));
      this.sendToPlayer(socket, gameStateMessage);
      this.broadcastGameState();
    } catch (error) {
      console.error(`[Game ${this.id}] Error adding spectator:`, error);
    }
  }

  removeSpectator(socket: WebSocket) {
    this.spectators.delete(socket);
    console.log(`[Game ${this.id}] Spectator removed`);
  }

  makeMove(socket: WebSocket, move: { from: string; to: string; promotion?: string }) {
    if (this.isGameOver) {
      console.log(`[Game ${this.id}] Move rejected: game is over`);
      return;
    }
    if (this.moveCount % 2 === 0 && socket !== this.player1) {
      console.log(`[Game ${this.id}] Move rejected: not white's turn or wrong player`);
      return;
    }
    if (this.moveCount % 2 === 1 && socket !== this.player2) {
      console.log(`[Game ${this.id}] Move rejected: not black's turn or wrong player`);
      return;
    }

    try {
      console.log(`[Game ${this.id}] Processing move:`, move);
      const now = Date.now();
      const elapsed = (now - this.lastUpdateTime) / 1000;
      if (this.board.turn() === 'w') {
        this.whiteTimeRemaining = Math.max(0, this.whiteTimeRemaining - elapsed);
      } else {
        this.blackTimeRemaining = Math.max(0, this.blackTimeRemaining - elapsed);
      }
      this.lastUpdateTime = now;

      this.lastMove = this.board.move(move);
      if (!this.lastMove) {
        throw new Error('Invalid move');
      }

      if (this.board.isGameOver()) {
        this.isGameOver = true;
        const gameOverMessage = {
          type: GAME_OVER,
          payload: {
            winner: this.board.turn() === "w" ? "black" : "white",
            gameId: this.id,
            reason: this.getGameOverReason()
          }
        };
        console.log(`[Game ${this.id}] Broadcasting GAME_OVER:`, JSON.stringify(gameOverMessage));
        this.broadcastToAll(gameOverMessage);
        return;
      }

      const moveMessage = {
        type: MOVE,
        payload: {
          move: {
            from: this.lastMove.from,
            to: this.lastMove.to,
            promotion: this.lastMove.promotion
          },
          gameId: this.id,
          fen: this.board.fen(),
          moveCount: this.moveCount
        }
      };
      console.log(`[Game ${this.id}] Broadcasting MOVE:`, JSON.stringify(moveMessage));
      this.broadcastToAll(moveMessage);

      this.moveCount++;
      this.broadcastGameState();
    } catch (error) {
      console.error(`[Game ${this.id}] Error making move:`, error);
      this.sendToPlayer(socket, {
        type: 'error',
        payload: { message: 'Invalid move' }
      });
    }
  }

  private getGameOverReason(): string {
    if (this.board.isCheckmate()) return "Checkmate";
    if (this.board.isStalemate()) return "Stalemate";
    if (this.board.isThreefoldRepetition()) return "Threefold Repetition";
    if (this.board.isInsufficientMaterial()) return "Insufficient Material";
    if (this.board.isDraw()) return "Draw";
    return "Game Over";
  }

  getStatus(): string {
    if (this.board.isCheckmate()) return "Checkmate";
    if (this.board.isDraw()) return "Draw";
    if (this.board.isCheck()) return "Check";
    return "In Progress";
  }

  getWhiteTime(): number {
    return this.whiteTimeRemaining;
  }

  getBlackTime(): number {
    return this.blackTimeRemaining;
  }

  getLastMove(): Move | null {
    return this.lastMove;
  }

  cleanup() {
    this.isGameOver = true;
    this.spectators.clear();
    console.log(`[Game ${this.id}] Cleaned up`);
  }

  getGameState(): GameState {
    return {
      id: this.id,
      fen: this.board.fen(),
      turn: this.board.turn(),
      status: this.getStatus(),
      lastMove: this.lastMove ? {
        from: this.lastMove.from,
        to: this.lastMove.to,
        promotion: this.lastMove.promotion
      } : undefined
    };
  }
}