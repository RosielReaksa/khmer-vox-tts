import { readFileSync, writeFileSync } from "node:fs";

const p = "D:\\website api seller\\app\\app\\dashboard\\speech-workspace.tsx";
let c = readFileSync(p, "utf8");

// New effect to add after the fetchSavedVoices effect
const oldBlock = `  useEffect(() => {
    if (!isCloneMode) return;
    const timer = setTimeout(() => {
      void fetchSavedVoices();
    }, 0);
    return () => clearTimeout(timer);
  }, [isCloneMode]);

  // Pre-warm the Modal GPU on a cheap signal`;

const newBlock = `  useEffect(() => {
    if (!isCloneMode) return;
    const timer = setTimeout(() => {
      void fetchSavedVoices();
    }, 0);
    return () => clearTimeout(timer);
  }, [isCloneMode]);

  // Persist the clone reference sample so it survives navigation away from the
  // workspace. The previous behavior kept the File object only in module-level
  // state, which works for SPA navigation but breaks if SpeechWorkspace is
  // remounted from scratch (browser refresh, hard route change, or a quick
  // back/forward). localStorage with base64-encoded audio is small enough
  // for a typical 30s voice clip (~300KB opus/webm) and rehydrates on mount.
  // Only the clone workspace persists; TTS has no equivalent sample.
  const restoreTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!isCloneMode) return;
    // Defer to next tick so we do not race with the snapshot listener which
    // also pushes state on mount.
    restoreTimerRef.current = setTimeout(() => {
      const persisted = readCloneSample("clone");
      if (persisted && !sampleFile) {
        try {
          const bytes = Uint8Array.from(
            atob(persisted.base64),
            (c) => c.charCodeAt(0),
          );
          const file = new File([bytes], persisted.name, {
            type: persisted.type,
            lastModified: persisted.recordedAt,
          });
          setSampleFile(file);
        } catch {
          // Corrupted entry - clear it so we do not retry every mount.
          clearCloneSample("clone");
        }
      }
    }, 0);
    return () => {
      if (restoreTimerRef.current) {
        clearTimeout(restoreTimerRef.current);
        restoreTimerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCloneMode]);

  // Mirror sampleFile to localStorage whenever it changes. Async via FileReader
  // so the main thread is not blocked by base64 encoding. File objects cannot
  // be synchronously converted to base64 in the browser, hence the async path.
  useEffect(() => {
    if (!isCloneMode) return;
    if (!sampleFile) {
      clearCloneSample("clone");
      return;
    }
    let cancelled = false;
    const reader = new FileReader();
    reader.onload = () => {
      if (cancelled) return;
      const result = reader.result;
      if (typeof result !== "string") return;
      // result is "data:<mime>;base64,<base64>" - strip the prefix.
      const commaIdx = result.indexOf(",");
      const base64 = commaIdx >= 0 ? result.slice(commaIdx + 1) : result;
      persistCloneSample("clone", {
        name: sampleFile.name,
        type: sampleFile.type,
        base64,
        recordedAt: sampleFile.lastModified || Date.now(),
      });
    };
    reader.onerror = () => {
      // Non-fatal: user can simply re-record on next visit.
    };
    reader.readAsDataURL(sampleFile);
    return () => {
      cancelled = true;
      reader.abort();
    };
  }, [isCloneMode, sampleFile]);

  // Pre-warm the Modal GPU on a cheap signal`;

if (!c.includes(oldBlock)) {
  console.error("ERROR: target block not found");
  process.exit(1);
}
c = c.replace(oldBlock, newBlock);
writeFileSync(p, c);
console.log("Added clone sample persistence to speech-workspace.tsx");
