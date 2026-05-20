import { Queue } from "bullmq";
import redis from "../config/redis.js";

let queueInstance = null;

export const getNotificationQueue = () => {
  if (!queueInstance) {
    queueInstance = new Queue("notifications", {
      connection: redis
    });
  }

  return queueInstance;
};