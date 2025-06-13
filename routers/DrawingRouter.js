const express = require('express');
const redis = require('../RedisSingleton');
const router = express.Router();

/**
 * Get canvas state for a specific room
 */
router.get('/room/:roomCode/canvas', async (req, res) => {
  try {
    const { roomCode } = req.params;

    if (!roomCode) {
      return res.status(400).json({ error: 'Room code is required' });
    }

    const key = `drawing:room:${roomCode}:canvas`;
    const drawings = await redis.lrange(key, 0, -1);
    const canvasState = drawings.map(drawing => JSON.parse(drawing)).reverse();

    res.json({
      roomCode,
      drawings: canvasState,
      totalDrawings: canvasState.length
    });
  } catch (error) {
    console.error('Error getting canvas state:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Clear canvas for a specific room
 */
router.delete('/room/:roomCode/canvas', async (req, res) => {
  try {
    const { roomCode } = req.params;
    const { userId, username } = req.body;

    if (!roomCode) {
      return res.status(400).json({ error: 'Room code is required' });
    }

    // Clear canvas data in Redis
    await redis.del(`drawing:room:${roomCode}:canvas`);

    // Store clear event
    const clearData = {
      type: 'clear-canvas',
      userId,
      username,
      timestamp: Date.now()
    };

    await redis.lpush(`drawing:room:${roomCode}:canvas`, JSON.stringify(clearData));

    res.json({
      message: 'Canvas cleared successfully',
      roomCode,
      clearedBy: username,
      timestamp: clearData.timestamp
    });
  } catch (error) {
    console.error('Error clearing canvas:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Get users currently in a drawing room
 */
router.get('/room/:roomCode/users', async (req, res) => {
  try {
    const { roomCode } = req.params;

    if (!roomCode) {
      return res.status(400).json({ error: 'Room code is required' });
    }

    const users = await redis.hgetall(`drawing:room:${roomCode}:users`);
    const userList = Object.entries(users).map(([userId, userData]) => ({
      userId,
      ...JSON.parse(userData)
    }));

    res.json({
      roomCode,
      users: userList,
      totalUsers: userList.length
    });
  } catch (error) {
    console.error('Error getting room users:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Get drawing statistics for a room
 */
router.get('/room/:roomCode/stats', async (req, res) => {
  try {
    const { roomCode } = req.params;

    if (!roomCode) {
      return res.status(400).json({ error: 'Room code is required' });
    }

    const key = `drawing:room:${roomCode}:canvas`;
    const drawings = await redis.lrange(key, 0, -1);
    const parsedDrawings = drawings.map(drawing => JSON.parse(drawing));

    // Calculate statistics
    const stats = {
      totalStrokes: parsedDrawings.filter(d => d.type === 'draw-start').length,
      totalPoints: parsedDrawings.filter(d => d.type === 'draw-move').length,
      clearEvents: parsedDrawings.filter(d => d.type === 'clear-canvas').length,
      uniqueDrawers: [...new Set(parsedDrawings.map(d => d.userId).filter(Boolean))].length,
      firstDrawing: parsedDrawings.length > 0 ? parsedDrawings[parsedDrawings.length - 1].timestamp : null,
      lastDrawing: parsedDrawings.length > 0 ? parsedDrawings[0].timestamp : null
    };

    res.json({
      roomCode,
      stats
    });
  } catch (error) {
    console.error('Error getting drawing stats:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router; 