import express from 'express';
import Detection from '../models/Detection.js';
import Session from '../models/Session.js';
import Report from '../models/Report.js';
import ChatMessage from '../models/ChatMessage.js';
import SharedReport from '../models/SharedReport.js';

const router = express.Router();

// Save detection data with enhanced logging
router.post('/save', async (req, res) => {
  try {
    console.log('📥 Received detection data:', JSON.stringify(req.body, null, 2));
    
    const detectionData = req.body;
    
    // Validate required fields
    if (!detectionData.sessionId || !detectionData.roomId || !detectionData.userId) {
      console.error('❌ Missing required fields:', {
        sessionId: detectionData.sessionId,
        roomId: detectionData.roomId,
        userId: detectionData.userId
      });
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: sessionId, roomId, and userId are required'
      });
    }

    const detection = new Detection(detectionData);
    await detection.save();
    
    console.log('✅ Detection saved successfully with ID:', detection._id);

    // Update session statistics
    await Session.findOneAndUpdate(
      { sessionId: detectionData.sessionId },
      { 
        $inc: { 
          'statistics.totalDetections': 1,
          'statistics.eyeMovements': detectionData.eye_moves || 0,
          'statistics.facesDetected': detectionData.faces || 0
        },
        $set: {
          'statistics.lastDetection': new Date()
        }
      }
    );

    res.json({
      success: true,
      message: 'Detection data saved successfully',
      detectionId: detection._id
    });
  } catch (error) {
    console.error('❌ Save detection error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
});

// Create new session with enhanced logging
router.post('/session/start', async (req, res) => {
  try {
    console.log('📥 Starting new session:', req.body);
    
    const { sessionId, roomId, userId, userType } = req.body;

    // Validate required fields
    if (!sessionId || !roomId || !userId || !userType) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: sessionId, roomId, userId, and userType are required'
      });
    }

    // Check if session already exists
    const existingSession = await Session.findOne({ sessionId });
    if (existingSession) {
      return res.status(400).json({
        success: false,
        message: 'Session already exists'
      });
    }

    const session = new Session({
      sessionId,
      roomId,
      userId,
      userType,
      statistics: {
        totalDetections: 0,
        eyeMovements: 0,
        facesDetected: 0,
        lastDetection: null
      }
    });

    await session.save();
    console.log('✅ Session started successfully:', sessionId);

    res.json({
      success: true,
      message: 'Session started successfully',
      session
    });
  } catch (error) {
    console.error('❌ Start session error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
});

