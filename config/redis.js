import { Redis } from "ioredis";

const redisUrl = process.env.REDIS_URL;

if (!redisUrl) {
	throw new Error("REDIS_URL is required");
}

const redis = new Redis(redisUrl, {
	lazyConnect: true,
	maxRetriesPerRequest: 1,
	enableReadyCheck: false
});

export default redis;