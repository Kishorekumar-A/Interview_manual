const WebSocket = require('ws');

const wss = new WebSocket.Server({ port: 8081 });
console.log('🚀 WebRTC Signaling Server started on port 8081');

const rooms = new Map();
const clients = new Map();

let clientIdCounter = 0;

// Helper function for safe message sending
const safeSend = (ws, message) => {
  try {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        ...message,
        timestamp: Date.now()
      }));
      return true;
    }
  } catch (error) {
    console.error('❌ Error sending message:', error);
  }
  return false;
};

wss.on('connection', (ws) => {
  const clientId = ++clientIdCounter;
  console.log(`✅ Client ${clientId} connected`);
  
  clients.set(ws, { 
    id: clientId, 
    ws, 
    room: null, 
    role: null,
    userId: null,
    joinedAt: new Date().toISOString()
  });

  // Setup heartbeat for this connection
  setupHeartbeat(ws, clientId);

  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data);
      const client = clients.get(ws);
      
      console.log(`📨 [Client ${clientId}] ${message.type} for room ${message.room}`);

      switch (message.type) {
        case 'join':
          handleJoin(ws, message, clientId);
          break;

        case 'offer':
        case 'answer':
        case 'ice-candidate':
          handleWebRTCMessage(ws, message, clientId);
          break;

        case 'chat':
          handleChatMessage(ws, message, clientId);
          break;

        case 'screen_share_state':
          handleScreenShareState(ws, message, clientId);
          break;

        case 'ping':
          safeSend(ws, { type: 'pong', timestamp: Date.now() });
          break;

        default:
          console.warn(`⚠️ Unknown message type: ${message.type} from client ${clientId}`);
          safeSend(ws, { type: 'error', message: 'Unknown message type' });
      }
    } catch (error) {
      console.error('❌ Error parsing message:', error);
      safeSend(ws, { type: 'error', message: 'Invalid message format' });
    }
  });

  ws.on('close', (code, reason) => {
    const client = clients.get(ws);
    if (client) {
      console.log(`🔌 ${client.role} ${client.id} disconnected from room ${client.room} (code: ${code}, reason: ${reason})`);
      handleDisconnect(ws);
      clients.delete(ws);
    }
  });

  ws.on('error', (error) => {
    console.error(`❌ WebSocket error for client ${clientId}:`, error);
  });

  // Send welcome message
  safeSend(ws, { 
    type: 'welcome', 
    message: 'Connected to signaling server',
    clientId: clientId,
    timestamp: Date.now()
  });
});

