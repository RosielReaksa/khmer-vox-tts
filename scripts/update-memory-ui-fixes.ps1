$file = "D:\website api seller\PROJECT_MEMORY.md"
$content = Get-Content $file -Raw

$entry = @"


## Dashboard UX fixes: voice clone persistence + API key reveal (2026-06-27, deployed prod-20260627-31)

User reported two dashboard bugs:
1. Voice Cloning page: recording is lost when navigating away and coming back.
2. Business API Keys page: dialog auto-closes after creating a key, cannot copy.

Root causes:

1. Voice clone - SpeechWorkspace held the recorded File object only in module-level
   state (workspaceSnapshots). That works for SPA navigation in the same mount, but any
   remount (refresh, quick nav cycle, conditional render branch in DashboardSpa) drops
   the File. VoiceRecorder had no way to recover because it only knew about the in-memory
   existingFile prop.

2. API key - The rawKey state lived only in KeyManager React state. The 5-minute countdown
   timer used setRawKey("") on expiry and setRawKey("") at the start of createKey() (cleared
   before the API call). Any unmount or remount during the 5-minute window lost the key
   entirely. The polling (useCachedJson every 60s) and clearDashboardCache invalidation
   also caused re-renders that exposed the fragility.

Fix (no code changes to upstream or pipeline, pure UI persistence):

- app/app/dashboard/workspace-persistence.ts:
  - New helpers: cloneSampleStorageKey, persistCloneSample, readCloneSample,
    clearCloneSample. Stores {name, type, base64, recordedAt} in localStorage.
    ~300KB for a 30s opus/webm clip, well under the 5MB cap. Try/catch keeps quota
    and private-mode failures non-fatal.

- app/app/dashboard/speech-workspace.tsx:
  - On mount (clone mode only): restore sampleFile from localStorage via a lazy
    useState initializer on first read, with an effect for unmount/remount.
  - On sampleFile change: async FileReader.readAsDataURL plus strip prefix;
    persistCloneSample(...)
  - On sampleFile cleared: clearCloneSample(...)

- app/app/dashboard/key-manager.tsx:
  - Added RAW_KEY_STORAGE_KEY + readRevealedKey / writeRevealedKey / clearRevealedKey
    against sessionStorage (not localStorage so the secret clears on tab close).
  - rawKey and rawKeyExpiresAt now use a lazy initializer that reads from sessionStorage
    on mount. The countdown timer also calls clearRevealedKey on expiry.

Testing:

- 8 new tests added to workspace-persistence.test.ts for the clone sample helpers.
- All 19 tests pass (11 original plus 8 new). tsc clean. lint clean. build succeeded.

Deploy: prod-20260627-31 (commit fe3dbdb, GH Actions run 28286723754). Both web + worker
rolled out successfully.

Known limitations / future work:

- The VoiceRecorder audio playback URL is still created via URL.createObjectURL which
  is only valid for the current document lifetime. Adding a small effect in VoiceRecorder
  to re-create the object URL when existingFile changes without an internal audioUrl
  would polish this further. Not a blocker for the reported bug.
- sessionStorage size is generous (~5MB) but a very long clone sample (>5 minutes) could
  overflow. Adding a size guard in persistCloneSample is a small follow-up.
"@
$content = $content + $entry
[System.IO.File]::WriteAllText($file, $content, [System.Text.UTF8Encoding]::new($false))
Write-Host "Memory updated. Total length: $((Get-Item $file).Length) bytes"
