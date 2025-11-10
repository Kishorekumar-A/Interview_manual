import mongoose from 'mongoose';

const participantSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  joinedAt: {
    type: Date,
    default: Date.now
  },
  leftAt: {
    type: Date
  },
  isActive: {
    type: Boolean,
    default: true
  },
  streamActive: {
    type: Boolean,
    default: false
  }
});

const roomSchema = new mongoose.Schema({
  roomId: {
    type: String,
    required: true,
    unique: true
  },
  password: {
    type: String,
    required: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  title: {
    type: String,
    default: 'Interview Room'
  },
  description: {
    type: String
  },
  isActive: {
    type: Boolean,
    default: true
  },
  startedAt: {
    type: Date
  },
  endedAt: {
    type: Date
  },
  participants: [participantSchema],
  settings: {
    maxParticipants: {
      type: Number,
      default: 10
    },
    allowScreenShare: {
      type: Boolean,
      default: true
    },
    recordingEnabled: {
      type: Boolean,
      default: false
    },
    aiMonitoring: {
      type: Boolean,
      default: true
    }
  }
}, {
  timestamps: true
});

// Index for faster queries
roomSchema.index({ roomId: 1 });
roomSchema.index({ createdBy: 1 });
roomSchema.index({ isActive: 1 });

export default mongoose.model('Room', roomSchema);