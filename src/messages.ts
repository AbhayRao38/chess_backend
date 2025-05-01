export const INIT_GAME = 'init_game';
export const MOVE = 'move';
export const GAME_OVER = 'game_over';
export const FETCH_GAMES = 'fetch_games';
export const GAMES_LIST = 'games_list';
export const GAME_UPDATE = 'game_update';

export interface Message {
  type: string;
  payload?: any;
}

export interface InitGameMessage extends Message {
  type: typeof INIT_GAME;
  payload: {
    gameId: string;
    color: 'white' | 'black';
    whiteTime: number;
    blackTime: number;
  };
}

export interface MoveMessage extends Message {
  type: typeof MOVE;
  payload: {
    move: {
      from: string;
      to: string;
      promotion?: string;
    };
  };
}

export interface GameOverMessage extends Message {
  type: typeof GAME_OVER;
  payload: {
    winner: string;
    reason: string;
  };
}

export interface FetchGamesMessage extends Message {
  type: typeof FETCH_GAMES;
  payload?: {};
}

export interface GamesListMessage extends Message {
  type: typeof GAMES_LIST;
  payload: {
    games: {
      id: string;
      fen: string;
      turn: 'w' | 'b';
      status: string;
      lastMove?: { from: string; to: string };
    }[];
  };
}

export interface GameUpdateMessage extends Message {
  type: typeof GAME_UPDATE;
  payload: {
    fen: string;
    whiteTime: number;
    blackTime: number;
    turn: 'w' | 'b';
  };
}