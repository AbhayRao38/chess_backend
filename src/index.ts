import { WebSocketServer } from 'ws';
import { GameManager } from './GameManager';

const port = process.env.PORT ? Number(process.env.PORT) : 8080;

const wss = new WebSocketServer({
  port,
  verifyClient: (info, done) => {
    const origin = info.origin || '';
    // Allow both HTTP and HTTPS origins
    if (!origin.includes('chess-frontend-4r5o.onrender.com')) {
      done(false, 403, 'Forbidden');
    } else {
      done(true);
    }
  }
});

const gameManager = new GameManager();

wss.on('connection', function connection(ws) {
  console.log('New client connected');
  
  gameManager.addUser(ws);

  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
  });

  ws.on('close', () => {
    console.log('Client disconnected');
    gameManager.removeUser(ws);
  });
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

process.on('SIGINT', () => {
  console.log('SIGINT received. Closing WebSocket server...');
  wss.close(() => {
    console.log('WebSocket server closed');
    process.exit(0);
  });
});