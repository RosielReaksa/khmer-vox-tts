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
  GenerationMode,
  GenerationRecord,
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

export type BatchJobWithUser = BatchJobRecord & {
  userEmail: string;
};

export type BatchJobWebhookAttemptWithUser = BatchJobWebhookAttemptRecord & {
  userEmail: string;
  jobTitle: string | null;
  jobStatus: BatchJobRecord["status"] | null;
  externalId: string | null;
};

export type BusinessApiRequestWithUser = BusinessApiRequestRecord & {
  userEmail: string;
};

type ActiveStore = typeof import("@/lib/json-store");

let cachedStore: ActiveStore | null = null;
let cachedStoreMode: "json" | "postgres" | null = null;
let warnedLocalJsonStore = false;

function usesPostgres(): boolean {
  const url = process.env.DATABASE_URL?.trim().replace(/^"|"$/g, "") ?? "";
  return url.startsWith("postgres://") || url.startsWith("postgresql://");
}

function allowsLocalJsonStore(): boolean {
  const value = process.env.ALLOW_LOCAL_JSON_STORE?.trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes" || value === "on";
}

async function activeStore(): Promise<ActiveStore> {
  if (process.env.NODE_ENV === "production" && !usesPostgres() && !allowsLocalJsonStore()) {
    throw new Error("Production requires DATABASE_URL to be a Postgres/Supabase connection string.");
  }
  const mode = usesPostgres() ? "postgres" : "json";
  if (mode === "json" && process.env.NODE_ENV === "production" && !warnedLocalJsonStore) {
    warnedLocalJsonStore = true;
    console.warn("[store] Using local JSON store in production mode because ALLOW_LOCAL_JSON_STORE is enabled.");
  }
  if (cachedStore && cachedStoreMode === mode) {
    return cachedStore;
  }
  cachedStore = mode === "postgres"
    ? ((await import("@/lib/postgres-store")) as ActiveStore)
    : await import("@/lib/json-store");
  cachedStoreMode = mode;
  return cachedStore;
}

export function getStoreMode(): "json" | "postgres" {
  return usesPostgres() ? "postgres" : "json";
}

export async function findUserByEmail(email: string): Promise<UserRecord | null> {
  return (await activeStore()).findUserByEmail(email);
}

export async function findUserById(userId: string): Promise<UserRecord | null> {
  return (await activeStore()).findUserById(userId);
}

export async function createUserWithSignupBonus(email: string, passwordHash: string): Promise<UserRecord> {
  return (await activeStore()).createUserWithSignupBonus(email, passwordHash);
}

export async function findUserByGoogleId(googleId: string): Promise<UserRecord | null> {
  return (await activeStore()).findUserByGoogleId(googleId);
}

export async function linkGoogleAccount(input: {
  userId: string;
  googleId: string;
  displayName?: string | null;
  avatarUrl?: string | null;
}): Promise<UserRecord | null> {
  return (await activeStore()).linkGoogleAccount(input);
}

export async function createGoogleUserWithSignupBonus(input: {
  email: string;
  googleId: string;
  displayName?: string | null;
  avatarUrl?: string | null;
}): Promise<UserRecord> {
  return (await activeStore()).createGoogleUserWithSignupBonus(input);
}

export async function getUserTokenBalance(userId: string): Promise<number> {
  return (await activeStore()).getUserTokenBalance(userId);
}

export async function getUserTotalCreditsEarned(userId: string): Promise<number> {
  return (await activeStore()).getUserTotalCreditsEarned(userId);
}

export async function addTokenTransaction(
  userId: string,
  amount: number,
  type: TokenTransactionType,
  note: string | null,
): Promise<TokenTransactionRecord> {
  return (await activeStore()).addTokenTransaction(userId, amount, type, note);
}

export async function consumeUserTokens(
  userId: string,
  amount: number,
  note: string | null,
): Promise<{ ok: boolean; remaining: number }> {
  return (await activeStore()).consumeUserTokens(userId, amount, note);
}

