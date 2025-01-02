import { WebSocketServer, WebSocket } from 'ws';
import { GameManager } from './GameManager';

const port = process.env.PORT ? Number(process.env.PORT) : 8080;

const wss = new WebSocketServer({
  port,
  verifyClient: (info, done) => {
    try {
      // Accept connections from all origins in production
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

    // Send initial games list to new connections
    const activeGames = Array.from(gameManager.getGames().values()).map((game, index) => ({
      id: game.id,
      player1: `Player ${index * 2 + 1}`,
      player2: `Player ${index * 2 + 2}`,
      status: game.getStatus()
    }));

    ws.send(JSON.stringify({
      type: 'games_list',
      payload: { games: activeGames }
    }));

    ws.on('message', (data) => {
      console.log('Server received message:', data.toString());
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

// Heartbeat to keep connections alive
const interval = setInterval(() => {
  wss.clients.forEach((ws: WebSocket) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.ping();
    }
  });
}, 30000);

wss.on('error', (error) => {
  console.error('WebSocket server error:', error);
});

// Handle process termination
process.on('SIGTERM', () => {
  console.log('SIGTERM received. Closing WebSocket server...');
  clearInterval(interval);
  wss.close(() => {
    console.log('WebSocket server closed');
    process.exit(0);
  });
});

console.log(`WebSocket server running on port ${port}`);