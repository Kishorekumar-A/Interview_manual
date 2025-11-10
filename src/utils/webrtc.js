// src/utils/webrtc.js
export class WebRTCSignaling {
  constructor(roomId, userId, role, options = {}) {
    this.roomId = roomId;
    this.userId = userId;
    this.role = role; // 'interviewer' or 'participant'
    this.ws = null;
    this.peerConnection = null;
    this.dataChannels = new Map();
    this.reconnectTimeout = null;
    this.localStream = null;
    
    // Event handlers
    this.onConnectionStateChange = options.onConnectionStateChange || (() => {});
    this.onSignalingStateChange = options.onSignalingStateChange || (() => {});
    this.onIceConnectionStateChange = options.onIceConnectionStateChange || (() => {});
    this.onTrack = options.onTrack || (() => {});
    this.onMessage = options.onMessage || (() => {});
    this.onError = options.onError || (() => {});
    this.onOpen = options.onOpen || (() => {});
    this.onClose = options.onClose || (() => {});
    this.onDataChannel = options.onDataChannel || (() => {});
    this.onLocalStream = options.onLocalStream || (() => {});
    this.onParticipantJoined = options.onParticipantJoined || (() => {});
    this.onInterviewerJoined = options.onInterviewerJoined || (() => {});
    this.onPeerDisconnected = options.onPeerDisconnected || (() => {});
    
    this.config = {
      reconnectAttempts: 0,
      maxReconnectAttempts: 5,
      baseReconnectDelay: 1000,
      maxReconnectDelay: 10000,
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' }
      ],
      iceCandidatePoolSize: 10
    };
    
