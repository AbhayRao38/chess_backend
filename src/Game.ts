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
  private spectator: WebSocket | null;
  private isGameOver: boolean;
  private whiteTimeRemaining: number = 600; // 10 minutes in seconds
  private blackTimeRemaining: number = 600; // 10 minutes in seconds
  private lastUpdateTime: number;

  constructor(player1: WebSocket, player2: WebSocket) {
    this.player1 = player1;
    this.player2 = player2;
    this.board = new Chess();
    this.startTime = new Date();
    this.moveCount = 0;
    this.lastMove = null;
    this.id = Math.random().toString(36).substring(7);
    this.spectator = null;
    this.isGameOver = false;
    this.lastUpdateTime = Date.now();

    this.initializeGame();
  }

  private initializeGame() {
    try {
      this.sendToPlayer(this.player1, {
        type: INIT_GAME,
        payload: { 
          color: "white",
          gameId: this.id,
          fen: this.board.fen()
        }
      });

      this.sendToPlayer(this.player2, {
        type: INIT_GAME,
        payload: { 
          color: "black",
          gameId: this.id,
          fen: this.board.fen()
        }
      });

      this.broadcastGameState();
    } catch (error) {
      console.error('Error initializing game:', error);
    }
  }

  private sendToPlayer(player: WebSocket, message: any) {
    try {
      if (player.readyState === WebSocket.OPEN) {
        player.send(JSON.stringify(message));
      }
    } catch (error) {
      console.error('Error sending message to player:', error);
    }
  }

  private broadcastGameState() {
    if (this.isGameOver) return;

    const gameState = {
      type: GAME_UPDATE,
      payload: {
        fen: this.board.fen(),
        whiteTime: this.getWhiteTime(),
        blackTime: this.getBlackTime(),
        lastMove: this.lastMove,
        gameId: this.id,
        status: this.getStatus(),
        moveCount: this.moveCount,
        turn: this.board.turn()
      }
    };

    this.broadcastToAll(gameState);
  }

  private broadcastToAll(message: any) {
    const jsonMessage = JSON.stringify(message);
    [this.player1, this.player2, this.spectator].filter(Boolean).forEach(client => {
      try {
        if (client && client.readyState === WebSocket.OPEN) {
          client.send(jsonMessage);
        } else {
          console.warn('Client disconnected, unable to send message');
        }
      } catch (error) {
        console.error('Error broadcasting message:', error);
      }
    });
  }

  addSpectator(socket: WebSocket) {
    try {
      if (this.spectator) {
        // If there's already a spectator, remove them
        this.removeSpectator(this.spectator);
      }
      this.spectator = socket;
      this.sendToPlayer(socket, {
        type: GAME_STATE,
        payload: {
          fen: this.board.fen(),
          whiteTime: this.getWhiteTime(),
          blackTime: this.getBlackTime(),
          gameId: this.id,
          status: this.getStatus(),
          moveCount: this.moveCount,
          turn: this.board.turn()
        }
      });

      // Add spectator to broadcast list for future updates
      this.broadcastGameState();
    } catch (error) {
      console.error('Error adding spectator:', error);
    }
  }

  removeSpectator(socket: WebSocket) {
    if (this.spectator === socket) {
      this.spectator = null;
    }
  }

  makeMove(socket: WebSocket, move: { from: string; to: string; promotion?: string }) {
    if (this.isGameOver) return;

    // Validate player turn
    if (this.moveCount % 2 === 0 && socket !== this.player1) return;
    if (this.moveCount % 2 === 1 && socket !== this.player2) return;

    try {
      // Update timers before making the move
      const now = Date.now();
      const elapsed = (now - this.lastUpdateTime) / 1000;
      if (this.board.turn() === 'w') {
        this.whiteTimeRemaining -= elapsed;
      } else {
        this.blackTimeRemaining -= elapsed;
      }
      this.lastUpdateTime = now;

      // Validate and make the move
      this.lastMove = this.board.move(move);
      
      if (!this.lastMove) {
        throw new Error('Invalid move');
      }

      // Check for game end conditions
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
        this.broadcastToAll(gameOverMessage);
        return;
      }

      // Broadcast the move to all players and spectators
      const moveMessage = {
        type: MOVE,
        payload: {
          move: this.lastMove,
          gameId: this.id,
          fen: this.board.fen(),
          moveCount: this.moveCount
        }
      };
      this.broadcastToAll(moveMessage);

      this.moveCount++;
      this.broadcastGameState();
    } catch (error) {
      console.error('Error making move:', error);
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
    if (this.board.turn() === 'w') {
      const elapsed = (Date.now() - this.lastUpdateTime) / 1000;
      return Math.max(0, this.whiteTimeRemaining - elapsed);
    }
    return this.whiteTimeRemaining;
  }

  getBlackTime(): number {
    if (this.board.turn() === 'b') {
      const elapsed = (Date.now() - this.lastUpdateTime) / 1000;
      return Math.max(0, this.blackTimeRemaining - elapsed);
    }
    return this.blackTimeRemaining;
  }

  getLastMove(): Move | null {
    return this.lastMove;
  }

  cleanup() {
    this.isGameOver = true;
    this.spectator = null;
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