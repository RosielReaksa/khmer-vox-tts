import "server-only";

import { normalizeText } from "@/lib/text-normalizer";

const ZERO_WIDTH_AND_CONTROLS =
  /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/g;
const URL_PATTERN = /\b(?:https?:\/\/|www\.)\S+/gi;
const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const HTML_TAG_PATTERN = /<\/?[a-z][^>]*>/gi;
const CODE_BLOCK_PATTERN = /```[\s\S]*?```/g;
const INLINE_CODE_PATTERN = /`([^`]+)`/g;
const MARKDOWN_LINK_PATTERN = /\[([^\]]+)]\([^)]+\)/g;
const MARKDOWN_IMAGE_PATTERN = /!\[[^\]]*]\([^)]+\)/g;
const SOUND_CUE_LINE_PATTERN = /^\s*(?:sfx|sound effects?|music|bgm|ambience|scene|camera|cut to|transition|emotion|tone)\s*:\s*.*$/gim;
const GENERIC_STAGE_BLOCK_PATTERN = /(?:\[[^\]]{0,160}\]|\{[^}]{0,160}\}|<[^>]{0,160}>)/gu;
const BRACKETED_SOUND_CUE_PATTERN =
  /[\[({<][^[\]{}()<>]{0,100}\b(?:sfx|sound|music|bgm|ambience|laugh(?:s|ing)?|cry(?:ing)?|sob(?:bing)?|scream(?:ing)?|whisper(?:ing)?|breath(?:ing)?|applause|thunder|rain|wind|boom|bang|gunshot|silence|pause|dramatic|angry|sad)\b[^[\]{}()<>]{0,100}[\])}>]/giu;
const EMOJI_AND_PICTOGRAPHS = /[\p{Extended_Pictographic}\u{1f1e6}-\u{1f1ff}\u{20e3}\ufe0f]/gu;
const MARKDOWN_DECORATION = /[*_~^|\\]+/g;
const LONG_DASHES = /[\u2010-\u2015]+/g;
const UNSUPPORTED_SPEECH_SYMBOLS =
  /[^\p{L}\p{M}\p{N}\s.,!?;:'"\u2018\u2019\u201c\u201d\u00ab\u00bb\u17d4-\u17d6\u17d8-\u17da\u17dc\u3001\u3002\uff0c\uff01\uff1f\uff1a\uff1b-]/gu;

function collapseRepeatedPunctuation(text: string): string {
  return text
    .replace(/[.]{2,}/g, ".")
    .replace(/[,]{2,}/g, ",")
    .replace(/[!]{2,}/g, "!")
    .replace(/[?]{2,}/g, "?")
    .replace(/[;:]{2,}/g, ":")
    .replace(/([.,!?;:])(?:\s*\1)+/g, "$1");
}

function stripUnsupportedSpeechSymbols(text: string): string {
  return text
    .replace(ZERO_WIDTH_AND_CONTROLS, " ")
    .replace(CODE_BLOCK_PATTERN, " ")
    .replace(MARKDOWN_IMAGE_PATTERN, " ")
    .replace(MARKDOWN_LINK_PATTERN, "$1")
    .replace(INLINE_CODE_PATTERN, "$1")
    .replace(URL_PATTERN, " ")
    .replace(EMAIL_PATTERN, " ")
    .replace(HTML_TAG_PATTERN, " ")
    .replace(SOUND_CUE_LINE_PATTERN, " ")
    .replace(BRACKETED_SOUND_CUE_PATTERN, " ")
    .replace(GENERIC_STAGE_BLOCK_PATTERN, " ")
    .replace(EMOJI_AND_PICTOGRAPHS, " ")
    .replace(MARKDOWN_DECORATION, " ")
    .replace(LONG_DASHES, " ")
    .replace(UNSUPPORTED_SPEECH_SYMBOLS, " ");
}

export function sanitizeTextForSpeech(input: string): string {
  if (!input) return "";

  const cleaned = stripUnsupportedSpeechSymbols(input.normalize("NFKC"));
  return collapseRepeatedPunctuation(cleaned)
    .replace(/\s+([.,!?;:\u17d4-\u17d6\u17d8-\u17da])/gu, "$1")
    .replace(/([!?;:])(?=[^\s!?;:])/g, "$1 ")
    .replace(/([.,])(?=[\p{L}\p{M}])/gu, "$1 ")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function hasSpeakableText(input: string): boolean {
  return /[\p{L}\p{N}]/u.test(input);
}

export function prepareTextForSpeech(input: string): string {
  const normalized = normalizeText(input);
  const sanitized = sanitizeTextForSpeech(normalized);
  return hasSpeakableText(sanitized) ? sanitized : "";
}
