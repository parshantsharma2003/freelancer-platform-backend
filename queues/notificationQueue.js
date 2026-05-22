import { Queue } from "bullmq";
import redis, { isRedisAvailable } from "../config/redis.js";

let queueInstance = null;

export const getNotificationQueue = () => {
  if (!isRedisAvailable) {
    return {
      async add() {
        return { id: `memory-${Date.now()}` };
      },
      async close() {}
    };
  }

  if (!queueInstance) {
    queueInstance = new Queue("notifications", {
      connection: redis
    });
  }

  return queueInstance;
};