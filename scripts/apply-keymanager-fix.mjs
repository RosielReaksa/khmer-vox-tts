import { readFileSync, writeFileSync } from "node:fs";

const p = "D:\\website api seller\\app\\app\\dashboard\\key-manager.tsx";
let c = readFileSync(p, "utf8");

// Use the actual CRLF as the line separator everywhere
const NL = "\r\n";

// Change 1: Add sessionStorage helpers
const oldImportBlock = [
  `import { clearDashboardCache } from "@/app/app/dashboard/dashboard-data-cache";`,
  `import { Portal } from "@/app/components/portal";`,
  ``,
  `type ApiKeyItem = {`,
].join(NL);

const newImportBlock = [
  `import { clearDashboardCache } from "@/app/app/dashboard/dashboard-data-cache";`,
  `import { Portal } from "@/app/components/portal";`,
  ``,
  `// Persist the one-time raw API key across tab refreshes / accidental navigation.`,
  `// Using sessionStorage (cleared on tab close) so the secret does not linger`,
  `// across browser sessions. Storage failures are non-fatal.`,
  `const RAW_KEY_STORAGE_KEY = "voxtts:revealedRawKey";`,
  ``,
  `type RevealedKeySnapshot = {`,
  `  rawKey: string;`,
  `  expiresAt: number;`,
  `};`,
  ``,
  `function readRevealedKey(): RevealedKeySnapshot | null {`,
  `  try {`,
  `    if (typeof window === "undefined") return null;`,
  `    const raw = window.sessionStorage?.getItem(RAW_KEY_STORAGE_KEY);`,
  `    if (!raw) return null;`,
  `    const parsed = JSON.parse(raw) as RevealedKeySnapshot;`,
  `    if (`,
  `      !parsed ||`,
  `      typeof parsed.rawKey !== "string" ||`,
  `      typeof parsed.expiresAt !== "number" ||`,
  `      parsed.rawKey.length === 0 ||`,
  `      parsed.expiresAt <= Date.now()`,
  `    ) {`,
  `      window.sessionStorage?.removeItem(RAW_KEY_STORAGE_KEY);`,
  `      return null;`,
  `    }`,
  `    return parsed;`,
  `  } catch {`,
  `    return null;`,
  `  }`,
  `}`,
  ``,
  `function writeRevealedKey(snapshot: RevealedKeySnapshot) {`,
  `  try {`,
  `    window.sessionStorage?.setItem(RAW_KEY_STORAGE_KEY, JSON.stringify(snapshot));`,
  `  } catch {`,
  `    /* sessionStorage unavailable or quota: non-fatal */`,
  `  }`,
  `}`,
  ``,
  `function clearRevealedKey() {`,
  `  try {`,
  `    window.sessionStorage?.removeItem(RAW_KEY_STORAGE_KEY);`,
  `  } catch {`,
  `    /* non-fatal */`,
  `  }`,
  `}`,
  ``,
  `type ApiKeyItem = {`,
].join(NL);

if (!c.includes(oldImportBlock)) {
  console.error("ERROR: oldImportBlock not found");
  const idx = c.indexOf("import { clearDashboardCache");
  console.log("Context around import (char 65):");
  console.log(JSON.stringify(c.slice(idx, idx + 200)));
  process.exit(1);
}
c = c.replace(oldImportBlock, newImportBlock);
console.log("Change 1: added sessionStorage helpers");

// Change 2: Replace useState declarations
const oldStateBlock = [
  `  const [rawKey, setRawKey] = useState("");`,
  `  const [rawKeyExpiresAt, setRawKeyExpiresAt] = useState<number | null>(null);`,
].join(NL);

const newStateBlock = [
  `  // Restore the just-revealed key on mount if the user navigated away during`,
  `  // the 5-minute reveal window and came back. The lazy useState initializer reads`,
  `  // from sessionStorage on every mount, so any unmount/remount cycle (or tab`,
  `  // refresh) picks up the key reveal state without needing a useEffect.`,
  `  const [rawKey, setRawKey] = useState(() => {`,
  `    const persisted = readRevealedKey();`,
  `    return persisted?.rawKey ?? "";`,
  `  });`,
  `  const [rawKeyExpiresAt, setRawKeyExpiresAt] = useState<number | null>(() => {`,
  `    const persisted = readRevealedKey();`,
  `    return persisted?.expiresAt ?? null;`,
  `  });`,
].join(NL);

if (!c.includes(oldStateBlock)) {
  console.error("ERROR: oldStateBlock not found");
  process.exit(1);
}
c = c.replace(oldStateBlock, newStateBlock);
console.log("Change 2: replaced useState with lazy initializers");

// Change 3: Update countdown effect
const oldEffectBlock = [
  `  useEffect(() => {`,
  `    if (!rawKey || !rawKeyExpiresAt) {`,
  `      return;`,
  `    }`,
  `    const expiresAt = rawKeyExpiresAt;`,
  ``,
  `    const intervalId = window.setInterval(() => {`,
  `      const now = Date.now();`,
  `      setCountdownNow(now);`,
  `      if (now >= expiresAt) {`,
  `        setRawKey("");`,
  `        setRawKeyExpiresAt(null);`,
  `        setCountdownNow(0);`,
  `        setCopyStatus("");`,
  `        setMessage("API key hidden after 5 minutes. Create a new key if you did not copy it.");`,
  `        window.clearInterval(intervalId);`,
  `      }`,
  `    }, 1000);`,
  `    return () => window.clearInterval(intervalId);`,
  `  }, [rawKey, rawKeyExpiresAt]);`,
].join(NL);

const newEffectBlock = [
  `  useEffect(() => {`,
  `    if (!rawKey || !rawKeyExpiresAt) {`,
  `      return;`,
  `    }`,
  `    // Mirror the active reveal window to sessionStorage so a quick navigation`,
  `    // away + back (or a tab refresh) does not destroy the only copy of the key.`,
  `    writeRevealedKey({ rawKey, expiresAt: rawKeyExpiresAt });`,
  `    const expiresAt = rawKeyExpiresAt;`,
  ``,
  `    const intervalId = window.setInterval(() => {`,
  `      const now = Date.now();`,
  `      setCountdownNow(now);`,
  `      if (now >= expiresAt) {`,
  `        setRawKey("");`,
  `        setRawKeyExpiresAt(null);`,
  `        setCountdownNow(0);`,
  `        setCopyStatus("");`,
  `        setMessage("API key hidden after 5 minutes. Create a new key if you did not copy it.");`,
  `        window.clearInterval(intervalId);`,
  `        clearRevealedKey();`,
  `      }`,
  `    }, 1000);`,
  `    return () => window.clearInterval(intervalId);`,
  `  }, [rawKey, rawKeyExpiresAt]);`,
].join(NL);

if (!c.includes(oldEffectBlock)) {
  console.error("ERROR: oldEffectBlock not found");
  process.exit(1);
}
c = c.replace(oldEffectBlock, newEffectBlock);
console.log("Change 3: updated countdown effect");

writeFileSync(p, c);
console.log("Saved!");
