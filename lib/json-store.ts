import { createHash, randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import "server-only";

import type {
  AdminCustomerDetail,
  AdminCustomerSummary,
  ApiKeyRecord,
  BatchJobItemRecord,
  BatchJobRecord,
  BatchJobWebhookAttemptRecord,
  BatchJobWebhookDeliveryStatus,
  BusinessApiRequestRecord,
  BusinessSalesStage,
  BusinessApiRequestStatus,
  DataStore,
  GenerationMode,
  GenerationRecord,
  ApiErrorRecord,
  GenerationSource,
  GenerationStatus,
  PaymentOrderRecord,
  PaymentOrderStatus,
  PaymentSupportTicketRecord,
  PaymentSupportTicketStatus,
  PaymentWebhookEventRecord,
  PaymentWebhookEventStatus,
  PaymentWebhookProvider,
  PaymentPlanId,
  PaymentProvider,
  PasswordResetTokenRecord,
  TelegramPaymentActionRecord,
  TelegramPaymentEventDecision,
  TelegramPaymentEventRecord,
  TokenTransactionRecord,
  TokenTransactionType,
  UserRecord,
  UserVoiceRecord,
  WebhookTestDeliveryStatus,
  WebhookTestEventRecord,
  WebhookTestEventType,
  WorkerHeartbeatRecord,
  WorkerHeartbeatStatus,
} from "@/lib/types";
import { normalizeCloneCreditRate } from "@/lib/credit-rates";
import {
  DEFAULT_CLONE_VOICE_INSTRUCTION,
  DEFAULT_TTS_VOICE_PROMPT,
} from "@/lib/voice-defaults";

const STORE_PATH = path.join(/*turbopackIgnore: true*/ process.cwd(), "data", "store.json");

const EMPTY_STORE: DataStore = {
  schemaVersion: 21,
  users: [],
  passwordResetTokens: [],
  apiKeys: [],
  tokenTransactions: [],
  generations: [],
  batchJobs: [],
  batchJobItems: [],
  batchJobWebhookAttempts: [],
  paymentOrders: [],
  paymentWebhookEvents: [],
  telegramPaymentEvents: [],
  telegramPaymentActions: [],
  paymentSupportTickets: [],
  businessApiRequests: [],
  webhookTestEvents: [],
  workerHeartbeats: [],
  userVoices: [],
  apiErrors: [],
  systemSettings: [],
};

let mutationQueue: Promise<unknown> = Promise.resolve();
let cachedStore: DataStore | null = null;
let cachedStoreMtimeMs = -1;
let cachedStoreSize = -1;
let storeCacheVersion = 0;
let pendingStoreRead: Promise<DataStore> | null = null;

const STORE_LOCK_PATH = `${STORE_PATH}.lock`;
const STORE_LOCK_STALE_MS = 30_000;
const STORE_LOCK_MAX_WAIT_MS = 10_000;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function invalidateStoreReadCache(): void {
  cachedStore = null;
  cachedStoreMtimeMs = -1;
  cachedStoreSize = -1;
  pendingStoreRead = null;
  storeCacheVersion += 1;
}

function errorCode(error: unknown): string | null {
  if (!error || typeof error !== "object" || !("code" in error)) {
    return null;
  }
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : null;
}

function isRetryableStoreReplaceError(error: unknown): boolean {
  const code = errorCode(error);
  return code === "EPERM" || code === "EACCES" || code === "EBUSY";
}

async function acquireStoreWriteLock(): Promise<() => Promise<void>> {
  const startedAt = Date.now();
  let attempt = 0;

  while (Date.now() - startedAt < STORE_LOCK_MAX_WAIT_MS) {
    let lockHandle: Awaited<ReturnType<typeof fs.open>> | null = null;
    try {
      lockHandle = await fs.open(/*turbopackIgnore: true*/ STORE_LOCK_PATH, "wx");
      await lockHandle.writeFile(
        `${JSON.stringify({ pid: process.pid, createdAt: new Date().toISOString() })}\n`,
        "utf8",
      );

      let released = false;
      return async () => {
        if (released) return;
        released = true;
        await lockHandle?.close().catch(() => undefined);
        await fs.rm(/*turbopackIgnore: true*/ STORE_LOCK_PATH, { force: true }).catch(() => undefined);
      };
    } catch (error) {
      await lockHandle?.close().catch(() => undefined);
      if (errorCode(error) !== "EEXIST") {
        throw error;
      }

      try {
        const stat = await fs.stat(/*turbopackIgnore: true*/ STORE_LOCK_PATH);
        if (Date.now() - stat.mtimeMs > STORE_LOCK_STALE_MS) {
          await fs.rm(/*turbopackIgnore: true*/ STORE_LOCK_PATH, { force: true });
        }
      } catch (statError) {
        if (errorCode(statError) !== "ENOENT") {
          throw statError;
        }
      }

      await delay(Math.min(250, 25 + attempt * 10));
      attempt += 1;
    }
  }

  throw new Error("Timed out waiting for local JSON store write lock.");
}

function normalizeEmail(input: string): string {
  return input.trim().toLowerCase();
}

function sumTokenBalance(store: DataStore, userId: string): number {
  return store.tokenTransactions
    .filter((tx) => tx.userId === userId)
    .reduce((sum, tx) => sum + tx.amount, 0);
}

function toUtcDayStamp(input: string): string {
  return new Date(input).toISOString().slice(0, 10);
}

function toUtcMonthStamp(input: string): string {
  return new Date(input).toISOString().slice(0, 7);
}

async function ensureStoreFile(): Promise<void> {
  await fs.mkdir(path.dirname(/*turbopackIgnore: true*/ STORE_PATH), { recursive: true });
  try {
    await fs.access(/*turbopackIgnore: true*/ STORE_PATH);
  } catch {
    await fs.writeFile(/*turbopackIgnore: true*/ STORE_PATH, `${JSON.stringify(EMPTY_STORE, null, 2)}\n`, "utf8");
  }
}

async function readStore(): Promise<DataStore> {
  await ensureStoreFile();
  const initialStat = await fs.stat(/*turbopackIgnore: true*/ STORE_PATH);
  if (
    cachedStore &&
    cachedStoreMtimeMs === initialStat.mtimeMs &&
    cachedStoreSize === initialStat.size
  ) {
    return cachedStore;
  }

  if (pendingStoreRead) {
    return pendingStoreRead;
  }

  const cacheVersion = storeCacheVersion;
  pendingStoreRead = (async () => {
    // writeStore replaces the file atomically (temp + rename), but reads are not
    // lock-synchronized, so retry if another local process replaces the file.
    let raw = "";
    let lastError: unknown = null;
    const maxAttempts = 5;
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      raw = await fs.readFile(/*turbopackIgnore: true*/ STORE_PATH, "utf8");
      try {
        const parsedStore = normalizeStore(JSON.parse(raw) as Partial<DataStore>);
        if (cacheVersion === storeCacheVersion) {
          const finalStat = await fs.stat(/*turbopackIgnore: true*/ STORE_PATH);
          cachedStore = parsedStore;
          cachedStoreMtimeMs = finalStat.mtimeMs;
          cachedStoreSize = finalStat.size;
        }
        return parsedStore;
      } catch (error) {
        lastError = error;
        if (attempt < maxAttempts - 1) {
          await delay(Math.min(200, 30 + attempt * 40));
        }
      }
    }
    throw lastError ?? new Error("Failed to read local JSON store.");
  })();

  try {
    return await pendingStoreRead;
  } finally {
    pendingStoreRead = null;
  }
}

function normalizeStore(parsed: Partial<DataStore>): DataStore {
  return {
    schemaVersion: 21,
    users: (parsed.users ?? []).map((user) => ({
      ...user,
      suspendedAt: user.suspendedAt ?? null,
      suspendedReason: user.suspendedReason ?? null,
      suspendedByUserId: user.suspendedByUserId ?? null,
    })),
    passwordResetTokens: (parsed.passwordResetTokens ?? []).map((token) => ({
      ...token,
      usedAt: token.usedAt ?? null,
    })),
    apiKeys: (parsed.apiKeys ?? []).map((key) => ({
      ...key,
      dailyTokenLimit: key.dailyTokenLimit ?? null,
      monthlyTokenLimit: key.monthlyTokenLimit ?? null,
      maxConcurrentRequests: key.maxConcurrentRequests ?? null,
      maxConcurrentJobs: key.maxConcurrentJobs ?? null,
      maxQueuedJobs: key.maxQueuedJobs ?? null,
      lastUsedAt: key.lastUsedAt ?? null,
      revokedAt: key.revokedAt ?? null,
    })),
    tokenTransactions: parsed.tokenTransactions ?? [],
    generations: (parsed.generations ?? []).map((generation) => ({
      ...generation,
      audioBase64: generation.audioBase64 ?? null,
      audioObjectKey: generation.audioObjectKey ?? null,
      audioObjectUrl: generation.audioObjectUrl ?? null,
      contentType: generation.contentType ?? null,
      hasAudio: Boolean(generation.audioBase64 || generation.audioObjectKey),
    })),
    batchJobs: (parsed.batchJobs ?? []).map((job) => ({
      ...job,
      apiKeyId: job.apiKeyId ?? null,
      errorMessage: job.errorMessage ?? null,
      cloneSampleBase64: job.cloneSampleBase64 ?? null,
      cloneSampleMimeType: job.cloneSampleMimeType ?? null,
      cloneSampleFileName: job.cloneSampleFileName ?? null,
      cloneConsentAt: job.cloneConsentAt ?? null,
      cloneConsentText: job.cloneConsentText ?? null,
      externalId: job.externalId ?? null,
      metadataJson: job.metadataJson ?? null,
      webhookCallbackUrl: job.webhookCallbackUrl ?? null,
      webhookStatus: job.webhookStatus ?? null,
      webhookAttempts: job.webhookAttempts ?? 0,
      webhookLastError: job.webhookLastError ?? null,
      webhookLastAttemptAt: job.webhookLastAttemptAt ?? null,
      workerAttemptCount: job.workerAttemptCount ?? 0,
      lastWorkerId: job.lastWorkerId ?? null,
      workerHeartbeatAt: job.workerHeartbeatAt ?? null,
      nextRetryAt: job.nextRetryAt ?? null,
      deadLetterReason: job.deadLetterReason ?? null,
      lastWorkerError: job.lastWorkerError ?? null,
      startedAt: job.startedAt ?? null,
      completedAt: job.completedAt ?? null,
    })),
    batchJobItems: (parsed.batchJobItems ?? []).map((item) => ({
      ...item,
      generationId: item.generationId ?? null,
      audioBase64: item.audioBase64 ?? null,
      audioObjectKey: item.audioObjectKey ?? null,
      audioObjectUrl: item.audioObjectUrl ?? null,
      contentType: item.contentType ?? null,
      externalId: item.externalId ?? null,
      speaker: item.speaker ?? null,
      startMs: item.startMs ?? null,
      endMs: item.endMs ?? null,
      metadataJson: item.metadataJson ?? null,
      attemptCount: item.attemptCount ?? 0,
      lastAttemptAt: item.lastAttemptAt ?? null,
      nextRetryAt: item.nextRetryAt ?? null,
      errorMessage: item.errorMessage ?? null,
    })),
    batchJobWebhookAttempts: (parsed.batchJobWebhookAttempts ?? []).map((attempt) => ({
      ...attempt,
      httpStatus: attempt.httpStatus ?? null,
      responsePreview: attempt.responsePreview ?? null,
      errorMessage: attempt.errorMessage ?? null,
      latencyMs: Math.max(0, Math.round(attempt.latencyMs ?? 0)),
    })),
    paymentOrders: (parsed.paymentOrders ?? []).map((order) => ({
      ...order,
      paymentReference: order.paymentReference ?? null,
      proofImageDataUrl: order.proofImageDataUrl ?? null,
      khqrPayload: order.khqrPayload ?? null,
      khqrMd5: order.khqrMd5 ?? null,
      khqrImageDataUrl: order.khqrImageDataUrl ?? null,
      khqrCurrency: order.khqrCurrency ?? null,
      khqrAmount: order.khqrAmount ?? null,
      khqrExpiresAt: order.khqrExpiresAt ?? null,
      paymentProvider: order.paymentProvider ?? null,
      providerTransactionId: order.providerTransactionId ?? null,
      providerReference: order.providerReference ?? null,
      providerApprovalCode: order.providerApprovalCode ?? null,
      providerStatusCode: order.providerStatusCode ?? null,
      providerStatus: order.providerStatus ?? null,
      providerAmount: order.providerAmount ?? null,
      providerCurrency: order.providerCurrency ?? null,
      providerPayload: order.providerPayload ?? null,
      paidAt: order.paidAt ?? null,
      expiredAt: order.expiredAt ?? null,
    })),
    paymentWebhookEvents: (parsed.paymentWebhookEvents ?? []).map((event) => ({
      ...event,
      orderId: event.orderId ?? null,
      paymentOrderId: event.paymentOrderId ?? event.orderId ?? null,
      reason: event.reason ?? null,
      providerTransactionId: event.providerTransactionId ?? null,
      providerReference: event.providerReference ?? null,
      providerApprovalCode: event.providerApprovalCode ?? null,
      providerStatusCode: event.providerStatusCode ?? null,
      providerStatus: event.providerStatus ?? null,
      providerAmount: event.providerAmount ?? null,
      providerCurrency: event.providerCurrency ?? null,
      providerPayload: event.providerPayload ?? null,
      rawBody: event.rawBody ?? null,
    })),
    telegramPaymentEvents: (parsed.telegramPaymentEvents ?? []).map((event) => ({
      ...event,
      telegramUpdateId: event.telegramUpdateId ?? null,
      telegramMessageId: event.telegramMessageId ?? null,
      chatId: event.chatId ?? null,
      chatTitle: event.chatTitle ?? null,
      senderId: event.senderId ?? null,
      senderUsername: event.senderUsername ?? null,
      senderName: event.senderName ?? null,
      senderIsBot: event.senderIsBot ?? false,
      rawText: event.rawText ?? null,
      parsedStatus: event.parsedStatus ?? null,
      parsedAmount: event.parsedAmount ?? null,
      parsedCurrency: event.parsedCurrency ?? null,
      parsedTransactionId: event.parsedTransactionId ?? null,
      parsedReference: event.parsedReference ?? null,
      matchedOrderId: event.matchedOrderId ?? null,
      decisionReason: event.decisionReason ?? null,
      autoApproveAttempted: event.autoApproveAttempted ?? false,
    })),
    telegramPaymentActions: (parsed.telegramPaymentActions ?? []).map((action) => ({
      ...action,
      orderId: action.orderId ?? null,
      reason: action.reason ?? null,
      telegramUserId: action.telegramUserId ?? null,
      telegramUsername: action.telegramUsername ?? null,
      telegramFirstName: action.telegramFirstName ?? null,
      telegramLastName: action.telegramLastName ?? null,
      callbackQueryId: action.callbackQueryId ?? null,
      messageChatId: action.messageChatId ?? null,
      messageId: action.messageId ?? null,
    })),
    paymentSupportTickets: (parsed.paymentSupportTickets ?? []).map((ticket) => ({
      ...ticket,
      adminNote: ticket.adminNote ?? null,
      resolvedByUserId: ticket.resolvedByUserId ?? null,
      resolvedAt: ticket.resolvedAt ?? null,
    })),
    businessApiRequests: (parsed.businessApiRequests ?? []).map((request) => ({
      ...request,
      webhookUrl: request.webhookUrl ?? null,
      contactTelegram: request.contactTelegram ?? null,
      salesStage: request.salesStage ?? "new",
      salesNote: request.salesNote ?? null,
      followUpAt: request.followUpAt ?? null,
      lastContactedAt: request.lastContactedAt ?? null,
      adminNote: request.adminNote ?? null,
      appliedDailyTokenLimit: request.appliedDailyTokenLimit ?? null,
      appliedMonthlyTokenLimit: request.appliedMonthlyTokenLimit ?? null,
      appliedMaxConcurrentRequests: request.appliedMaxConcurrentRequests ?? null,
      appliedMaxConcurrentJobs: request.appliedMaxConcurrentJobs ?? null,
      appliedMaxQueuedJobs: request.appliedMaxQueuedJobs ?? null,
      appliedCloneCreditRate: request.appliedCloneCreditRate ?? null,
      reviewedByUserId: request.reviewedByUserId ?? null,
      reviewedAt: request.reviewedAt ?? null,
    })),
    webhookTestEvents: (parsed.webhookTestEvents ?? []).map((event) => ({
      ...event,
      httpStatus: event.httpStatus ?? null,
      responsePreview: event.responsePreview ?? null,
      errorMessage: event.errorMessage ?? null,
      latencyMs: event.latencyMs ?? 0,
    })),
    workerHeartbeats: (parsed.workerHeartbeats ?? []).map((heartbeat) => ({
      ...heartbeat,
      currentJobId: heartbeat.currentJobId ?? null,
      processedJobId: heartbeat.processedJobId ?? null,
      processedItemCount: Math.max(0, Math.round(heartbeat.processedItemCount ?? 0)),
      queueDepth: Math.max(0, Math.round(heartbeat.queueDepth ?? 0)),
      runningJobs: Math.max(0, Math.round(heartbeat.runningJobs ?? 0)),
      stuckJobs: Math.max(0, Math.round(heartbeat.stuckJobs ?? 0)),
      needsReviewJobs: Math.max(0, Math.round(heartbeat.needsReviewJobs ?? 0)),
      upstreamLatencyMs: heartbeat.upstreamLatencyMs ?? null,
      upstreamOk: heartbeat.upstreamOk ?? null,
      lastError: heartbeat.lastError ?? null,
    })),
    userVoices: parsed.userVoices ?? [],
    apiErrors: parsed.apiErrors ?? [],
    systemSettings: parsed.systemSettings ?? [],
  };
}

