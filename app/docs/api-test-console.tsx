"use client";

import { useEffect, useMemo, useState } from "react";

type ConsoleMode = "speech" | "clone" | "batch_clone";

type ApiTestConsoleProps = {
  baseUrl: string;
};

const modes: Array<{
  id: ConsoleMode;
  label: string;
  endpoint: string;
  note: string;
}> = [
  {
    id: "speech",
    label: "Speech",
    endpoint: "/api/v1/audio/speech",
    note: "Quick TTS test. Speaker can vary between generations.",
  },
  {
    id: "clone",
    label: "Clone",
    endpoint: "/api/v1/audio/clone",
    note: "Recommended for dubbing tests. Sends multipart/form-data with sample, input, and voice_consent=true.",
  },
  {
    id: "batch_clone",
    label: "Batch Clone",
    endpoint: "/api/v1/audio/batch/clone",
    note: "Creates an async clone job. Use this for many dubbing/customer-system segments.",
  },
];

export function ApiTestConsole({ baseUrl }: ApiTestConsoleProps) {
  const [mode, setMode] = useState<ConsoleMode>("clone");
  const [apiKey, setApiKey] = useState("");
  const [voice, setVoice] = useState("female");
  const [input, setInput] = useState("soursdey nih ku chea somleng khmer");
  const [webhookUrl, setWebhookUrl] = useState("");
  const [referenceFile, setReferenceFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [responseText, setResponseText] = useState("");
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  const activeMode = useMemo(() => modes.find((item) => item.id === mode) ?? modes[1], [mode]);
  const fullUrl = `${baseUrl}${activeMode.endpoint}`;
  const needsReference = mode === "clone" || mode === "batch_clone";

  useEffect(() => {
    return () => {
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
  }, [audioUrl]);

  async function runTest() {
    if (!apiKey.trim()) {
      setStatus("Missing API key");
      setResponseText("Create a paid API key from Dashboard > API, then paste it here.");
      return;
    }
    if (needsReference && !referenceFile) {
      setStatus("Missing reference audio");
      setResponseText("Clone requests need a WAV or MP3 reference sample from the speaker.");
      return;
    }

    setLoading(true);
    setStatus(null);
    setResponseText("");
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
      setAudioUrl(null);
    }

    try {
      const headers: HeadersInit = {
        Authorization: `Bearer ${apiKey.trim()}`,
      };
      let body: BodyInit;

      if (mode === "speech") {
        headers["Content-Type"] = "application/json";
        body = JSON.stringify({
          model: "voxcpm2",
          voice,
          input,
          output_format: "mp3",
        });
      } else {
        const formData = new FormData();
        formData.set("sample", referenceFile as File);
        formData.set("input", input);
        formData.set("model", "voxcpm2");
        formData.set("voice", "match the reference speaker clearly");
        formData.set("voice_consent", "true");
        formData.set("output_format", "mp3");
        if (mode === "batch_clone") {
          formData.set("title", "Docs test batch");
          if (webhookUrl.trim()) {
            formData.set("webhook_url", webhookUrl.trim());
          }
        }
        body = formData;
      }

      const response = await fetch(fullUrl, {
        method: "POST",
        headers,
        body,
      });

      const text = await response.text();
      setStatus(`HTTP ${response.status}`);

      if (response.ok) {
        const contentType = response.headers.get("content-type") || "";
        if (contentType.includes("audio/")) {
          try {
            const blob = new Blob([new Uint8Array(Array.from(text, (c) => c.charCodeAt(0)))], {
              type: "audio/mp3",
            });
            const rawResponse = await fetch(fullUrl, { method: "POST", headers, body });
            const audioBlob = await rawResponse.blob();
            const url = URL.createObjectURL(audioBlob);
            setAudioUrl(url);
            setResponseText(`Success! Audio bytes received.\nRemaining-Tokens: ${response.headers.get("X-Remaining-Tokens") || "-"}`);
            return;
          } catch (err) {
            setResponseText(`Audio binary parsed with error: ${err instanceof Error ? err.message : "Unknown"}`);
            return;
          }
        }

        try {
          const json = JSON.parse(text) as { job?: { id: string; status: string; download_url?: string } };
          if (json.job) {
            setResponseText(
              [
                "SUCCESS (Async Batch Job Created)",
                `job_id: ${json.job.id}`,
                `status: ${json.job.status}`,
                `download_url: ${json.job.download_url ?? "-"}`,
              ].join("\n"),
            );
            return;
          }
          setResponseText(JSON.stringify(json, null, 2));
          return;
        } catch {
          setResponseText(text);
          return;
        }
      }
      setResponseText(text || "No response body.");
    } catch (error) {
      setStatus("Request failed");
      setResponseText(error instanceof Error ? error.message : "Could not send request.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section id="test-console" className="scroll-mt-24 overflow-hidden border-4 border-outline bg-white shadow-[6px_6px_0px_0px_rgba(26,26,26,1)]">
      <div className="border-b-4 border-outline bg-[#1a1a1a] p-6 text-white text-left">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="font-headline text-xs font-black uppercase tracking-widest text-[#ffcc00] mb-1">Live API test</p>
            <h2 className="text-3xl font-headline font-black uppercase tracking-tighter text-white">Test Console</h2>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-[#e8e3da] font-body">
              Paste a paid API key and send a real request from this browser. The key stays only in this
              form state and is not saved. Requests can use tokens.
            </p>
          </div>
          <a
            href="/app/dashboard/api"
            className="px-4 py-2 border-2 border-outline bg-white text-primary font-headline font-bold uppercase text-xs shadow-[2px_2px_0px_0px_rgba(26,26,26,1)] hover:bg-[#ffcc00] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all"
          >
            Manage Keys
          </a>
        </div>
      </div>

      <div className="grid gap-6 p-6 text-left">
        <div className="flex flex-wrap gap-2">
          {modes.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setMode(item.id)}
              className={`border-2 border-outline px-4 py-2 font-headline font-black uppercase text-xs transition-all shadow-[2px_2px_0px_0px_rgba(26,26,26,1)] cursor-pointer ${
                mode === item.id
                  ? "bg-[#ffcc00] text-primary shadow-none translate-x-[1px] translate-y-[1px]"
                  : "bg-white text-[#1a1a1a] hover:bg-surface-variant"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="border-2 border-outline bg-[#faf7f2] p-4 shadow-[2px_2px_0px_0px_rgba(26,26,26,1)]">
          <p className="break-all font-mono text-xs font-bold text-tertiary">{fullUrl}</p>
          <p className="mt-2 text-xs font-body font-medium text-on-surface-variant">{activeMode.note}</p>
        </div>

        <div className="flex flex-col gap-2">
          <label className="font-headline font-black uppercase text-xs text-primary" htmlFor="console-api-key">
            API key
          </label>
          <input
            id="console-api-key"
            type="password"
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
            autoComplete="off"
            spellCheck={false}
            placeholder="kv_live_..."
            className="w-full p-4 border-2 border-outline bg-surface text-[#1a1a1a] font-mono text-sm placeholder:text-[#4a4a4a]/50 rounded-none focus:outline-none focus:bg-white"
          />
        </div>

        {mode === "speech" ? (
          <div className="flex flex-col gap-2">
            <label className="font-headline font-black uppercase text-xs text-primary" htmlFor="console-voice">
              Voice style
            </label>
            <select
              id="console-voice"
              value={voice}
              onChange={(event) => setVoice(event.target.value)}
              className="w-full p-4 border-2 border-outline bg-surface text-[#1a1a1a] font-body text-sm rounded-none focus:outline-none focus:bg-white cursor-pointer"
            >
              <option value="female">Female (Sokha)</option>
              <option value="male">Male (Piseth)</option>
            </select>
          </div>
        ) : null}

        <div className="flex flex-col gap-2">
          <label className="font-headline font-black uppercase text-xs text-primary" htmlFor="console-text-input">
            Text input
          </label>
          <textarea
            id="console-text-input"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            rows={mode === "batch_clone" ? 5 : 3}
            className="w-full p-4 border-2 border-outline bg-surface text-[#1a1a1a] font-body text-sm placeholder:text-[#4a4a4a]/50 rounded-none focus:outline-none focus:bg-white"
          />
        </div>

        {needsReference ? (
          <div className="grid gap-3">
            <div className="flex flex-col gap-2">
              <label className="font-headline font-black uppercase text-xs text-primary" htmlFor="console-ref-audio">
                Reference audio
              </label>
              <input
                id="console-ref-audio"
                type="file"
                accept="audio/*"
                onChange={(event) => setReferenceFile(event.target.files?.[0] ?? null)}
                className="w-full p-4 border-2 border-outline bg-surface text-[#1a1a1a] font-body text-sm rounded-none focus:outline-none focus:bg-white"
              />
            </div>
            <p className="border-2 border-outline bg-[#def3e5] px-4 py-3 text-xs leading-5 text-[#0d5f2e] font-bold">
              This console uses the production clone format: multipart/form-data with
              <code> sample</code>, <code> input</code>, <code> model</code>,
              <code> voice_consent=true</code>, and <code> output_format=mp3</code>.
            </p>
          </div>
        ) : null}

        {mode === "batch_clone" ? (
          <div className="flex flex-col gap-2">
            <label className="font-headline font-black uppercase text-xs text-primary" htmlFor="console-webhook-url">
              Webhook URL (optional)
            </label>
            <input
              id="console-webhook-url"
              type="url"
              value={webhookUrl}
              onChange={(event) => setWebhookUrl(event.target.value)}
              placeholder="https://your-app.example.com/tts-job-callback"
              className="w-full p-4 border-2 border-outline bg-surface text-[#1a1a1a] font-body text-sm placeholder:text-[#4a4a4a]/50 rounded-none focus:outline-none focus:bg-white"
            />
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={runTest}
            disabled={loading}
            className="px-6 py-3 bg-primary text-on-primary border-2 border-outline font-headline font-bold uppercase text-xs shadow-[4px_4px_0px_0px_rgba(26,26,26,1)] hover:bg-[#0055ff] disabled:opacity-60 transition-all active:translate-x-0.5 active:translate-y-0.5 active:shadow-none cursor-pointer"
          >
            {loading ? "Sending..." : `Send ${activeMode.label}`}
          </button>
          {status ? (
            <span className="font-headline font-bold uppercase text-xs border-2 border-outline bg-[#eee9e0] px-3 py-1 text-primary">
              {status}
            </span>
          ) : null}
        </div>

        {audioUrl ? (
          <div className="border-2 border-outline bg-[#faf7f2] p-4 shadow-[2px_2px_0px_0px_rgba(26,26,26,1)]">
            <audio controls src={audioUrl} className="w-full">
              <track kind="captions" />
            </audio>
          </div>
        ) : null}

        {responseText ? (
          <pre className="smooth-scroll-region max-h-[360px] overflow-auto border-4 border-outline bg-[#0d1512] p-4 font-mono text-xs leading-6 text-[#d7e6dd] text-left">
            {responseText}
          </pre>
        ) : null}
      </div>
    </section>
  );
}
