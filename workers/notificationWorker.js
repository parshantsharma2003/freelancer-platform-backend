import { Worker } from "bullmq";
import redis, { isRedisAvailable } from "../config/redis.js";

if (isRedisAvailable) {
  new Worker(
    "notifications",
    async (job) => {
      console.log("Processing notification:", job.data);
    },
    { connection: redis }
  );
} else {
  console.warn("Notification worker disabled because Redis is unavailable.");
}