"use client";

type SupportActionsProps = {
  telegramUrl: string;
  telegramLabel: string;
};

export function SupportActions({ telegramUrl, telegramLabel }: SupportActionsProps) {
  function goBack() {
    if (window.history.length > 1) {
      window.history.back();
      return;
    }
    window.location.assign("/app/dashboard");
  }

  // Use assign for complete routing outside the SPA context if needed
  function openBilling() {
    window.location.assign("/app/dashboard/billing");
  }

  function openDocs() {
    window.location.assign("/docs");
  }

  return (
    <div className="mt-6 flex flex-wrap gap-3">
      <button
        type="button"
        onClick={goBack}
        className="px-5 py-3 bg-white text-primary border-2 border-outline font-headline font-bold uppercase text-xs shadow-[4px_4px_0px_0px_rgba(26,26,26,1)] hover:bg-[#eee9e0] transition-all active:translate-x-0.5 active:translate-y-0.5 active:shadow-none cursor-pointer"
      >
        Back
      </button>
      <a
        href={telegramUrl}
        target="_blank"
        rel="noreferrer"
        className="px-5 py-3 bg-[#ffcc00] text-primary border-2 border-outline font-headline font-bold uppercase text-xs shadow-[4px_4px_0px_0px_rgba(26,26,26,1)] hover:bg-[#e6b800] transition-all active:translate-x-0.5 active:translate-y-0.5 active:shadow-none inline-flex items-center justify-center"
      >
        Contact {telegramLabel}
      </a>
      <button
        type="button"
        onClick={openBilling}
        className="px-5 py-3 bg-white text-primary border-2 border-outline font-headline font-bold uppercase text-xs shadow-[4px_4px_0px_0px_rgba(26,26,26,1)] hover:bg-[#eee9e0] transition-all active:translate-x-0.5 active:translate-y-0.5 active:shadow-none cursor-pointer"
      >
        Open Billing
      </button>
      <button
        type="button"
        onClick={openDocs}
        className="px-5 py-3 bg-white text-primary border-2 border-outline font-headline font-bold uppercase text-xs shadow-[4px_4px_0px_0px_rgba(26,26,26,1)] hover:bg-[#eee9e0] transition-all active:translate-x-0.5 active:translate-y-0.5 active:shadow-none cursor-pointer"
      >
        API Docs
      </button>
    </div>
  );
}
