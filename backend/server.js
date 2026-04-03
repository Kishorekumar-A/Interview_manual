import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';
import { WebSocketServer, WebSocket } from 'ws';
import http from 'http';

// Routes
import authRoutes from './routes/auth.js';
import roomRoutes from './routes/rooms.js';
import detectionRoutes from './routes/detections.js';

dotenv.config();

const app = express();
const server = http.createServer(app);

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/rooms', roomRoutes);
app.use('/api/detections', detectionRoutes);

// Disable Mongoose query buffering — queries fail fast if DB isn't connected
mongoose.set('bufferCommands', false);

// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('✅ MongoDB Connected'))
  .catch(err => {
    console.error('❌ MongoDB connection error:', err.message);
    process.exit(1); // crash fast so Render can show real error and restart
  });

// ─── WebRTC Signaling (merged from signaling-server.js) ──────────────────────

const wss = new WebSocketServer({ server });
console.log('🚀 WebRTC Signaling Server attached to HTTP server');

const rooms = new Map();
const clients = new Map();
let clientIdCounter = 0;

const safeSend = (ws, message) => {
  try {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ ...message, timestamp: Date.now() }));
      return true;
    }
  } catch (error) {
    console.error('❌ Error sending message:', error);
  }
  return false;
};

function handleJoin(ws, message, clientId) {
  const { room, role, userType, userId } = message;
  const client = clients.get(ws);
  if (!room || !role) {
    safeSend(ws, { type: 'error', message: 'Room and role are required' });
    return;
  }
  console.log(`👤 ${role} ${clientId} joining room ${room}`);
  if (client.room && client.room !== room) handleLeaveRoom(ws, client.room);

  let roomData = rooms.get(room);
  if (!roomData) {
    roomData = { id: room, clients: [], createdAt: new Date().toISOString(), interviewer: null, participants: [] };
    rooms.set(room, roomData);
    console.log(`🏠 New room created: ${room}`);
  }

  if (role === 'interviewer') {
    if (roomData.interviewer) {
      safeSend(ws, { type: 'error', message: 'Interviewer already exists in this room' });
      return;
    }
    roomData.interviewer = client;
  } else if (role === 'participant') {
    roomData.participants.push(client);
  }

  client.room = room;
  client.role = role;
  client.userType = userType || role;
  client.userId = userId || `user-${clientId}`;
  if (!roomData.clients.find(c => c.ws === ws)) roomData.clients.push(client);

  console.log(`✅ ${role} ${clientId} joined room ${room}. Room has ${roomData.clients.length} clients`);
  safeSend(ws, { type: 'joined', room, role, clientId, userId: client.userId });

  roomData.clients.forEach(otherClient => {
    if (otherClient.ws !== ws && otherClient.ws.readyState === WebSocket.OPEN) {
      if (role === 'participant' && otherClient.role === 'interviewer') {
        safeSend(otherClient.ws, { type: 'participant_joined', room, participantId: clientId, userId: client.userId });
      } else if (role === 'interviewer' && otherClient.role === 'participant') {
        safeSend(otherClient.ws, { type: 'interviewer_joined', room, interviewerId: clientId, userId: client.userId });
      } else {
        safeSend(otherClient.ws, { type: 'peer_joined', room, role, peerId: clientId, userId: client.userId });
      }
    }
  });

  safeSend(ws, {
    type: 'room_state',
    room,
    clients: roomData.clients.map(c => ({ id: c.id, role: c.role, userType: c.userType, userId: c.userId }))
  });
}

function handleWebRTCMessage(senderWs, message, senderId) {
  const client = clients.get(senderWs);
  if (!client || !client.room) return;
  const roomData = rooms.get(client.room);
  if (!roomData) return;

  console.log(`🔄 Forwarding ${message.type} from ${client.role} ${senderId}`);
  let targetClients = [];

  if (message.type === 'offer') {
    if (client.role === 'interviewer') targetClients = roomData.participants;
    else return;
  } else if (message.type === 'answer') {
    if (client.role === 'participant' && roomData.interviewer) targetClients = [roomData.interviewer];
    else return;
  } else if (message.type === 'ice-candidate') {
    targetClients = roomData.clients.filter(c => c.ws !== senderWs);
  }

  let sentCount = 0;
  targetClients.forEach(targetClient => {
    if (targetClient.ws.readyState === WebSocket.OPEN) {
      if (safeSend(targetClient.ws, { ...message, senderId, senderRole: client.role, senderUserId: client.userId })) {
        sentCount++;
      }
    }
  });
  console.log(`📤 ${message.type} forwarded to ${sentCount} clients`);
}

function handleChatMessage(senderWs, message, senderId) {
  const client = clients.get(senderWs);
  if (!client || !client.room) return;
  const roomData = rooms.get(client.room);
  if (!roomData) return;

  const chatMessage = {
    type: 'chat',
    message: message.message || message.text,
    sender: client.role,
    senderId,
    senderUserId: client.userId,
    timestamp: message.timestamp || Date.now(),
    room: client.room,
    fromSignaling: true
  };

  let sentCount = 0;
  roomData.clients.forEach(targetClient => {
    if (targetClient.ws !== senderWs && targetClient.ws.readyState === WebSocket.OPEN) {
      if (safeSend(targetClient.ws, chatMessage)) sentCount++;
    }
  });
  console.log(`💬 Chat from ${client.role} delivered to ${sentCount} clients`);
}

