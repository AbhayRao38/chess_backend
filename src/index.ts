import { WebSocketServer } from 'ws';
import { GameManager } from './GameManager';
import { v4 as uuidv4 } from 'uuid';

const wss = new WebSocketServer({ port: 8080 });
const gameManager = new GameManager();

console.log('[Server] Starting WebSocket server, version 2025-05-01');

wss.on('connection', (ws) => {
  const clientId = uuidv4();
  console.log(`[Server] New WebSocket connection established for client: ${clientId}`);
  
  gameManager.addSocket(ws, clientId);

  ws.on('error', (error) => {
    console.error(`[Server] WebSocket error for client ${clientId}:`, error);
  });

  ws.on('close', () => {
    console.log(`[Server] WebSocket closed for client ${clientId}`);
  });
});

wss.on('listening', () => {
  console.log('[Server] WebSocket server is listening on port 8080');
});