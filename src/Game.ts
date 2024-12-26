import { WebSocket } from "ws";
import { Chess, Move } from "chess.js";
import { GAME_OVER, INIT_GAME, MOVE, GAME_UPDATE, PLAYER_JOINED, GAME_STATE } from "./messages";

export class Game {
  public player1: WebSocket;
  public player2: WebSocket;
  public board: Chess;
  public id: string;
  private startTime: Date;
  private moveCount: number;
  private lastMove: Move | null;
  private spectators: Set<WebSocket>;
  private gameStarted: boolean = false;
  private timeControl: number = 600; // 10 minutes per player in seconds
  private whiteTimeRemaining: number;
  private blackTimeRemaining: number;
  private timers: { white?: NodeJS.Timeout; black?: NodeJS.Timeout } = {};
  private gameOver: boolean = false;

  constructor(player1: WebSocket, player2: WebSocket) {
    this.player1 = player1;
    this.player2 = player2;
    this.board = new Chess();
    this.startTime = new Date();
    this.moveCount = 0;
    this.lastMove = null;
    this.id = Math.random().toString(36).substring(7);
    this.spectators = new Set();
    this.whiteTimeRemaining = this.timeControl;
    this.blackTimeRemaining = this.timeControl;
    this.initializeGame();
  }

  private initializeGame() {
    this.gameStarted = true;
    this.startTimer('white');

    this.player1.send(JSON.stringify({
      type: INIT_GAME,
      payload: { 
        color: "white",
        gameId: this.id,
        timeControl: this.timeControl
      }
    }));
    
    this.player2.send(JSON.stringify({
      type: INIT_GAME,
      payload: { 
        color: "black",
        gameId: this.id,
        timeControl: this.timeControl
      }
    }));

    this.broadcastGameState();
  }

  private startTimer(color: 'white' | 'black') {
    if (this.timers[color]) {
      clearInterval(this.timers[color]);
    }

    this.timers[color] = setInterval(() => {
      if (this.gameOver) return;

      if (color === 'white') {
        this.whiteTimeRemaining--;
        if (this.whiteTimeRemaining <= 0) {
          this.handleTimeout('white');
        }
      } else {
        this.blackTimeRemaining--;
        if (this.blackTimeRemaining <= 0) {
          this.handleTimeout('black');
        }
      }
      this.broadcastGameState();
    }, 1000);
  }

  private stopTimer(color: 'white' | 'black') {
    if (this.timers[color]) {
      clearInterval(this.timers[color]);
      delete this.timers[color];
    }
  }

  private handleTimeout(color: 'white' | 'black') {
    this.gameOver = true;
    this.stopTimer('white');
    this.stopTimer('black');
    
    const gameOverMessage = JSON.stringify({
      type: GAME_OVER,
      payload: {
        winner: color === 'white' ? 'black' : 'white',
        reason: 'timeout',
        gameId: this.id
      }
    });
    
    this.broadcast(gameOverMessage);
  }

  private broadcast(message: string) {
    [...this.spectators, this.player1, this.player2].forEach(client => {
      if (client && client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  }

  makeMove(socket: WebSocket, move: { from: string; to: string; }) {
    if (!this.gameStarted || this.gameOver) return;
    if (this.moveCount % 2 === 0 && socket !== this.player1) return;
    if (this.moveCount % 2 === 1 && socket !== this.player2) return;

    try {
      this.lastMove = this.board.move(move);
      
      const currentColor = this.moveCount % 2 === 0 ? 'white' : 'black';
      const nextColor = currentColor === 'white' ? 'black' : 'white';
      this.stopTimer(currentColor);
      this.startTimer(nextColor);
      
    } catch(e) {
      console.error('Invalid move:', e);
      return;
    }
    
    if (this.board.isGameOver()) {
      this.handleGameOver();
      return;
    }

    const moveMessage = JSON.stringify({
      type: MOVE,
      payload: {
        move,
        gameId: this.id
      }
    });

    this.broadcast(moveMessage);
    this.moveCount++;
    this.broadcastGameState();
  }

  private handleGameOver() {
    this.gameOver = true;
    this.stopTimer('white');
    this.stopTimer('black');
    
    const gameOverMessage = JSON.stringify({
      type: GAME_OVER,
      payload: {
        winner: this.board.turn() === "w" ? "black" : "white",
        reason: this.getGameOverReason(),
        gameId: this.id
      }
    });
    
    this.broadcast(gameOverMessage);
  }

  private getGameOverReason(): string {
    if (this.board.isCheckmate()) return "checkmate";
    if (this.board.isStalemate()) return "stalemate";
    if (this.board.isThreefoldRepetition()) return "threefold repetition";
    if (this.board.isInsufficientMaterial()) return "insufficient material";
    if (this.board.isDraw()) return "draw";
    return "unknown";
  }

  private broadcastGameState() {
    const gameState = {
      type: GAME_UPDATE,
      payload: {
        fen: this.board.fen(),
        whiteTime: this.whiteTimeRemaining,
        blackTime: this.blackTimeRemaining,
        lastMove: this.lastMove,
        gameId: this.id,
        status: this.getStatus(),
        moveCount: this.moveCount
      }
    };

    this.broadcast(JSON.stringify(gameState));
  }

  getStatus(): string {
    if (this.gameOver) return this.getGameOverReason();
    if (this.board.isCheck()) return "Check";
    return "In Progress";
  }

  addSpectator(socket: WebSocket) {
    this.spectators.add(socket);
    socket.send(JSON.stringify({
      type: GAME_STATE,
      payload: {
        fen: this.board.fen(),
        whiteTime: this.whiteTimeRemaining,
        blackTime: this.blackTimeRemaining,
        gameId: this.id,
        status: this.getStatus(),
        moveCount: this.moveCount,
        lastMove: this.lastMove
      }
    }));
  }

  removeSpectator(socket: WebSocket) {
    this.spectators.delete(socket);
  }

  getSpectators(): WebSocket[] {
    return Array.from(this.spectators);
  }

  getSpectatorsCount(): number {
    return this.spectators.size;
  }

  cleanup() {
    this.gameOver = true;
    this.stopTimer('white');
    this.stopTimer('black');
    this.spectators.clear();
  }
}