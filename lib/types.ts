export type TokenTransactionType =
  | "signup_bonus"
  | "purchase"
  | "usage"
  | "refund"
  | "admin_adjustment";

export type GenerationMode = "tts" | "clone";
export type GenerationSource = "dashboard" | "api_key";
export type GenerationStatus = "processing" | "success" | "failed";
export type BatchJobStatus = "queued" | "running" | "completed" | "partial" | "failed" | "needs_review";
export type BatchJobItemStatus = "queued" | "running" | "success" | "failed";
export type PaymentPlanId =
  | "starter"
  | "creator"
  | "pro"
  | "pack_5"
  | "pack_10"
  | "pack_15"
  | "pack_20";
export type PaymentOrderStatus = "pending" | "approved" | "rejected" | "expired" | "cancelled";
export type PaymentSupportTicketStatus = "open" | "resolved";
export type PaymentWebhookProvider = "payway" | "khqrcc";
export type PaymentWebhookEventStatus = "credited" | "not_credited" | "invalid" | "error";
export type PaymentProvider = "payway" | "static_payway" | "telegram_payway" | "khqrcc";
export type TelegramPaymentEventDecision =
  | "ready_to_approve"
  | "auto_approved"
  | "manual_approved"
  | "needs_review"
  | "ignored"
  | "duplicate"
  | "error";
export type BusinessApiRequestStatus = "pending" | "approved" | "rejected";
export type BusinessSalesStage =
  | "new"
  | "contacted"
  | "qualified"
  | "proposal"
  | "won"
  | "lost";
export type WebhookTestEventType = "completed" | "failed";
export type WebhookTestDeliveryStatus = "delivered" | "failed";
export type BatchJobWebhookDeliveryStatus = "delivered" | "failed";
export type WorkerHeartbeatStatus = "online" | "idle" | "busy" | "stuck" | "error";
export type TelegramPaymentActionType = "approve";
export type TelegramPaymentActionStatus =
  | "success"
  | "failed"
  | "forbidden"
  | "expired"
  | "invalid"
  | "already_decided";

