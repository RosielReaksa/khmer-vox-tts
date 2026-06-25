import "server-only";

import { getApiAccessStatus } from "@/lib/api-access";
import {
  calculateCreditsForSeconds,
  STANDARD_CLONE_CREDITS_PER_SECOND,
} from "@/lib/credit-rates";
import {
  addTokenTransaction,
  consumeUserTokens,
  createGenerationRecord,
  findUserById,
  findUserVoiceById,
  getUserTokenBalance,
  touchApiKeyLastUsed,
  updateGenerationRecord,
} from "@/lib/store";
import { buildAudioObjectKey, putAudioObject } from "@/lib/audio-storage";
import { invalidateDashboardCountCache } from "@/lib/dashboard-count-cache";
import { prepareTextForSpeech } from "@/lib/speech-text-sanitizer";
import {
  type CloneSample,
  synthesizeWithUpstream,
  TtsProviderError,
} from "@/lib/tts-provider";
import type { GenerationMode, GenerationSource } from "@/lib/types";
import { MAX_TEXT_CHARS } from "@/lib/usage-policy";
import {
  DEFAULT_CLONE_VOICE_INSTRUCTION,
  mapVoiceSafely,
  normalizeVoiceStyle,
  type VoiceStylePreset,
} from "@/lib/voice-defaults";

export class GenerationServiceError extends Error {
  status: number;
  code: string;
  remainingTokens?: number;

  constructor(
    message: string,
    status: number,
    code: string,
    remainingTokens?: number,
  ) {
    super(message);
    this.status = status;
    this.code = code;
    this.remainingTokens = remainingTokens;
  }
}

export function countChars(input: string): number {
  return Array.from(input).length;
}

export function estimateDurationSeconds(
  charCount: number,
  mode: GenerationMode,
): number {
  if (charCount <= 0) return 1;
  const charsPerSecond = mode === "clone" ? 13 : 20;
  return Math.max(1, Math.ceil(charCount / charsPerSecond));
}

export function buildInputPreview(input: string): string {
  const compact = input.replace(/\s+/g, " ").trim();
  if (compact.length <= 120) return compact;
  return `${compact.slice(0, 120)}...`;
}

export function calculateGenerationUsage(
  input: string,
  mode: GenerationMode,
  options?: { cloneCreditsPerSecond?: number },
): {
  charCount: number;
  estimatedSeconds: number;
  creditsRequested: number;
} {
  const charCount = countChars(prepareTextForSpeech(input));
  const estimatedSeconds = estimateDurationSeconds(charCount, mode);
  return {
    charCount,
    estimatedSeconds,
    creditsRequested: calculateCreditsForSeconds(
      estimatedSeconds,
      mode,
      options?.cloneCreditsPerSecond ?? STANDARD_CLONE_CREDITS_PER_SECOND,
    ),
  };
}

function calculateCreditsForOutputSeconds(
  outputSeconds: number,
  mode: GenerationMode,
  cloneCreditsPerSecond: number,
): number {
  return calculateCreditsForSeconds(outputSeconds, mode, cloneCreditsPerSecond);
}

function maxReasonableOutputSeconds(
  estimatedSeconds: number,
  mode: GenerationMode,
): number {
  const multiplier = mode === "clone" ? 4 : 3;
  return Math.max(30, estimatedSeconds * multiplier);
}

export async function resolveGenerationCloneCreditRate(
  userId: string,
  mode: GenerationMode,
  source: GenerationSource,
): Promise<number> {
  void source;
  if (mode !== "clone") {
    return STANDARD_CLONE_CREDITS_PER_SECOND;
  }
  const apiAccess = await getApiAccessStatus(userId);
  return apiAccess.cloneCreditsPerSecond;
}

