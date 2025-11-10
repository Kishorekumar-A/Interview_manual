import express from 'express';
import Room from '../models/Room.js';

const router = express.Router();

// Create a new room
router.post('/create', async (req, res) => {
  try {
    const { roomId, password, createdBy, title, description, settings } = req.body;

    // Check if room already exists
    const existingRoom = await Room.findOne({ roomId });
    if (existingRoom) {
      return res.status(400).json({
        success: false,
        message: 'Room ID already exists'
      });
    }

    const room = new Room({
      roomId,
      password,
      createdBy,
      title,
      description,
      settings
    });

    await room.save();

    res.status(201).json({
      success: true,
      message: 'Room created successfully',
      room: {
        id: room._id,
        roomId: room.roomId,
        title: room.title,
        createdBy: room.createdBy,
        createdAt: room.createdAt
      }
    });
  } catch (error) {
    console.error('Create room error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Join a room
router.post('/join', async (req, res) => {
  try {
    const { roomId, password, userId } = req.body;

    const room = await Room.findOne({ roomId, isActive: true });
    if (!room) {
      return res.status(404).json({
        success: false,
        message: 'Room not found or inactive'
      });
    }

    // Check password
    if (room.password !== password) {
      return res.status(401).json({
        success: false,
        message: 'Invalid room password'
      });
    }

    // Check if user is already a participant
    const existingParticipant = room.participants.find(
      p => p.user.toString() === userId && p.isActive
    );

    if (!existingParticipant) {
      // Add user as participant
      room.participants.push({
        user: userId,
        joinedAt: new Date(),
        isActive: true
      });
      await room.save();
    }

    res.json({
      success: true,
      message: 'Joined room successfully',
      room: {
        id: room._id,
        roomId: room.roomId,
        title: room.title,
        createdBy: room.createdBy,
        participants: room.participants
      }
    });
  } catch (error) {
    console.error('Join room error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Get room details
router.get('/:roomId', async (req, res) => {
  try {
    const { roomId } = req.params;

    const room = await Room.findOne({ roomId })
      .populate('createdBy', 'firstName lastName email')
      .populate('participants.user', 'firstName lastName email');

    if (!room) {
      return res.status(404).json({
        success: false,
        message: 'Room not found'
      });
    }

    res.json({
      success: true,
      room
    });
  } catch (error) {
    console.error('Get room error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Leave room
router.post('/:roomId/leave', async (req, res) => {
  try {
    const { roomId } = req.params;
    const { userId } = req.body;

    const room = await Room.findOne({ roomId });
    if (!room) {
      return res.status(404).json({
        success: false,
        message: 'Room not found'
      });
    }

    // Update participant status
    const participant = room.participants.find(
      p => p.user.toString() === userId && p.isActive
    );

    if (participant) {
      participant.isActive = false;
      participant.leftAt = new Date();
      await room.save();
    }

    res.json({
      success: true,
      message: 'Left room successfully'
    });
  } catch (error) {
    console.error('Leave room error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

export default router;