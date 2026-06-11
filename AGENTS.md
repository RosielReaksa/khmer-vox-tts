<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Project memory

Before changing code, read `PROJECT_MEMORY.md`. It records current product
rules, architecture, completed fixes, local-only work, deployment workflow, and
known operational issues. Treat it as orientation, then verify current source,
`git status`, and live state. Never copy secrets into the memory file.

After meaningful project changes, update `PROJECT_MEMORY.md` before finishing:
record what changed, what was tested, whether it was deployed, and what remains
local-only. Do not add secrets.
