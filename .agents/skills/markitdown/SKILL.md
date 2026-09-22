---
name: markitdown
description: How to extract readable text from documents the Read tool cannot open — PDFs, Word/Excel/PowerPoint, HTML, images of text, and other rich formats — using the `markitdown` CLI. Use whenever the user asks to read, summarize, quote, search, translate, or otherwise work with the *contents* of a .pdf, .docx, .doc, .xlsx, .xls, .pptx, .ppt, .html, .htm, .xml, .csv (large), .json (large), .epub, .zip (of documents), or any other binary/rich file. Also use when Read returns "binary file" or an unreadable/garbled result, or when the user says things like "what's in this PDF", "summarize this document", "extract the text from", "convert this to markdown", or "read this Word file". Even if they just paste a path to a document, route through markitdown.
---

# markitdown

`markitdown` is a CLI installed on this machine that converts many binary/rich file
formats to clean Markdown text. It is the right tool whenever you need the *contents*
of a document the Read tool cannot sensibly display (PDF, Office, HTML, etc.).

Prefer it over the Read tool for document *text extraction*. Use the Read tool only
for: source code, plain text/markdown/JSON/YAML, config files, and **images** (the
Read tool renders images visually — markitdown does not do vision).

## When to use

Use markitdown when the file is one of:

- `.pdf` — extracted as text + tables
- `.docx`, `.doc` — Word documents
- `.pptx`, `.ppt` — PowerPoint (slide-by-slide)
- `.xlsx`, `.xls` — Excel sheets
- `.html`, `.htm`, `.xml` — tags stripped to readable text
- `.epub` — e-books
- `.zip` — archives of documents (each entry is converted)
- Large `.csv` / `.json` / `.txt` where Read would blow the context budget
- Any file where Read returns a binary/garbled/unreadable result

Do **not** use markitdown for:

- Images (`.png`, `.jpg`, ...) — use the Read tool, which renders them visually.
- Plain source code / config / small text / markdown — Read is better, preserves
  formatting and line numbers.
- Reading entire directories — convert one file at a time.

## How to invoke

The `markitdown` executable is on PATH (v0.1.5). Syntax:

```text
markitdown <FILENAME>                  # prints markdown to stdout
markitdown <FILENAME> -o output.md     # writes to a file
markitdown <FILENAME> > output.md      # same via shell redirect
markitdown -x pdf < binary_blob        # reading from stdin (use -x for extension hint)
```

### Recommended pattern: convert then read

For any document the user wants to work with, convert it to a temp `.md` file next to
the original, then Read that file. This keeps the extracted text in context for
follow-up questions, quoting, translation, etc.

```bash
# quotes are needed because paths often contain spaces
markitdown "D:\some path\report.pdf" -o "D:\some path\report.md"
```

Then:

```
Read D:\some path\report.md
```

Pick the output path by changing the extension to `.md` (keep the same base name and
directory so it sits next to the source). If that `.md` already exists from a prior
run, markitdown overwrites it — that's fine.

### When to write to stdout instead

If the user just wants a quick summary or a single quoted passage and won't need the
full text again, pipe straight to stdout and read it from the command output without
writing a file:

```bash
markitdown "D:\some path\report.pdf"
```

Only do this for small documents; large PDFs can flood the context window. When in
doubt, write to a temp `.md` and Read it (which you can scroll/limit) rather than
dumping everything to stdout.

## Workflow

1. Confirm the path exists. Use a quick `dir`/`ls` if the user gave an ambiguous name.
2. Run `markitdown "<path>" -o "<same path with .md>"`.
3. Read the resulting `.md`.
4. Do whatever the user asked: summarize, quote, search, translate, answer questions,
   extract structured data, etc.
5. If the user doesn't want the temp `.md` left behind, offer to delete it (ask first —
   don't delete without confirmation).

## Edge cases

- **Read returned "binary file" or garbled bytes**: switch to markitdown. That's the
  main signal that a document needs conversion.
- **Scanned PDF / image-only PDF**: markitdown extracts no text (it does not OCR). Tell
  the user the PDF appears to be scanned images and OCR would be needed.
- **Garbage or empty output**: the document may be encrypted, corrupted, or in an
  unsupported sub-format. Report what you got and suggest alternatives.
- **Very large file**: convert to `.md` and use Read with `offset`/`limit` rather than
  reading the whole thing at once.
- **`.zip` of documents**: markitdown walks the archive and converts each entry. The
  output can be long — write to a file and page through it.

## Cleanup

The temp `.md` files this skill creates are yours to manage. If the user converts a
document just to read it once, mention the leftover `.md` and offer to remove it. Do
not silently delete files; confirm first. If the user is doing repeated work on a
document, keeping the `.md` around is a feature, not clutter.
