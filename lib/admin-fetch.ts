"use client";

function getCsrfToken(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(/(?:^|;\s*)csrf-token=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : null;
}

async function adminFetch(
  url: string,
  options: RequestInit = {},
): Promise<Response> {
  const csrfToken = getCsrfToken();
  const headers = new Headers(options.headers);

  if (csrfToken) {
    headers.set("x-csrf-token", csrfToken);
  }

  return fetch(url, { ...options, headers });
}

export async function adminPost(
  url: string,
  body?: unknown,
): Promise<Response> {
  return adminFetch(url, {
    method: "POST",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
}

export async function adminPatch(
  url: string,
  body?: unknown,
): Promise<Response> {
  return adminFetch(url, {
    method: "PATCH",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
}
