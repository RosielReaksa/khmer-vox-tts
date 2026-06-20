import "server-only";

export const PUBLIC_AUDIO_OUTPUT_FORMAT = "wav" as const;
export const PUBLIC_AUDIO_CONTENT_TYPE = "audio/wav";

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
  // Public output is now WAV only, but the output_format request field is
  // accepted for backward compatibility and ignored (the API always returns
  // WAV regardless of what the caller requests). Nothing a caller sends is
  // treated as unsupported, so this gate never rejects.
  void value;
  return false;
}
