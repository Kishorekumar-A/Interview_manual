import mongoose from 'mongoose';

const sessionSchema = new mongoose.Schema({
  sessionId: {
    type: String,
    required: true,
    unique: true
  },
  roomId: {
    type: String,
    required: true
  },
  userId: {
    type: String, // Changed to String
    required: true
  },
  userType: {
    type: String,
    enum: ['interviewer', 'participant'],
    required: true
  },
  startedAt: {
    type: Date,
    default: Date.now
  },
  endedAt: {
    type: Date
  },
  duration: {
    type: Number, // in seconds
    default: 0
  },
  status: {
    type: String,
    enum: ['active', 'ended', 'interrupted'],
    default: 'active'
  },
  // Session statistics
  statistics: {
    totalDetections: { type: Number, default: 0 },
    averageAttentionScore: { type: Number, default: 0 },
    averageEmotionScore: { type: Number, default: 0 },
    alertCount: { type: Number, default: 0 }
  }
}, {
  timestamps: true
});

sessionSchema.index({ roomId: 1, userId: 1 });
sessionSchema.index({ sessionId: 1 });
sessionSchema.index({ status: 1 });

export default mongoose.model('Session', sessionSchema);