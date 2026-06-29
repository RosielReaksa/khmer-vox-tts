import assert from "node:assert/strict";
import test from "node:test";

import { normalizeText } from "./text-normalizer.ts";

test("normalizeText keeps pure English text unchanged", () => {
  const input = "hello world version 2.0";
  assert.equal(normalizeText(input), input);
});

test("normalizeText rewrites mixed Khmer text with risky Latin runs", () => {
  const input = "សួស្តី OpenAI version 2.0 API";
  const output = normalizeText(input);

  assert.match(output, /អូផិន/i);
  assert.match(output, /វើសិន/i);
  assert.match(output, /ពីរ/i);
  assert.match(output, /អេភីអាយ/i);
  assert.doesNotMatch(output, /\bOpenAI\b/);
  assert.doesNotMatch(output, /\bAPI\b/);
});

test("normalizeText rewrites uppercase acronyms in Khmer-dominant text", () => {
  const input = "តេស្ត TTS និង WAV";
  const output = normalizeText(input);

  assert.match(output, /ធីធីអេស/i);
  assert.match(output, /វ៉េវ/i);
});
