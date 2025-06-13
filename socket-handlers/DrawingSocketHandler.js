const socketInstance = require('../SocketSingleton');
const redis = require('../RedisSingleton');

class DrawingSocketHandler {
  constructor() {
    this.io = null;
  }

  /**
   * Initialize the socket handlers
   */
  initialize() {
    this.io = socketInstance.getIO();
    this.setupEventHandlers();
    console.log('Drawing socket handlers initialized');
  }

  /**
   * Setup socket event handlers for drawing functionality
   */
  setupEventHandlers() {
    this.io.on('connection', (socket) => {
      console.log(`Drawing client connected: ${socket.id}`);

      // Room management
      socket.on('join-drawing-room', (data) => this.handleJoinRoom(socket, data));
      socket.on('leave-drawing-room', () => this.handleLeaveRoom(socket));

      // Drawing events
      socket.on('draw-start', (data) => this.handleDrawStart(socket, data));
      socket.on('draw-move', (data) => this.handleDrawMove(socket, data));
      socket.on('draw-end', (data) => this.handleDrawEnd(socket, data));
      socket.on('clear-canvas', (data) => this.handleClearCanvas(socket, data));

      // Tool changes
      socket.on('change-color', (data) => this.handleChangeColor(socket, data));
      socket.on('change-pen-size', (data) => this.handleChangePenSize(socket, data));

      // Canvas state
      socket.on('get-canvas-state', () => this.handleGetCanvasState(socket));

      // Disconnection
      socket.on('disconnect', () => this.handleLeaveRoom(socket));
    });

    // Listen for canvas clearing events from game service
    if (this.gameSocket) {
      this.gameSocket.on('clear-canvas-round', (data) => {
        console.log('Clearing canvas for new round:', data);
        if (data.roomCode) {
          this.clearCanvasForRoom(data.roomCode);
        }
      });

      this.gameSocket.on('clear-canvas-game-end', (data) => {
        console.log('Clearing canvas for game end:', data);
        if (data.roomCode) {
          this.clearCanvasForRoom(data.roomCode);
        }
      });
    }
  }

  /**
   * Handle joining a drawing room
   * @param {Object} socket - Socket instance
   * @param {Object} data - Room data {roomCode, userId, username}
   */
  async handleJoinRoom(socket, data) {
    const { roomCode, userId, username } = data;

    if (!roomCode || !userId) {
      socket.emit('error', { message: 'Room code and user ID required' });
      return;
    }

    // Store room and user info on socket
    socket.roomCode = roomCode;
    socket.userId = userId;
    socket.username = username;

    // Join the room
    socket.join(roomCode);

    // Store user in Redis
    await redis.hset(`drawing:room:${roomCode}:users`, userId, JSON.stringify({
      username,
      socketId: socket.id,
      joinedAt: Date.now()
    }));

    // Get current canvas state and send to newly joined user
    const canvasState = await this.getCanvasState(roomCode);
    if (canvasState && canvasState.length > 0) {
      socket.emit('canvas-state', { drawings: canvasState });
    }

    // Notify others in the room
    socket.to(roomCode).emit('user-joined-drawing', {
      userId,
      username,
      timestamp: Date.now()
    });

    console.log(`User ${username} (${userId}) joined drawing room ${roomCode}`);
  }

  /**
   * Handle leaving a drawing room
   * @param {Object} socket - Socket instance
   */
  async handleLeaveRoom(socket) {
    const { roomCode, userId, username } = socket;

    if (!roomCode || !userId) return;

    // Leave the room
    socket.leave(roomCode);

    // Remove user from Redis
    await redis.hdel(`drawing:room:${roomCode}:users`, userId);

    // Notify others in the room
    socket.to(roomCode).emit('user-left-drawing', {
      userId,
      username,
      timestamp: Date.now()
    });

    console.log(`User ${username} (${userId}) left drawing room ${roomCode}`);
  }

  /**
   * Handle draw start events
   * @param {Object} socket - Socket instance
   * @param {Object} data - Drawing data
   */
  async handleDrawStart(socket, data) {
    const { roomCode, userId } = socket;
    if (!roomCode) return;

    const drawingData = {
      type: 'draw-start',
      userId,
      ...data,
      timestamp: Date.now()
    };

    // Store in Redis for persistence
    await this.storeDrawingData(roomCode, drawingData);

    // Broadcast to all others in room
    socket.to(roomCode).emit('draw-start', drawingData);
  }

  /**
   * Handle draw move events (while drawing)
   * @param {Object} socket - Socket instance
   * @param {Object} data - Drawing data
   */
  async handleDrawMove(socket, data) {
    const { roomCode, userId } = socket;
    if (!roomCode) return;

    const drawingData = {
      type: 'draw-move',
      userId,
      ...data,
      timestamp: Date.now()
    };

    // Store in Redis for persistence
    await this.storeDrawingData(roomCode, drawingData);

    // Broadcast to all others in room
    socket.to(roomCode).emit('draw-move', drawingData);
  }

