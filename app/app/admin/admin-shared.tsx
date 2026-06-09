import Link from "next/link";

export function AdminAccessRequired() {
  return (
    <section className="mx-auto grid min-h-[60vh] max-w-xl place-items-center px-5">
      <div className="rounded-none border-4 border-primary bg-surface p-6 text-center shadow-[6px_6px_0px_0px_rgba(26,26,26,1)]">
        <h1 className="text-2xl font-headline font-black uppercase text-primary">Admin access required</h1>
        <p className="mt-2 text-sm leading-6 text-primary font-body">
          Set your email in ADMIN_EMAILS to view the admin area.
        </p>
        <Link
          href="/app/dashboard"
          className="mt-5 inline-flex rounded-none border-2 border-primary bg-primary-fixed px-4 py-2 text-sm font-headline font-bold uppercase text-primary shadow-[2px_2px_0px_0px_rgba(26,26,26,1)] hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-[1px_1px_0px_0px_rgba(26,26,26,1)] transition-all"
        >
          Back to dashboard
        </Link>
      </div>
    </section>
  );
}

export function AdminPanelSkeleton({ label = "Loading admin data..." }: { label?: string }) {
  const cards = Array.from({ length: 8 }, (_, index) => index);
  const rows = Array.from({ length: 5 }, (_, index) => index);

  return (
    <section className="dashboard-enter grid gap-5" aria-busy="true" aria-label={label}>
      <div className="grid gap-2">
        <div className="pulse-bar h-4 w-44 rounded-none" />
        <div className="pulse-bar h-9 w-72 rounded-none" />
        <div className="pulse-bar h-4 w-full max-w-xl rounded-none" />
      </div>
      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {cards.map((item) => (
          <article key={item} className="rounded-none border-2 border-primary bg-surface p-5 shadow-[3px_3px_0px_0px_rgba(26,26,26,1)]">
            <div className="pulse-bar h-8 w-24 rounded-none" />
            <div className="pulse-bar mt-4 h-4 w-28 rounded-none" />
            <div className="pulse-bar mt-2 h-3 w-36 rounded-none" />
          </article>
        ))}
      </section>
      <section className="rounded-none border-2 border-primary bg-surface p-5 shadow-[4px_4px_0px_0px_rgba(26,26,26,1)]">
        <div className="pulse-bar h-7 w-56 rounded-none" />
        <div className="mt-5 grid gap-2">
          {rows.map((item) => (
            <div key={item} className="rounded-none border border-primary bg-white px-4 py-3">
              <div className="pulse-bar h-4 w-1/2 rounded-none" />
              <div className="pulse-bar mt-2 h-3 w-4/5 rounded-none" />
            </div>
          ))}
        </div>
      </section>
    </section>
  );
}

export function InlineAdminError({ message }: { message: string }) {
  return (
    <p className="rounded-none border-2 border-error bg-error-container px-4 py-3 text-sm font-headline font-bold uppercase tracking-wider text-error">
      {message}
    </p>
  );
}

export function MetricCard({
  label,
  title,
  value,
  note,
}: {
  label?: string;
  title?: string;
  value: string;
  note: string;
}) {
  const displayLabel = label ?? title ?? "";
  return (
    <article className="rounded-none border-2 border-primary bg-surface p-4 shadow-[3px_3px_0px_0px_rgba(26,26,26,1)]">
      <p className="text-[28px] font-headline font-black leading-none text-primary">{value}</p>
      <p className="mt-2 text-[10px] font-headline font-bold uppercase tracking-[0.08em] text-on-surface-variant leading-none">{displayLabel}</p>
      <p className="mt-1 text-xs font-body text-on-surface-variant/80">{note}</p>
    </article>
  );
}

export function EmptyState({ label }: { label: string }) {
  return (
    <p className="rounded-none border-2 border-dashed border-primary bg-white px-4 py-8 text-center text-sm font-body text-on-surface-variant">
      {label}
    </p>
  );
}

export function formatDate(input: string | null | undefined): string {
  if (!input) return "-";
  return new Date(input).toLocaleString();
}

export function formatUsd(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

