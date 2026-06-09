const cardSkeletons = Array.from({ length: 4 }, (_, index) => index);
const rowSkeletons = Array.from({ length: 5 }, (_, index) => index);

export default function DashboardLoading() {
  return (
    <section className="dashboard-enter grid min-w-0 gap-5" aria-busy="true" aria-label="Opening dashboard page">
      <div className="grid gap-2">
        <div className="pulse-bar h-9 w-72 rounded-full" />
        <div className="pulse-bar h-4 w-full max-w-xl rounded-full" />
      </div>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {cardSkeletons.map((item) => (
          <article key={item} className="app-surface rounded-3xl border border-[#e3e6ee] bg-white p-5">
            <div className="pulse-bar h-9 w-24 rounded-full" />
            <div className="pulse-bar mt-4 h-4 w-28 rounded-full" />
            <div className="pulse-bar mt-2 h-3 w-36 rounded-full" />
          </article>
        ))}
      </section>

      <section className="app-surface rounded-3xl border border-[#e3e6ee] bg-white p-5">
        <div className="pulse-bar h-7 w-56 rounded-full" />
        <div className="pulse-bar mt-2 h-4 w-80 max-w-full rounded-full" />
        <div className="mt-5 grid gap-3">
          {rowSkeletons.map((item) => (
            <div key={item} className="rounded-2xl border border-[#eef1f6] px-4 py-3">
              <div className="pulse-bar h-4 w-1/2 rounded-full" />
              <div className="pulse-bar mt-2 h-3 w-4/5 rounded-full" />
            </div>
          ))}
        </div>
      </section>
    </section>
  );
}