// FIXED: Enhanced join handler with proper room management
function handleJoin(ws, message, clientId) {
  const { room, role, userType, userId } = message;
  const client = clients.get(ws);

  if (!room || !role) {
    safeSend(ws, { type: 'error', message: 'Room and role are required' });
    return;
  }

  console.log(`👤 ${role} ${clientId} joining room ${room}`);

  // Leave previous room if any
  if (client.room && client.room !== room) {
    handleLeaveRoom(ws, client.room);
  }

  // Get or create room
  let roomData = rooms.get(room);
  if (!roomData) {
    roomData = { 
      id: room,
      clients: [],
      createdAt: new Date().toISOString(),
      interviewer: null,
      participants: []
    };
    rooms.set(room, roomData);
    console.log(`🏠 New room created: ${room}`);
  }

  // Check for duplicate interviewer
  if (role === 'interviewer') {
    if (roomData.interviewer) {
      safeSend(ws, { 
        type: 'error', 
        message: 'Interviewer already exists in this room' 
      });
      return;
    }
    roomData.interviewer = client;
  } else if (role === 'participant') {
    // Allow multiple participants
    roomData.participants.push(client);
  }

  // Update client info
  client.room = room;
  client.role = role;
  client.userType = userType || role;
  client.userId = userId || `user-${clientId}`;
  
  // Add to room clients
  if (!roomData.clients.find(c => c.ws === ws)) {
    roomData.clients.push(client);
  }

  console.log(`✅ ${role} ${clientId} joined room ${room}. Room now has ${roomData.clients.length} clients`);

  // Send confirmation to joining client
  safeSend(ws, { 
    type: 'joined', 
    room: room,
    role: role,
    clientId: clientId,
    userId: client.userId,
    timestamp: Date.now()
  });

  // FIXED: Enhanced peer notification logic with better role-based routing
  roomData.clients.forEach(otherClient => {
    if (otherClient.ws !== ws && otherClient.ws.readyState === WebSocket.OPEN) {
      if (role === 'participant' && otherClient.role === 'interviewer') {
        console.log(`🎯 Notifying interviewer about new participant`);
        safeSend(otherClient.ws, { 
          type: 'participant_joined',
          room: room,
          participantId: clientId,
          userId: client.userId,
          timestamp: Date.now()
        });
      } else if (role === 'interviewer' && otherClient.role === 'participant') {
        console.log(`🎯 Notifying participant about interviewer`);
        safeSend(otherClient.ws, { 
          type: 'interviewer_joined',
          room: room,
          interviewerId: clientId,
          userId: client.userId,
          timestamp: Date.now()
        });
      } else {
        // Notify about peer join
        safeSend(otherClient.ws, {
          type: 'peer_joined',
          room: room,
          role: role,
          peerId: clientId,
          userId: client.userId,
          timestamp: Date.now()
        });
      }
    }
  });

  // Send current room state to the new client
  const roomState = {
    type: 'room_state',
    room: room,
    clients: roomData.clients.map(c => ({
      id: c.id,
      role: c.role,
      userType: c.userType,
      userId: c.userId
    })),
    timestamp: Date.now()
  };
  safeSend(ws, roomState);

  logRoomStatus(room);
}

// FIXED: Enhanced WebRTC message handling with proper routing
function handleWebRTCMessage(senderWs, message, senderId) {
  const client = clients.get(senderWs);
  if (!client || !client.room) {
    console.warn(`⚠️ Client ${senderId} not in a room`);
    return;
  }

  const roomData = rooms.get(client.room);
  if (!roomData) {
    console.warn(`⚠️ Room ${client.room} not found`);
    return;
  }

  console.log(`🔄 Forwarding ${message.type} from ${client.role} ${senderId} in room ${client.room}`);

  let sentCount = 0;
  let targetClients = [];
  
  // FIXED: Enhanced message routing logic
  if (message.type === 'offer') {
    // Offer goes from interviewer to all participants
    if (client.role === 'interviewer') {
      targetClients = roomData.participants;
    } else {
      console.warn(`⚠️ Offer can only be sent by interviewer, but sent by ${client.role}`);
      return;
    }
  } else if (message.type === 'answer') {
    // Answer goes from participant to interviewer
    if (client.role === 'participant') {
      if (roomData.interviewer) {
        targetClients = [roomData.interviewer];
      } else {
        console.warn(`⚠️ No interviewer available to receive answer`);
        return;
      }
    } else {
      console.warn(`⚠️ Answer can only be sent by participant, but sent by ${client.role}`);
      return;
    }
  } else if (message.type === 'ice-candidate') {
    // ICE candidates go to all other clients in the room
    targetClients = roomData.clients.filter(c => c.ws !== senderWs);
  }

  // Send messages to target clients
  targetClients.forEach(targetClient => {
    if (targetClient.ws.readyState === WebSocket.OPEN) {
      const forwardedMessage = {
        ...message,
        senderId: senderId,
        senderRole: client.role,
        senderUserId: client.userId
      };
      if (safeSend(targetClient.ws, forwardedMessage)) {
        sentCount++;
        console.log(`📤 Forwarded ${message.type} to ${targetClient.role} ${targetClient.id}`);
      }
    }
  });

  console.log(`📤 ${message.type} forwarded to ${sentCount} clients`);
}

