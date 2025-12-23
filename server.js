import express from "express";
import pdfRoutes from "./routes/pdf.js";
import { validatePdfRequest } from "./middleware/validateRequest.js";
import cors from "cors";
import internalRoutes from "./routes/internal.js";



const app = express();

app.use(cors({
  origin: [
    "http://localhost:5500",
    "http://127.0.0.1:5500"
  ]
}));

app.use(express.json({ limit: "1mb" }));

// IMPORTANT: mount router at /pdf
app.use("/pdf", pdfRoutes);
app.use("/internal", internalRoutes);


app.listen(4000, () => {
  console.log("📄 PDF Service running on http://localhost:4000");
});
