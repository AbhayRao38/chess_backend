import { WebSocketServer, WebSocket } from 'ws';
import { GameManager } from './GameManager';

const port = process.env.PORT ? Number(process.env.PORT) : 8080;

const wss = new WebSocketServer({
  port,
  verifyClient: (info, done) => {
    try {
      console.log('Verifying client connection:', info.origin);
      done(true);
    } catch (error) {
      console.error('Error in verifyClient:', error);
      done(false, 500, 'Internal Server Error');
    }
  }
});

const gameManager = new GameManager();

wss.on('connection', function connection(ws: WebSocket) {
  try {
    console.log('New WebSocket connection established');
    gameManager.addUser(ws);

    ws.on('message', (data) => {
      console.log('Received message:', data.toString());
    });

    ws.on('error', (error) => {
      console.error('WebSocket error:', error);
    });

    ws.on('close', () => {
      try {
        console.log('WebSocket connection closed');
        gameManager.removeUser(ws);
      } catch (error) {
        console.error('Error removing user:', error);
      }
    });
  } catch (error) {
    console.error('Error handling connection:', error);
  }
});

const interval = setInterval(() => {
  wss.clients.forEach((ws: WebSocket) => {
    if (ws.readyState === WebSocket.OPEN) {
      console.log('Sending ping to client');
      ws.ping();
    }
  });
}, 30000);

wss.on('error', (error) => {
  console.error('WebSocket server error:', error);
});

process.on('SIGTERM', () => {
  console.log('SIGTERM received. Closing WebSocket server...');
  clearInterval(interval);
  wss.close(() => {
    console.log('WebSocket server closed');
    process.exit(0);
  });
});

console.log(`WebSocket server running on port ${port}`);