export async function listUserApiKeys(userId: string): Promise<ApiKeyRecord[]> {
  return (await activeStore()).listUserApiKeys(userId);
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
  return (await activeStore()).createApiKey(userId, name, keyPrefix, keyHash, options);
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
  return (await activeStore()).updateApiKeyLimits(userId, keyId, limits);
}

export async function getApiKeyTokenUsage(
  apiKeyId: string,
  period: "day" | "month",
): Promise<number> {
  return (await activeStore()).getApiKeyTokenUsage(apiKeyId, period);
}

export async function getApiKeyBatchJobCounts(apiKeyId: string): Promise<{
  queued: number;
  running: number;
}> {
  return (await activeStore()).getApiKeyBatchJobCounts(apiKeyId);
}

export async function findActiveApiKeyByRawKey(rawKey: string): Promise<ApiKeyRecord | null> {
  return (await activeStore()).findActiveApiKeyByRawKey(rawKey);
}

export async function touchApiKeyLastUsed(keyId: string): Promise<void> {
  return (await activeStore()).touchApiKeyLastUsed(keyId);
}

export async function revokeApiKey(userId: string, keyId: string): Promise<boolean> {
  return (await activeStore()).revokeApiKey(userId, keyId);
}

export async function createGenerationRecord(
  input: Omit<GenerationRecord, "id" | "createdAt"> & { createdAt?: string; id?: string },
): Promise<GenerationRecord> {
  return (await activeStore()).createGenerationRecord(input);
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
  return (await activeStore()).updateGenerationRecord(input);
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
  return (await activeStore()).listUserGenerations(userId, options);
}

export async function getUserGenerationRecord(
  userId: string,
  generationId: string,
): Promise<GenerationRecord | null> {
  return (await activeStore()).getUserGenerationRecord(userId, generationId);
}

export async function countUserGenerations(
  userId: string,
  options?: {
    source?: GenerationSource | "all";
    mode?: GenerationMode | "all";
    search?: string;
  },
): Promise<number> {
  return (await activeStore()).countUserGenerations(userId, options);
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
  return (await activeStore()).getGenerationStats(userId, mode);
}

export async function getApiUsageStats(userId: string): Promise<{
  requestsToday: number;
  requestsThisMonth: number;
  successRatePercent: number;
  last30DaysRequests: number;
}> {
  return (await activeStore()).getApiUsageStats(userId);
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
  return (await activeStore()).createBatchJob(input);
}

export async function listUserBatchJobs(
  userId: string,
  options?: { limit?: number },
): Promise<BatchJobRecord[]> {
  return (await activeStore()).listUserBatchJobs(userId, options);
}

export async function getUserBatchJobWithItems(
  userId: string,
  jobId: string,
): Promise<{ job: BatchJobRecord; items: BatchJobItemRecord[] } | null> {
  return (await activeStore()).getUserBatchJobWithItems(userId, jobId);
}

export async function getBatchJobWithItems(
  jobId: string,
): Promise<{ job: BatchJobRecord; items: BatchJobItemRecord[] } | null> {
  return (await activeStore()).getBatchJobWithItems(jobId);
}

export async function claimNextQueuedBatchJob(workerId?: string | null): Promise<BatchJobRecord | null> {
  return (await activeStore()).claimNextQueuedBatchJob(workerId);
}

export async function claimQueuedBatchJob(jobId: string, workerId?: string | null): Promise<BatchJobRecord | null> {
  return (await activeStore()).claimQueuedBatchJob(jobId, workerId);
}

export async function claimQueuedBatchJobItem(itemId: string): Promise<BatchJobItemRecord | null> {
  return (await activeStore()).claimQueuedBatchJobItem(itemId);
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
  return (await activeStore()).updateBatchJobStatus(input);
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
  return (await activeStore()).updateBatchJobItem(input);
}

