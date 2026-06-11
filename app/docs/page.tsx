import Link from "next/link";

import { ApiTestConsole } from "@/app/docs/api-test-console";
import { PLAN_COMPARISON_ROWS } from "@/lib/plan-details";
import { PublicHeader } from "@/app/components/public-header";
import { TOKEN_PACK_PLANS, formatUsd } from "@/lib/plans";
import {
  DEFAULT_USAGE_POLICIES,
  MAX_CLONE_SAMPLE_BYTES,
  MAX_TEXT_CHARS,
} from "@/lib/usage-policy";

const baseUrl = process.env.APP_PUBLIC_URL?.replace(/\/$/, "") || "https://voxtts.online";

const errorRows = [
  ["401", "Missing bearer token."],
  ["403", "Invalid bearer token or suspended account."],
  ["402", "Insufficient tokens for this request."],
  ["429", "Rate limit or concurrency limit reached."],
  ["502", "Upstream TTS worker failed."],
];

const navItems = [
  ["Overview", "#overview"],
  ["Quickstart", "#quickstart"],
  ["Text to Speech", "#speech"],
  ["Clone Voice", "#clone"],
  ["Dubbing Setup", "#dubbing-setup"],
  ["Batch Jobs", "#batch"],
  ["Dubbing JSON", "#dubbing"],
  ["Test Console", "#test-console"],
  ["Tokens and Limits", "#tokens"],
  ["Responses", "#responses"],
  ["Errors", "#errors"],
  ["Payment Webhooks", "#webhooks"],
];

const platformStats = [
  ["Base URL", baseUrl],
  ["Authentication", "Bearer API key"],
  ["Output", "MP3 audio + MP3 job ZIP"],
];

const endpointCards = [
  {
    title: "Speech",
    path: "/api/v1/audio/speech",
    note: "Fast single-call TTS for tests where speaker consistency is not required.",
  },
  {
    title: "Clone",
    path: "/api/v1/audio/clone",
    note: "Reference-audio voice for real products and business users.",
  },
  {
    title: "Batch Clone",
    path: "/api/v1/audio/batch/clone",
    note: "Async high-volume jobs with external IDs, metadata, and webhook callbacks.",
  },
];

