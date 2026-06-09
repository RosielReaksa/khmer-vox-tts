import { PLAN_COMPARISON_ROWS, PLAN_DETAILS, type PlanKey } from "@/lib/plan-details";
import HomePlayground from "@/app/components/home-playground";
import { PublicHeader } from "@/app/components/public-header";

const features = [
  {
    title: "Khmer TTS API",
    description:
      "Generate Khmer speech from text and return MP3 audio in a single request.",
  },
  {
    title: "Session Clone Voice",
    description:
      "Upload one reference voice and generate multiple outputs with consistent speaker style.",
  },
  {
    title: "Batch Generation",
    description:
      "Queue many lines in one run for dubbing, recap, and narration workflows.",
  },
  {
    title: "Developer API Keys",
    description:
      "Issue per-user API keys and connect your own apps without exposing worker secrets.",
  },
  {
    title: "ABA PayWay Review Flow",
    description:
      "Manual PayWay QR checkout is live now; production API/webhook integration is ready when credentials are approved.",
  },
];

const steps = [
  "Create an account and receive 100 free tokens.",
  "Buy a token pack with the ABA PayWay QR checkout.",
  "Generate Khmer speech in the dashboard or from an API key.",
  "Download MP3 files, batch ZIP files, or integrate responses in your own app.",
];

const plans = [
  {
    id: "free",
    name: "Free",
    price: "$0",
    tokenCount: 100,
    cta: "Start Free",
    ctaHref: "/app/signup",
    detail: "One-time trial for first account setup.",
    highlighted: false,
  },
  {
    id: "starter",
    name: "Starter",
    price: "$0.20",
    tokenCount: 1_000,
    cta: "Buy Starter",
    ctaHref: "/app/checkout",
    detail: "Good for short tests and quick bot integrations.",
    highlighted: true,
  },
  {
    id: "creator",
    name: "Creator",
    price: "$1.50",
    tokenCount: 10_000,
    cta: "Buy Creator",
    ctaHref: "/app/checkout",
    detail: "Built for regular batch generation workloads.",
    highlighted: false,
  },
];

const businessPlanFeatures = [
  "High-volume clone voice API",
  "Business clone rate starts at 1.5 tokens/sec",
  "High-volume prepaid can request 1 token/sec",
  "Custom daily and monthly limits",
  "More concurrent jobs and queue space",
  "Webhook callbacks for completed audio",
];

const faqs = [
  {
    q: "What is one token?",
    a: "One token equals one second of generation duration relative to the base rate. Starter and Creator use Standard TTS at 1.5 tokens per generated audio second and standard clone at two tokens per generated audio second. The Business clone rate is only for approved Business plan accounts and starts at 1.5 tokens per audio second, with 1 token per audio second available for high-volume prepaid accounts.",
  },
  {
    q: "Is the clone reference saved forever?",
    a: "No. Session clone mode keeps reference audio only for the batch job, then removes it.",
  },
  {
    q: "Can developers use their own API keys?",
    a: "Yes, after buying a paid token pack. Free accounts can test the dashboard, but API key creation and API calls require Starter or Creator.",
  },
  {
    q: "How do payments work in Cambodia?",
    a: "Current checkout uses a manual ABA PayWay QR. Users scan, pay the exact amount, upload the receipt, then admin approves and credits tokens. Automatic PayWay webhook support is prepared for production credentials.",
  },
];

const paymentFlow = [
  {
    title: "1. User chooses token pack",
    body: "Starter is 1,000 tokens for $0.20. Creator is 10,000 tokens for $1.50.",
  },
  {
    title: "2. User pays by ABA PayWay QR",
    body: "The checkout shows the static merchant QR, exact total, order ID, and receipt upload instructions.",
  },
  {
    title: "3. Admin verifies receipt",
    body: "The admin dashboard shows pending orders, receipt proof, user email, amount, quantity, and token total before approval.",
  },
  {
    title: "4. Tokens are credited",
    body: "After approval, the system adds tokens once and updates billing, dashboard balance, API limits, and payment history.",
  },
];

