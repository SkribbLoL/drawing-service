# Drawing Service

A WebSocket-based drawing service for the SkribbLoL game that enables real-time collaborative drawing with canvas API.

## Features

- **Real-time drawing**: Multiple players can draw simultaneously on the same canvas
- **Pen customization**: Different pen sizes (1-50px) and colors
- **Canvas persistence**: Drawings are stored in Redis and persist across sessions
- **Room-based drawing**: Players join drawing rooms and only see drawings from their room
- **Canvas management**: Clear canvas functionality that affects all players in the room
- **User management**: Track users in drawing rooms

## Architecture

The service follows the same structure as the game-service:

```
drawing-service/
├── index.js                 # Main entry point
├── SocketSingleton.js       # Socket.io singleton
├── RedisSingleton.js        # Redis client singleton
├── socket-handlers/
│   └── DrawingSocketHandler.js
├── routers/
│   └── DrawingRouter.js
├── public/
│   └── index.html           # Test page
└── package.json
```

## WebSocket Events

### Client → Server

| Event | Data | Description |
|-------|------|-------------|
| `join-drawing-room` | `{roomCode, userId, username}` | Join a drawing room |
| `leave-drawing-room` | - | Leave current drawing room |
| `draw-start` | `{x, y, color, penSize}` | Start drawing stroke |
| `draw-move` | `{x, y, color, penSize}` | Continue drawing stroke |
| `draw-end` | `{}` | End drawing stroke |
| `clear-canvas` | - | Clear the canvas for everyone |
| `request-canvas-state` | - | Request current canvas state |
| `change-color` | `{color}` | Change drawing color |
| `change-pen-size` | `{size}` | Change pen size |
| `change-tool` | `{tool, size, color}` | Change drawing tool |

### Server → Client

| Event | Data | Description |
|-------|------|-------------|
| `canvas-state` | `{drawings: [...]}` | Current canvas state on join |
| `draw-start` | `{x, y, color, penSize, userId, timestamp}` | Someone started drawing |
| `draw-move` | `{x, y, color, penSize, userId, timestamp}` | Someone is drawing |
| `draw-end` | `{userId, timestamp}` | Someone finished drawing |
| `canvas-cleared` | `{userId, username, timestamp}` | Canvas was cleared |
| `user-joined-drawing` | `{userId, username, timestamp}` | User joined room |
| `user-left-drawing` | `{userId, username, timestamp}` | User left room |
| `color-changed` | `{userId, username, color, timestamp}` | User changed color |
| `pen-size-changed` | `{userId, username, size, timestamp}` | User changed pen size |
| `tool-changed` | `{userId, username, tool, size, color, timestamp}` | User changed tool |

## HTTP API

### GET `/drawing/room/:roomCode/canvas`
Get current canvas state for a room.

**Response:**
```json
{
  "roomCode": "ROOM123",
  "drawings": [...],
  "totalDrawings": 42
}
```

### DELETE `/drawing/room/:roomCode/canvas`
Clear canvas for a room.

**Request Body:**
```json
{
  "userId": "user123",
  "username": "Player1"
}
```

### GET `/drawing/room/:roomCode/users`
Get users currently in a drawing room.

**Response:**
```json
{
  "roomCode": "ROOM123",
  "users": [
    {
      "userId": "user123",
      "username": "Player1",
      "socketId": "socket123",
      "joinedAt": 1609459200000
    }
  ],
  "totalUsers": 1
}
```

### GET `/drawing/room/:roomCode/stats`
Get drawing statistics for a room.

**Response:**
```json
{
  "roomCode": "ROOM123",
  "stats": {
    "totalStrokes": 15,
    "totalPoints": 342,
    "clearEvents": 2,
    "uniqueDrawers": 3,
    "firstDrawing": 1609459200000,
    "lastDrawing": 1609459800000
  }
}
```

## Canvas Implementation

The service uses HTML5 Canvas API for drawing:

- **Drawing lifecycle**: `draw-start` → multiple `draw-move` → `draw-end`
- **Stroke properties**: Color (hex), pen size (1-50px), round line caps
- **Persistence**: All drawing events stored in Redis as JSON
- **Replay**: Canvas state reconstructed from stored events
- **Memory management**: Only last 1000 drawing events kept per room

## Redis Data Structure

```
drawing:room:{roomCode}:users     # Hash: userId → user data
drawing:room:{roomCode}:canvas    # List: drawing events (JSON)
```

## Testing

1. Start the service: `docker-compose up drawing-service`
2. Open test page: `http://localhost:5001/index.html`
3. Join a room with a room code and username
4. Draw on the canvas - drawings will be broadcast to all users in the room
5. Test different colors and pen sizes
6. Test clearing the canvas
7. Open multiple browser tabs to test real-time collaboration

## Example Usage

```javascript
// Connect to drawing service
const socket = io('http://localhost:5001');

// Join a drawing room
socket.emit('join-drawing-room', {
  roomCode: 'ROOM123',
  userId: 'user123',
  username: 'Player1'
});

// Start drawing
socket.emit('draw-start', {
  x: 100,
  y: 100,
  color: '#ff0000',
  penSize: 10
});

// Continue drawing
socket.emit('draw-move', {
  x: 150,
  y: 150,
  color: '#ff0000',
  penSize: 10
});

// Finish drawing
socket.emit('draw-end', {});

// Listen for other players' drawings
socket.on('draw-start', (data) => {
  // Start drawing other player's stroke
  ctx.beginPath();
  ctx.strokeStyle = data.color;
  ctx.lineWidth = data.penSize;
  ctx.moveTo(data.x, data.y);
});

socket.on('draw-move', (data) => {
  // Continue other player's stroke
  ctx.lineTo(data.x, data.y);
  ctx.stroke();
});
```

## Integration with Game Service

The drawing service is designed to work alongside the game service:

1. Game service manages rooms and game state
2. Drawing service handles canvas drawing within those rooms
3. Both services can share the same room codes
4. Frontend can connect to both services simultaneously

## Configuration

- **Port**: 5001 (configurable via `PORT` environment variable)
- **Redis**: Connects to `redis:6379` (configurable via `REDIS_HOST`/`REDIS_PORT`)
- **CORS**: Enabled for all origins (configure for production) 