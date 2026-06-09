import Link from "next/link";
import { redirect } from "next/navigation";

import { SystemTestPanel, WebhookCopyBox, AdminStatusPanel } from "@/app/app/admin/system/system-actions";
import { isAdminEmail } from "@/lib/admin";
import { getCurrentUser } from "@/lib/current-user";
import type { CheckStatus, LaunchChecklistGroup, LaunchChecklistItem, SystemCheck } from "@/lib/system-status";
import { getSystemStatus } from "@/lib/system-status";
import { AdminAccessRequired } from "../admin-shared";

export default async function AdminSystemPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/app/signin");
  }
  if (!isAdminEmail(user.email)) {
    return <AdminAccessRequired />;
  }

  const status = await getSystemStatus();
  const launchReady =
    status.database.mode === "postgres" &&
    status.database.health.status === "ok" &&
    status.env.every((item) => item.status === "ok") &&
    status.quickChecks.every((item) => item.status === "ok");
  const checklistItems = status.launchChecklist.flatMap((group) => group.items);
  const passCount = checklistItems.filter((item) => item.status === "ok").length;
  const warnCount = checklistItems.filter((item) => item.status === "warn").length;
  const errorCount = checklistItems.filter((item) => item.status === "error").length;
  const requiredIssues = checklistItems.filter((item) => item.required && item.status !== "ok");

  return (
    <div className="mx-auto w-full max-w-7xl">
      <section className="grid min-w-0 gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[34px] font-headline font-black uppercase text-primary">Admin System</h1>
          <p className="mt-1 text-sm font-body text-primary/70">
            Launch safety checks for database, payment, TTS, and notification configuration.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <StatusBadge status={launchReady ? "ok" : "warn"} label={launchReady ? "Ready" : "Needs work"} />
        </div>
      </div>

      <section
        className={`rounded-none border-3 border-primary p-6 shadow-[6px_6px_0px_0px_rgba(26,26,26,1)] ${
          launchReady
            ? "bg-[#def3e5] text-[#128342]"
            : "bg-[#faf7f2]"
        }`}
      >
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div>
            <p className="text-xs font-headline font-bold uppercase tracking-[0.12em] text-primary/70">
              Launch Readiness
            </p>
            <h2 className="mt-2 text-[32px] font-headline font-black uppercase tracking-tight text-primary">
              {launchReady ? "Ready for production checks" : "Not ready for public users yet"}
            </h2>
            <p className="mt-2 max-w-3xl text-sm font-body leading-6 text-primary/80">
              Public launch needs Postgres, HTTPS callback URL, signed PayWay callbacks, working KHQR,
              Modal TTS credentials, Telegram alerts, admin allowlist, and a strong session secret.
            </p>
          </div>
          <div className="grid min-w-[220px] gap-2 rounded-none border-2 border-primary bg-white p-4 font-headline font-bold uppercase text-primary">
            <div className="flex justify-between text-sm">
              <span>Passed</span>
              <span className="text-emerald-800 font-black">{passCount}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span>Warnings</span>
              <span className="text-amber-800 font-black">{warnCount}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span>Blockers</span>
              <span className="text-red-800 font-black">{errorCount}</span>
            </div>
          </div>
        </div>

        {requiredIssues.length > 0 ? (
          <div className="mt-5 grid gap-2">
            {requiredIssues.slice(0, 5).map((item) => (
              <p key={item.id} className="rounded-none border-2 border-primary bg-white px-4 py-3 text-sm font-body text-red-900">
                <span className="font-bold">{item.label}:</span> {item.detail}
              </p>
            ))}
          </div>
        ) : null}
      </section>

      <section className="grid gap-5 xl:grid-cols-3">
        {status.launchChecklist.map((group) => (
          <ChecklistGroupCard key={group.title} group={group} />
        ))}
      </section>

      <section className="grid gap-5 lg:grid-cols-3">
        <article className="rounded-none border-3 border-primary bg-[#faf7f2] p-5 shadow-[4px_4px_0px_0px_rgba(26,26,26,1)]">
          <p className="text-xs font-headline font-bold uppercase tracking-[0.12em] text-primary/70">Database</p>
          <h2 className="mt-2 text-2xl font-headline font-black uppercase text-primary">
            {status.database.mode === "postgres" ? "Postgres/Supabase" : "Local JSON"}
          </h2>
          <p className="mt-1 break-all text-sm font-body text-primary/80">{status.database.label}</p>
          <div className="mt-4">
            <CheckRow check={status.database.health} />
          </div>
        </article>

        <article className="rounded-none border-3 border-primary bg-[#faf7f2] p-5 shadow-[4px_4px_0px_0px_rgba(26,26,26,1)]">
          <p className="text-xs font-headline font-bold uppercase tracking-[0.12em] text-primary/70">PayWay Webhook</p>
          <h2 className="mt-2 text-2xl font-headline font-black uppercase text-primary">Callback URL</h2>
          <WebhookCopyBox webhookUrl={status.webhookUrl} />
          <p className="mt-3 text-sm font-body text-primary/70">
            Use this URL in ABA PayWay after deploying to your public domain.
          </p>
        </article>

        <AdminStatusPanel />
      </section>

      {status.warnings.length > 0 ? (
        <article className="rounded-none border-2 border-primary bg-amber-50 p-5">
          <h2 className="text-xl font-headline font-black uppercase text-primary">Warnings</h2>
          <div className="mt-3 grid gap-2">
            {status.warnings.map((warning) => (
              <p key={warning} className="rounded-none border border-primary bg-white px-4 py-3 text-sm font-body text-amber-950">
                {warning}
              </p>
            ))}
          </div>
        </article>
      ) : null}

      <SystemTestPanel />

      <section className="min-w-0 rounded-none border-3 border-primary bg-[#faf7f2] p-5 shadow-[4px_4px_0px_0px_rgba(26,26,26,1)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-2xl font-headline font-black uppercase text-primary">Quick Checks</h2>
            <p className="mt-1 text-sm font-body text-primary/70">
              These checks run on the server and hide credential values.
            </p>
          </div>
          <p className="text-xs font-body text-primary/60">Updated {formatDateTime(status.generatedAt)}</p>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {status.quickChecks.map((check) => (
            <CheckCard key={check.name} check={check} />
          ))}
        </div>
      </section>

      <section className="rounded-none border-3 border-primary bg-[#faf7f2] p-5 shadow-[4px_4px_0px_0px_rgba(26,26,26,1)]">
        <h2 className="text-2xl font-headline font-black uppercase text-primary">Environment</h2>
        <div className="mt-4 max-w-full overflow-x-auto rounded-none border-2 border-primary bg-white">
          <table className="w-full table-fixed text-sm text-primary">
            <thead className="bg-[#f2ede5] text-left text-primary border-b-2 border-primary font-headline">
              <tr>
                <th className="px-4 py-3 font-bold uppercase w-1/4">Variable</th>
                <th className="px-4 py-3 font-bold uppercase w-24">Status</th>
                <th className="px-4 py-3 font-bold uppercase">Detail</th>
              </tr>
            </thead>
            <tbody>
              {status.env.map((item) => (
                <tr key={item.variable} className="border-t border-primary/20 hover:bg-[#fafbfe] text-primary">
                  <td className="px-4 py-3 font-mono text-xs">{item.variable}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={item.status} label={item.status} />
                  </td>
                  <td className="px-4 py-3 text-sm font-body text-primary/80 break-all">{item.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      </section>
    </div>
  );
}

function ChecklistGroupCard({ group }: { group: LaunchChecklistGroup }) {
  return (
    <article className="min-w-0 rounded-none border-3 border-primary bg-[#faf7f2] p-5 shadow-[4px_4px_0px_0px_rgba(26,26,26,1)]">
      <h2 className="text-xl font-headline font-black uppercase tracking-tight text-primary break-all">{group.title}</h2>
      <div className="mt-4 grid gap-3 min-w-0">
        {group.items.map((item) => (
          <ChecklistRow key={item.id} item={item} />
        ))}
      </div>
    </article>
  );
}

function ChecklistRow({ item }: { item: LaunchChecklistItem }) {
  return (
    <div className="min-w-0 rounded-none border-2 border-primary bg-white p-4 shadow-[2px_2px_0px_0px_rgba(26,26,26,1)]">
      <div className="flex flex-wrap items-center justify-between gap-2 min-w-0">
        <p className="font-headline font-bold uppercase text-primary break-all">{item.label}</p>
        <StatusBadge status={item.status} label={item.status} />
      </div>
      <p className="mt-2 text-xs font-body text-primary/80 break-all">{item.detail}</p>
    </div>
  );
}

function CheckCard({ check }: { check: SystemCheck }) {
  return (
    <article className="min-w-0 rounded-none border-2 border-primary bg-white p-4 shadow-[3px_3px_0px_0px_rgba(26,26,26,1)]">
      <div className="flex items-center justify-between gap-3 min-w-0">
        <h3 className="font-headline font-bold uppercase text-primary break-all">{check.name}</h3>
        <StatusBadge status={check.status} label={check.status} />
      </div>
      <p className="mt-3 text-sm font-body text-primary/80 break-all">{check.detail}</p>
    </article>
  );
}

function CheckRow({ check }: { check: SystemCheck }) {
  return (
    <div className="min-w-0 rounded-none border-2 border-primary bg-white p-4 shadow-[2px_2px_0px_0px_rgba(26,26,26,1)]">
      <div className="flex items-center justify-between gap-3 min-w-0">
        <p className="font-headline font-bold uppercase text-primary break-all">{check.name}</p>
        <StatusBadge status={check.status} label={check.status} />
      </div>
      <p className="mt-2 text-sm font-body text-primary/80 break-all">{check.detail}</p>
    </div>
  );
}

function StatusBadge({ status, label }: { status: CheckStatus; label: string }) {
  const styles: Record<CheckStatus, string> = {
    ok: "border-emerald-900 bg-[#def3e5] text-emerald-900",
    warn: "border-amber-900 bg-amber-100 text-amber-900",
    error: "border-red-900 bg-red-100 text-red-900",
  };

  return (
    <span className={`rounded-none border-2 px-3 py-1 text-xs font-headline font-bold uppercase tracking-wider ${styles[status]}`}>
      {label}
    </span>
  );
}

function formatDateTime(input: string): string {
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return "-";
  return `${date.toISOString().slice(0, 16).replace("T", " ")} UTC`;
}
