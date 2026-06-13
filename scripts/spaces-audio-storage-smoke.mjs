import { createHash, createHmac, randomUUID } from "node:crypto";

function cleanEnv(name) {
  return (process.env[name] ?? "").trim().replace(/^"|"$/g, "");
}

function readConfig() {
  const endpoint = cleanEnv("SPACES_ENDPOINT") || cleanEnv("DO_SPACES_ENDPOINT");
  const bucket = cleanEnv("SPACES_BUCKET") || cleanEnv("DO_SPACES_BUCKET");
  const accessKeyId = cleanEnv("SPACES_ACCESS_KEY_ID") || cleanEnv("DO_SPACES_ACCESS_KEY_ID");
  const secretAccessKey = cleanEnv("SPACES_SECRET_ACCESS_KEY") || cleanEnv("DO_SPACES_SECRET_ACCESS_KEY");
  const region = cleanEnv("SPACES_REGION") || cleanEnv("DO_SPACES_REGION") || "sgp1";
  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) return null;
  return {
    endpoint: endpoint.replace(/\/+$/, ""),
    bucket,
    accessKeyId,
    secretAccessKey,
    region,
  };
}

function encodeKeyPath(key) {
  return key.split("/").map(encodeURIComponent).join("/");
}

function objectUrl(config, key) {
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

function sha256Hex(value) {
  return createHash("sha256").update(value).digest("hex");
}

function hmac(key, value) {
  return createHmac("sha256", key).update(value, "utf8").digest();
}

function signingKey(secret, dateStamp, region) {
  const kDate = hmac(`AWS4${secret}`, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, "s3");
  return hmac(kService, "aws4_request");
}

function isoBasic(date = new Date()) {
  const iso = date.toISOString().replace(/[:-]|\.\d{3}/g, "");
  return {
    amzDate: iso,
    dateStamp: iso.slice(0, 8),
  };
}

function signedHeaders(config, method, key, payloadHash, contentType) {
  const { amzDate, dateStamp } = isoBasic();
  const url = new URL(objectUrl(config, key));
  const headers = new Headers();
  headers.set("host", url.host);
  headers.set("x-amz-content-sha256", payloadHash);
  headers.set("x-amz-date", amzDate);
  if (contentType) headers.set("content-type", contentType);

  const canonicalHeaders = [...headers.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, value]) => `${name}:${value.trim()}\n`)
    .join("");
  const signedHeaderNames = [...headers.keys()].sort().join(";");
  const canonicalRequest = [
    method,
    url.pathname,
    "",
    canonicalHeaders,
    signedHeaderNames,
    payloadHash,
  ].join("\n");
  const credentialScope = `${dateStamp}/${config.region}/s3/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join("\n");
  const signature = createHmac("sha256", signingKey(config.secretAccessKey, dateStamp, config.region))
    .update(stringToSign, "utf8")
    .digest("hex");

  headers.set(
    "authorization",
    `AWS4-HMAC-SHA256 Credential=${config.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaderNames}, Signature=${signature}`,
  );
  return headers;
}

async function request(config, method, key, body, contentType) {
  const payloadHash = sha256Hex(body ?? "");
  return fetch(objectUrl(config, key), {
    method,
    headers: signedHeaders(config, method, key, payloadHash, contentType),
    body,
  });
}

const config = readConfig();
if (!config) {
  console.log("SKIP: Spaces env vars are not configured.");
  process.exit(0);
}

const key = `audio/smoke/${new Date().toISOString().slice(0, 10)}/${randomUUID()}.txt`;
const payload = Buffer.from(`khmer-vox-storage-smoke ${Date.now()}`, "utf8");

try {
  const put = await request(config, "PUT", key, payload, "text/plain; charset=utf-8");
  if (!put.ok) {
    throw new Error(`PUT failed HTTP ${put.status}: ${(await put.text()).slice(0, 200)}`);
  }

  const get = await request(config, "GET", key, undefined, undefined);
  if (!get.ok) {
    throw new Error(`GET failed HTTP ${get.status}: ${(await get.text()).slice(0, 200)}`);
  }
  const downloaded = Buffer.from(await get.arrayBuffer());
  if (!downloaded.equals(payload)) {
    throw new Error("Downloaded object did not match uploaded payload.");
  }

  const del = await request(config, "DELETE", key, undefined, undefined);
  if (!del.ok && del.status !== 404) {
    throw new Error(`DELETE failed HTTP ${del.status}: ${(await del.text()).slice(0, 200)}`);
  }

  console.log(`OK: Spaces storage smoke passed for ${key}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
