import { Redis } from "ioredis";

const redisUrl = process.env.REDIS_URL || 'redis://127.0.0.1:6379';

const redis = new Redis(redisUrl, {
	lazyConnect: true,
	maxRetriesPerRequest: 1,
	enableReadyCheck: false
});

export default redis;