import { WebSocketServer } from 'ws';
import { GameManager } from './GameManager';

const port = process.env.PORT ? Number(process.env.PORT) : 8080;

const wss = new WebSocketServer({
  port,
  verifyClient: (info, done) => {
    const origin = info.origin || '';
    if (origin !== 'https://your-frontend-domain.com') {
      done(false, 403, 'Forbidden');
    } else {
      done(true);
    }
  }
});

const gameManager = new GameManager();

wss.on('connection', function connection(ws) {
  gameManager.addUser(ws);

  ws.on('close', () => gameManager.removeUser(ws));
});

console.log(`WebSocket server running on port ${port}`);