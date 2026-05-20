import redis from '../config/redis.js';

const memoryStore = new Map();

const nowSeconds = () => Math.floor(Date.now() / 1000);

const setMemoryValue = (key, value, ttlSeconds) => {
  memoryStore.set(key, {
    value,
    expiresAt: nowSeconds() + ttlSeconds,
  });
};

const getMemoryEntry = (key) => {
  const entry = memoryStore.get(key);
  if (!entry) return null;

  if (entry.expiresAt <= nowSeconds()) {
    memoryStore.delete(key);
    return null;
  }

  return entry;
};

const getMemoryTTL = (key) => {
  const entry = getMemoryEntry(key);
  if (!entry) return -2;
  return Math.max(entry.expiresAt - nowSeconds(), 0);
};

export const setOtpData = async (key, value, ttlSeconds) => {
  const serialized = JSON.stringify(value);

  try {
    await redis.set(key, serialized, 'EX', ttlSeconds);
    return;
  } catch {
    setMemoryValue(key, value, ttlSeconds);
  }
};

export const getOtpData = async (key) => {
  try {
    const raw = await redis.get(key);
    if (!raw) return null;

    return JSON.parse(raw);
  } catch {
    const entry = getMemoryEntry(key);
    return entry ? entry.value : null;
  }
};

export const deleteOtpData = async (key) => {
  try {
    await redis.del(key);
    return;
  } catch {
    memoryStore.delete(key);
  }
};

export const getTtlSeconds = async (key) => {
  try {
    return await redis.ttl(key);
  } catch {
    return getMemoryTTL(key);
  }
};
