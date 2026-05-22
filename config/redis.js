import { Redis } from "ioredis";

const redisUrl = process.env.REDIS_URL;

const isTestEnv = process.env.NODE_ENV === "test";

const memoryStore = new Map();

const nowSeconds = () => Math.floor(Date.now() / 1000);

const createTestRedis = () => ({
	async set(key, value, mode, ttlSeconds) {
		const expiresAt =
			typeof ttlSeconds === "number" ? nowSeconds() + ttlSeconds : null;
		memoryStore.set(key, { value, expiresAt });
		return "OK";
	},
	async get(key) {
		const entry = memoryStore.get(key);
		if (!entry) return null;

		if (entry.expiresAt !== null && entry.expiresAt <= nowSeconds()) {
			memoryStore.delete(key);
			return null;
		}

		return entry.value;
	},
	async del(key) {
		const existed = memoryStore.delete(key);
		return existed ? 1 : 0;
	},
	async ttl(key) {
		const entry = memoryStore.get(key);
		if (!entry) return -2;
		if (entry.expiresAt === null) return -1;

		const remaining = entry.expiresAt - nowSeconds();
		if (remaining <= 0) {
			memoryStore.delete(key);
			return -2;
		}

		return remaining;
	},
	async quit() {
		memoryStore.clear();
	},
	disconnect() {
		memoryStore.clear();
	}
});

const redis = isTestEnv
	? createTestRedis()
	: (() => {
		if (!redisUrl) {
			throw new Error("REDIS_URL is required");
		}

		return new Redis(redisUrl, {
			lazyConnect: true,
			maxRetriesPerRequest: 1,
			enableReadyCheck: false
		});
	})()

export default redis;