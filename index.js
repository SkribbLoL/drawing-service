const express = require('express');
const cors = require('cors');
const http = require('http');
const path = require('path');
const socketSingleton = require('./SocketSingleton');
// Initialize Redis connection
require('./RedisSingleton');

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
app.use('/drawing', drawingRouter);

// Initialize Socket.io singleton
socketSingleton.setup(server);

// Initialize socket handlers
drawingSocketHandler.initialize();

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// Start the server
(async () => {
  try {
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
