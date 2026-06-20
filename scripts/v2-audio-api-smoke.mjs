#!/usr/bin/env node

function arg(name, fallback = "") {
  const index = process.argv.indexOf(`--${name}`);
  if (index >= 0 && process.argv[index + 1]) return process.argv[index + 1];
  return fallback;
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

function cleanEnv(name) {
  return (process.env[name] ?? "").trim().replace(/^"|"$/g, "");
}

async function readJson(response) {
  const text = await response.text();
  try {
    return { text, json: JSON.parse(text) };
  } catch {
    return { text, json: null };
  }
}

function fail(message, detail = "") {
  console.error(`FAIL ${message}`);
  if (detail) console.error(detail);
  process.exitCode = 1;
}

function pass(message, detail = "") {
  console.log(`PASS ${message}${detail ? `: ${detail}` : ""}`);
}

function longSmokeInput() {
  const sentence =
    "នេះជាការសាកល្បងប្រព័ន្ធ async API សម្រាប់អត្ថបទវែង ដើម្បីពិនិត្យការបំបែកជាផ្នែក ការគិតថ្លៃ និងការទាញយក WAV។ ";
  return sentence.repeat(90).slice(0, 8200);
}

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const baseUrl = arg("base-url", cleanEnv("APP_PUBLIC_URL") || "http://localhost:3000").replace(/\/$/, "");
  const apiKey = arg("api-key", cleanEnv("VOXTTS_API_KEY"));
  const wait = hasFlag("wait");
  const long = hasFlag("long");
  if (!apiKey) {
    console.log("SKIP v2 audio API smoke: set VOXTTS_API_KEY or pass --api-key.");
    return;
  }

  const input = long
    ? longSmokeInput()
    : "soursdey nih ku chea v2 async standard tts smoke test";

  const submit = await fetch(`${baseUrl}/api/v2/audio/jobs`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      input,
      voice: "female",
      output_format: "wav",
      title: long ? "V2 long audio API smoke" : "V2 audio API smoke",
    }),
  });
  const submitted = await readJson(submit);
  if (submit.status !== 202 || !submitted.json?.job_id || !submitted.json?.audio_url) {
    fail("v2 audio job submit", `HTTP ${submit.status}: ${submitted.text}`);
    return;
  }
  pass("v2 audio job queued", submitted.json.job_id);
  if (long && Number(submitted.json.job?.total_items ?? 0) < 2) {
    fail("v2 long text split", `Expected multiple items, got ${submitted.json.job?.total_items ?? "unknown"}.`);
    return;
  }
  if (Number(submitted.json.job?.credits_estimated ?? 0) <= 0) {
    fail("v2 token estimate", `Invalid credits_estimated: ${submitted.json.job?.credits_estimated}`);
    return;
  }
  pass("v2 token estimate", `${submitted.json.job.credits_estimated} credits estimated`);

  let statusBody = null;
  for (let attempt = 0; attempt < (wait ? 60 : 1); attempt += 1) {
    const status = await fetch(`${baseUrl}/api/v2/audio/jobs/${encodeURIComponent(submitted.json.job_id)}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    statusBody = await readJson(status);
    if (status.status !== 200 || statusBody.json?.job?.id !== submitted.json.job_id) {
      fail("v2 audio job status", `HTTP ${status.status}: ${statusBody.text}`);
      return;
    }
    const jobStatus = statusBody.json.job.status;
    if (!wait || jobStatus === "completed" || jobStatus === "partial" || jobStatus === "failed" || jobStatus === "needs_review") {
      break;
    }
    await sleep(3000);
  }
  pass("v2 audio job status", statusBody.json.job.status);
  if (statusBody.text.includes("audio_base64")) {
    fail("v2 status payload", "Status response contains audio_base64.");
    return;
  }

  const audio = await fetch(`${baseUrl}/api/v2/audio/jobs/${encodeURIComponent(submitted.json.job_id)}/audio`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (audio.status === 409) {
    pass("v2 audio download not ready", "409 JOB_NOT_READY");
    return;
  }
  if (audio.status !== 200 || !audio.headers.get("content-type")?.includes("audio/wav")) {
    const text = await audio.text().catch(() => "");
    fail("v2 audio download", `HTTP ${audio.status}: ${text}`);
    return;
  }
  const bytes = Buffer.from(await audio.arrayBuffer());
  if (bytes.length < 1024) {
    fail("v2 audio download size", `${bytes.length} bytes is too small for a usable WAV.`);
    return;
  }
  const seconds = Number(audio.headers.get("x-output-seconds") ?? 0);
  if (wait && seconds <= 0) {
    fail("v2 audio duration header", `x-output-seconds=${audio.headers.get("x-output-seconds")}`);
    return;
  }
  pass("v2 audio download", `${bytes.length.toLocaleString()} bytes, ${seconds || "unknown"} seconds`);
}

main().catch((error) => {
  fail("v2 audio API smoke crashed", error instanceof Error ? error.stack ?? error.message : String(error));
});
