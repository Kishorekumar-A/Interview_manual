import React from 'react';
import './ReportModal.css';

function ReportModal({ 
  showReportModal, 
  setShowReportModal, 
  finalReport, 
  currentSessionId, 
  room, 
  aiResults, 
  messages, 
  sessionStartTime,
  calculateDuration,
  downloadReport,
  sendReportToParticipant 
}) {
  if (!showReportModal || !finalReport) return null;

  // Enhanced AI metrics calculation based on actual performance
  const calculateAIMetrics = () => {
    const metrics = {
      faceVerification: 0,
      eyeContact: 0,
      speechEngagement: 0,
      backgroundNoise: 0,
      lipSync: 0,
      emotionalStability: 0,
      responseTime: 0,
      participation: 0
    };

    // Face Verification Score (20 points)
    if (finalReport.faceVerified) {
      metrics.faceVerification = 20;
    } else if (finalReport.faceVerification === 'partial') {
      metrics.faceVerification = 10;
    }

    // Eye Contact Score (20 points)
    const eyeMoves = finalReport.totalEyeMovements || aiResults.eye_moves || 0;
    if (eyeMoves <= 5) metrics.eyeContact = 20;        // Excellent
    else if (eyeMoves <= 15) metrics.eyeContact = 15;  // Good
    else if (eyeMoves <= 30) metrics.eyeContact = 10;  // Average
    else metrics.eyeContact = 5;                       // Poor

    // Speech Engagement Score (15 points)
    if (finalReport.speechDetected) {
      const speechDuration = finalReport.speechDuration || 0;
      const totalDuration = finalReport.totalDuration || 1;
      const speechRatio = speechDuration / totalDuration;
      
      if (speechRatio > 0.3) metrics.speechEngagement = 15;    // High engagement
      else if (speechRatio > 0.15) metrics.speechEngagement = 10; // Moderate
      else metrics.speechEngagement = 5;                       // Low
    }

    // Background Noise Score (15 points)
    const backgroundNoiseLevel = finalReport.backgroundNoiseLevel || 
                                (finalReport.backgroundVoice ? 1 : 0);
    if (backgroundNoiseLevel === 0) metrics.backgroundNoise = 15;        // No noise
    else if (backgroundNoiseLevel <= 0.3) metrics.backgroundNoise = 10;  // Low noise
    else if (backgroundNoiseLevel <= 0.6) metrics.backgroundNoise = 5;   // Moderate noise
    else metrics.backgroundNoise = 0;                                   // High noise

    // Lip Sync Quality Score (10 points)
    const lipSyncQuality = finalReport.lipSyncQuality || (aiResults.lipsync ? "Good" : "Poor");
    if (lipSyncQuality === "Excellent") metrics.lipSync = 10;
    else if (lipSyncQuality === "Good") metrics.lipSync = 8;
    else if (lipSyncQuality === "Fair") metrics.lipSync = 5;
    else metrics.lipSync = 2;

    // Emotional Stability Score (10 points)
    const dominantEmotion = finalReport.dominantEmotion || aiResults.mood || "neutral";
    const emotionScores = {
      "happy": 10, "confident": 9, "neutral": 7, "focused": 8,
      "surprised": 6, "sad": 4, "angry": 3, "fearful": 4
    };
    metrics.emotionalStability = emotionScores[dominantEmotion.toLowerCase()] || 5;

    // Response Time Score (5 points)
    const avgResponseTime = finalReport.avgResponseTime || 0;
    if (avgResponseTime <= 3) metrics.responseTime = 5;      // Fast responder
    else if (avgResponseTime <= 8) metrics.responseTime = 3; // Average
    else metrics.responseTime = 1;                          // Slow responder

    // Participation Score (5 points)
    const totalMessages = finalReport.totalMessages || messages.length;
    const participantMessages = finalReport.participantMessages || 
                              messages.filter(m => m.sender === 'participant').length;
    const participationRate = totalMessages > 0 ? participantMessages / totalMessages : 0;
    
    if (participationRate >= 0.5) metrics.participation = 5;    // High participation
    else if (participationRate >= 0.3) metrics.participation = 3; // Moderate
    else metrics.participation = 1;                             // Low

    return metrics;
  };

  // Calculate overall score based on enhanced metrics
  const calculateOverallScore = () => {
    const metrics = calculateAIMetrics();
    const totalScore = Object.values(metrics).reduce((sum, score) => sum + score, 0);
    return Math.min(100, Math.round(totalScore));
  };

  // Determine selection status based on metrics
  const determineSelectionStatus = () => {
    const overallScore = calculateOverallScore();
    const metrics = calculateAIMetrics();
    
    // Critical factors that could lead to automatic rejection
    const criticalFailures = [];
    
    if (metrics.faceVerification < 10) {
      criticalFailures.push("Face verification failed");
    }
    
    if (metrics.eyeContact < 5) {
      criticalFailures.push("Very poor eye contact");
    }
    
    if (metrics.speechEngagement < 5) {
      criticalFailures.push("Minimal speech engagement");
    }
    
    if (metrics.backgroundNoise < 5) {
      criticalFailures.push("Poor environment quality");
    }
    
    if (metrics.participation < 2) {
      criticalFailures.push("Very low participation");
    }

    // Automatic rejection for critical failures
    if (criticalFailures.length > 2) {
      return {
        status: 'rejected',
        label: 'Not Selected',
        color: '#ef4444',
        icon: '❌',
        reasons: criticalFailures,
        type: 'auto-reject'
      };
    }

    // Score-based selection
    if (overallScore >= 75) {
      return {
        status: 'selected',
        label: 'Selected',
        color: '#10b981',
        icon: '✅',
        reasons: ['Excellent overall performance across all metrics'],
        type: 'high-score'
      };
    } else if (overallScore >= 60) {
      return {
        status: 'selected',
        label: 'Conditionally Selected',
        color: '#f59e0b',
        icon: '⚠️',
        reasons: ['Good performance with some areas for improvement'],
        type: 'conditional'
      };
    } else if (overallScore >= 45) {
      return {
        status: 'pending',
        label: 'Under Review',
        color: '#6366f1',
        icon: '⏳',
        reasons: ['Moderate performance - requires additional assessment'],
        type: 'review'
      };
    } else {
      return {
        status: 'rejected',
        label: 'Not Selected',
        color: '#ef4444',
        icon: '❌',
        reasons: ['Overall score below minimum threshold'],
        type: 'low-score'
      };
    }
  };

  const overallScore = calculateOverallScore();
  const aiMetrics = calculateAIMetrics();
  const selectionStatus = determineSelectionStatus();

  const getScoreColor = (score) => {
    if (score >= 80) return '#10b981';
    if (score >= 60) return '#f59e0b';
    return '#ef4444';
  };

  const getScoreLabel = (score) => {
    if (score >= 80) return 'Excellent';
    if (score >= 60) return 'Good';
    if (score >= 40) return 'Average';
    return 'Needs Improvement';
  };

  const getMetricColor = (score, maxScore) => {
    const percentage = (score / maxScore) * 100;
    if (percentage >= 80) return '#10b981';
    if (percentage >= 60) return '#f59e0b';
    return '#ef4444';
  };

  // Enhanced recommendations based on detailed metrics
  const generateRecommendations = () => {
    const recommendations = [];
    const metrics = aiMetrics;

    // Selection status based recommendation
    if (selectionStatus.status === 'selected') {
      recommendations.push({
        type: 'success',
        text: `Strong Candidate: ${selectionStatus.type === 'conditional' ? 'Conditionally selected - consider additional technical assessment' : 'Ready for next round'}`,
        priority: 1
      });
    } else if (selectionStatus.status === 'pending') {
      recommendations.push({
        type: 'info',
        text: 'Additional Assessment Required: Consider technical evaluation or second interview',
        priority: 1
      });
    } else {
      recommendations.push({
        type: 'warning',
        text: 'Not Recommended: Does not meet minimum criteria for selection',
        priority: 1
      });
    }

    // Specific metric-based recommendations
    if (metrics.faceVerification < 10) {
      recommendations.push({
        type: 'warning',
        text: 'Face Verification: Ensure proper lighting and camera positioning',
        priority: 2
      });
    }

    if (metrics.eyeContact < 10) {
      recommendations.push({
        type: 'warning',
        text: 'Eye Contact: High eye movement detected - practice maintaining focus',
        priority: 2
      });
    }

    if (metrics.speechEngagement < 8) {
      recommendations.push({
        type: 'info',
        text: 'Verbal Engagement: Encourage more detailed responses in conversation',
        priority: 3
      });
    }

    if (metrics.backgroundNoise < 10) {
      recommendations.push({
        type: 'info',
        text: 'Environment: Background noise detected - recommend quieter setting',
        priority: 3
      });
    }

    if (metrics.emotionalStability < 6) {
      recommendations.push({
        type: 'info',
        text: 'Emotional State: Detected nervousness - consider stress management techniques',
        priority: 3
      });
    }

    if (metrics.participation < 3) {
      recommendations.push({
        type: 'warning',
        text: 'Participation: Low engagement in chat - assess communication skills',
        priority: 2
      });
    }

    return recommendations.sort((a, b) => a.priority - b.priority);
  };

  const recommendations = generateRecommendations();

  return (
    <div className="report-modal-overlay">
      <div className="report-modal professional-report">
        <div className="report-modal-header">
          <div className="header-content">
            <div className="report-title-section">
              <h2>📊 Interview Analysis Report</h2>
              <p className="report-subtitle">Comprehensive candidate evaluation</p>
            </div>
            <button className="close-modal" onClick={() => setShowReportModal(false)}>×</button>
          </div>
        </div>

        <div className="report-content">
          {/* Selection Status Banner */}
          <div className="selection-status-banner" style={{ backgroundColor: selectionStatus.color + '20', borderLeft: `4px solid ${selectionStatus.color}` }}>
            <div className="selection-status-content">
              <div className="status-icon" style={{ color: selectionStatus.color }}>
                {selectionStatus.icon}
              </div>
              <div className="status-details">
                <h3 className="status-title" style={{ color: selectionStatus.color }}>
                  {selectionStatus.label}
                </h3>
                <p className="status-description">
                  {selectionStatus.reasons.join(' • ')}
                </p>
              </div>
            </div>
          </div>

          {/* Overall Score Section */}
          <div className="score-section">
            <div className="score-card">
              <div className="score-circle">
                <div 
                  className="score-progress" 
                  style={{ 
                    background: `conic-gradient(${getScoreColor(overallScore)} ${overallScore * 3.6}deg, #e5e7eb 0deg)` 
                  }}
                >
                  <div className="score-inner">
                    <span className="score-value">{overallScore}</span>
                    <span className="score-label">Overall</span>
                  </div>
                </div>
              </div>
              <div className="score-details">
                <h3 className="score-title">{getScoreLabel(overallScore)} Performance</h3>
                <p className="score-description">
                  Based on AI analysis of engagement, communication, and behavioral metrics
                </p>
                <div className="score-breakdown">
                  <div className="breakdown-item">
                    <span className="breakdown-label">Technical Skills</span>
                    <span className="breakdown-value">To be assessed separately</span>
                  </div>
                  <div className="breakdown-item">
                    <span className="breakdown-label">Communication</span>
                    <span className="breakdown-value">{getScoreLabel(aiMetrics.speechEngagement + aiMetrics.participation)}</span>
                  </div>
                  <div className="breakdown-item">
                    <span className="breakdown-label">Professionalism</span>
                    <span className="breakdown-value">{getScoreLabel(aiMetrics.eyeContact + aiMetrics.emotionalStability)}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Session Information */}
          <div className="report-section">
            <h3 className="section-title">Session Information</h3>
            <div className="info-grid">
              <div className="info-item">
                <span className="info-label">Room ID</span>
                <span className="info-value">{finalReport.roomId || room.id}</span>
              </div>
              <div className="info-item">
                <span className="info-label">Session ID</span>
                <span className="info-value">{finalReport.sessionId || currentSessionId}</span>
              </div>
              <div className="info-item">
                <span className="info-label">Duration</span>
                <span className="info-value">{finalReport.duration || calculateDuration()}</span>
              </div>
              <div className="info-item">
                <span className="info-label">Status</span>
                <span className="info-value" style={{ color: selectionStatus.color, fontWeight: 'bold' }}>
                  {selectionStatus.label}
                </span>
              </div>
            </div>
          </div>

          {/* Detailed AI Metrics */}
          <div className="report-section">
            <h3 className="section-title">Detailed Performance Metrics</h3>
            <div className="detailed-metrics-grid">
              <div className="detailed-metric">
                <div className="metric-header">
                  <span className="metric-title">Face Verification</span>
                  <span 
                    className="metric-score"
                    style={{ color: getMetricColor(aiMetrics.faceVerification, 20) }}
                  >
                    {aiMetrics.faceVerification}/20
                  </span>
                </div>
                <div className="metric-bar">
                  <div 
                    className="metric-progress" 
                    style={{ 
                      width: `${(aiMetrics.faceVerification / 20) * 100}%`,
                      backgroundColor: getMetricColor(aiMetrics.faceVerification, 20)
                    }}
                  ></div>
                </div>
              </div>

              <div className="detailed-metric">
                <div className="metric-header">
                  <span className="metric-title">Eye Contact & Focus</span>
                  <span 
                    className="metric-score"
                    style={{ color: getMetricColor(aiMetrics.eyeContact, 20) }}
                  >
                    {aiMetrics.eyeContact}/20
                  </span>
                </div>
                <div className="metric-bar">
                  <div 
                    className="metric-progress" 
                    style={{ 
                      width: `${(aiMetrics.eyeContact / 20) * 100}%`,
                      backgroundColor: getMetricColor(aiMetrics.eyeContact, 20)
                    }}
                  ></div>
                </div>
                <div className="metric-detail">
                  Eye movements: {finalReport.totalEyeMovements || aiResults.eye_moves || 0}
                </div>
              </div>

              <div className="detailed-metric">
                <div className="metric-header">
                  <span className="metric-title">Speech Engagement</span>
                  <span 
                    className="metric-score"
                    style={{ color: getMetricColor(aiMetrics.speechEngagement, 15) }}
                  >
                    {aiMetrics.speechEngagement}/15
                  </span>
                </div>
                <div className="metric-bar">
                  <div 
                    className="metric-progress" 
                    style={{ 
                      width: `${(aiMetrics.speechEngagement / 15) * 100}%`,
                      backgroundColor: getMetricColor(aiMetrics.speechEngagement, 15)
                    }}
                  ></div>
                </div>
              </div>

              <div className="detailed-metric">
                <div className="metric-header">
                  <span className="metric-title">Environment Quality</span>
                  <span 
                    className="metric-score"
                    style={{ color: getMetricColor(aiMetrics.backgroundNoise, 15) }}
                  >
                    {aiMetrics.backgroundNoise}/15
                  </span>
                </div>
                <div className="metric-bar">
                  <div 
                    className="metric-progress" 
                    style={{ 
                      width: `${(aiMetrics.backgroundNoise / 15) * 100}%`,
                      backgroundColor: getMetricColor(aiMetrics.backgroundNoise, 15)
                    }}
                  ></div>
                </div>
              </div>

              <div className="detailed-metric">
                <div className="metric-header">
                  <span className="metric-title">Audio-Video Sync</span>
                  <span 
                    className="metric-score"
                    style={{ color: getMetricColor(aiMetrics.lipSync, 10) }}
                  >
                    {aiMetrics.lipSync}/10
                  </span>
                </div>
                <div className="metric-bar">
                  <div 
                    className="metric-progress" 
                    style={{ 
                      width: `${(aiMetrics.lipSync / 10) * 100}%`,
                      backgroundColor: getMetricColor(aiMetrics.lipSync, 10)
                    }}
                  ></div>
                </div>
              </div>

              <div className="detailed-metric">
                <div className="metric-header">
                  <span className="metric-title">Emotional Stability</span>
                  <span 
                    className="metric-score"
                    style={{ color: getMetricColor(aiMetrics.emotionalStability, 10) }}
                  >
                    {aiMetrics.emotionalStability}/10
                  </span>
                </div>
                <div className="metric-bar">
                  <div 
                    className="metric-progress" 
                    style={{ 
                      width: `${(aiMetrics.emotionalStability / 10) * 100}%`,
                      backgroundColor: getMetricColor(aiMetrics.emotionalStability, 10)
                    }}
                  ></div>
                </div>
                <div className="metric-detail">
                  Dominant emotion: {finalReport.dominantEmotion || aiResults.mood || 'neutral'}
                </div>
              </div>

              <div className="detailed-metric">
                <div className="metric-header">
                  <span className="metric-title">Response Time</span>
                  <span 
                    className="metric-score"
                    style={{ color: getMetricColor(aiMetrics.responseTime, 5) }}
                  >
                    {aiMetrics.responseTime}/5
                  </span>
                </div>
                <div className="metric-bar">
                  <div 
                    className="metric-progress" 
                    style={{ 
                      width: `${(aiMetrics.responseTime / 5) * 100}%`,
                      backgroundColor: getMetricColor(aiMetrics.responseTime, 5)
                    }}
                  ></div>
                </div>
              </div>

              <div className="detailed-metric">
                <div className="metric-header">
                  <span className="metric-title">Chat Participation</span>
                  <span 
                    className="metric-score"
                    style={{ color: getMetricColor(aiMetrics.participation, 5) }}
                  >
                    {aiMetrics.participation}/5
                  </span>
                </div>
                <div className="metric-bar">
                  <div 
                    className="metric-progress" 
                    style={{ 
                      width: `${(aiMetrics.participation / 5) * 100}%`,
                      backgroundColor: getMetricColor(aiMetrics.participation, 5)
                    }}
                  ></div>
                </div>
                <div className="metric-detail">
                  Messages: {finalReport.participantMessages || messages.filter(m => m.sender === 'participant').length}/
                  {finalReport.totalMessages || messages.length}
                </div>
              </div>
            </div>
          </div>

          {/* Communication Analysis */}
          <div className="report-section">
            <h3 className="section-title">Communication Analysis</h3>
            <div className="chat-metrics">
              <div className="chat-metric">
                <div className="chat-metric-value">{finalReport.totalMessages || messages.length}</div>
                <div className="chat-metric-label">Total Messages</div>
              </div>
              <div className="chat-metric">
                <div className="chat-metric-value">{finalReport.interviewerMessages || messages.filter(m => m.sender === 'interviewer').length}</div>
                <div className="chat-metric-label">Interviewer Messages</div>
              </div>
              <div className="chat-metric">
                <div className="chat-metric-value">{finalReport.participantMessages || messages.filter(m => m.sender === 'participant').length}</div>
                <div className="chat-metric-label">Candidate Messages</div>
              </div>
              <div className="chat-metric">
                <div className="chat-metric-value">
                  {Math.round(((finalReport.participantMessages || messages.filter(m => m.sender === 'participant').length) / 
                  (finalReport.totalMessages || messages.length || 1)) * 100)}%
                </div>
                <div className="chat-metric-label">Candidate Participation</div>
              </div>
            </div>
          </div>

          {/* Recommendations */}
          <div className="report-section">
            <h3 className="section-title">📋 Recommendations & Next Steps</h3>
            <div className="recommendations-list">
              {recommendations.map((rec, index) => (
                <div key={index} className={`recommendation-item ${rec.type}`}>
                  {rec.text}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="report-actions">
          <button className="download-report-btn primary" onClick={downloadReport}>
            <span className="btn-icon">📥</span>
            Download PDF Report
          </button>
          <button className="share-report-btn secondary" onClick={sendReportToParticipant}>
            <span className="btn-icon">📤</span>
            Share with Candidate
          </button>
          <button className="close-report-btn" onClick={() => setShowReportModal(false)}>
            Close Report
          </button>
        </div>
      </div>
    </div>
  );
}

export default ReportModal;