  /**
   * Handle draw end events
   * @param {Object} socket - Socket instance
   * @param {Object} data - Drawing data
   */
  async handleDrawEnd(socket, data) {
    const { roomCode, userId } = socket;
    if (!roomCode) return;

    const drawingData = {
      type: 'draw-end',
      userId,
      ...data,
      timestamp: Date.now()
    };

    // Store in Redis for persistence
    await this.storeDrawingData(roomCode, drawingData);

    // Broadcast to all others in room
    socket.to(roomCode).emit('draw-end', drawingData);
  }

  /**
   * Handle canvas clearing
   * @param {Object} socket - Socket instance
   */
  async handleClearCanvas(socket) {
    const { roomCode, userId, username } = socket;
    if (!roomCode) return;

    // Clear canvas data in Redis
    await redis.del(`drawing:room:${roomCode}:canvas`);

    const clearData = {
      type: 'clear-canvas',
      userId,
      username,
      timestamp: Date.now()
    };

    // Store clear event
    await this.storeDrawingData(roomCode, clearData);

    // Notify everyone in the room (including sender)
    this.io.to(roomCode).emit('canvas-cleared', clearData);
  }

  /**
   * Handle request for current canvas state
   * @param {Object} socket - Socket instance
   */
  async handleRequestCanvasState(socket) {
    const { roomCode } = socket;
    if (!roomCode) return;

    const canvasState = await this.getCanvasState(roomCode);
    socket.emit('canvas-state', { drawings: canvasState || [] });
  }

  /**
   * Handle color change events
   * @param {Object} socket - Socket instance
   * @param {Object} data - Color data {color}
   */
  handleChangeColor(socket, data) {
    const { roomCode, userId, username } = socket;
    const { color } = data;

    if (!roomCode || !color) return;

    // Notify everyone in the room about color change
    socket.to(roomCode).emit('color-changed', {
      userId,
      username,
      color,
      timestamp: Date.now()
    });
  }

  /**
   * Handle pen size change events
   * @param {Object} socket - Socket instance
   * @param {Object} data - Pen size data {size}
   */
  handleChangePenSize(socket, data) {
    const { roomCode, userId, username } = socket;
    const { size } = data;

    if (!roomCode || !size) return;

    // Notify everyone in the room about pen size change
    socket.to(roomCode).emit('pen-size-changed', {
      userId,
      username,
      size,
      timestamp: Date.now()
    });
  }

  /**
   * Handle drawing tool change events
   * @param {Object} socket - Socket instance
   * @param {Object} data - Tool data {tool, size, color}
   */
  handleChangeTool(socket, data) {
    const { roomCode, userId, username } = socket;
    const { tool, size, color } = data;

    if (!roomCode || !tool) return;

    // Notify everyone in the room about tool change
    socket.to(roomCode).emit('tool-changed', {
      userId,
      username,
      tool,
      size,
      color,
      timestamp: Date.now()
    });
  }

  /**
   * Handle user disconnect
   * @param {Object} socket - Socket instance
   */
  async handleDisconnect(socket) {
    console.log('User disconnected from drawing service:', socket.id);
    await this.handleLeaveRoom(socket);
  }

  /**
   * Store drawing data in Redis
   * @param {string} roomCode - Room code
   * @param {Object} drawingData - Drawing data to store
   */
  async storeDrawingData(roomCode, drawingData) {
    try {
      const key = `drawing:room:${roomCode}:canvas`;
      await redis.lpush(key, JSON.stringify(drawingData));
      
      // Keep only last 1000 drawing events to prevent memory issues
      await redis.ltrim(key, 0, 999);
    } catch (error) {
      console.error('Error storing drawing data:', error);
    }
  }

  /**
   * Get canvas state from Redis
   * @param {string} roomCode - Room code
   * @returns {Array} Array of drawing events
   */
  async getCanvasState(roomCode) {
    try {
      const key = `drawing:room:${roomCode}:canvas`;
      const drawings = await redis.lrange(key, 0, -1);
      return drawings.map(drawing => JSON.parse(drawing)).reverse();
    } catch (error) {
      console.error('Error getting canvas state:', error);
      return [];
    }
  }

  /**
   * Clear canvas for all users in a room (called from game service)
   * @param {string} roomCode - Room code
   */
  async clearCanvasForRoom(roomCode) {
    try {
      // Clear canvas data in Redis
      await redis.del(`drawing:room:${roomCode}:canvas`);

      // Notify all clients in the room
      this.io.to(roomCode).emit('canvas-cleared');

      console.log(`Canvas cleared for room ${roomCode}`);
    } catch (error) {
      console.error('Error clearing canvas for room:', error);
    }
  }

  /**
   * Handle getting canvas state
   * @param {Object} socket - Socket instance
   */
  async handleGetCanvasState(socket) {
    try {
      const { roomCode } = socket;
      if (!roomCode) return;

      // Get canvas state from Redis
      const canvasData = await this.redisClient.get(`drawing:room:${roomCode}:canvas`);
      const drawings = canvasData ? JSON.parse(canvasData) : [];

      socket.emit('canvas-state', { drawings });
    } catch (error) {
      console.error('Error getting canvas state:', error);
    }
  }
}

module.exports = new DrawingSocketHandler(); 