// FIXED: Enhanced chat message handling - ALWAYS handle chat messages from signaling
function handleChatMessage(senderWs, message, senderId) {
  const client = clients.get(senderWs);
  if (!client || !client.room) {
    console.warn(`⚠️ Client ${senderId} not in a room, cannot send chat`);
    return;
  }

  const roomData = rooms.get(client.room);
  if (!roomData) {
    console.warn(`⚠️ Room ${client.room} not found`);
    return;
  }

  // FIXED: Remove the data channel check - always handle chat messages
  // This ensures signaling works as a reliable fallback when data channels fail
  console.log(`💬 Processing chat message from ${client.role} ${senderId} via signaling`);

  const chatMessage = {
    type: 'chat',
    message: message.message || message.text,
    sender: client.role,
    senderId: senderId,
    senderUserId: client.userId,
    timestamp: message.timestamp || Date.now(),
    room: client.room,
    fromSignaling: true // Mark as from signaling
  };

  let sentCount = 0;
  
  // Send to all other clients in the room
  roomData.clients.forEach(targetClient => {
    if (targetClient.ws !== senderWs && targetClient.ws.readyState === WebSocket.OPEN) {
      if (safeSend(targetClient.ws, chatMessage)) {
        sentCount++;
        console.log(`📤 Chat delivered to ${targetClient.role} ${targetClient.id}`);
      }
    }
  });

  console.log(`💬 Chat from ${client.role} ${senderId} delivered to ${sentCount} clients via signaling`);
}

// FIXED: Enhanced screen share state handling - ALWAYS handle from signaling
function handleScreenShareState(senderWs, message, senderId) {
  const client = clients.get(senderWs);
  if (!client || !client.room) return;

  const roomData = rooms.get(client.room);
  if (!roomData) return;

  // FIXED: Remove the data channel check - always handle screen share state
  console.log(`🖥️ Processing screen share state from ${client.role} ${senderId} via signaling`);

  const screenMessage = {
    type: 'screen_share_state',
    isSharing: message.isSharing,
    role: client.role,
    senderId: senderId,
    senderUserId: client.userId,
    timestamp: Date.now(),
    room: client.room,
    fromSignaling: true // Mark as from signaling
  };

  let sentCount = 0;
  roomData.clients.forEach(targetClient => {
    if (targetClient.ws !== senderWs && targetClient.ws.readyState === WebSocket.OPEN) {
      if (safeSend(targetClient.ws, screenMessage)) {
        sentCount++;
      }
    }
  });

  console.log(`🖥️ Screen share state from ${client.role} ${senderId}: ${message.isSharing} (sent to ${sentCount} clients via signaling)`);
}

// FIXED: Enhanced disconnect handling with better cleanup
function handleDisconnect(ws) {
  const client = clients.get(ws);
  if (!client || !client.room) return;

  const roomData = rooms.get(client.room);
  if (!roomData) return;

  // Store client info for notification
  const clientInfo = {
    role: client.role,
    id: client.id,
    userId: client.userId,
    room: client.room
  };

  // Remove client from room
  roomData.clients = roomData.clients.filter(c => c.ws !== ws);
  
  // Update interviewer/participants
  if (client.role === 'interviewer') {
    roomData.interviewer = null;
  } else if (client.role === 'participant') {
    roomData.participants = roomData.participants.filter(p => p.ws !== ws);
  }

  console.log(`👋 ${client.role} ${client.id} left room ${client.room} (${roomData.clients.length} remaining)`);

  // Notify other clients about the disconnect
  roomData.clients.forEach(otherClient => {
    if (otherClient.ws.readyState === WebSocket.OPEN) {
      safeSend(otherClient.ws, {
        type: 'peer_disconnected',
        role: clientInfo.role,
        senderId: clientInfo.id,
        senderUserId: clientInfo.userId,
        room: clientInfo.room,
        timestamp: Date.now()
      });
    }
  });

  // Cleanup empty room
  if (roomData.clients.length === 0) {
    rooms.delete(client.room);
    console.log(`🏚️ Room ${client.room} deleted (empty)`);
  } else {
    logRoomStatus(client.room);
  }
}