// End session
router.post('/session/end', async (req, res) => {
  try {
    const { sessionId } = req.body;
    console.log('📥 Ending session:', sessionId);

    const session = await Session.findOne({ sessionId });
    if (!session) {
      return res.status(404).json({
        success: false,
        message: 'Session not found'
      });
    }

    const endedAt = new Date();
    const duration = Math.floor((endedAt - new Date(session.startedAt)) / 1000);

    session.endedAt = endedAt;
    session.status = 'ended';
    session.duration = duration;
    await session.save();

    console.log('✅ Session ended successfully:', sessionId);

    res.json({
      success: true,
      message: 'Session ended successfully',
      session
    });
  } catch (error) {
    console.error('❌ End session error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
});

// Generate comprehensive final report
router.post('/generate-report', async (req, res) => {
  try {
    const { sessionId, roomId, includeChat = true, includeAiMetrics = true, duration, sessionStartTime, sessionEndTime, aiResults, chatMessages } = req.body;
    
    console.log('📊 Generating report for session:', sessionId);

    // Get session data
    const session = await Session.findOne({ sessionId });
    if (!session) {
      return res.status(404).json({
        success: false,
        message: 'Session not found'
      });
    }

    // Get all detection data for this session
    const detections = await Detection.find({ sessionId }).sort({ timestamp: 1 });
    
    // Get chat messages if included
    let chatData = [];
    if (includeChat) {
      chatData = await ChatMessage.find({ roomId }).sort({ timestamp: 1 });
    }

    // Calculate comprehensive metrics
    const totalEyeMovements = detections.reduce((sum, detection) => sum + (detection.eye_moves || 0), 0);
    const faceVerified = detections.some(detection => detection.verification === 'Verified');
    const speechDetected = detections.some(detection => detection.speech === true);
    const backgroundVoice = detections.some(detection => detection.bg_voice === true);
    const multipleFacesDetected = detections.some(detection => detection.faces > 1);
    
    // Get emotion analysis
    const emotionCounts = {};
    detections.forEach(detection => {
      if (detection.mood && detection.mood !== 'unknown') {
        emotionCounts[detection.mood] = (emotionCounts[detection.mood] || 0) + 1;
      }
    });
    const dominantEmotion = Object.keys(emotionCounts).length > 0 
      ? Object.keys(emotionCounts).reduce((a, b) => emotionCounts[a] > emotionCounts[b] ? a : b)
      : 'neutral';

    // Calculate lip sync quality
    const goodLipSyncCount = detections.filter(d => d.lipsync === true).length;
    const lipSyncQuality = detections.length > 0 
      ? `${Math.round((goodLipSyncCount / detections.length) * 100)}%`
      : 'No data';

    // Calculate attention score based on eye movements and face detection consistency
    const attentionScore = calculateAttentionScore(detections);
    
    // Generate alerts and flags
    const alerts = generateAlerts(detections, session);

    // Generate comprehensive report
    const report = {
      sessionId,
      roomId,
      duration: duration || formatDuration(session.duration),
      generatedAt: new Date(),
      sessionStart: sessionStartTime || session.startedAt,
      sessionEnd: sessionEndTime || session.endedAt || new Date(),
      
      // AI Detection Summary
      faceVerified,
      totalEyeMovements,
      speechDetected,
      backgroundVoice,
      dominantEmotion,
      lipSyncQuality,
      multipleFacesDetected,
      attentionScore,
      
      // Detailed Statistics
      totalDetections: detections.length,
      averageFacesPerDetection: detections.length > 0 
        ? (detections.reduce((sum, d) => sum + (d.faces || 0), 0) / detections.length).toFixed(2)
        : 0,
      backgroundVoicePercentage: detections.length > 0
        ? Math.round((detections.filter(d => d.bg_voice).length / detections.length) * 100)
        : 0,

      // Chat Analysis
      totalMessages: chatData.length,
      interviewerMessages: chatData.filter(m => m.sender === 'interviewer').length,
      participantMessages: chatData.filter(m => m.sender === 'participant').length,
      chatEngagement: calculateChatEngagement(chatData),

      // Alerts & Recommendations
      alerts,
      recommendations: generateRecommendations(detections, alerts, attentionScore),
      
      // Integrity Score
      integrityScore: calculateIntegrityScore(detections, alerts),
      
      // Raw data references
      detectionCount: detections.length,
      chatMessageCount: chatData.length
    };

    // Save report to database
    const savedReport = new Report({
      sessionId,
      roomId,
      reportData: report,
      generatedAt: new Date()
    });
    await savedReport.save();

    console.log('✅ Report generated successfully for session:', sessionId);

    res.json({ 
      success: true, 
      message: 'Report generated successfully',
      report 
    });

  } catch (error) {
    console.error('❌ Generate report error:', error);
    res.status(500).json({
      success: false,
      message: 'Error generating report',
      error: error.message
    });
  }
});

// Download report as PDF
router.post('/download-report', async (req, res) => {
  try {
    const { sessionId, report, roomId } = req.body;
    
    console.log('📥 Downloading report for session:', sessionId);

    // Generate PDF content
    const pdfContent = generatePDFContent(report, roomId);
    
    // For now, return JSON with instructions for frontend PDF generation
    // In production, you would use a PDF library like pdfkit, puppeteer, or jspdf
    
    res.json({
      success: true,
      message: 'PDF generation ready - use frontend PDF library',
      pdfData: {
        content: pdfContent,
        fileName: `interview-report-${roomId}-${new Date().toISOString().split('T')[0]}.pdf`,
        reportData: report
      }
    });

  } catch (error) {
    console.error('❌ Download report error:', error);
    res.status(500).json({
      success: false,
      message: 'Error generating PDF',
      error: error.message
    });
  }
});

// Share report with participant
router.post('/share-report', async (req, res) => {
  try {
    const { sessionId, roomId, report, recipient, sender } = req.body;
    
    console.log(`📤 Sharing report with ${recipient} for session:`, sessionId);

    // Store shared report
    const sharedReport = new SharedReport({
      sessionId,
      roomId,
      recipient,
      sender: sender || 'system',
      reportData: report,
      sharedAt: new Date()
    });
    await sharedReport.save();

    // Here you would typically:
    // 1. Send email notification to participant
    // 2. Store in participant's accessible location
    // 3. Trigger notification in the application
    
    console.log('✅ Report shared successfully with:', recipient);

    res.json({ 
      success: true, 
      message: `Report shared successfully with ${recipient}`,
      sharedReportId: sharedReport._id
    });

  } catch (error) {
    console.error('❌ Share report error:', error);
    res.status(500).json({
      success: false,
      message: 'Error sharing report',
      error: error.message
    });
  }
});

// Get report by session ID
router.get('/report/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    
    const report = await Report.findOne({ sessionId }).sort({ generatedAt: -1 });
    
    if (!report) {
      return res.status(404).json({
        success: false,
        message: 'Report not found for this session'
      });
    }

    res.json({
      success: true,
      report: report.reportData
    });

  } catch (error) {
    console.error('❌ Get report error:', error);
    res.status(500).json({
      success: false,
      message: 'Error retrieving report',
      error: error.message
    });
  }
});

