const express = require('express');
const cors = require('cors');
const http = require('http');
const path = require('path');
const socketSingleton = require('./SocketSingleton');
const DrawingMessageBus = require('./MessageBus');
// Initialize Redis connection
const redisClient = require('./RedisSingleton');

// Import socket handlers
const drawingSocketHandler = require('./socket-handlers/DrawingSocketHandler');

const app = express();
const server = http.createServer(app);
const port = process.env.PORT || 5001;

// Load router
const drawingRouter = require('./routers/DrawingRouter');

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/', drawingRouter);

// Initialize Socket.io singleton
socketSingleton.setup(server);

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// Start the server
(async () => {
  try {
    // Initialize message bus
    const messageBus = new DrawingMessageBus();
    
    // Create a drawing service object for message bus
    const drawingService = {
      redisClient,
      clearCanvasForRoom: drawingSocketHandler.clearCanvasForRoom.bind(drawingSocketHandler),
      notifyCanvasCleared: drawingSocketHandler.notifyCanvasCleared.bind(drawingSocketHandler),
      setCurrentDrawer: drawingSocketHandler.setCurrentDrawer.bind(drawingSocketHandler)
    };
    
    await messageBus.initialize(drawingService);

    // Initialize socket handlers with message bus
    drawingSocketHandler.initialize(messageBus);

    // Log errors better
    process.on('unhandledRejection', (error) => {
      console.error('Unhandled Promise Rejection:', error);
    });

    server.listen(port, () => {
      console.log(`Drawing service running on http://localhost:${port}`);
      console.log(`Test page available at http://localhost:${port}/index.html`);
    });
  } catch (error) {
    console.log('Error in drawing service', error);
  }
})();
