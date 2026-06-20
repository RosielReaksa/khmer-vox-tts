import nodemailer, { type Transporter } from "nodemailer";
import "server-only";

type PasswordResetEmailInput = {
  email: string;
  rawToken: string;
};

type PasswordResetEmailMessage = {
  to: string;
  subject: string;
  text: string;
  html: string;
};

let cachedTransporter: Transporter | null = null;

function cleanEnv(name: string): string {
  return process.env[name]?.trim().replace(/^"|"$/g, "") ?? "";
}

function booleanEnv(name: string, fallback = false): boolean {
  const value = cleanEnv(name).toLowerCase();
  if (["1", "true", "yes", "on"].includes(value)) return true;
  if (["0", "false", "no", "off"].includes(value)) return false;
  return fallback;
}

function emailProvider(): "smtp" | "google_apps_script" {
  return cleanEnv("PASSWORD_RESET_EMAIL_PROVIDER").toLowerCase() === "google_apps_script"
    ? "google_apps_script"
    : "smtp";
}

function emailTimeoutMs(): number {
  const value = Number(cleanEnv("PASSWORD_RESET_EMAIL_TIMEOUT_MS"));
  return Number.isInteger(value) && value >= 5_000 && value <= 60_000 ? value : 15_000;
}

function smtpPort(): number {
  const value = Number(cleanEnv("SMTP_PORT"));
  return Number.isInteger(value) && value > 0 && value <= 65_535 ? value : 587;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function fromAddress(): string {
  return cleanEnv("SMTP_FROM_EMAIL") || cleanEnv("SMTP_USER");
}

function resetBaseUrl(): URL {
  const configured = cleanEnv("PASSWORD_RESET_PUBLIC_URL") || cleanEnv("APP_PUBLIC_URL");
  if (!configured) {
    throw new Error("PASSWORD_RESET_PUBLIC_URL or APP_PUBLIC_URL is required for password reset links.");
  }

  const url = new URL(configured);
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("Password reset public URL must use HTTP or HTTPS.");
  }
  if (
    process.env.NODE_ENV === "production" &&
    url.protocol !== "https:" &&
    !booleanEnv("PASSWORD_RESET_ALLOW_INSECURE_HTTP")
  ) {
    throw new Error("Password reset links require HTTPS in production.");
  }
  return url;
}

function transporter(): Transporter {
  if (cachedTransporter) return cachedTransporter;

  const smtpUrl = cleanEnv("SMTP_URL");
  if (smtpUrl) {
    cachedTransporter = nodemailer.createTransport(smtpUrl);
    return cachedTransporter;
  }

  const host = cleanEnv("SMTP_HOST");
  if (!host) throw new Error("SMTP_HOST is not configured.");

  const user = cleanEnv("SMTP_USER");
  const password = cleanEnv("SMTP_PASSWORD");
  if (Boolean(user) !== Boolean(password)) {
    throw new Error("SMTP_USER and SMTP_PASSWORD must be configured together.");
  }

  const port = smtpPort();
  cachedTransporter = nodemailer.createTransport({
    host,
    port,
    secure: booleanEnv("SMTP_SECURE", port === 465),
    requireTLS: booleanEnv("SMTP_REQUIRE_TLS", port === 587),
    connectionTimeout: emailTimeoutMs(),
    greetingTimeout: emailTimeoutMs(),
    socketTimeout: emailTimeoutMs(),
    auth: user ? { user, pass: password } : undefined,
  });
  return cachedTransporter;
}

export function passwordResetEmailConfigured(): boolean {
  try {
    resetBaseUrl();
    if (emailProvider() === "google_apps_script") {
      return Boolean(cleanEnv("GOOGLE_APPS_SCRIPT_EMAIL_URL")) && Boolean(cleanEnv("GOOGLE_APPS_SCRIPT_EMAIL_SECRET"));
    }
    if (!fromAddress()) return false;
    if (cleanEnv("SMTP_URL")) return true;
    const user = cleanEnv("SMTP_USER");
    const password = cleanEnv("SMTP_PASSWORD");
    return Boolean(cleanEnv("SMTP_HOST")) && Boolean(user) === Boolean(password);
  } catch {
    return false;
  }
}

