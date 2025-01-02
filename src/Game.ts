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
  whiteTime: number;
  blackTime: number;
}

export class Game {
  public player1: WebSocket;
  public player2: WebSocket | null;
  public board: Chess;
  public id: string;
  private startTime: Date;
  private moveCount: number;
  private lastMove: Move | null;
  private spectators: Set<WebSocket>;
  private isGameOver: boolean;
  private whiteTime: number;
  private blackTime: number;
  private lastMoveTime: number;

  constructor(player1: WebSocket) {
    this.player1 = player1;
    this.player2 = null;
    this.board = new Chess();
    this.startTime = new Date();
    this.moveCount = 0;
    this.lastMove = null;
    this.id = Math.random().toString(36).substring(7);
    this.spectators = new Set();
    this.isGameOver = false;
    this.whiteTime = 0;
    this.blackTime = 0;
    this.lastMoveTime = Date.now();

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

      this.broadcastGameState();
    } catch (error) {
      console.error('Error initializing game:', error);
    }
  }

  public addPlayer2(player2: WebSocket) {
    this.player2 = player2;
    this.sendToPlayer(player2, {
      type: INIT_GAME,
      payload: { 
        color: "black",
        gameId: this.id,
        fen: this.board.fen()
      }
    });
    this.broadcastGameState();
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

    const currentTime = Date.now();
    if (this.board.turn() === 'w') {
      this.whiteTime += currentTime - this.lastMoveTime;
    } else {
      this.blackTime += currentTime - this.lastMoveTime;
    }
    this.lastMoveTime = currentTime;

    const gameState = {
      type: GAME_UPDATE,
      payload: {
        fen: this.board.fen(),
        whiteTime: this.whiteTime,
        blackTime: this.blackTime,
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
    [this.player1, this.player2, ...this.spectators].filter(Boolean).forEach(client => {
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
      this.spectators.add(socket);
      this.sendToPlayer(socket, {
        type: GAME_STATE,
        payload: {
          fen: this.board.fen(),
          whiteTime: this.whiteTime,
          blackTime: this.blackTime,
          gameId: this.id,
          status: this.getStatus(),
          moveCount: this.moveCount,
          turn: this.board.turn()
        }
      });
    } catch (error) {
      console.error('Error adding spectator:', error);
    }
  }

  removeSpectator(socket: WebSocket) {
    this.spectators.delete(socket);
  }

  makeMove(socket: WebSocket, move: { from: string; to: string; promotion?: string }) {
    if (this.isGameOver) return;
    
    // Validate player turn
    if (this.board.turn() === 'w' && socket !== this.player1) return;
    if (this.board.turn() === 'b' && socket !== this.player2) return;

    try {
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

  cleanup() {
    this.isGameOver = true;
    this.spectators.clear();
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
      } : undefined,
      whiteTime: this.whiteTime,
      blackTime: this.blackTime
    };
  }
}