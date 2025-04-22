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
  private whiteTimeRemaining: number = 600;
  private blackTimeRemaining: number = 600;
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
    this.lastUpdateTime = Date.now();
    console.log(`New game created with ID: ${this.id}`);
    this.initializeGame();
    setInterval(() => {
      console.log(`Timer interval triggered for game ${this.id}`);
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
      console.log('Sending INIT_GAME to player1:', initMessage1);
      console.log('Sending INIT_GAME to player2:', initMessage2);
      this.sendToPlayer(this.player1, initMessage1);
      this.sendToPlayer(this.player2, initMessage2);
      this.broadcastGameState();
    } catch (error) {
      console.error('Error initializing game:', error);
    }
  }

  private sendToPlayer(player: WebSocket, message: any) {
    try {
      if (player.readyState === WebSocket.OPEN) {
        player.send(JSON.stringify(message));
      } else {
        console.warn('Player socket not open:', message.type);
      }
    } catch (error) {
      console.error('Error sending message to player:', error);
    }
  }

  private broadcastGameState() {
    if (this.isGameOver) return;
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
    console.log(`Broadcasting GAME_UPDATE for game ${this.id}:`, gameState);
    this.broadcastToAll(gameState);
  }

  private broadcastToAll(message: any) {
    const jsonMessage = JSON.stringify(message);
    const clients = [this.player1, this.player2, ...this.spectators];
    console.log(`Broadcasting to ${clients.length} clients for game ${this.id}:`, message.type);
    clients.forEach(client => {
      try {
        if (client && client.readyState === WebSocket.OPEN) {
          client.send(jsonMessage);
        } else {
          console.warn(`Client disconnected or not open for game ${this.id}:`, message.type);
        }
      } catch (error) {
        console.error(`Error broadcasting message for game ${this.id}:`, error);
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
      console.log(`Sending GAME_STATE to spectator for game ${this.id}:`, gameStateMessage);
      this.sendToPlayer(socket, gameStateMessage);
      this.broadcastGameState();
    } catch (error) {
      console.error('Error adding spectator:', error);
    }
  }

  removeSpectator(socket: WebSocket) {
    this.spectators.delete(socket);
    console.log(`Spectator removed from game ${this.id}`);
  }

  makeMove(socket: WebSocket, move: { from: string; to: string; promotion?: string }) {
    if (this.isGameOver) return;
    if (this.moveCount % 2 === 0 && socket !== this.player1) return;
    if (this.moveCount % 2 === 1 && socket !== this.player2) return;

    try {
      console.log(`Processing move for game ${this.id}:`, move);
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
        console.log(`Broadcasting GAME_OVER for game ${this.id}:`, gameOverMessage);
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
      console.log(`Broadcasting MOVE for game ${this.id}:`, moveMessage);
      this.broadcastToAll(moveMessage);

      this.moveCount++;
      this.broadcastGameState();
    } catch (error) {
      console.error(`Error making move for game ${this.id}:`, error);
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
    console.log(`Game ${this.id} cleaned up`);
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