export async function resetRetryableBatchJobItems(jobId: string, maxItemAttempts: number): Promise<number> {
  return (await activeStore()).resetRetryableBatchJobItems(jobId, maxItemAttempts);
}

export async function refreshBatchJobRollup(jobId: string): Promise<BatchJobRecord | null> {
  return (await activeStore()).refreshBatchJobRollup(jobId);
}

export async function updateBatchJobWebhookStatus(input: {
  jobId: string;
  webhookStatus: BatchJobRecord["webhookStatus"];
  webhookLastError: string | null;
  webhookLastAttemptAt: string;
  incrementAttempts: boolean;
}): Promise<BatchJobRecord | null> {
  return (await activeStore()).updateBatchJobWebhookStatus(input);
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
  return (await activeStore()).createBatchJobWebhookAttempt(input);
}

export async function listBatchJobWebhookAttempts(
  jobId: string,
  options?: { limit?: number },
): Promise<BatchJobWebhookAttemptRecord[]> {
  return (await activeStore()).listBatchJobWebhookAttempts(jobId, options);
}

export async function clearBatchJobCloneSample(jobId: string): Promise<BatchJobRecord | null> {
  return (await activeStore()).clearBatchJobCloneSample(jobId);
}

export async function retryBatchJob(jobId: string): Promise<BatchJobRecord | null> {
  return (await activeStore()).retryBatchJob(jobId);
}

export type StuckBatchRecoveryResult = import("@/lib/json-store").StuckBatchRecoveryResult;

export async function recoverStuckBatchJobs(input: {
  timeoutMs: number;
  maxRecoveries: number;
  maxItemAttempts: number;
}): Promise<StuckBatchRecoveryResult> {
  return (await activeStore()).recoverStuckBatchJobs(input);
}

export type BatchQueueHealth = import("@/lib/json-store").BatchQueueHealth;

export async function getBatchQueueHealth(options?: {
  stuckTimeoutMs?: number;
}): Promise<BatchQueueHealth> {
  return (await activeStore()).getBatchQueueHealth(options);
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
  return (await activeStore()).recordWorkerHeartbeat(input);
}

export async function listWorkerHeartbeats(options?: { limit?: number }): Promise<WorkerHeartbeatRecord[]> {
  return (await activeStore()).listWorkerHeartbeats(options);
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
  return (await activeStore()).createPaymentOrder(input);
}

export async function listUserPaymentOrders(userId: string): Promise<PaymentOrderRecord[]> {
  return (await activeStore()).listUserPaymentOrders(userId);
}

export async function submitPaymentOrderProof(input: {
  orderId: string;
  userId: string;
  paymentReference: string | null;
  userNote: string | null;
  paymentMethod?: "ABA" | "ACLEDA" | null;
  proofImageDataUrl: string | null;
}): Promise<{ ok: boolean; order: PaymentOrderRecord | null; reason?: string }> {
  return (await activeStore()).submitPaymentOrderProof(input);
}

export async function cancelPaymentOrder(input: {
  orderId: string;
  userId: string;
}): Promise<{ ok: boolean; order: PaymentOrderRecord | null; reason?: string }> {
  return (await activeStore()).cancelPaymentOrder(input);
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
  return (await activeStore()).confirmPaymentOrderPaid(input);
}

export async function listPaymentOrdersForAdmin(
  status: PaymentOrderStatus | "all" = "pending",
): Promise<PaymentOrderWithUser[]> {
  return (await activeStore()).listPaymentOrdersForAdmin(status);
}

export async function purgeQueuedBatchJobs(
  adminUserId: string,
  reason: string,
): Promise<number> {
  return (await activeStore()).purgeQueuedBatchJobs(adminUserId, reason);
}

export type AudioStorageCleanupResult = import("@/lib/json-store").AudioStorageCleanupResult;