export async function runGenerationForUser(params: {
  userId: string;
  apiKeyId?: string | null;
  source: GenerationSource;
  mode: GenerationMode;
  text: string;
  voice: string;
  model?: string;
  cloneSample?: CloneSample;
  cloneCreditsPerSecond?: number;
  segmentOfJobId?: string | null;
  denoiseReference?: boolean;
  voiceStyle?: VoiceStylePreset;
}): Promise<{
  generationId: string;
  audioBase64: string;
  audioObjectKey: string | null;
  audioObjectUrl: string | null;
  contentType: string;
  creditsRequested: number;
  creditsCharged: number;
  remainingTokens: number;
  outputSeconds: number;
  latencyMs: number;
  model: string;
  upstreamRequestId: string | null;
}> {
  const text = prepareTextForSpeech(params.text);
  let voice = params.voice.trim();
  let cloneSample = params.cloneSample;
  let synthesisMode = params.mode;

  const isPreset =
    params.mode === "tts" ||
    [
      "male",
      "female",
      "sokha",
      "piseth",
      "maly",
      "dara",
      "natural khmer speech",
    ].includes(voice.toLowerCase().trim());
  const isDefaultInstruction = voice === DEFAULT_CLONE_VOICE_INSTRUCTION;
  const isCustomVoice =
    !isPreset && !isDefaultInstruction && voice.length > 0 && !cloneSample;

  if (isCustomVoice) {
    const userVoice = await findUserVoiceById(params.userId, voice);
    if (!userVoice) {
      throw new GenerationServiceError(
        "Voice not found in library.",
        404,
        "VOICE_NOT_FOUND",
      );
    }
    const buffer = Buffer.from(userVoice.audioBase64, "base64");
    cloneSample = {
      bytes: new Uint8Array(buffer),
      mimeType: userVoice.mimeType,
      fileName: userVoice.fileName,
    };
    voice = userVoice.name; // Keep readable name for records
    synthesisMode = "clone";
  } else if (params.mode === "tts" || isPreset) {
    const selectedVoice = mapVoiceSafely(voice);
    voice = selectedVoice;
    const { getPresetVoiceBytes } = await import("@/lib/preset-voice-loader");
    const bytes = await getPresetVoiceBytes(selectedVoice);
    cloneSample = {
      bytes,
      mimeType: "audio/wav",
      fileName: `reference_${selectedVoice}.wav`,
    };
    synthesisMode = "clone";
  } else {
    const defaultVoice = DEFAULT_CLONE_VOICE_INSTRUCTION;
    voice = voice || defaultVoice;
  }

  const effectiveMode: GenerationMode = isPreset ? "tts" : "clone";

  const user = await findUserById(params.userId);

  if (!user) {
    throw new GenerationServiceError(
      "Account not found.",
      403,
      "ACCOUNT_NOT_FOUND",
    );
  }
  if (user.suspendedAt) {
    const remainingTokens = await getUserTokenBalance(params.userId);
    throw new GenerationServiceError(
      "Account is suspended.",
      403,
      "ACCOUNT_SUSPENDED",
      remainingTokens,
    );
  }

  if (!text) {
    throw new GenerationServiceError(
      "Text input is required.",
      400,
      "TEXT_REQUIRED",
    );
  }
  if (effectiveMode === "clone" && !cloneSample) {
    throw new GenerationServiceError(
      "Clone mode requires a voice sample.",
      400,
      "CLONE_SAMPLE_REQUIRED",
    );
  }

  const cloneCreditsPerSecond =
    params.cloneCreditsPerSecond ??
    (await resolveGenerationCloneCreditRate(
      params.userId,
      effectiveMode,
      params.source,
    ));
  const usage = calculateGenerationUsage(text, effectiveMode, {
    cloneCreditsPerSecond,
  });
  const charCount = usage.charCount;
  if (charCount > MAX_TEXT_CHARS) {
    throw new GenerationServiceError(
      `Text is too long. Max ${MAX_TEXT_CHARS.toLocaleString()} characters.`,
      400,
      "TEXT_TOO_LONG",
    );
  }

  const creditsRequested = usage.creditsRequested;

  const consumeResult = await consumeUserTokens(
    params.userId,
    creditsRequested,
    `Speech generation (${effectiveMode})`,
  );

  if (!consumeResult.ok) {
    await createGenerationRecord({
      userId: params.userId,
      apiKeyId: params.apiKeyId ?? null,
      mode: effectiveMode,
      source: params.source,
      status: "failed",
      model: params.model ?? process.env.TTS_UPSTREAM_MODEL ?? "voxcpm2",
      voice,
      inputChars: charCount,
      inputPreview: buildInputPreview(text),
      outputSeconds: 0,
      creditsRequested,
      creditsCharged: 0,
      latencyMs: 0,
      errorMessage: "Insufficient tokens",
      segmentOfJobId: params.segmentOfJobId ?? null,
    });
    await invalidateDashboardCountCache(params.userId, [
      "api",
      "billing",
      "history",
    ]);
    throw new GenerationServiceError(
      "Insufficient tokens for this request.",
      402,
      "INSUFFICIENT_TOKENS",
      consumeResult.remaining,
    );
  }

  const startedAtMs = Date.now();
  let chargedAmount = creditsRequested;
  let generationId: string | null = null;

  try {
    const processingGeneration = await createGenerationRecord({
      userId: params.userId,
      apiKeyId: params.apiKeyId ?? null,
      mode: effectiveMode,
      source: params.source,
      status: "processing",
      model: params.model ?? process.env.TTS_UPSTREAM_MODEL ?? "voxcpm2",
      voice,
      inputChars: charCount,
      inputPreview: buildInputPreview(text),
      outputSeconds: 0,
      creditsRequested,
      creditsCharged: 0,
      latencyMs: 0,
      errorMessage: null,
      audioBase64: null,
      contentType: null,
      segmentOfJobId: params.segmentOfJobId ?? null,
    });
    generationId = processingGeneration.id;

    const synthesized = await synthesizeWithUpstream({
      mode: synthesisMode,
      text,
      voice,
      model: params.model,
      cloneSample: cloneSample,
      denoiseReference: params.denoiseReference === true,
      voiceStyle: normalizeVoiceStyle(params.voiceStyle),
    });
    const latencyMs = Date.now() - startedAtMs;
    const outputSeconds = Math.max(
      1,
      Math.ceil(synthesized.outputSeconds ?? usage.estimatedSeconds),
    );
    const maxOutputSeconds = maxReasonableOutputSeconds(
      usage.estimatedSeconds,
      effectiveMode,
    );
    if (outputSeconds > maxOutputSeconds) {
      throw new GenerationServiceError(
        `Generated audio was too long (${outputSeconds}s) for this text. Try a cleaner voice sample or shorter text.`,
        502,
        "OUTPUT_DURATION_TOO_LONG",
      );
    }
    const creditsCharged = calculateCreditsForOutputSeconds(
      outputSeconds,
      effectiveMode,
      cloneCreditsPerSecond,
    );
    const audioBase64 = Buffer.from(synthesized.audioBytes).toString("base64");
    const storedAudio = await putAudioObject({
      key: buildAudioObjectKey({
        scope: "generation",
        userId: params.userId,
        id: generationId,
        fileName: `${generationId}.wav`,
      }),
      bytes: synthesized.audioBytes,
      contentType: synthesized.contentType,
    });

    // Defer partial refund until after all DB writes succeed.
    // Track the adjustment here, apply it after createGenerationRecord.
    let pendingRefund = 0;
    if (creditsCharged > creditsRequested) {
      const extraCredits = creditsCharged - creditsRequested;
      const extraConsumeResult = await consumeUserTokens(
        params.userId,
        extraCredits,
        `Additional generated audio duration (${effectiveMode})`,
      );
      if (!extraConsumeResult.ok) {
        throw new GenerationServiceError(
          "Insufficient tokens for the generated audio duration.",
          402,
          "INSUFFICIENT_TOKENS",
          extraConsumeResult.remaining,
        );
      }
      chargedAmount = creditsCharged;
    } else if (creditsCharged < creditsRequested) {
      // Do not lower chargedAmount yet. The initial deduction was creditsRequested,
      // so a later failure must refund that full amount.
      pendingRefund = creditsRequested - creditsCharged;
    }

    const generation = await updateGenerationRecord({
      generationId,
      userId: params.userId,
      status: "success",
      model: synthesized.model,
      outputSeconds,
      creditsCharged,
      latencyMs,
      errorMessage: null,
      audioBase64: storedAudio ? null : audioBase64,
      audioObjectKey: storedAudio?.key ?? null,
      audioObjectUrl: storedAudio?.url ?? null,
      contentType: synthesized.contentType,
    });
    if (!generation) {
      throw new GenerationServiceError(
        "Generation record could not be finalized.",
        500,
        "GENERATION_RECORD_MISSING",
      );
    }

    if (params.apiKeyId) {
      await touchApiKeyLastUsed(params.apiKeyId);
    }
    await invalidateDashboardCountCache(params.userId, [
      "api",
      "billing",
      "history",
    ]);

    // Now that all DB writes succeeded, apply the deferred partial refund.
    let remainingTokens = await getUserTokenBalance(params.userId);
    if (pendingRefund > 0) {
      try {
        await addTokenTransaction(
          params.userId,
          pendingRefund,
          "refund",
          `Refund unused estimated ${effectiveMode} credits`,
        );
        chargedAmount = creditsCharged;
        remainingTokens = await getUserTokenBalance(params.userId);
      } catch (refundError) {
        console.error(
          `[generation-service] Failed to apply partial refund of ${pendingRefund} tokens for user ${params.userId}`,
          refundError,
        );
      }
    }

    return {
      generationId: generation.id,
      audioBase64,
      audioObjectKey: storedAudio?.key ?? null,
      audioObjectUrl: storedAudio?.url ?? null,
      contentType: synthesized.contentType,
      creditsRequested,
      creditsCharged,
      remainingTokens,
      outputSeconds,
      latencyMs,
      model: synthesized.model,
      upstreamRequestId: synthesized.upstreamRequestId,
    };
  } catch (error) {
    // Wrap refund in try/catch so a DB failure doesn't mask the original error.
    try {
      await addTokenTransaction(
        params.userId,
        chargedAmount,
        "refund",
        `Refund for failed ${effectiveMode} generation`,
      );
    } catch (refundError) {
      console.error(
        `[generation-service] Failed to refund ${chargedAmount} tokens for user ${params.userId}`,
        refundError,
      );
    }

    const latencyMs = Date.now() - startedAtMs;
    const message =
      error instanceof Error && error.message.trim()
        ? error.message.slice(0, 260)
        : "Generation failed unexpectedly.";

    if (generationId) {
      await updateGenerationRecord({
        generationId,
        userId: params.userId,
        status: "failed",
        outputSeconds: 0,
        creditsCharged: 0,
        latencyMs,
        errorMessage: message,
        audioBase64: null,
        audioObjectKey: null,
        audioObjectUrl: null,
        contentType: null,
      });
    } else {
      await createGenerationRecord({
        userId: params.userId,
        apiKeyId: params.apiKeyId ?? null,
        mode: effectiveMode,
        source: params.source,
        status: "failed",
        model: params.model ?? process.env.TTS_UPSTREAM_MODEL ?? "voxcpm2",
        voice,
        inputChars: charCount,
        inputPreview: buildInputPreview(text),
        outputSeconds: 0,
        creditsRequested,
        creditsCharged: 0,
        latencyMs,
        errorMessage: message,
        segmentOfJobId: params.segmentOfJobId ?? null,
      });
    }

    if (params.apiKeyId) {
      await touchApiKeyLastUsed(params.apiKeyId);
    }
    await invalidateDashboardCountCache(params.userId, [
      "api",
      "billing",
      "history",
    ]);

    const remainingTokens = await getUserTokenBalance(params.userId);
    if (error instanceof TtsProviderError) {
      throw new GenerationServiceError(
        error.message,
        error.status,
        "UPSTREAM_ERROR",
        remainingTokens,
      );
    }
    if (error instanceof GenerationServiceError) {
      throw error;
    }
    throw new GenerationServiceError(
      "Generation failed.",
      502,
      "GENERATION_FAILED",
      remainingTokens,
    );
  }
}