// Get shared reports for participant
router.get('/shared-reports/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    
    const sharedReports = await SharedReport.find({ 
      $or: [
        { recipient: userId },
        { recipient: 'participant' }
      ]
    }).sort({ sharedAt: -1 });

    res.json({
      success: true,
      sharedReports
    });

  } catch (error) {
    console.error('❌ Get shared reports error:', error);
    res.status(500).json({
      success: false,
      message: 'Error retrieving shared reports',
      error: error.message
    });
  }
});

// Helper functions
function calculateAttentionScore(detections) {
  if (detections.length === 0) return 100;
  
  const totalDetections = detections.length;
  const goodFocusDetections = detections.filter(d => 
    (d.eye_moves || 0) < 3 && 
    (d.faces || 0) === 1 && 
    !d.bg_voice
  ).length;
  
  return Math.round((goodFocusDetections / totalDetections) * 100);
}

function generateAlerts(detections, session) {
  const alerts = [];

  // Multiple faces alert
  const multipleFaces = detections.some(d => d.faces > 1);
  if (multipleFaces) {
    alerts.push('Multiple faces detected during the session - possible unauthorized person present');
  }

  // High eye movement alert
  const avgEyeMoves = detections.reduce((sum, d) => sum + (d.eye_moves || 0), 0) / detections.length;
  if (avgEyeMoves > 8) {
    alerts.push('High frequency of eye movements detected - potential distraction or looking away from screen');
  }

  // Background voice alert
  const backgroundVoiceCount = detections.filter(d => d.bg_voice).length;
  if (backgroundVoiceCount > detections.length * 0.15) {
    alerts.push('Background voices detected multiple times - environment may not be private');
  }

  // Face verification issues
  const verifiedCount = detections.filter(d => d.verification === 'Verified').length;
  if (verifiedCount < detections.length * 0.7) {
    alerts.push('Face verification inconsistent - participant may have left camera view multiple times');
  }

  // No face detected
  const noFaceCount = detections.filter(d => d.faces === 0).length;
  if (noFaceCount > detections.length * 0.3) {
    alerts.push('Extended periods without face detection - camera may have been covered or participant left');
  }

  return alerts;
}