async function writeStore(store: DataStore): Promise<void> {
  const tempPath = `${STORE_PATH}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await fs.writeFile(/*turbopackIgnore: true*/ tempPath, `${JSON.stringify(store)}\n`, "utf8");
    const maxAttempts = process.platform === "win32" ? 40 : 1;
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      try {
        await fs.rename(/*turbopackIgnore: true*/ tempPath, /*turbopackIgnore: true*/ STORE_PATH);
        const stat = await fs.stat(/*turbopackIgnore: true*/ STORE_PATH);
        storeCacheVersion += 1;
        cachedStore = store;
        cachedStoreMtimeMs = stat.mtimeMs;
        cachedStoreSize = stat.size;
        return;
      } catch (error) {
        if (!isRetryableStoreReplaceError(error) || attempt === maxAttempts - 1) {
          throw error;
        }
        await delay(Math.min(500, 25 + attempt * 25));
      }
    }
  } catch (error) {
    invalidateStoreReadCache();
    await fs.rm(/*turbopackIgnore: true*/ tempPath, { force: true }).catch(() => undefined);
    throw error;
  }
}

async function updateStore<T>(mutator: (store: DataStore) => T | Promise<T>): Promise<T> {
  const run = mutationQueue.then(async () => {
    const releaseLock = await acquireStoreWriteLock();
    try {
      // A local dev server can coexist with smoke scripts or older Next worker
      // processes. Always reload after taking the lock so a write never starts
      // from a stale cached snapshot and drops another process's changes.
      invalidateStoreReadCache();
      const store = await readStore();
      const result = await mutator(store);
      await writeStore(store);
      return result;
    } finally {
      await releaseLock();
    }
  });

  mutationQueue = run.then(
    () => undefined,
    () => undefined,
  );

  return run;
}

function isExpiredPendingOrder(order: PaymentOrderRecord, now = new Date()): boolean {
  if (order.status !== "pending" || !order.khqrExpiresAt) return false;
  const expiresAt = new Date(order.khqrExpiresAt);
  return !Number.isNaN(expiresAt.getTime()) && expiresAt.getTime() <= now.getTime();
}

function markOrderExpired(order: PaymentOrderRecord, now = new Date()): void {
  const timestamp = now.toISOString();
  order.status = "expired";
  order.expiredAt = timestamp;
  order.updatedAt = timestamp;
  order.adminNote ??= "KHQR expired before payment confirmation.";
}

function expirePendingOrders(store: DataStore, now = new Date()): void {
  for (const order of store.paymentOrders) {
    if (isExpiredPendingOrder(order, now)) {
      markOrderExpired(order, now);
    }
  }
}

export async function findUserByEmail(email: string): Promise<UserRecord | null> {
  const normalized = normalizeEmail(email);
  const store = await readStore();
  return store.users.find((user) => user.email === normalized) ?? null;
}

export async function findUserById(userId: string): Promise<UserRecord | null> {
  const store = await readStore();
  return store.users.find((user) => user.id === userId) ?? null;
}

export async function createPasswordResetToken(input: {
  userId: string;
  tokenHash: string;
  expiresAt: string;
}): Promise<PasswordResetTokenRecord> {
  return updateStore((store) => {
    const now = new Date().toISOString();
    store.passwordResetTokens = store.passwordResetTokens.filter(
      (token) => token.userId !== input.userId,
    );

    const token: PasswordResetTokenRecord = {
      id: randomUUID(),
      userId: input.userId,
      tokenHash: input.tokenHash,
      expiresAt: input.expiresAt,
      usedAt: null,
      createdAt: now,
    };
    store.passwordResetTokens.push(token);
    return token;
  });
}

export async function deletePasswordResetToken(tokenHash: string): Promise<void> {
  await updateStore((store) => {
    store.passwordResetTokens = store.passwordResetTokens.filter(
      (token) => token.tokenHash !== tokenHash,
    );
  });
}

export async function consumePasswordResetToken(
  tokenHash: string,
  passwordHash: string,
): Promise<boolean> {
  return updateStore((store) => {
    const now = new Date();
    const token = store.passwordResetTokens.find(
      (candidate) =>
        candidate.tokenHash === tokenHash &&
        candidate.usedAt === null &&
        new Date(candidate.expiresAt).getTime() > now.getTime(),
    );
    if (!token) return false;

    const user = store.users.find((candidate) => candidate.id === token.userId);
    if (!user) return false;

    const timestamp = now.toISOString();
    user.passwordHash = passwordHash;
    user.updatedAt = timestamp;
    for (const candidate of store.passwordResetTokens) {
      if (candidate.userId === user.id && candidate.usedAt === null) {
        candidate.usedAt = timestamp;
      }
    }
    return true;
  });
}

export async function createUserWithSignupBonus(email: string, passwordHash: string): Promise<UserRecord> {
  const normalized = normalizeEmail(email);
  return updateStore((store) => {
    const existing = store.users.find((user) => user.email === normalized);
    if (existing) {
      throw new Error("EMAIL_EXISTS");
    }

    const now = new Date().toISOString();
    const user: UserRecord = {
      id: randomUUID(),
      email: normalized,
      passwordHash,
      googleId: null,
      displayName: null,
      avatarUrl: null,
      suspendedAt: null,
      suspendedReason: null,
      suspendedByUserId: null,
      createdAt: now,
      updatedAt: now,
    };
    store.users.push(user);

    const signupBonus: TokenTransactionRecord = {
      id: randomUUID(),
      userId: user.id,
      amount: 100,
      type: "signup_bonus",
      note: "Free signup tokens",
      createdAt: now,
    };
    store.tokenTransactions.push(signupBonus);

    return user;
  });
}

export async function findUserByGoogleId(googleId: string): Promise<UserRecord | null> {
  const store = await readStore();
  return store.users.find((user) => user.googleId === googleId) ?? null;
}

export async function linkGoogleAccount(input: {
  userId: string;
  googleId: string;
  displayName?: string | null;
  avatarUrl?: string | null;
}): Promise<UserRecord | null> {
  return updateStore((store) => {
    const conflict = store.users.find(
      (user) => user.googleId === input.googleId && user.id !== input.userId,
    );
    if (conflict) {
      throw new Error("GOOGLE_ID_LINKED");
    }
    const user = store.users.find((u) => u.id === input.userId);
    if (!user) return null;
    user.googleId = input.googleId;
    user.displayName = user.displayName ?? input.displayName ?? null;
    user.avatarUrl = input.avatarUrl ?? user.avatarUrl ?? null;
    user.updatedAt = new Date().toISOString();
    return user;
  });
}

export async function createGoogleUserWithSignupBonus(input: {
  email: string;
  googleId: string;
  displayName?: string | null;
  avatarUrl?: string | null;
}): Promise<UserRecord> {
  const normalized = normalizeEmail(input.email);
  return updateStore((store) => {
    const existing = store.users.find((user) => user.email === normalized);
    if (existing) {
      throw new Error("EMAIL_EXISTS");
    }

    const now = new Date().toISOString();
    const user: UserRecord = {
      id: randomUUID(),
      email: normalized,
      passwordHash: null,
      googleId: input.googleId,
      displayName: input.displayName ?? null,
      avatarUrl: input.avatarUrl ?? null,
      suspendedAt: null,
      suspendedReason: null,
      suspendedByUserId: null,
      createdAt: now,
      updatedAt: now,
    };
    store.users.push(user);

    const signupBonus: TokenTransactionRecord = {
      id: randomUUID(),
      userId: user.id,
      amount: 100,
      type: "signup_bonus",
      note: "Free signup tokens",
      createdAt: now,
    };
    store.tokenTransactions.push(signupBonus);

    return user;
  });
}

export async function getUserTokenBalance(userId: string): Promise<number> {
  const store = await readStore();
  return sumTokenBalance(store, userId);
}

export async function getUserTotalCreditsEarned(userId: string): Promise<number> {
  const store = await readStore();
  return store.tokenTransactions
    .filter((tx) => tx.userId === userId && tx.amount > 0)
    .reduce((sum, tx) => sum + tx.amount, 0);
}

export async function addTokenTransaction(
  userId: string,
  amount: number,
  type: TokenTransactionType,
  note: string | null,
): Promise<TokenTransactionRecord> {
  return updateStore((store) => {
    const now = new Date().toISOString();
    const tx: TokenTransactionRecord = {
      id: randomUUID(),
      userId,
      amount,
      type,
      note,
      createdAt: now,
    };
    store.tokenTransactions.push(tx);
    return tx;
  });
}

export async function consumeUserTokens(
  userId: string,
  amount: number,
  note: string | null,
): Promise<{ ok: boolean; remaining: number }> {
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: true, remaining: await getUserTokenBalance(userId) };
  }

  return updateStore((store) => {
    const currentBalance = sumTokenBalance(store, userId);
    if (currentBalance < amount) {
      return { ok: false, remaining: currentBalance };
    }

    const tx: TokenTransactionRecord = {
      id: randomUUID(),
      userId,
      amount: -amount,
      type: "usage",
      note,
      createdAt: new Date().toISOString(),
    };
    store.tokenTransactions.push(tx);
    return { ok: true, remaining: currentBalance - amount };
  });
}

export async function listUserApiKeys(userId: string): Promise<ApiKeyRecord[]> {
  const store = await readStore();
  return store.apiKeys
    .filter((key) => key.userId === userId)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export async function createApiKey(
  userId: string,
  name: string,
  keyPrefix: string,
  keyHash: string,
  options?: {
    dailyTokenLimit?: number | null;
    monthlyTokenLimit?: number | null;
    maxConcurrentRequests?: number | null;
    maxConcurrentJobs?: number | null;
    maxQueuedJobs?: number | null;
  },
): Promise<ApiKeyRecord> {
  return updateStore((store) => {
    const now = new Date().toISOString();
    const key: ApiKeyRecord = {
      id: randomUUID(),
      userId,
      name,
      keyPrefix,
      keyHash,
      dailyTokenLimit: normalizeOptionalLimit(options?.dailyTokenLimit),
      monthlyTokenLimit: normalizeOptionalLimit(options?.monthlyTokenLimit),
      maxConcurrentRequests: normalizeOptionalLimit(options?.maxConcurrentRequests),
      maxConcurrentJobs: normalizeOptionalLimit(options?.maxConcurrentJobs),
      maxQueuedJobs: normalizeOptionalLimit(options?.maxQueuedJobs),
      createdAt: now,
      lastUsedAt: null,
      revokedAt: null,
    };
    store.apiKeys.push(key);
    return key;
  });
}

function normalizeOptionalLimit(value: number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  if (!Number.isFinite(value)) return null;
  const normalized = Math.round(value);
  return normalized > 0 ? normalized : null;
}

function envPositiveInt(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function defaultMaxConcurrentJobs(): number {
  return envPositiveInt("API_KEY_DEFAULT_MAX_CONCURRENT_JOBS", 2);
}

function effectiveMaxConcurrentJobs(key: ApiKeyRecord | undefined): number {
  return key?.maxConcurrentJobs ?? defaultMaxConcurrentJobs();
}

function apiKeyCanClaimJob(store: DataStore, apiKeyId: string | null): boolean {
  if (!apiKeyId) return true;
  const key = store.apiKeys.find((item) => item.id === apiKeyId);
  const runningJobs = store.batchJobs.filter(
    (job) => job.apiKeyId === apiKeyId && job.status === "running",
  ).length;
  return runningJobs < effectiveMaxConcurrentJobs(key);
}

export async function updateApiKeyLimits(
  userId: string,
  keyId: string,
  limits: {
    dailyTokenLimit?: number | null;
    monthlyTokenLimit?: number | null;
    maxConcurrentRequests?: number | null;
    maxConcurrentJobs?: number | null;
    maxQueuedJobs?: number | null;
  },
): Promise<ApiKeyRecord | null> {
  return updateStore((store) => {
    const key = store.apiKeys.find((item) => item.id === keyId && item.userId === userId);
    if (!key) return null;
    if ("dailyTokenLimit" in limits) key.dailyTokenLimit = normalizeOptionalLimit(limits.dailyTokenLimit);
    if ("monthlyTokenLimit" in limits) key.monthlyTokenLimit = normalizeOptionalLimit(limits.monthlyTokenLimit);
    if ("maxConcurrentRequests" in limits) {
      key.maxConcurrentRequests = normalizeOptionalLimit(limits.maxConcurrentRequests);
    }
    if ("maxConcurrentJobs" in limits) key.maxConcurrentJobs = normalizeOptionalLimit(limits.maxConcurrentJobs);
    if ("maxQueuedJobs" in limits) key.maxQueuedJobs = normalizeOptionalLimit(limits.maxQueuedJobs);
    return key;
  });
}

export async function getApiKeyTokenUsage(
  apiKeyId: string,
  period: "day" | "month",
): Promise<number> {
  const store = await readStore();
  const now = new Date();
  const stamp = period === "day" ? now.toISOString().slice(0, 10) : now.toISOString().slice(0, 7);
  return store.generations
    .filter((item) => item.apiKeyId === apiKeyId && item.status === "success")
    .filter((item) => (period === "day" ? toUtcDayStamp(item.createdAt) : toUtcMonthStamp(item.createdAt)) === stamp)
    .reduce((sum, item) => sum + item.creditsCharged, 0);
}

export async function getApiKeyBatchJobCounts(apiKeyId: string): Promise<{
  queued: number;
  running: number;
}> {
  const store = await readStore();
  return store.batchJobs.reduce(
    (counts, job) => {
      if (job.apiKeyId !== apiKeyId) return counts;
      if (job.status === "queued") counts.queued += 1;
      if (job.status === "running") counts.running += 1;
      return counts;
    },
    { queued: 0, running: 0 },
  );
}

export async function findActiveApiKeyByRawKey(rawKey: string): Promise<ApiKeyRecord | null> {
  const keyHash = createHash("sha256").update(rawKey).digest("hex");
  const store = await readStore();
  const key = store.apiKeys.find((item) => item.keyHash === keyHash && !item.revokedAt);
  return key ?? null;
}

export async function touchApiKeyLastUsed(keyId: string): Promise<void> {
  await updateStore((store) => {
    const key = store.apiKeys.find((item) => item.id === keyId);
    if (!key) return;
    key.lastUsedAt = new Date().toISOString();
  });
}

export async function revokeApiKey(userId: string, keyId: string): Promise<boolean> {
  return updateStore((store) => {
    const key = store.apiKeys.find((item) => item.id === keyId && item.userId === userId);
    if (!key || key.revokedAt) {
      return false;
    }
    key.revokedAt = new Date().toISOString();
    return true;
  });
}

export async function createGenerationRecord(
  input: Omit<GenerationRecord, "id" | "createdAt"> & { createdAt?: string; id?: string },
): Promise<GenerationRecord> {
  return updateStore((store) => {
    if (input.id) {
      const existing = store.generations.find((item) => item.id === input.id);
      if (existing) {
        Object.assign(existing, {
          ...input,
          id: existing.id,
          createdAt: existing.createdAt,
          audioBase64: input.audioBase64 ?? null,
          audioObjectKey: input.audioObjectKey ?? null,
          audioObjectUrl: input.audioObjectUrl ?? null,
          contentType: input.contentType ?? null,
          hasAudio: Boolean(input.audioBase64 || input.audioObjectKey),
        });
        return existing;
      }
    }
    const record: GenerationRecord = {
      id: input.id ?? randomUUID(),
      createdAt: input.createdAt ?? new Date().toISOString(),
      ...input,
      audioBase64: input.audioBase64 ?? null,
      audioObjectKey: input.audioObjectKey ?? null,
      audioObjectUrl: input.audioObjectUrl ?? null,
      contentType: input.contentType ?? null,
      hasAudio: Boolean(input.audioBase64 || input.audioObjectKey),
    };
    store.generations.push(record);
    return record;
  });
}

export async function updateGenerationRecord(input: {
  generationId: string;
  userId: string;
  status: GenerationStatus;
  model?: string;
  outputSeconds?: number;
  creditsCharged?: number;
  latencyMs?: number;
  errorMessage?: string | null;
  audioBase64?: string | null;
  audioObjectKey?: string | null;
  audioObjectUrl?: string | null;
  contentType?: string | null;
}): Promise<GenerationRecord | null> {
  return updateStore((store) => {
    const record = store.generations.find(
      (item) => item.id === input.generationId && item.userId === input.userId,
    );
    if (!record) return null;

    record.status = input.status;
    if (input.model !== undefined) record.model = input.model;
    if (input.outputSeconds !== undefined) record.outputSeconds = input.outputSeconds;
    if (input.creditsCharged !== undefined) record.creditsCharged = input.creditsCharged;
    if (input.latencyMs !== undefined) record.latencyMs = input.latencyMs;
    if (input.errorMessage !== undefined) record.errorMessage = input.errorMessage;
    if (input.audioBase64 !== undefined) record.audioBase64 = input.audioBase64;
    if (input.audioObjectKey !== undefined) record.audioObjectKey = input.audioObjectKey;
    if (input.audioObjectUrl !== undefined) record.audioObjectUrl = input.audioObjectUrl;
    if (input.contentType !== undefined) record.contentType = input.contentType;
    record.hasAudio = Boolean(record.audioBase64 || record.audioObjectKey);

    return record;
  });
}

export async function listUserGenerations(
  userId: string,
  options?: {
    limit?: number;
    source?: GenerationSource | "all";
    mode?: GenerationMode | "all";
    search?: string;
    offset?: number;
  },
): Promise<GenerationRecord[]> {
  const limit = Math.max(1, Math.min(options?.limit ?? 100, 1000));
  const source = options?.source ?? "all";
  const mode = options?.mode ?? "all";
  const search = (options?.search ?? "").toLowerCase().trim();
  const offset = Math.max(0, options?.offset ?? 0);
  const store = await readStore();

  let items = store.generations
    .filter((item) => item.userId === userId)
    .filter((item) => (source === "all" ? true : item.source === source))
    .filter((item) => (mode === "all" ? true : item.mode === mode));

  if (search) {
    items = items.filter((item) =>
      `${item.inputPreview} ${item.errorMessage ?? ""} ${item.mode} ${item.status} ${item.source}`
        .toLowerCase()
        .includes(search),
    );
  }

  return items
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .slice(offset, offset + limit);
}

export async function getUserGenerationRecord(
  userId: string,
  generationId: string,
): Promise<GenerationRecord | null> {
  const store = await readStore();
  return store.generations.find((item) => item.userId === userId && item.id === generationId) ?? null;
}

export async function countUserGenerations(
  userId: string,
  options?: {
    source?: GenerationSource | "all";
    mode?: GenerationMode | "all";
    search?: string;
  },
): Promise<number> {
  const source = options?.source ?? "all";
  const mode = options?.mode ?? "all";
  const search = (options?.search ?? "").toLowerCase().trim();
  const store = await readStore();

  let items = store.generations
    .filter((item) => item.userId === userId)
    .filter((item) => (source === "all" ? true : item.source === source))
    .filter((item) => (mode === "all" ? true : item.mode === mode));

  if (search) {
    items = items.filter((item) =>
      `${item.inputPreview} ${item.errorMessage ?? ""} ${item.mode} ${item.status} ${item.source}`
        .toLowerCase()
        .includes(search),
    );
  }

  return items.length;
}

export async function getGenerationStats(
  userId: string,
  mode: GenerationMode | "all" = "all",
): Promise<{
  totalGenerations: number;
  totalDurationSec: number;
  avgDurationSec: number;
  thisMonthGenerations: number;
}> {
  const store = await readStore();
  const now = new Date();
  const currentMonth = now.toISOString().slice(0, 7);

  const successful = store.generations
    .filter((item) => item.userId === userId && item.status === "success")
    .filter((item) => (mode === "all" ? true : item.mode === mode));

  const totalGenerations = successful.length;
  const totalDurationSec = successful.reduce((sum, item) => sum + item.outputSeconds, 0);
  const avgDurationSec = totalGenerations === 0 ? 0 : Math.round(totalDurationSec / totalGenerations);
  const thisMonthGenerations = successful.filter(
    (item) => toUtcMonthStamp(item.createdAt) === currentMonth,
  ).length;

  return {
    totalGenerations,
    totalDurationSec,
    avgDurationSec,
    thisMonthGenerations,
  };
}

export async function getApiUsageStats(userId: string): Promise<{
  requestsToday: number;
  requestsThisMonth: number;
  successRatePercent: number;
  last30DaysRequests: number;
}> {
  const store = await readStore();
  const now = new Date();
  const todayStamp = now.toISOString().slice(0, 10);
  const thisMonthStamp = now.toISOString().slice(0, 7);
  const threshold = new Date(now.getTime() - 29 * 24 * 60 * 60 * 1000);
  const thresholdStamp = threshold.toISOString().slice(0, 10);

  const apiRequests = store.generations.filter(
    (item) => item.userId === userId && item.source === "api_key",
  );
  const requestsToday = apiRequests.filter((item) => toUtcDayStamp(item.createdAt) === todayStamp).length;
  const requestsThisMonth = apiRequests.filter(
    (item) => toUtcMonthStamp(item.createdAt) === thisMonthStamp,
  ).length;
  const last30Days = apiRequests.filter((item) => toUtcDayStamp(item.createdAt) >= thresholdStamp);
  const successCount = apiRequests.filter((item) => item.status === "success").length;
  const successRatePercent =
    apiRequests.length === 0 ? 100 : Math.round((successCount / apiRequests.length) * 100);

  return {
    requestsToday,
    requestsThisMonth,
    successRatePercent,
    last30DaysRequests: last30Days.length,
  };
}

function batchInputPreview(input: string): string {
  const compact = input.replace(/\s+/g, " ").trim();
  return compact.length <= 120 ? compact : `${compact.slice(0, 120)}...`;
}

function batchItemMaxAttempts(): number {
  const configured = Number(process.env.BATCH_ITEM_MAX_ATTEMPTS);
  return Number.isInteger(configured) && configured > 0 ? configured : 3;
}

function retryReadyAt(input: string | null, now = new Date()): boolean {
  if (!input) return true;
  const parsed = new Date(input);
  return Number.isNaN(parsed.getTime()) || parsed.getTime() <= now.getTime();
}

function canClaimQueuedJob(job: BatchJobRecord, now = new Date()): boolean {
  return job.status === "queued" && retryReadyAt(job.nextRetryAt, now);
}

function retryableFailedItems(items: BatchJobItemRecord[], maxAttempts = batchItemMaxAttempts()): BatchJobItemRecord[] {
  return items.filter((item) => item.status === "failed" && item.attemptCount < maxAttempts);
}

function rollupBatchJob(store: DataStore, jobId: string): BatchJobRecord | null {
  const job = store.batchJobs.find((item) => item.id === jobId);
  if (!job) return null;

  const items = store.batchJobItems.filter((item) => item.jobId === jobId);
  const completedItems = items.filter((item) => item.status === "success").length;
  const failedItems = items.filter((item) => item.status === "failed").length;
  const queuedItems = items.filter((item) => item.status === "queued");
  const runningItems = items.filter((item) => item.status === "running");
  const terminalItems = completedItems + failedItems;
  const now = new Date().toISOString();

  job.completedItems = completedItems;
  job.failedItems = failedItems;
  job.creditsCharged = items.reduce((sum, item) => sum + item.creditsCharged, 0);
  job.outputSeconds = items.reduce((sum, item) => sum + item.outputSeconds, 0);
  job.updatedAt = now;

  if (terminalItems >= job.totalItems) {
    const retryableItems = retryableFailedItems(items);
    if (retryableItems.length > 0) {
      job.status = "queued";
      job.nextRetryAt = retryableItems
        .map((item) => item.nextRetryAt)
        .filter((value): value is string => Boolean(value))
        .sort()[0] ?? now;
      job.completedAt = null;
      job.errorMessage = `Waiting to retry ${retryableItems.length.toLocaleString()} failed item(s).`;
      return job;
    }

    job.status = failedItems === 0 ? "completed" : completedItems > 0 ? "partial" : "needs_review";
    job.nextRetryAt = null;
    job.completedAt ??= now;
    if (job.status === "completed") {
      job.errorMessage = null;
      job.deadLetterReason = null;
      job.lastWorkerError = null;
    } else if (job.status === "partial" || job.status === "needs_review") {
      job.deadLetterReason ??= completedItems > 0
        ? "Some batch items exhausted their retry limit."
        : "All batch items exhausted their retry limit.";
      job.errorMessage ??= job.deadLetterReason;
    }
  } else if (queuedItems.length > 0 && runningItems.length === 0) {
    const retryableItems = retryableFailedItems(items);
    job.status = "queued";
    job.completedAt = null;
    job.nextRetryAt = [...queuedItems, ...retryableItems]
      .map((item) => item.nextRetryAt)
      .filter((value): value is string => Boolean(value))
      .sort()[0] ?? job.nextRetryAt ?? now;
    if (failedItems > 0) {
      job.errorMessage = `Waiting to retry ${queuedItems.length.toLocaleString()} queued item(s).`;
    }
  } else if (runningItems.length > 0) {
    job.status = "running";
    job.completedAt = null;
    job.nextRetryAt = null;
  }

  return job;
}

export async function createBatchJob(input: {
  userId: string;
  apiKeyId?: string | null;
  mode: GenerationMode;
  source: GenerationSource;
  title: string;
  voice: string;
  model: string;
  externalId?: string | null;
  metadataJson?: string | null;
  lines: Array<{
    text: string;
    creditsEstimated: number;
    externalId?: string | null;
    speaker?: string | null;
    startMs?: number | null;
    endMs?: number | null;
    metadataJson?: string | null;
  }>;
  cloneSampleBase64?: string | null;
  cloneSampleMimeType?: string | null;
  cloneSampleFileName?: string | null;
  cloneConsentAt?: string | null;
  cloneConsentText?: string | null;
  webhookCallbackUrl?: string | null;
}): Promise<{ job: BatchJobRecord; items: BatchJobItemRecord[] }> {
  return updateStore((store) => {
    const now = new Date().toISOString();
    const jobId = randomUUID();
    const lines = input.lines.map((line) => ({
      text: line.text.trim(),
      creditsEstimated: Math.max(1, Math.round(line.creditsEstimated)),
      externalId: line.externalId ?? null,
      speaker: line.speaker ?? null,
      startMs: line.startMs ?? null,
      endMs: line.endMs ?? null,
      metadataJson: line.metadataJson ?? null,
    }));
    const job: BatchJobRecord = {
      id: jobId,
      userId: input.userId,
      apiKeyId: input.apiKeyId ?? null,
      mode: input.mode,
      source: input.source,
      status: "queued",
      title: input.title.trim() || "Batch job",
      voice: input.voice.trim() || (input.mode === "clone" ? DEFAULT_CLONE_VOICE_INSTRUCTION : DEFAULT_TTS_VOICE_PROMPT),
      model: input.model.trim() || "voxcpm2",
      externalId: input.externalId ?? null,
      metadataJson: input.metadataJson ?? null,
      totalItems: lines.length,
      completedItems: 0,
      failedItems: 0,
      totalInputChars: lines.reduce((sum, line) => sum + Array.from(line.text).length, 0),
      creditsEstimated: lines.reduce((sum, line) => sum + line.creditsEstimated, 0),
      creditsCharged: 0,
      outputSeconds: 0,
      errorMessage: null,
      cloneSampleBase64: input.cloneSampleBase64 ?? null,
      cloneSampleMimeType: input.cloneSampleMimeType ?? null,
      cloneSampleFileName: input.cloneSampleFileName ?? null,
      cloneConsentAt: input.cloneConsentAt ?? null,
      cloneConsentText: input.cloneConsentText ?? null,
      webhookCallbackUrl: input.webhookCallbackUrl ?? null,
      webhookStatus: input.webhookCallbackUrl ? "pending" : null,
      webhookAttempts: 0,
      webhookLastError: null,
      webhookLastAttemptAt: null,
      workerAttemptCount: 0,
      lastWorkerId: null,
      workerHeartbeatAt: null,
      nextRetryAt: null,
      deadLetterReason: null,
      lastWorkerError: null,
      createdAt: now,
      updatedAt: now,
      startedAt: null,
      completedAt: null,
    };
    const items: BatchJobItemRecord[] = lines.map((line, index) => ({
      id: randomUUID(),
      jobId,
      userId: input.userId,
      itemIndex: index,
      text: line.text,
      inputPreview: batchInputPreview(line.text),
      voice: job.voice,
      model: job.model,
      externalId: line.externalId,
      speaker: line.speaker,
      startMs: line.startMs,
      endMs: line.endMs,
      metadataJson: line.metadataJson,
      status: "queued",
      generationId: null,
      audioBase64: null,
      audioObjectKey: null,
      audioObjectUrl: null,
      contentType: null,
      outputSeconds: 0,
      creditsEstimated: line.creditsEstimated,
      creditsCharged: 0,
      latencyMs: 0,
      attemptCount: 0,
      lastAttemptAt: null,
      nextRetryAt: null,
      errorMessage: null,
      createdAt: now,
      updatedAt: now,
    }));

    store.batchJobs.push(job);
    store.batchJobItems.push(...items);
    return { job, items };
  });
}

export async function listUserBatchJobs(
  userId: string,
  options?: { limit?: number },
): Promise<BatchJobRecord[]> {
  const limit = Math.max(1, Math.min(options?.limit ?? 50, 200));
  const store = await readStore();
  return store.batchJobs
    .filter((job) => job.userId === userId)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .slice(0, limit);
}

export async function getUserBatchJobWithItems(
  userId: string,
  jobId: string,
): Promise<{ job: BatchJobRecord; items: BatchJobItemRecord[] } | null> {
  const store = await readStore();
  const job = store.batchJobs.find((item) => item.id === jobId && item.userId === userId);
  if (!job) return null;
  const items = store.batchJobItems
    .filter((item) => item.jobId === jobId && item.userId === userId)
    .sort((a, b) => a.itemIndex - b.itemIndex);
  return { job, items };
}

export async function getBatchJobWithItems(
  jobId: string,
): Promise<{ job: BatchJobRecord; items: BatchJobItemRecord[] } | null> {
  const store = await readStore();
  const job = store.batchJobs.find((item) => item.id === jobId);
  if (!job) return null;
  const items = store.batchJobItems
    .filter((item) => item.jobId === jobId)
    .sort((a, b) => a.itemIndex - b.itemIndex);
  return { job, items };
}

export async function claimNextQueuedBatchJob(workerId?: string | null): Promise<BatchJobRecord | null> {
  return updateStore((store) => {
    const nowDate = new Date();
    const claimableJob = store.batchJobs
      .filter((item) => canClaimQueuedJob(item, nowDate) && apiKeyCanClaimJob(store, item.apiKeyId))
      .sort((a, b) => (a.createdAt > b.createdAt ? 1 : -1))[0];
    if (!claimableJob) return null;
    const now = nowDate.toISOString();
    claimableJob.status = "running";
    claimableJob.startedAt ??= now;
    claimableJob.updatedAt = now;
    claimableJob.workerHeartbeatAt = now;
    claimableJob.lastWorkerId = workerId?.trim() || null;
    claimableJob.workerAttemptCount = (claimableJob.workerAttemptCount ?? 0) + 1;
    claimableJob.nextRetryAt = null;
    claimableJob.errorMessage = null;
    return claimableJob;
  });
}

export async function claimQueuedBatchJob(jobId: string, workerId?: string | null): Promise<BatchJobRecord | null> {
  return updateStore((store) => {
    const nowDate = new Date();
    const job = store.batchJobs.find((item) => item.id === jobId && canClaimQueuedJob(item, nowDate));
    if (!job || !apiKeyCanClaimJob(store, job.apiKeyId)) return null;
    const now = nowDate.toISOString();
    job.status = "running";
    job.startedAt ??= now;
    job.updatedAt = now;
    job.workerHeartbeatAt = now;
    job.lastWorkerId = workerId?.trim() || null;
    job.workerAttemptCount = (job.workerAttemptCount ?? 0) + 1;
    job.nextRetryAt = null;
    job.errorMessage = null;
    return job;
  });
}

export async function claimQueuedBatchJobItem(itemId: string): Promise<BatchJobItemRecord | null> {
  return updateStore((store) => {
    const item = store.batchJobItems.find((candidate) => candidate.id === itemId);
    if (!item || item.status !== "queued" || !retryReadyAt(item.nextRetryAt)) return null;
    const now = new Date().toISOString();
    item.status = "running";
    item.updatedAt = now;
    item.attemptCount = (item.attemptCount ?? 0) + 1;
    item.lastAttemptAt = now;
    item.nextRetryAt = null;
    item.errorMessage = null;
    return item;
  });
}

export async function updateBatchJobStatus(input: {
  jobId: string;
  status: BatchJobRecord["status"];
  errorMessage?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  workerHeartbeatAt?: string | null;
  nextRetryAt?: string | null;
  deadLetterReason?: string | null;
  lastWorkerError?: string | null;
}): Promise<BatchJobRecord | null> {
  return updateStore((store) => {
    const job = store.batchJobs.find((item) => item.id === input.jobId);
    if (!job) return null;
    const now = new Date().toISOString();
    job.status = input.status;
    job.updatedAt = now;
    if ("errorMessage" in input) job.errorMessage = input.errorMessage ?? null;
    if ("startedAt" in input) job.startedAt = input.startedAt ?? null;
    if ("completedAt" in input) job.completedAt = input.completedAt ?? null;
    if ("workerHeartbeatAt" in input) job.workerHeartbeatAt = input.workerHeartbeatAt ?? null;
    if ("nextRetryAt" in input) job.nextRetryAt = input.nextRetryAt ?? null;
    if ("deadLetterReason" in input) job.deadLetterReason = input.deadLetterReason ?? null;
    if ("lastWorkerError" in input) job.lastWorkerError = input.lastWorkerError ?? null;
    return job;
  });
}

export async function updateBatchJobItem(input: {
  itemId: string;
  status: BatchJobItemRecord["status"];
  generationId?: string | null;
  audioBase64?: string | null;
  audioObjectKey?: string | null;
  audioObjectUrl?: string | null;
  contentType?: string | null;
  outputSeconds?: number;
  creditsCharged?: number;
  latencyMs?: number;
  attemptCount?: number;
  nextRetryAt?: string | null;
  lastAttemptAt?: string | null;
  errorMessage?: string | null;
}): Promise<BatchJobItemRecord | null> {
  return updateStore((store) => {
    const item = store.batchJobItems.find((candidate) => candidate.id === input.itemId);
    if (!item) return null;
    item.status = input.status;
    item.updatedAt = new Date().toISOString();
    if ("generationId" in input) item.generationId = input.generationId ?? null;
    if ("audioBase64" in input) item.audioBase64 = input.audioBase64 ?? null;
    if ("audioObjectKey" in input) item.audioObjectKey = input.audioObjectKey ?? null;
    if ("audioObjectUrl" in input) item.audioObjectUrl = input.audioObjectUrl ?? null;
    if ("contentType" in input) item.contentType = input.contentType ?? null;
    if ("outputSeconds" in input) item.outputSeconds = Math.max(0, Math.round(input.outputSeconds ?? 0));
    if ("creditsCharged" in input) item.creditsCharged = Math.max(0, Math.round(input.creditsCharged ?? 0));
    if ("latencyMs" in input) item.latencyMs = Math.max(0, Math.round(input.latencyMs ?? 0));
    if ("attemptCount" in input) item.attemptCount = Math.max(0, Math.round(input.attemptCount ?? 0));
    if ("nextRetryAt" in input) item.nextRetryAt = input.nextRetryAt ?? null;
    if ("lastAttemptAt" in input) item.lastAttemptAt = input.lastAttemptAt ?? null;
    if ("errorMessage" in input) item.errorMessage = input.errorMessage ?? null;
    return item;
  });
}

export async function resetRetryableBatchJobItems(jobId: string, maxItemAttempts: number): Promise<number> {
  return updateStore((store) => {
    const now = new Date().toISOString();
    let resetCount = 0;
    for (const item of store.batchJobItems) {
      if (item.jobId !== jobId || item.status !== "failed") continue;
      if ((item.attemptCount ?? 0) >= maxItemAttempts) continue;
      if (item.nextRetryAt && new Date(item.nextRetryAt).getTime() > Date.now()) continue;

      item.status = "queued";
      item.errorMessage = null;
      item.nextRetryAt = null;
      item.updatedAt = now;
      resetCount += 1;
    }
    return resetCount;
  });
}

export async function refreshBatchJobRollup(jobId: string): Promise<BatchJobRecord | null> {
  return updateStore((store) => rollupBatchJob(store, jobId));
}

export async function updateBatchJobWebhookStatus(input: {
  jobId: string;
  webhookStatus: BatchJobRecord["webhookStatus"];
  webhookLastError: string | null;
  webhookLastAttemptAt: string;
  incrementAttempts: boolean;
}): Promise<BatchJobRecord | null> {
  return updateStore((store) => {
    const job = store.batchJobs.find((item) => item.id === input.jobId);
    if (!job) return null;
    job.webhookStatus = input.webhookStatus;
    job.webhookLastError = input.webhookLastError;
    job.webhookLastAttemptAt = input.webhookLastAttemptAt;
    if (input.incrementAttempts) {
      job.webhookAttempts = (job.webhookAttempts ?? 0) + 1;
    }
    job.updatedAt = new Date().toISOString();
    return job;
  });
}

export async function createBatchJobWebhookAttempt(input: {
  jobId: string;
  userId: string;
  webhookUrl: string;
  eventType: string;
  deliveryStatus: BatchJobWebhookDeliveryStatus;
  httpStatus: number | null;
  responsePreview: string | null;
  errorMessage: string | null;
  latencyMs: number;
}): Promise<BatchJobWebhookAttemptRecord> {
  return updateStore((store) => {
    const attempt: BatchJobWebhookAttemptRecord = {
      id: randomUUID(),
      jobId: input.jobId,
      userId: input.userId,
      webhookUrl: input.webhookUrl,
      eventType: input.eventType,
      deliveryStatus: input.deliveryStatus,
      httpStatus: input.httpStatus,
      responsePreview: input.responsePreview,
      errorMessage: input.errorMessage,
      latencyMs: Math.max(0, Math.round(input.latencyMs)),
      createdAt: new Date().toISOString(),
    };
    store.batchJobWebhookAttempts.push(attempt);
    return attempt;
  });
}

export async function listBatchJobWebhookAttempts(
  jobId: string,
  options?: { limit?: number },
): Promise<BatchJobWebhookAttemptRecord[]> {
  const limit = Math.max(1, Math.min(options?.limit ?? 20, 100));
  const store = await readStore();
  return store.batchJobWebhookAttempts
    .filter((attempt) => attempt.jobId === jobId)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .slice(0, limit);
}

export async function clearBatchJobCloneSample(jobId: string): Promise<BatchJobRecord | null> {
  return updateStore((store) => {
    const job = store.batchJobs.find((item) => item.id === jobId);
    if (!job) return null;
    job.cloneSampleBase64 = null;
    job.cloneSampleMimeType = null;
    job.cloneSampleFileName = null;
    job.updatedAt = new Date().toISOString();
    return job;
  });
}

export async function retryBatchJob(jobId: string): Promise<BatchJobRecord | null> {
  return updateStore((store) => {
    const job = store.batchJobs.find((item) => item.id === jobId);
    if (!job || (job.status !== "failed" && job.status !== "partial" && job.status !== "needs_review")) return null;
    const now = new Date().toISOString();
    let resetCount = 0;
    for (const item of store.batchJobItems) {
      if (item.jobId !== jobId || item.status !== "failed") continue;
      item.status = "queued";
      item.errorMessage = null;
      item.latencyMs = 0;
      item.attemptCount = 0;
      item.lastAttemptAt = null;
      item.nextRetryAt = null;
      item.updatedAt = now;
      resetCount += 1;
    }
    if (resetCount === 0) return null;
    job.status = "queued";
    job.failedItems = 0;
    job.errorMessage = null;
    job.completedAt = null;
    job.nextRetryAt = null;
    job.deadLetterReason = null;
    job.lastWorkerError = null;
    job.workerAttemptCount = 0;
    job.updatedAt = now;
    return rollupBatchJob(store, jobId);
  });
}

export type StuckBatchRecoveryResult = {
  recoveredJobs: number;
  movedToReviewJobs: number;
  resetItems: number;
  failedItems: number;
  recoveredJobIds: string[];
  reviewJobIds: string[];
};

export async function recoverStuckBatchJobs(input: {
  timeoutMs: number;
  maxRecoveries: number;
  maxItemAttempts: number;
}): Promise<StuckBatchRecoveryResult> {
  return updateStore((store) => {
    const nowDate = new Date();
    const now = nowDate.toISOString();
    const result: StuckBatchRecoveryResult = {
      recoveredJobs: 0,
      movedToReviewJobs: 0,
      resetItems: 0,
      failedItems: 0,
      recoveredJobIds: [],
      reviewJobIds: [],
    };

    for (const job of store.batchJobs) {
      if (job.status !== "running") continue;
      const lastActivity = new Date(job.workerHeartbeatAt ?? job.updatedAt ?? job.startedAt ?? job.createdAt);
      if (!Number.isNaN(lastActivity.getTime()) && nowDate.getTime() - lastActivity.getTime() < input.timeoutMs) {
        continue;
      }

      const items = store.batchJobItems.filter((item) => item.jobId === job.id);
      const shouldReview = (job.workerAttemptCount ?? 0) >= input.maxRecoveries;
      if (shouldReview) {
        for (const item of items) {
          if (item.status !== "queued" && item.status !== "running") continue;
          item.status = "failed";
          item.errorMessage = "Worker became stuck too many times. Admin review required.";
          item.nextRetryAt = null;
          item.attemptCount = Math.max(item.attemptCount ?? 0, input.maxItemAttempts);
          item.updatedAt = now;
          result.failedItems += 1;
        }
        job.status = "needs_review";
        job.completedAt = now;
        job.nextRetryAt = null;
        job.deadLetterReason = "Worker became stuck too many times.";
        job.lastWorkerError = job.deadLetterReason;
        job.errorMessage = job.deadLetterReason;
        job.updatedAt = now;
        result.movedToReviewJobs += 1;
        result.reviewJobIds.push(job.id);
        rollupBatchJob(store, job.id);
        continue;
      }

      for (const item of items) {
        if (item.status !== "running") continue;
        if ((item.attemptCount ?? 0) >= input.maxItemAttempts) {
          item.status = "failed";
          item.errorMessage = "Worker became stuck while processing this item and retry limit was reached.";
          item.nextRetryAt = null;
          item.attemptCount = Math.max(item.attemptCount ?? 0, input.maxItemAttempts);
          result.failedItems += 1;
        } else {
          item.status = "queued";
          item.errorMessage = "Recovered from a stuck worker and queued for retry.";
          item.nextRetryAt = now;
          result.resetItems += 1;
        }
        item.updatedAt = now;
      }

      job.status = "queued";
      job.nextRetryAt = now;
      job.workerHeartbeatAt = now;
      job.lastWorkerError = "Recovered from stuck running state.";
      job.errorMessage = job.lastWorkerError;
      job.completedAt = null;
      job.updatedAt = now;
      result.recoveredJobs += 1;
      result.recoveredJobIds.push(job.id);
      rollupBatchJob(store, job.id);
    }

    return result;
  });
}

export async function purgeQueuedBatchJobs(adminUserId: string, reason: string): Promise<number> {
  return updateStore((store) => {
    const now = new Date().toISOString();
    const activeJobs = store.batchJobs.filter((job) => job.status === "queued" || job.status === "running");
    if (activeJobs.length === 0) return 0;

    const jobIds = new Set(activeJobs.map((j) => j.id));

    for (const item of store.batchJobItems) {
      if (jobIds.has(item.jobId) && (item.status === "queued" || item.status === "running")) {
        item.status = "failed";
        item.errorMessage = reason;
        item.attemptCount = Math.max(item.attemptCount ?? 0, 3);
        item.nextRetryAt = null;
        item.updatedAt = now;
      }
    }

    for (const job of activeJobs) {
      job.status = "failed";
      job.completedAt = now;
      job.nextRetryAt = null;
      job.lastWorkerError = reason;
      job.errorMessage = reason;
      job.updatedAt = now;
      rollupBatchJob(store, job.id);
    }

    return activeJobs.length;
  });
}

export type AudioStorageCleanupResult = {
  cutoffAt: string;
  retentionDays: number;
  dryRun: boolean;
  limit: number;
  batchItemsCleared: number;
  generationsCleared: number;
  cloneSamplesCleared: number;
  estimatedBytesReleased: number;
};

function base64StorageBytes(value: string | null | undefined): number {
  if (!value) return 0;
  return Math.max(0, Math.floor((value.length * 3) / 4));
}

function olderThanCutoff(value: string | null | undefined, cutoffMs: number): boolean {
  if (!value) return false;
  const time = new Date(value).getTime();
  return Number.isFinite(time) && time < cutoffMs;
}

export async function cleanupOldAudioStorage(input?: {
  retentionDays?: number;
  dryRun?: boolean;
  limit?: number;
}): Promise<AudioStorageCleanupResult> {
  const retentionDays = Math.max(1, Math.min(Math.round(input?.retentionDays ?? 30), 3650));
  const limit = Math.max(1, Math.min(Math.round(input?.limit ?? 500), 5000));
  const dryRun = Boolean(input?.dryRun);
  const cutoffAt = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000).toISOString();
  const cutoffMs = new Date(cutoffAt).getTime();

  return updateStore((store) => {
    const terminalJobIds = new Set(
      store.batchJobs
        .filter((job) =>
          (job.status === "completed" || job.status === "partial" || job.status === "failed" || job.status === "needs_review") &&
          olderThanCutoff(job.completedAt ?? job.updatedAt ?? job.createdAt, cutoffMs),
        )
        .map((job) => job.id),
    );

    const batchItems = store.batchJobItems
      .filter((item) => terminalJobIds.has(item.jobId) && Boolean(item.audioBase64))
      .slice(0, limit);
    const generations = store.generations
      .filter((generation) => generation.status === "success" && Boolean(generation.audioBase64) && olderThanCutoff(generation.createdAt, cutoffMs))
      .slice(0, limit);
    const cloneJobs = store.batchJobs
      .filter((job) => terminalJobIds.has(job.id) && Boolean(job.cloneSampleBase64))
      .slice(0, limit);

    const estimatedBytesReleased =
      batchItems.reduce((sum, item) => sum + base64StorageBytes(item.audioBase64), 0) +
      generations.reduce((sum, generation) => sum + base64StorageBytes(generation.audioBase64), 0) +
      cloneJobs.reduce((sum, job) => sum + base64StorageBytes(job.cloneSampleBase64), 0);

    if (!dryRun) {
      const now = new Date().toISOString();
      for (const item of batchItems) {
        item.audioBase64 = null;
        item.contentType = null;
        item.updatedAt = now;
      }
      for (const generation of generations) {
        generation.audioBase64 = null;
        generation.contentType = null;
        generation.hasAudio = Boolean(generation.audioObjectKey);
      }
      for (const job of cloneJobs) {
        job.cloneSampleBase64 = null;
        job.cloneSampleMimeType = null;
        job.cloneSampleFileName = null;
        job.updatedAt = now;
      }
    }

    return {
      cutoffAt,
      retentionDays,
      dryRun,
      limit,
      batchItemsCleared: batchItems.length,
      generationsCleared: generations.length,
      cloneSamplesCleared: cloneJobs.length,
      estimatedBytesReleased,
    };
  });
}

export type BatchQueueHealth = {
  queuedJobs: number;
  readyQueuedJobs: number;
  runningJobs: number;
  stuckJobs: number;
  needsReviewJobs: number;
  failedJobs: number;
  oldestQueuedAt: string | null;
  lastWorkerSeenAt: string | null;
  lastWorkerStatus: WorkerHeartbeatStatus | null;
  lastWorkerError: string | null;
  latestUpstreamLatencyMs: number | null;
  latestUpstreamOk: boolean | null;
};

export async function getBatchQueueHealth(options?: {
  stuckTimeoutMs?: number;
}): Promise<BatchQueueHealth> {
  const store = await readStore();
  const now = new Date();
  const stuckTimeoutMs = Math.max(1, options?.stuckTimeoutMs ?? 15 * 60 * 1000);
  const queuedJobs = store.batchJobs.filter((job) => job.status === "queued");
  const runningJobs = store.batchJobs.filter((job) => job.status === "running");
  const stuckJobs = runningJobs.filter((job) => {
    const lastActivity = new Date(job.workerHeartbeatAt ?? job.updatedAt ?? job.startedAt ?? job.createdAt);
    return Number.isNaN(lastActivity.getTime()) || now.getTime() - lastActivity.getTime() >= stuckTimeoutMs;
  });
  const latestHeartbeat = [...store.workerHeartbeats].sort((a, b) => (a.lastSeenAt < b.lastSeenAt ? 1 : -1))[0];
  return {
    queuedJobs: queuedJobs.length,
    readyQueuedJobs: queuedJobs.filter((job) => retryReadyAt(job.nextRetryAt, now)).length,
    runningJobs: runningJobs.length,
    stuckJobs: stuckJobs.length,
    needsReviewJobs: store.batchJobs.filter((job) => job.status === "needs_review").length,
    failedJobs: store.batchJobs.filter((job) => job.status === "failed").length,
    oldestQueuedAt: queuedJobs.map((job) => job.createdAt).sort()[0] ?? null,
    lastWorkerSeenAt: latestHeartbeat?.lastSeenAt ?? null,
    lastWorkerStatus: latestHeartbeat?.status ?? null,
    lastWorkerError: latestHeartbeat?.lastError ?? null,
    latestUpstreamLatencyMs: latestHeartbeat?.upstreamLatencyMs ?? null,
    latestUpstreamOk: latestHeartbeat?.upstreamOk ?? null,
  };
}

export async function recordWorkerHeartbeat(input: {
  workerId: string;
  status: WorkerHeartbeatStatus;
  currentJobId: string | null;
  processedJobId: string | null;
  processedItemCount: number;
  upstreamLatencyMs: number | null;
  upstreamOk: boolean | null;
  lastError: string | null;
  stuckTimeoutMs?: number;
}): Promise<WorkerHeartbeatRecord> {
  return updateStore((store) => {
    const now = new Date().toISOString();
    const healthNow = new Date();
    const stuckTimeoutMs = Math.max(1, input.stuckTimeoutMs ?? 15 * 60 * 1000);
    const runningJobs = store.batchJobs.filter((job) => job.status === "running");
    const stuckJobs = runningJobs.filter((job) => {
      const lastActivity = new Date(job.workerHeartbeatAt ?? job.updatedAt ?? job.startedAt ?? job.createdAt);
      return Number.isNaN(lastActivity.getTime()) || healthNow.getTime() - lastActivity.getTime() >= stuckTimeoutMs;
    });
    const heartbeat = store.workerHeartbeats.find((item) => item.workerId === input.workerId);
    const next: WorkerHeartbeatRecord = {
      id: heartbeat?.id ?? randomUUID(),
      workerId: input.workerId,
      status: input.status,
      lastSeenAt: now,
      currentJobId: input.currentJobId,
      processedJobId: input.processedJobId,
      processedItemCount: Math.max(0, Math.round(input.processedItemCount)),
      queueDepth: store.batchJobs.filter((job) => job.status === "queued").length,
      runningJobs: runningJobs.length,
      stuckJobs: stuckJobs.length,
      needsReviewJobs: store.batchJobs.filter((job) => job.status === "needs_review").length,
      upstreamLatencyMs: input.upstreamLatencyMs,
      upstreamOk: input.upstreamOk,
      lastError: input.lastError,
      createdAt: heartbeat?.createdAt ?? now,
      updatedAt: now,
    };
    if (heartbeat) {
      Object.assign(heartbeat, next);
      return heartbeat;
    }
    store.workerHeartbeats.push(next);
    return next;
  });
}

export async function listWorkerHeartbeats(options?: { limit?: number }): Promise<WorkerHeartbeatRecord[]> {
  const limit = Math.max(1, Math.min(options?.limit ?? 10, 50));
  const store = await readStore();
  return store.workerHeartbeats
    .sort((a, b) => (a.lastSeenAt < b.lastSeenAt ? 1 : -1))
    .slice(0, limit);
}

export async function createPaymentOrder(input: {
  id?: string;
  userId: string;
  planId: PaymentPlanId;
  planName: string;
  quantity: number;
  unitPriceCents: number;
  tokensPerPack: number;
  userNote: string | null;
  paymentReference: string | null;
  proofImageDataUrl: string | null;
  khqrPayload?: string | null;
  khqrMd5?: string | null;
  khqrImageDataUrl?: string | null;
  khqrCurrency?: "USD" | "KHR" | null;
  khqrAmount?: number | null;
  khqrExpiresAt?: string | null;
  paymentProvider?: PaymentProvider | null;
}): Promise<PaymentOrderRecord> {
  return updateStore((store) => {
    const now = new Date().toISOString();
    const order: PaymentOrderRecord = {
      id: input.id ?? randomUUID(),
      userId: input.userId,
      planId: input.planId,
      planName: input.planName,
      quantity: input.quantity,
      unitPriceCents: input.unitPriceCents,
      totalPriceCents: input.unitPriceCents * input.quantity,
      tokens: input.tokensPerPack * input.quantity,
      paymentMethod: "khqr",
      status: "pending",
      userNote: input.userNote,
      paymentReference: input.paymentReference,
      proofImageDataUrl: input.proofImageDataUrl,
      khqrPayload: input.khqrPayload ?? null,
      khqrMd5: input.khqrMd5 ?? null,
      khqrImageDataUrl: input.khqrImageDataUrl ?? null,
      khqrCurrency: input.khqrCurrency ?? null,
      khqrAmount: input.khqrAmount ?? null,
      khqrExpiresAt: input.khqrExpiresAt ?? null,
      paymentProvider: input.paymentProvider ?? null,
      providerTransactionId: null,
      providerReference: null,
      providerApprovalCode: null,
      providerStatusCode: null,
      providerStatus: null,
      providerAmount: null,
      providerCurrency: null,
      providerPayload: null,
      paidAt: null,
      adminNote: null,
      tokenTransactionId: null,
      createdAt: now,
      updatedAt: now,
      approvedAt: null,
      approvedByUserId: null,
      rejectedAt: null,
      rejectedByUserId: null,
      expiredAt: null,
    };
    store.paymentOrders.push(order);
    return order;
  });
}

export async function listUserPaymentOrders(userId: string): Promise<PaymentOrderRecord[]> {
  return updateStore((store) => {
    expirePendingOrders(store);
    return store.paymentOrders
      .filter((order) => order.userId === userId)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  });
}

export async function submitPaymentOrderProof(input: {
  orderId: string;
  userId: string;
  paymentReference: string | null;
  userNote: string | null;
  paymentMethod?: "ABA" | "ACLEDA" | null;
  proofImageDataUrl: string | null;
}): Promise<{ ok: boolean; order: PaymentOrderRecord | null; reason?: string }> {
  return updateStore((store) => {
    const order = store.paymentOrders.find((item) => item.id === input.orderId);
    if (!order || order.userId !== input.userId) {
      return { ok: false, order: null, reason: "ORDER_NOT_FOUND" };
    }
    if (order.status === "expired") {
      return { ok: false, order, reason: "ORDER_EXPIRED" };
    }
    if (isExpiredPendingOrder(order)) {
      markOrderExpired(order);
      return { ok: false, order, reason: "ORDER_EXPIRED" };
    }
    if (order.status !== "pending") {
      return { ok: false, order, reason: "ORDER_ALREADY_DECIDED" };
    }

    const now = new Date().toISOString();
    order.paymentReference = input.paymentReference || order.paymentReference;
    order.userNote = input.userNote || order.userNote;
    order.proofImageDataUrl = input.proofImageDataUrl || order.proofImageDataUrl;
    order.providerReference = input.paymentReference || order.providerReference;
    order.providerStatus = "user_reported_paid";
    order.providerAmount = order.khqrAmount ?? order.providerAmount;
    order.providerCurrency = order.khqrCurrency ?? order.providerCurrency;
    order.providerPayload = JSON.stringify({
      source: "user_payment_confirmation",
      paymentReference: input.paymentReference,
      paymentMethod: input.paymentMethod ?? null,
      note: input.userNote,
      proofUploaded: Boolean(input.proofImageDataUrl || order.proofImageDataUrl),
      submittedAt: now,
    });
    order.updatedAt = now;

    return { ok: true, order };
  });
}

export async function cancelPaymentOrder(input: {
  orderId: string;
  userId: string;
}): Promise<{ ok: boolean; order: PaymentOrderRecord | null; reason?: string }> {
  return updateStore((store) => {
    const order = store.paymentOrders.find((item) => item.id === input.orderId);
    if (!order || order.userId !== input.userId) {
      return { ok: false, order: null, reason: "ORDER_NOT_FOUND" };
    }
    if (order.status === "approved") {
      return { ok: false, order, reason: "ORDER_ALREADY_APPROVED" };
    }
    if (isExpiredPendingOrder(order)) {
      markOrderExpired(order);
      return { ok: false, order, reason: "ORDER_EXPIRED" };
    }
    if (order.status !== "pending") {
      return { ok: false, order, reason: "ORDER_ALREADY_DECIDED" };
    }

    const now = new Date().toISOString();
    order.status = "cancelled";
    order.adminNote = "Cancelled by customer before payment confirmation.";
    order.updatedAt = now;

    return { ok: true, order };
  });
}

function paymentAmountMatches(order: PaymentOrderRecord, amount: number, currency: "USD" | "KHR"): boolean {
  if (order.khqrCurrency && order.khqrCurrency !== currency) return false;
  if (order.khqrAmount === null) return false;

  const tolerance = currency === "USD" ? 0.01 : 1;
  return Math.abs(order.khqrAmount - amount) <= tolerance;
}

function paymentProviderNote(provider: PaymentProvider): string {
  if (provider === "telegram_payway") return "Telegram payment";
  if (provider === "khqrcc") return "KHQRcc payment";
  return "PayWay payment";
}

function paymentProviderApprovalNote(provider: PaymentProvider): string {
  if (provider === "telegram_payway") return "Auto approved by Telegram payment monitor.";
  if (provider === "khqrcc") return "Auto approved by KHQRcc verification.";
  return "Auto approved by PayWay webhook.";
}

export async function confirmPaymentOrderPaid(input: {
  orderId: string;
  provider: PaymentProvider;
  providerTransactionId: string | null;
  providerReference: string | null;
  providerApprovalCode: string | null;
  providerStatusCode: string | null;
  providerStatus: string | null;
  providerAmount: number;
  providerCurrency: "USD" | "KHR";
  providerPayload: string;
  paidAt: string | null;
  adminNote?: string | null;
  approvedByUserId?: string | null;
}): Promise<{ ok: boolean; order: PaymentOrderRecord | null; reason?: string }> {
  return updateStore((store) => {
    const order = store.paymentOrders.find((item) => item.id === input.orderId);
    if (!order) {
      return { ok: false, order: null, reason: "ORDER_NOT_FOUND" };
    }

    if (order.status === "approved") {
      return { ok: true, order, reason: "ORDER_ALREADY_APPROVED" };
    }
    if (order.status === "expired") {
      return { ok: false, order, reason: "ORDER_EXPIRED" };
    }
    if (isExpiredPendingOrder(order)) {
      markOrderExpired(order);
      return { ok: false, order, reason: "ORDER_EXPIRED" };
    }
    if (order.status !== "pending") {
      return { ok: false, order, reason: "ORDER_ALREADY_DECIDED" };
    }
    if (input.providerTransactionId) {
      const duplicate = store.paymentOrders.find(
        (item) =>
          item.id !== order.id &&
          item.providerTransactionId === input.providerTransactionId &&
          item.status === "approved",
      );
      if (duplicate) {
        return { ok: false, order, reason: "DUPLICATE_PROVIDER_TRANSACTION" };
      }
    }
    if (!paymentAmountMatches(order, input.providerAmount, input.providerCurrency)) {
      return { ok: false, order, reason: "AMOUNT_OR_CURRENCY_MISMATCH" };
    }

    const now = new Date().toISOString();
    const paidAt = input.paidAt ?? now;
    const tx: TokenTransactionRecord = {
      id: randomUUID(),
      userId: order.userId,
      amount: order.tokens,
      type: "purchase",
      note: `Auto approved ${paymentProviderNote(input.provider)} order ${order.id}`,
      createdAt: now,
    };

    store.tokenTransactions.push(tx);
    order.status = "approved";
    order.paymentProvider = input.provider;
    order.providerTransactionId = input.providerTransactionId;
    order.providerReference = input.providerReference;
    order.providerApprovalCode = input.providerApprovalCode;
    order.providerStatusCode = input.providerStatusCode;
    order.providerStatus = input.providerStatus;
    order.providerAmount = input.providerAmount;
    order.providerCurrency = input.providerCurrency;
    order.providerPayload = input.providerPayload;
    order.paidAt = paidAt;
    order.adminNote =
      input.adminNote ?? paymentProviderApprovalNote(input.provider);
    order.tokenTransactionId = tx.id;
    order.approvedAt = now;
    order.approvedByUserId = input.approvedByUserId ?? null;
    order.updatedAt = now;

    return { ok: true, order };
  });
}

export type PaymentOrderWithUser = PaymentOrderRecord & {
  userEmail: string;
};

export type PaymentWebhookEventWithOrder = PaymentWebhookEventRecord & {
  userEmail: string | null;
  orderStatus: PaymentOrderStatus | null;
};

export type PaymentSupportTicketWithOrder = PaymentSupportTicketRecord & {
  userEmail: string;
  orderStatus: PaymentOrderStatus | null;
  planName: string | null;
  quantity: number | null;
  totalPriceCents: number | null;
  tokens: number | null;
};

export type TelegramPaymentEventWithOrder = TelegramPaymentEventRecord & {
  userEmail: string | null;
  orderStatus: PaymentOrderStatus | null;
};

export type GenerationWithUser = GenerationRecord & {
  userEmail: string;
};

export async function listPaymentOrdersForAdmin(
  status: PaymentOrderStatus | "all" = "pending",
): Promise<PaymentOrderWithUser[]> {
  return updateStore((store) => {
    expirePendingOrders(store);
    return store.paymentOrders
      .filter((order) => (status === "all" ? true : order.status === status))
      .map((order) => ({
        ...order,
        userEmail: store.users.find((user) => user.id === order.userId)?.email ?? "unknown user",
      }))
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  });
}

export async function approvePaymentOrder(input: {
  orderId: string;
  adminUserId: string;
  adminNote: string | null;
}): Promise<{ ok: boolean; order: PaymentOrderRecord | null; reason?: string }> {
  return updateStore((store) => {
    const order = store.paymentOrders.find((item) => item.id === input.orderId);
    if (!order) {
      return { ok: false, order: null, reason: "ORDER_NOT_FOUND" };
    }
    if (order.status === "expired") {
      return { ok: false, order, reason: "ORDER_EXPIRED" };
    }
    if (isExpiredPendingOrder(order)) {
      markOrderExpired(order);
      return { ok: false, order, reason: "ORDER_EXPIRED" };
    }
    if (order.status !== "pending") {
      return { ok: false, order, reason: "ORDER_ALREADY_DECIDED" };
    }

    const now = new Date().toISOString();
    const tx: TokenTransactionRecord = {
      id: randomUUID(),
      userId: order.userId,
      amount: order.tokens,
      type: "purchase",
      note: `Approved ${order.planName} payment order ${order.id}`,
      createdAt: now,
    };

    store.tokenTransactions.push(tx);
    order.status = "approved";
    order.adminNote = input.adminNote;
    order.tokenTransactionId = tx.id;
    order.approvedAt = now;
    order.approvedByUserId = input.adminUserId;
    order.updatedAt = now;

    return { ok: true, order };
  });
}

export async function rejectPaymentOrder(input: {
  orderId: string;
  adminUserId: string;
  adminNote: string | null;
}): Promise<{ ok: boolean; order: PaymentOrderRecord | null; reason?: string }> {
  return updateStore((store) => {
    const order = store.paymentOrders.find((item) => item.id === input.orderId);
    if (!order) {
      return { ok: false, order: null, reason: "ORDER_NOT_FOUND" };
    }
    if (order.status === "expired") {
      return { ok: false, order, reason: "ORDER_EXPIRED" };
    }
    if (isExpiredPendingOrder(order)) {
      markOrderExpired(order);
      return { ok: false, order, reason: "ORDER_EXPIRED" };
    }
    if (order.status !== "pending") {
      return { ok: false, order, reason: "ORDER_ALREADY_DECIDED" };
    }

    const now = new Date().toISOString();
    order.status = "rejected";
    order.adminNote = input.adminNote;
    order.rejectedAt = now;
    order.rejectedByUserId = input.adminUserId;
    order.updatedAt = now;

    return { ok: true, order };
  });
}

export async function createPaymentSupportTicket(input: {
  userId: string;
  paymentOrderId: string;
  userMessage: string;
}): Promise<{ ok: boolean; ticket: PaymentSupportTicketRecord | null; reason?: string }> {
  return updateStore((store) => {
    const order = store.paymentOrders.find((item) => item.id === input.paymentOrderId);
    if (!order || order.userId !== input.userId) {
      return { ok: false, ticket: null, reason: "ORDER_NOT_FOUND" };
    }
    const existingOpen = store.paymentSupportTickets.find(
      (ticket) => ticket.paymentOrderId === input.paymentOrderId && ticket.status === "open",
    );
    if (existingOpen) {
      return { ok: true, ticket: existingOpen, reason: "TICKET_ALREADY_OPEN" };
    }

    const now = new Date().toISOString();
    const ticket: PaymentSupportTicketRecord = {
      id: randomUUID(),
      userId: input.userId,
      paymentOrderId: input.paymentOrderId,
      status: "open",
      userMessage: input.userMessage,
      adminNote: null,
      resolvedByUserId: null,
      createdAt: now,
      updatedAt: now,
      resolvedAt: null,
    };
    store.paymentSupportTickets.push(ticket);
    return { ok: true, ticket };
  });
}

export async function listUserPaymentSupportTickets(
  userId: string,
): Promise<PaymentSupportTicketRecord[]> {
  return updateStore((store) =>
    store.paymentSupportTickets
      .filter((ticket) => ticket.userId === userId)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)),
  );
}

export async function listPaymentSupportTicketsForAdmin(
  status: PaymentSupportTicketStatus | "all" = "open",
): Promise<PaymentSupportTicketWithOrder[]> {
  return updateStore((store) =>
    store.paymentSupportTickets
      .filter((ticket) => (status === "all" ? true : ticket.status === status))
      .map((ticket) => {
        const order = store.paymentOrders.find((item) => item.id === ticket.paymentOrderId);
        return {
          ...ticket,
          userEmail: store.users.find((user) => user.id === ticket.userId)?.email ?? "unknown user",
          orderStatus: order?.status ?? null,
          planName: order?.planName ?? null,
          quantity: order?.quantity ?? null,
          totalPriceCents: order?.totalPriceCents ?? null,
          tokens: order?.tokens ?? null,
        };
      })
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)),
  );
}

export async function resolvePaymentSupportTicket(input: {
  ticketId: string;
  adminUserId: string;
  adminNote: string | null;
}): Promise<{ ok: boolean; ticket: PaymentSupportTicketRecord | null; reason?: string }> {
  return updateStore((store) => {
    const ticket = store.paymentSupportTickets.find((item) => item.id === input.ticketId);
    if (!ticket) {
      return { ok: false, ticket: null, reason: "TICKET_NOT_FOUND" };
    }
    if (ticket.status === "resolved") {
      return { ok: true, ticket, reason: "TICKET_ALREADY_RESOLVED" };
    }
    const now = new Date().toISOString();
    ticket.status = "resolved";
    ticket.adminNote = input.adminNote;
    ticket.resolvedByUserId = input.adminUserId;
    ticket.updatedAt = now;
    ticket.resolvedAt = now;
    return { ok: true, ticket };
  });
}

export async function createPaymentWebhookEvent(input: {
  provider: PaymentWebhookProvider;
  orderId: string | null;
  paymentOrderId?: string | null;
  eventStatus: PaymentWebhookEventStatus;
  reason: string | null;
  signatureValid: boolean;
  signatureConfigured: boolean;
  providerTransactionId: string | null;
  providerReference: string | null;
  providerApprovalCode: string | null;
  providerStatusCode: string | null;
  providerStatus: string | null;
  providerAmount: number | null;
  providerCurrency: "USD" | "KHR" | null;
  providerPayload: string | null;
  rawBody: string | null;
}): Promise<PaymentWebhookEventRecord> {
  return updateStore((store) => {
    const event: PaymentWebhookEventRecord = {
      id: randomUUID(),
      provider: input.provider,
      orderId: input.orderId,
      paymentOrderId: input.paymentOrderId ?? null,
      eventStatus: input.eventStatus,
      reason: input.reason,
      signatureValid: input.signatureValid,
      signatureConfigured: input.signatureConfigured,
      providerTransactionId: input.providerTransactionId,
      providerReference: input.providerReference,
      providerApprovalCode: input.providerApprovalCode,
      providerStatusCode: input.providerStatusCode,
      providerStatus: input.providerStatus,
      providerAmount: input.providerAmount,
      providerCurrency: input.providerCurrency,
      providerPayload: input.providerPayload,
      rawBody: input.rawBody,
      createdAt: new Date().toISOString(),
    };
    store.paymentWebhookEvents.push(event);
    return event;
  });
}

export async function listPaymentWebhookEventsForAdmin(options?: {
  limit?: number;
  orderId?: string | null;
  status?: PaymentWebhookEventStatus | "all";
}): Promise<PaymentWebhookEventWithOrder[]> {
  const limit = Math.max(1, Math.min(options?.limit ?? 100, 500));
  const orderId = options?.orderId?.trim() || null;
  const status = options?.status ?? "all";

  return updateStore((store) => {
    expirePendingOrders(store);
    return store.paymentWebhookEvents
      .filter((event) => (orderId ? event.orderId === orderId || event.paymentOrderId === orderId : true))
      .filter((event) => (status === "all" ? true : event.eventStatus === status))
      .map((event) => {
        const order = event.paymentOrderId
          ? store.paymentOrders.find((item) => item.id === event.paymentOrderId)
          : event.orderId
            ? store.paymentOrders.find((item) => item.id === event.orderId)
            : null;
        return {
          ...event,
          userEmail: order ? store.users.find((user) => user.id === order.userId)?.email ?? "unknown user" : null,
          orderStatus: order?.status ?? null,
        };
      })
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
      .slice(0, limit);
  });
}

export async function createTelegramPaymentEvent(input: {
  telegramUpdateId: number | null;
  telegramMessageId: number | null;
  chatId: string | null;
  chatTitle: string | null;
  senderId: string | null;
  senderUsername: string | null;
  senderName: string | null;
  senderIsBot: boolean;
  rawText: string | null;
  rawPayload: string;
  parsedStatus: string | null;
  parsedAmount: number | null;
  parsedCurrency: "USD" | "KHR" | null;
  parsedTransactionId: string | null;
  parsedReference: string | null;
  matchedOrderId: string | null;
  decisionStatus: TelegramPaymentEventDecision;
  decisionReason: string | null;
  autoApproveAttempted: boolean;
}): Promise<TelegramPaymentEventRecord> {
  return updateStore((store) => {
    if (input.telegramUpdateId !== null) {
      const existing = store.telegramPaymentEvents.find(
        (event) => event.telegramUpdateId === input.telegramUpdateId,
      );
      if (existing) return existing;
    }

    const now = new Date().toISOString();
    const event: TelegramPaymentEventRecord = {
      id: randomUUID(),
      telegramUpdateId: input.telegramUpdateId,
      telegramMessageId: input.telegramMessageId,
      chatId: input.chatId,
      chatTitle: input.chatTitle,
      senderId: input.senderId,
      senderUsername: input.senderUsername,
      senderName: input.senderName,
      senderIsBot: input.senderIsBot,
      rawText: input.rawText,
      rawPayload: input.rawPayload,
      parsedStatus: input.parsedStatus,
      parsedAmount: input.parsedAmount,
      parsedCurrency: input.parsedCurrency,
      parsedTransactionId: input.parsedTransactionId,
      parsedReference: input.parsedReference,
      matchedOrderId: input.matchedOrderId,
      decisionStatus: input.decisionStatus,
      decisionReason: input.decisionReason,
      autoApproveAttempted: input.autoApproveAttempted,
      createdAt: now,
      updatedAt: now,
    };
    store.telegramPaymentEvents.push(event);
    return event;
  });
}

export async function createTelegramPaymentAction(input: {
  orderId: string | null;
  action: "approve";
  status: TelegramPaymentActionRecord["status"];
  reason: string | null;
  telegramUserId: string | null;
  telegramUsername: string | null;
  telegramFirstName: string | null;
  telegramLastName: string | null;
  callbackQueryId: string | null;
  messageChatId: string | null;
  messageId: string | null;
}): Promise<TelegramPaymentActionRecord> {
  return updateStore((store) => {
    const action: TelegramPaymentActionRecord = {
      id: randomUUID(),
      orderId: input.orderId,
      action: input.action,
      status: input.status,
      reason: input.reason,
      telegramUserId: input.telegramUserId,
      telegramUsername: input.telegramUsername,
      telegramFirstName: input.telegramFirstName,
      telegramLastName: input.telegramLastName,
      callbackQueryId: input.callbackQueryId,
      messageChatId: input.messageChatId,
      messageId: input.messageId,
      createdAt: new Date().toISOString(),
    };
    store.telegramPaymentActions.push(action);
    return action;
  });
}

export async function updateTelegramPaymentEventDecision(input: {
  eventId: string;
  decisionStatus: TelegramPaymentEventDecision;
  decisionReason: string | null;
  matchedOrderId?: string | null;
  autoApproveAttempted?: boolean;
}): Promise<TelegramPaymentEventRecord | null> {
  return updateStore((store) => {
    const event = store.telegramPaymentEvents.find((item) => item.id === input.eventId);
    if (!event) return null;
    event.decisionStatus = input.decisionStatus;
    event.decisionReason = input.decisionReason;
    if ("matchedOrderId" in input) event.matchedOrderId = input.matchedOrderId ?? null;
    if ("autoApproveAttempted" in input) {
      event.autoApproveAttempted = input.autoApproveAttempted ?? false;
    }
    event.updatedAt = new Date().toISOString();
    return event;
  });
}

export async function getTelegramPaymentEventById(
  eventId: string,
): Promise<TelegramPaymentEventWithOrder | null> {
  const store = await readStore();
  const event = store.telegramPaymentEvents.find((item) => item.id === eventId);
  if (!event) return null;
  const order = event.matchedOrderId
    ? store.paymentOrders.find((item) => item.id === event.matchedOrderId)
    : null;
  return {
    ...event,
    userEmail: order ? store.users.find((user) => user.id === order.userId)?.email ?? "unknown user" : null,
    orderStatus: order?.status ?? null,
  };
}

export async function findTelegramPaymentEventByTransactionId(
  transactionId: string,
): Promise<TelegramPaymentEventRecord | null> {
  const normalized = transactionId.trim();
  if (!normalized) return null;
  const store = await readStore();
  return (
    store.telegramPaymentEvents.find((event) => event.parsedTransactionId === normalized) ?? null
  );
}

export async function listTelegramPaymentEventsForAdmin(options?: {
  limit?: number;
  orderId?: string | null;
  status?: TelegramPaymentEventDecision | "all";
}): Promise<TelegramPaymentEventWithOrder[]> {
  const limit = Math.max(1, Math.min(options?.limit ?? 100, 500));
  const orderId = options?.orderId?.trim() || null;
  const status = options?.status ?? "all";

  return updateStore((store) => {
    expirePendingOrders(store);
    return store.telegramPaymentEvents
      .filter((event) => (orderId ? event.matchedOrderId === orderId : true))
      .filter((event) => (status === "all" ? true : event.decisionStatus === status))
      .map((event) => {
        const order = event.matchedOrderId
          ? store.paymentOrders.find((item) => item.id === event.matchedOrderId)
          : null;
        return {
          ...event,
          userEmail: order ? store.users.find((user) => user.id === order.userId)?.email ?? "unknown user" : null,
          orderStatus: order?.status ?? null,
        };
      })
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
      .slice(0, limit);
  });
}

function latestIso(values: Array<string | null | undefined>): string | null {
  const timestamps = values
    .filter((value): value is string => Boolean(value))
    .map((value) => new Date(value).getTime())
    .filter((value) => Number.isFinite(value));
  if (timestamps.length === 0) return null;
  return new Date(Math.max(...timestamps)).toISOString();
}

function buildCustomerSummary(store: DataStore, user: UserRecord): AdminCustomerSummary {
  const userGenerations = store.generations.filter((item) => item.userId === user.id);
  const userOrders = store.paymentOrders.filter((order) => order.userId === user.id);
  const userKeys = store.apiKeys.filter((key) => key.userId === user.id);
  const userBatchJobs = store.batchJobs.filter((job) => job.userId === user.id);
  return {
    user,
    tokenBalance: sumTokenBalance(store, user.id),
    totalCreditsEarned: store.tokenTransactions
      .filter((tx) => tx.userId === user.id && tx.amount > 0)
      .reduce((sum, tx) => sum + tx.amount, 0),
    totalGenerations: userGenerations.length,
    apiRequests: userGenerations.filter((item) => item.source === "api_key").length,
    paymentOrders: userOrders.length,
    activeApiKeys: userKeys.filter((key) => !key.revokedAt).length,
    lastActivityAt: latestIso([
      user.updatedAt,
      ...userGenerations.map((item) => item.createdAt),
      ...userOrders.map((order) => order.updatedAt),
      ...userKeys.map((key) => key.lastUsedAt ?? key.createdAt),
      ...userBatchJobs.map((job) => job.updatedAt),
    ]),
  };
}

export async function listCustomersForAdmin(): Promise<AdminCustomerSummary[]> {
  const store = await readStore();
  return store.users
    .map((user) => buildCustomerSummary(store, user))
    .sort((a, b) => {
      const aTime = a.lastActivityAt ?? a.user.createdAt;
      const bTime = b.lastActivityAt ?? b.user.createdAt;
      return aTime < bTime ? 1 : -1;
    });
}

export async function getCustomerForAdmin(userId: string): Promise<AdminCustomerDetail | null> {
  return updateStore((store) => {
    expirePendingOrders(store);
    const user = store.users.find((item) => item.id === userId);
    if (!user) return null;
    const paymentOrdersList = store.paymentOrders
      .filter((order) => order.userId === userId)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    const paymentOrderIds = new Set(paymentOrdersList.map((order) => order.id));

    return {
      ...buildCustomerSummary(store, user),
      tokenTransactions: store.tokenTransactions
        .filter((tx) => tx.userId === userId)
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
        .slice(0, 150),
      apiKeys: store.apiKeys
        .filter((key) => key.userId === userId)
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)),
      generations: store.generations
        .filter((item) => item.userId === userId)
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
        .slice(0, 100),
      batchJobs: store.batchJobs
        .filter((job) => job.userId === userId)
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
        .slice(0, 50),
      paymentOrdersList,
      webhookEvents: store.paymentWebhookEvents
        .filter((event) => {
          const orderId = event.paymentOrderId ?? event.orderId;
          return orderId ? paymentOrderIds.has(orderId) : false;
        })
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
        .slice(0, 100),
    };
  });
}

export async function adjustCustomerTokens(input: {
  userId: string;
  adminUserId: string;
  amount: number;
  note: string | null;
}): Promise<{ ok: boolean; transaction: TokenTransactionRecord | null; balance: number; reason?: string }> {
  return updateStore((store) => {
    const user = store.users.find((item) => item.id === input.userId);
    const balance = sumTokenBalance(store, input.userId);
    if (!user) {
      return { ok: false, transaction: null, balance, reason: "USER_NOT_FOUND" };
    }
    if (balance + input.amount < 0) {
      return { ok: false, transaction: null, balance, reason: "INSUFFICIENT_BALANCE" };
    }

    const transaction: TokenTransactionRecord = {
      id: randomUUID(),
      userId: input.userId,
      amount: input.amount,
      type: "admin_adjustment",
      note: input.note
        ? `${input.note} (admin ${input.adminUserId})`
        : `Admin adjustment by ${input.adminUserId}`,
      createdAt: new Date().toISOString(),
    };
    store.tokenTransactions.push(transaction);
    user.updatedAt = transaction.createdAt;
    return {
      ok: true,
      transaction,
      balance: balance + input.amount,
    };
  });
}

export async function suspendCustomer(input: {
  userId: string;
  adminUserId: string;
  reason: string;
}): Promise<UserRecord | null> {
  return updateStore((store) => {
    const user = store.users.find((item) => item.id === input.userId);
    if (!user) return null;
    const now = new Date().toISOString();
    user.suspendedAt = now;
    user.suspendedReason = input.reason;
    user.suspendedByUserId = input.adminUserId;
    user.updatedAt = now;
    return user;
  });
}

export async function unsuspendCustomer(input: {
  userId: string;
  adminUserId: string;
}): Promise<UserRecord | null> {
  return updateStore((store) => {
    const user = store.users.find((item) => item.id === input.userId);
    if (!user) return null;
    const now = new Date().toISOString();
    user.suspendedAt = null;
    user.suspendedReason = null;
    user.suspendedByUserId = null;
    user.updatedAt = now;
    store.tokenTransactions.push({
      id: randomUUID(),
      userId: input.userId,
      amount: 0,
      type: "admin_adjustment",
      note: `Account unsuspended by ${input.adminUserId}`,
      createdAt: now,
    });
    return user;
  });
}

export async function revokeAllUserApiKeysForAdmin(userId: string): Promise<number> {
  return updateStore((store) => {
    const now = new Date().toISOString();
    let count = 0;
    for (const key of store.apiKeys) {
      if (key.userId === userId && !key.revokedAt) {
        key.revokedAt = now;
        count += 1;
      }
    }
    const user = store.users.find((item) => item.id === userId);
    if (user) user.updatedAt = now;
    return count;
  });
}

export async function listGenerationsForAdmin(options?: {
  limit?: number;
  mode?: GenerationMode | "all";
  source?: GenerationSource | "all";
  status?: GenerationStatus | "all";
  q?: string;
}): Promise<GenerationWithUser[]> {
  const limit = Math.max(1, Math.min(options?.limit ?? 100, 500));
  const mode = options?.mode ?? "all";
  const source = options?.source ?? "all";
  const status = options?.status ?? "all";
  const q = options?.q?.trim().toLowerCase() ?? "";
  const store = await readStore();

  return store.generations
    .filter((generation) => (mode === "all" ? true : generation.mode === mode))
    .filter((generation) => (source === "all" ? true : generation.source === source))
    .filter((generation) => (status === "all" ? true : generation.status === status))
    .map((generation) => ({
      ...generation,
      userEmail: store.users.find((user) => user.id === generation.userId)?.email ?? "unknown user",
    }))
    .filter((generation) =>
      q
        ? `${generation.userEmail} ${generation.inputPreview} ${generation.mode} ${generation.source} ${generation.status}`
            .toLowerCase()
            .includes(q)
        : true,
    )
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .slice(0, limit);
}

export type AdminGenerationsPage = {
  rows: GenerationWithUser[];
  total: number;
};

// Paginated, date-filterable generation feed for the admin Activity Log.
export async function listGenerationsPageForAdmin(options?: {
  limit?: number;
  offset?: number;
  mode?: GenerationMode | "all";
  source?: GenerationSource | "all";
  status?: GenerationStatus | "all";
  q?: string;
  fromDate?: string | null;
  toDate?: string | null;
}): Promise<AdminGenerationsPage> {
  const limit = Math.max(1, Math.min(options?.limit ?? 100, 500));
  const offset = Math.max(0, options?.offset ?? 0);
  const mode = options?.mode ?? "all";
  const source = options?.source ?? "all";
  const status = options?.status ?? "all";
  const q = options?.q?.trim().toLowerCase() ?? "";
  const fromMs = options?.fromDate ? Date.parse(options.fromDate) : NaN;
  const toMs = options?.toDate ? Date.parse(options.toDate) : NaN;
  const store = await readStore();

  const filtered = store.generations
    .filter((generation) => (mode === "all" ? true : generation.mode === mode))
    .filter((generation) => (source === "all" ? true : generation.source === source))
    .filter((generation) => (status === "all" ? true : generation.status === status))
    .map((generation) => ({
      ...generation,
      userEmail: store.users.find((user) => user.id === generation.userId)?.email ?? "unknown user",
    }))
    .filter((generation) =>
      q
        ? `${generation.userEmail} ${generation.inputPreview} ${generation.mode} ${generation.source} ${generation.status}`
            .toLowerCase()
            .includes(q)
        : true,
    )
    .filter((generation) => {
      const createdMs = Date.parse(generation.createdAt);
      if (!Number.isNaN(fromMs) && !(createdMs >= fromMs)) return false;
      if (!Number.isNaN(toMs) && !(createdMs < toMs)) return false;
      return true;
    })
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

  return { rows: filtered.slice(offset, offset + limit), total: filtered.length };
}

export type ApiErrorWithUser = ApiErrorRecord & {
  userEmail: string | null;
};

export type AdminApiErrorsPage = {
  rows: ApiErrorWithUser[];
  total: number;
};

export async function createApiError(
  input: Omit<ApiErrorRecord, "id" | "createdAt"> & { id?: string; createdAt?: string },
): Promise<ApiErrorRecord> {
  return updateStore((store) => {
    const record: ApiErrorRecord = {
      id: input.id ?? randomUUID(),
      userId: input.userId,
      apiKeyId: input.apiKeyId,
      source: input.source,
      endpoint: input.endpoint,
      method: input.method,
      statusCode: input.statusCode,
      errorCode: input.errorCode,
      errorMessage: input.errorMessage,
      inputPreview: input.inputPreview,
      requestParams: input.requestParams,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
      createdAt: input.createdAt ?? new Date().toISOString(),
    };
    store.apiErrors.push(record);
    return record;
  });
}

export async function listApiErrorsPageForAdmin(options?: {
  limit?: number;
  offset?: number;
  source?: GenerationSource | "all";
  statusGroup?: "all" | "4xx" | "5xx";
  q?: string;
  fromDate?: string | null;
  toDate?: string | null;
}): Promise<AdminApiErrorsPage> {
  const limit = Math.max(1, Math.min(options?.limit ?? 100, 500));
  const offset = Math.max(0, options?.offset ?? 0);
  const source = options?.source ?? "all";
  const statusGroup = options?.statusGroup ?? "all";
  const q = options?.q?.trim().toLowerCase() ?? "";
  const fromMs = options?.fromDate ? Date.parse(options.fromDate) : NaN;
  const toMs = options?.toDate ? Date.parse(options.toDate) : NaN;
  const store = await readStore();

  const filtered = store.apiErrors
    .filter((err) => (source === "all" ? true : err.source === source))
    .filter((err) => {
      if (statusGroup === "4xx") return err.statusCode >= 400 && err.statusCode < 500;
      if (statusGroup === "5xx") return err.statusCode >= 500;
      return true;
    })
    .map((err) => ({
      ...err,
      userEmail: err.userId ? store.users.find((user) => user.id === err.userId)?.email ?? null : null,
    }))
    .filter((err) =>
      q
        ? `${err.userEmail ?? ""} ${err.endpoint} ${err.errorMessage} ${err.errorCode ?? ""} ${err.inputPreview ?? ""}`
            .toLowerCase()
            .includes(q)
        : true,
    )
    .filter((err) => {
      const createdMs = Date.parse(err.createdAt);
      if (!Number.isNaN(fromMs) && !(createdMs >= fromMs)) return false;
      if (!Number.isNaN(toMs) && !(createdMs < toMs)) return false;
      return true;
    })
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

  return { rows: filtered.slice(offset, offset + limit), total: filtered.length };
}

export type BatchJobWithUser = BatchJobRecord & {
  userEmail: string;
};

export type BatchJobWebhookAttemptWithUser = BatchJobWebhookAttemptRecord & {
  userEmail: string;
  jobTitle: string | null;
  jobStatus: BatchJobRecord["status"] | null;
  externalId: string | null;
};

export async function listBatchJobsForAdmin(options?: {
  limit?: number;
  status?: BatchJobRecord["status"] | "all";
  q?: string;
}): Promise<BatchJobWithUser[]> {
  const limit = Math.max(1, Math.min(options?.limit ?? 100, 500));
  const status = options?.status ?? "all";
  const q = options?.q?.trim().toLowerCase() ?? "";
  const store = await readStore();

  return store.batchJobs
    .filter((job) => (status === "all" ? true : job.status === status))
    .map((job) => ({
      ...job,
      userEmail: store.users.find((user) => user.id === job.userId)?.email ?? "unknown user",
    }))
    .filter((job) => {
      if (!q) return true;
      return (
        job.userEmail.toLowerCase().includes(q) ||
        job.title.toLowerCase().includes(q) ||
        job.voice.toLowerCase().includes(q) ||
        job.model.toLowerCase().includes(q) ||
        job.id.toLowerCase().includes(q) ||
        (job.externalId?.toLowerCase().includes(q) ?? false)
      );
    })
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .slice(0, limit);
}

export async function listBatchJobWebhookAttemptsForAdmin(options?: {
  limit?: number;
  jobId?: string | null;
  deliveryStatus?: BatchJobWebhookDeliveryStatus | "all";
}): Promise<BatchJobWebhookAttemptWithUser[]> {
  const limit = Math.max(1, Math.min(options?.limit ?? 100, 500));
  const jobId = options?.jobId?.trim() ?? "";
  const deliveryStatus = options?.deliveryStatus ?? "all";
  const store = await readStore();

  return store.batchJobWebhookAttempts
    .filter((attempt) => (jobId ? attempt.jobId === jobId : true))
    .filter((attempt) => (deliveryStatus === "all" ? true : attempt.deliveryStatus === deliveryStatus))
    .map((attempt) => {
      const job = store.batchJobs.find((candidate) => candidate.id === attempt.jobId);
      return {
        ...attempt,
        userEmail: store.users.find((user) => user.id === attempt.userId)?.email ?? "unknown user",
        jobTitle: job?.title ?? null,
        jobStatus: job?.status ?? null,
        externalId: job?.externalId ?? null,
      };
    })
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .slice(0, limit);
}

export type BusinessApiRequestWithUser = BusinessApiRequestRecord & {
  userEmail: string;
};

export async function createBusinessApiRequest(input: {
  userId: string;
  companyName: string;
  appName: string;
  useCase: string;
  expectedMonthlyTokens: number;
  expectedPeakConcurrency: number;
  webhookUrl: string | null;
  contactTelegram: string | null;
  contactEmail: string;
}): Promise<BusinessApiRequestRecord> {
  return updateStore((store) => {
    const now = new Date().toISOString();
    const request: BusinessApiRequestRecord = {
      id: randomUUID(),
      userId: input.userId,
      companyName: input.companyName,
      appName: input.appName,
      useCase: input.useCase,
      expectedMonthlyTokens: Math.max(1, Math.round(input.expectedMonthlyTokens)),
      expectedPeakConcurrency: Math.max(1, Math.round(input.expectedPeakConcurrency)),
      webhookUrl: input.webhookUrl,
      contactTelegram: input.contactTelegram,
      contactEmail: input.contactEmail,
      status: "pending",
      salesStage: "new",
      salesNote: null,
      followUpAt: null,
      lastContactedAt: null,
      adminNote: null,
      appliedDailyTokenLimit: null,
      appliedMonthlyTokenLimit: null,
      appliedMaxConcurrentRequests: null,
      appliedMaxConcurrentJobs: null,
      appliedMaxQueuedJobs: null,
      appliedCloneCreditRate: null,
      reviewedByUserId: null,
      createdAt: now,
      updatedAt: now,
      reviewedAt: null,
    };
    store.businessApiRequests.push(request);
    return request;
  });
}

export async function listUserBusinessApiRequests(userId: string): Promise<BusinessApiRequestRecord[]> {
  const store = await readStore();
  return store.businessApiRequests
    .filter((request) => request.userId === userId)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export async function listBusinessApiRequestsForAdmin(options?: {
  status?: BusinessApiRequestStatus | "all";
  salesStage?: BusinessSalesStage | "all";
  limit?: number;
  q?: string;
}): Promise<BusinessApiRequestWithUser[]> {
  const status = options?.status ?? "all";
  const salesStage = options?.salesStage ?? "all";
  const limit = Math.max(1, Math.min(options?.limit ?? 200, 500));
  const q = options?.q?.trim().toLowerCase() ?? "";
  const store = await readStore();
  return store.businessApiRequests
    .filter((request) => (status === "all" ? true : request.status === status))
    .filter((request) => (salesStage === "all" ? true : request.salesStage === salesStage))
    .map((request) => ({
      ...request,
      userEmail: store.users.find((user) => user.id === request.userId)?.email ?? "unknown user",
    }))
    .filter((request) => {
      if (!q) return true;
      return `${request.userEmail} ${request.companyName} ${request.appName} ${request.contactEmail} ${request.useCase} ${request.salesNote ?? ""}`
        .toLowerCase()
        .includes(q);
    })
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .slice(0, limit);
}

export async function reviewBusinessApiRequest(input: {
  requestId: string;
  adminUserId: string;
  status: Exclude<BusinessApiRequestStatus, "pending">;
  adminNote: string | null;
  limits?: {
    dailyTokenLimit?: number | null;
    monthlyTokenLimit?: number | null;
    maxConcurrentRequests?: number | null;
    maxConcurrentJobs?: number | null;
    maxQueuedJobs?: number | null;
    cloneCreditRate?: number | null;
  };
  applyToActiveKeys?: boolean;
}): Promise<BusinessApiRequestRecord | null> {
  return updateStore((store) => {
    const request = store.businessApiRequests.find((item) => item.id === input.requestId);
    if (!request) return null;
    const now = new Date().toISOString();
    const limits = input.limits ?? {};
    const dailyTokenLimit = normalizeOptionalLimit(limits.dailyTokenLimit);
    const monthlyTokenLimit = normalizeOptionalLimit(limits.monthlyTokenLimit);
    const maxConcurrentRequests = normalizeOptionalLimit(limits.maxConcurrentRequests);
    const maxConcurrentJobs = normalizeOptionalLimit(limits.maxConcurrentJobs);
    const maxQueuedJobs = normalizeOptionalLimit(limits.maxQueuedJobs);
    const cloneCreditRate = normalizeCloneCreditRate(limits.cloneCreditRate);

    request.status = input.status;
    request.salesStage = input.status === "approved" ? "won" : "lost";
    request.adminNote = input.adminNote;
    request.appliedDailyTokenLimit = input.status === "approved" ? dailyTokenLimit : null;
    request.appliedMonthlyTokenLimit = input.status === "approved" ? monthlyTokenLimit : null;
    request.appliedMaxConcurrentRequests = input.status === "approved" ? maxConcurrentRequests : null;
    request.appliedMaxConcurrentJobs = input.status === "approved" ? maxConcurrentJobs : null;
    request.appliedMaxQueuedJobs = input.status === "approved" ? maxQueuedJobs : null;
    request.appliedCloneCreditRate = input.status === "approved" ? cloneCreditRate : null;
    request.reviewedByUserId = input.adminUserId;
    request.reviewedAt = now;
    request.updatedAt = now;

    if (input.status === "approved" && input.applyToActiveKeys !== false) {
      for (const key of store.apiKeys) {
        if (key.userId !== request.userId || key.revokedAt) continue;
        key.dailyTokenLimit = dailyTokenLimit;
        key.monthlyTokenLimit = monthlyTokenLimit;
        key.maxConcurrentRequests = maxConcurrentRequests;
        key.maxConcurrentJobs = maxConcurrentJobs;
        key.maxQueuedJobs = maxQueuedJobs;
      }
    }

    return request;
  });
}

export async function updateBusinessApiRequestSalesState(input: {
  requestId: string;
  adminUserId: string;
  salesStage: BusinessSalesStage;
  salesNote: string | null;
  followUpAt: string | null;
  markContacted?: boolean;
}): Promise<BusinessApiRequestRecord | null> {
  return updateStore((store) => {
    const request = store.businessApiRequests.find((item) => item.id === input.requestId);
    if (!request) return null;
    const now = new Date().toISOString();
    const followUpAt = input.followUpAt ? new Date(input.followUpAt) : null;
    request.salesStage = input.salesStage;
    request.salesNote = input.salesNote?.trim() ? input.salesNote.trim().slice(0, 1000) : null;
    request.followUpAt = followUpAt && !Number.isNaN(followUpAt.getTime()) ? followUpAt.toISOString() : null;
    if (input.markContacted) request.lastContactedAt = now;
    request.updatedAt = now;
    return request;
  });
}

export async function createWebhookTestEvent(input: {
  userId: string;
  webhookUrl: string;
  eventType: WebhookTestEventType;
  deliveryStatus: WebhookTestDeliveryStatus;
  httpStatus: number | null;
  responsePreview: string | null;
  errorMessage: string | null;
  latencyMs: number;
}): Promise<WebhookTestEventRecord> {
  return updateStore((store) => {
    const event: WebhookTestEventRecord = {
      id: randomUUID(),
      userId: input.userId,
      webhookUrl: input.webhookUrl,
      eventType: input.eventType,
      deliveryStatus: input.deliveryStatus,
      httpStatus: input.httpStatus,
      responsePreview: input.responsePreview,
      errorMessage: input.errorMessage,
      latencyMs: Math.max(0, Math.round(input.latencyMs)),
      createdAt: new Date().toISOString(),
    };
    store.webhookTestEvents.push(event);
    return event;
  });
}

export async function listUserWebhookTestEvents(
  userId: string,
  options?: { limit?: number },
): Promise<WebhookTestEventRecord[]> {
  const limit = Math.max(1, Math.min(options?.limit ?? 20, 100));
  const store = await readStore();
  return store.webhookTestEvents
    .filter((event) => event.userId === userId)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .slice(0, limit);
}

export async function listUserVoices(userId: string): Promise<UserVoiceRecord[]> {
  const store = await readStore();
  return store.userVoices
    .filter((voice) => voice.userId === userId)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export async function createUserVoice(input: {
  userId: string;
  name: string;
  description: string | null;
  fileName: string;
  mimeType: string;
  fileSize: number;
  audioBase64: string;
}): Promise<UserVoiceRecord> {
  return updateStore((store) => {
    // Enforce name uniqueness per user
    const existing = store.userVoices.find(
      (v) => v.userId === input.userId && v.name.toLowerCase() === input.name.toLowerCase()
    );
    if (existing) {
      throw new Error("Voice name already exists.");
    }

    const now = new Date().toISOString();
    const voice: UserVoiceRecord = {
      id: randomUUID(),
      userId: input.userId,
      name: input.name,
      description: input.description,
      fileName: input.fileName,
      mimeType: input.mimeType,
      fileSize: input.fileSize,
      audioBase64: input.audioBase64,
      createdAt: now,
      updatedAt: now,
    };
    store.userVoices.push(voice);
    return voice;
  });
}

export async function deleteUserVoice(userId: string, voiceId: string): Promise<boolean> {
  return updateStore((store) => {
    const idx = store.userVoices.findIndex((v) => v.id === voiceId && v.userId === userId);
    if (idx === -1) return false;
    store.userVoices.splice(idx, 1);
    return true;
  });
}

export async function findUserVoiceById(userId: string, voiceId: string): Promise<UserVoiceRecord | null> {
  const store = await readStore();
  return store.userVoices.find((v) => v.id === voiceId && v.userId === userId) ?? null;
}

export async function getSystemSetting(key: string, defaultValue: string): Promise<string> {
  const store = await readStore();
  const setting = store.systemSettings?.find((s) => s.key === key);
  return setting ? setting.value : defaultValue;
}

export async function setSystemSetting(key: string, value: string): Promise<void> {
  await updateStore((store) => {
    store.systemSettings ??= [];
    const setting = store.systemSettings.find((s) => s.key === key);
    const now = new Date().toISOString();
    if (setting) {
      setting.value = value;
      setting.updatedAt = now;
    } else {
      store.systemSettings.push({ key, value, updatedAt: now });
    }
  });
}