    this.isConnected = false;
    this.isConnecting = false;
    this.hasJoinedRoom = false;
  }
  
  async connect() {
    if (this.isConnecting) return Promise.reject(new Error('Already connecting'));
    
    this.isConnecting = true;
    this.config.reconnectAttempts = 0;
    
    return new Promise((resolve, reject) => {
      try {
        if (this.ws) this.ws.close();
        
        const wsUrl = `ws://localhost:8081`;
        console.log(`🔗 ${this.role} connecting to signaling: ${wsUrl}`);
        this.ws = new WebSocket(wsUrl);
        
        const connectionTimeout = setTimeout(() => {
          if (!this.isConnected) {
            this.ws.close();
            reject(new Error('WebSocket connection timeout'));
          }
        }, 10000);

        this.ws.onopen = () => {
          clearTimeout(connectionTimeout);
          console.log(`✅ ${this.role} signaling connected`);
          this.isConnected = true;
          this.isConnecting = false;
          this.config.reconnectAttempts = 0;
          
          // Send join message immediately
          this.sendSignalingMessage({
            type: 'join',
            room: this.roomId,
            role: this.role,
            userType: this.role,
            userId: this.userId
          });
          
          this.onOpen();
          resolve(this.ws);
        };
        
        this.ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            console.log(`📨 ${this.role} received signaling:`, data.type, data);
            this.handleSignalingMessage(data);
            // Don't call onMessage here - let handleSignalingMessage handle it
          } catch (error) {
            console.error('❌ Error parsing signaling message:', error);
            this.onError(error);
          }
        };
        
        this.ws.onclose = (event) => {
          clearTimeout(connectionTimeout);
          console.log(`🔌 ${this.role} signaling closed:`, event.code, event.reason);
          this.isConnected = false;
          this.isConnecting = false;
          this.hasJoinedRoom = false;
          this.onClose(event);
          
          // Only reconnect if we were previously connected
          if (this.hasJoinedRoom) {
            this.attemptReconnect();
          }
        };
        
        this.ws.onerror = (error) => {
          clearTimeout(connectionTimeout);
          console.error(`❌ ${this.role} signaling error:`, error);
          this.isConnecting = false;
          this.onError(error);
          reject(error);
        };
      } catch (error) {
        this.isConnecting = false;
        console.error('❌ Error creating WebSocket:', error);
        this.onError(error);
        reject(error);
      }
    });
  }
  
  // FIXED: Enhanced message handling with proper routing
  handleSignalingMessage(data) {
    try {
      console.log(`🔄 ${this.role} handling signaling message:`, data.type);
      
      switch (data.type) {
        case 'welcome':
          console.log('👋 Welcome from server:', data.message);
          break;
          
        case 'joined':
          console.log('✅ Successfully joined room');
          this.hasJoinedRoom = true;
          break;
          
        case 'room_state':
          console.log('🏠 Room state:', data.clients);
          break;
          
        case 'participant_joined':
          console.log('👤 Participant joined room:', data.participantId);
          this.onParticipantJoined(data);
          break;
          
        case 'interviewer_joined':
          console.log('🎯 Interviewer joined room:', data.interviewerId);
          this.onInterviewerJoined(data);
          break;
          
        case 'peer_joined':
          console.log('👥 Peer joined:', data.role, data.peerId);
          break;
          
        case 'offer':
          console.log('🎯 Received offer from:', data.senderRole);
          this.handleOffer(data.sdp);
          break;
          
        case 'answer':
          console.log('✅ Received answer from:', data.senderRole);
          this.handleAnswer(data.sdp);
          break;
          
        case 'ice-candidate':
          console.log('🧊 Received ICE candidate from:', data.senderRole);
          this.handleCandidate(data.candidate);
          break;
          
        case 'chat':
          console.log('💬 Chat message from signaling:', data.sender, data.message);
          // FIXED: Always handle chat messages from signaling as fallback
          data.fromSignaling = true;
          this.onMessage(data);
          break;
          
        case 'screen_share_state':
          console.log('🖥️ Screen share state from signaling:', data.isSharing);
          data.fromSignaling = true;
          this.onMessage(data);
          break;
          
        case 'peer_disconnected':
          console.log('👋 Peer disconnected:', data.role, data.senderId);
          this.onPeerDisconnected(data);
          break;
          
        case 'error':
          console.error('❌ Signaling error:', data.message);
          this.onError(new Error(data.message));
          break;
          
        case 'server_shutdown':
          console.log('🛑 Server is shutting down');
          this.onError(new Error('Server is shutting down'));
          break;
          
        default:
          console.log('📨 Unknown message type:', data.type);
      }
    } catch (error) {
      console.error('❌ Error handling signaling message:', error);
      this.onError(error);
    }
  }
  
  // FIXED: Enhanced offer handling with data channel creation
  async handleOffer(offer) {
    if (!this.peerConnection) {
      console.log('🚀 Creating peer connection for offer handling');
      await this.createPeerConnection();
    }
    
    try {
      console.log('🎯 Setting remote description from offer');
      await this.peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
      console.log('✅ Remote description set from offer');
      
      // FIXED: Create data channel when handling offer (for participants)
      if (this.role === 'participant' && !this.dataChannels.has('chat')) {
        console.log('💬 Participant creating data channel in response to offer');
        this.createDataChannel('chat', { ordered: true });
      }
      
      const answer = await this.peerConnection.createAnswer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true
      });
      await this.peerConnection.setLocalDescription(answer);
      console.log('✅ Answer created and local description set');
      
      this.sendSignalingMessage({
        type: 'answer',
        sdp: answer
      });
      console.log('📤 Answer sent to signaling server');
    } catch (error) {
      console.error('❌ Error handling offer:', error);
      this.onError(error);
    }
  }
  
  async handleAnswer(answer) {
    if (!this.peerConnection) {
      console.error('❌ No peer connection to handle answer');
      return;
    }
    
    try {
      console.log('🎯 Setting remote description from answer');
      await this.peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
      console.log('✅ Remote description set from answer');
    } catch (error) {
      console.error('❌ Error handling answer:', error);
      this.onError(error);
    }
  }
  
  async handleCandidate(candidate) {
    if (!this.peerConnection || !candidate) {
      console.warn('⚠️ No peer connection or candidate to handle');
      return;
    }
    
    try {
      console.log('🧊 Adding ICE candidate');
      await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
      console.log('✅ ICE candidate added');
    } catch (error) {
      console.error('❌ Error adding ICE candidate:', error);
      // Don't treat this as a fatal error
    }
  }
  
  sendSignalingMessage(message) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn('⚠️ WebSocket not connected, cannot send message:', message.type);
      return false;
    }
    
    try {
      const messageWithRoom = {
        ...message,
        room: this.roomId,
        userId: this.userId,
        role: this.role
      };
      this.ws.send(JSON.stringify(messageWithRoom));
      console.log(`📤 ${this.role} sent signaling:`, message.type);
      return true;
    } catch (error) {
      console.error('❌ Error sending signaling message:', error);
      this.onError(error);
      return false;
    }
  }
  
  // FIXED: Enhanced peer connection creation with data channel setup
  async createPeerConnection() {
    try {
      // Close existing connection if any
      if (this.peerConnection) {
        this.peerConnection.close();
      }

      const configuration = {
        iceServers: this.config.iceServers,
        iceCandidatePoolSize: this.config.iceCandidatePoolSize,
        bundlePolicy: 'max-bundle',
        rtcpMuxPolicy: 'require'
      };
      
      this.peerConnection = new RTCPeerConnection(configuration);
      console.log(`✅ ${this.role} PeerConnection created`);
      
      this.setupPeerConnectionEventHandlers();
      
      // FIXED: Create data channel immediately for interviewer
      if (this.role === 'interviewer' && !this.dataChannels.has('chat')) {
        console.log('💬 Interviewer creating data channel');
        this.createDataChannel('chat', { ordered: true });
      }
      
      // Add local stream if available
      if (this.localStream) {
        this.addStream(this.localStream);
      }
      
      return this.peerConnection;
    } catch (error) {
      console.error('❌ Error creating PeerConnection:', error);
      this.onError(error);
      throw error;
    }
  }
  
  // FIXED: Enhanced event handlers with better data channel management
  setupPeerConnectionEventHandlers() {
    if (!this.peerConnection) return;
    
    this.peerConnection.onconnectionstatechange = () => {
      const state = this.peerConnection.connectionState;
      console.log(`🔗 ${this.role} connection state:`, state);
      this.onConnectionStateChange(state);
      
      if (state === 'connected') {
        console.log('🎉 WebRTC connection established!');
      } else if (state === 'failed') {
        console.log('🔄 Connection failed, may need to restart');
        setTimeout(() => {
          if (this.hasJoinedRoom && !this.isConnected) {
            console.log('🔄 Attempting to restart connection...');
            this.attemptReconnect();
          }
        }, 2000);
      }
    };
    
    this.peerConnection.onsignalingstatechange = () => {
      const state = this.peerConnection.signalingState;
      console.log(`📡 ${this.role} signaling state:`, state);
      this.onSignalingStateChange(state);
    };
    
    this.peerConnection.oniceconnectionstatechange = () => {
      const state = this.peerConnection.iceConnectionState;
      console.log(`🧊 ${this.role} ICE connection state:`, state);
      this.onIceConnectionStateChange(state);
      
      if (state === 'failed') {
        console.log('🔄 ICE connection failed, may need to restart');
      }
    };
    
    this.peerConnection.onicegatheringstatechange = () => {
      const state = this.peerConnection.iceGatheringState;
      console.log(`🌐 ${this.role} ICE gathering state:`, state);
    };
    
    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        console.log(`🧊 ${this.role} sending ICE candidate`);
        this.sendSignalingMessage({
          type: 'ice-candidate',
          candidate: event.candidate
        });
      } else {
        console.log(`✅ ${this.role} all ICE candidates gathered`);
      }
    };
    
    // FIXED: Enhanced track handling
    this.peerConnection.ontrack = (event) => {
      console.log(`🎥 ${this.role} received remote track:`, event.track.kind, event.streams);
      
      if (event.streams && event.streams.length > 0) {
        const remoteStream = event.streams[0];
        console.log(`📹 ${this.role} received remote stream:`, remoteStream.id);
        
        const videoTracks = remoteStream.getVideoTracks();
        const audioTracks = remoteStream.getAudioTracks();
        console.log(`🎯 ${this.role} stream has ${videoTracks.length} video tracks, ${audioTracks.length} audio tracks`);
      }
      
      this.onTrack(event);
    };
    
    this.peerConnection.ondatachannel = (event) => {
      console.log(`💬 ${this.role} received data channel:`, event.channel.label);
      this.setupDataChannel(event.channel);
      this.onDataChannel(event.channel);
    };
  }
  
  // FIXED: Enhanced data channel setup with better state management
  setupDataChannel(channel) {
    this.dataChannels.set(channel.label, channel);
    
    channel.onopen = () => {
      console.log(`✅ ${this.role} data channel opened:`, channel.label);
      // Notify about data channel state change
      if (channel.label === 'chat') {
        this.onMessage({ 
          type: 'data_channel_state', 
          channel: channel.label, 
          state: 'open',
          fromDataChannel: true 
        });
      }
    };
    
    channel.onmessage = (event) => {
      console.log(`💬 ${this.role} data channel message received:`, event.data);
      try {
        const data = JSON.parse(event.data);
        // Mark data as coming from data channel to prevent duplicates
        data.fromDataChannel = true;
        data.channel = channel.label;
        this.onMessage(data);
      } catch (e) {
        console.error('❌ Error parsing data channel message:', e);
        this.onMessage({ 
          type: 'raw_message', 
          data: event.data, 
          fromDataChannel: true,
          channel: channel.label 
        });
      }
    };
    
    channel.onclose = () => {
      console.log(`🔌 ${this.role} data channel closed:`, channel.label);
      this.dataChannels.delete(channel.label);
      
      // Notify about data channel state change
      if (channel.label === 'chat') {
        this.onMessage({ 
          type: 'data_channel_state', 
          channel: channel.label, 
          state: 'closed',
          fromDataChannel: true 
        });
      }
    };
    
    channel.onerror = (error) => {
      console.error(`❌ ${this.role} data channel error:`, error);
      this.onError(error);
    };
  }
  
  // FIXED: Enhanced offer creation with data channel
  async createOffer() {
    if (!this.peerConnection) {
      console.log('🚀 Creating peer connection for offer');
      await this.createPeerConnection();
    }
    
    try {
      console.log('🎯 Creating offer...');
      const offer = await this.peerConnection.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true
      });
      
      await this.peerConnection.setLocalDescription(offer);
      console.log('✅ Offer created and local description set');
      
      this.sendSignalingMessage({
        type: 'offer',
        sdp: offer
      });
      
      return offer;
    } catch (error) {
      console.error('❌ Error creating offer:', error);
      this.onError(error);
      throw error;
    }
  }
  
  // FIXED: Enhanced local stream management
  async setLocalStream(stream) {
    this.localStream = stream;
    
    if (this.peerConnection && stream) {
      try {
        // Get current senders
        const senders = this.peerConnection.getSenders();
        
        // Remove existing tracks of the same kind
        const newVideoTrack = stream.getVideoTracks()[0];
        const newAudioTrack = stream.getAudioTracks()[0];
        
        // Replace video track if available
        if (newVideoTrack) {
          const videoSender = senders.find(s => s.track && s.track.kind === 'video');
          if (videoSender) {
            await videoSender.replaceTrack(newVideoTrack);
            console.log('✅ Video track replaced');
          } else {
            this.peerConnection.addTrack(newVideoTrack, stream);
            console.log('✅ Video track added');
          }
        }
        
        // Replace audio track if available
        if (newAudioTrack) {
          const audioSender = senders.find(s => s.track && s.track.kind === 'audio');
          if (audioSender) {
            await audioSender.replaceTrack(newAudioTrack);
            console.log('✅ Audio track replaced');
          } else {
            this.peerConnection.addTrack(newAudioTrack, stream);
            console.log('✅ Audio track added');
          }
        }
        
        console.log('✅ Local stream set with', stream.getTracks().length, 'tracks');
      } catch (error) {
        console.error('❌ Error setting local stream:', error);
        // Fallback to adding tracks normally
        try {
          // Remove all existing tracks first
          const senders = this.peerConnection.getSenders();
          senders.forEach(sender => {
            if (sender.track) {
              this.peerConnection.removeTrack(sender);
            }
          });
          
          // Add new tracks
          stream.getTracks().forEach(track => {
            this.peerConnection.addTrack(track, stream);
          });
          console.log('✅ Local stream set (fallback method)');
        } catch (fallbackError) {
          console.error('❌ Error in fallback stream setting:', fallbackError);
        }
      }
    }
    
    this.onLocalStream(stream);
  }
  
  addStream(stream) {
    if (!this.peerConnection) {
      console.warn('⚠️ No peer connection to add stream');
      return;
    }
    
    try {
      stream.getTracks().forEach(track => {
        this.peerConnection.addTrack(track, stream);
      });
      console.log('✅ Stream added with', stream.getTracks().length, 'tracks');
    } catch (error) {
      console.error('❌ Error adding stream:', error);
      this.onError(error);
    }
  }
  
  createDataChannel(label, options = {}) {
    if (!this.peerConnection) {
      console.error('❌ No peer connection to create data channel');
      return null;
    }
    
    try {
      const channel = this.peerConnection.createDataChannel(label, {
        ordered: true,
        maxRetransmits: 3,
        ...options
      });
      this.setupDataChannel(channel);
      console.log(`✅ Data channel created: ${label}`);
      return channel;
    } catch (error) {
      console.error('❌ Error creating data channel:', error);
      this.onError(error);
      return null;
    }
  }
  
  sendData(channelLabel, data) {
    const channel = this.dataChannels.get(channelLabel);
    if (channel && channel.readyState === 'open') {
      try {
        const message = typeof data === 'string' ? data : JSON.stringify(data);
        channel.send(message);
        console.log(`📤 ${this.role} sent data on ${channelLabel}:`, data.type || 'raw data');
        return true;
      } catch (error) {
        console.error('❌ Error sending data:', error);
        return false;
      }
    } else {
      console.warn(`⚠️ Data channel ${channelLabel} not open, state:`, channel?.readyState);
      return false;
    }
  }
  
  // FIXED: Enhanced chat message sending with better fallback logic
  sendChatMessage(messageText, messageId = null) {
    const messageIdToUse = messageId || `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const timestamp = new Date().toISOString();
    
    const chatData = {
      type: 'chat',
      message: messageText,
      timestamp: timestamp,
      sender: this.role,
      id: messageIdToUse,
      fromDataChannel: true
    };

    console.log(`📤 ${this.role} attempting to send chat message:`, messageText);
    
    // Try data channel first for better performance
    if (this.isDataChannelOpen('chat')) {
      console.log('💬 Using data channel for chat message');
      const success = this.sendData('chat', chatData);
      if (success) {
        return true;
      }
    }
    
    // Fallback to signaling
    console.log('🔄 Falling back to signaling for chat message');
    return this.sendSignalingMessage({
      type: 'chat',
      message: messageText,
      timestamp: timestamp,
      sender: this.role,
      id: messageIdToUse
    });
  }
  
  sendScreenShareState(isSharing) {
    const screenData = {
      type: 'screen_share_state',
      isSharing: isSharing,
      timestamp: Date.now(),
      role: this.role,
      fromDataChannel: true
    };

    // Try data channel first
    if (this.isDataChannelOpen('chat')) {
      return this.sendData('chat', screenData);
    } else {
      // Fallback to signaling
      return this.sendSignalingMessage({
        type: 'screen_share_state',
        isSharing: isSharing,
        timestamp: Date.now(),
        role: this.role
      });
    }
  }
  
  attemptReconnect() {
    if (this.config.reconnectAttempts >= this.config.maxReconnectAttempts) {
      console.log(`❌ ${this.role} max reconnect attempts reached`);
      this.onError(new Error('Max reconnect attempts reached'));
      return;
    }

    this.config.reconnectAttempts++;
    const delay = Math.min(
      this.config.baseReconnectDelay * Math.pow(2, this.config.reconnectAttempts - 1),
      this.config.maxReconnectDelay
    );
    
    console.log(`🔄 ${this.role} attempting reconnect in ${delay}ms (attempt ${this.config.reconnectAttempts})`);
    
    this.reconnectTimeout = setTimeout(() => {
      console.log(`🔄 ${this.role} executing reconnect...`);
      this.connect().catch(error => {
        console.error(`❌ ${this.role} reconnect failed:`, error);
      });
    }, delay);
  }
  
  close() {
    console.log(`🛑 Closing ${this.role} WebRTC...`);
    
    // Clear reconnect timeout
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    
    // Close data channels
    this.dataChannels.forEach(channel => {
      try {
        channel.close();
      } catch (error) {
        console.error('Error closing data channel:', error);
      }
    });
    this.dataChannels.clear();
    
    // Close peer connection
    if (this.peerConnection) {
      try {
        this.peerConnection.close();
      } catch (error) {
        console.error('Error closing peer connection:', error);
      }
      this.peerConnection = null;
    }
    
    // Close WebSocket
    if (this.ws) {
      try {
        this.ws.close();
      } catch (error) {
        console.error('Error closing WebSocket:', error);
      }
      this.ws = null;
    }
    
    // Stop local stream
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => {
        track.stop();
        track.enabled = false;
      });
    }
    
    // Reset state
    this.isConnected = false;
    this.isConnecting = false;
    this.hasJoinedRoom = false;
    this.config.reconnectAttempts = 0;
    
    console.log(`✅ ${this.role} WebRTC closed`);
  }
  
  // Utility methods
  getConnectionState() {
    return this.peerConnection ? this.peerConnection.connectionState : 'disconnected';
  }
  
  getIceConnectionState() {
    return this.peerConnection ? this.peerConnection.iceConnectionState : 'disconnected';
  }
  
  getSignalingState() {
    return this.peerConnection ? this.peerConnection.signalingState : 'closed';
  }
  
  isDataChannelOpen(channelLabel) {
    const channel = this.dataChannels.get(channelLabel);
    return channel ? channel.readyState === 'open' : false;
  }
  
  // Enhanced stream management methods
  async replaceVideoTrack(newVideoTrack) {
    if (!this.peerConnection || !newVideoTrack) return false;
    
    try {
      const senders = this.peerConnection.getSenders();
      const videoSender = senders.find(s => s.track && s.track.kind === 'video');
      
      if (videoSender) {
        await videoSender.replaceTrack(newVideoTrack);
        console.log('✅ Video track replaced');
        return true;
      }
      return false;
    } catch (error) {
      console.error('❌ Error replacing video track:', error);
      return false;
    }
  }
  
  async replaceAudioTrack(newAudioTrack) {
    if (!this.peerConnection || !newAudioTrack) return false;
    
    try {
      const senders = this.peerConnection.getSenders();
      const audioSender = senders.find(s => s.track && s.track.kind === 'audio');
      
      if (audioSender) {
        await audioSender.replaceTrack(newAudioTrack);
        console.log('✅ Audio track replaced');
        return true;
      }
      return false;
    } catch (error) {
      console.error('❌ Error replacing audio track:', error);
      return false;
    }
  }
}

export const createWebRTCManager = (roomId, userId, role, options = {}) => {
  return new WebRTCSignaling(roomId, userId, role, options);
};

// Helper function to create default configuration
export const createDefaultWebRTCManager = (roomId, userId, role, eventHandlers = {}) => {
  return createWebRTCManager(roomId, userId, role, {
    onConnectionStateChange: (state) => {
      console.log(`🔗 ${role} connection state:`, state);
      if (eventHandlers.onConnectionStateChange) {
        eventHandlers.onConnectionStateChange(state);
      }
    },
    onIceConnectionStateChange: (state) => {
      console.log(`🧊 ${role} ICE state:`, state);
      if (eventHandlers.onIceConnectionStateChange) {
        eventHandlers.onIceConnectionStateChange(state);
      }
    },
    onTrack: (event) => {
      console.log(`🎥 ${role} received track:`, event.track.kind);
      if (eventHandlers.onTrack) {
        eventHandlers.onTrack(event);
      }
    },
    onMessage: (data) => {
      console.log(`📨 ${role} received message:`, data.type, data.fromDataChannel ? '(data channel)' : '(signaling)');
      if (eventHandlers.onMessage) {
        eventHandlers.onMessage(data);
      }
    },
    onError: (error) => {
      console.error(`❌ ${role} error:`, error);
      if (eventHandlers.onError) {
        eventHandlers.onError(error);
      }
    },
    onOpen: () => {
      console.log(`✅ ${role} signaling connected`);
      if (eventHandlers.onOpen) {
        eventHandlers.onOpen();
      }
    },
    onClose: (event) => {
      console.log(`🔌 ${role} signaling closed:`, event.code, event.reason);
      if (eventHandlers.onClose) {
        eventHandlers.onClose(event);
      }
    },
    onDataChannel: (channel) => {
      console.log(`💬 ${role} data channel event:`, channel.label);
      if (eventHandlers.onDataChannel) {
        eventHandlers.onDataChannel(channel);
      }
    },
    onParticipantJoined: (data) => {
      console.log(`👤 ${role} participant joined:`, data.participantId);
      if (eventHandlers.onParticipantJoined) {
        eventHandlers.onParticipantJoined(data);
      }
    },
    onInterviewerJoined: (data) => {
      console.log(`🎯 ${role} interviewer joined:`, data.interviewerId);
      if (eventHandlers.onInterviewerJoined) {
        eventHandlers.onInterviewerJoined(data);
      }
    },
    onPeerDisconnected: (data) => {
      console.log(`👋 ${role} peer disconnected:`, data.role, data.senderId);
      if (eventHandlers.onPeerDisconnected) {
        eventHandlers.onPeerDisconnected(data);
      }
    },
    ...eventHandlers
  });
};

export default WebRTCSignaling;