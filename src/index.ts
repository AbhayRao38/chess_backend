import { WebSocketServer, WebSocket } from 'ws';
import { GameManager } from './GameManager';

const port = process.env.PORT ? Number(process.env.PORT) : 8080;

console.log("[Server] Starting WebSocket server, version 2025-04-23");

const wss = new WebSocketServer({
  port,
  verifyClient: (info, done) => {
    try {
      console.log('[Server] Verifying client:', info.origin);
      done(true);
    } catch (error) {
      console.error('[Server] Error verifying client:', error);
      done(false, 500, 'Internal Server Error');
    }
  }
});

const gameManager = new GameManager();

wss.on('connection', function connection(ws: WebSocket) {
  try {
    console.log('[Server] New WebSocket connection established');
    gameManager.addUser(ws);

    ws.on('message', (data) => {
      console.log('[Server] Received message:', data.toString());
    });

    ws.on('error', (error) => {
      console.error('[Server] WebSocket error:', error);
    });

    ws.on('close', () => {
      try {
        console.log('[Server] WebSocket connection closed');
        gameManager.removeUser(ws);
      } catch (error) {
        console.error('[Server] Error removing user:', error);
      }
    });
  } catch (error) {
    console.error('[Server] Error handling connection:', error);
  }
});

const interval = setInterval(() => {
  wss.clients.forEach((ws: WebSocket) => {
    if (ws.readyState === WebSocket.OPEN) {
      console.log('[Server] Sending ping to client');
      ws.ping();
    }
  });
}, 30000);

wss.on('error', (error) => {
  console.error('[Server] WebSocket server error:', error);
});

process.on('SIGTERM', () => {
  console.log('[Server] SIGTERM received. Closing WebSocket server...');
  clearInterval(interval);
  wss.close(() => {
    console.log('[Server] WebSocket server closed');
    process.exit(0);
  });
});

console.log(`[Server] WebSocket server running on port ${port}`);