function generateRecommendations(detections, alerts, attentionScore) {
  const recommendations = [];

  if (attentionScore < 70) {
    recommendations.push('Consider follow-up assessment due to lower attention score');
  }

  if (alerts.length > 2) {
    recommendations.push('Multiple integrity flags detected - recommend manual review of session recording');
  }

  const backgroundVoicePercentage = detections.length > 0 
    ? (detections.filter(d => d.bg_voice).length / detections.length) * 100
    : 0;

  if (backgroundVoicePercentage > 20) {
    recommendations.push('Suggest conducting future interviews in a quieter, more private environment');
  }

  if (detections.some(d => d.faces > 1)) {
    recommendations.push('Verify that participant was alone during the interview session');
  }

  return recommendations;
}

function calculateIntegrityScore(detections, alerts) {
  let score = 100;
  
  // Deduct points based on alerts
  score -= alerts.length * 10;
  
  // Deduct points for multiple faces
  const multipleFacesCount = detections.filter(d => d.faces > 1).length;
  score -= (multipleFacesCount / detections.length) * 20;
  
  // Deduct points for high eye movements
  const avgEyeMoves = detections.reduce((sum, d) => sum + (d.eye_moves || 0), 0) / detections.length;
  if (avgEyeMoves > 5) score -= 10;
  
  return Math.max(0, Math.round(score));
}

function calculateChatEngagement(chatMessages) {
  if (chatMessages.length === 0) return 'No chat activity';
  
  const participantMessages = chatMessages.filter(m => m.sender === 'participant').length;
  const engagementRatio = participantMessages / chatMessages.length;
  
  if (engagementRatio > 0.4) return 'High engagement';
  if (engagementRatio > 0.2) return 'Moderate engagement';
  return 'Low engagement';
}

function formatDuration(seconds) {
  if (!seconds) return "00:00:00";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

function generatePDFContent(report, roomId) {
  // This would generate the actual PDF content using a PDF library
  // For now, return a structured object that can be used by frontend
  return {
    title: `Interview Report - Room ${roomId}`,
    sections: [
      {
        title: 'Session Information',
        content: [
          `Room ID: ${report.roomId}`,
          `Session ID: ${report.sessionId}`,
          `Duration: ${report.duration}`,
          `Generated: ${new Date(report.generatedAt).toLocaleString()}`
        ]
      },
      {
        title: 'AI Detection Summary',
        content: [
          `Face Verification: ${report.faceVerified ? '✅ Verified' : '❌ Not Verified'}`,
          `Total Eye Movements: ${report.totalEyeMovements}`,
          `Speech Detected: ${report.speechDetected ? '✅ Yes' : '❌ No'}`,
          `Background Voice: ${report.backgroundVoice ? '⚠️ Detected' : '✅ None'}`,
          `Dominant Emotion: ${report.dominantEmotion}`,
          `Lip Sync Quality: ${report.lipSyncQuality}`,
          `Attention Score: ${report.attentionScore}%`,
          `Integrity Score: ${report.integrityScore}%`
        ]
      },
      {
        title: 'Chat Summary',
        content: [
          `Total Messages: ${report.totalMessages}`,
          `Interviewer Messages: ${report.interviewerMessages}`,
          `Participant Messages: ${report.participantMessages}`,
          `Chat Engagement: ${report.chatEngagement}`
        ]
      }
    ]
  };
}

// Debug endpoint to check sessions and detections
router.get('/debug', async (req, res) => {
  try {
    const sessions = await Session.find().sort({ createdAt: -1 }).limit(5);
    const detections = await Detection.find().sort({ createdAt: -1 }).limit(5);
    const reports = await Report.find().sort({ generatedAt: -1 }).limit(3);
    const sharedReports = await SharedReport.find().sort({ sharedAt: -1 }).limit(3);
    
    res.json({
      success: true,
      sessionsCount: await Session.countDocuments(),
      detectionsCount: await Detection.countDocuments(),
      reportsCount: await Report.countDocuments(),
      sharedReportsCount: await SharedReport.countDocuments(),
      recentSessions: sessions,
      recentDetections: detections,
      recentReports: reports,
      recentSharedReports: sharedReports
    });
  } catch (error) {
    console.error('Debug error:', error);
    res.status(500).json({
      success: false,
      message: 'Debug error',
      error: error.message
    });
  }
});

export default router;