export default function ApiDocsPage() {
  return (
    <div className="min-h-screen bg-background text-primary font-body flex flex-col">
      {/* Top Header */}
      <PublicHeader />

      {/* Main Layout containing Side Navigation and Documentations */}
      <div className="flex flex-grow w-full max-w-7xl mx-auto items-stretch">
        {/* w-64 Sidebar Navigation (Shared Component Style) */}
        <aside className="hidden lg:flex flex-col w-64 border-r-4 border-outline bg-background p-4 sticky top-[76px] h-[calc(100vh-76px)] overflow-y-auto no-scrollbar shrink-0">
          <div className="mb-8 border-b-2 border-outline pb-4">
            <h2 className="font-headline text-lg font-black uppercase tracking-tighter text-primary">API REFERENCE</h2>
            <p className="font-headline font-bold text-xs text-on-surface-variant uppercase mt-1">Version 1.12.0</p>
          </div>
          <nav className="flex-1 flex flex-col gap-2">
            {navItems.map(([label, href]) => (
              <a
                key={href}
                className="flex items-center gap-3 p-3 text-primary border-2 border-transparent font-headline font-bold uppercase text-xs hover:bg-[#ffcc00] hover:border-outline hover:text-primary transition-all duration-100 active:translate-x-0.5 active:translate-y-0.5 active:shadow-none"
                href={href}
              >
                {label}
              </a>
            ))}
          </nav>
          <div className="mt-auto pt-4 border-t-4 border-outline flex flex-col gap-2">
            <Link
              href="/business"
              className="flex items-center justify-between group p-3 border-2 border-outline bg-[#d6e3ff] hover:bg-[#ffcc00] transition-colors font-headline font-bold uppercase text-[10px]"
            >
              Business Setup
              <span className="material-symbols-outlined text-sm group-hover:translate-x-1 transition-transform">arrow_forward</span>
            </Link>
          </div>
        </aside>

        {/* Documentation Content Area */}
        <main className="flex-1 p-6 md:p-12 lg:p-16 max-w-4xl min-w-0">
          {/* Header section with Badge */}
          <div className="mb-12 border-b-4 border-outline pb-8 text-left">
            <div className="inline-block bg-[#ffcc00] border-4 border-outline px-3 py-1 mb-4 shadow-[4px_4px_0px_0px_rgba(26,26,26,1)]">
              <span className="font-headline font-black uppercase tracking-widest text-primary text-xs">Official API Documentation</span>
            </div>
            <h1 className="text-5xl md:text-7xl font-display font-black text-primary tracking-tighter uppercase leading-none mb-4">
              Developer Docs
            </h1>
            <p className="text-lg md:text-xl font-body font-medium text-on-surface-variant max-w-2xl leading-relaxed">
              Integrate realistic text-to-speech (TTS) and voice cloning capabilities into your apps via standard RESTful endpoints.
            </p>
          </div>

          <div className="space-y-16">
            {/* Overview Section */}
            <section id="overview" className="scroll-mt-24 border-4 border-outline bg-white p-6 text-primary shadow-[6px_6px_0px_0px_rgba(26,26,26,1)] lg:p-8 relative text-left">
              <div className="absolute -top-4 -right-4 w-8 h-8 bg-[#ffcc00] border-4 border-outline"></div>
              <h2 className="text-3xl font-headline font-black uppercase mb-6 flex items-center gap-3">
                <span className="material-symbols-outlined text-4xl">info</span>
                Overview
              </h2>
              <div className="grid gap-8 xl:grid-cols-[1.1fr_0.9fr]">
                <div>
                  <p className="font-body text-sm leading-relaxed text-on-surface-variant border-l-4 border-outline pl-4 mb-6">
                    Khmer Vox TTS exposes audio endpoints backed by VoxCPM. For production apps and business
                    customers, use clone voice with a reference audio sample because normal VoxCPM speech can
                    change speaker between generations. Single calls return MP3 audio bytes; batch calls create
                    queued jobs that can be polled or downloaded as ZIP files containing MP3 files.
                  </p>
                  <div className="flex flex-wrap gap-3">
                    <Link href="#test-console" className="px-5 py-3 bg-primary text-on-primary border-2 border-outline font-headline font-bold uppercase text-xs shadow-[4px_4px_0px_0px_rgba(26,26,26,1)] hover:bg-[#0055ff] transition-colors active:translate-x-0.5 active:translate-y-0.5 active:shadow-none">
                      Try API Console
                    </Link>
                    <Link href="/app/dashboard/api" className="px-5 py-3 bg-white text-primary border-2 border-outline font-headline font-bold uppercase text-xs shadow-[4px_4px_0px_0px_rgba(26,26,26,1)] hover:bg-surface-variant transition-colors active:translate-x-0.5 active:translate-y-0.5 active:shadow-none">
                      Create API Key
                    </Link>
                  </div>
                </div>
                <div>
                  <div className="border-4 border-outline bg-surface-container-low p-5 shadow-[4px_4px_0px_0px_rgba(26,26,26,1)]">
                    <p className="text-xs font-headline font-black uppercase tracking-widest text-[#4a4a4a] border-b-2 border-outline pb-2 mb-4">Production path</p>
                    <div className="grid gap-4">
                      {endpointCards.map((card) => (
                        <a key={card.path} href={card.path.includes("batch") ? "#batch" : card.path.includes("clone") ? "#clone" : "#speech"} className="block border-2 border-outline bg-white p-4 shadow-[2px_2px_0px_0px_rgba(26,26,26,1)] hover:bg-surface-container transition-all">
                          <div className="flex items-center justify-between gap-3">
                            <h2 className="font-headline font-bold uppercase text-xs text-primary">{card.title}</h2>
                            <span className="bg-[#def3e5] px-2 py-0.5 border border-outline font-mono text-[9px] font-black text-[#0f6a33]">POST</span>
                          </div>
                          <p className="mt-2 break-all font-mono text-[10px] font-bold text-tertiary">{card.path}</p>
                          <p className="mt-1 text-xs text-on-surface-variant font-body">{card.note}</p>
                        </a>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-3 mt-8 pt-6 border-t-2 border-outline">
                {platformStats.map(([title, value]) => (
                  <div key={title} className="border-2 border-outline bg-[#faf7f2] p-4 shadow-[2px_2px_0px_0px_rgba(26,26,26,1)]">
                    <p className="text-[10px] font-headline font-black uppercase tracking-wider text-[#4a4a4a]">{title}</p>
                    <p className="mt-2 break-all text-xs font-mono font-bold text-primary">{value}</p>
                  </div>
                ))}
              </div>
            </section>

            {/* Quickstart Section */}
            <section id="quickstart" className="scroll-mt-24 border-4 border-outline bg-white p-6 shadow-[6px_6px_0px_0px_rgba(26,26,26,1)] text-left">
              <div className="flex flex-wrap items-end justify-between gap-3 border-b-2 border-outline pb-4 mb-6">
                <div>
                  <p className="text-[10px] font-headline font-black uppercase tracking-widest text-[#4a4a4a] mb-1">Get started</p>
                  <h2 className="text-3xl font-headline font-black uppercase text-primary">Quickstart</h2>
                </div>
                <Link href="/app/dashboard/billing" className="px-4 py-2 border-2 border-outline bg-[#ffcc00] text-primary font-headline font-bold uppercase text-xs shadow-[2px_2px_0px_0px_rgba(26,26,26,1)] hover:bg-[#e6b800] transition-all">
                  Buy tokens
                </Link>
              </div>
              <ol className="grid gap-4 text-sm">
                <Step number={1} text="Create an account or sign in." />
                <Step number={2} text="Buy Creator, Pro, or a paid token pack from Billing. Free accounts cannot create or use API keys." />
                <Step number={3} text="Open Dashboard > API and create an API key. Daily and monthly limits are optional." />
                <Step number={4} text="For dubbing tools, start with the multipart clone endpoint using sample, input, and voice_consent=true. Use batch clone with items for many segments." />
              </ol>
            </section>

            {/* Dubbing Setup Section */}
            <section id="dubbing-setup" className="scroll-mt-24 border-4 border-outline bg-white p-6 shadow-[6px_6px_0px_0px_rgba(26,26,26,1)] text-left">
              <div className="flex flex-wrap items-start justify-between gap-3 border-b-2 border-outline pb-4 mb-6">
                <div>
                  <p className="text-[10px] font-headline font-black uppercase tracking-widest text-[#4a4a4a] mb-1">Dubbing integration</p>
                  <h2 className="text-3xl font-headline font-black uppercase text-primary">Use this setup for video dubbing tools</h2>
                  <p className="mt-2 max-w-3xl text-xs leading-relaxed text-on-surface-variant font-body">
                    Dubbing systems should use clone voice with a reference speaker sample. Do not depend on a named
                    voice for business work because normal VoxCPM speech can change speaker between calls.
                  </p>
                </div>
                <Link href="#test-console" className="px-4 py-2 border-2 border-outline bg-primary text-on-primary font-headline font-bold uppercase text-xs shadow-[2px_2px_0px_0px_rgba(26,26,26,1)] hover:bg-[#0055ff] transition-all">
                  Test multipart clone
                </Link>
              </div>
              <div className="grid gap-4 lg:grid-cols-3">
                <DubbingSetupCard
                  title="1. First live test"
                  body="Call /api/v1/audio/clone with multipart/form-data. Send sample as a file, input as speech text, and voice_consent=true."
                  code={`sample=@reference.wav\ninput=your text here\nvoice_consent=true`}
                />
                <DubbingSetupCard
                  title="2. Production segments"
                  body="For many short lines, call /api/v1/audio/batch/clone with items. Put your segment ID in id or external_id so the ZIP filenames map back to video segments."
                  code={`items[0].id=episode01_seg_0001\nitems[0].text=Khmer line text\noutput=MP3 ZIP`}
                />
                <DubbingSetupCard
                  title="3. Timing work"
                  body="The API returns MP3 audio. Your dubber should trim leading silence and fit audio to the target video timing after download."
                  code={`trim leading silence\nfit to start_ms/end_ms\nmix into video`}
                />
              </div>
            </section>

            {/* Test Console */}
            <ApiTestConsole baseUrl={baseUrl} />

            {/* Endpoints */}
            <EndpointSection
              id="speech"
              method="POST"
              path="/api/v1/audio/speech"
              title="Text to Speech"
              description="Generate speech using our built-in standard preset voices: Female (Sokha) or Male (Piseth). Token cost is 1.5 tokens per estimated output second."
            >
              <CodeBlock
                title="cURL"
                code={`curl -X POST "${baseUrl}/api/v1/audio/speech" \\\n  -H "Authorization: Bearer YOUR_API_KEY" \\\n  -H "Content-Type: application/json" \\\n  --output speech.mp3 \\\n  --data '{\n    "model": "voxcpm2",\n    "voice": "female",  # Optional: "female" (Sokha) or "male" (Piseth)\n    "input": "soursdey nih ku chea somleng khmer",\n    "output_format": "mp3"\n  }'`}
              />
              <CodeBlock
                title="Python"
                code={`import requests\n\nresponse = requests.post(\n    "${baseUrl}/api/v1/audio/speech",\n    headers={\n        "Authorization": "Bearer YOUR_API_KEY",\n        "Content-Type": "application/json",\n    },\n    json={\n        "model": "voxcpm2",\n        "voice": "female",  # Optional: "female" (Sokha) or "male" (Piseth)\n        "input": "soursdey nih ku chea somleng khmer",\n        "output_format": "mp3",\n    },\n    timeout=600,\n)\nresponse.raise_for_status()\nopen("speech.mp3", "wb").write(response.content)\nprint(response.headers.get("X-Remaining-Tokens"))`}
              />
              <FieldTable
                rows={[
                  ["input", "string", `Required. 1 to ${MAX_TEXT_CHARS.toLocaleString()} characters.`],
                  ["voice", "string", "Optional. Set to 'female' (default preset, Sokha) or 'male' (Piseth) to select standard voices."],
                  ["model", "string", "Optional. Default comes from the deployed worker, usually voxcpm2."],
                  ["output_format", "string", "Optional. Only mp3 is supported by the public API."],
                ]}
              />
            </EndpointSection>

            <EndpointSection
              id="clone"
              method="POST"
              path="/api/v1/audio/clone"
              title="Session Clone Voice"
              description="Recommended for real users and business API customers. For dubbing tools, use the multipart upload format first. The reference audio controls the speaker for the request/session and is not saved as a lifetime voice profile."
            >
              <CodeBlock
                title="Multipart upload recommended"
                code={`curl -X POST "${baseUrl}/api/v1/audio/clone" \\\n  -H "Authorization: Bearer YOUR_API_KEY" \\\n  --output cloned.mp3 \\\n  -F "sample=@reference.wav;type=audio/wav" \\\n  -F "input=soursdey nih ku chea somleng khmer" \\\n  -F "model=voxcpm2" \\\n  -F "voice_consent=true" \\\n  -F "output_format=mp3"`}
              />
              <CodeBlock
                title="Python multipart file send"
                code={`import requests\n\nfiles = {\n    "sample": ("ref.wav", open("reference.wav", "rb"), "audio/wav"),\n}\ndata = {\n    "input": "soursdey nih ku chea somleng khmer",\n    "model": "voxcpm2",\n    "voice_consent": "true",\n    "output_format": "mp3",\n}\n\nresponse = requests.post(\n    "${baseUrl}/api/v1/audio/clone",\n    headers={"Authorization": "Bearer YOUR_API_KEY"},\n    files=files,\n    data=data,\n    timeout=600,\n)\nresponse.raise_for_status()\nopen("cloned.mp3", "wb").write(response.content)`}
              />
              <FieldTable
                rows={[
                  ["sample", "file (binary)", `Required. WAV or MP3 audio file containing clean voice sample, max ${(MAX_CLONE_SAMPLE_BYTES / 1024 / 1024).toFixed(1)}MB.`],
                  ["input", "string", `Required. 1 to ${MAX_TEXT_CHARS.toLocaleString()} characters.`],
                  ["voice_consent", "boolean", "Required. Must be set to true indicating the user has permission to use the reference voice."],
                  ["model", "string", "Optional. Default is voxcpm2."],
                  ["voice", "string", "Optional. Descriptive guide for prosody styling."],
                ]}
              />
            </EndpointSection>

            <EndpointSection
              id="batch"
              method="POST"
              path="/api/v1/audio/batch/clone"
              title="Batch Clone Voice (Async)"
              description="Ideal for dubbing lines. Submit a reference voice sample and a list of text items. The request finishes instantly, returning a job ID that polls progress until ZIP download is ready."
            >
              <CodeBlock
                title="cURL Multipart Batch"
                code={`curl -X POST "${baseUrl}/api/v1/audio/batch/clone" \\\n  -H "Authorization: Bearer YOUR_API_KEY" \\\n  -F "sample=@reference.wav;type=audio/wav" \\\n  -F "model=voxcpm2" \\\n  -F "voice_consent=true" \\\n  -F "webhook_url=https://your-app.com/callback" \\\n  -F "items=[{\\"id\\":\\"seg01\\",\\"text\\":\\"soursdey segment one\\"},{\\"id\\":\\"seg02\\",\\"text\\":\\"somleng khmer segment two\\"}]"`}
              />
              <CodeBlock
                title="Python Multipart Batch"
                code={`import json\nimport requests\n\nfiles = {\n    "sample": ("ref.wav", open("reference.wav", "rb"), "audio/wav"),\n}\ndata = {\n    "voice_consent": "true",\n    "webhook_url": "https://your-app.com/callback",\n    "items": json.dumps([\n        {"id": "seg01", "text": "soursdey segment one"},\n        {"id": "seg02", "text": "somleng khmer segment two"},\n    ]),\n}\n\nresponse = requests.post(\n    "${baseUrl}/api/v1/audio/batch/clone",\n    headers={"Authorization": "Bearer YOUR_API_KEY"},\n    files=files,\n    data=data,\n    timeout=60,\n)\nprint(response.json()) # Contains job_id, status: pending`}
              />
              <FieldTable
                rows={[
                  ["sample", "file (binary)", "Required. Voice sample sample for the batch speaker, max 8MB."],
                  ["items", "JSON array/string", "Required list of generation items. Each item must have text. id and title are optional. Maximum 100 items per batch request."],
                  ["voice_consent", "boolean", "Required. Must be set to true."],
                  ["webhook_url", "string", "Optional. Webhook URL to receive a POST event when the batch completes or fails."],
                  ["model", "string", "Optional. Default is voxcpm2."],
                ]}
              />
            </EndpointSection>

            {/* Tokens & Limits */}
            <section id="tokens" className="scroll-mt-24 border-4 border-outline bg-white p-6 shadow-[6px_6px_0px_0px_rgba(26,26,26,1)] text-left">
              <h2 className="text-3xl font-headline font-black uppercase text-primary border-b-2 border-outline pb-4 mb-6">Tokens and limits</h2>
              <div className="grid gap-6 md:grid-cols-2">
                <div className="border-2 border-outline bg-[#faf7f2] p-5 shadow-[2px_2px_0px_0px_rgba(26,26,26,1)]">
                  <h3 className="font-headline font-black uppercase text-xs text-primary mb-3">Token Deductions</h3>
                  <ul className="space-y-3 font-body text-xs font-medium text-on-surface-variant">
                    <li className="flex justify-between items-center border-b border-outline-variant pb-2">
                      <span>Standard Speech</span>
                      <span className="font-bold text-primary">1.5 tokens / generated audio sec</span>
                    </li>
                    <li className="flex justify-between items-center border-b border-outline-variant pb-2">
                      <span>Standard Voice Cloning</span>
                      <span className="font-bold text-primary">2.0 tokens / generated audio sec</span>
                    </li>
                    <li className="flex justify-between items-center pb-2">
                      <span>Approved Business Clone</span>
                      <span className="font-bold text-primary">1.5 tokens / generated audio sec</span>
                    </li>
                  </ul>
                </div>
                <div className="border-2 border-outline bg-[#faf7f2] p-5 shadow-[2px_2px_0px_0px_rgba(26,26,26,1)]">
                  <h3 className="font-headline font-black uppercase text-xs text-primary mb-3">Platform Safety Default Limits</h3>
                  <ul className="space-y-3 font-body text-xs font-medium text-on-surface-variant">
                    <li className="flex justify-between items-center border-b border-outline-variant pb-2">
                      <span>Max Input Characters</span>
                      <span className="font-bold text-primary">{MAX_TEXT_CHARS.toLocaleString()} chars</span>
                    </li>
                    <li className="flex justify-between items-center border-b border-outline-variant pb-2">
                      <span>Max Reference Audio size</span>
                      <span className="font-bold text-primary">{(MAX_CLONE_SAMPLE_BYTES / 1024 / 1024).toFixed(0)} MB</span>
                    </li>
                    <li className="flex justify-between items-center pb-2">
                      <span>API Concurrent Requests</span>
                      <span className="font-bold text-primary">{DEFAULT_USAGE_POLICIES.apiTts.maxConcurrent} concurrency</span>
                    </li>
                  </ul>
                </div>
              </div>
            </section>

            {/* Response Formats */}
            <section id="responses" className="scroll-mt-24 border-4 border-outline bg-white p-6 shadow-[6px_6px_0px_0px_rgba(26,26,26,1)] text-left">
              <h2 className="text-3xl font-headline font-black uppercase text-primary border-b-2 border-outline pb-4 mb-6">Response Metadata</h2>
              <p className="font-body text-sm text-on-surface-variant leading-relaxed mb-6">
                All successful speech and clone endpoints return the raw MP3 audio bytes directly in the response body. Additional usage metadata is provided via HTTP headers.
              </p>
              <div className="grid gap-4">
                <InfoCard title="Content-Type" value="audio/mpeg" />
                <InfoCard title="X-Remaining-Tokens" value="Available prepaid token balance left on the user's account after deducting for this request." />
                <InfoCard title="X-Credits-Charged" value="Prepaid tokens deducted for the generation duration." />
                <InfoCard title="X-Generation-Duration-Seconds" value="The exact duration of the generated audio in seconds (used to calculate X-Credits-Charged)." />
              </div>
            </section>

            {/* Error handling */}
            <section id="errors" className="scroll-mt-24 border-4 border-outline bg-white p-6 shadow-[6px_6px_0px_0px_rgba(26,26,26,1)] text-left">
              <p className="text-[10px] font-headline font-black uppercase tracking-widest text-[#4a4a4a] mb-1">Failure states</p>
              <h2 className="text-3xl font-headline font-black uppercase text-primary mb-6">Errors</h2>
              <div className="overflow-hidden border-4 border-outline bg-white shadow-[4px_4px_0px_0px_rgba(26,26,26,1)]">
                <table className="w-full text-sm text-left">
                  <thead className="bg-[#eee9e0] text-[#1a1a1a] font-headline uppercase font-black border-b-2 border-outline">
                    <tr>
                      <th className="px-4 py-3 border-r-2 border-outline">HTTP Code</th>
                      <th className="px-4 py-3">Cause / Recovery</th>
                    </tr>
                  </thead>
                  <tbody className="font-body text-xs font-medium">
                    {errorRows.map(([status, message]) => (
                      <tr key={status} className="border-t-2 border-outline">
                        <td className="w-28 px-4 py-3 font-mono font-bold text-[#e63b2e] border-r-2 border-outline">{status}</td>
                        <td className="px-4 py-3 text-[#1a1a1a]">{message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {/* Webhooks */}
            <section id="webhooks" className="scroll-mt-24 border-4 border-outline bg-white p-6 shadow-[6px_6px_0px_0px_rgba(26,26,26,1)] text-left">
              <p className="text-[10px] font-headline font-black uppercase tracking-widest text-[#4a4a4a] mb-1">Payment readiness</p>
              <h2 className="text-3xl font-headline font-black uppercase text-primary mb-4">Payment Webhooks</h2>
              <p className="font-body text-sm leading-relaxed text-on-surface-variant mb-6">
                Current checkout uses KHQRcc ABA Pay QR. Configure the callback URL below in KHQRcc so the
                app can check signature, amount, currency, order status, and duplicate callbacks before
                adding credits automatically.
              </p>
              <CodeBlock title="Webhook URL" code={`${baseUrl}/api/webhooks/khqrcc`} />
              <div className="mt-6 grid gap-4 md:grid-cols-2">
                <InfoCard title="Current mode" value="KHQRcc ABA Pay QR checkout" />
                <InfoCard title="Verification" value="Signed callback + transaction check" />
              </div>
              <div className="mt-6 flex flex-wrap gap-3 pt-6 border-t-2 border-outline">
                <Link
                  href="/payment-guide"
                  className="px-4 py-2 border-2 border-outline bg-white text-primary font-headline font-bold uppercase text-xs shadow-[2px_2px_0px_0px_rgba(26,26,26,1)] hover:bg-surface-variant transition-colors"
                >
                  Payment Guide
                </Link>
                <Link
                  href="/refund-policy"
                  className="px-4 py-2 border-2 border-outline bg-white text-primary font-headline font-bold uppercase text-xs shadow-[2px_2px_0px_0px_rgba(26,26,26,1)] hover:bg-surface-variant transition-colors"
                >
                  Refund Policy
                </Link>
              </div>
            </section>
          </div>
        </main>
      </div>
    </div>
  );
}

function InfoCard({ title, value }: { title: string; value: string }) {
  return (
    <div className="border-2 border-outline bg-[#faf7f2] p-4 shadow-[2px_2px_0px_0px_rgba(26,26,26,1)]">
      <p className="text-[10px] font-headline font-black uppercase tracking-wider text-[#4a4a4a]">{title}</p>
      <p className="mt-2 break-all text-xs font-body font-bold text-primary">{value}</p>
    </div>
  );
}

function Step({ number, text }: { number: number; text: string }) {
  return (
    <li className="flex gap-3 border-2 border-outline bg-[#faf7f2] px-4 py-3 shadow-[2px_2px_0px_0px_rgba(26,26,26,1)]">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center border-2 border-outline bg-primary text-xs font-headline font-black text-white">
        {number}
      </span>
      <span className="pt-1 font-body text-xs font-medium text-primary">{text}</span>
    </li>
  );
}

function DubbingSetupCard({ title, body, code }: { title: string; body: string; code: string }) {
  return (
    <div className="border-2 border-outline bg-white p-5 shadow-[2px_2px_0px_0px_rgba(26,26,26,1)]">
      <h3 className="font-headline font-black uppercase text-xs text-primary">{title}</h3>
      <p className="mt-2 text-xs leading-5 text-on-surface-variant font-body">{body}</p>
      <pre className="mt-3 overflow-auto border-2 border-outline bg-[#1a1a1a] text-on-primary p-3 font-mono text-[10px] leading-5">
        {code}
      </pre>
    </div>
  );
}

function EndpointSection({
  id,
  method,
  path,
  title,
  description,
  children,
}: {
  id: string;
  method: string;
  path: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24 border-4 border-outline bg-white p-6 shadow-[6px_6px_0px_0px_rgba(26,26,26,1)]">
      <div className="flex flex-wrap items-start justify-between gap-3 text-left">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="bg-[#def3e5] px-3 py-1 border-2 border-outline font-mono text-xs font-black text-[#0f6a33]">
              {method}
            </span>
            <span className="break-all border-2 border-outline bg-[#faf7f2] px-3 py-1 font-mono text-xs font-bold text-primary">
              {path}
            </span>
          </div>
          <h2 className="mt-4 text-2xl font-headline font-black uppercase text-primary">{title}</h2>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-on-surface-variant font-body">{description}</p>
        </div>
      </div>
      <div className="mt-5 grid gap-4">{children}</div>
    </section>
  );
}

function CodeBlock({ title, code, dark = false }: { title: string; code: string; dark?: boolean }) {
  return (
    <div className="border-4 border-outline bg-[#1a1a1a] shadow-[4px_4px_0px_0px_rgba(26,26,26,1)] overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b-2 border-outline px-4 py-2.5 text-xs font-headline font-bold uppercase text-[#faf7f2] bg-[#2d2d2d]">
        <span>{title}</span>
        <span className="bg-primary text-[#ffcc00] border border-outline px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider font-black">
          example
        </span>
      </div>
      <pre className="smooth-scroll-region overflow-x-auto p-4 font-mono text-xs leading-6 text-[#faf7f2] text-left">
        {code}
      </pre>
    </div>
  );
}

function FieldTable({ rows }: { rows: Array<[string, string, string]> }) {
  return (
    <div className="smooth-scroll-region overflow-auto border-4 border-outline bg-white shadow-[4px_4px_0px_0px_rgba(26,26,26,1)]">
      <table className="w-full min-w-[680px] text-sm text-left">
        <thead className="bg-[#eee9e0] text-[#1a1a1a] font-headline uppercase font-black border-b-2 border-outline">
          <tr>
            <th className="px-4 py-3 font-semibold border-r-2 border-outline">Field</th>
            <th className="px-4 py-3 font-semibold border-r-2 border-outline">Type</th>
            <th className="px-4 py-3 font-semibold">Description</th>
          </tr>
        </thead>
        <tbody className="font-body text-xs font-medium">
          {rows.map(([field, type, description]) => (
            <tr key={field} className="border-t-2 border-outline">
              <td className="px-4 py-3 font-mono font-bold text-[#0f6a33] border-r-2 border-outline">{field}</td>
              <td className="px-4 py-3 text-[#1a1a1a] border-r-2 border-outline">{type}</td>
              <td className="px-4 py-3 text-on-surface-variant">{description}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
