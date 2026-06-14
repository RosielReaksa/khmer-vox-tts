import http from "k6/http";
import { check, sleep } from "k6";
import { Counter, Trend, Rate } from "k6/metrics";

// ----------------------------------------------------------------------------
// Khmer Vox TTS staging load test (ISOLATED fixer VPS, no real users).
// Hit the temporary NodePort directly so per-VU X-Forwarded-For reaches Next.js
// (Traefik strips spoofed XFF). Each VU = a distinct user/IP.
//
// MODE=web : signup + authenticated dashboard page loads, ramp 10->150 VUs.
//            NO generation -> does not flood the shared Modal GPU pool.
//            Answers: does the app/DB tier survive many concurrent users.
// MODE=e2e : exactly 100 users, ONE real generation each (100 jobs total),
//            polled to completion. Bounded GPU cost. Answers the literal
//            "100 users generate at once" question.
// ----------------------------------------------------------------------------

const BASE = __ENV.BASE || "http://178.128.103.120:32371";
const MODE = __ENV.MODE || "web";

const signupOk = new Rate("signup_ok");
const signupDur = new Trend("signup_duration", true);
const pageOk = new Rate("page_ok");
const enqueueOk = new Rate("enqueue_ok");
const enqueueDur = new Trend("enqueue_duration", true);
const jobDone = new Counter("jobs_completed");
const jobFail = new Counter("jobs_failed");
const jobE2E = new Trend("job_e2e_seconds", false);
const rateLimited = new Counter("rate_limited_429");

let scenarios;
if (MODE === "e2e") {
  // 100 users arrive together, each does one generation, then we wait it out.
  scenarios = {
    e2e: {
      executor: "per-vu-iterations",
      vus: 100,
      iterations: 1,
      maxDuration: "6m",
    },
  };
} else {
  scenarios = {
    web: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "1m", target: 10 },
        { duration: "2m", target: 25 },
        { duration: "2m", target: 50 },
        { duration: "2m", target: 100 },
        { duration: "2m", target: 150 },
        { duration: "1m", target: 0 },
      ],
      gracefulStop: "30s",
    },
  };
}

export const options = {
  scenarios,
  thresholds: {
    signup_ok: ["rate>0.95"],
    http_req_failed: ["rate<0.10"],
  },
};

const KHMER_TEXT = "សួស្តី នេះជាការសាកល្បងសម្រាប់បង្កើតសំឡេងខ្មែរជា MP3។";

function fakeIp() {
  return `100.${(__VU >> 8) & 255}.${__VU & 255}.${(__ITER % 254) + 1}`;
}

export default function () {
  const jar = http.cookieJar();
  const ip = fakeIp();
  const ipHeaders = { "X-Forwarded-For": ip };

  // 1) CSRF seed via uncached /app/signin (runs CSRF middleware, sets cookie).
  const seed = http.get(`${BASE}/app/signin`, { headers: ipHeaders });
  pageOk.add(seed.status === 200);
  if (seed.status === 429) rateLimited.add(1);
  const cookies = jar.cookiesForURL(`${BASE}/app/signin`);
  const csrf = cookies["csrf-token"] ? cookies["csrf-token"][0] : "";
  if (!csrf) {
    signupOk.add(false);
    return;
  }
  const headers = { "Content-Type": "application/json", "x-csrf-token": csrf, "X-Forwarded-For": ip };

  // 2) Signup (unique email -> unique user, gets 100 free tokens).
  const email = `load_${Date.now()}_${__VU}_${__ITER}_${Math.floor(Math.random() * 1e6)}@example.com`;
  const sres = http.post(
    `${BASE}/api/auth/signup`,
    JSON.stringify({ email, password: "TestPass12345" }),
    { headers },
  );
  signupDur.add(sres.timings.duration);
  if (sres.status === 429) rateLimited.add(1);
  const signedUp = sres.status === 200 && sres.body.includes('"ok":true');
  signupOk.add(signedUp);
  if (!signedUp) return;

  if (MODE === "web") {
    // Authenticated page loads to exercise web/DB under concurrency.
    const d = http.get(`${BASE}/app/dashboard`, { headers: ipHeaders });
    pageOk.add(d.status === 200);
    sleep(1);
    const h = http.get(`${BASE}/app/dashboard/history`, { headers: ipHeaders });
    pageOk.add(h.status === 200);
    sleep(1);
    return;
  }

  // MODE === "e2e": one real generation, poll to completion.
  const gres = http.post(
    `${BASE}/api/generate`,
    JSON.stringify({ text: KHMER_TEXT, voice: "female", model: "voxcpm2" }),
    { headers },
  );
  enqueueDur.add(gres.timings.duration);
  if (gres.status === 429) rateLimited.add(1);
  const queued = gres.status === 202 || (gres.status === 200 && gres.body.includes('"queued":true'));
  enqueueOk.add(queued);
  if (!queued) {
    jobFail.add(1);
    return;
  }
  let jobId = "";
  try {
    jobId = JSON.parse(gres.body).jobId || "";
  } catch (e) {
    jobId = "";
  }
  if (!jobId) {
    jobFail.add(1);
    return;
  }

  const startedAt = Date.now();
  for (let i = 0; i < 150; i++) {
    sleep(2);
    const pr = http.get(`${BASE}/api/batch/jobs/${jobId}`, { headers: ipHeaders });
    if (pr.status !== 200) continue;
    let job;
    try {
      job = JSON.parse(pr.body).job;
    } catch (e) {
      continue;
    }
    if (!job) continue;
    if (job.status === "completed" || job.status === "partial") {
      jobDone.add(1);
      jobE2E.add((Date.now() - startedAt) / 1000);
      return;
    }
    if (job.status === "failed" || job.status === "needs_review") {
      jobFail.add(1);
      return;
    }
  }
  jobFail.add(1); // timed out
}