export async function cleanupOldAudioStorage(input?: {
  retentionDays?: number;
  dryRun?: boolean;
  limit?: number;
}): Promise<AudioStorageCleanupResult> {
  return (await activeStore()).cleanupOldAudioStorage(input);
}

export async function approvePaymentOrder(input: {
  orderId: string;
  adminUserId: string;
  adminNote: string | null;
}): Promise<{ ok: boolean; order: PaymentOrderRecord | null; reason?: string }> {
  return (await activeStore()).approvePaymentOrder(input);
}

export async function rejectPaymentOrder(input: {
  orderId: string;
  adminUserId: string;
  adminNote: string | null;
}): Promise<{ ok: boolean; order: PaymentOrderRecord | null; reason?: string }> {
  return (await activeStore()).rejectPaymentOrder(input);
}

export async function createPaymentSupportTicket(input: {
  userId: string;
  paymentOrderId: string;
  userMessage: string;
}): Promise<{ ok: boolean; ticket: PaymentSupportTicketRecord | null; reason?: string }> {
  return (await activeStore()).createPaymentSupportTicket(input);
}

export async function listUserPaymentSupportTickets(
  userId: string,
): Promise<PaymentSupportTicketRecord[]> {
  return (await activeStore()).listUserPaymentSupportTickets(userId);
}

export async function listPaymentSupportTicketsForAdmin(
  status: PaymentSupportTicketStatus | "all" = "open",
): Promise<PaymentSupportTicketWithOrder[]> {
  return (await activeStore()).listPaymentSupportTicketsForAdmin(status);
}

export async function resolvePaymentSupportTicket(input: {
  ticketId: string;
  adminUserId: string;
  adminNote: string | null;
}): Promise<{ ok: boolean; ticket: PaymentSupportTicketRecord | null; reason?: string }> {
  return (await activeStore()).resolvePaymentSupportTicket(input);
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
  return (await activeStore()).createPaymentWebhookEvent(input);
}

export async function listPaymentWebhookEventsForAdmin(options?: {
  limit?: number;
  orderId?: string | null;
  status?: PaymentWebhookEventStatus | "all";
}): Promise<PaymentWebhookEventWithOrder[]> {
  return (await activeStore()).listPaymentWebhookEventsForAdmin(options);
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
  return (await activeStore()).createTelegramPaymentEvent(input);
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
  return (await activeStore()).createTelegramPaymentAction(input);
}

export async function updateTelegramPaymentEventDecision(input: {
  eventId: string;
  decisionStatus: TelegramPaymentEventDecision;
  decisionReason: string | null;
  matchedOrderId?: string | null;
  autoApproveAttempted?: boolean;
}): Promise<TelegramPaymentEventRecord | null> {
  return (await activeStore()).updateTelegramPaymentEventDecision(input);
}

export async function getTelegramPaymentEventById(
  eventId: string,
): Promise<TelegramPaymentEventWithOrder | null> {
  return (await activeStore()).getTelegramPaymentEventById(eventId);
}

export async function findTelegramPaymentEventByTransactionId(
  transactionId: string,
): Promise<TelegramPaymentEventRecord | null> {
  return (await activeStore()).findTelegramPaymentEventByTransactionId(transactionId);
}

export async function listTelegramPaymentEventsForAdmin(options?: {
  limit?: number;
  orderId?: string | null;
  status?: TelegramPaymentEventDecision | "all";
}): Promise<TelegramPaymentEventWithOrder[]> {
  return (await activeStore()).listTelegramPaymentEventsForAdmin(options);
}

export async function listCustomersForAdmin(): Promise<AdminCustomerSummary[]> {
  return (await activeStore()).listCustomersForAdmin();
}

export async function getCustomerForAdmin(userId: string): Promise<AdminCustomerDetail | null> {
  return (await activeStore()).getCustomerForAdmin(userId);
}

