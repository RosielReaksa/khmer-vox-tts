import { randomBytes } from "crypto";
import { cookies } from "next/headers";
import "server-only";

export async function generateCsrfToken(): Promise<string> {
  const cookieStore = await cookies();
  const existing = cookieStore.get("csrf-token")?.value;
  if (existing) {
    return existing;
  }
  // Fallback if not set by middleware yet (Server Components cannot write cookies on render)
  return randomBytes(32).toString("hex");
}

export async function validateCsrfToken(request: Request): Promise<boolean> {
  const cookieStore = await cookies();
  const cookieToken = cookieStore.get("csrf-token")?.value;
  if (!cookieToken) return false;

  let requestToken: string | undefined;

  // Try reading from header
  const headerToken = request.headers.get("x-csrf-token");
  if (headerToken) {
    requestToken = headerToken;
  } else {
    // Try reading from body (JSON or form data)
    try {
      const clone = request.clone();
      const contentType = request.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        const body = await clone.json();
        requestToken = body.csrfToken || body.csrf_token;
      } else if (contentType.includes("application/x-www-form-urlencoded") || contentType.includes("multipart/form-data")) {
        const formData = await clone.formData();
        requestToken = formData.get("csrf_token") as string || formData.get("csrfToken") as string;
      }
    } catch {
      // ignore parsing error
    }
  }

  return requestToken === cookieToken;
}
