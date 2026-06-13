import "server-only";

export const PUBLIC_AUDIO_OUTPUT_FORMAT = "mp3" as const;
export const PUBLIC_AUDIO_CONTENT_TYPE = "audio/mpeg";

function cleanEnv(name: string): string {
  return (process.env[name] ?? "").trim().replace(/^"|"$/g, "");
}

export function appPublicBaseUrl(): string | null {
  const configured = cleanEnv("APP_PUBLIC_URL") || cleanEnv("NEXT_PUBLIC_APP_URL");
  if (configured) return configured.replace(/\/$/, "");
  const vercelUrl = cleanEnv("VERCEL_URL");
  return vercelUrl ? `https://${vercelUrl.replace(/\/$/, "")}` : null;
}

export function publicBatchJobUrls(jobId: string): {
  status_url: string | null;
  download_url: string | null;
  audio_url: string | null;
  zip_url: string | null;
  v2_status_url: string | null;
  v2_audio_url: string | null;
} {
  const baseUrl = appPublicBaseUrl();
  return {
    status_url: baseUrl ? `${baseUrl}/api/v1/audio/batch/jobs/${jobId}` : null,
    download_url: baseUrl ? `${baseUrl}/api/v1/audio/batch/jobs/${jobId}/download` : null,
    audio_url: baseUrl ? `${baseUrl}/api/v2/audio/jobs/${jobId}/audio` : null,
    zip_url: baseUrl ? `${baseUrl}/api/v1/audio/batch/jobs/${jobId}/download` : null,
    v2_status_url: baseUrl ? `${baseUrl}/api/v2/audio/jobs/${jobId}` : null,
    v2_audio_url: baseUrl ? `${baseUrl}/api/v2/audio/jobs/${jobId}/audio` : null,
  };
}

export function isUnsupportedPublicAudioOutputFormat(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value !== "string") return true;
  const normalized = value.trim().toLowerCase();
  return Boolean(normalized) && normalized !== PUBLIC_AUDIO_OUTPUT_FORMAT;
}
