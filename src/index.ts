import { WebSocketServer } from 'ws';
import { GameManager } from './GameManager';

// Convert the port to a number (use the environment variable for production)
const port = process.env.PORT ? Number(process.env.PORT) : 8080;

// Create WebSocket server
const wss = new WebSocketServer({
  port,
  verifyClient: (info, done) => {
    // Optionally check the origin of the connection
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
  // Add the user to the game manager
  gameManager.addUser(ws);

  // Clean up when the user disconnects
  ws.on('close', () => gameManager.removeUser(ws));
});

console.log(`WebSocket server running on port ${port}`);
