import mongoose from 'mongoose';

const chatMessageSchema = new mongoose.Schema({
  // Message identification
  messageId: {
    type: String,
    required: true,
    unique: true,
    default: () => `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  },
  
  // Room and session context
  roomId: {
    type: String,
    required: true,
    index: true
  },
  sessionId: {
    type: String,
    required: true,
    index: true
  },
  
  // Message content
  text: {
    type: String,
    required: true,
    trim: true,
    maxlength: 1000
  },
  
  // Sender information
  sender: {
    type: String,
    required: true,
    enum: ['interviewer', 'participant'],
    index: true
  },
  userId: {
    type: String,
    required: true
  },
  
  // Message metadata
  timestamp: {
    type: Date,
    required: true,
    default: Date.now,
    index: true
  },
  
  // Message status
  status: {
    type: String,
    enum: ['sent', 'delivered', 'read'],
    default: 'sent'
  },
  
  // Message type for future extensions
  type: {
    type: String,
    enum: ['text', 'system', 'alert', 'question', 'answer'],
    default: 'text'
  },
  
  // Optional: For message reactions or replies
  replyTo: {
    type: String, // messageId of the message being replied to
    default: null
  },
  
  // Optional: Message metadata for analytics
  metadata: {
    wordCount: Number,
    containsQuestion: Boolean,
    sentiment: {
      type: String,
      enum: ['positive', 'negative', 'neutral'],
      default: 'neutral'
    },
    language: {
      type: String,
      default: 'en'
    }
  }
}, {
  timestamps: true, // Adds createdAt and updatedAt automatically
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Index for efficient querying
chatMessageSchema.index({ roomId: 1, timestamp: 1 });
chatMessageSchema.index({ sessionId: 1, timestamp: 1 });
chatMessageSchema.index({ sender: 1, timestamp: 1 });
chatMessageSchema.index({ roomId: 1, sender: 1, timestamp: 1 });

// Virtual for formatted timestamp
chatMessageSchema.virtual('formattedTime').get(function() {
  return this.timestamp.toLocaleTimeString('en-US', {
    hour12: true,
    hour: '2-digit',
    minute: '2-digit'
  });
});

// Virtual for date (without time)
chatMessageSchema.virtual('messageDate').get(function() {
  return this.timestamp.toISOString().split('T')[0];
});

// Pre-save middleware to calculate metadata
chatMessageSchema.pre('save', function(next) {
  // Calculate word count
  if (this.text && this.isModified('text')) {
    this.metadata = this.metadata || {};
    this.metadata.wordCount = this.text.trim().split(/\s+/).length;
    this.metadata.containsQuestion = /[?]/.test(this.text);
  }
  next();
});

// Static method to get messages by room with pagination
chatMessageSchema.statics.getRoomMessages = async function(roomId, limit = 100, skip = 0) {
  return this.find({ roomId })
    .sort({ timestamp: 1 })
    .skip(skip)
    .limit(limit)
    .lean();
};

// Static method to get participant messages for a session
chatMessageSchema.statics.getParticipantMessages = async function(sessionId) {
  return this.find({ 
    sessionId, 
    sender: 'participant' 
  }).sort({ timestamp: 1 }).lean();
};

// Static method to get interviewer messages for a session
chatMessageSchema.statics.getInterviewerMessages = async function(sessionId) {
  return this.find({ 
    sessionId, 
    sender: 'interviewer' 
  }).sort({ timestamp: 1 }).lean();
};

// Static method to get message statistics for a room
chatMessageSchema.statics.getRoomStatistics = async function(roomId) {
  const stats = await this.aggregate([
    { $match: { roomId } },
    {
      $group: {
        _id: '$sender',
        messageCount: { $sum: 1 },
        totalWords: { $sum: '$metadata.wordCount' },
        avgWordsPerMessage: { $avg: '$metadata.wordCount' },
        firstMessage: { $min: '$timestamp' },
        lastMessage: { $max: '$timestamp' }
      }
    }
  ]);
  
  return stats.reduce((acc, stat) => {
    acc[stat._id] = stat;
    return acc;
  }, {});
};

// Instance method to mark message as delivered
chatMessageSchema.methods.markAsDelivered = function() {
  this.status = 'delivered';
  return this.save();
};

// Instance method to mark message as read
chatMessageSchema.methods.markAsRead = function() {
  this.status = 'read';
  return this.save();
};

// Method to check if message is from interviewer
chatMessageSchema.methods.isFromInterviewer = function() {
  return this.sender === 'interviewer';
};

// Method to check if message is from participant
chatMessageSchema.methods.isFromParticipant = function() {
  return this.sender === 'participant';
};

const ChatMessage = mongoose.model('ChatMessage', chatMessageSchema);

export default ChatMessage;