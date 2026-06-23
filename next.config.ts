import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import type { NextConfig } from "next";

const projectRoot = dirname(fileURLToPath(import.meta.url));

const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com data:",
      "img-src 'self' data: https: blob: https://lh3.googleusercontent.com",
      "media-src 'self' data: blob:",
      "connect-src 'self' https:",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
  },
  {
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    // OWASP now recommends disabling the legacy XSS auditor: it has been removed
    // from modern browsers and the `1; mode=block` filter can introduce XS-Leak
    // vulnerabilities in older ones. The Content-Security-Policy above is the
    // real XSS protection. See owasp.org/www-project-secure-headers.
    key: "X-XSS-Protection",
    value: "0",
  },
  {
    key: "X-Frame-Options",
    value: "DENY",
  },
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(self), geolocation=()",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
];

const nextConfig: NextConfig = {
  devIndicators: false,
  output: "standalone",
  poweredByHeader: false,
  turbopack: {
    root: projectRoot,
    ignoreIssue: [
      {
        path: "**/lib/tts-provider.ts",
      },
    ],
  },
  outputFileTracingIncludes: {
    "/api/admin/system/test": ["./node_modules/ffmpeg-static/ffmpeg*"],
    "/api/generate": [
      "./node_modules/ffmpeg-static/ffmpeg*",
      "./lib/preset-voices/**/*",
    ],
    "/api/generate-clone": [
      "./node_modules/ffmpeg-static/ffmpeg*",
      "./lib/preset-voices/**/*",
    ],
    "/api/internal/jobs/process": [
      "./node_modules/ffmpeg-static/ffmpeg*",
      "./lib/preset-voices/**/*",
    ],
    "/api/v1/audio/**/*": [
      "./node_modules/ffmpeg-static/ffmpeg*",
      "./lib/preset-voices/**/*",
    ],
  },
  outputFileTracingExcludes: {
    "*": [
      ".env",
      ".env.*",
      "next.config.ts",
      "tsconfig.json",
      "tsconfig.tsbuildinfo",
      "eslint.config.mjs",
      "postcss.config.mjs",
      "vercel.json",
      "AGENTS.md",
      "CLAUDE.md",
      "DEPLOYMENT.md",
      "README.md",
      "STITCH_OUTPUT.html",
      "STITCH_PROMPTS.md",
      "Dockerfile",
      "Procfile",
      "docker-compose*.yml",
      "app/**/*",
      "lib/**/*.ts",
      "types/**/*",
      "data/**/*",
      "database/**/*",
      "deploy/**/*",
      "modal/**/*",
      "public/**/*",
      "scripts/**/*",
      "sdk/**/*",
      "artifacts/**/*",
      "scratch/**/*",
      "tmp_clone_verify/**/*",
      ".antigravitycli/**/*",
      "**/*.log",
      "**/*.jpg",
      "**/*.png",
    ],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
