const express = require('express');
const cors = require('cors');
const http = require('http');
const socketSingleton = require('./SocketSingleton');
const DrawingMessageBus = require('./MessageBus');
// Initialize Redis connection
const redisClient = require('./RedisSingleton');

// Import socket handlers
const drawingSocketHandler = require('./socket-handlers/DrawingSocketHandler');

const app = express();
const server = http.createServer(app);
const port = process.env.PORT || 5001;

// Middleware
app.use(cors());
app.use(express.json());

// Initialize Socket.io singleton
socketSingleton.setup(server);

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'ok',
    service: 'drawing-service',
    timestamp: new Date().toISOString(),
  });
});

// Health check endpoint with drawing prefix for ingress
app.get('/drawing/health', (req, res) => {
  res.status(200).json({ 
    status: 'ok',
    service: 'drawing-service',
    timestamp: new Date().toISOString(),
  });
});

// Start the server
(async () => {
  try {
    console.log('🚀 Starting Drawing Service initialization...');

    // Initialize message bus
    console.log('📦 Initializing Message Bus...');
    const messageBus = new DrawingMessageBus();

    // Create a drawing service object for message bus
    const drawingService = {
      redisClient,
      clearCanvasForRoom: drawingSocketHandler.clearCanvasForRoom.bind(drawingSocketHandler),
      notifyCanvasCleared: drawingSocketHandler.notifyCanvasCleared.bind(drawingSocketHandler),
      setCurrentDrawer: drawingSocketHandler.setCurrentDrawer.bind(drawingSocketHandler),
    };

    await messageBus.initialize(drawingService);
    console.log('✅ Message Bus initialized');

    // Initialize socket handlers with message bus
    console.log('🔌 Initializing Socket Handlers...');
    drawingSocketHandler.initialize(messageBus);
    console.log('✅ Socket Handlers initialized');

    // Log errors better
    process.on('unhandledRejection', (error) => {
      console.error('💥 Unhandled Promise Rejection:', error);
    });

    process.on('uncaughtException', (error) => {
      console.error('💥 Uncaught Exception:', error);
    });

    server.listen(port, () => {
      console.log(`✅ Drawing service running on http://localhost:${port}`);
      console.log('🎉 Drawing Service fully initialized and ready!');
    });
  } catch (error) {
    console.error('💥 Error in drawing service initialization:', error);
    process.exit(1);
  }
})();