const reviewCards = [
  {
    title: "Business",
    body: "VoxTTS Online sells prepaid Khmer text-to-speech API tokens for developers, creators, dubbing tools, and automation systems.",
  },
  {
    title: "Product",
    body: "Users generate Khmer speech, session clone voice, and batch audio from the web dashboard or authenticated API endpoints.",
  },
  {
    title: "Payment",
    body: "Manual PayWay QR is active for review. PayWay production credentials will be used for automatic QR checkout and callback verification.",
  },
];

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;

  if (hours > 0) {
    if (remainingSeconds > 0) return `${hours}h ${minutes}m ${remainingSeconds}s`;
    if (minutes > 0) return `${hours}h ${minutes}m`;
    return `${hours}h`;
  }

  if (minutes > 0) {
    if (remainingSeconds > 0) return `${minutes}m ${remainingSeconds}s`;
    return `${minutes}m`;
  }

  return `${remainingSeconds}s`;
}

function PlanFeatureBlock({
  planKey,
  dark = false,
}: {
  planKey: PlanKey;
  dark?: boolean;
}) {
  const detail = PLAN_DETAILS[planKey];
  const panelClass = dark
    ? "border-white/20 bg-white/[0.05] text-[#f5f0e8]"
    : "border-primary bg-[#f5f0e8] text-primary";

  return (
    <div className={`mt-4 grid gap-3 border-2 p-3 text-xs font-headline font-bold uppercase ${panelClass}`}>
      <div>
        <p className="font-black text-[10px] opacity-75">Best for</p>
        <p className="mt-0.5 leading-snug font-body lowercase first-letter:uppercase text-sm font-semibold">{detail.bestFor}</p>
      </div>
      <div>
        <p className="font-black text-[10px] opacity-75">Can use</p>
        <ul className="mt-1 grid gap-1">
          {detail.canUse.map((item) => (
            <li key={item} className="flex gap-2 items-start">
              <span className={dark ? "text-accent" : "text-tertiary"}>✓</span>
              <span className="font-body lowercase first-letter:uppercase text-xs font-normal">{item}</span>
            </li>
          ))}
        </ul>
      </div>
      <div>
        <p className="font-black text-[10px] opacity-75">
          {planKey === "business" ? "Requires" : "Not included"}
        </p>
        <ul className="mt-1 grid gap-1">
          {detail.cannotUse.map((item) => (
            <li key={item} className="flex gap-2 items-start">
              <span className="text-secondary">✗</span>
              <span className="font-body lowercase first-letter:uppercase text-xs font-normal">{item}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function PlanComparisonTable() {
  return (
    <div className="mt-8 overflow-hidden border-4 border-primary bg-white shadow-[4px_4px_0px_0px_rgba(26,26,26,1)]">
      <div className="border-b-4 border-primary bg-primary-fixed px-4 py-3 text-primary">
        <h3 className="font-headline font-black text-lg uppercase tracking-tight">Full Plan Comparison</h3>
        <p className="font-body text-xs font-bold uppercase mt-1">
          Free is for dashboard testing. Starter and Creator unlock paid API keys. Business is approved manually.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[980px] text-sm">
          <thead className="bg-[#eee9e0] text-left text-primary font-headline uppercase font-black border-b-2 border-primary">
            <tr>
              <th className="px-4 py-3 border-r-2 border-primary">Feature</th>
              <th className="px-4 py-3 border-r-2 border-primary">Free</th>
              <th className="px-4 py-3 border-r-2 border-primary">Starter</th>
              <th className="px-4 py-3 border-r-2 border-primary">Creator</th>
              <th className="px-4 py-3">Business</th>
            </tr>
          </thead>
          <tbody className="font-body">
            {PLAN_COMPARISON_ROWS.map((row, idx) => (
              <tr key={row.feature} className={`border-b-2 border-primary last:border-b-0 align-top ${idx % 2 === 0 ? "bg-white" : "bg-[#fcfbf9]"}`}>
                <td className="px-4 py-3 font-semibold text-primary border-r-2 border-primary font-headline uppercase text-xs">{row.feature}</td>
                <td className="px-4 py-3 text-[#1a1a1a] border-r-2 border-primary">{row.free}</td>
                <td className="px-4 py-3 text-[#1a1a1a] border-r-2 border-primary">{row.starter}</td>
                <td className="px-4 py-3 text-[#1a1a1a] border-r-2 border-primary">{row.creator}</td>
                <td className="px-4 py-3 text-[#1a1a1a]">{row.business}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <div className="bg-[#f5f0e8] min-h-screen text-[#1a1a1a]">
      {/* Navigation Header */}
      <PublicHeader />

      {/* Main Content */}
      <main className="w-full max-w-7xl mx-auto px-4 md:px-6 py-12 md:py-20 relative">
        {/* Grid dots background overlay */}
        <div className="absolute inset-0 -z-10 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGNpcmNsZSBjeD0iMjAiIGN5PSIyMCIgcj0iMSIgZmlsbD0iIzFhMWExYSIgZmlsbC1vcGFjaXR5PSIwLjEiLz48L3N2Zz4=')] opacity-50 mix-blend-multiply"></div>

        {/* Hero Section */}
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-8 items-center mb-16 md:mb-24">
          <div className="col-span-1 lg:col-span-6 flex flex-col gap-6 md:gap-8 items-start">
            <h1 className="font-headline font-black text-5xl sm:text-6xl md:text-7xl lg:text-8xl leading-[0.9] tracking-tighter uppercase text-primary">
              Khmer <br/>
              <span className="text-tertiary">AI Voices</span> <br/>
              Redefined
            </h1>
            <p className="font-body text-lg sm:text-xl md:text-2xl font-medium text-on-surface-variant max-w-lg border-l-4 border-primary pl-4">
              Generate ultra-realistic Khmer speech and clone custom voices with state-of-the-art precision. Built for Cambodian creators, businesses, and developers.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 md:gap-6 mt-4 w-full sm:w-auto">
              <a href="/app/signup" className="font-label text-lg sm:text-xl uppercase font-bold bg-primary text-on-primary border-4 border-primary px-6 sm:px-8 py-3 sm:py-4 hover:bg-primary-fixed hover:text-primary transition-colors duration-100 ease-linear shadow-[6px_6px_0px_0px_rgba(26,26,26,1)] active:translate-x-1 active:translate-y-1 active:shadow-[2px_2px_0px_0px_rgba(26,26,26,1)] flex items-center justify-center gap-2 w-full sm:w-auto">
                Try for Free
                <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>arrow_forward</span>
              </a>
              <a href="/docs" className="font-label text-lg sm:text-xl uppercase font-bold bg-transparent text-primary border-4 border-primary px-6 sm:px-8 py-3 sm:py-4 hover:bg-[#eee9e0] transition-colors duration-100 ease-linear shadow-[6px_6px_0px_0px_rgba(26,26,26,1)] active:translate-x-1 active:translate-y-1 active:shadow-[2px_2px_0px_0px_rgba(26,26,26,1)] flex items-center justify-center gap-2 w-full sm:w-auto">
                <span className="material-symbols-outlined">description</span>
                View API Docs
              </a>
            </div>
            <div className="mt-6 md:mt-8 pt-6 md:pt-8 border-t-4 border-primary w-full max-w-lg">
              <p className="font-label text-sm uppercase font-bold text-on-surface-variant mb-4">Trusted by industry leaders</p>
              <div className="flex gap-4 md:gap-6 items-center flex-wrap opacity-60 grayscale hover:grayscale-0 transition-all duration-300">
                <div className="font-headline font-black text-xl md:text-2xl tracking-tighter">ACME CO.</div>
                <div className="font-headline font-black text-xl md:text-2xl tracking-tighter border-2 border-primary px-2">GLOBEX</div>
                <div className="font-headline font-black text-xl md:text-2xl tracking-tighter bg-primary text-on-primary px-2">SOYLENT</div>
              </div>
            </div>
          </div>
          <div className="col-span-1 lg:col-span-6 relative mt-8 lg:mt-0">
            <HomePlayground />
          </div>
        </section>

        {/* Features / Capabilities Section */}
        <section id="features" className="py-12 md:py-16 border-t-4 border-primary">
          <h2 className="font-headline font-black text-3xl md:text-5xl uppercase tracking-tighter text-primary mb-8">
            Built for Khmer voice apps
          </h2>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {features.map((feature, i) => {
              const highlights = ["border-tertiary", "border-secondary", "border-accent", "border-primary-fixed", "border-primary"];
              const highlight = highlights[i % highlights.length];
              return (
                <article
                  key={feature.title}
                  className="bg-surface-bright border-4 border-primary p-6 shadow-[4px_4px_0px_0px_rgba(26,26,26,1)] hover:-translate-y-1 hover:shadow-[6px_6px_0px_0px_rgba(26,26,26,1)] transition-all"
                >
                  <div className={`w-fit px-2 py-0.5 border-2 border-primary font-headline uppercase font-bold text-xs mb-3 bg-[#f5f0e8] ${highlight} text-primary`}>
                    Capability
                  </div>
                  <h3 className="font-headline font-black text-xl md:text-2xl uppercase tracking-tighter mb-2">{feature.title}</h3>
                  <p className="font-body text-sm md:text-base leading-relaxed text-on-surface-variant">
                    {feature.description}
                  </p>
                </article>
              );
            })}
          </div>
        </section>

        {/* Steps section */}
        <section className="py-12 md:py-16 border-t-4 border-primary bg-[#eee9e0]/40">
          <div className="grid gap-8 lg:grid-cols-2">
            <div>
              <h2 className="font-headline font-black text-3xl md:text-5xl uppercase tracking-tighter text-primary mb-4">
                From reference to output in minutes
              </h2>
              <p className="font-body text-base md:text-lg text-on-surface-variant max-w-xl border-l-4 border-primary pl-4">
                Use one flow for dashboard and API users. Keep consistent speaker style across a full batch while keeping reference handling temporary.
              </p>
            </div>
            <ol className="grid gap-4 text-sm font-headline font-bold uppercase">
              {steps.map((step, index) => (
                <li
                  key={step}
                  className="bg-white border-4 border-primary p-4 shadow-[4px_4px_0px_0px_rgba(26,26,26,1)] flex items-start gap-4"
                >
                  <span className="flex h-8 w-8 items-center justify-center border-2 border-primary bg-primary-fixed text-primary shrink-0 text-lg font-black">
                    {index + 1}
                  </span>
                  <span className="font-body text-base tracking-tight leading-snug">{step}</span>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Review Checklist and Payments Section */}
        <section className="py-12 md:py-16 border-t-4 border-primary">
          <div className="grid gap-12 lg:grid-cols-2">
            {/* Review checklist */}
            <div className="flex flex-col gap-6">
              <div>
                <span className="bg-accent text-on-primary border-2 border-primary font-headline uppercase font-bold text-xs px-2.5 py-1">
                  PayWay Review Ready
                </span>
                <h2 className="font-headline font-black text-3xl md:text-5xl uppercase tracking-tighter text-primary mt-4 mb-2">
                  Clear business, product, and payment flow
                </h2>
                <p className="font-body text-sm md:text-base text-on-surface-variant">
                  The current site is ready for manual payment review. PayWay production credentials will be used for automatic QR checkout and callback verification.
                </p>
              </div>
              <div className="grid gap-4">
                {reviewCards.map((card) => (
                  <article key={card.title} className="bg-surface-bright border-4 border-primary p-5 shadow-[4px_4px_0px_0px_rgba(26,26,26,1)]">
                    <h3 className="font-headline font-black text-lg uppercase tracking-tight mb-1">{card.title}</h3>
                    <p className="font-body text-sm leading-relaxed text-on-surface-variant">{card.body}</p>
                  </article>
                ))}
              </div>
              <a
                href="/review"
                className="w-full sm:w-fit text-center font-headline font-black uppercase text-base bg-transparent text-primary border-4 border-primary px-6 py-3 hover:bg-[#eee9e0] transition shadow-[4px_4px_0px_0px_rgba(26,26,26,1)] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none"
              >
                Open review checklist
              </a>
            </div>

            {/* Payments flow */}
            <div className="flex flex-col gap-6">
              <div>
                <span className="bg-tertiary text-on-tertiary border-2 border-primary font-headline uppercase font-bold text-xs px-2.5 py-1">
                  Cambodia checkout
                </span>
                <h2 className="font-headline font-black text-3xl md:text-5xl uppercase tracking-tighter text-primary mt-4 mb-2">
                  Manual ABA PayWay QR now, automatic callback later
                </h2>
                <p className="font-body text-sm md:text-base text-on-surface-variant">
                  Users pay with ABA mobile or a KHQR-supported bank app. Until PayWay production credentials are approved, token crediting is protected by admin receipt verification.
                </p>
              </div>
              <div className="grid gap-4">
                {paymentFlow.map((item) => (
                  <article key={item.title} className="bg-surface-bright border-4 border-primary p-5 shadow-[4px_4px_0px_0px_rgba(26,26,26,1)]">
                    <h3 className="font-headline font-black text-lg uppercase tracking-tight mb-1">{item.title}</h3>
                    <p className="font-body text-sm leading-relaxed text-on-surface-variant">{item.body}</p>
                  </article>
                ))}
              </div>
              <a
                href="/payments"
                className="w-full sm:w-fit text-center font-headline font-black uppercase text-base bg-primary text-on-primary border-4 border-primary px-6 py-3 hover:bg-primary-fixed hover:text-primary transition shadow-[4px_4px_0px_0px_rgba(26,26,26,1)] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none"
              >
                View payment flow
              </a>
            </div>
          </div>
        </section>

        {/* Pricing plans section */}
        <section id="pricing" className="py-12 md:py-16 border-t-4 border-primary">
          <h2 className="font-headline font-black text-3xl md:text-5xl uppercase tracking-tighter text-primary mb-2">
            Predictable Pricing
          </h2>
          <p className="font-body text-base md:text-lg text-on-surface-variant mb-8 border-l-4 border-primary pl-4 max-w-2xl">
            Simple, transparent prepaid token packs. Scale with API keys and batch voice cloning workloads.
          </p>

          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            {plans.map((plan) => (
              <article
                key={plan.name}
                className={`bg-white border-4 border-primary p-6 flex flex-col justify-between shadow-[4px_4px_0px_0px_rgba(26,26,26,1)] ${
                  plan.highlighted ? "bg-primary-fixed" : ""
                }`}
              >
                <div>
                  <div className="flex justify-between items-start mb-2">
                    <h3 className="font-headline font-black text-xl uppercase tracking-tight">{plan.name}</h3>
                    {plan.highlighted && (
                      <span className="bg-primary text-on-primary text-[10px] font-headline font-black uppercase px-2 py-0.5 border-2 border-primary">
                        Popular
                      </span>
                    )}
                  </div>
                  <p className="font-headline font-black text-4xl tracking-tight mb-1">{plan.price}</p>
                  <p className="font-headline font-bold text-sm uppercase text-on-surface-variant mb-4">
                    {plan.tokenCount.toLocaleString()} Tokens
                  </p>
                  <p className="font-body text-sm leading-relaxed text-on-surface-variant mb-4">
                    {plan.detail}
                  </p>

                  <div className="border-2 border-primary bg-[#eee9e0] p-3 text-xs font-headline font-bold uppercase mb-4 text-primary">
                    <p className="font-black">Usage Estimate</p>
                    <p className="mt-1">Normal: {formatDuration(Math.floor(plan.tokenCount / 1.5))}</p>
                    <p>Clone: {formatDuration(Math.floor(plan.tokenCount / 2))}</p>
                  </div>

                  <PlanFeatureBlock planKey={plan.id as PlanKey} dark={false} />
                </div>

                <a
                  href={plan.ctaHref}
                  className={`w-full text-center font-headline font-black uppercase text-sm border-4 border-primary py-2.5 mt-6 transition ${
                    plan.highlighted
                      ? "bg-primary text-on-primary hover:bg-tertiary hover:text-white"
                      : "bg-white text-primary hover:bg-[#eee9e0]"
                  } shadow-[4px_4px_0px_0px_rgba(26,26,26,1)] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none`}
                >
                  {plan.cta}
                </a>
              </article>
            ))}

            {/* Business card */}
            <article className="bg-primary text-[#f5f0e8] border-4 border-primary p-6 flex flex-col justify-between shadow-[4px_4px_0px_0px_rgba(26,26,26,1)]">
              <div>
                <div className="flex justify-between items-start mb-2">
                  <h3 className="font-headline font-black text-xl uppercase tracking-tight text-primary-fixed">Business</h3>
                  <span className="bg-[#f5f0e8] text-primary text-[10px] font-headline font-black uppercase px-2 py-0.5 border-2 border-[#f5f0e8]">
                    Enterprise
                  </span>
                </div>
                <p className="font-headline font-black text-4xl tracking-tight mb-1 text-white">Custom</p>
                <p className="font-headline font-bold text-sm uppercase text-primary-fixed mb-4">
                  Unlimited volume
                </p>
                <p className="font-body text-sm leading-relaxed text-[#eee9e0]/80 mb-4">
                  For dubbing apps, teams, and customer systems that need high-volume clone voice generation.
                </p>

                <ul className="grid gap-2 border-2 border-[#f5f0e8]/20 bg-white/[0.05] p-3 text-xs font-headline font-bold uppercase mb-4 text-[#f5f0e8]">
                  {businessPlanFeatures.map((feature) => (
                    <li key={feature} className="flex items-center gap-2">
                      <span className="h-1.5 w-1.5 rounded-full bg-accent" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>

                <div className="border-2 border-[#f5f0e8]/20 bg-white/[0.05] p-3 text-xs font-headline font-bold uppercase mb-4 text-[#f5f0e8]">
                  <p className="font-black text-primary-fixed">Business clone rate</p>
                  <p className="mt-1 leading-snug">Starts at 1.5 tokens/sec; high-volume prepaid can request 1 token/sec.</p>
                </div>

                <PlanFeatureBlock planKey="business" dark={true} />
              </div>

              <div className="grid gap-2 mt-6">
                <a
                  href="/business"
                  className="w-full text-center font-headline font-black uppercase text-sm border-4 border-[#f5f0e8] bg-[#f5f0e8] text-primary py-2.5 hover:bg-transparent hover:text-white transition shadow-[4px_4px_0px_0px_rgba(245,240,232,0.4)] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none"
                >
                  Talk to Business
                </a>
                <a
                  href="https://t.me/OfficalVoxTTS"
                  target="_blank"
                  rel="noreferrer"
                  className="w-full text-center font-headline font-black uppercase text-sm border-4 border-white/20 bg-transparent text-white py-2.5 hover:bg-white/10 transition"
                >
                  Telegram Support
                </a>
              </div>
            </article>
          </div>

          <div className="mt-6 border-4 border-primary bg-[#eee9e0] p-4 text-xs font-headline font-bold uppercase text-primary leading-relaxed">
            <p>Normal TTS = 1.5 tokens per generated audio second.</p>
            <p>Standard clone voice = 2 tokens per generated audio second.</p>
            <p>Business clone rate starts at 1.5 tokens/sec after approval; high-volume prepaid can request 1 token/sec.</p>
            <p>Beta pricing is limited-time and may change later.</p>
          </div>

          <PlanComparisonTable />
        </section>

        {/* API section code block switcher */}
        <section id="api" className="py-12 md:py-16 border-t-4 border-primary">
          <div className="grid gap-8 lg:grid-cols-2">
            <div>
              <span className="bg-tertiary text-on-tertiary border-2 border-primary font-headline uppercase font-bold text-xs px-2.5 py-1">
                Developer API
              </span>
              <h2 className="font-headline font-black text-3xl md:text-5xl uppercase tracking-tighter text-primary mt-4 mb-4">
                Use it from your own app
              </h2>
              <p className="font-body text-base md:text-lg text-on-surface-variant border-l-4 border-primary pl-4 max-w-xl">
                Create an API key in dashboard, then call the clone endpoint from your backend when the speaker must stay consistent. The platform handles token checks and worker routing.
              </p>
            </div>
            <div className="flex flex-col gap-4">
              <div className="border-4 border-primary bg-primary shadow-[4px_4px_0px_0px_rgba(26,26,26,1)] overflow-hidden">
                <div className="bg-[#eee9e0] border-b-2 border-primary px-4 py-2 font-headline uppercase font-black text-xs text-primary flex items-center justify-between">
                  <span>cURL Integration</span>
                  <span className="h-3 w-3 rounded-full bg-secondary"></span>
                </div>
                <pre className="p-4 overflow-x-auto font-mono text-xs text-[#faf7f2] bg-[#1a1a1a] leading-relaxed">
                  {`# Generate Standard TTS
POST /v1/audio/speech
Authorization: Bearer YOUR_API_KEY
Content-Type: application/json

{
  "model": "voxcpm2",
  "voice": "female",
  "input": "សួស្តី នេះជាការសាកល្បង",
  "output_format": "mp3"
}`}
                </pre>
              </div>

              <div className="border-4 border-primary bg-primary shadow-[4px_4px_0px_0px_rgba(26,26,26,1)] overflow-hidden">
                <div className="bg-[#eee9e0] border-b-2 border-primary px-4 py-2 font-headline uppercase font-black text-xs text-primary flex items-center justify-between">
                  <span>cURL Voice Cloning</span>
                  <span className="h-3 w-3 rounded-full bg-accent"></span>
                </div>
                <pre className="p-4 overflow-x-auto font-mono text-xs text-[#faf7f2] bg-[#1a1a1a] leading-relaxed">
                  {`# Clone Voice
POST /v1/audio/clone
Authorization: Bearer YOUR_API_KEY
Content-Type: multipart/form-data

sample=@reference.wav
input=soursdey nih ku chea somleng khmer
model=voxcpm2
output_format=mp3`}
                </pre>
              </div>
            </div>
          </div>
        </section>

        {/* FAQs Section */}
        <section id="faq" className="py-12 md:py-16 border-t-4 border-primary">
          <h2 className="font-headline font-black text-3xl md:text-5xl uppercase tracking-tighter text-primary mb-8">
            Frequently Asked Questions
          </h2>
          <div className="grid gap-6 md:grid-cols-2">
            {faqs.map((item) => (
              <article
                key={item.q}
                className="bg-white border-4 border-primary p-6 shadow-[4px_4px_0px_0px_rgba(26,26,26,1)]"
              >
                <h3 className="font-headline font-black text-lg uppercase tracking-tight mb-2 flex items-center gap-2">
                  <span className="text-tertiary font-black">?</span>
                  {item.q}
                </h3>
                <p className="font-body text-sm md:text-base leading-relaxed text-on-surface-variant border-t-2 border-[#eee9e0] pt-2 mt-2">
                  {item.a}
                </p>
              </article>
            ))}
          </div>
        </section>

        {/* Action support section */}
        <section className="w-full max-w-7xl mx-auto px-4 md:px-6 py-12 md:py-16 border-t-4 border-primary bg-primary-fixed shadow-[6px_6px_0px_0px_rgba(26,26,26,1)] border-4 border-primary my-12">
          <div className="text-center max-w-2xl mx-auto flex flex-col gap-6 items-center">
            <h2 className="font-headline font-black text-4xl md:text-5xl uppercase tracking-tighter text-primary leading-none">
              Start building Khmer voice apps today
            </h2>
            <p className="font-body text-base md:text-lg text-primary max-w-xl font-medium">
              Try Khmer Vox TTS with free tokens, then scale with API keys and batch clone workflows.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-4 w-full sm:w-auto">
              <a
                href="/app/signup"
                className="w-full sm:w-auto font-label uppercase font-bold bg-primary text-on-primary border-4 border-primary px-8 py-3.5 hover:bg-[#eee9e0] hover:text-primary transition shadow-[4px_4px_0px_0px_rgba(26,26,26,1)] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none"
              >
                Start Free
              </a>
              <a
                href="/support"
                className="w-full sm:w-auto font-label uppercase font-bold bg-white text-primary border-4 border-primary px-8 py-3.5 hover:bg-[#eee9e0] transition shadow-[4px_4px_0px_0px_rgba(26,26,26,1)] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none"
              >
                Contact Support
              </a>
            </div>
          </div>
        </section>
      </main>

      {/* Footer Section */}
      <footer className="w-full bg-primary border-t-4 border-primary text-[#f5f0e8]">
        <div className="w-full px-4 md:px-6 py-8 md:py-12 flex flex-col md:flex-row justify-between items-start md:items-center gap-6 md:gap-8 max-w-7xl mx-auto">
          <div className="flex flex-col gap-2 md:gap-4">
            <span className="text-xl md:text-2xl font-black text-primary-fixed font-headline tracking-tighter">KHMER VOX</span>
            <p className="font-body text-xs md:text-sm font-bold uppercase text-[#f5f0e8]/85">
              © 2024 KHMER VOX TTS. FORM FOLLOWS FUNCTION.
            </p>
          </div>
          <div className="flex flex-wrap gap-4 md:gap-8 font-body text-xs md:text-sm font-bold uppercase">
            <a className="text-[#f5f0e8]/80 hover:text-primary-fixed transition-colors" href="/privacy">Privacy</a>
            <a className="text-[#f5f0e8]/80 hover:text-primary-fixed transition-colors" href="/terms">Terms</a>
            <a className="text-[#f5f0e8]/80 hover:text-primary-fixed transition-colors" href="/docs">API Docs</a>
            <a className="text-[#f5f0e8]/80 hover:text-primary-fixed transition-colors" href="/business">Business</a>
            <a className="text-[#f5f0e8]/80 hover:text-primary-fixed transition-colors" href="/payments">Payments</a>
            <a className="text-[#f5f0e8]/80 hover:text-primary-fixed transition-colors" href="/review">Review</a>
            <a className="text-[#f5f0e8]/80 hover:text-primary-fixed transition-colors" href="/support">Support</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
