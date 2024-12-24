import { WebSocket } from "ws";
import { Chess, Move } from "chess.js";
import { GAME_OVER, INIT_GAME, MOVE } from "./messages";

export class Game {
  public player1: WebSocket;
  public player2: WebSocket;
  public board: Chess;
  public id: string;
  private startTime: Date;
  private moveCount: number;
  private lastMove: Move | null;

  constructor(player1: WebSocket, player2: WebSocket) {
    this.player1 = player1;
    this.player2 = player2;
    this.board = new Chess();
    this.startTime = new Date();
    this.moveCount = 0;
    this.lastMove = null;
    this.id = Math.random().toString(36).substring(7);

    this.player1.send(JSON.stringify({
      type: INIT_GAME,
      payload: { color: "white" }
    }));
    this.player2.send(JSON.stringify({
      type: INIT_GAME,
      payload: { color: "black" }
    }));
  }

  makeMove(socket: WebSocket, move: { from: string; to: string; }) {
    if (this.moveCount % 2 === 0 && socket !== this.player1) return;
    if (this.moveCount % 2 === 1 && socket !== this.player2) return;

    try {
      this.lastMove = this.board.move(move);
    } catch(e) {
      console.log(e);
      return;
    }
    
    if (this.board.isGameOver()) {
      const gameOverMessage = JSON.stringify({
        type: GAME_OVER,
        payload: {
          winner: this.board.turn() === "w" ? "black" : "white"
        }
      });
      this.player1.send(gameOverMessage);
      this.player2.send(gameOverMessage);
      return;
    }

    const moveMessage = JSON.stringify({
      type: MOVE,
      payload: move
    });

    if (this.moveCount % 2 === 0) {
      this.player2.send(moveMessage);
    } else {
      this.player1.send(moveMessage);
    }
    this.moveCount++;
  }

  getStatus(): string {
    if (this.board.isCheckmate()) return "Checkmate";
    if (this.board.isDraw()) return "Draw";
    if (this.board.isCheck()) return "Check";
    return "In Progress";
  }

  getWhiteTime(): number {
    return Math.floor((Date.now() - this.startTime.getTime()) / 1000);
  }

  getBlackTime(): number {
    return Math.floor((Date.now() - this.startTime.getTime()) / 1000);
  }

  getLastMove(): Move | null {
    return this.lastMove;
  }
}