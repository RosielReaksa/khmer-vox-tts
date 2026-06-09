import Link from "next/link";

export default function NotFoundPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f4f5f8] p-6">
      <div className="w-full max-w-md rounded-3xl border border-[#e3e6ee] bg-white p-8 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[#f3f5fa]">
          <span className="text-2xl font-bold text-[#6a7282]">404</span>
        </div>
        <h1 className="text-xl font-semibold text-[#17181b]">Page not found</h1>
        <p className="mt-2 text-sm text-[#6a7282]">
          The page you are looking for does not exist or has been moved.
        </p>
        <Link
          href="/"
          className="mt-6 inline-block rounded-full bg-[#090b11] px-6 py-2.5 text-sm font-semibold text-white hover:bg-[#131722]"
        >
          Go home
        </Link>
      </div>
    </div>
  );
}
