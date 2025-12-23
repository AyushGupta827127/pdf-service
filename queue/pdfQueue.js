import "dotenv/config";
import { Queue } from "bullmq";
import IORedis from "ioredis";

export const connection = new IORedis(process.env.REDIS_URL, {
  maxRetriesPerRequest: null,
});

export const pdfQueue = new Queue("pdf-jobs", { connection });
