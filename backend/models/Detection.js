import mongoose from 'mongoose';

const detectionSchema = new mongoose.Schema({
  sessionId: {
    type: String,
    required: true,
    index: true
  },
  roomId: {
    type: String,
    required: true,
    index: true
  },
  userId: {
    type: String, // Changed to String since we're using simple IDs
    required: true
  },
  timestamp: {
    type: Date,
    default: Date.now,
    index: true
  },
  // AI Detection Results
  faces: {
    type: Number,
    default: 0
  },
  eye_moves: {
    type: Number,
    default: 0
  },
  face_alert: {
    type: String,
    default: ""
  },
  gender: {
    type: String,
    default: "Unknown"
  },
  mood: {
    type: String,
    default: "neutral"
  },
  bg_voice: {
    type: Boolean,
    default: false
  },
  lipsync: {
    type: Boolean,
    default: false
  },
  verification: {
    type: String,
    default: "Not set"
  },
  speech: {
    type: Boolean,
    default: false
  },
  mouth_ratio: {
    type: Number,
    default: 0
  },
  interview_active: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

// Compound indexes for efficient querying
detectionSchema.index({ sessionId: 1, timestamp: -1 });
detectionSchema.index({ roomId: 1, timestamp: -1 });

export default mongoose.model('Detection', detectionSchema);