// Helper function to leave room
function handleLeaveRoom(ws, roomId) {
  const roomData = rooms.get(roomId);
  if (!roomData) return;

  const client = clients.get(ws);
  if (!client) return;

  roomData.clients = roomData.clients.filter(c => c.ws !== ws);
  
  if (client.role === 'interviewer') {
    roomData.interviewer = null;
  } else if (client.role === 'participant') {
    roomData.participants = roomData.participants.filter(p => p.ws !== ws);
  }

  console.log(`🚪 ${client.role} ${client.id} left room ${roomId}`);
}

// Helper function to log room status
function logRoomStatus(roomId) {
  const roomData = rooms.get(roomId);
  if (!roomData) return;

  const status = {
    room: roomId,
    totalClients: roomData.clients.length,
    interviewer: roomData.interviewer ? {
      id: roomData.interviewer.id,
      userId: roomData.interviewer.userId
    } : null,
    participants: roomData.participants.map(p => ({
      id: p.id,
      userId: p.userId
    })),
    clientRoles: roomData.clients.map(c => ({ 
      id: c.id, 
      role: c.role,
      userId: c.userId
    }))
  };
  
  console.log('📊 Room Status:', JSON.stringify(status, null, 2));
}

// FIXED: Enhanced heartbeat and connection monitoring
function setupHeartbeat(ws, clientId) {
  const interval = setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) {
      safeSend(ws, { type: 'ping', timestamp: Date.now() });
    } else {
      clearInterval(interval);
    }
  }, 30000); // Send ping every 30 seconds

  ws.on('close', () => {
    clearInterval(interval);
  });

  ws.on('error', () => {
    clearInterval(interval);
  });
}

// Periodic cleanup and stats logging
setInterval(() => {
  const stats = {
    timestamp: new Date().toISOString(),
    totalRooms: rooms.size,
    totalClients: clients.size,
    rooms: Array.from(rooms.entries()).map(([roomId, room]) => ({
      roomId,
      clientCount: room.clients.length,
      hasInterviewer: !!room.interviewer,
      participantCount: room.participants.length,
      createdAt: room.createdAt
    }))
  };
  
  console.log('📈 Server Statistics:', JSON.stringify(stats, null, 2));
  
  // Cleanup dead connections
  let cleanedCount = 0;
  clients.forEach((client, ws) => {
    if (ws.readyState !== WebSocket.OPEN) {
      console.log(`🧹 Cleaning up dead connection: ${client.role} ${client.id}`);
      handleDisconnect(ws);
      clients.delete(ws);
      cleanedCount++;
    }
  });
  
  if (cleanedCount > 0) {
    console.log(`🧹 Cleaned up ${cleanedCount} dead connections`);
  }
}, 60000); // Run every minute

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('🛑 Shutting down signaling server...');
  
  // Notify all clients
  clients.forEach((client, ws) => {
    if (ws.readyState === WebSocket.OPEN) {
      safeSend(ws, { 
        type: 'server_shutdown', 
        message: 'Server is shutting down',
        timestamp: Date.now()
      });
    }
  });
  
  // Close all connections
  setTimeout(() => {
    wss.close(() => {
      console.log('✅ Signaling server shut down gracefully');
      process.exit(0);
    });
  }, 1000); // Give clients 1 second to receive shutdown message
});

process.on('SIGTERM', () => {
  console.log('🛑 Received SIGTERM, shutting down gracefully...');
  process.emit('SIGINT');
});

console.log('✅ WebRTC Signaling Server ready!');
console.log('📋 Available endpoints:');
console.log('   - ws://localhost:8081');
console.log('   - Message types: join, offer, answer, ice-candidate, chat, screen_share_state, ping');
console.log('🔧 Features:');
console.log('   - Reliable signaling fallback for chat');
console.log('   - Automatic room cleanup');
console.log('   - Connection monitoring');
console.log('   - Graceful shutdown handling');