export function passwordResetTokenTtlMinutes(): number {
  const value = Number(cleanEnv("PASSWORD_RESET_TOKEN_TTL_MINUTES"));
  return Number.isInteger(value) && value >= 10 && value <= 1_440 ? value : 60;
}

function buildPasswordResetMessage(input: PasswordResetEmailInput): PasswordResetEmailMessage {
  const baseUrl = resetBaseUrl();
  const resetUrl = new URL("/app/reset-password", baseUrl);
  resetUrl.searchParams.set("token", input.rawToken);

  const safeUrl = escapeHtml(resetUrl.toString());
  const ttlMinutes = passwordResetTokenTtlMinutes();
  return {
    to: input.email,
    subject: "Reset your Khmer Vox TTS password",
    text: [
      "A password reset was requested for your Khmer Vox TTS account.",
      "",
      `Reset your password: ${resetUrl.toString()}`,
      "",
      `This link expires in ${ttlMinutes} minutes and can be used once.`,
      "If you did not request this, you can ignore this email.",
    ].join("\n"),
    html: `
      <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#1a1a1a">
        <h1 style="font-size:28px;margin:0 0 20px">Reset your password</h1>
        <p>A password reset was requested for your Khmer Vox TTS account.</p>
        <p style="margin:28px 0">
          <a href="${safeUrl}" style="background:#1a1a1a;color:#fff;padding:14px 20px;text-decoration:none;font-weight:700">
            Reset password
          </a>
        </p>
        <p>This link expires in ${ttlMinutes} minutes and can be used once.</p>
        <p>If you did not request this, you can ignore this email.</p>
      </div>
    `,
  };
}

async function sendViaSmtp(message: PasswordResetEmailMessage): Promise<void> {
  const senderName = cleanEnv("SMTP_FROM_NAME") || "Khmer Vox TTS";
  const senderEmail = fromAddress();
  if (!senderEmail) throw new Error("SMTP_FROM_EMAIL is not configured.");

  await transporter().sendMail({
    from: { name: senderName, address: senderEmail },
    to: message.to,
    subject: message.subject,
    text: message.text,
    html: message.html,
  });
}

async function sendViaGoogleAppsScript(message: PasswordResetEmailMessage): Promise<void> {
  const url = cleanEnv("GOOGLE_APPS_SCRIPT_EMAIL_URL");
  const secret = cleanEnv("GOOGLE_APPS_SCRIPT_EMAIL_SECRET");
  if (!url || !secret) throw new Error("Google Apps Script email relay is not configured.");

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      secret,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
      fromName: cleanEnv("SMTP_FROM_NAME") || "Khmer Vox TTS",
    }),
    signal: AbortSignal.timeout(emailTimeoutMs()),
  });

  const responseText = await response.text();

  if (!response.ok) {
    const error = new Error(`Google Apps Script email relay failed with HTTP ${response.status}.`) as Error & {
      code?: string;
    };
    error.code = `GAS_${response.status}`;
    throw error;
  }

  let payload: unknown = null;
  try {
    payload = JSON.parse(responseText) as unknown;
  } catch {
    payload = null;
  }

  if (!payload || typeof payload !== "object" || (payload as { ok?: unknown }).ok !== true) {
    const error = new Error("Google Apps Script email relay returned an invalid response.") as Error & {
      code?: string;
    };
    error.code = "GAS_BAD_RESPONSE";
    throw error;
  }
}

export async function sendPasswordResetEmail(input: PasswordResetEmailInput): Promise<void> {
  const message = buildPasswordResetMessage(input);
  if (emailProvider() === "google_apps_script") {
    await sendViaGoogleAppsScript(message);
    return;
  }

  await sendViaSmtp(message);
}
