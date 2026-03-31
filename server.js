import "dotenv/config";

import express from "express";
import pdfRoutes from "./routes/pdf.js";
import cors from "cors";
import internalRoutes from "./routes/internal.js";

const app = express();

app.use(cors({
  origin: "*",
  methods: ["GET","POST","OPTIONS"],
  allowedHeaders: ["Content-Type"]
}));

app.options("*", cors());   // <-- REQUIRED

app.use(express.json({ limit: "1mb" }));

app.use("/pdf", pdfRoutes);
app.use("/internal", internalRoutes);

const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
  console.log(`📄 PDF Service running on http://localhost:${PORT}`);
});