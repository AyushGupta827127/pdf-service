export function validatePdfRequest(req, res, next) {
  const { html, meta } = req.body;

  if (!html || typeof html !== "string") {
    return res.status(400).json({ error: "HTML is required" });
  }

  if (html.length > 300_000) {
    return res.status(413).json({ error: "HTML too large" });
  }

  if (
    !meta ||
    !meta.collection ||
    !meta.item_id ||
    !meta.field
  ) {
    return res.status(400).json({ error: "Invalid meta object" });
  }

  next();
}
