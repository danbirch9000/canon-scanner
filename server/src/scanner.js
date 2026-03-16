import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";

const rootDir = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const scansDir = path.join(rootDir, "scans");

const colorModes = {
  color: "Color",
  gray: "Gray"
};

const pdfCompression = {
  high: "/screen",
  medium: "/ebook",
  low: "/printer",
  none: null
};

const sessions = new Map();

function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { ...options, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }

      reject(new Error(`${command} exited with code ${code}: ${stderr || stdout}`.trim()));
    });
  });
}

async function streamCommandToFile(command, args, outputPath) {
  await fs.mkdir(path.dirname(outputPath), { recursive: true });

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    const stream = fs.open(outputPath, "w").then((handle) => handle.createWriteStream());
    let stderr = "";

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    stream
      .then((fileStream) => {
        child.stdout.pipe(fileStream);

        fileStream.on("error", reject);
        child.on("error", reject);
        child.on("close", (code) => {
          fileStream.close();
          if (code === 0) {
            resolve();
            return;
          }

          reject(new Error(`${command} exited with code ${code}: ${stderr}`.trim()));
        });
      })
      .catch(reject);
  });
}

function sanitizeFilename(value, fallback = "scan") {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || fallback;
}

function getScannerArgs({ device, mode, resolution }) {
  const args = ["--format=pnm", "--mode", colorModes[mode] || colorModes.color, "--resolution", String(resolution || 300)];
  if (device) {
    args.unshift(device);
    args.unshift("--device");
  }
  return args;
}

async function convertPnmToOutput({ sourcePath, targetPath, format, compression = "medium" }) {
  if (format === "png") {
    await runCommand("magick", ["convert", "-resize", "1200x1200", "-quality", "85", sourcePath, targetPath]);
    return [targetPath];
  }

  const tempPdf = targetPath.replace(/\.pdf$/, ".tmp.pdf");
  await runCommand("magick", ["convert", "-resize", "1200x1200", "-quality", "85", sourcePath, tempPdf]);

  const pdfSetting = pdfCompression[compression] ?? pdfCompression.medium;
  if (pdfSetting) {
    await runCommand("gs", [
      "-sDEVICE=pdfwrite",
      "-dCompatibilityLevel=1.4",
      `-dPDFSETTINGS=${pdfSetting}`,
      "-dNOPAUSE",
      "-dQUIET",
      "-dBATCH",
      `-sOutputFile=${targetPath}`,
      tempPdf
    ]);
    await fs.rm(tempPdf, { force: true });
  } else {
    await fs.rename(tempPdf, targetPath);
  }

  return [targetPath];
}

async function convertMultiPagePnms({ pnmPaths, filename, format, compression = "medium" }) {
  if (pnmPaths.length === 0) {
    throw new Error("No scanned pages are available to convert.");
  }

  if (format === "png") {
    const results = [];
    for (let index = 0; index < pnmPaths.length; index += 1) {
      const outputPath = path.join(scansDir, `${filename}-page-${index + 1}.png`);
      await runCommand("magick", ["convert", "-resize", "1200x1200", "-quality", "85", pnmPaths[index], outputPath]);
      results.push(outputPath);
    }
    return results;
  }

  const tempPdf = path.join(scansDir, `${filename}.tmp.pdf`);
  const outputPath = path.join(scansDir, `${filename}.pdf`);
  await runCommand("magick", ["convert", "-resize", "1200x1200", "-quality", "85", ...pnmPaths, tempPdf]);

  const pdfSetting = pdfCompression[compression] ?? pdfCompression.medium;
  if (pdfSetting) {
    await runCommand("gs", [
      "-sDEVICE=pdfwrite",
      "-dCompatibilityLevel=1.4",
      `-dPDFSETTINGS=${pdfSetting}`,
      "-dNOPAUSE",
      "-dQUIET",
      "-dBATCH",
      `-sOutputFile=${outputPath}`,
      tempPdf
    ]);
    await fs.rm(tempPdf, { force: true });
  } else {
    await fs.rename(tempPdf, outputPath);
  }

  return [outputPath];
}

export async function ensureDirectories() {
  await fs.mkdir(scansDir, { recursive: true });
}

export async function listScanners() {
  const { stdout } = await runCommand("scanimage", ["-L"]);
  return stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^device `([^']+)' is (.+)$/);
      if (!match) {
        return { id: line, label: line };
      }
      return { id: match[1], label: match[2] };
    });
}

export async function listFiles() {
  await ensureDirectories();
  const entries = await fs.readdir(scansDir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (!entry.isFile()) {
      continue;
    }

    const fullPath = path.join(scansDir, entry.name);
    const stat = await fs.stat(fullPath);
    files.push({
      name: entry.name,
      size: stat.size,
      modifiedAt: stat.mtime.toISOString(),
      url: `/files/${encodeURIComponent(entry.name)}`
    });
  }

  return files.sort((a, b) => new Date(b.modifiedAt) - new Date(a.modifiedAt));
}

export async function scanSinglePage(options) {
  await ensureDirectories();

  const filename = sanitizeFilename(options.filename, "scan");
  const format = options.format === "png" ? "png" : "pdf";
  const pnmPath = path.join(scansDir, `${filename}.pnm`);
  const outputPath = path.join(scansDir, `${filename}.${format}`);

  await streamCommandToFile("scanimage", getScannerArgs(options), pnmPath);

  try {
    const outputs = await convertPnmToOutput({
      sourcePath: pnmPath,
      targetPath: outputPath,
      format,
      compression: options.compression
    });

    return outputs.map((filePath) => ({
      name: path.basename(filePath),
      url: `/files/${encodeURIComponent(path.basename(filePath))}`
    }));
  } finally {
    await fs.rm(pnmPath, { force: true });
  }
}

export async function startSession(options) {
  const sessionId = randomUUID();
  const filename = sanitizeFilename(options.filename, "scan");
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "scanner-session-"));

  const session = {
    id: sessionId,
    filename,
    format: options.format === "png" ? "png" : "pdf",
    compression: options.compression || "medium",
    device: options.device || "",
    mode: options.mode || "color",
    resolution: Number(options.resolution) || 300,
    tempDir,
    pages: []
  };

  sessions.set(sessionId, session);
  return session;
}

export function getSession(sessionId) {
  return sessions.get(sessionId) || null;
}

export async function addPageToSession(sessionId) {
  const session = getSession(sessionId);
  if (!session) {
    throw new Error("Scan session was not found.");
  }

  const pagePath = path.join(session.tempDir, `page-${session.pages.length + 1}.pnm`);
  await streamCommandToFile(
    "scanimage",
    getScannerArgs({
      device: session.device,
      mode: session.mode,
      resolution: session.resolution
    }),
    pagePath
  );

  session.pages.push(pagePath);
  return { pageCount: session.pages.length };
}

export async function finishSession(sessionId) {
  const session = getSession(sessionId);
  if (!session) {
    throw new Error("Scan session was not found.");
  }

  try {
    const outputs = await convertMultiPagePnms({
      pnmPaths: session.pages,
      filename: session.filename,
      format: session.format,
      compression: session.compression
    });

    return {
      pageCount: session.pages.length,
      files: outputs.map((filePath) => ({
        name: path.basename(filePath),
        url: `/files/${encodeURIComponent(path.basename(filePath))}`
      }))
    };
  } finally {
    await cleanupSession(sessionId);
  }
}

export async function cleanupSession(sessionId) {
  const session = getSession(sessionId);
  if (!session) {
    return;
  }

  sessions.delete(sessionId);
  await fs.rm(session.tempDir, { recursive: true, force: true });
}

