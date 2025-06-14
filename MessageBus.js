const amqp = require('amqplib');

class DrawingMessageBus {
  constructor() {
    this.connection = null;
    this.channel = null;
    this.drawingService = null;
    this.exchanges = {
      gameEvents: 'game.events',
      gameRequests: 'game.requests',
      gameResponses: 'game.responses',
    };
  }

  async initialize(drawingService) {
    this.drawingService = drawingService;

    try {
      // Connect to RabbitMQ
      const rabbitmqUrl = process.env.RABBITMQ_URL || 'amqp://localhost:5672';
      this.connection = await amqp.connect(rabbitmqUrl);
      this.channel = await this.connection.createChannel();

      // Declare exchanges
      await this.channel.assertExchange(this.exchanges.gameEvents, 'topic', {
        durable: true,
      });
      await this.channel.assertExchange(this.exchanges.gameRequests, 'direct', {
        durable: true,
      });
      await this.channel.assertExchange(this.exchanges.gameResponses, 'direct', {
        durable: true,
      });

      // Create queue for game events
      const gameEventsQueue = await this.channel.assertQueue('drawing.game.events', {
        durable: true,
      });
      await this.channel.bindQueue(
        gameEventsQueue.queue,
        this.exchanges.gameEvents,
        'game.event.*'
      );

      // Listen for game events
      await this.channel.consume(
        gameEventsQueue.queue,
        (msg) => {
          if (msg) {
            this.handleGameEvent(msg);
            this.channel.ack(msg);
          }
        },
        { noAck: false }
      );

      // Handle connection errors
      this.connection.on('error', (err) => {
        console.error('RabbitMQ connection error:', err);
      });

      this.connection.on('close', () => {
        console.log('RabbitMQ connection closed');
      });

      console.log('Drawing message bus initialized with RabbitMQ');
    } catch (error) {
      console.error('Failed to initialize RabbitMQ message bus:', error);
      throw error;
    }
  }

  async handleGameEvent(msg) {
    try {
      const event = JSON.parse(msg.content.toString());
      const { type, roomCode, data } = event;

      switch (type) {
        case 'round-started':
          // Clear canvas for new round
          await this.drawingService.clearCanvasForRoom(roomCode);
          this.drawingService.notifyCanvasCleared(roomCode, 'New round started');
          break;
        case 'game-ended':
          // Clear canvas when game ends
          await this.drawingService.clearCanvasForRoom(roomCode);
          this.drawingService.notifyCanvasCleared(roomCode, 'Game ended');
          break;
        case 'word-selected':
          // Update current drawer
          if (data.drawerId) {
            this.drawingService.setCurrentDrawer(roomCode, data.drawerId);
          }
          break;
      }
    } catch (error) {
      console.error('Error handling game event:', error);
    }
  }

  // Ask game service for information
  async askGameService(action, data) {
    const requestId = `${Date.now()}-${Math.random()}`;
    const replyQueue = `drawing.response.${requestId}`;

    try {
      // Create temporary queue for response
      await this.channel.assertQueue(replyQueue, { exclusive: true, autoDelete: true });

      const request = {
        id: requestId,
        action,
        data,
        replyTo: replyQueue,
        timestamp: Date.now(),
      };

      // Send request to game service
      await this.channel.publish(
        this.exchanges.gameRequests,
        'game.request',
        Buffer.from(JSON.stringify(request)),
        { persistent: true }
      );

      // Wait for response (with timeout)
      return new Promise((resolve) => {
        const timeout = setTimeout(() => {
          resolve({ currentDrawer: null, gamePhase: 'unknown' });
        }, 1000); // 1 second timeout

        this.channel.consume(replyQueue, (msg) => {
          if (msg) {
            try {
              const response = JSON.parse(msg.content.toString());
              if (response.requestId === requestId) {
                clearTimeout(timeout);
                this.channel.ack(msg);
                resolve(response.data);
              }
            } catch (error) {
              console.error('Error parsing game response:', error);
              this.channel.nack(msg, false, false);
            }
          }
        }, { noAck: false });
      });
    } catch (error) {
      console.error('Error communicating with game service:', error);
      return { currentDrawer: null, gamePhase: 'unknown' };
    }
  }

  async close() {
    try {
      if (this.channel) {
        await this.channel.close();
      }
      if (this.connection) {
        await this.connection.close();
      }
    } catch (error) {
      console.error('Error closing RabbitMQ connection:', error);
    }
  }
}

module.exports = DrawingMessageBus; 