function handleScreenShareState(senderWs, message, senderId) {
  const client = clients.get(senderWs);
  if (!client || !client.room) return;
  const roomData = rooms.get(client.room);
  if (!roomData) return;

  const screenMessage = {
    type: 'screen_share_state',
    isSharing: message.isSharing,
    role: client.role,
    senderId,
    senderUserId: client.userId,
    room: client.room,
    fromSignaling: true
  };

  roomData.clients.forEach(targetClient => {
    if (targetClient.ws !== senderWs && targetClient.ws.readyState === WebSocket.OPEN) {
      safeSend(targetClient.ws, screenMessage);
    }
  });
}

function handleDisconnect(ws) {
  const client = clients.get(ws);
  if (!client || !client.room) return;
  const roomData = rooms.get(client.room);
  if (!roomData) return;

  const clientInfo = { role: client.role, id: client.id, userId: client.userId, room: client.room };
  roomData.clients = roomData.clients.filter(c => c.ws !== ws);
  if (client.role === 'interviewer') roomData.interviewer = null;
  else if (client.role === 'participant') roomData.participants = roomData.participants.filter(p => p.ws !== ws);

  console.log(`👋 ${client.role} ${client.id} left room ${client.room} (${roomData.clients.length} remaining)`);

  roomData.clients.forEach(otherClient => {
    if (otherClient.ws.readyState === WebSocket.OPEN) {
      safeSend(otherClient.ws, { type: 'peer_disconnected', role: clientInfo.role, senderId: clientInfo.id, senderUserId: clientInfo.userId, room: clientInfo.room });
    }
  });

  if (roomData.clients.length === 0) {
    rooms.delete(client.room);
    console.log(`🏚️ Room ${client.room} deleted (empty)`);
  }
}

function handleLeaveRoom(ws, roomId) {
  const roomData = rooms.get(roomId);
  const client = clients.get(ws);
  if (!roomData || !client) return;
  roomData.clients = roomData.clients.filter(c => c.ws !== ws);
  if (client.role === 'interviewer') roomData.interviewer = null;
  else if (client.role === 'participant') roomData.participants = roomData.participants.filter(p => p.ws !== ws);
}

function setupHeartbeat(ws, clientId) {
  const interval = setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) {
      safeSend(ws, { type: 'ping' });
    } else {
      clearInterval(interval);
    }
  }, 30000);
  ws.on('close', () => clearInterval(interval));
  ws.on('error', () => clearInterval(interval));
}

wss.on('connection', (ws) => {
  const clientId = ++clientIdCounter;
  console.log(`✅ Client ${clientId} connected`);

  clients.set(ws, { id: clientId, ws, room: null, role: null, userId: null, joinedAt: new Date().toISOString() });
  setupHeartbeat(ws, clientId);

  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data);
      console.log(`📨 [Client ${clientId}] ${message.type} for room ${message.room}`);

      switch (message.type) {
        case 'join':               handleJoin(ws, message, clientId); break;
        case 'offer':
        case 'answer':
        case 'ice-candidate':      handleWebRTCMessage(ws, message, clientId); break;
        case 'chat':               handleChatMessage(ws, message, clientId); break;
        case 'screen_share_state': handleScreenShareState(ws, message, clientId); break;
        case 'ping':               safeSend(ws, { type: 'pong' }); break;
        default:
          console.warn(`⚠️ Unknown message type: ${message.type}`);
          safeSend(ws, { type: 'error', message: 'Unknown message type' });
      }
    } catch (error) {
      console.error('❌ Error parsing message:', error);
      safeSend(ws, { type: 'error', message: 'Invalid message format' });
    }
  });

  ws.on('close', (code) => {
    const client = clients.get(ws);
    if (client) {
      console.log(`🔌 Client ${client.id} disconnected (code: ${code})`);
      handleDisconnect(ws);
      clients.delete(ws);
    }
  });

  ws.on('error', (error) => console.error(`❌ WebSocket error for client ${clientId}:`, error));

  safeSend(ws, { type: 'welcome', message: 'Connected to signaling server', clientId });
});

// Periodic cleanup of dead connections
setInterval(() => {
  let cleaned = 0;
  clients.forEach((client, ws) => {
    if (ws.readyState !== WebSocket.OPEN) {
      handleDisconnect(ws);
      clients.delete(ws);
      cleaned++;
    }
  });
  if (cleaned > 0) console.log(`🧹 Cleaned up ${cleaned} dead connections`);
}, 60000);

// ─── HTTP server ──────────────────────────────────────────────────────────────

app.get('/', (req, res) => res.send('Backend is running 🚀'));

const PORT = process.env.PORT || 8000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📡 WebRTC Signaling ready on same port`);
});