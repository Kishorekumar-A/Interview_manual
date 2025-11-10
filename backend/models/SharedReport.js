import mongoose from 'mongoose';

const sharedReportSchema = new mongoose.Schema({
  // Report identification
  shareId: {
    type: String,
    required: true,
    unique: true,
    default: () => `share_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
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
  
  // Sharing information
  recipient: {
    type: String,
    required: true,
    index: true
  },
  recipientType: {
    type: String,
    enum: ['participant', 'interviewer', 'admin', 'hr'],
    default: 'participant'
  },
  recipientEmail: {
    type: String,
    trim: true,
    lowercase: true,
    sparse: true
  },
  
  // Sender information
  sender: {
    type: String,
    required: true,
    default: 'system'
  },
  senderType: {
    type: String,
    enum: ['interviewer', 'system', 'admin'],
    default: 'system'
  },
  
  // Report data (embedded or referenced)
  reportData: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },
  
  // Reference to the original report if stored separately
  originalReportId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Report',
    index: true
  },
  
  // Sharing metadata
  sharedAt: {
    type: Date,
    required: true,
    default: Date.now,
    index: true
  },
  expiresAt: {
    type: Date,
    default: function() {
      // Default expiry 30 days from sharing
      const expiry = new Date();
      expiry.setDate(expiry.getDate() + 30);
      return expiry;
    },
    index: true
  },
  
  // Access and status
  accessToken: {
    type: String,
    unique: true,
    sparse: true
  },
  status: {
    type: String,
    enum: ['active', 'expired', 'revoked', 'viewed', 'downloaded'],
    default: 'active',
    index: true
  },
  
  // Viewing and download tracking
  viewed: {
    type: Boolean,
    default: false
  },
  viewedAt: {
    type: Date
  },
  viewCount: {
    type: Number,
    default: 0
  },
  downloaded: {
    type: Boolean,
    default: false
  },
  downloadedAt: {
    type: Date
  },
  downloadCount: {
    type: Number,
    default: 0
  },
  
  // Security and permissions
  isPublic: {
    type: Boolean,
    default: false
  },
  passwordProtected: {
    type: Boolean,
    default: false
  },
  accessPassword: {
    type: String,
    select: false // Don't include in queries by default
  },
  
  // Notification settings
  notificationSent: {
    type: Boolean,
    default: false
  },
  notificationMethod: {
    type: String,
    enum: ['email', 'in_app', 'both', 'none'],
    default: 'in_app'
  },
  notificationSentAt: {
    type: Date
  },
  
  // Optional: Custom message for the recipient
  shareMessage: {
    type: String,
    maxlength: 500
  },
  
  // Analytics and tracking
  metadata: {
    ipAddress: String,
    userAgent: String,
    deviceType: String,
    lastAccessedFrom: String
  }
}, {
  timestamps: true, // Adds createdAt and updatedAt automatically
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for efficient querying
sharedReportSchema.index({ sessionId: 1, recipient: 1 });
sharedReportSchema.index({ roomId: 1, status: 1 });
sharedReportSchema.index({ sharedAt: -1 });
sharedReportSchema.index({ expiresAt: 1 });
sharedReportSchema.index({ status: 1, expiresAt: 1 });

// Virtual for checking if report is expired
sharedReportSchema.virtual('isExpired').get(function() {
  return this.expiresAt && new Date() > this.expiresAt;
});

// Virtual for checking if report is active
sharedReportSchema.virtual('isActive').get(function() {
  return this.status === 'active' && !this.isExpired;
});

// Virtual for days until expiry
sharedReportSchema.virtual('daysUntilExpiry').get(function() {
  if (!this.expiresAt) return null;
  const now = new Date();
  const diffTime = this.expiresAt - now;
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
});

// Pre-save middleware to update status if expired
sharedReportSchema.pre('save', function(next) {
  if (this.isExpired && this.status === 'active') {
    this.status = 'expired';
  }
  next();
});

// Static method to find active shared reports for a recipient
sharedReportSchema.statics.findActiveForRecipient = function(recipient) {
  return this.find({
    recipient,
    status: 'active',
    expiresAt: { $gt: new Date() }
  }).sort({ sharedAt: -1 });
};

// Static method to find shared reports by session
sharedReportSchema.statics.findBySession = function(sessionId) {
  return this.find({ sessionId }).sort({ sharedAt: -1 });
};

// Static method to get sharing statistics
sharedReportSchema.statics.getSharingStatistics = async function(sessionId = null) {
  const matchStage = sessionId ? { sessionId } : {};
  
  const stats = await this.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
        totalViews: { $sum: '$viewCount' },
        totalDownloads: { $sum: '$downloadCount' },
        avgViews: { $avg: '$viewCount' },
        avgDownloads: { $avg: '$downloadCount' }
      }
    }
  ]);
  
  return stats;
};

// Instance method to mark as viewed
sharedReportSchema.methods.markAsViewed = function(metadata = {}) {
  this.viewed = true;
  this.viewedAt = new Date();
  this.viewCount += 1;
  
  // Update metadata if provided
  if (metadata.ipAddress) this.metadata.ipAddress = metadata.ipAddress;
  if (metadata.userAgent) this.metadata.userAgent = metadata.userAgent;
  if (metadata.deviceType) this.metadata.deviceType = metadata.deviceType;
  
  if (this.status === 'active') {
    this.status = 'viewed';
  }
  
  return this.save();
};

// Instance method to mark as downloaded
sharedReportSchema.methods.markAsDownloaded = function(metadata = {}) {
  this.downloaded = true;
  this.downloadedAt = new Date();
  this.downloadCount += 1;
  
  // Update metadata if provided
  if (metadata.ipAddress) this.metadata.ipAddress = metadata.ipAddress;
  if (metadata.userAgent) this.metadata.userAgent = metadata.userAgent;
  
  if (this.status === 'active' || this.status === 'viewed') {
    this.status = 'downloaded';
  }
  
  return this.save();
};

// Instance method to revoke access
sharedReportSchema.methods.revokeAccess = function() {
  this.status = 'revoked';
  this.expiresAt = new Date(); // Immediate expiry
  return this.save();
};

// Instance method to extend expiry
sharedReportSchema.methods.extendExpiry = function(days = 30) {
  const newExpiry = new Date();
  newExpiry.setDate(newExpiry.getDate() + days);
  this.expiresAt = newExpiry;
  
  if (this.status === 'expired') {
    this.status = 'active';
  }
  
  return this.save();
};

// Instance method to check access permission
sharedReportSchema.methods.canAccess = function(password = null) {
  if (this.status === 'revoked' || this.isExpired) {
    return false;
  }
  
  if (this.passwordProtected) {
    return this.accessPassword === password;
  }
  
  return true;
};

// Method to generate access token
sharedReportSchema.methods.generateAccessToken = function() {
  const token = require('crypto').randomBytes(32).toString('hex');
  this.accessToken = token;
  return token;
};

// Method to validate access token
sharedReportSchema.methods.validateAccessToken = function(token) {
  return this.accessToken === token;
};

const SharedReport = mongoose.model('SharedReport', sharedReportSchema);

export default SharedReport;