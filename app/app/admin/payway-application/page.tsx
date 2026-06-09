import Link from "next/link";
import { redirect } from "next/navigation";

import { isAdminEmail } from "@/lib/admin";
import { getCurrentUser } from "@/lib/current-user";
import { AdminAccessRequired, MetricCard } from "../admin-shared";

type RequirementStatus = "ready" | "needs_file" | "needs_env" | "external";

type Requirement = {
  title: string;
  status: RequirementStatus;
  detail: string;
  action?: string;
  href?: string;
};

function cleanEnv(name: string): string {
  return (process.env[name] ?? "").trim().replace(/^"|"$/g, "");
}

function publicBaseUrl(): string {
  return (
    cleanEnv("APP_PUBLIC_URL") ||
    cleanEnv("NEXT_PUBLIC_APP_URL") ||
    (cleanEnv("VERCEL_URL") ? `https://${cleanEnv("VERCEL_URL")}` : "https://voxtts-online.vercel.app")
  ).replace(/\/$/, "");
}

export default async function PayWayApplicationPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/app/signin");
  }
  if (!isAdminEmail(user.email)) {
    return <AdminAccessRequired />;
  }

  const baseUrl = publicBaseUrl();
  const receiptAddress = cleanEnv("PAYWAY_RECEIPT_ADDRESS");
  const receiptPhone = cleanEnv("PAYWAY_RECEIPT_PHONE");
  const receiptEmail = cleanEnv("PAYWAY_RECEIPT_EMAIL");
  const logoPath = cleanEnv("PAYWAY_COMPANY_LOGO_PATH") || "/logo.png";

  const receiptReady = Boolean(receiptAddress && receiptPhone && receiptEmail);
  const requirements: Requirement[] = [
    {
      title: "Personal or business account with ABA",
      status: "external",
      detail: "ABA must confirm the account type and owner details. Keep the account numbers outside the repo.",
      action: "Prepare ABA account confirmation from bank app or branch.",
    },
    {
      title: "Business website or app URL",
      status: "ready",
      detail: baseUrl,
      href: baseUrl,
    },
    {
      title: "Checkout page and payment flow screenshots",
      status: "ready",
      detail: "Public payment pages and dashboard checkout are available for screenshots.",
      action: "Capture landing page, pricing/payment page, checkout QR page, proof upload, and admin approval flow.",
      href: `${baseUrl}/payments`,
    },
    {
      title: "Patent 2026, MOC certificate, MAA",
      status: "external",
      detail: "Required only for the registered business-account path. Keep company documents outside source control.",
      action: "Ask ABA whether personal PayWay KHQR can proceed first, then upgrade after company registration.",
    },
    {
      title: "Company logo PNG",
      status: "needs_file",
      detail: "ABA requires PNG, 315px by 315px, maximum 25KB, not cropped, zipped for submission.",
      action: `Prepare ${logoPath} or a separate approved logo zip outside the repo.`,
    },
    {
      title: "Operation office pictures",
      status: "external",
      detail: "Use real office/location photos for ABA review. Do not commit these photos unless they are intended public assets.",
      action: "Prepare several clear office operation photos in a private folder.",
    },
    {
      title: "Terms, cancellation, and refund policy Word file",
      status: "ready",
      detail: "Public terms and refund policy pages are live; export them into ABA's Word-file requirement, under 8000 words.",
      action: "Use /terms and /refund-policy as the source for the Word document.",
      href: `${baseUrl}/refund-policy`,
    },
    {
      title: "Payment receipt footer information",
      status: receiptReady ? "ready" : "needs_env",
      detail: receiptReady
        ? "Receipt address, phone, and email env values are configured."
        : "Set PAYWAY_RECEIPT_ADDRESS, PAYWAY_RECEIPT_PHONE, and PAYWAY_RECEIPT_EMAIL in Vercel/local env.",
      action: "These values appear at the bottom of PayWay receipts after ABA configures merchant checkout.",
    },
  ];

  const readyCount = requirements.filter((item) => item.status === "ready").length;
  const needsWorkCount = requirements.filter((item) => item.status !== "ready").length;

  return (
    <section className="grid min-w-0 gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[34px] font-headline font-black uppercase text-primary">PayWay Application</h1>
          <p className="mt-1 text-sm font-body text-primary/70">
            Document checklist for ABA PayWay onboarding, screenshots, receipt footer details, and public review URLs.
          </p>
        </div>
        <Link
          href="/payments"
          target="_blank"
          className="rounded-none border-2 border-primary bg-white px-4 py-2 text-sm font-headline font-bold uppercase text-primary shadow-[2px_2px_0px_0px_rgba(26,26,26,1)] hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none"
        >
          Open Payment Page
        </Link>
      </div>

      <section className="grid gap-3 md:grid-cols-3">
        <MetricCard label="Ready" value={readyCount.toLocaleString()} note="Website-side items" />
        <MetricCard label="Needs Work" value={needsWorkCount.toLocaleString()} note="External files or env" />
        <MetricCard label="Review URL" value={baseUrl.replace(/^https?:\/\//, "")} note="Give this to ABA" />
      </section>

      <section className="rounded-none border-3 border-primary bg-[#faf7f2] p-5 shadow-[4px_4px_0px_0px_rgba(26,26,26,1)]">
        <h2 className="text-2xl font-headline font-black uppercase tracking-tight text-primary">Public Links for ABA Review</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <ReviewLink label="Business website" href={baseUrl} />
          <ReviewLink label="Payment page" href={`${baseUrl}/payments`} />
          <ReviewLink label="Payment guide" href={`${baseUrl}/payment-guide`} />
          <ReviewLink label="Terms and conditions" href={`${baseUrl}/terms`} />
          <ReviewLink label="Cancellation and refund policy" href={`${baseUrl}/refund-policy`} />
          <ReviewLink label="API documentation" href={`${baseUrl}/docs`} />
        </div>
      </section>

      <section className="rounded-none border-3 border-primary bg-[#faf7f2] p-5 shadow-[4px_4px_0px_0px_rgba(26,26,26,1)]">
        <h2 className="text-2xl font-headline font-black uppercase tracking-tight text-primary">Required Documents</h2>
        <div className="mt-4 grid gap-4">
          {requirements.map((item) => (
            <RequirementCard key={item.title} item={item} />
          ))}
        </div>
      </section>

      <section className="grid gap-5 lg:grid-cols-2">
        <article className="rounded-none border-3 border-primary bg-[#faf7f2] p-5 shadow-[4px_4px_0px_0px_rgba(26,26,26,1)]">
          <h2 className="text-2xl font-headline font-black uppercase tracking-tight text-primary">Screenshot Flow to Send</h2>
          <ol className="mt-4 grid gap-2 text-sm font-body text-primary/80">
            <li>1. Home page showing Khmer Vox TTS product name and API offer.</li>
            <li>2. Pricing/payment page showing token packs and ABA PayWay QR payment option.</li>
            <li>3. Dashboard checkout page showing QR, amount, order ID, and proof upload.</li>
            <li>4. Admin payments page showing receipt review and approval controls.</li>
            <li>5. Customer billing/history page after tokens are credited.</li>
          </ol>
        </article>

        <article className="rounded-none border-3 border-primary bg-[#faf7f2] p-5 shadow-[4px_4px_0px_0px_rgba(26,26,26,1)]">
          <h2 className="text-2xl font-headline font-black uppercase tracking-tight text-primary">Receipt Footer Env</h2>
          <div className="mt-4 overflow-hidden rounded-none border-2 border-primary bg-white">
            <table className="w-full text-sm">
              <tbody>
                <EnvRow name="PAYWAY_RECEIPT_ADDRESS" configured={Boolean(receiptAddress)} />
                <EnvRow name="PAYWAY_RECEIPT_PHONE" configured={Boolean(receiptPhone)} />
                <EnvRow name="PAYWAY_RECEIPT_EMAIL" configured={Boolean(receiptEmail)} />
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs font-body text-primary/70">
            Values are intentionally hidden here. Configure them in Vercel and local `.env`; do not commit private account
            details.
          </p>
        </article>
      </section>
    </section>
  );
}

function RequirementCard({ item }: { item: Requirement }) {
  return (
    <article className="rounded-none border-2 border-primary bg-white p-5 shadow-[4px_4px_0px_0px_rgba(26,26,26,1)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-headline font-bold uppercase text-primary">{item.title}</h3>
          <p className="mt-1 break-all text-sm font-body text-primary/80">{item.detail}</p>
          {item.action ? <p className="mt-2 text-sm font-body font-semibold text-primary">{item.action}</p> : null}
        </div>
        <StatusBadge status={item.status} />
      </div>
      {item.href ? (
        <a
          href={item.href}
          target="_blank"
          rel="noreferrer"
          className="mt-4 inline-flex rounded-none border-2 border-primary bg-white px-3 py-1.5 text-xs font-headline font-bold uppercase text-primary shadow-[2px_2px_0px_0px_rgba(26,26,26,1)] transition-all hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none"
        >
          Open Link
        </a>
      ) : null}
    </article>
  );
}

function ReviewLink({ label, href }: { label: string; href: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="rounded-none border-2 border-primary bg-white p-4 shadow-[2px_2px_0px_0px_rgba(26,26,26,1)] hover:bg-[#f2ede5] transition-all"
    >
      <p className="text-sm font-headline font-bold uppercase text-primary">{label}</p>
      <p className="mt-1 break-all font-mono text-xs text-primary/70">{href}</p>
    </a>
  );
}

function EnvRow({ name, configured }: { name: string; configured: boolean }) {
  return (
    <tr className="border-t border-primary first:border-t-0">
      <td className="px-4 py-3 font-mono text-xs text-primary">{name}</td>
      <td className="px-4 py-3 text-right">
        <span
          className={`rounded-none border-2 px-2 py-0.5 text-xs font-headline font-bold uppercase tracking-wider ${
            configured
              ? "bg-[#def3e5] text-emerald-900 border-emerald-900"
              : "bg-amber-100 text-amber-900 border-amber-900"
          }`}
        >
          {configured ? "configured" : "missing"}
        </span>
      </td>
    </tr>
  );
}

function StatusBadge({ status }: { status: RequirementStatus }) {
  const label =
    status === "ready"
      ? "Ready"
      : status === "needs_env"
        ? "Needs env"
        : status === "needs_file"
          ? "Needs file"
          : "External";
  const className =
    status === "ready"
      ? "bg-[#def3e5] text-emerald-900 border-emerald-900"
      : status === "external"
        ? "bg-slate-100 text-slate-700 border-slate-700"
        : "bg-amber-100 text-amber-900 border-amber-900";
  return <span className={`rounded-none border-2 px-3 py-1 text-xs font-headline font-bold uppercase tracking-wider ${className}`}>{label}</span>;
}
