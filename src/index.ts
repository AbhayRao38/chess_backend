import { WebSocketServer } from 'ws';
import { GameManager } from './GameManager';

// Convert the port to a number
const port = process.env.PORT ? Number(process.env.PORT) : 8080;

const wss = new WebSocketServer({ port });

const gameManager = new GameManager();

wss.on('connection', function connection(ws) {
  gameManager.addUser(ws);
  ws.on("disconnect", () => gameManager.removeUser(ws));
});
