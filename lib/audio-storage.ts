import { createHash, createHmac } from "node:crypto";
import "server-only";

export type StoredAudioObject = {
  key: string;
  url: string | null;
};

type SpacesConfig = {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  publicBaseUrl: string | null;
};

function cleanEnv(name: string): string {
  return (process.env[name] ?? "").trim().replace(/^"|"$/g, "");
}

function readSpacesConfig(): SpacesConfig | null {
  const endpoint = cleanEnv("SPACES_ENDPOINT") || cleanEnv("DO_SPACES_ENDPOINT");
  const bucket = cleanEnv("SPACES_BUCKET") || cleanEnv("DO_SPACES_BUCKET");
  const accessKeyId = cleanEnv("SPACES_ACCESS_KEY_ID") || cleanEnv("DO_SPACES_ACCESS_KEY_ID");
  const secretAccessKey = cleanEnv("SPACES_SECRET_ACCESS_KEY") || cleanEnv("DO_SPACES_SECRET_ACCESS_KEY");
  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) return null;
  return {
    endpoint: endpoint.replace(/\/+$/, ""),
    region: cleanEnv("SPACES_REGION") || cleanEnv("DO_SPACES_REGION") || "sgp1",
    bucket,
    accessKeyId,
    secretAccessKey,
    publicBaseUrl: (cleanEnv("SPACES_PUBLIC_BASE_URL") || cleanEnv("DO_SPACES_PUBLIC_BASE_URL") || "").replace(/\/+$/, "") || null,
  };
}

export function isAudioObjectStorageEnabled(): boolean {
  return Boolean(readSpacesConfig());
}

function isoBasic(date = new Date()): { amzDate: string; dateStamp: string } {
  const iso = date.toISOString().replace(/[:-]|\.\d{3}/g, "");
  return {
    amzDate: iso,
    dateStamp: iso.slice(0, 8),
  };
}

function hmac(key: Buffer | string, value: string): Buffer {
  return createHmac("sha256", key).update(value, "utf8").digest();
}

function signingKey(secret: string, dateStamp: string, region: string): Buffer {
  const kDate = hmac(`AWS4${secret}`, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, "s3");
  return hmac(kService, "aws4_request");
}

function sha256Hex(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function encodeKeyPath(key: string): string {
  return key.split("/").map(encodeURIComponent).join("/");
}

function objectUrl(config: SpacesConfig, key: string): string {
  const endpoint = new URL(config.endpoint);
  const bucketPrefix = `${config.bucket}.`;
  const basePath = endpoint.hostname.startsWith(bucketPrefix)
    ? endpoint.pathname.replace(/\/+$/, "")
    : `${endpoint.pathname.replace(/\/+$/, "")}/${encodeURIComponent(config.bucket)}`;
  endpoint.pathname = `${basePath}/${encodeKeyPath(key)}`.replace(/\/{2,}/g, "/");
  endpoint.search = "";
  endpoint.hash = "";
  return endpoint.toString();
}

function publicUrl(config: SpacesConfig, key: string): string | null {
  if (!config.publicBaseUrl) return null;
  return `${config.publicBaseUrl}/${encodeKeyPath(key)}`;
}

function buildSignedHeaders(input: {
  config: SpacesConfig;
  method: "GET" | "PUT" | "DELETE";
  key: string;
  payloadHash: string;
  contentType?: string;
}): Headers {
  const { amzDate, dateStamp } = isoBasic();
  const url = new URL(objectUrl(input.config, input.key));
  const headers = new Headers();
  headers.set("host", url.host);
  headers.set("x-amz-content-sha256", input.payloadHash);
  headers.set("x-amz-date", amzDate);
  if (input.contentType) headers.set("content-type", input.contentType);

  const canonicalHeaders = [...headers.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, value]) => `${name}:${value.trim()}\n`)
    .join("");
  const signedHeaders = [...headers.keys()].sort().join(";");
  const canonicalRequest = [
    input.method,
    url.pathname,
    "",
    canonicalHeaders,
    signedHeaders,
    input.payloadHash,
  ].join("\n");
  const credentialScope = `${dateStamp}/${input.config.region}/s3/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join("\n");
  const signature = createHmac("sha256", signingKey(input.config.secretAccessKey, dateStamp, input.config.region))
    .update(stringToSign, "utf8")
    .digest("hex");

  headers.set(
    "authorization",
    `AWS4-HMAC-SHA256 Credential=${input.config.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
  );
  return headers;
}

function safePathPart(value: string | null | undefined, fallback: string): string {
  const cleaned = value
    ?.trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96);
  return cleaned || fallback;
}

export function buildAudioObjectKey(input: {
  scope: "generation" | "batch-item" | "merged";
  userId: string;
  id: string;
  fileName?: string | null;
}): string {
  const day = new Date().toISOString().slice(0, 10).replace(/-/g, "/");
  const user = safePathPart(input.userId, "user");
  const id = safePathPart(input.id, "audio");
  const fileName = safePathPart(input.fileName, `${id}.wav`);
  const finalName = fileName.toLowerCase().endsWith(".wav") ? fileName : `${fileName}.wav`;
  return `audio/${input.scope}/${day}/${user}/${id}/${finalName}`;
}

export async function putAudioObject(input: {
  key: string;
  bytes: Uint8Array;
  contentType: string;
}): Promise<StoredAudioObject | null> {
  const config = readSpacesConfig();
  if (!config) return null;
  const payloadHash = sha256Hex(input.bytes);
  const body = new Blob([Buffer.from(input.bytes)], { type: input.contentType });
  const response = await fetch(objectUrl(config, input.key), {
    method: "PUT",
    headers: buildSignedHeaders({
      config,
      method: "PUT",
      key: input.key,
      payloadHash,
      contentType: input.contentType,
    }),
    body,
  });
  if (!response.ok) {
    const preview = await response.text().catch(() => "");
    throw new Error(`Spaces upload failed with HTTP ${response.status}${preview ? `: ${preview.slice(0, 160)}` : ""}`);
  }
  return {
    key: input.key,
    url: publicUrl(config, input.key),
  };
}

export async function getAudioObjectBytes(key: string): Promise<Uint8Array | null> {
  const config = readSpacesConfig();
  if (!config || !key.trim()) return null;
  const payloadHash = sha256Hex("");
  const response = await fetch(objectUrl(config, key), {
    method: "GET",
    headers: buildSignedHeaders({
      config,
      method: "GET",
      key,
      payloadHash,
    }),
  });
  if (!response.ok) {
    if (response.status === 404) return null;
    const preview = await response.text().catch(() => "");
    throw new Error(`Spaces download failed with HTTP ${response.status}${preview ? `: ${preview.slice(0, 160)}` : ""}`);
  }
  return new Uint8Array(await response.arrayBuffer());
}

export async function deleteAudioObject(key: string): Promise<boolean> {
  const config = readSpacesConfig();
  if (!config || !key.trim()) return false;
  const payloadHash = sha256Hex("");
  const response = await fetch(objectUrl(config, key), {
    method: "DELETE",
    headers: buildSignedHeaders({
      config,
      method: "DELETE",
      key,
      payloadHash,
    }),
  });
  return response.ok || response.status === 404;
}

export async function resolveAudioBytes(input: {
  audioBase64?: string | null;
  audioObjectKey?: string | null;
}): Promise<Uint8Array | null> {
  if (input.audioObjectKey) {
    const bytes = await getAudioObjectBytes(input.audioObjectKey);
    if (bytes) return bytes;
  }
  if (input.audioBase64) {
    return new Uint8Array(Buffer.from(input.audioBase64, "base64"));
  }
  return null;
}
