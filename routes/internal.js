import express from "express";
import { redis } from "../redis.js";
import "dotenv/config";


const router = express.Router();

const INTERNAL_TOKEN = process.env.PDF_INTERNAL_TOKEN;

router.post("/job-status", async (req, res) => {
  // 🔐 Token check
  const token = req.headers["x-internal-token"];

  console.log(process.env.PDF_INTERNAL_TOKEN);

  if (!INTERNAL_TOKEN || token !== INTERNAL_TOKEN) {
    return res.status(401).json({ error: "unauthorized" });
  }

  const { job_id, status } = req.body;

  console.log("📥 STATUS UPDATE:", { job_id, status });

  if (!job_id || !status) {
    return res.status(400).json({ error: "job_id and status required" });
  }

  await redis.set(
    `pdf:job:${job_id}`,
    status,
    "EX",
    60 * 60 // 1 hour
  );

  res.json({ ok: true });
});

export default router;
