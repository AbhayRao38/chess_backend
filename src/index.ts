import { WebSocketServer, WebSocket } from 'ws';
import { GameManager } from './GameManager';

const port = process.env.PORT ? Number(process.env.PORT) : 8080;

const wss = new WebSocketServer({
  port,
  verifyClient: (info, done) => {
    try {
      const origin = info.origin || '';
      if (origin !== 'https://chess-frontend-4r5o.onrender.com') {
        done(false, 403, 'Forbidden');
      } else {
        done(true);
      }
    } catch (error) {
      console.error('Error in verifyClient:', error);
      done(false, 500, 'Internal Server Error');
    }
  }
});

const gameManager = new GameManager();

wss.on('connection', function connection(ws: WebSocket) {
  try {
    gameManager.addUser(ws);

    ws.on('error', (error) => {
      console.error('WebSocket error:', error);
    });

    ws.on('close', () => {
      try {
        gameManager.removeUser(ws);
      } catch (error) {
        console.error('Error removing user:', error);
      }
    });
  } catch (error) {
    console.error('Error handling connection:', error);
  }
});

wss.on('error', (error) => {
  console.error('WebSocket server error:', error);
});

console.log(`WebSocket server running on port ${port}`);

// Handle process termination
process.on('SIGTERM', () => {
  console.log('SIGTERM received. Closing WebSocket server...');
  wss.close(() => {
    console.log('WebSocket server closed');
    process.exit(0);
  });
});