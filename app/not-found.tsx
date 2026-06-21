import Link from "next/link";

export default function NotFoundPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-md border-4 border-primary bg-surface-bright p-8 text-center shadow-[8px_8px_0px_0px_rgba(26,26,26,1)]">
        <div className="mx-auto mb-5 grid h-16 w-16 place-items-center border-4 border-primary bg-[#ffcc00] shadow-[3px_3px_0px_0px_rgba(26,26,26,1)]">
          <span className="font-headline text-2xl font-black text-primary">404</span>
        </div>
        <h1 className="font-headline text-xl font-black uppercase tracking-tight text-primary">
          Page not found
        </h1>
        <p className="mt-3 font-body text-sm font-medium text-on-surface-variant">
          The page you are looking for does not exist or has been moved.
        </p>
        <Link
          href="/"
          className="mt-6 inline-flex h-11 items-center justify-center border-2 border-primary bg-[#ffcc00] px-6 font-headline text-xs font-black uppercase text-primary shadow-[3px_3px_0px_0px_rgba(26,26,26,1)] transition-all hover:bg-[#e6b800] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
        >
          Go home
        </Link>
      </div>
    </div>
  );
}