export type UserRecord = {
  id: string;
  email: string;
  passwordHash: string | null;
  googleId: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  suspendedAt: string | null;
  suspendedReason: string | null;
  suspendedByUserId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ApiKeyRecord = {
  id: string;
  userId: string;
  name: string;
  keyPrefix: string;
  keyHash: string;
  dailyTokenLimit: number | null;
  monthlyTokenLimit: number | null;
  maxConcurrentRequests: number | null;
  maxConcurrentJobs: number | null;
  maxQueuedJobs: number | null;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
};

export type TokenTransactionRecord = {
  id: string;
  userId: string;
  amount: number;
  type: TokenTransactionType;
  note: string | null;
  createdAt: string;
};

export type GenerationRecord = {
  id: string;
  userId: string;
  apiKeyId: string | null;
  mode: GenerationMode;
  source: GenerationSource;
  status: GenerationStatus;
  model: string;
  voice: string;
  inputChars: number;
  inputPreview: string;
  outputSeconds: number;
  creditsRequested: number;
  creditsCharged: number;
  latencyMs: number;
  errorMessage: string | null;
  audioBase64?: string | null;
  audioObjectKey?: string | null;
  audioObjectUrl?: string | null;
  contentType?: string | null;
  hasAudio?: boolean;
  segmentOfJobId?: string | null;
  createdAt: string;
};

// System-wide API error log entry. Captures errors that may never create a
// generation row: auth failures (401/402/403), rate-limit/quota rejections
// (429), validation errors (400), and unexpected server errors (500). Written
// fire-and-forget so logging never affects the request outcome.
export type ApiErrorRecord = {
  id: string;
  userId: string | null;
  apiKeyId: string | null;
  source: GenerationSource;
  endpoint: string;
  method: string;
  statusCode: number;
  errorCode: string | null;
  errorMessage: string;
  inputPreview: string | null;
  requestParams: string | null; // JSON string of sanitized request params
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
};

export type BatchJobRecord = {
  id: string;
  userId: string;
  apiKeyId: string | null;
  mode: GenerationMode;
  source: GenerationSource;
  status: BatchJobStatus;
  title: string;
  voice: string;
  model: string;
  externalId: string | null;
  metadataJson: string | null;
  totalItems: number;
  completedItems: number;
  failedItems: number;
  totalInputChars: number;
  creditsEstimated: number;
  creditsCharged: number;
  outputSeconds: number;
  errorMessage: string | null;
  cloneSampleBase64: string | null;
  cloneSampleMimeType: string | null;
  cloneSampleFileName: string | null;
  cloneConsentAt: string | null;
  cloneConsentText: string | null;
  webhookCallbackUrl: string | null;
  webhookStatus: "pending" | "delivered" | "failed" | null;
  webhookAttempts: number;
  webhookLastError: string | null;
  webhookLastAttemptAt: string | null;
  workerAttemptCount: number;
  lastWorkerId: string | null;
  workerHeartbeatAt: string | null;
  nextRetryAt: string | null;
  deadLetterReason: string | null;
  lastWorkerError: string | null;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  completedAt: string | null;
};

export type BatchJobItemRecord = {
  id: string;
  jobId: string;
  userId: string;
  itemIndex: number;
  text: string;
  inputPreview: string;
  voice: string;
  model: string;
  externalId: string | null;
  speaker: string | null;
  startMs: number | null;
  endMs: number | null;
  metadataJson: string | null;
  status: BatchJobItemStatus;
  generationId: string | null;
  audioBase64: string | null;
  audioObjectKey: string | null;
  audioObjectUrl: string | null;
  contentType: string | null;
  outputSeconds: number;
  creditsEstimated: number;
  creditsCharged: number;
  latencyMs: number;
  attemptCount: number;
  lastAttemptAt: string | null;
  nextRetryAt: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
};

export type BatchJobWebhookAttemptRecord = {
  id: string;
  jobId: string;
  userId: string;
  webhookUrl: string;
  eventType: string;
  deliveryStatus: BatchJobWebhookDeliveryStatus;
  httpStatus: number | null;
  responsePreview: string | null;
  errorMessage: string | null;
  latencyMs: number;
  createdAt: string;
};

export type PaymentOrderRecord = {
  id: string;
  userId: string;
  planId: PaymentPlanId;
  planName: string;
  quantity: number;
  unitPriceCents: number;
  totalPriceCents: number;
  tokens: number;
  paymentMethod: "khqr";
  status: PaymentOrderStatus;
  userNote: string | null;
  paymentReference: string | null;
  proofImageDataUrl: string | null;
  khqrPayload: string | null;
  khqrMd5: string | null;
  khqrImageDataUrl: string | null;
  khqrCurrency: "USD" | "KHR" | null;
  khqrAmount: number | null;
  khqrExpiresAt: string | null;
  paymentProvider: PaymentProvider | null;
  providerTransactionId: string | null;
  providerReference: string | null;
  providerApprovalCode: string | null;
  providerStatusCode: string | null;
  providerStatus: string | null;
  providerAmount: number | null;
  providerCurrency: "USD" | "KHR" | null;
  providerPayload: string | null;
  paidAt: string | null;
  adminNote: string | null;
  tokenTransactionId: string | null;
  createdAt: string;
  updatedAt: string;
  approvedAt: string | null;
  approvedByUserId: string | null;
  rejectedAt: string | null;
  rejectedByUserId: string | null;
  expiredAt: string | null;
};

export type PaymentWebhookEventRecord = {
  id: string;
  provider: PaymentWebhookProvider;
  orderId: string | null;
  paymentOrderId: string | null;
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
  createdAt: string;
};

export type TelegramPaymentEventRecord = {
  id: string;
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
  createdAt: string;
  updatedAt: string;
};

export type TelegramPaymentActionRecord = {
  id: string;
  orderId: string | null;
  action: TelegramPaymentActionType;
  status: TelegramPaymentActionStatus;
  reason: string | null;
  telegramUserId: string | null;
  telegramUsername: string | null;
  telegramFirstName: string | null;
  telegramLastName: string | null;
  callbackQueryId: string | null;
  messageChatId: string | null;
  messageId: string | null;
  createdAt: string;
};

export type PaymentSupportTicketRecord = {
  id: string;
  userId: string;
  paymentOrderId: string;
  status: PaymentSupportTicketStatus;
  userMessage: string;
  adminNote: string | null;
  resolvedByUserId: string | null;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
};

export type BusinessApiRequestRecord = {
  id: string;
  userId: string;
  companyName: string;
  appName: string;
  useCase: string;
  expectedMonthlyTokens: number;
  expectedPeakConcurrency: number;
  webhookUrl: string | null;
  contactTelegram: string | null;
  contactEmail: string;
  status: BusinessApiRequestStatus;
  salesStage: BusinessSalesStage;
  salesNote: string | null;
  followUpAt: string | null;
  lastContactedAt: string | null;
  adminNote: string | null;
  appliedDailyTokenLimit: number | null;
  appliedMonthlyTokenLimit: number | null;
  appliedMaxConcurrentRequests: number | null;
  appliedMaxConcurrentJobs: number | null;
  appliedMaxQueuedJobs: number | null;
  appliedCloneCreditRate: number | null;
  reviewedByUserId: string | null;
  createdAt: string;
  updatedAt: string;
  reviewedAt: string | null;
};

export type WebhookTestEventRecord = {
  id: string;
  userId: string;
  webhookUrl: string;
  eventType: WebhookTestEventType;
  deliveryStatus: WebhookTestDeliveryStatus;
  httpStatus: number | null;
  responsePreview: string | null;
  errorMessage: string | null;
  latencyMs: number;
  createdAt: string;
};

export type WorkerHeartbeatRecord = {
  id: string;
  workerId: string;
  status: WorkerHeartbeatStatus;
  lastSeenAt: string;
  currentJobId: string | null;
  processedJobId: string | null;
  processedItemCount: number;
  queueDepth: number;
  runningJobs: number;
  stuckJobs: number;
  needsReviewJobs: number;
  upstreamLatencyMs: number | null;
  upstreamOk: boolean | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AdminCustomerSummary = {
  user: UserRecord;
  tokenBalance: number;
  totalCreditsEarned: number;
  totalGenerations: number;
  apiRequests: number;
  paymentOrders: number;
  activeApiKeys: number;
  lastActivityAt: string | null;
};

export type AdminCustomerDetail = AdminCustomerSummary & {
  tokenTransactions: TokenTransactionRecord[];
  apiKeys: ApiKeyRecord[];
  generations: GenerationRecord[];
  batchJobs: BatchJobRecord[];
  paymentOrdersList: PaymentOrderRecord[];
  webhookEvents: PaymentWebhookEventRecord[];
};

export type UserVoiceRecord = {
  id: string;
  userId: string;
  name: string;
  description: string | null;
  fileName: string;
  mimeType: string;
  fileSize: number;
  audioBase64: string;
  createdAt: string;
  updatedAt: string;
};

export type DataStore = {
  schemaVersion: number;
  users: UserRecord[];
  apiKeys: ApiKeyRecord[];
  tokenTransactions: TokenTransactionRecord[];
  generations: GenerationRecord[];
  batchJobs: BatchJobRecord[];
  batchJobItems: BatchJobItemRecord[];
  batchJobWebhookAttempts: BatchJobWebhookAttemptRecord[];
  paymentOrders: PaymentOrderRecord[];
  paymentWebhookEvents: PaymentWebhookEventRecord[];
  telegramPaymentEvents: TelegramPaymentEventRecord[];
  telegramPaymentActions: TelegramPaymentActionRecord[];
  paymentSupportTickets: PaymentSupportTicketRecord[];
  businessApiRequests: BusinessApiRequestRecord[];
  webhookTestEvents: WebhookTestEventRecord[];
  workerHeartbeats: WorkerHeartbeatRecord[];
  userVoices: UserVoiceRecord[];
  apiErrors: ApiErrorRecord[];
  systemSettings?: SystemSettingRecord[];
};

export type SystemSettingRecord = {
  key: string;
  value: string;
  updatedAt: string;
};
