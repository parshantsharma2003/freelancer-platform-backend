import { Worker } from "bullmq";
import redis from "../config/redis.js";

new Worker(
  "notifications",
  async job => {

    console.log("Processing notification:", job.data);

  },
  { connection: redis }
);