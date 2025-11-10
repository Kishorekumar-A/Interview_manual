import mongoose from 'mongoose';

const reportSchema = new mongoose.Schema({
  // Report identification
  reportId: {
    type: String,
    required: true,
    unique: true,
    default: () => `report_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  },
  
  // Session and room context
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
  
  // Report data
  reportData: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },
  
  // Generation metadata
  generatedAt: {
    type: Date,
    required: true,
    default: Date.now,
    index: true
  },
  
  // Report type and version
  reportType: {
    type: String,
    enum: ['full', 'summary', 'ai_analysis', 'chat_transcript'],
    default: 'full'
  },
  version: {
    type: String,
    default: '1.0'
  },
  
  // Status and access
  status: {
    type: String,
    enum: ['generated', 'published', 'archived'],
    default: 'generated'
  },
  
  // Optional: Storage reference for large reports
  storagePath: {
    type: String
  },
  
  // Optional: Report generation parameters
  generationParams: {
    includeChat: { type: Boolean, default: true },
    includeAiMetrics: { type: Boolean, default: true },
    includeRecommendations: { type: Boolean, default: true },
    format: { type: String, default: 'json' }
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes
reportSchema.index({ sessionId: 1, generatedAt: -1 });
reportSchema.index({ roomId: 1, status: 1 });

// Virtual for report age
reportSchema.virtual('ageInDays').get(function() {
  const now = new Date();
  const diffTime = now - this.generatedAt;
  return Math.floor(diffTime / (1000 * 60 * 60 * 24));
});

const Report = mongoose.model('Report', reportSchema);

export default Report;