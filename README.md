# PDF Service

An async PDF generation microservice built with Express, BullMQ, and Redis. It accepts HTML, queues a generation job, and lets clients poll for status and download the result once ready.

---

## Architecture Overview

```
Client
  │
  ▼
POST /pdf/generate          ← validates HTML + meta, enqueues job, returns job_id
  │
  ├── Redis (pdf:job:<id>)  ← stores job status with 1hr TTL
  └── BullMQ Queue          ← "pdf-jobs" queue consumed by pdf-worker (separate service)

Client polls GET /pdf/status/:jobId
  └── reads status from Redis

pdf-worker (external)
  └── POST /internal/job-status  ← updates Redis status (requires internal token)

Client downloads GET /pdf/download/:jobId
  └── streams file from $PDF_OUTPUT_DIR/<jobId>.pdf, then deletes it
```

---

## Prerequisites

- Node.js 18+
- Redis instance
- `pdf-worker` service running separately (consumes the BullMQ queue and writes output PDFs)

---

## Setup

```bash
npm install
```

Create a `.env` file in the project root:

```env
PORT=4000
REDIS_URL=redis://localhost:6379
PDF_INTERNAL_TOKEN=<your_secret_token>
PDF_OUTPUT_DIR=/path/to/pdf-worker/output
```

> `PDF_INTERNAL_TOKEN` must match the token configured in the `pdf-worker` service.

---

## Running

```bash
npm start
```

Server starts on `http://localhost:4000` (or the port set in `.env`).

---

## API Reference

### POST `/pdf/generate`

Enqueues an HTML-to-PDF job.

**Request body:**
```json
{
  "html": "<h1>Hello</h1>",
  "meta": {
    "collection": "reports",
    "item_id": "123",
    "field": "pdf_output"
  }
}
```

**Validation rules:**
- `html` — required string, max 300,000 characters
- `meta.collection`, `meta.item_id`, `meta.field` — all required

**Response `200`:**
```json
{
  "job_id": "uuid-v4",
  "status": "queued"
}
```

---

### GET `/pdf/status/:jobId`

Returns the current status of a job.

**Response `200`:**
```json
{ "status": "queued" }
```

Possible status values: `queued`, `processing`, `done`, `failed`

> These values are set by `pdf-worker` via `POST /internal/job-status`. The download endpoint requires status `done` before serving the file.

**Response `404`:**
```json
{ "status": "not_found" }
```

---

### GET `/pdf/download/:jobId?filename=<name>`

Downloads the generated PDF and deletes it from disk after streaming.

| Query param | Required | Description |
|---|---|---|
| `filename` | No | Custom download filename (defaults to `<jobId>.pdf`) |

**Example:**
```
GET /pdf/download/abc123?filename=invoice-001
```

**Response `200`:** PDF file stream (`application/pdf`)

**Response `400`:** Job not yet completed, or invalid `jobId`.
```json
{ "error": "Job not completed", "status": "processing" }
```

**Response `404`:** Job or file not found.
```json
{ "error": "PDF not found" }
```

---

## Download Behavior

### Forced Download

The endpoint always triggers a file download — it never renders the PDF inline in the browser. This is enforced via:

```
Content-Type: application/pdf
Content-Disposition: attachment; filename="<filename>.pdf"
```

### Filename Handling

- If `?filename=invoice-001` is provided, the download is served as `invoice-001.pdf`
- If no `filename` query param is given, it defaults to `<jobId>.pdf`
- The `.pdf` extension is always appended if missing
- Filename is sanitized: only alphanumeric characters, dashes (`-`), and underscores (`_`) are allowed — all other characters are replaced with `_`

### Streaming Approach

The file is streamed directly to the response using `fs.createReadStream` piped to `res`. The file is never fully buffered in memory, making it safe for large PDFs.

### Deletion After Download

The PDF file is deleted from disk only after the response `finish` event fires — guaranteeing the stream has fully flushed to the client before the file is removed. This prevents the previous bug where deletion could race with streaming.

### Pre-flight Checks

Before streaming, the endpoint:
1. Validates `jobId` format (alphanumeric + dashes only)
2. Checks Redis for job status — returns `400` if the job is not `done`
3. Checks the file exists on disk — returns `404` if missing
4. Resolves and validates the file path stays within the output directory (prevents path traversal)

---

### POST `/internal/job-status`

Used by the `pdf-worker` to update job status in Redis.

**Headers:**
```
x-internal-token: <PDF_INTERNAL_TOKEN>
```

**Request body:**
```json
{
  "job_id": "uuid-v4",
  "status": "done"
}
```

**Response `200`:**
```json
{ "ok": true }
```

**Response `401`:** Missing or invalid token.
**Response `400`:** Missing `job_id` or `status`.

---

## Project Structure

```
pdf-service/
├── middleware/
│   └── validateRequest.js   # Validates html + meta before enqueuing
├── queue/
│   └── pdfQueue.js          # BullMQ queue + Redis connection setup
├── routes/
│   ├── pdf.js               # /pdf/* public routes (generate, status, download)
│   └── internal.js          # /internal/* worker callback route
├── redis.js                 # Shared ioredis client
├── server.js                # Express app entry point
└── .env                     # Environment variables (not committed)
```

---

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `PORT` | No | `4000` | Port the server listens on |
| `REDIS_URL` | Yes | — | Redis connection URL |
| `PDF_INTERNAL_TOKEN` | Yes | — | Shared secret for internal worker callbacks |
| `PDF_OUTPUT_DIR` | Yes | — | Absolute or relative path to the directory where `pdf-worker` writes output PDFs |

---

## Deployment Note

`pdf-service` and `pdf-worker` can run on separate servers. When they do:

- `PDF_OUTPUT_DIR` must point to a **shared filesystem** (e.g. a mounted NFS volume, EFS, or equivalent) that both services can read and write
- `REDIS_URL` must point to the same Redis instance so job status is visible to both services
- `PDF_INTERNAL_TOKEN` must be identical in both services
- If running on the same machine, `PDF_OUTPUT_DIR` can be a relative path (e.g. `../pdf-worker/output`)

---

## Dependencies

| Package | Purpose |
|---|---|
| `express` | HTTP server |
| `bullmq` | Job queue backed by Redis |
| `ioredis` | Redis client |
| `dotenv` | Environment variable loading |
| `cors` | Cross-origin request support |
| `sanitize-html` | HTML sanitization (available for use in worker) |
