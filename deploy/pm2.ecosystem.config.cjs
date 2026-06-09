module.exports = {
  apps: [
    {
      name: "khmer-vox-tts-web",
      script: "node_modules/next/dist/bin/next",
      args: "start -p 3000",
      env: {
        NODE_ENV: "production",
        DISABLE_INLINE_JOB_WORKER: "true",
      },
    },
    {
      name: "khmer-vox-tts-worker",
      script: "scripts/job-worker.mjs",
      args: "--loop",
      env: {
        NODE_ENV: "production",
        JOB_WORKER_BASE_URL: "http://127.0.0.1:3000",
      },
    },
  ],
};
