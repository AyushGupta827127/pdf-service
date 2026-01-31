import express from "express";
import { pdfQueue } from "../queue/pdfQueue.js";
import crypto from "crypto";
import { validatePdfRequest } from "../middleware/validateRequest.js";
import fs from "fs";
import path from "path";
import { redis } from "../redis.js";

const router = express.Router();

router.post("/generate", validatePdfRequest, async (req, res) => {
  const { html, meta } = req.body;

  const jobId = crypto.randomUUID();

  // 1️⃣ store initial status

  await redis.set(
    `pdf:job:${jobId}`,
    "queued",
    "EX",
    60 * 60 // 1 hour TTL
  );

  // 2️⃣ enqueue WITH DATA (CRITICAL)
  await pdfQueue.add("generate", {
    html,
    jobId,
  });

  // 3️⃣ respond immediately
  res.json({
    job_id: jobId,
    status: "queued",
  });
});

router.get("/status/:jobId", async (req, res) => {
  const { jobId } = req.params;

  const status = await redis.get(`pdf:job:${jobId}`);

  if (!status) {
    return res.status(404).json({ status: "not_found" });
  }

  res.json({ status });
});

const OUTPUT_DIR = path.resolve("../pdf-worker/output");

router.get("/download/:jobId", (req, res) => {
  const { jobId } = req.params
  const filename = req.query.filename || `invoice-${jobId}.pdf`

  const safeFilename = filename
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/\.pdf$/i, "") + ".pdf"

  const filePath = path.join(OUTPUT_DIR, `${jobId}.pdf`)

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: "PDF not found" })
  }

  res.setHeader("Content-Type", "application/pdf")
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${safeFilename}"`
  )

  const stream = fs.createReadStream(filePath)

  stream.pipe(res)

  stream.on("close", () => {
    try {
      fs.unlinkSync(filePath)
    } catch (err) {
      console.error("Failed to delete PDF:", err.message)
    }
  })

  stream.on("error", (err) => {
    console.error("Stream error:", err.message)
    res.end()
  })
})


export default router;
