// redis-client.js
const Redis = require('ioredis');
let instance = null;

class RedisClient {
  constructor() {
    if (instance) {
      return instance;
    }

    this.client = new Redis({
      // Kubernetes/Helm configuration
      // host: process.env.REDIS_HOST || 'redis-master.default.svc.cluster.local',
      // port: process.env.REDIS_PORT || 6379,
      // password: process.env.REDIS_PASSWORD,

      // Docker Compose configuration (commented out)
      // Uncomment below and comment above for Docker Compose usage
      host: process.env.REDIS_HOST || 'redis',
      port: process.env.REDIS_PORT || 6379,
      // password: undefined, // No password for Docker Compose Redis
    });

    // Handle connection events
    this.client.on('error', (err) => console.error('Redis error:', err));
    this.client.on('connect', () => console.log('Connected to Redis from drawing service'));

    instance = this;
  }

  async get(key) {
    return this.client.get(key);
  }

  async set(key, value, expiryFlag, expiryTime) {
    console.log('Key: ' + key, 'Value: ' + value);
    if (expiryFlag && expiryTime) {
      return this.client.set(key, value, expiryFlag, expiryTime);
    }
    return this.client.set(key, value);
  }

  async del(key) {
    return this.client.del(key);
  }

  async hget(key, field) {
    return this.client.hget(key, field);
  }

  async hset(key, field, value) {
    return this.client.hset(key, field, value);
  }

  async hgetall(key) {
    return this.client.hgetall(key);
  }

  async hdel(key, field) {
    return this.client.hdel(key, field);
  }

  async lpush(key, value) {
    return this.client.lpush(key, value);
  }

  async lrange(key, start, stop) {
    return this.client.lrange(key, start, stop);
  }

  async ltrim(key, start, stop) {
    return this.client.ltrim(key, start, stop);
  }
}

module.exports = new RedisClient(); 