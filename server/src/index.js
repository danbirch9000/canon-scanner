import path from "node:path";
import express from "express";
import cors from "cors";
import morgan from "morgan";
import {
  addPageToSession,
  cleanupSession,
  ensureDirectories,
  finishSession,
  getSession,
  listFiles,
  listScanners,
  scanSinglePage,
  startSession
} from "./scanner.js";

const app = express();
const port = Number(process.env.PORT) || 3030;
const host = process.env.HOST || "127.0.0.1";
const rootDir = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const scansDir = path.join(rootDir, "scans");
const webDistDir = path.join(rootDir, "web", "dist");

app.use(cors());
app.use(express.json());
app.use(morgan("dev"));

app.get("/api/health", async (_req, res) => {
  try {
    await ensureDirectories();
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.get("/api/scanners", async (_req, res) => {
  try {
    const scanners = await listScanners();
    res.json({ scanners });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/files", async (_req, res) => {
  try {
    const files = await listFiles();
    res.json({ files });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/scan", async (req, res) => {
  try {
    const files = await scanSinglePage(req.body ?? {});
    res.status(201).json({ files });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/scan/multipage/start", async (req, res) => {
  try {
    const session = await startSession(req.body ?? {});
    res.status(201).json({
      sessionId: session.id,
      pageCount: session.pages.length,
      filename: session.filename,
      format: session.format
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/scan/multipage/:sessionId/page", async (req, res) => {
  try {
    const result = await addPageToSession(req.params.sessionId);
    res.status(201).json(result);
  } catch (error) {
    res.status(error.message.includes("not found") ? 404 : 500).json({ error: error.message });
  }
});

app.post("/api/scan/multipage/:sessionId/finish", async (req, res) => {
  try {
    const result = await finishSession(req.params.sessionId);
    res.status(201).json(result);
  } catch (error) {
    res.status(error.message.includes("not found") ? 404 : 500).json({ error: error.message });
  }
});

app.delete("/api/scan/multipage/:sessionId", async (req, res) => {
  try {
    const session = getSession(req.params.sessionId);
    if (!session) {
      res.status(404).json({ error: "Scan session was not found." });
      return;
    }

    await cleanupSession(req.params.sessionId);
    res.status(204).end();
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.use("/files", express.static(scansDir));
app.use(express.static(webDistDir));

app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api/")) {
    next();
    return;
  }
  res.sendFile(path.join(webDistDir, "index.html"));
});

await ensureDirectories();

app.listen(port, host, () => {
  console.log(`Scanner server listening on http://${host}:${port}`);
});