export async function adjustCustomerTokens(input: {
  userId: string;
  adminUserId: string;
  amount: number;
  note: string | null;
}): Promise<{ ok: boolean; transaction: TokenTransactionRecord | null; balance: number; reason?: string }> {
  return (await activeStore()).adjustCustomerTokens(input);
}

export async function suspendCustomer(input: {
  userId: string;
  adminUserId: string;
  reason: string;
}): Promise<UserRecord | null> {
  return (await activeStore()).suspendCustomer(input);
}

export async function unsuspendCustomer(input: {
  userId: string;
  adminUserId: string;
}): Promise<UserRecord | null> {
  return (await activeStore()).unsuspendCustomer(input);
}

export async function revokeAllUserApiKeysForAdmin(userId: string): Promise<number> {
  return (await activeStore()).revokeAllUserApiKeysForAdmin(userId);
}

export async function listGenerationsForAdmin(options?: {
  limit?: number;
  mode?: GenerationMode | "all";
  source?: GenerationSource | "all";
  status?: GenerationStatus | "all";
  q?: string;
}): Promise<GenerationWithUser[]> {
  return (await activeStore()).listGenerationsForAdmin(options);
}

export async function listBatchJobsForAdmin(options?: {
  limit?: number;
  status?: BatchJobRecord["status"] | "all";
  q?: string;
}): Promise<BatchJobWithUser[]> {
  return (await activeStore()).listBatchJobsForAdmin(options);
}

export async function listBatchJobWebhookAttemptsForAdmin(options?: {
  limit?: number;
  jobId?: string | null;
  deliveryStatus?: BatchJobWebhookDeliveryStatus | "all";
}): Promise<BatchJobWebhookAttemptWithUser[]> {
  return (await activeStore()).listBatchJobWebhookAttemptsForAdmin(options);
}

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
  return (await activeStore()).createBusinessApiRequest(input);
}

export async function listUserBusinessApiRequests(userId: string): Promise<BusinessApiRequestRecord[]> {
  return (await activeStore()).listUserBusinessApiRequests(userId);
}

export async function listBusinessApiRequestsForAdmin(options?: {
  status?: BusinessApiRequestStatus | "all";
  salesStage?: BusinessSalesStage | "all";
  limit?: number;
  q?: string;
}): Promise<BusinessApiRequestWithUser[]> {
  return (await activeStore()).listBusinessApiRequestsForAdmin(options);
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
  return (await activeStore()).reviewBusinessApiRequest(input);
}

export async function updateBusinessApiRequestSalesState(input: {
  requestId: string;
  adminUserId: string;
  salesStage: BusinessSalesStage;
  salesNote: string | null;
  followUpAt: string | null;
  markContacted?: boolean;
}): Promise<BusinessApiRequestRecord | null> {
  return (await activeStore()).updateBusinessApiRequestSalesState(input);
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
  return (await activeStore()).createWebhookTestEvent(input);
}

export async function listUserWebhookTestEvents(
  userId: string,
  options?: { limit?: number },
): Promise<WebhookTestEventRecord[]> {
  return (await activeStore()).listUserWebhookTestEvents(userId, options);
}

export async function listUserVoices(userId: string): Promise<UserVoiceRecord[]> {
  return (await activeStore()).listUserVoices(userId);
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
  return (await activeStore()).createUserVoice(input);
}

export async function deleteUserVoice(userId: string, voiceId: string): Promise<boolean> {
  return (await activeStore()).deleteUserVoice(userId, voiceId);
}

export async function findUserVoiceById(userId: string, voiceId: string): Promise<UserVoiceRecord | null> {
  return (await activeStore()).findUserVoiceById(userId, voiceId);
}

export async function getSystemSetting(key: string, defaultValue: string): Promise<string> {
  return (await activeStore()).getSystemSetting(key, defaultValue);
}

export async function setSystemSetting(key: string, value: string): Promise<void> {
  return (await activeStore()).setSystemSetting(key, value);
}
