import crypto from "node:crypto";
import {
  createReadStream,
  createWriteStream,
} from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { Transform, Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import { HttpError } from "./http-error.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const localMediaRoot = path.resolve(__dirname, "../storage/station-media");

export function localMediaPathForObjectKey(objectKey) {
  const key = String(objectKey || "").replaceAll("\\", "/");
  if (!key || key.startsWith("/") || key.split("/").includes("..")) {
    throw new HttpError(400, "Invalid local media object key");
  }
  const target = path.resolve(localMediaRoot, key);
  if (!target.startsWith(`${localMediaRoot}${path.sep}`)) {
    throw new HttpError(400, "Invalid local media object key");
  }
  return target;
}

export async function writeLocalMediaObject({
  objectKey,
  readable,
  expectedBytes = null,
  maxBytes,
}) {
  const target = localMediaPathForObjectKey(objectKey);
  const temporary = `${target}.${crypto.randomUUID()}.upload`;
  await fs.mkdir(path.dirname(target), { recursive: true });

  let byteSize = 0;
  const limiter = new Transform({
    transform(chunk, _encoding, callback) {
      byteSize += chunk.length;
      if (byteSize > maxBytes) {
        callback(new HttpError(413, "Local media upload exceeds the size limit"));
        return;
      }
      callback(null, chunk);
    },
  });

  try {
    await pipeline(readable, limiter, createWriteStream(temporary, { flags: "wx" }));
    if (expectedBytes !== null && byteSize !== expectedBytes) {
      throw new HttpError(409, "Uploaded media size does not match");
    }
    await fs.rename(temporary, target);
  } catch (error) {
    await fs.rm(temporary, { force: true }).catch(() => undefined);
    throw error;
  }

  return { byteSize };
}

export async function inspectLocalMediaObject({ objectKey, contentType }) {
  const target = localMediaPathForObjectKey(objectKey);
  let stats;
  try {
    stats = await fs.stat(target);
  } catch (error) {
    if (error?.code === "ENOENT") {
      throw new HttpError(409, "Uploaded media was not found in local storage");
    }
    throw error;
  }
  return {
    contentType,
    contentLength: stats.size,
    etag: `"local-${stats.size}-${Math.floor(stats.mtimeMs)}"`,
  };
}

export async function fetchLocalMediaObject({
  objectKey,
  contentType,
  range = "",
}) {
  const target = localMediaPathForObjectKey(objectKey);
  let stats;
  try {
    stats = await fs.stat(target);
  } catch (error) {
    if (error?.code === "ENOENT") {
      throw new HttpError(404, "Media asset file not found");
    }
    throw error;
  }

  let start = 0;
  let end = Math.max(0, stats.size - 1);
  let status = 200;
  if (range) {
    if (stats.size === 0) {
      throw new HttpError(416, "Media byte range is not satisfiable");
    }
    const value = range.slice("bytes=".length);
    const [rawStart, rawEnd] = value.split("-", 2);
    if (!rawStart) {
      const suffixLength = Number(rawEnd);
      start = Math.max(0, stats.size - suffixLength);
    } else {
      start = Number(rawStart);
      end = rawEnd ? Math.min(Number(rawEnd), stats.size - 1) : stats.size - 1;
    }
    if (!Number.isInteger(start) || start < 0 || start >= stats.size || end < start) {
      throw new HttpError(416, "Media byte range is not satisfiable");
    }
    status = 206;
  }

  const contentLength = status === 206 ? end - start + 1 : stats.size;
  const headers = new Headers({
    "accept-ranges": "bytes",
    "content-length": String(contentLength),
    "content-type": contentType || "application/octet-stream",
    etag: `"local-${stats.size}-${Math.floor(stats.mtimeMs)}"`,
    "last-modified": stats.mtime.toUTCString(),
  });
  if (status === 206) {
    headers.set("content-range", `bytes ${start}-${end}/${stats.size}`);
  }
  const stream = createReadStream(
    target,
    status === 206 ? { start, end } : undefined,
  );
  return {
    status,
    headers,
    body: Readable.toWeb(stream),
  };
}

export async function deleteLocalMediaObject(objectKey) {
  const target = localMediaPathForObjectKey(objectKey);
  await fs.rm(target, { force: true });
}
