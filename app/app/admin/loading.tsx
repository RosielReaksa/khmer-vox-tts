const metricSkeletons = Array.from({ length: 8 }, (_, index) => index);
const rowSkeletons = Array.from({ length: 6 }, (_, index) => index);
const panelSkeletons = Array.from({ length: 2 }, (_, index) => index);

export default function AdminLoading() {
  return (
    <section className="dashboard-enter grid min-w-0 gap-5" aria-busy="true" aria-label="Opening admin page">
      <div className="grid gap-2">
        <div className="pulse-bar h-4 w-44 rounded-none" />
        <div className="pulse-bar h-9 w-72 rounded-none" />
        <div className="pulse-bar h-4 w-full max-w-xl rounded-none" />
      </div>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {metricSkeletons.map((item) => (
          <article key={item} className="rounded-none border-2 border-primary bg-surface p-5 shadow-[3px_3px_0px_0px_rgba(26,26,26,1)]">
            <div className="pulse-bar h-8 w-24 rounded-none" />
            <div className="pulse-bar mt-4 h-4 w-28 rounded-none" />
            <div className="pulse-bar mt-2 h-3 w-36 rounded-none" />
          </article>
        ))}
      </section>

      <section className="grid gap-5 xl:grid-cols-2">
        {panelSkeletons.map((panel) => (
          <article key={panel} className="rounded-none border-2 border-primary bg-surface p-5 shadow-[4px_4px_0px_0px_rgba(26,26,26,1)]">
            <div className="flex items-start justify-between gap-4">
              <div className="grid flex-1 gap-2">
                <div className="pulse-bar h-6 w-48 rounded-none" />
                <div className="pulse-bar h-4 w-64 rounded-none" />
              </div>
              <div className="pulse-bar h-9 w-32 rounded-none" />
            </div>
            <div className="mt-5 grid gap-2">
              {rowSkeletons.map((row) => (
                <div key={row} className="rounded-none border border-primary bg-white px-4 py-3">
                  <div className="pulse-bar h-4 w-1/2 rounded-none" />
                  <div className="pulse-bar mt-2 h-3 w-4/5 rounded-none" />
                </div>
              ))}
            </div>
          </article>
        ))}
      </section>
    </section>
  );
}

