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

const OUTPUT_DIR = process.env.PDF_OUTPUT_DIR
  ? path.resolve(process.env.PDF_OUTPUT_DIR)
  : null;

if (!OUTPUT_DIR) {
  console.error("PDF_OUTPUT_DIR is not set. Exiting.");
  process.exit(1);
}

router.get("/download/:jobId", async (req, res) => {
  const { jobId } = req.params;

  // sanitize jobId — only allow UUID-safe characters
  if (!/^[a-zA-Z0-9-]+$/.test(jobId)) {
    return res.status(400).json({ error: "Invalid jobId" });
  }

  // check job status before serving
  const status = await redis.get(`pdf:job:${jobId}`);
  if (!status) {
    return res.status(404).json({ error: "Job not found" });
  }
  if (status !== "done") {
    return res.status(400).json({ error: "Job not completed", status });
  }

  // sanitize filename: allow only alphanumeric, dash, underscore
  const rawName = req.query.filename || jobId;
  const baseName = rawName.replace(/\.pdf$/i, "").replace(/[^a-zA-Z0-9_-]/g, "_");
  const safeFilename = `${baseName}.pdf`;

  // resolve and validate path stays inside OUTPUT_DIR
  const filePath = path.resolve(OUTPUT_DIR, `${jobId}.pdf`);
  if (!filePath.startsWith(OUTPUT_DIR + path.sep)) {
    return res.status(400).json({ error: "Invalid jobId" });
  }

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: "PDF not found" });
  }

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${safeFilename}"`);

  const stream = fs.createReadStream(filePath);

  stream.on("error", (err) => {
    console.error("Stream error:", err.message);
    if (!res.headersSent) res.status(500).json({ error: "Stream error" });
    else res.end();
  });

  // delete AFTER response is fully flushed
  res.on("finish", () => {
    fs.unlink(filePath, (err) => {
      if (err) console.error("Failed to delete PDF:", err.message);
    });
  });

  stream.pipe(res);
})


export default router;
