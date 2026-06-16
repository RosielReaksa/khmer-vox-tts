import { createHash, randomUUID } from "node:crypto";
import { Pool, type PoolClient, type QueryResultRow } from "pg";
import "server-only";

import type {
  AdminCustomerDetail,
  AdminCustomerSummary,
  ApiKeyRecord,
  BatchJobItemRecord,
  BatchJobItemStatus,
  BatchJobRecord,
  BatchJobStatus,
  BatchJobWebhookAttemptRecord,
  BatchJobWebhookDeliveryStatus,
  BusinessApiRequestRecord,
  BusinessSalesStage,
  BusinessApiRequestStatus,
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
  TelegramPaymentActionRecord,
  TelegramPaymentActionStatus,
  TelegramPaymentActionType,
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

export type ApiErrorWithUser = ApiErrorRecord & {
  userEmail: string | null;
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

const SCHEMA_SQL = `
create table if not exists users (
  id text primary key,
  email text not null unique,
  password_hash text,
  google_id text unique,
  display_name text,
  avatar_url text,
  suspended_at timestamptz,
  suspended_reason text,
  suspended_by_user_id text references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists api_keys (
  id text primary key,
  user_id text not null references users(id) on delete cascade,
  name text not null,
  key_prefix text not null,
  key_hash text not null unique,
  daily_token_limit integer,
  monthly_token_limit integer,
  max_concurrent_requests integer,
  max_concurrent_jobs integer,
  max_queued_jobs integer,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);

create index if not exists api_keys_user_id_idx on api_keys(user_id);
create index if not exists api_keys_user_revoked_created_idx
  on api_keys(user_id, revoked_at, created_at desc);

create table if not exists token_transactions (
  id text primary key,
  user_id text not null references users(id) on delete cascade,
  amount integer not null,
  type text not null check (
    type in ('signup_bonus', 'purchase', 'usage', 'refund', 'admin_adjustment')
  ),
  note text,
  created_at timestamptz not null default now()
);

create index if not exists token_transactions_user_created_idx
  on token_transactions(user_id, created_at desc);
create index if not exists token_transactions_user_positive_amount_idx
  on token_transactions(user_id, amount) where amount > 0;

create table if not exists generations (
  id text primary key,
  user_id text not null references users(id) on delete cascade,
  api_key_id text references api_keys(id) on delete set null,
  mode text not null check (mode in ('tts', 'clone')),
  source text not null check (source in ('dashboard', 'api_key')),
  status text not null check (status in ('processing', 'success', 'failed')),
  model text not null,
  voice text not null,
  input_chars integer not null,
  input_preview text not null,
  output_seconds integer not null,
  credits_requested integer not null,
  credits_charged integer not null,
  latency_ms integer not null,
  error_message text,
  audio_base64 text,
  audio_object_key text,
  audio_object_url text,
  content_type text,
  created_at timestamptz not null default now()
);

create index if not exists generations_user_created_idx on generations(user_id, created_at desc);
create index if not exists generations_user_source_mode_created_idx
  on generations(user_id, source, mode, created_at desc);
create index if not exists generations_user_status_mode_created_idx
  on generations(user_id, status, mode, created_at desc);
create index if not exists generations_admin_status_created_idx
  on generations(status, created_at desc);
create index if not exists generations_api_key_created_idx on generations(api_key_id, created_at desc);

create table if not exists api_errors (
  id text primary key,
  user_id text references users(id) on delete set null,
  api_key_id text references api_keys(id) on delete set null,
  source text not null check (source in ('dashboard', 'api_key')),
  endpoint text not null,
  method text not null,
  status_code integer not null,
  error_code text,
  error_message text not null,
  input_preview text,
  request_params text,
  ip_address text,
  user_agent text,
  created_at timestamptz not null default now()
);
create index if not exists api_errors_created_idx on api_errors(created_at desc);
create index if not exists api_errors_status_created_idx on api_errors(status_code, created_at desc);
create index if not exists api_errors_user_created_idx on api_errors(user_id, created_at desc);

create table if not exists batch_jobs (
  id text primary key,
  user_id text not null references users(id) on delete cascade,
  api_key_id text references api_keys(id) on delete set null,
  mode text not null check (mode in ('tts', 'clone')),
  source text not null check (source in ('dashboard', 'api_key')),
  status text not null check (status in ('queued', 'running', 'completed', 'partial', 'failed', 'needs_review')),
  title text not null,
  voice text not null,
  model text not null,
  external_id text,
  metadata_json text,
  total_items integer not null check (total_items >= 0),
  completed_items integer not null default 0,
  failed_items integer not null default 0,
  total_input_chars integer not null default 0,
  credits_estimated integer not null default 0,
  credits_charged integer not null default 0,
  output_seconds integer not null default 0,
  error_message text,
  clone_sample_base64 text,
  clone_sample_mime_type text,
  clone_sample_file_name text,
  clone_consent_at timestamptz,
  clone_consent_text text,
  webhook_callback_url text,
  webhook_status text check (webhook_status in ('pending', 'delivered', 'failed')),
  webhook_attempts integer not null default 0,
  webhook_last_error text,
  webhook_last_attempt_at timestamptz,
  worker_attempt_count integer not null default 0,
  last_worker_id text,
  worker_heartbeat_at timestamptz,
  next_retry_at timestamptz,
  dead_letter_reason text,
  last_worker_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz
);

create index if not exists batch_jobs_user_created_idx on batch_jobs(user_id, created_at desc);
create index if not exists batch_jobs_user_updated_idx on batch_jobs(user_id, updated_at desc);
create index if not exists batch_jobs_status_created_idx on batch_jobs(status, created_at desc);
create index if not exists batch_jobs_queued_retry_created_idx
  on batch_jobs(next_retry_at, created_at)
  where status = 'queued';
create index if not exists batch_jobs_running_api_key_idx
  on batch_jobs(api_key_id)
  where status = 'running';
create index if not exists batch_jobs_running_heartbeat_idx
  on batch_jobs(worker_heartbeat_at)
  where status = 'running';
create index if not exists batch_jobs_api_key_status_idx on batch_jobs(api_key_id, status, created_at desc);

create table if not exists batch_job_items (
  id text primary key,
  job_id text not null references batch_jobs(id) on delete cascade,
  user_id text not null references users(id) on delete cascade,
  item_index integer not null,
  text text not null,
  input_preview text not null,
  voice text not null,
  model text not null,
  external_id text,
  speaker text,
  start_ms integer,
  end_ms integer,
  metadata_json text,
  status text not null check (status in ('queued', 'running', 'success', 'failed')),
  generation_id text references generations(id) on delete set null,
  audio_base64 text,
  audio_object_key text,
  audio_object_url text,
  content_type text,
  output_seconds integer not null default 0,
  credits_estimated integer not null default 0,
  credits_charged integer not null default 0,
  latency_ms integer not null default 0,
  attempt_count integer not null default 0,
  last_attempt_at timestamptz,
  next_retry_at timestamptz,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists batch_job_items_job_index_idx on batch_job_items(job_id, item_index);
create index if not exists batch_job_items_user_created_idx on batch_job_items(user_id, created_at desc);

create table if not exists batch_job_webhook_attempts (
  id text primary key,
  job_id text not null references batch_jobs(id) on delete cascade,
  user_id text not null references users(id) on delete cascade,
  webhook_url text not null,
  event_type text not null,
  delivery_status text not null check (delivery_status in ('delivered', 'failed')),
  http_status integer,
  response_preview text,
  error_message text,
  latency_ms integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists batch_job_webhook_attempts_job_created_idx
  on batch_job_webhook_attempts(job_id, created_at desc);
create index if not exists batch_job_webhook_attempts_user_created_idx
  on batch_job_webhook_attempts(user_id, created_at desc);
create index if not exists batch_job_webhook_attempts_status_created_idx
  on batch_job_webhook_attempts(delivery_status, created_at desc);

create table if not exists payment_orders (
  id text primary key,
  user_id text not null references users(id) on delete cascade,
  plan_id text not null check (plan_id in ('starter', 'creator', 'pro', 'pack_5', 'pack_10', 'pack_15', 'pack_20')),
  plan_name text not null,
  quantity integer not null check (quantity > 0),
  unit_price_cents integer not null check (unit_price_cents >= 0),
  total_price_cents integer not null check (total_price_cents >= 0),
  tokens integer not null check (tokens > 0),
  payment_method text not null default 'khqr' check (payment_method in ('khqr')),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'expired', 'cancelled')),
  user_note text,
  payment_reference text,
  proof_image_data_url text,
  khqr_payload text,
  khqr_md5 text,
  khqr_image_data_url text,
  khqr_currency text check (khqr_currency in ('USD', 'KHR')),
  khqr_amount numeric,
  khqr_expires_at timestamptz,
  payment_provider text,
  provider_transaction_id text,
  provider_reference text,
  provider_approval_code text,
  provider_status_code text,
  provider_status text,
  provider_amount numeric,
  provider_currency text check (provider_currency in ('USD', 'KHR')),
  provider_payload text,
  paid_at timestamptz,
  admin_note text,
  token_transaction_id text references token_transactions(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  approved_at timestamptz,
  approved_by_user_id text references users(id) on delete set null,
  rejected_at timestamptz,
  rejected_by_user_id text references users(id) on delete set null,
  expired_at timestamptz
);

create index if not exists payment_orders_user_created_idx on payment_orders(user_id, created_at desc);
create index if not exists payment_orders_user_updated_idx on payment_orders(user_id, updated_at desc);
create index if not exists payment_orders_status_created_idx on payment_orders(status, created_at desc);
create index if not exists payment_orders_pending_expires_idx on payment_orders(khqr_expires_at) where status = 'pending' and khqr_expires_at is not null;
create unique index if not exists payment_orders_provider_transaction_unique
  on payment_orders(provider_transaction_id)
  where provider_transaction_id is not null;

do $$
begin
  if exists (
    select 1
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'payment_orders'
      and c.conname = 'payment_orders_plan_id_check'
  ) then
    alter table payment_orders drop constraint payment_orders_plan_id_check;
    alter table payment_orders add constraint payment_orders_plan_id_check
      check (plan_id in ('starter', 'creator', 'pro', 'pack_5', 'pack_10', 'pack_15', 'pack_20'));
  elsif not exists (
    select 1
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'payment_orders'
      and c.conname = 'payment_orders_plan_id_check'
  ) then
    alter table payment_orders add constraint payment_orders_plan_id_check
      check (plan_id in ('starter', 'creator', 'pro', 'pack_5', 'pack_10', 'pack_15', 'pack_20'));
  end if;
end $$;

create table if not exists payment_webhook_events (
  id text primary key,
  provider text not null check (provider in ('payway', 'khqrcc')),
  order_id text,
  payment_order_id text references payment_orders(id) on delete set null,
  event_status text not null check (event_status in ('credited', 'not_credited', 'invalid', 'error')),
  reason text,
  signature_valid boolean not null default false,
  signature_configured boolean not null default false,
  provider_transaction_id text,
  provider_reference text,
  provider_approval_code text,
  provider_status_code text,
  provider_status text,
  provider_amount numeric,
  provider_currency text check (provider_currency in ('USD', 'KHR')),
  provider_payload text,
  raw_body text,
  created_at timestamptz not null default now()
);

create index if not exists payment_webhook_events_created_idx
  on payment_webhook_events(created_at desc);
create index if not exists payment_webhook_events_order_idx
  on payment_webhook_events(order_id, created_at desc);
create index if not exists payment_webhook_events_payment_order_idx
  on payment_webhook_events(payment_order_id, created_at desc);
create index if not exists payment_webhook_events_status_idx
  on payment_webhook_events(event_status, created_at desc);

do $$
begin
  if exists (
    select 1
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'payment_webhook_events'
      and c.conname = 'payment_webhook_events_provider_check'
  ) then
    alter table payment_webhook_events drop constraint payment_webhook_events_provider_check;
    alter table payment_webhook_events add constraint payment_webhook_events_provider_check
      check (provider in ('payway', 'khqrcc'));
  elsif not exists (
    select 1
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'payment_webhook_events'
      and c.conname = 'payment_webhook_events_provider_check'
  ) then
    alter table payment_webhook_events add constraint payment_webhook_events_provider_check
      check (provider in ('payway', 'khqrcc'));
  end if;
end $$;

create table if not exists telegram_payment_events (
  id text primary key,
  telegram_update_id bigint unique,
  telegram_message_id bigint,
  chat_id text,
  chat_title text,
  sender_id text,
  sender_username text,
  sender_name text,
  sender_is_bot boolean not null default false,
  raw_text text,
  raw_payload text not null,
  parsed_status text,
  parsed_amount numeric,
  parsed_currency text check (parsed_currency in ('USD', 'KHR')),
  parsed_transaction_id text,
  parsed_reference text,
  matched_order_id text references payment_orders(id) on delete set null,
  decision_status text not null check (
    decision_status in (
      'ready_to_approve',
      'auto_approved',
      'manual_approved',
      'needs_review',
      'ignored',
      'duplicate',
      'error'
    )
  ),
  decision_reason text,
  auto_approve_attempted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists telegram_payment_events_created_idx
  on telegram_payment_events(created_at desc);
create index if not exists telegram_payment_events_decision_idx
  on telegram_payment_events(decision_status, created_at desc);
create index if not exists telegram_payment_events_order_idx
  on telegram_payment_events(matched_order_id, created_at desc);
create index if not exists telegram_payment_events_transaction_idx
  on telegram_payment_events(parsed_transaction_id)
  where parsed_transaction_id is not null;

create table if not exists telegram_payment_actions (
  id text primary key,
  order_id text references payment_orders(id) on delete set null,
  action text not null check (action in ('approve')),
  status text not null check (status in ('success', 'failed', 'forbidden', 'expired', 'invalid', 'already_decided')),
  reason text,
  telegram_user_id text,
  telegram_username text,
  telegram_first_name text,
  telegram_last_name text,
  callback_query_id text,
  message_chat_id text,
  message_id text,
  created_at timestamptz not null default now()
);

create index if not exists telegram_payment_actions_order_created_idx
  on telegram_payment_actions(order_id, created_at desc);
create index if not exists telegram_payment_actions_user_created_idx
  on telegram_payment_actions(telegram_user_id, created_at desc);

create table if not exists payment_support_tickets (
  id text primary key,
  user_id text not null references users(id) on delete cascade,
  payment_order_id text not null references payment_orders(id) on delete cascade,
  status text not null check (status in ('open', 'resolved')),
  user_message text not null,
  admin_note text,
  resolved_by_user_id text references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists payment_support_tickets_user_created_idx
  on payment_support_tickets(user_id, created_at desc);
create index if not exists payment_support_tickets_status_created_idx
  on payment_support_tickets(status, created_at desc);
create index if not exists payment_support_tickets_order_idx
  on payment_support_tickets(payment_order_id, created_at desc);

create table if not exists business_api_requests (
  id text primary key,
  user_id text not null references users(id) on delete cascade,
  company_name text not null,
  app_name text not null,
  use_case text not null,
  expected_monthly_tokens integer not null,
  expected_peak_concurrency integer not null,
  webhook_url text,
  contact_telegram text,
  contact_email text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  sales_stage text not null default 'new' check (sales_stage in ('new', 'contacted', 'qualified', 'proposal', 'won', 'lost')),
  sales_note text,
  follow_up_at timestamptz,
  last_contacted_at timestamptz,
  admin_note text,
  applied_daily_token_limit integer,
  applied_monthly_token_limit integer,
  applied_max_concurrent_requests integer,
  applied_max_concurrent_jobs integer,
  applied_max_queued_jobs integer,
  applied_clone_credit_rate numeric,
  reviewed_by_user_id text references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  reviewed_at timestamptz
);

create index if not exists business_api_requests_user_created_idx
  on business_api_requests(user_id, created_at desc);
create index if not exists business_api_requests_status_created_idx
  on business_api_requests(status, created_at desc);

create table if not exists webhook_test_events (
  id text primary key,
  user_id text not null references users(id) on delete cascade,
  webhook_url text not null,
  event_type text not null check (event_type in ('completed', 'failed')),
  delivery_status text not null check (delivery_status in ('delivered', 'failed')),
  http_status integer,
  response_preview text,
  error_message text,
  latency_ms integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists webhook_test_events_user_created_idx
  on webhook_test_events(user_id, created_at desc);

create table if not exists worker_heartbeats (
  id text primary key,
  worker_id text not null unique,
  status text not null check (status in ('online', 'idle', 'busy', 'stuck', 'error')),
  last_seen_at timestamptz not null,
  current_job_id text,
  processed_job_id text,
  processed_item_count integer not null default 0,
  queue_depth integer not null default 0,
  running_jobs integer not null default 0,
  stuck_jobs integer not null default 0,
  needs_review_jobs integer not null default 0,
  upstream_latency_ms integer,
  upstream_ok boolean,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists worker_heartbeats_last_seen_idx
  on worker_heartbeats(last_seen_at desc);

create table if not exists rate_limit_buckets (
  bucket_key text primary key,
  request_count integer not null default 0,
  reset_at timestamptz not null,
  updated_at timestamptz not null default now()
);

create index if not exists rate_limit_buckets_reset_idx on rate_limit_buckets(reset_at);

create table if not exists rate_limit_leases (
  id text primary key,
  bucket_key text not null references rate_limit_buckets(bucket_key) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists rate_limit_leases_bucket_expires_idx
  on rate_limit_leases(bucket_key, expires_at);

alter table api_keys add column if not exists daily_token_limit integer;
alter table api_keys add column if not exists monthly_token_limit integer;
alter table api_keys add column if not exists max_concurrent_requests integer;
alter table api_keys add column if not exists max_concurrent_jobs integer;
alter table api_keys add column if not exists max_queued_jobs integer;
alter table generations add column if not exists audio_base64 text;
alter table generations add column if not exists audio_object_key text;
alter table generations add column if not exists audio_object_url text;
alter table generations add column if not exists content_type text;
-- Links per-chunk segment records to their parent dashboard job so they can be
-- hidden from History in favour of a single merged full-audio record.
alter table generations add column if not exists segment_of_job_id text;
create index if not exists generations_segment_of_job_idx
  on generations(segment_of_job_id) where segment_of_job_id is not null;
alter table batch_jobs add column if not exists clone_sample_base64 text;
alter table batch_jobs add column if not exists clone_sample_mime_type text;
alter table batch_jobs add column if not exists clone_sample_file_name text;
alter table batch_jobs add column if not exists clone_consent_at timestamptz;
alter table batch_jobs add column if not exists clone_consent_text text;
alter table batch_jobs add column if not exists webhook_callback_url text;
alter table batch_jobs add column if not exists webhook_status text;
alter table batch_jobs add column if not exists webhook_attempts integer not null default 0;
alter table batch_jobs add column if not exists webhook_last_error text;
alter table batch_jobs add column if not exists webhook_last_attempt_at timestamptz;
alter table batch_jobs add column if not exists worker_attempt_count integer not null default 0;
alter table batch_jobs add column if not exists last_worker_id text;
alter table batch_jobs add column if not exists worker_heartbeat_at timestamptz;
alter table batch_jobs add column if not exists next_retry_at timestamptz;
alter table batch_jobs add column if not exists dead_letter_reason text;
alter table batch_jobs add column if not exists last_worker_error text;
alter table batch_jobs add column if not exists external_id text;
alter table batch_jobs add column if not exists metadata_json text;
alter table batch_job_items add column if not exists external_id text;
alter table batch_job_items add column if not exists speaker text;
alter table batch_job_items add column if not exists start_ms integer;
alter table batch_job_items add column if not exists end_ms integer;
alter table batch_job_items add column if not exists metadata_json text;
alter table batch_job_items add column if not exists audio_object_key text;
alter table batch_job_items add column if not exists audio_object_url text;
alter table batch_job_items add column if not exists attempt_count integer not null default 0;
alter table batch_job_items add column if not exists last_attempt_at timestamptz;
alter table batch_job_items add column if not exists next_retry_at timestamptz;
create index if not exists batch_jobs_user_external_idx on batch_jobs(user_id, external_id) where external_id is not null;
alter table payment_orders add column if not exists payment_reference text;
alter table payment_orders add column if not exists proof_image_data_url text;
alter table payment_orders add column if not exists khqr_payload text;
alter table payment_orders add column if not exists khqr_md5 text;
alter table payment_orders add column if not exists khqr_image_data_url text;
alter table payment_orders add column if not exists khqr_currency text;
alter table payment_orders add column if not exists khqr_amount numeric;
alter table payment_orders add column if not exists khqr_expires_at timestamptz;
alter table payment_orders add column if not exists payment_provider text;
alter table payment_orders add column if not exists provider_transaction_id text;
alter table payment_orders add column if not exists provider_reference text;
alter table payment_orders add column if not exists provider_approval_code text;
alter table payment_orders add column if not exists provider_status_code text;
alter table payment_orders add column if not exists provider_status text;
alter table payment_orders add column if not exists provider_amount numeric;
alter table payment_orders add column if not exists provider_currency text;
alter table payment_orders add column if not exists provider_payload text;
alter table payment_orders add column if not exists paid_at timestamptz;
alter table payment_orders add column if not exists expired_at timestamptz;
alter table users add column if not exists suspended_at timestamptz;
alter table users add column if not exists suspended_reason text;
alter table users add column if not exists suspended_by_user_id text references users(id) on delete set null;
create index if not exists users_suspended_at_idx on users(suspended_at);
alter table users add column if not exists google_id text;
alter table users add column if not exists display_name text;
alter table users add column if not exists avatar_url text;
alter table users alter column password_hash drop not null;
create unique index if not exists users_google_id_key on users(google_id) where google_id is not null;
alter table business_api_requests add column if not exists applied_daily_token_limit integer;
alter table business_api_requests add column if not exists applied_monthly_token_limit integer;
alter table business_api_requests add column if not exists applied_max_concurrent_requests integer;
alter table business_api_requests add column if not exists applied_max_concurrent_jobs integer;
alter table business_api_requests add column if not exists applied_max_queued_jobs integer;
alter table business_api_requests add column if not exists applied_clone_credit_rate numeric;
alter table business_api_requests add column if not exists sales_stage text not null default 'new';
alter table business_api_requests add column if not exists sales_note text;
alter table business_api_requests add column if not exists follow_up_at timestamptz;
alter table business_api_requests add column if not exists last_contacted_at timestamptz;
create index if not exists business_api_requests_sales_stage_created_idx
  on business_api_requests(sales_stage, created_at desc);
create index if not exists business_api_requests_follow_up_idx
  on business_api_requests(follow_up_at)
  where follow_up_at is not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'business_api_requests'
      and c.conname = 'business_api_requests_sales_stage_check'
  ) then
    alter table business_api_requests add constraint business_api_requests_sales_stage_check
      check (sales_stage in ('new', 'contacted', 'qualified', 'proposal', 'won', 'lost'));
  end if;
end $$;

do $$
begin
  if exists (
    select 1
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'batch_jobs'
      and c.conname = 'batch_jobs_status_check'
      and pg_get_constraintdef(c.oid) not like '%needs_review%'
  ) then
    alter table batch_jobs drop constraint batch_jobs_status_check;
    alter table batch_jobs add constraint batch_jobs_status_check
      check (status in ('queued', 'running', 'completed', 'partial', 'failed', 'needs_review'));
  elsif not exists (
    select 1
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'batch_jobs'
      and c.conname = 'batch_jobs_status_check'
  ) then
    alter table batch_jobs add constraint batch_jobs_status_check
      check (status in ('queued', 'running', 'completed', 'partial', 'failed', 'needs_review'));
  end if;
end $$;

do $$
begin
  if exists (
    select 1
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'generations'
      and c.conname = 'generations_status_check'
      and pg_get_constraintdef(c.oid) not like '%processing%'
  ) then
    alter table generations drop constraint generations_status_check;
    alter table generations add constraint generations_status_check
      check (status in ('processing', 'success', 'failed'));
  elsif not exists (
    select 1
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'generations'
      and c.conname = 'generations_status_check'
  ) then
    alter table generations add constraint generations_status_check
      check (status in ('processing', 'success', 'failed'));
  end if;
end $$;

do $$
begin
  if exists (
    select 1
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'payment_orders'
      and c.conname = 'payment_orders_status_check'
      and pg_get_constraintdef(c.oid) not like '%cancelled%'
  ) then
    alter table payment_orders drop constraint payment_orders_status_check;
    alter table payment_orders add constraint payment_orders_status_check
      check (status in ('pending', 'approved', 'rejected', 'expired', 'cancelled'));
  elsif not exists (
    select 1
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'payment_orders'
      and c.conname = 'payment_orders_status_check'
  ) then
    alter table payment_orders add constraint payment_orders_status_check
      check (status in ('pending', 'approved', 'rejected', 'expired', 'cancelled'));
  end if;
end $$;

create table if not exists user_voices (
  id text primary key,
  user_id text not null references users(id) on delete cascade,
  name text not null,
  description text,
  file_name text not null,
  mime_type text not null,
  file_size integer not null,
  audio_base64 text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_voices_user_name_unique unique (user_id, name)
);

create index if not exists user_voices_user_created_idx on user_voices(user_id, created_at desc);
create index if not exists user_voices_user_name_idx on user_voices(user_id, name);

create table if not exists system_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

insert into system_settings (key, value) values ('admin_active', 'true') on conflict (key) do nothing;
`;

type UserRow = QueryResultRow & {
  id: string;
  email: string;
  password_hash: string | null;
  google_id: string | null;
  display_name: string | null;
  avatar_url: string | null;
  suspended_at: Date | string | null;
  suspended_reason: string | null;
  suspended_by_user_id: string | null;
  created_at: Date | string;
  updated_at: Date | string;
};

type ApiKeyRow = QueryResultRow & {
  id: string;
  user_id: string;
  name: string;
  key_prefix: string;
  key_hash: string;
  daily_token_limit: number | string | null;
  monthly_token_limit: number | string | null;
  max_concurrent_requests: number | string | null;
  max_concurrent_jobs: number | string | null;
  max_queued_jobs: number | string | null;
  created_at: Date | string;
  last_used_at: Date | string | null;
  revoked_at: Date | string | null;
};

type TokenTransactionRow = QueryResultRow & {
  id: string;
  user_id: string;
  amount: number | string;
  type: TokenTransactionType;
  note: string | null;
  created_at: Date | string;
};

type GenerationRow = QueryResultRow & {
  id: string;
  user_id: string;
  api_key_id: string | null;
  mode: GenerationMode;
  source: GenerationSource;
  status: GenerationStatus;
  model: string;
  voice: string;
  input_chars: number | string;
  input_preview: string;
  output_seconds: number | string;
  credits_requested: number | string;
  credits_charged: number | string;
  latency_ms: number | string;
  error_message: string | null;
  audio_base64?: string | null;
  audio_object_key?: string | null;
  audio_object_url?: string | null;
  content_type?: string | null;
  has_audio?: boolean | string | null;
  segment_of_job_id?: string | null;
  created_at: Date | string;
};

type BatchJobRow = QueryResultRow & {
  id: string;
  user_id: string;
  api_key_id: string | null;
  mode: GenerationMode;
  source: GenerationSource;
  status: BatchJobStatus;
  title: string;
  voice: string;
  model: string;
  external_id: string | null;
  metadata_json: string | null;
  total_items: number | string;
  completed_items: number | string;
  failed_items: number | string;
  total_input_chars: number | string;
  credits_estimated: number | string;
  credits_charged: number | string;
  output_seconds: number | string;
  error_message: string | null;
  clone_sample_base64: string | null;
  clone_sample_mime_type: string | null;
  clone_sample_file_name: string | null;
  clone_consent_at: Date | string | null;
  clone_consent_text: string | null;
  webhook_callback_url: string | null;
  webhook_status: BatchJobRecord["webhookStatus"];
  webhook_attempts: number | string;
  webhook_last_error: string | null;
  webhook_last_attempt_at: Date | string | null;
  worker_attempt_count: number | string;
  last_worker_id: string | null;
  worker_heartbeat_at: Date | string | null;
  next_retry_at: Date | string | null;
  dead_letter_reason: string | null;
  last_worker_error: string | null;
  created_at: Date | string;
  updated_at: Date | string;
  started_at: Date | string | null;
  completed_at: Date | string | null;
};

type BatchJobItemRow = QueryResultRow & {
  id: string;
  job_id: string;
  user_id: string;
  item_index: number | string;
  text: string;
  input_preview: string;
  voice: string;
  model: string;
  external_id: string | null;
  speaker: string | null;
  start_ms: number | string | null;
  end_ms: number | string | null;
  metadata_json: string | null;
  status: BatchJobItemStatus;
  generation_id: string | null;
  audio_base64: string | null;
  audio_object_key: string | null;
  audio_object_url: string | null;
  content_type: string | null;
  output_seconds: number | string;
  credits_estimated: number | string;
  credits_charged: number | string;
  latency_ms: number | string;
  attempt_count: number | string;
  last_attempt_at: Date | string | null;
  next_retry_at: Date | string | null;
  error_message: string | null;
  created_at: Date | string;
  updated_at: Date | string;
};

type BatchJobWithUserRow = BatchJobRow & {
  user_email: string | null;
};

type BatchJobWebhookAttemptRow = QueryResultRow & {
  id: string;
  job_id: string;
  user_id: string;
  webhook_url: string;
  event_type: string;
  delivery_status: BatchJobWebhookDeliveryStatus;
  http_status: number | string | null;
  response_preview: string | null;
  error_message: string | null;
  latency_ms: number | string;
  created_at: Date | string;
};

type BatchJobWebhookAttemptWithUserRow = BatchJobWebhookAttemptRow & {
  user_email: string | null;
  job_title: string | null;
  job_status: BatchJobStatus | null;
  external_id: string | null;
};

type PaymentOrderRow = QueryResultRow & {
  id: string;
  user_id: string;
  plan_id: PaymentPlanId;
  plan_name: string;
  quantity: number | string;
  unit_price_cents: number | string;
  total_price_cents: number | string;
  tokens: number | string;
  payment_method: "khqr";
  status: PaymentOrderStatus;
  user_note: string | null;
  payment_reference: string | null;
  proof_image_data_url: string | null;
  khqr_payload: string | null;
  khqr_md5: string | null;
  khqr_image_data_url: string | null;
  khqr_currency: "USD" | "KHR" | null;
  khqr_amount: number | string | null;
  khqr_expires_at: Date | string | null;
  payment_provider: PaymentProvider | null;
  provider_transaction_id: string | null;
  provider_reference: string | null;
  provider_approval_code: string | null;
  provider_status_code: string | null;
  provider_status: string | null;
  provider_amount: number | string | null;
  provider_currency: "USD" | "KHR" | null;
  provider_payload: string | null;
  paid_at: Date | string | null;
  admin_note: string | null;
  token_transaction_id: string | null;
  created_at: Date | string;
  updated_at: Date | string;
  approved_at: Date | string | null;
  approved_by_user_id: string | null;
  rejected_at: Date | string | null;
  rejected_by_user_id: string | null;
  expired_at: Date | string | null;
};

type PaymentOrderWithUserRow = PaymentOrderRow & {
  user_email: string | null;
};

type PaymentWebhookEventRow = QueryResultRow & {
  id: string;
  provider: PaymentWebhookProvider;
  order_id: string | null;
  payment_order_id: string | null;
  event_status: PaymentWebhookEventStatus;
  reason: string | null;
  signature_valid: boolean;
  signature_configured: boolean;
  provider_transaction_id: string | null;
  provider_reference: string | null;
  provider_approval_code: string | null;
  provider_status_code: string | null;
  provider_status: string | null;
  provider_amount: number | string | null;
  provider_currency: "USD" | "KHR" | null;
  provider_payload: string | null;
  raw_body: string | null;
  created_at: Date | string;
};

type PaymentWebhookEventWithOrderRow = PaymentWebhookEventRow & {
  user_email: string | null;
  order_status: PaymentOrderStatus | null;
};

type TelegramPaymentEventRow = QueryResultRow & {
  id: string;
  telegram_update_id: number | string | null;
  telegram_message_id: number | string | null;
  chat_id: string | null;
  chat_title: string | null;
  sender_id: string | null;
  sender_username: string | null;
  sender_name: string | null;
  sender_is_bot: boolean;
  raw_text: string | null;
  raw_payload: string;
  parsed_status: string | null;
  parsed_amount: number | string | null;
  parsed_currency: "USD" | "KHR" | null;
  parsed_transaction_id: string | null;
  parsed_reference: string | null;
  matched_order_id: string | null;
  decision_status: TelegramPaymentEventDecision;
  decision_reason: string | null;
  auto_approve_attempted: boolean;
  created_at: Date | string;
  updated_at: Date | string;
};

type TelegramPaymentEventWithOrderRow = TelegramPaymentEventRow & {
  user_email: string | null;
  order_status: PaymentOrderStatus | null;
};

type TelegramPaymentActionRow = QueryResultRow & {
  id: string;
  order_id: string | null;
  action: TelegramPaymentActionType;
  status: TelegramPaymentActionStatus;
  reason: string | null;
  telegram_user_id: string | null;
  telegram_username: string | null;
  telegram_first_name: string | null;
  telegram_last_name: string | null;
  callback_query_id: string | null;
  message_chat_id: string | null;
  message_id: string | null;
  created_at: Date | string;
};

type PaymentSupportTicketRow = QueryResultRow & {
  id: string;
  user_id: string;
  payment_order_id: string;
  status: PaymentSupportTicketStatus;
  user_message: string;
  admin_note: string | null;
  resolved_by_user_id: string | null;
  created_at: Date | string;
  updated_at: Date | string;
  resolved_at: Date | string | null;
};

type PaymentSupportTicketWithOrderRow = PaymentSupportTicketRow & {
  user_email: string | null;
  order_status: PaymentOrderStatus | null;
  plan_name: string | null;
  quantity: number | string | null;
  total_price_cents: number | string | null;
  tokens: number | string | null;
};

type BusinessApiRequestRow = QueryResultRow & {
  id: string;
  user_id: string;
  company_name: string;
  app_name: string;
  use_case: string;
  expected_monthly_tokens: number | string;
  expected_peak_concurrency: number | string;
  webhook_url: string | null;
  contact_telegram: string | null;
  contact_email: string;
  status: BusinessApiRequestStatus;
  sales_stage: BusinessSalesStage;
  sales_note: string | null;
  follow_up_at: Date | string | null;
  last_contacted_at: Date | string | null;
  admin_note: string | null;
  applied_daily_token_limit: number | string | null;
  applied_monthly_token_limit: number | string | null;
  applied_max_concurrent_requests: number | string | null;
  applied_max_concurrent_jobs: number | string | null;
  applied_max_queued_jobs: number | string | null;
  applied_clone_credit_rate: number | string | null;
  reviewed_by_user_id: string | null;
  created_at: Date | string;
  updated_at: Date | string;
  reviewed_at: Date | string | null;
};

type BusinessApiRequestWithUserRow = BusinessApiRequestRow & {
  user_email: string | null;
};

type WebhookTestEventRow = QueryResultRow & {
  id: string;
  user_id: string;
  webhook_url: string;
  event_type: WebhookTestEventType;
  delivery_status: WebhookTestDeliveryStatus;
  http_status: number | string | null;
  response_preview: string | null;
  error_message: string | null;
  latency_ms: number | string;
  created_at: Date | string;
};

type WorkerHeartbeatRow = QueryResultRow & {
  id: string;
  worker_id: string;
  status: WorkerHeartbeatStatus;
  last_seen_at: Date | string;
  current_job_id: string | null;
  processed_job_id: string | null;
  processed_item_count: number | string;
  queue_depth: number | string;
  running_jobs: number | string;
  stuck_jobs: number | string;
  needs_review_jobs: number | string;
  upstream_latency_ms: number | string | null;
  upstream_ok: boolean | null;
  last_error: string | null;
  created_at: Date | string;
  updated_at: Date | string;
};

type UserVoiceRow = QueryResultRow & {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  file_name: string;
  mime_type: string;
  file_size: number | string;
  audio_base64: string;
  created_at: Date | string;
  updated_at: Date | string;
};

type GenerationWithUserRow = GenerationRow & {
  user_email: string | null;
};

type AdminCustomerSummaryRow = UserRow & {
  token_balance: number | string;
  total_credits_earned: number | string;
  total_generations: number | string;
  api_requests: number | string;
  payment_orders: number | string;
  active_api_keys: number | string;
  last_activity_at: Date | string | null;
};

const SCHEMA_LOCK_KEYS: [number, number] = [927514, 20317];

let pool: Pool | null = null;
let schemaReady = false;
let schemaReadyPromise: Promise<void> | null = null;

function databaseUrl(): string {
  const raw = process.env.DATABASE_URL?.trim().replace(/^"|"$/g, "") ?? "";
  if (!raw.startsWith("postgres://") && !raw.startsWith("postgresql://")) {
    throw new Error("Postgres store requires DATABASE_URL to be a postgres URL.");
  }
  return raw;
}

function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: databaseUrl(),
      max: Number(process.env.DATABASE_POOL_MAX ?? 10),
      ssl: process.env.DATABASE_SSL === "false" ? false : { rejectUnauthorized: false },
    });
  }
  return pool;
}

async function initializeSchema(): Promise<void> {
  const client = await getPool().connect();
  try {
    await client.query("begin");
    try {
      await client.query("select pg_advisory_xact_lock($1, $2)", SCHEMA_LOCK_KEYS);
      await client.query(SCHEMA_SQL);
      await client.query("commit");
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      throw error;
    }
  } finally {
    client.release();
  }
}

async function ensureSchema(): Promise<void> {
  if (schemaReady) return;

  schemaReadyPromise ??= initializeSchema()
    .then(() => {
      schemaReady = true;
    })
    .catch((error: unknown) => {
      schemaReadyPromise = null;
      throw error;
    });

  return schemaReadyPromise;
}

async function queryRows<T extends QueryResultRow>(text: string, params: unknown[] = []): Promise<T[]> {
  await ensureSchema();
  const result = await getPool().query<T>(text, params);
  return result.rows;
}

async function withTransaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
  await ensureSchema();
  const client = await getPool().connect();
  try {
    await client.query("begin");
    const result = await callback(client);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

function normalizeEmail(input: string): string {
  return input.trim().toLowerCase();
}

function iso(input: Date | string): string {
  return input instanceof Date ? input.toISOString() : new Date(input).toISOString();
}

function nullableIso(input: Date | string | null): string | null {
  return input === null ? null : iso(input);
}

function toNumber(input: number | string | null | undefined): number {
  return Number(input ?? 0);
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

function mapUser(row: UserRow): UserRecord {
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.password_hash,
    googleId: row.google_id,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    suspendedAt: nullableIso(row.suspended_at),
    suspendedReason: row.suspended_reason,
    suspendedByUserId: row.suspended_by_user_id,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

function mapApiKey(row: ApiKeyRow): ApiKeyRecord {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    keyPrefix: row.key_prefix,
    keyHash: row.key_hash,
    dailyTokenLimit: row.daily_token_limit === null ? null : toNumber(row.daily_token_limit),
    monthlyTokenLimit: row.monthly_token_limit === null ? null : toNumber(row.monthly_token_limit),
    maxConcurrentRequests: row.max_concurrent_requests === null ? null : toNumber(row.max_concurrent_requests),
    maxConcurrentJobs: row.max_concurrent_jobs === null ? null : toNumber(row.max_concurrent_jobs),
    maxQueuedJobs: row.max_queued_jobs === null ? null : toNumber(row.max_queued_jobs),
    createdAt: iso(row.created_at),
    lastUsedAt: nullableIso(row.last_used_at),
    revokedAt: nullableIso(row.revoked_at),
  };
}

function mapTokenTransaction(row: TokenTransactionRow): TokenTransactionRecord {
  return {
    id: row.id,
    userId: row.user_id,
    amount: toNumber(row.amount),
    type: row.type,
    note: row.note,
    createdAt: iso(row.created_at),
  };
}

function mapGeneration(row: GenerationRow): GenerationRecord {
  return {
    id: row.id,
    userId: row.user_id,
    apiKeyId: row.api_key_id,
    mode: row.mode,
    source: row.source,
    status: row.status,
    model: row.model,
    voice: row.voice,
    inputChars: toNumber(row.input_chars),
    inputPreview: row.input_preview,
    outputSeconds: toNumber(row.output_seconds),
    creditsRequested: toNumber(row.credits_requested),
    creditsCharged: toNumber(row.credits_charged),
    latencyMs: toNumber(row.latency_ms),
    errorMessage: row.error_message,
    audioBase64: row.audio_base64 ?? null,
    audioObjectKey: row.audio_object_key ?? null,
    audioObjectUrl: row.audio_object_url ?? null,
    contentType: row.content_type ?? null,
    hasAudio: row.has_audio === true || row.has_audio === "true" || Boolean(row.audio_base64 || row.audio_object_key),
    segmentOfJobId: row.segment_of_job_id ?? null,
    createdAt: iso(row.created_at),
  };
}

function mapBatchJob(row: BatchJobRow): BatchJobRecord {
  return {
    id: row.id,
    userId: row.user_id,
    apiKeyId: row.api_key_id,
    mode: row.mode,
    source: row.source,
    status: row.status,
    title: row.title,
    voice: row.voice,
    model: row.model,
    externalId: row.external_id,
    metadataJson: row.metadata_json,
    totalItems: toNumber(row.total_items),
    completedItems: toNumber(row.completed_items),
    failedItems: toNumber(row.failed_items),
    totalInputChars: toNumber(row.total_input_chars),
    creditsEstimated: toNumber(row.credits_estimated),
    creditsCharged: toNumber(row.credits_charged),
    outputSeconds: toNumber(row.output_seconds),
    errorMessage: row.error_message,
    cloneSampleBase64: row.clone_sample_base64,
    cloneSampleMimeType: row.clone_sample_mime_type,
    cloneSampleFileName: row.clone_sample_file_name,
    cloneConsentAt: nullableIso(row.clone_consent_at),
    cloneConsentText: row.clone_consent_text,
    webhookCallbackUrl: row.webhook_callback_url,
    webhookStatus: row.webhook_status,
    webhookAttempts: toNumber(row.webhook_attempts),
    webhookLastError: row.webhook_last_error,
    webhookLastAttemptAt: nullableIso(row.webhook_last_attempt_at),
    workerAttemptCount: toNumber(row.worker_attempt_count),
    lastWorkerId: row.last_worker_id,
    workerHeartbeatAt: nullableIso(row.worker_heartbeat_at),
    nextRetryAt: nullableIso(row.next_retry_at),
    deadLetterReason: row.dead_letter_reason,
    lastWorkerError: row.last_worker_error,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
    startedAt: nullableIso(row.started_at),
    completedAt: nullableIso(row.completed_at),
  };
}

function mapBatchJobItem(row: BatchJobItemRow): BatchJobItemRecord {
  return {
    id: row.id,
    jobId: row.job_id,
    userId: row.user_id,
    itemIndex: toNumber(row.item_index),
    text: row.text,
    inputPreview: row.input_preview,
    voice: row.voice,
    model: row.model,
    externalId: row.external_id,
    speaker: row.speaker,
    startMs: row.start_ms === null ? null : toNumber(row.start_ms),
    endMs: row.end_ms === null ? null : toNumber(row.end_ms),
    metadataJson: row.metadata_json,
    status: row.status,
    generationId: row.generation_id,
    audioBase64: row.audio_base64,
    audioObjectKey: row.audio_object_key,
    audioObjectUrl: row.audio_object_url,
    contentType: row.content_type,
    outputSeconds: toNumber(row.output_seconds),
    creditsEstimated: toNumber(row.credits_estimated),
    creditsCharged: toNumber(row.credits_charged),
    latencyMs: toNumber(row.latency_ms),
    attemptCount: toNumber(row.attempt_count),
    lastAttemptAt: nullableIso(row.last_attempt_at),
    nextRetryAt: nullableIso(row.next_retry_at),
    errorMessage: row.error_message,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

function mapBatchJobWebhookAttempt(row: BatchJobWebhookAttemptRow): BatchJobWebhookAttemptRecord {
  return {
    id: row.id,
    jobId: row.job_id,
    userId: row.user_id,
    webhookUrl: row.webhook_url,
    eventType: row.event_type,
    deliveryStatus: row.delivery_status,
    httpStatus: row.http_status === null ? null : toNumber(row.http_status),
    responsePreview: row.response_preview,
    errorMessage: row.error_message,
    latencyMs: toNumber(row.latency_ms),
    createdAt: iso(row.created_at),
  };
}

function mapPaymentOrder(row: PaymentOrderRow): PaymentOrderRecord {
  return {
    id: row.id,
    userId: row.user_id,
    planId: row.plan_id,
    planName: row.plan_name,
    quantity: toNumber(row.quantity),
    unitPriceCents: toNumber(row.unit_price_cents),
    totalPriceCents: toNumber(row.total_price_cents),
    tokens: toNumber(row.tokens),
    paymentMethod: row.payment_method,
    status: row.status,
    userNote: row.user_note,
    paymentReference: row.payment_reference,
    proofImageDataUrl: row.proof_image_data_url,
    khqrPayload: row.khqr_payload,
    khqrMd5: row.khqr_md5,
    khqrImageDataUrl: row.khqr_image_data_url,
    khqrCurrency: row.khqr_currency,
    khqrAmount: row.khqr_amount === null ? null : Number(row.khqr_amount),
    khqrExpiresAt: nullableIso(row.khqr_expires_at),
    paymentProvider: row.payment_provider,
    providerTransactionId: row.provider_transaction_id,
    providerReference: row.provider_reference,
    providerApprovalCode: row.provider_approval_code,
    providerStatusCode: row.provider_status_code,
    providerStatus: row.provider_status,
    providerAmount: row.provider_amount === null ? null : Number(row.provider_amount),
    providerCurrency: row.provider_currency,
    providerPayload: row.provider_payload,
    paidAt: nullableIso(row.paid_at),
    adminNote: row.admin_note,
    tokenTransactionId: row.token_transaction_id,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
    approvedAt: nullableIso(row.approved_at),
    approvedByUserId: row.approved_by_user_id,
    rejectedAt: nullableIso(row.rejected_at),
    rejectedByUserId: row.rejected_by_user_id,
    expiredAt: nullableIso(row.expired_at),
  };
}

function mapPaymentOrderWithUser(row: PaymentOrderWithUserRow): PaymentOrderWithUser {
  return {
    ...mapPaymentOrder(row),
    userEmail: row.user_email ?? "unknown user",
  };
}

function mapPaymentWebhookEvent(row: PaymentWebhookEventRow): PaymentWebhookEventRecord {
  return {
    id: row.id,
    provider: row.provider,
    orderId: row.order_id,
    paymentOrderId: row.payment_order_id,
    eventStatus: row.event_status,
    reason: row.reason,
    signatureValid: row.signature_valid,
    signatureConfigured: row.signature_configured,
    providerTransactionId: row.provider_transaction_id,
    providerReference: row.provider_reference,
    providerApprovalCode: row.provider_approval_code,
    providerStatusCode: row.provider_status_code,
    providerStatus: row.provider_status,
    providerAmount: row.provider_amount === null ? null : Number(row.provider_amount),
    providerCurrency: row.provider_currency,
    providerPayload: row.provider_payload,
    rawBody: row.raw_body,
    createdAt: iso(row.created_at),
  };
}

function mapPaymentWebhookEventWithOrder(
  row: PaymentWebhookEventWithOrderRow,
): PaymentWebhookEventWithOrder {
  return {
    ...mapPaymentWebhookEvent(row),
    userEmail: row.user_email,
    orderStatus: row.order_status,
  };
}

function mapTelegramPaymentEvent(row: TelegramPaymentEventRow): TelegramPaymentEventRecord {
  return {
    id: row.id,
    telegramUpdateId: row.telegram_update_id === null ? null : Number(row.telegram_update_id),
    telegramMessageId: row.telegram_message_id === null ? null : Number(row.telegram_message_id),
    chatId: row.chat_id,
    chatTitle: row.chat_title,
    senderId: row.sender_id,
    senderUsername: row.sender_username,
    senderName: row.sender_name,
    senderIsBot: row.sender_is_bot,
    rawText: row.raw_text,
    rawPayload: row.raw_payload,
    parsedStatus: row.parsed_status,
    parsedAmount: row.parsed_amount === null ? null : Number(row.parsed_amount),
    parsedCurrency: row.parsed_currency,
    parsedTransactionId: row.parsed_transaction_id,
    parsedReference: row.parsed_reference,
    matchedOrderId: row.matched_order_id,
    decisionStatus: row.decision_status,
    decisionReason: row.decision_reason,
    autoApproveAttempted: row.auto_approve_attempted,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

function mapTelegramPaymentAction(row: TelegramPaymentActionRow): TelegramPaymentActionRecord {
  return {
    id: row.id,
    orderId: row.order_id,
    action: row.action,
    status: row.status,
    reason: row.reason,
    telegramUserId: row.telegram_user_id,
    telegramUsername: row.telegram_username,
    telegramFirstName: row.telegram_first_name,
    telegramLastName: row.telegram_last_name,
    callbackQueryId: row.callback_query_id,
    messageChatId: row.message_chat_id,
    messageId: row.message_id,
    createdAt: iso(row.created_at),
  };
}

function mapTelegramPaymentEventWithOrder(
  row: TelegramPaymentEventWithOrderRow,
): TelegramPaymentEventWithOrder {
  return {
    ...mapTelegramPaymentEvent(row),
    userEmail: row.user_email,
    orderStatus: row.order_status,
  };
}

function mapPaymentSupportTicket(row: PaymentSupportTicketRow): PaymentSupportTicketRecord {
  return {
    id: row.id,
    userId: row.user_id,
    paymentOrderId: row.payment_order_id,
    status: row.status,
    userMessage: row.user_message,
    adminNote: row.admin_note,
    resolvedByUserId: row.resolved_by_user_id,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
    resolvedAt: nullableIso(row.resolved_at),
  };
}

function mapPaymentSupportTicketWithOrder(
  row: PaymentSupportTicketWithOrderRow,
): PaymentSupportTicketWithOrder {
  return {
    ...mapPaymentSupportTicket(row),
    userEmail: row.user_email ?? "unknown user",
    orderStatus: row.order_status,
    planName: row.plan_name,
    quantity: row.quantity === null ? null : toNumber(row.quantity),
    totalPriceCents: row.total_price_cents === null ? null : toNumber(row.total_price_cents),
    tokens: row.tokens === null ? null : toNumber(row.tokens),
  };
}

function mapBusinessApiRequest(row: BusinessApiRequestRow): BusinessApiRequestRecord {
  return {
    id: row.id,
    userId: row.user_id,
    companyName: row.company_name,
    appName: row.app_name,
    useCase: row.use_case,
    expectedMonthlyTokens: toNumber(row.expected_monthly_tokens),
    expectedPeakConcurrency: toNumber(row.expected_peak_concurrency),
    webhookUrl: row.webhook_url,
    contactTelegram: row.contact_telegram,
    contactEmail: row.contact_email,
    status: row.status,
    salesStage: row.sales_stage ?? "new",
    salesNote: row.sales_note,
    followUpAt: nullableIso(row.follow_up_at),
    lastContactedAt: nullableIso(row.last_contacted_at),
    adminNote: row.admin_note,
    appliedDailyTokenLimit: row.applied_daily_token_limit === null ? null : toNumber(row.applied_daily_token_limit),
    appliedMonthlyTokenLimit: row.applied_monthly_token_limit === null ? null : toNumber(row.applied_monthly_token_limit),
    appliedMaxConcurrentRequests:
      row.applied_max_concurrent_requests === null ? null : toNumber(row.applied_max_concurrent_requests),
    appliedMaxConcurrentJobs:
      row.applied_max_concurrent_jobs === null ? null : toNumber(row.applied_max_concurrent_jobs),
    appliedMaxQueuedJobs: row.applied_max_queued_jobs === null ? null : toNumber(row.applied_max_queued_jobs),
    appliedCloneCreditRate:
      row.applied_clone_credit_rate === null ? null : normalizeCloneCreditRate(row.applied_clone_credit_rate),
    reviewedByUserId: row.reviewed_by_user_id,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
    reviewedAt: nullableIso(row.reviewed_at),
  };
}

function mapBusinessApiRequestWithUser(row: BusinessApiRequestWithUserRow): BusinessApiRequestWithUser {
  return {
    ...mapBusinessApiRequest(row),
    userEmail: row.user_email ?? "unknown user",
  };
}

function mapWebhookTestEvent(row: WebhookTestEventRow): WebhookTestEventRecord {
  return {
    id: row.id,
    userId: row.user_id,
    webhookUrl: row.webhook_url,
    eventType: row.event_type,
    deliveryStatus: row.delivery_status,
    httpStatus: row.http_status === null ? null : toNumber(row.http_status),
    responsePreview: row.response_preview,
    errorMessage: row.error_message,
    latencyMs: toNumber(row.latency_ms),
    createdAt: iso(row.created_at),
  };
}

function mapWorkerHeartbeat(row: WorkerHeartbeatRow): WorkerHeartbeatRecord {
  return {
    id: row.id,
    workerId: row.worker_id,
    status: row.status,
    lastSeenAt: iso(row.last_seen_at),
    currentJobId: row.current_job_id,
    processedJobId: row.processed_job_id,
    processedItemCount: toNumber(row.processed_item_count),
    queueDepth: toNumber(row.queue_depth),
    runningJobs: toNumber(row.running_jobs),
    stuckJobs: toNumber(row.stuck_jobs),
    needsReviewJobs: toNumber(row.needs_review_jobs),
    upstreamLatencyMs: row.upstream_latency_ms === null ? null : toNumber(row.upstream_latency_ms),
    upstreamOk: row.upstream_ok,
    lastError: row.last_error,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

function mapAdminCustomerSummary(row: AdminCustomerSummaryRow): AdminCustomerSummary {
  return {
    user: mapUser(row),
    tokenBalance: toNumber(row.token_balance),
    totalCreditsEarned: toNumber(row.total_credits_earned),
    totalGenerations: toNumber(row.total_generations),
    apiRequests: toNumber(row.api_requests),
    paymentOrders: toNumber(row.payment_orders),
    activeApiKeys: toNumber(row.active_api_keys),
    lastActivityAt: nullableIso(row.last_activity_at),
  };
}

function mapGenerationWithUser(row: GenerationWithUserRow): GenerationWithUser {
  return {
    ...mapGeneration(row),
    userEmail: row.user_email ?? "unknown user",
  };
}

function mapBatchJobWithUser(row: BatchJobWithUserRow): BatchJobWithUser {
  return {
    ...mapBatchJob(row),
    userEmail: row.user_email ?? "unknown user",
  };
}

function mapBatchJobWebhookAttemptWithUser(
  row: BatchJobWebhookAttemptWithUserRow,
): BatchJobWebhookAttemptWithUser {
  return {
    ...mapBatchJobWebhookAttempt(row),
    userEmail: row.user_email ?? "unknown user",
    jobTitle: row.job_title,
    jobStatus: row.job_status,
    externalId: row.external_id,
  };
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "23505"
  );
}

export async function findUserByEmail(email: string): Promise<UserRecord | null> {
  const rows = await queryRows<UserRow>("select * from users where email = $1 limit 1", [
    normalizeEmail(email),
  ]);
  return rows[0] ? mapUser(rows[0]) : null;
}

export async function findUserById(userId: string): Promise<UserRecord | null> {
  const rows = await queryRows<UserRow>("select * from users where id = $1 limit 1", [userId]);
  return rows[0] ? mapUser(rows[0]) : null;
}

export async function createUserWithSignupBonus(email: string, passwordHash: string): Promise<UserRecord> {
  const normalized = normalizeEmail(email);
  try {
    return await withTransaction(async (client) => {
      const now = new Date().toISOString();
      const userId = randomUUID();
      const userRows = await client.query<UserRow>(
        `
        insert into users (id, email, password_hash, created_at, updated_at)
        values ($1, $2, $3, $4, $4)
        returning *
        `,
        [userId, normalized, passwordHash, now],
      );

      await client.query(
        `
        insert into token_transactions (id, user_id, amount, type, note, created_at)
        values ($1, $2, $3, $4, $5, $6)
        `,
        [randomUUID(), userId, 100, "signup_bonus", "Free signup tokens", now],
      );

      return mapUser(userRows.rows[0]);
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new Error("EMAIL_EXISTS");
    }
    throw error;
  }
}

export async function findUserByGoogleId(googleId: string): Promise<UserRecord | null> {
  const rows = await queryRows<UserRow>("select * from users where google_id = $1 limit 1", [googleId]);
  return rows[0] ? mapUser(rows[0]) : null;
}

export async function linkGoogleAccount(input: {
  userId: string;
  googleId: string;
  displayName?: string | null;
  avatarUrl?: string | null;
}): Promise<UserRecord | null> {
  const now = new Date().toISOString();
  try {
    const rows = await queryRows<UserRow>(
      `
      update users
      set google_id = $2,
        display_name = coalesce(display_name, $3),
        avatar_url = coalesce($4, avatar_url),
        updated_at = $5
      where id = $1
      returning *
      `,
      [input.userId, input.googleId, input.displayName ?? null, input.avatarUrl ?? null, now],
    );
    return rows[0] ? mapUser(rows[0]) : null;
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new Error("GOOGLE_ID_LINKED");
    }
    throw error;
  }
}

export async function createGoogleUserWithSignupBonus(input: {
  email: string;
  googleId: string;
  displayName?: string | null;
  avatarUrl?: string | null;
}): Promise<UserRecord> {
  const normalized = normalizeEmail(input.email);
  try {
    return await withTransaction(async (client) => {
      const now = new Date().toISOString();
      const userId = randomUUID();
      const userRows = await client.query<UserRow>(
        `
        insert into users (id, email, password_hash, google_id, display_name, avatar_url, created_at, updated_at)
        values ($1, $2, null, $3, $4, $5, $6, $6)
        returning *
        `,
        [userId, normalized, input.googleId, input.displayName ?? null, input.avatarUrl ?? null, now],
      );

      await client.query(
        `
        insert into token_transactions (id, user_id, amount, type, note, created_at)
        values ($1, $2, $3, $4, $5, $6)
        `,
        [randomUUID(), userId, 100, "signup_bonus", "Free signup tokens", now],
      );

      return mapUser(userRows.rows[0]);
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new Error("EMAIL_EXISTS");
    }
    throw error;
  }
}

export async function getUserTokenBalance(userId: string): Promise<number> {
  const rows = await queryRows<QueryResultRow & { balance: number | string }>(
    "select coalesce(sum(amount), 0)::int as balance from token_transactions where user_id = $1",
    [userId],
  );
  return toNumber(rows[0]?.balance);
}

export async function getUserTotalCreditsEarned(userId: string): Promise<number> {
  const rows = await queryRows<QueryResultRow & { total: number | string }>(
    "select coalesce(sum(amount), 0)::int as total from token_transactions where user_id = $1 and amount > 0",
    [userId],
  );
  return toNumber(rows[0]?.total);
}

export async function addTokenTransaction(
  userId: string,
  amount: number,
  type: TokenTransactionType,
  note: string | null,
): Promise<TokenTransactionRecord> {
  const rows = await queryRows<TokenTransactionRow>(
    `
    insert into token_transactions (id, user_id, amount, type, note, created_at)
    values ($1, $2, $3, $4, $5, $6)
    returning *
    `,
    [randomUUID(), userId, amount, type, note, new Date().toISOString()],
  );
  return mapTokenTransaction(rows[0]);
}

export async function consumeUserTokens(
  userId: string,
  amount: number,
  note: string | null,
): Promise<{ ok: boolean; remaining: number }> {
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: true, remaining: await getUserTokenBalance(userId) };
  }

  return withTransaction(async (client) => {
    await client.query("select id from users where id = $1 for update", [userId]);
    const balanceRows = await client.query<QueryResultRow & { balance: number | string }>(
      `
      select coalesce(sum(amount), 0)::int as balance
      from token_transactions
      where user_id = $1
      `,
      [userId],
    );
    const currentBalance = toNumber(balanceRows.rows[0]?.balance);
    if (currentBalance < amount) {
      return { ok: false, remaining: currentBalance };
    }

    await client.query(
      `
      insert into token_transactions (id, user_id, amount, type, note, created_at)
      values ($1, $2, $3, $4, $5, $6)
      `,
      [randomUUID(), userId, -amount, "usage", note, new Date().toISOString()],
    );

    return { ok: true, remaining: currentBalance - amount };
  });
}

export async function listUserApiKeys(userId: string): Promise<ApiKeyRecord[]> {
  const rows = await queryRows<ApiKeyRow>(
    "select * from api_keys where user_id = $1 order by created_at desc",
    [userId],
  );
  return rows.map(mapApiKey);
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
  const rows = await queryRows<ApiKeyRow>(
    `
    insert into api_keys (
      id, user_id, name, key_prefix, key_hash,
      daily_token_limit, monthly_token_limit,
      max_concurrent_requests, max_concurrent_jobs, max_queued_jobs,
      created_at
    )
    values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    returning *
    `,
    [
      randomUUID(),
      userId,
      name,
      keyPrefix,
      keyHash,
      normalizeOptionalLimit(options?.dailyTokenLimit),
      normalizeOptionalLimit(options?.monthlyTokenLimit),
      normalizeOptionalLimit(options?.maxConcurrentRequests),
      normalizeOptionalLimit(options?.maxConcurrentJobs),
      normalizeOptionalLimit(options?.maxQueuedJobs),
      new Date().toISOString(),
    ],
  );
  return mapApiKey(rows[0]);
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
  const rows = await queryRows<ApiKeyRow>(
    `
    update api_keys
    set daily_token_limit = case when $1::boolean then $2::integer else daily_token_limit end,
      monthly_token_limit = case when $3::boolean then $4::integer else monthly_token_limit end,
      max_concurrent_requests = case when $5::boolean then $6::integer else max_concurrent_requests end,
      max_concurrent_jobs = case when $7::boolean then $8::integer else max_concurrent_jobs end,
      max_queued_jobs = case when $9::boolean then $10::integer else max_queued_jobs end
    where id = $11 and user_id = $12
    returning *
    `,
    [
      "dailyTokenLimit" in limits,
      normalizeOptionalLimit(limits.dailyTokenLimit),
      "monthlyTokenLimit" in limits,
      normalizeOptionalLimit(limits.monthlyTokenLimit),
      "maxConcurrentRequests" in limits,
      normalizeOptionalLimit(limits.maxConcurrentRequests),
      "maxConcurrentJobs" in limits,
      normalizeOptionalLimit(limits.maxConcurrentJobs),
      "maxQueuedJobs" in limits,
      normalizeOptionalLimit(limits.maxQueuedJobs),
      keyId,
      userId,
    ],
  );
  return rows[0] ? mapApiKey(rows[0]) : null;
}

export async function findActiveApiKeyByRawKey(rawKey: string): Promise<ApiKeyRecord | null> {
  const keyHash = createHash("sha256").update(rawKey).digest("hex");
  const rows = await queryRows<ApiKeyRow>(
    "select * from api_keys where key_hash = $1 and revoked_at is null limit 1",
    [keyHash],
  );
  return rows[0] ? mapApiKey(rows[0]) : null;
}

export async function touchApiKeyLastUsed(keyId: string): Promise<void> {
  await queryRows(
    "update api_keys set last_used_at = $1 where id = $2",
    [new Date().toISOString(), keyId],
  );
}

export async function getApiKeyTokenUsage(
  apiKeyId: string,
  period: "day" | "month",
): Promise<number> {
  const bucketSql =
    period === "day"
      ? "created_at::date = current_date"
      : "date_trunc('month', created_at) = date_trunc('month', now())";
  const rows = await queryRows<QueryResultRow & { total: number | string }>(
    `
    select coalesce(sum(credits_charged), 0)::int as total
    from generations
    where api_key_id = $1 and status = 'success' and ${bucketSql}
    `,
    [apiKeyId],
  );
  return toNumber(rows[0]?.total);
}

export async function getApiKeyBatchJobCounts(apiKeyId: string): Promise<{
  queued: number;
  running: number;
}> {
  const rows = await queryRows<QueryResultRow & { queued: number | string; running: number | string }>(
    `
    select
      count(*) filter (where status = 'queued')::int as queued,
      count(*) filter (where status = 'running')::int as running
    from batch_jobs
    where api_key_id = $1
    `,
    [apiKeyId],
  );
  return {
    queued: toNumber(rows[0]?.queued),
    running: toNumber(rows[0]?.running),
  };
}

export async function revokeApiKey(userId: string, keyId: string): Promise<boolean> {
  const rows = await queryRows<ApiKeyRow>(
    `
    update api_keys
    set revoked_at = $1
    where id = $2 and user_id = $3 and revoked_at is null
    returning *
    `,
    [new Date().toISOString(), keyId, userId],
  );
  return rows.length > 0;
}

export async function createGenerationRecord(
  input: Omit<GenerationRecord, "id" | "createdAt"> & { createdAt?: string; id?: string },
): Promise<GenerationRecord> {
  const rows = await queryRows<GenerationRow>(
    `
    insert into generations (
      id, user_id, api_key_id, mode, source, status, model, voice, input_chars,
      input_preview, output_seconds, credits_requested, credits_charged,
      latency_ms, error_message, audio_base64, audio_object_key, audio_object_url, content_type, segment_of_job_id, created_at
    )
    values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
    on conflict (id) do update set
      status = excluded.status,
      output_seconds = excluded.output_seconds,
      credits_charged = excluded.credits_charged,
      latency_ms = excluded.latency_ms,
      error_message = excluded.error_message,
      audio_base64 = excluded.audio_base64,
      audio_object_key = excluded.audio_object_key,
      audio_object_url = excluded.audio_object_url,
      content_type = excluded.content_type
    returning *
    `,
    [
      input.id ?? randomUUID(),
      input.userId,
      input.apiKeyId,
      input.mode,
      input.source,
      input.status,
      input.model,
      input.voice,
      input.inputChars,
      input.inputPreview,
      input.outputSeconds,
      input.creditsRequested,
      input.creditsCharged,
      input.latencyMs,
      input.errorMessage,
      input.audioBase64 ?? null,
      input.audioObjectKey ?? null,
      input.audioObjectUrl ?? null,
      input.contentType ?? null,
      input.segmentOfJobId ?? null,
      input.createdAt ?? new Date().toISOString(),
    ],
  );
  return mapGeneration(rows[0]);
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
  const setParts = ["status = $1"];
  const values: unknown[] = [input.status];

  function addSet(column: string, value: unknown) {
    values.push(value);
    setParts.push(`${column} = $${values.length}`);
  }

  if (input.model !== undefined) addSet("model", input.model);
  if (input.outputSeconds !== undefined) addSet("output_seconds", input.outputSeconds);
  if (input.creditsCharged !== undefined) addSet("credits_charged", input.creditsCharged);
  if (input.latencyMs !== undefined) addSet("latency_ms", input.latencyMs);
  if (input.errorMessage !== undefined) addSet("error_message", input.errorMessage);
  if (input.audioBase64 !== undefined) addSet("audio_base64", input.audioBase64);
  if (input.audioObjectKey !== undefined) addSet("audio_object_key", input.audioObjectKey);
  if (input.audioObjectUrl !== undefined) addSet("audio_object_url", input.audioObjectUrl);
  if (input.contentType !== undefined) addSet("content_type", input.contentType);

  values.push(input.generationId, input.userId);
  const idParam = values.length - 1;
  const userParam = values.length;
  const rows = await queryRows<GenerationRow>(
    `
    update generations
    set ${setParts.join(", ")}
    where id = $${idParam} and user_id = $${userParam}
    returning *
    `,
    values,
  );
  return rows[0] ? mapGeneration(rows[0]) : null;
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
  const search = options?.search?.trim() ?? "";
  const offset = Math.max(0, options?.offset ?? 0);
  const values: unknown[] = [userId];
  const where = ["user_id = $1", "segment_of_job_id is null"];

  if (source !== "all") {
    values.push(source);
    where.push(`source = $${values.length}`);
  }
  if (mode !== "all") {
    values.push(mode);
    where.push(`mode = $${values.length}`);
  }
  if (search) {
    const likePattern = `%${search}%`;
    values.push(likePattern);
    const searchParam = `$${values.length}`;
    where.push(
      `(input_preview ilike ${searchParam} or error_message ilike ${searchParam} or mode ilike ${searchParam} or status ilike ${searchParam} or source ilike ${searchParam})`,
    );
  }
  values.push(limit);
  const limitParam = `$${values.length}`;
  values.push(offset);
  const offsetParam = `$${values.length}`;

  const rows = await queryRows<GenerationRow>(
    `
    select id, user_id, api_key_id, mode, source, status, model, voice,
           input_chars, input_preview, output_seconds, credits_requested,
           credits_charged, latency_ms, error_message, audio_base64,
           audio_object_key, audio_object_url, content_type, segment_of_job_id,
           (audio_base64 is not null or audio_object_key is not null) as has_audio, created_at
    from generations
    where ${where.join(" and ")}
    order by created_at desc
    limit ${limitParam} offset ${offsetParam}
    `,
    values,
  );
  return rows.map(mapGeneration);
}

export async function getUserGenerationRecord(
  userId: string,
  generationId: string,
): Promise<GenerationRecord | null> {
  const rows = await queryRows<GenerationRow>(
    `
    select *
    from generations
    where user_id = $1 and id = $2
    limit 1
    `,
    [userId, generationId],
  );
  return rows[0] ? mapGeneration(rows[0]) : null;
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
  const search = options?.search?.trim() ?? "";
  const values: unknown[] = [userId];
  const where = ["user_id = $1", "segment_of_job_id is null"];

  if (source !== "all") {
    values.push(source);
    where.push(`source = $${values.length}`);
  }
  if (mode !== "all") {
    values.push(mode);
    where.push(`mode = $${values.length}`);
  }
  if (search) {
    const likePattern = `%${search}%`;
    values.push(likePattern);
    const searchParam = `$${values.length}`;
    where.push(
      `(input_preview ilike ${searchParam} or error_message ilike ${searchParam} or mode ilike ${searchParam} or status ilike ${searchParam} or source ilike ${searchParam})`,
    );
  }

  const rows = await queryRows<{ cnt: number | string }>(
    `
    select count(*)::int as cnt
    from generations
    where ${where.join(" and ")}
    `,
    values,
  );
  return toNumber(rows[0]?.cnt);
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
  const values: unknown[] = [userId];
  const where = ["user_id = $1", "status = 'success'", "segment_of_job_id is null"];
  if (mode !== "all") {
    values.push(mode);
    where.push(`mode = $${values.length}`);
  }

  const rows = await queryRows<
    QueryResultRow & {
      total_generations: number | string;
      total_duration_sec: number | string | null;
      avg_duration_sec: number | string | null;
      this_month_generations: number | string;
    }
  >(
    `
    select
      count(*)::int as total_generations,
      coalesce(sum(output_seconds), 0)::int as total_duration_sec,
      coalesce(round(avg(output_seconds)), 0)::int as avg_duration_sec,
      count(*) filter (
        where created_at >= date_trunc('month', now())
      )::int as this_month_generations
    from generations
    where ${where.join(" and ")}
    `,
    values,
  );
  const row = rows[0];
  return {
    totalGenerations: toNumber(row?.total_generations),
    totalDurationSec: toNumber(row?.total_duration_sec),
    avgDurationSec: toNumber(row?.avg_duration_sec),
    thisMonthGenerations: toNumber(row?.this_month_generations),
  };
}

export async function getApiUsageStats(userId: string): Promise<{
  requestsToday: number;
  requestsThisMonth: number;
  successRatePercent: number;
  last30DaysRequests: number;
}> {
  const rows = await queryRows<
    QueryResultRow & {
      requests_today: number | string;
      requests_this_month: number | string;
      success_count: number | string;
      request_count: number | string;
      last_30_days_requests: number | string;
    }
  >(
    `
    select
      count(*) filter (where created_at::date = current_date)::int as requests_today,
      count(*) filter (where date_trunc('month', created_at) = date_trunc('month', now()))::int
        as requests_this_month,
      count(*) filter (where status = 'success')::int as success_count,
      count(*)::int as request_count,
      count(*) filter (where created_at >= now() - interval '29 days')::int as last_30_days_requests
    from generations
    where user_id = $1 and source = 'api_key'
    `,
    [userId],
  );
  const row = rows[0];
  const requestCount = toNumber(row?.request_count);
  const successCount = toNumber(row?.success_count);
  return {
    requestsToday: toNumber(row?.requests_today),
    requestsThisMonth: toNumber(row?.requests_this_month),
    successRatePercent: requestCount === 0 ? 100 : Math.round((successCount / requestCount) * 100),
    last30DaysRequests: toNumber(row?.last_30_days_requests),
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
  return withTransaction(async (client) => {
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
    const jobRows = await client.query<BatchJobRow>(
      `
      insert into batch_jobs (
        id, user_id, api_key_id, mode, source, status, title, voice, model,
        external_id, metadata_json,
        total_items, completed_items, failed_items, total_input_chars,
        credits_estimated, credits_charged, output_seconds, error_message,
        clone_sample_base64, clone_sample_mime_type, clone_sample_file_name,
        clone_consent_at, clone_consent_text,
        webhook_callback_url, webhook_status, webhook_attempts, webhook_last_error,
        webhook_last_attempt_at,
        created_at, updated_at, started_at, completed_at
      )
      values (
        $1, $2, $3, $4, $5, 'queued', $6, $7, $8,
        $9, $10,
        $11, 0, 0, $12, $13, 0, 0, null,
        $14, $15, $16, $17, $18,
        $19, $20, 0, null, null,
        $21, $21, null, null
      )
      returning *
      `,
      [
        jobId,
        input.userId,
        input.apiKeyId ?? null,
        input.mode,
        input.source,
        input.title.trim() || "Batch job",
        input.voice.trim() || (input.mode === "clone" ? DEFAULT_CLONE_VOICE_INSTRUCTION : DEFAULT_TTS_VOICE_PROMPT),
        input.model.trim() || "voxcpm2",
        input.externalId ?? null,
        input.metadataJson ?? null,
        lines.length,
        lines.reduce((sum, line) => sum + Array.from(line.text).length, 0),
        lines.reduce((sum, line) => sum + line.creditsEstimated, 0),
        input.cloneSampleBase64 ?? null,
        input.cloneSampleMimeType ?? null,
        input.cloneSampleFileName ?? null,
        input.cloneConsentAt ?? null,
        input.cloneConsentText ?? null,
        input.webhookCallbackUrl ?? null,
        input.webhookCallbackUrl ? "pending" : null,
        now,
      ],
    );

    const items: BatchJobItemRecord[] = [];
    for (const [index, line] of lines.entries()) {
      const itemRows = await client.query<BatchJobItemRow>(
        `
        insert into batch_job_items (
          id, job_id, user_id, item_index, text, input_preview, voice, model,
          external_id, speaker, start_ms, end_ms, metadata_json,
          status, generation_id, audio_base64, audio_object_key, audio_object_url, content_type, output_seconds,
          credits_estimated, credits_charged, latency_ms, error_message,
          created_at, updated_at
        )
        values (
          $1, $2, $3, $4, $5, $6, $7, $8,
          $9, $10, $11, $12, $13,
          'queued', null, null, null, null, null, 0, $14, 0, 0, null, $15, $15
        )
        returning *
        `,
        [
          randomUUID(),
          jobId,
          input.userId,
          index,
          line.text,
          batchInputPreview(line.text),
          input.voice.trim() || (input.mode === "clone" ? DEFAULT_CLONE_VOICE_INSTRUCTION : DEFAULT_TTS_VOICE_PROMPT),
          input.model.trim() || "voxcpm2",
          line.externalId,
          line.speaker,
          line.startMs,
          line.endMs,
          line.metadataJson,
          line.creditsEstimated,
          now,
        ],
      );
      items.push(mapBatchJobItem(itemRows.rows[0]));
    }

    return { job: mapBatchJob(jobRows.rows[0]), items };
  });
}

export async function listUserBatchJobs(
  userId: string,
  options?: { limit?: number },
): Promise<BatchJobRecord[]> {
  const limit = Math.max(1, Math.min(options?.limit ?? 50, 200));
  const rows = await queryRows<BatchJobRow>(
    `select id, user_id, api_key_id, mode, source, status, title, voice, model,
            external_id, metadata_json,
            total_items, completed_items, failed_items, total_input_chars,
            credits_estimated, credits_charged, output_seconds, error_message,
            null::text as clone_sample_base64, clone_sample_mime_type, clone_sample_file_name,
            clone_consent_at, clone_consent_text,
            webhook_callback_url, webhook_status, webhook_attempts, webhook_last_error,
            webhook_last_attempt_at,
            worker_attempt_count, last_worker_id, worker_heartbeat_at, next_retry_at,
            dead_letter_reason, last_worker_error,
            created_at, updated_at, started_at, completed_at
     from batch_jobs where user_id = $1 order by created_at desc limit $2`,
    [userId, limit],
  );
  return rows.map(mapBatchJob);
}

export async function getUserBatchJobWithItems(
  userId: string,
  jobId: string,
): Promise<{ job: BatchJobRecord; items: BatchJobItemRecord[] } | null> {
  const jobRows = await queryRows<BatchJobRow>(
    "select * from batch_jobs where id = $1 and user_id = $2 limit 1",
    [jobId, userId],
  );
  if (!jobRows[0]) return null;
  const itemRows = await queryRows<BatchJobItemRow>(
    "select * from batch_job_items where job_id = $1 and user_id = $2 order by item_index asc",
    [jobId, userId],
  );
  return { job: mapBatchJob(jobRows[0]), items: itemRows.map(mapBatchJobItem) };
}

export async function getBatchJobWithItems(
  jobId: string,
): Promise<{ job: BatchJobRecord; items: BatchJobItemRecord[] } | null> {
  const jobRows = await queryRows<BatchJobRow>("select * from batch_jobs where id = $1 limit 1", [
    jobId,
  ]);
  if (!jobRows[0]) return null;
  const itemRows = await queryRows<BatchJobItemRow>(
    "select * from batch_job_items where job_id = $1 order by item_index asc",
    [jobId],
  );
  return { job: mapBatchJob(jobRows[0]), items: itemRows.map(mapBatchJobItem) };
}

export async function claimNextQueuedBatchJob(workerId?: string | null): Promise<BatchJobRecord | null> {
  return withTransaction(async (client) => {
    const rows = await client.query<BatchJobRow>(
      `
      select batch_jobs.*
      from batch_jobs
      left join api_keys on api_keys.id = batch_jobs.api_key_id
      where batch_jobs.status = 'queued'
        and (batch_jobs.next_retry_at is null or batch_jobs.next_retry_at <= now())
        and (
          batch_jobs.api_key_id is null
          or (
            select count(*)::int
            from batch_jobs running_jobs
            where running_jobs.api_key_id = batch_jobs.api_key_id
              and running_jobs.status = 'running'
          ) < coalesce(api_keys.max_concurrent_jobs, $1)
        )
      order by batch_jobs.created_at asc
      limit 1
      for update of batch_jobs skip locked
      `,
      [defaultMaxConcurrentJobs()],
    );
    const job = rows.rows[0];
    if (!job) return null;
    const now = new Date().toISOString();
    const updatedRows = await client.query<BatchJobRow>(
      `
      update batch_jobs
      set status = 'running',
        started_at = coalesce(started_at, $1),
        error_message = null,
        worker_heartbeat_at = $1,
        last_worker_id = $3,
        worker_attempt_count = worker_attempt_count + 1,
        next_retry_at = null,
        updated_at = $1
      where id = $2
      returning *
      `,
      [now, job.id, workerId?.trim() || null],
    );
    return mapBatchJob(updatedRows.rows[0]);
  });
}

export async function claimQueuedBatchJob(jobId: string, workerId?: string | null): Promise<BatchJobRecord | null> {
  return withTransaction(async (client) => {
    const rows = await client.query<BatchJobRow>(
      `
      select batch_jobs.*
      from batch_jobs
      left join api_keys on api_keys.id = batch_jobs.api_key_id
      where batch_jobs.id = $1
        and batch_jobs.status = 'queued'
        and (batch_jobs.next_retry_at is null or batch_jobs.next_retry_at <= now())
        and (
          batch_jobs.api_key_id is null
          or (
            select count(*)::int
            from batch_jobs running_jobs
            where running_jobs.api_key_id = batch_jobs.api_key_id
              and running_jobs.status = 'running'
          ) < coalesce(api_keys.max_concurrent_jobs, $2)
        )
      limit 1
      for update of batch_jobs skip locked
      `,
      [jobId, defaultMaxConcurrentJobs()],
    );
    const job = rows.rows[0];
    if (!job) return null;
    const now = new Date().toISOString();
    const updatedRows = await client.query<BatchJobRow>(
      `
      update batch_jobs
      set status = 'running',
        started_at = coalesce(started_at, $1),
        error_message = null,
        worker_heartbeat_at = $1,
        last_worker_id = $3,
        worker_attempt_count = worker_attempt_count + 1,
        next_retry_at = null,
        updated_at = $1
      where id = $2
      returning *
      `,
      [now, job.id, workerId?.trim() || null],
    );
    return mapBatchJob(updatedRows.rows[0]);
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
  const rows = await queryRows<BatchJobRow>(
    `
    update batch_jobs
    set status = $1,
      error_message = case when $2::boolean then $3 else error_message end,
      started_at = case when $4::boolean then $5::timestamptz else started_at end,
      completed_at = case when $6::boolean then $7::timestamptz else completed_at end,
      worker_heartbeat_at = case when $8::boolean then $9::timestamptz else worker_heartbeat_at end,
      next_retry_at = case when $10::boolean then $11::timestamptz else next_retry_at end,
      dead_letter_reason = case when $12::boolean then $13 else dead_letter_reason end,
      last_worker_error = case when $14::boolean then $15 else last_worker_error end,
      updated_at = $16
    where id = $17
    returning *
    `,
    [
      input.status,
      "errorMessage" in input,
      input.errorMessage ?? null,
      "startedAt" in input,
      input.startedAt ?? null,
      "completedAt" in input,
      input.completedAt ?? null,
      "workerHeartbeatAt" in input,
      input.workerHeartbeatAt ?? null,
      "nextRetryAt" in input,
      input.nextRetryAt ?? null,
      "deadLetterReason" in input,
      input.deadLetterReason ?? null,
      "lastWorkerError" in input,
      input.lastWorkerError ?? null,
      new Date().toISOString(),
      input.jobId,
    ],
  );
  return rows[0] ? mapBatchJob(rows[0]) : null;
}

export async function claimQueuedBatchJobItem(itemId: string): Promise<BatchJobItemRecord | null> {
  const rows = await queryRows<BatchJobItemRow>(
    `
    update batch_job_items
    set status = 'running',
      error_message = null,
      attempt_count = attempt_count + 1,
      last_attempt_at = $1,
      next_retry_at = null,
      updated_at = $1
    where id = $2
      and status = 'queued'
      and (next_retry_at is null or next_retry_at <= now())
    returning *
    `,
    [new Date().toISOString(), itemId],
  );
  return rows[0] ? mapBatchJobItem(rows[0]) : null;
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
  const sets = ["status = $1", "updated_at = $2"];
  const params: unknown[] = [input.status, new Date().toISOString()];

  function addSet(column: string, value: unknown) {
    params.push(value);
    sets.push(`${column} = $${params.length}`);
  }

  if ("generationId" in input) addSet("generation_id", input.generationId ?? null);
  if ("audioBase64" in input) addSet("audio_base64", input.audioBase64 ?? null);
  if ("audioObjectKey" in input) addSet("audio_object_key", input.audioObjectKey ?? null);
  if ("audioObjectUrl" in input) addSet("audio_object_url", input.audioObjectUrl ?? null);
  if ("contentType" in input) addSet("content_type", input.contentType ?? null);
  if ("outputSeconds" in input) addSet("output_seconds", Math.max(0, Math.round(input.outputSeconds ?? 0)));
  if ("creditsCharged" in input) addSet("credits_charged", Math.max(0, Math.round(input.creditsCharged ?? 0)));
  if ("latencyMs" in input) addSet("latency_ms", Math.max(0, Math.round(input.latencyMs ?? 0)));
  if ("attemptCount" in input) addSet("attempt_count", Math.max(0, Math.round(input.attemptCount ?? 0)));
  if ("nextRetryAt" in input) addSet("next_retry_at", input.nextRetryAt ?? null);
  if ("lastAttemptAt" in input) addSet("last_attempt_at", input.lastAttemptAt ?? null);
  if ("errorMessage" in input) addSet("error_message", input.errorMessage ?? null);

  params.push(input.itemId);
  const rows = await queryRows<BatchJobItemRow>(
    `update batch_job_items set ${sets.join(", ")} where id = $${params.length} returning *`,
    params,
  );
  return rows[0] ? mapBatchJobItem(rows[0]) : null;
}

export async function resetRetryableBatchJobItems(jobId: string, maxItemAttempts: number): Promise<number> {
  return withTransaction(async (client) => {
    const now = new Date().toISOString();
    const result = await client.query(
      `
      update batch_job_items
      set status = 'queued',
        error_message = null,
        next_retry_at = null,
        updated_at = $1
      where job_id = $2
        and status = 'failed'
        and attempt_count < $3
        and (next_retry_at is null or next_retry_at <= $1::timestamptz)
      `,
      [now, jobId, maxItemAttempts]
    );
    return result.rowCount ?? 0;
  });
}

export async function refreshBatchJobRollup(jobId: string): Promise<BatchJobRecord | null> {
  return withTransaction(async (client) => {
    const jobRows = await client.query<BatchJobRow>("select * from batch_jobs where id = $1 for update", [
      jobId,
    ]);
    const jobRow = jobRows.rows[0];
    if (!jobRow) return null;

    const statsRows = await client.query<
      QueryResultRow & {
        completed_items: number | string;
        failed_items: number | string;
        queued_items: number | string;
        running_items: number | string;
        retryable_failed_items: number | string;
        next_retry_at: Date | string | null;
        queued_next_retry_at: Date | string | null;
        credits_charged: number | string;
        output_seconds: number | string;
      }
    >(
      `
      select
        count(*) filter (where status = 'success')::int as completed_items,
        count(*) filter (where status = 'failed')::int as failed_items,
        count(*) filter (where status = 'queued')::int as queued_items,
        count(*) filter (where status = 'running')::int as running_items,
        count(*) filter (where status = 'failed' and attempt_count < $2)::int as retryable_failed_items,
        min(next_retry_at) filter (where status = 'failed' and attempt_count < $2) as next_retry_at,
        min(next_retry_at) filter (where status = 'queued' and next_retry_at is not null) as queued_next_retry_at,
        coalesce(sum(credits_charged), 0)::int as credits_charged,
        coalesce(sum(output_seconds), 0)::int as output_seconds
      from batch_job_items
      where job_id = $1
      `,
      [jobId, batchItemMaxAttempts()],
    );
    const stats = statsRows.rows[0];
    const completedItems = toNumber(stats?.completed_items);
    const failedItems = toNumber(stats?.failed_items);
    const queuedItems = toNumber(stats?.queued_items);
    const runningItems = toNumber(stats?.running_items);
    const retryableFailedItems = toNumber(stats?.retryable_failed_items);
    const terminalItems = completedItems + failedItems;
    const totalItems = toNumber(jobRow.total_items);
    const now = new Date().toISOString();
    let finalStatus: BatchJobStatus = jobRow.status;
    let completedAt: string | null = null;
    let nextRetryAt: string | null = nullableIso(jobRow.next_retry_at);
    let errorMessage = jobRow.error_message;
    let deadLetterReason = jobRow.dead_letter_reason;
    let lastWorkerError = jobRow.last_worker_error;

    if (terminalItems >= totalItems) {
      if (failedItems === 0) {
        finalStatus = "completed";
        completedAt = nullableIso(jobRow.completed_at) ?? now;
        nextRetryAt = null;
        errorMessage = null;
        deadLetterReason = null;
        lastWorkerError = null;
      } else if (retryableFailedItems > 0) {
        finalStatus = "queued";
        completedAt = null;
        nextRetryAt = nullableIso(stats?.next_retry_at) ?? now;
        errorMessage = `Waiting to retry ${retryableFailedItems.toLocaleString()} failed item(s).`;
      } else {
        finalStatus = completedItems > 0 ? "partial" : "needs_review";
        completedAt = nullableIso(jobRow.completed_at) ?? now;
        nextRetryAt = null;
        deadLetterReason = deadLetterReason ?? (completedItems > 0
          ? "Some batch items exhausted their retry limit."
          : "All batch items exhausted their retry limit.");
        errorMessage = errorMessage ?? deadLetterReason;
      }
    } else if (queuedItems > 0 && runningItems === 0) {
      finalStatus = "queued";
      completedAt = null;
      nextRetryAt = nullableIso(stats?.queued_next_retry_at) ?? nullableIso(stats?.next_retry_at) ?? nextRetryAt ?? now;
      errorMessage = failedItems > 0
        ? `Waiting to retry ${queuedItems.toLocaleString()} queued item(s).`
        : errorMessage;
    } else if (runningItems > 0) {
      finalStatus = "running";
      completedAt = null;
      nextRetryAt = null;
    }

    const updatedRows = await client.query<BatchJobRow>(
      `
      update batch_jobs
      set completed_items = $1,
        failed_items = $2,
        credits_charged = $3,
        output_seconds = $4,
        status = $5,
        completed_at = $6,
        error_message = $7,
        next_retry_at = $8,
        dead_letter_reason = $9,
        last_worker_error = $10,
        updated_at = $11
      where id = $12
      returning *
      `,
      [
        completedItems,
        failedItems,
        toNumber(stats?.credits_charged),
        toNumber(stats?.output_seconds),
        finalStatus,
        completedAt,
        errorMessage,
        nextRetryAt,
        deadLetterReason,
        lastWorkerError,
        now,
        jobId,
      ],
    );
    return mapBatchJob(updatedRows.rows[0]);
  });
}

export async function updateBatchJobWebhookStatus(input: {
  jobId: string;
  webhookStatus: BatchJobRecord["webhookStatus"];
  webhookLastError: string | null;
  webhookLastAttemptAt: string;
  incrementAttempts: boolean;
}): Promise<BatchJobRecord | null> {
  const rows = await queryRows<BatchJobRow>(
    `
    update batch_jobs
    set webhook_status = $1,
      webhook_last_error = $2,
      webhook_last_attempt_at = $3,
      webhook_attempts = case when $4::boolean then webhook_attempts + 1 else webhook_attempts end,
      updated_at = $5
    where id = $6
    returning *
    `,
    [
      input.webhookStatus,
      input.webhookLastError,
      input.webhookLastAttemptAt,
      input.incrementAttempts,
      new Date().toISOString(),
      input.jobId,
    ],
  );
  return rows[0] ? mapBatchJob(rows[0]) : null;
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
  const rows = await queryRows<BatchJobWebhookAttemptRow>(
    `
    insert into batch_job_webhook_attempts (
      id, job_id, user_id, webhook_url, event_type, delivery_status,
      http_status, response_preview, error_message, latency_ms, created_at
    )
    values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    returning *
    `,
    [
      randomUUID(),
      input.jobId,
      input.userId,
      input.webhookUrl,
      input.eventType,
      input.deliveryStatus,
      input.httpStatus,
      input.responsePreview,
      input.errorMessage,
      Math.max(0, Math.round(input.latencyMs)),
      new Date().toISOString(),
    ],
  );
  return mapBatchJobWebhookAttempt(rows[0]);
}

export async function listBatchJobWebhookAttempts(
  jobId: string,
  options?: { limit?: number },
): Promise<BatchJobWebhookAttemptRecord[]> {
  const limit = Math.max(1, Math.min(options?.limit ?? 20, 100));
  const rows = await queryRows<BatchJobWebhookAttemptRow>(
    `
    select *
    from batch_job_webhook_attempts
    where job_id = $1
    order by created_at desc
    limit $2
    `,
    [jobId, limit],
  );
  return rows.map(mapBatchJobWebhookAttempt);
}

export async function clearBatchJobCloneSample(jobId: string): Promise<BatchJobRecord | null> {
  const rows = await queryRows<BatchJobRow>(
    `
    update batch_jobs
    set clone_sample_base64 = null,
      clone_sample_mime_type = null,
      clone_sample_file_name = null,
      updated_at = $1
    where id = $2
    returning *
    `,
    [new Date().toISOString(), jobId],
  );
  return rows[0] ? mapBatchJob(rows[0]) : null;
}

export async function retryBatchJob(jobId: string): Promise<BatchJobRecord | null> {
  return withTransaction(async (client) => {
    const jobRows = await client.query<BatchJobRow>("select * from batch_jobs where id = $1 for update", [
      jobId,
    ]);
    const job = jobRows.rows[0];
    if (!job || (job.status !== "failed" && job.status !== "partial" && job.status !== "needs_review")) return null;

    const now = new Date().toISOString();
    const resetRows = await client.query<QueryResultRow & { count: number | string }>(
      `
      update batch_job_items
      set status = 'queued',
        error_message = null,
        latency_ms = 0,
        attempt_count = 0,
        last_attempt_at = null,
        next_retry_at = null,
        updated_at = $1
      where job_id = $2 and status = 'failed'
      returning id
      `,
      [now, jobId],
    );
    if (resetRows.rowCount === 0) return null;

    const updatedRows = await client.query<BatchJobRow>(
      `
      update batch_jobs
      set status = 'queued',
        failed_items = 0,
        error_message = null,
        completed_at = null,
        next_retry_at = null,
        dead_letter_reason = null,
        last_worker_error = null,
        worker_attempt_count = 0,
        updated_at = $1
      where id = $2
      returning *
      `,
      [now, jobId],
    );
    return mapBatchJob(updatedRows.rows[0]);
  });
}

async function refreshBatchJobCountersInTransaction(
  client: PoolClient,
  jobId: string,
  now: string,
): Promise<void> {
  await client.query(
    `
    update batch_jobs
    set completed_items = stats.completed_items,
      failed_items = stats.failed_items,
      credits_charged = stats.credits_charged,
      output_seconds = stats.output_seconds,
      updated_at = $2
    from (
      select
        count(*) filter (where status = 'success')::int as completed_items,
        count(*) filter (where status = 'failed')::int as failed_items,
        coalesce(sum(credits_charged), 0)::int as credits_charged,
        coalesce(sum(output_seconds), 0)::int as output_seconds
      from batch_job_items
      where job_id = $1
    ) stats
    where batch_jobs.id = $1
    `,
    [jobId, now],
  );
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
  return withTransaction(async (client) => {
    const now = new Date().toISOString();
    const timeoutMs = Math.max(1, input.timeoutMs);
    const rows = await client.query<BatchJobRow>(
      `
      select *
      from batch_jobs
      where status = 'running'
        and coalesce(worker_heartbeat_at, updated_at, started_at, created_at) <= $1::timestamptz - ($2::text || ' milliseconds')::interval
      for update skip locked
      `,
      [now, timeoutMs],
    );
    const result: StuckBatchRecoveryResult = {
      recoveredJobs: 0,
      movedToReviewJobs: 0,
      resetItems: 0,
      failedItems: 0,
      recoveredJobIds: [],
      reviewJobIds: [],
    };

    for (const job of rows.rows) {
      const shouldReview = toNumber(job.worker_attempt_count) >= input.maxRecoveries;
      if (shouldReview) {
        const failedRows = await client.query(
          `
          update batch_job_items
          set status = 'failed',
            error_message = 'Worker became stuck too many times. Admin review required.',
            attempt_count = greatest(attempt_count, $1),
            next_retry_at = null,
            updated_at = $2
          where job_id = $3 and status in ('queued', 'running')
          returning id
          `,
          [input.maxItemAttempts, now, job.id],
        );
        result.failedItems += failedRows.rowCount ?? 0;
        await client.query(
          `
          update batch_jobs
          set status = 'needs_review',
            completed_at = $1,
            next_retry_at = null,
            dead_letter_reason = 'Worker became stuck too many times.',
            last_worker_error = 'Worker became stuck too many times.',
            error_message = 'Worker became stuck too many times.',
            updated_at = $1
          where id = $2
          `,
          [now, job.id],
        );
        result.movedToReviewJobs += 1;
        result.reviewJobIds.push(job.id);
        await refreshBatchJobCountersInTransaction(client, job.id, now);
        continue;
      }

      const resetRows = await client.query(
        `
        update batch_job_items
        set status = 'queued',
          error_message = 'Recovered from a stuck worker and queued for retry.',
          next_retry_at = $1,
          updated_at = $1
        where job_id = $2 and status = 'running' and attempt_count < $3
        returning id
        `,
        [now, job.id, input.maxItemAttempts],
      );
      result.resetItems += resetRows.rowCount ?? 0;

      const failedRows = await client.query(
        `
        update batch_job_items
        set status = 'failed',
          error_message = 'Worker became stuck while processing this item and retry limit was reached.',
          attempt_count = greatest(attempt_count, $1),
          next_retry_at = null,
          updated_at = $2
        where job_id = $3 and status = 'running'
        returning id
        `,
        [input.maxItemAttempts, now, job.id],
      );
      result.failedItems += failedRows.rowCount ?? 0;

      await client.query(
        `
        update batch_jobs
        set status = 'queued',
          next_retry_at = $1,
          worker_heartbeat_at = $1,
          last_worker_error = 'Recovered from stuck running state.',
          error_message = 'Recovered from stuck running state.',
          completed_at = null,
          updated_at = $1
        where id = $2
        `,
        [now, job.id],
      );
      result.recoveredJobs += 1;
      result.recoveredJobIds.push(job.id);
      await refreshBatchJobCountersInTransaction(client, job.id, now);
    }

    return result;
  });
}

export async function purgeQueuedBatchJobs(adminUserId: string, reason: string): Promise<number> {
  return withTransaction(async (client) => {
    const now = new Date().toISOString();
    const rows = await client.query<{ id: string }>(
      `
      select id from batch_jobs
      where status in ('queued', 'running')
      for update skip locked
      `
    );
    const jobIds = rows.rows.map((r) => r.id);
    if (jobIds.length === 0) return 0;

    await client.query(
      `
      update batch_job_items
      set status = 'failed',
        error_message = $1,
        attempt_count = greatest(attempt_count, 3),
        next_retry_at = null,
        updated_at = $2
      where job_id = any($3) and status in ('queued', 'running')
      `,
      [reason, now, jobIds],
    );

    await client.query(
      `
      update batch_jobs
      set status = 'failed',
        completed_at = $1,
        next_retry_at = null,
        last_worker_error = $2,
        error_message = $2,
        updated_at = $1
      where id = any($3)
      `,
      [now, reason, jobIds],
    );

    for (const jobId of jobIds) {
      await refreshBatchJobCountersInTransaction(client, jobId, now);
    }

    return jobIds.length;
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

function normalizeCleanupNumber(value: unknown): number {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? numeric : 0;
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

  return withTransaction(async (client) => {
    const targetBatchItems = await client.query<QueryResultRow & { count: number | string; bytes: number | string }>(
      `
      with target as (
        select batch_job_items.id, length(batch_job_items.audio_base64)::bigint as bytes
        from batch_job_items
        join batch_jobs on batch_jobs.id = batch_job_items.job_id
        where batch_job_items.audio_base64 is not null
          and batch_jobs.status in ('completed', 'partial', 'failed', 'needs_review')
          and coalesce(batch_jobs.completed_at, batch_jobs.updated_at, batch_jobs.created_at) < $1::timestamptz
        order by coalesce(batch_jobs.completed_at, batch_jobs.updated_at, batch_jobs.created_at), batch_job_items.updated_at
        limit $2
      )
      select count(*)::int as count, coalesce(sum(bytes), 0)::bigint as bytes from target
      `,
      [cutoffAt, limit],
    );
    const targetGenerations = await client.query<QueryResultRow & { count: number | string; bytes: number | string }>(
      `
      with target as (
        select id, length(audio_base64)::bigint as bytes
        from generations
        where audio_base64 is not null
          and status = 'success'
          and created_at < $1::timestamptz
        order by created_at
        limit $2
      )
      select count(*)::int as count, coalesce(sum(bytes), 0)::bigint as bytes from target
      `,
      [cutoffAt, limit],
    );
    const targetCloneSamples = await client.query<QueryResultRow & { count: number | string; bytes: number | string }>(
      `
      with target as (
        select id, length(clone_sample_base64)::bigint as bytes
        from batch_jobs
        where clone_sample_base64 is not null
          and status in ('completed', 'partial', 'failed', 'needs_review')
          and coalesce(completed_at, updated_at, created_at) < $1::timestamptz
        order by coalesce(completed_at, updated_at, created_at)
        limit $2
      )
      select count(*)::int as count, coalesce(sum(bytes), 0)::bigint as bytes from target
      `,
      [cutoffAt, limit],
    );

    const batchItemsCleared = normalizeCleanupNumber(targetBatchItems.rows[0]?.count);
    const generationsCleared = normalizeCleanupNumber(targetGenerations.rows[0]?.count);
    const cloneSamplesCleared = normalizeCleanupNumber(targetCloneSamples.rows[0]?.count);
    const estimatedBytesReleased =
      normalizeCleanupNumber(targetBatchItems.rows[0]?.bytes) +
      normalizeCleanupNumber(targetGenerations.rows[0]?.bytes) +
      normalizeCleanupNumber(targetCloneSamples.rows[0]?.bytes);

    if (!dryRun) {
      const now = new Date().toISOString();
      await client.query(
        `
        with target as (
          select batch_job_items.id
          from batch_job_items
          join batch_jobs on batch_jobs.id = batch_job_items.job_id
          where batch_job_items.audio_base64 is not null
            and batch_jobs.status in ('completed', 'partial', 'failed', 'needs_review')
            and coalesce(batch_jobs.completed_at, batch_jobs.updated_at, batch_jobs.created_at) < $1::timestamptz
          order by coalesce(batch_jobs.completed_at, batch_jobs.updated_at, batch_jobs.created_at), batch_job_items.updated_at
          limit $2
        )
        update batch_job_items
        set audio_base64 = null,
          content_type = null,
          updated_at = $3
        where id in (select id from target)
        `,
        [cutoffAt, limit, now],
      );
      await client.query(
        `
        with target as (
          select id
          from generations
          where audio_base64 is not null
            and status = 'success'
            and created_at < $1::timestamptz
          order by created_at
          limit $2
        )
        update generations
        set audio_base64 = null,
          content_type = null
        where id in (select id from target)
        `,
        [cutoffAt, limit],
      );
      await client.query(
        `
        with target as (
          select id
          from batch_jobs
          where clone_sample_base64 is not null
            and status in ('completed', 'partial', 'failed', 'needs_review')
            and coalesce(completed_at, updated_at, created_at) < $1::timestamptz
          order by coalesce(completed_at, updated_at, created_at)
          limit $2
        )
        update batch_jobs
        set clone_sample_base64 = null,
          clone_sample_mime_type = null,
          clone_sample_file_name = null,
          updated_at = $3
        where id in (select id from target)
        `,
        [cutoffAt, limit, now],
      );
    }

    return {
      cutoffAt,
      retentionDays,
      dryRun,
      limit,
      batchItemsCleared,
      generationsCleared,
      cloneSamplesCleared,
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
  const stuckTimeoutMs = Math.max(1, options?.stuckTimeoutMs ?? 15 * 60 * 1000);
  const rows = await queryRows<
    QueryResultRow & {
      queued_jobs: number | string;
      ready_queued_jobs: number | string;
      running_jobs: number | string;
      stuck_jobs: number | string;
      needs_review_jobs: number | string;
      failed_jobs: number | string;
      oldest_queued_at: Date | string | null;
    }
  >(
    `
    select
      count(*) filter (where status = 'queued')::int as queued_jobs,
      count(*) filter (where status = 'queued' and (next_retry_at is null or next_retry_at <= now()))::int as ready_queued_jobs,
      count(*) filter (where status = 'running')::int as running_jobs,
      count(*) filter (
        where status = 'running'
          and coalesce(worker_heartbeat_at, updated_at, started_at, created_at) <= now() - ($1::text || ' milliseconds')::interval
      )::int as stuck_jobs,
      count(*) filter (where status = 'needs_review')::int as needs_review_jobs,
      count(*) filter (where status = 'failed')::int as failed_jobs,
      min(created_at) filter (where status = 'queued') as oldest_queued_at
    from batch_jobs
    `,
    [stuckTimeoutMs],
  );
  const heartbeatRows = await queryRows<WorkerHeartbeatRow>(
    "select * from worker_heartbeats order by last_seen_at desc limit 1",
  );
  const heartbeat = heartbeatRows[0] ? mapWorkerHeartbeat(heartbeatRows[0]) : null;
  const row = rows[0];
  return {
    queuedJobs: toNumber(row?.queued_jobs),
    readyQueuedJobs: toNumber(row?.ready_queued_jobs),
    runningJobs: toNumber(row?.running_jobs),
    stuckJobs: toNumber(row?.stuck_jobs),
    needsReviewJobs: toNumber(row?.needs_review_jobs),
    failedJobs: toNumber(row?.failed_jobs),
    oldestQueuedAt: nullableIso(row?.oldest_queued_at ?? null),
    lastWorkerSeenAt: heartbeat?.lastSeenAt ?? null,
    lastWorkerStatus: heartbeat?.status ?? null,
    lastWorkerError: heartbeat?.lastError ?? null,
    latestUpstreamLatencyMs: heartbeat?.upstreamLatencyMs ?? null,
    latestUpstreamOk: heartbeat?.upstreamOk ?? null,
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
  const health = await getBatchQueueHealth({ stuckTimeoutMs: input.stuckTimeoutMs });
  const now = new Date().toISOString();
  const rows = await queryRows<WorkerHeartbeatRow>(
    `
    insert into worker_heartbeats (
      id, worker_id, status, last_seen_at, current_job_id, processed_job_id,
      processed_item_count, queue_depth, running_jobs, stuck_jobs, needs_review_jobs,
      upstream_latency_ms, upstream_ok, last_error, created_at, updated_at
    )
    values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $4, $4)
    on conflict (worker_id) do update
    set status = excluded.status,
      last_seen_at = excluded.last_seen_at,
      current_job_id = excluded.current_job_id,
      processed_job_id = excluded.processed_job_id,
      processed_item_count = excluded.processed_item_count,
      queue_depth = excluded.queue_depth,
      running_jobs = excluded.running_jobs,
      stuck_jobs = excluded.stuck_jobs,
      needs_review_jobs = excluded.needs_review_jobs,
      upstream_latency_ms = excluded.upstream_latency_ms,
      upstream_ok = excluded.upstream_ok,
      last_error = excluded.last_error,
      updated_at = excluded.updated_at
    returning *
    `,
    [
      randomUUID(),
      input.workerId,
      input.status,
      now,
      input.currentJobId,
      input.processedJobId,
      Math.max(0, Math.round(input.processedItemCount)),
      health.queuedJobs,
      health.runningJobs,
      health.stuckJobs,
      health.needsReviewJobs,
      input.upstreamLatencyMs === null ? null : Math.max(0, Math.round(input.upstreamLatencyMs)),
      input.upstreamOk,
      input.lastError,
    ],
  );
  return mapWorkerHeartbeat(rows[0]);
}

export async function listWorkerHeartbeats(options?: { limit?: number }): Promise<WorkerHeartbeatRecord[]> {
  const limit = Math.max(1, Math.min(options?.limit ?? 10, 50));
  const rows = await queryRows<WorkerHeartbeatRow>(
    "select * from worker_heartbeats order by last_seen_at desc limit $1",
    [limit],
  );
  return rows.map(mapWorkerHeartbeat);
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
  const now = new Date().toISOString();
  const rows = await queryRows<PaymentOrderRow>(
    `
    insert into payment_orders (
      id, user_id, plan_id, plan_name, quantity, unit_price_cents,
      total_price_cents, tokens, payment_method, status, user_note,
      payment_reference, proof_image_data_url, khqr_payload, khqr_md5,
      khqr_image_data_url, khqr_currency, khqr_amount, khqr_expires_at,
      payment_provider,
      created_at, updated_at
    )
    values (
      $1, $2, $3, $4, $5, $6, $7, $8, 'khqr', 'pending', $9, $10, $11,
      $12, $13, $14, $15, $16, $17, $18, $19, $19
    )
    returning *
    `,
    [
      input.id ?? randomUUID(),
      input.userId,
      input.planId,
      input.planName,
      input.quantity,
      input.unitPriceCents,
      input.unitPriceCents * input.quantity,
      input.tokensPerPack * input.quantity,
      input.userNote,
      input.paymentReference,
      input.proofImageDataUrl,
      input.khqrPayload ?? null,
      input.khqrMd5 ?? null,
      input.khqrImageDataUrl ?? null,
      input.khqrCurrency ?? null,
      input.khqrAmount ?? null,
      input.khqrExpiresAt ?? null,
      input.paymentProvider ?? null,
      now,
    ],
  );
  return mapPaymentOrder(rows[0]);
}

function isExpiredPendingOrder(order: PaymentOrderRecord, now = new Date()): boolean {
  if (order.status !== "pending" || !order.khqrExpiresAt) return false;
  const expiresAt = new Date(order.khqrExpiresAt);
  return !Number.isNaN(expiresAt.getTime()) && expiresAt.getTime() <= now.getTime();
}

async function expireStalePaymentOrders(): Promise<void> {
  await queryRows(
    `
    update payment_orders
    set status = 'expired',
      admin_note = coalesce(admin_note, 'KHQR expired before payment confirmation.'),
      expired_at = coalesce(expired_at, now()),
      updated_at = now()
    where status = 'pending'
      and khqr_expires_at is not null
      and khqr_expires_at <= now()
    returning id
    `,
  );
}

async function markLockedOrderExpired(
  client: PoolClient,
  orderId: string,
): Promise<PaymentOrderRecord> {
  const updatedRows = await client.query<PaymentOrderRow>(
    `
    update payment_orders
    set status = 'expired',
      admin_note = coalesce(admin_note, 'KHQR expired before payment confirmation.'),
      expired_at = coalesce(expired_at, now()),
      updated_at = now()
    where id = $1
    returning *
    `,
    [orderId],
  );
  return mapPaymentOrder(updatedRows.rows[0]);
}

export async function listUserPaymentOrders(userId: string): Promise<PaymentOrderRecord[]> {
  // Fire-and-forget: don't block the read path for this maintenance operation.
  const expirePromise = expireStalePaymentOrders().catch(() => {});
  const rows = await queryRows<PaymentOrderRow>(
    "select * from payment_orders where user_id = $1 order by created_at desc",
    [userId],
  );
  // Ensure expire completes before returning (but doesn't block the query).
  await expirePromise.catch(() => {});
  return rows.map(mapPaymentOrder);
}

export async function submitPaymentOrderProof(input: {
  orderId: string;
  userId: string;
  paymentReference: string | null;
  userNote: string | null;
  paymentMethod?: "ABA" | "ACLEDA" | null;
  proofImageDataUrl: string | null;
}): Promise<{ ok: boolean; order: PaymentOrderRecord | null; reason?: string }> {
  return withTransaction(async (client) => {
    const orderRows = await client.query<PaymentOrderRow>(
      "select * from payment_orders where id = $1 and user_id = $2 for update",
      [input.orderId, input.userId],
    );
    const orderRow = orderRows.rows[0];
    if (!orderRow) {
      return { ok: false, order: null, reason: "ORDER_NOT_FOUND" };
    }

    const order = mapPaymentOrder(orderRow);
    if (order.status === "expired") {
      return { ok: false, order, reason: "ORDER_EXPIRED" };
    }
    if (isExpiredPendingOrder(order)) {
      return {
        ok: false,
        order: await markLockedOrderExpired(client, input.orderId),
        reason: "ORDER_EXPIRED",
      };
    }
    if (order.status !== "pending") {
      return { ok: false, order, reason: "ORDER_ALREADY_DECIDED" };
    }

    const now = new Date().toISOString();
    const payload = JSON.stringify({
      source: "user_payment_confirmation",
      paymentReference: input.paymentReference,
      paymentMethod: input.paymentMethod ?? null,
      note: input.userNote,
      proofUploaded: Boolean(input.proofImageDataUrl || order.proofImageDataUrl),
      submittedAt: now,
    });
    const updatedRows = await client.query<PaymentOrderRow>(
      `
      update payment_orders
      set payment_reference = coalesce($1, payment_reference),
        user_note = coalesce($2, user_note),
        proof_image_data_url = coalesce($3, proof_image_data_url),
        provider_reference = coalesce($1, provider_reference),
        provider_status = 'user_reported_paid',
        provider_amount = coalesce(provider_amount, khqr_amount),
        provider_currency = coalesce(provider_currency, khqr_currency),
        provider_payload = $4,
        updated_at = $5
      where id = $6
      returning *
      `,
      [
        input.paymentReference || null,
        input.userNote || null,
        input.proofImageDataUrl || null,
        payload,
        now,
        input.orderId,
      ],
    );

    return { ok: true, order: mapPaymentOrder(updatedRows.rows[0]) };
  });
}

export async function cancelPaymentOrder(input: {
  orderId: string;
  userId: string;
}): Promise<{ ok: boolean; order: PaymentOrderRecord | null; reason?: string }> {
  return withTransaction(async (client) => {
    const orderRows = await client.query<PaymentOrderRow>(
      "select * from payment_orders where id = $1 and user_id = $2 for update",
      [input.orderId, input.userId],
    );
    const orderRow = orderRows.rows[0];
    if (!orderRow) {
      return { ok: false, order: null, reason: "ORDER_NOT_FOUND" };
    }

    const order = mapPaymentOrder(orderRow);
    if (order.status === "approved") {
      return { ok: false, order, reason: "ORDER_ALREADY_APPROVED" };
    }
    if (isExpiredPendingOrder(order)) {
      return {
        ok: false,
        order: await markLockedOrderExpired(client, input.orderId),
        reason: "ORDER_EXPIRED",
      };
    }
    if (order.status !== "pending") {
      return { ok: false, order, reason: "ORDER_ALREADY_DECIDED" };
    }

    const now = new Date().toISOString();
    const updatedRows = await client.query<PaymentOrderRow>(
      `
      update payment_orders
      set status = 'cancelled',
        admin_note = 'Cancelled by customer before payment confirmation.',
        updated_at = $1
      where id = $2
      returning *
      `,
      [now, input.orderId],
    );

    return { ok: true, order: mapPaymentOrder(updatedRows.rows[0]) };
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
  return withTransaction(async (client) => {
    const orderRows = await client.query<PaymentOrderRow>(
      "select * from payment_orders where id = $1 for update",
      [input.orderId],
    );
    const orderRow = orderRows.rows[0];
    if (!orderRow) {
      return { ok: false, order: null, reason: "ORDER_NOT_FOUND" };
    }

    const order = mapPaymentOrder(orderRow);
    if (order.status === "approved") {
      return { ok: true, order, reason: "ORDER_ALREADY_APPROVED" };
    }
    if (order.status === "expired") {
      return { ok: false, order, reason: "ORDER_EXPIRED" };
    }
    if (isExpiredPendingOrder(order)) {
      return {
        ok: false,
        order: await markLockedOrderExpired(client, input.orderId),
        reason: "ORDER_EXPIRED",
      };
    }
    if (order.status !== "pending") {
      return { ok: false, order, reason: "ORDER_ALREADY_DECIDED" };
    }
    if (input.providerTransactionId) {
      const duplicateRows = await client.query<PaymentOrderRow>(
        `
        select *
        from payment_orders
        where provider_transaction_id = $1
          and id <> $2
          and status = 'approved'
        limit 1
        `,
        [input.providerTransactionId, input.orderId],
      );
      if (duplicateRows.rows[0]) {
        return { ok: false, order, reason: "DUPLICATE_PROVIDER_TRANSACTION" };
      }
    }
    if (!paymentAmountMatches(order, input.providerAmount, input.providerCurrency)) {
      return { ok: false, order, reason: "AMOUNT_OR_CURRENCY_MISMATCH" };
    }

    const now = new Date().toISOString();
    const txId = randomUUID();
    await client.query(
      `
      insert into token_transactions (id, user_id, amount, type, note, created_at)
      values ($1, $2, $3, 'purchase', $4, $5)
      `,
      [
        txId,
        order.userId,
        order.tokens,
        `Auto approved ${paymentProviderNote(input.provider)} order ${order.id}`,
        now,
      ],
    );

    const updatedRows = await client.query<PaymentOrderRow>(
      `
      update payment_orders
      set status = 'approved',
        payment_provider = $1,
        provider_transaction_id = $2,
        provider_reference = $3,
        provider_approval_code = $4,
        provider_status_code = $5,
        provider_status = $6,
        provider_amount = $7,
        provider_currency = $8,
        provider_payload = $9,
        paid_at = $10,
        admin_note = $11,
        token_transaction_id = $12,
        approved_at = $13,
        approved_by_user_id = $14,
        updated_at = $13
      where id = $15
      returning *
      `,
      [
        input.provider,
        input.providerTransactionId,
        input.providerReference,
        input.providerApprovalCode,
        input.providerStatusCode,
        input.providerStatus,
        input.providerAmount,
        input.providerCurrency,
        input.providerPayload,
        input.paidAt ?? now,
        input.adminNote ?? paymentProviderApprovalNote(input.provider),
        txId,
        now,
        input.approvedByUserId ?? null,
        input.orderId,
      ],
    );

    return { ok: true, order: mapPaymentOrder(updatedRows.rows[0]) };
  });
}

export async function listPaymentOrdersForAdmin(
  status: PaymentOrderStatus | "all" = "pending",
): Promise<PaymentOrderWithUser[]> {
  await expireStalePaymentOrders();
  const rows = await queryRows<PaymentOrderWithUserRow>(
    `
    select payment_orders.*, users.email as user_email
    from payment_orders
    left join users on users.id = payment_orders.user_id
    where ($1 = 'all' or payment_orders.status = $1)
    order by payment_orders.created_at desc
    `,
    [status],
  );
  return rows.map(mapPaymentOrderWithUser);
}

export async function approvePaymentOrder(input: {
  orderId: string;
  adminUserId: string;
  adminNote: string | null;
}): Promise<{ ok: boolean; order: PaymentOrderRecord | null; reason?: string }> {
  return withTransaction(async (client) => {
    const orderRows = await client.query<PaymentOrderRow>(
      "select * from payment_orders where id = $1 for update",
      [input.orderId],
    );
    const orderRow = orderRows.rows[0];
    if (!orderRow) {
      return { ok: false, order: null, reason: "ORDER_NOT_FOUND" };
    }

    const order = mapPaymentOrder(orderRow);
    if (order.status === "expired") {
      return { ok: false, order, reason: "ORDER_EXPIRED" };
    }
    if (isExpiredPendingOrder(order)) {
      return {
        ok: false,
        order: await markLockedOrderExpired(client, input.orderId),
        reason: "ORDER_EXPIRED",
      };
    }
    if (order.status !== "pending") {
      return { ok: false, order, reason: "ORDER_ALREADY_DECIDED" };
    }

    const now = new Date().toISOString();
    const txId = randomUUID();
    await client.query(
      `
      insert into token_transactions (id, user_id, amount, type, note, created_at)
      values ($1, $2, $3, 'purchase', $4, $5)
      `,
      [txId, order.userId, order.tokens, `Approved ${order.planName} payment order ${order.id}`, now],
    );

    const updatedRows = await client.query<PaymentOrderRow>(
      `
      update payment_orders
      set status = 'approved',
        admin_note = $1,
        token_transaction_id = $2,
        approved_at = $3,
        approved_by_user_id = $4,
        updated_at = $3
      where id = $5
      returning *
      `,
      [input.adminNote, txId, now, input.adminUserId, input.orderId],
    );

    return { ok: true, order: mapPaymentOrder(updatedRows.rows[0]) };
  });
}

export async function rejectPaymentOrder(input: {
  orderId: string;
  adminUserId: string;
  adminNote: string | null;
}): Promise<{ ok: boolean; order: PaymentOrderRecord | null; reason?: string }> {
  return withTransaction(async (client) => {
    const orderRows = await client.query<PaymentOrderRow>(
      "select * from payment_orders where id = $1 for update",
      [input.orderId],
    );
    const orderRow = orderRows.rows[0];
    if (!orderRow) {
      return { ok: false, order: null, reason: "ORDER_NOT_FOUND" };
    }

    const order = mapPaymentOrder(orderRow);
    if (order.status === "expired") {
      return { ok: false, order, reason: "ORDER_EXPIRED" };
    }
    if (isExpiredPendingOrder(order)) {
      return {
        ok: false,
        order: await markLockedOrderExpired(client, input.orderId),
        reason: "ORDER_EXPIRED",
      };
    }
    if (order.status !== "pending") {
      return { ok: false, order, reason: "ORDER_ALREADY_DECIDED" };
    }

    const now = new Date().toISOString();
    const updatedRows = await client.query<PaymentOrderRow>(
      `
      update payment_orders
      set status = 'rejected',
        admin_note = $1,
        rejected_at = $2,
        rejected_by_user_id = $3,
        updated_at = $2
      where id = $4
      returning *
      `,
      [input.adminNote, now, input.adminUserId, input.orderId],
    );

    return { ok: true, order: mapPaymentOrder(updatedRows.rows[0]) };
  });
}

export async function createPaymentSupportTicket(input: {
  userId: string;
  paymentOrderId: string;
  userMessage: string;
}): Promise<{ ok: boolean; ticket: PaymentSupportTicketRecord | null; reason?: string }> {
  return withTransaction(async (client) => {
    const orderRows = await client.query<PaymentOrderRow>(
      "select * from payment_orders where id = $1 and user_id = $2",
      [input.paymentOrderId, input.userId],
    );
    if (!orderRows.rows[0]) {
      return { ok: false, ticket: null, reason: "ORDER_NOT_FOUND" };
    }

    const existingRows = await client.query<PaymentSupportTicketRow>(
      `
      select *
      from payment_support_tickets
      where payment_order_id = $1 and status = 'open'
      order by created_at desc
      limit 1
      `,
      [input.paymentOrderId],
    );
    if (existingRows.rows[0]) {
      return {
        ok: true,
        ticket: mapPaymentSupportTicket(existingRows.rows[0]),
        reason: "TICKET_ALREADY_OPEN",
      };
    }

    const now = new Date().toISOString();
    const rows = await client.query<PaymentSupportTicketRow>(
      `
      insert into payment_support_tickets (
        id, user_id, payment_order_id, status, user_message, admin_note,
        resolved_by_user_id, created_at, updated_at, resolved_at
      )
      values ($1, $2, $3, 'open', $4, null, null, $5, $5, null)
      returning *
      `,
      [randomUUID(), input.userId, input.paymentOrderId, input.userMessage, now],
    );
    return { ok: true, ticket: mapPaymentSupportTicket(rows.rows[0]) };
  });
}

export async function listUserPaymentSupportTickets(
  userId: string,
): Promise<PaymentSupportTicketRecord[]> {
  const rows = await queryRows<PaymentSupportTicketRow>(
    `
    select *
    from payment_support_tickets
    where user_id = $1
    order by created_at desc
    `,
    [userId],
  );
  return rows.map(mapPaymentSupportTicket);
}

export async function listPaymentSupportTicketsForAdmin(
  status: PaymentSupportTicketStatus | "all" = "open",
): Promise<PaymentSupportTicketWithOrder[]> {
  const rows = await queryRows<PaymentSupportTicketWithOrderRow>(
    `
    select payment_support_tickets.*,
      users.email as user_email,
      payment_orders.status as order_status,
      payment_orders.plan_name,
      payment_orders.quantity,
      payment_orders.total_price_cents,
      payment_orders.tokens
    from payment_support_tickets
    left join users on users.id = payment_support_tickets.user_id
    left join payment_orders on payment_orders.id = payment_support_tickets.payment_order_id
    where ($1 = 'all' or payment_support_tickets.status = $1)
    order by payment_support_tickets.created_at desc
    `,
    [status],
  );
  return rows.map(mapPaymentSupportTicketWithOrder);
}

export async function resolvePaymentSupportTicket(input: {
  ticketId: string;
  adminUserId: string;
  adminNote: string | null;
}): Promise<{ ok: boolean; ticket: PaymentSupportTicketRecord | null; reason?: string }> {
  return withTransaction(async (client) => {
    const ticketRows = await client.query<PaymentSupportTicketRow>(
      "select * from payment_support_tickets where id = $1 for update",
      [input.ticketId],
    );
    const ticket = ticketRows.rows[0];
    if (!ticket) {
      return { ok: false, ticket: null, reason: "TICKET_NOT_FOUND" };
    }
    if (ticket.status === "resolved") {
      return {
        ok: true,
        ticket: mapPaymentSupportTicket(ticket),
        reason: "TICKET_ALREADY_RESOLVED",
      };
    }

    const now = new Date().toISOString();
    const updatedRows = await client.query<PaymentSupportTicketRow>(
      `
      update payment_support_tickets
      set status = 'resolved',
        admin_note = $1,
        resolved_by_user_id = $2,
        updated_at = $3,
        resolved_at = $3
      where id = $4
      returning *
      `,
      [input.adminNote, input.adminUserId, now, input.ticketId],
    );
    return { ok: true, ticket: mapPaymentSupportTicket(updatedRows.rows[0]) };
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
  const rows = await queryRows<PaymentWebhookEventRow>(
    `
    insert into payment_webhook_events (
      id, provider, order_id, payment_order_id, event_status, reason,
      signature_valid, signature_configured, provider_transaction_id,
      provider_reference, provider_approval_code, provider_status_code,
      provider_status, provider_amount, provider_currency, provider_payload,
      raw_body, created_at
    )
    values (
      $1, $2, $3, $4, $5, $6, $7, $8, $9,
      $10, $11, $12, $13, $14, $15, $16, $17, $18
    )
    returning *
    `,
    [
      randomUUID(),
      input.provider,
      input.orderId,
      input.paymentOrderId ?? null,
      input.eventStatus,
      input.reason,
      input.signatureValid,
      input.signatureConfigured,
      input.providerTransactionId,
      input.providerReference,
      input.providerApprovalCode,
      input.providerStatusCode,
      input.providerStatus,
      input.providerAmount,
      input.providerCurrency,
      input.providerPayload,
      input.rawBody,
      new Date().toISOString(),
    ],
  );
  return mapPaymentWebhookEvent(rows[0]);
}

export async function listPaymentWebhookEventsForAdmin(options?: {
  limit?: number;
  orderId?: string | null;
  status?: PaymentWebhookEventStatus | "all";
}): Promise<PaymentWebhookEventWithOrder[]> {
  await expireStalePaymentOrders();
  const limit = Math.max(1, Math.min(options?.limit ?? 100, 500));
  const orderId = options?.orderId?.trim() || null;
  const status = options?.status ?? "all";
  const rows = await queryRows<PaymentWebhookEventWithOrderRow>(
    `
    select
      payment_webhook_events.*,
      users.email as user_email,
      payment_orders.status as order_status
    from payment_webhook_events
    left join payment_orders
      on payment_orders.id = coalesce(payment_webhook_events.payment_order_id, payment_webhook_events.order_id)
    left join users on users.id = payment_orders.user_id
    where ($1::text is null
        or payment_webhook_events.order_id = $1
        or payment_webhook_events.payment_order_id = $1)
      and ($2 = 'all' or payment_webhook_events.event_status = $2)
    order by payment_webhook_events.created_at desc
    limit $3
    `,
    [orderId, status, limit],
  );
  return rows.map(mapPaymentWebhookEventWithOrder);
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
  if (input.telegramUpdateId !== null) {
    const existingRows = await queryRows<TelegramPaymentEventRow>(
      "select * from telegram_payment_events where telegram_update_id = $1 limit 1",
      [input.telegramUpdateId],
    );
    if (existingRows[0]) return mapTelegramPaymentEvent(existingRows[0]);
  }

  const now = new Date().toISOString();
  const rows = await queryRows<TelegramPaymentEventRow>(
    `
    insert into telegram_payment_events (
      id, telegram_update_id, telegram_message_id, chat_id, chat_title,
      sender_id, sender_username, sender_name, sender_is_bot, raw_text,
      raw_payload, parsed_status, parsed_amount, parsed_currency,
      parsed_transaction_id, parsed_reference, matched_order_id,
      decision_status, decision_reason, auto_approve_attempted,
      created_at, updated_at
    )
    values (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
      $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $21
    )
    returning *
    `,
    [
      randomUUID(),
      input.telegramUpdateId,
      input.telegramMessageId,
      input.chatId,
      input.chatTitle,
      input.senderId,
      input.senderUsername,
      input.senderName,
      input.senderIsBot,
      input.rawText,
      input.rawPayload,
      input.parsedStatus,
      input.parsedAmount,
      input.parsedCurrency,
      input.parsedTransactionId,
      input.parsedReference,
      input.matchedOrderId,
      input.decisionStatus,
      input.decisionReason,
      input.autoApproveAttempted,
      now,
    ],
  );
  return mapTelegramPaymentEvent(rows[0]);
}

export async function createTelegramPaymentAction(input: {
  orderId: string | null;
  action: "approve";
  status: TelegramPaymentActionStatus;
  reason: string | null;
  telegramUserId: string | null;
  telegramUsername: string | null;
  telegramFirstName: string | null;
  telegramLastName: string | null;
  callbackQueryId: string | null;
  messageChatId: string | null;
  messageId: string | null;
}): Promise<TelegramPaymentActionRecord> {
  const rows = await queryRows<TelegramPaymentActionRow>(
    `
    insert into telegram_payment_actions (
      id, order_id, action, status, reason, telegram_user_id,
      telegram_username, telegram_first_name, telegram_last_name,
      callback_query_id, message_chat_id, message_id, created_at
    )
    values (
      $1,
      (
        select case
          when $2::text is null then null
          when exists (select 1 from payment_orders where id = $2) then $2
          else null
        end
      ),
      $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13
    )
    returning *
    `,
    [
      randomUUID(),
      input.orderId,
      input.action,
      input.status,
      input.reason,
      input.telegramUserId,
      input.telegramUsername,
      input.telegramFirstName,
      input.telegramLastName,
      input.callbackQueryId,
      input.messageChatId,
      input.messageId,
      new Date().toISOString(),
    ],
  );
  return mapTelegramPaymentAction(rows[0]);
}

export async function updateTelegramPaymentEventDecision(input: {
  eventId: string;
  decisionStatus: TelegramPaymentEventDecision;
  decisionReason: string | null;
  matchedOrderId?: string | null;
  autoApproveAttempted?: boolean;
}): Promise<TelegramPaymentEventRecord | null> {
  const rows = await queryRows<TelegramPaymentEventRow>(
    `
    update telegram_payment_events
    set decision_status = $1,
      decision_reason = $2,
      matched_order_id = case when $3::boolean then $4 else matched_order_id end,
      auto_approve_attempted = case when $5::boolean then $6 else auto_approve_attempted end,
      updated_at = $7
    where id = $8
    returning *
    `,
    [
      input.decisionStatus,
      input.decisionReason,
      "matchedOrderId" in input,
      input.matchedOrderId ?? null,
      "autoApproveAttempted" in input,
      input.autoApproveAttempted ?? false,
      new Date().toISOString(),
      input.eventId,
    ],
  );
  return rows[0] ? mapTelegramPaymentEvent(rows[0]) : null;
}

export async function getTelegramPaymentEventById(
  eventId: string,
): Promise<TelegramPaymentEventWithOrder | null> {
  const rows = await queryRows<TelegramPaymentEventWithOrderRow>(
    `
    select
      telegram_payment_events.*,
      users.email as user_email,
      payment_orders.status as order_status
    from telegram_payment_events
    left join payment_orders on payment_orders.id = telegram_payment_events.matched_order_id
    left join users on users.id = payment_orders.user_id
    where telegram_payment_events.id = $1
    limit 1
    `,
    [eventId],
  );
  return rows[0] ? mapTelegramPaymentEventWithOrder(rows[0]) : null;
}

export async function findTelegramPaymentEventByTransactionId(
  transactionId: string,
): Promise<TelegramPaymentEventRecord | null> {
  const normalized = transactionId.trim();
  if (!normalized) return null;
  const rows = await queryRows<TelegramPaymentEventRow>(
    "select * from telegram_payment_events where parsed_transaction_id = $1 order by created_at desc limit 1",
    [normalized],
  );
  return rows[0] ? mapTelegramPaymentEvent(rows[0]) : null;
}

export async function listTelegramPaymentEventsForAdmin(options?: {
  limit?: number;
  orderId?: string | null;
  status?: TelegramPaymentEventDecision | "all";
}): Promise<TelegramPaymentEventWithOrder[]> {
  await expireStalePaymentOrders();
  const limit = Math.max(1, Math.min(options?.limit ?? 100, 500));
  const orderId = options?.orderId?.trim() || null;
  const status = options?.status ?? "all";
  const rows = await queryRows<TelegramPaymentEventWithOrderRow>(
    `
    select
      telegram_payment_events.*,
      users.email as user_email,
      payment_orders.status as order_status
    from telegram_payment_events
    left join payment_orders on payment_orders.id = telegram_payment_events.matched_order_id
    left join users on users.id = payment_orders.user_id
    where ($1::text is null or telegram_payment_events.matched_order_id = $1)
      and ($2 = 'all' or telegram_payment_events.decision_status = $2)
    order by telegram_payment_events.created_at desc
    limit $3
    `,
    [orderId, status, limit],
  );
  return rows.map(mapTelegramPaymentEventWithOrder);
}

async function queryCustomerSummaries(whereSql = "", params: unknown[] = []): Promise<AdminCustomerSummary[]> {
  const rows = await queryRows<AdminCustomerSummaryRow>(
    `
    select
      users.*,
      coalesce(token_stats.token_balance, 0)::int as token_balance,
      coalesce(token_stats.total_credits_earned, 0)::int as total_credits_earned,
      coalesce(generation_stats.total_generations, 0)::int as total_generations,
      coalesce(generation_stats.api_requests, 0)::int as api_requests,
      coalesce(order_stats.payment_orders, 0)::int as payment_orders,
      coalesce(key_stats.active_api_keys, 0)::int as active_api_keys,
      greatest(
        users.updated_at,
        coalesce(generation_stats.last_generation_at, users.updated_at),
        coalesce(order_stats.last_order_at, users.updated_at),
        coalesce(key_stats.last_key_at, users.updated_at),
        coalesce(batch_stats.last_batch_at, users.updated_at)
      ) as last_activity_at
    from users
    left join lateral (
      select
        coalesce(sum(amount), 0)::int as token_balance,
        coalesce(sum(amount) filter (where amount > 0), 0)::int as total_credits_earned
      from token_transactions
      where token_transactions.user_id = users.id
    ) token_stats on true
    left join lateral (
      select
        count(*)::int as total_generations,
        count(*) filter (where source = 'api_key')::int as api_requests,
        max(created_at) as last_generation_at
      from generations
      where generations.user_id = users.id
    ) generation_stats on true
    left join lateral (
      select count(*)::int as payment_orders, max(updated_at) as last_order_at
      from payment_orders
      where payment_orders.user_id = users.id
    ) order_stats on true
    left join lateral (
      select
        count(*) filter (where revoked_at is null)::int as active_api_keys,
        max(coalesce(last_used_at, created_at)) as last_key_at
      from api_keys
      where api_keys.user_id = users.id
    ) key_stats on true
    left join lateral (
      select max(updated_at) as last_batch_at
      from batch_jobs
      where batch_jobs.user_id = users.id
    ) batch_stats on true
    ${whereSql}
    order by last_activity_at desc
    `,
    params,
  );
  return rows.map(mapAdminCustomerSummary);
}

export async function listCustomersForAdmin(): Promise<AdminCustomerSummary[]> {
  return queryCustomerSummaries();
}

export async function getCustomerForAdmin(userId: string): Promise<AdminCustomerDetail | null> {
  await expireStalePaymentOrders();
  const [summary] = await queryCustomerSummaries("where users.id = $1", [userId]);
  if (!summary) return null;

  const [transactionRows, apiKeyRows, generationRows, batchJobRows, paymentOrderRows, webhookRows] =
    await Promise.all([
      queryRows<TokenTransactionRow>(
        "select * from token_transactions where user_id = $1 order by created_at desc limit 150",
        [userId],
      ),
      queryRows<ApiKeyRow>(
        "select * from api_keys where user_id = $1 order by created_at desc",
        [userId],
      ),
      queryRows<GenerationRow>(
        "select * from generations where user_id = $1 order by created_at desc limit 100",
        [userId],
      ),
      queryRows<BatchJobRow>(
        "select * from batch_jobs where user_id = $1 order by created_at desc limit 50",
        [userId],
      ),
      queryRows<PaymentOrderRow>(
        "select * from payment_orders where user_id = $1 order by created_at desc",
        [userId],
      ),
      queryRows<PaymentWebhookEventRow>(
        `
        select payment_webhook_events.*
        from payment_webhook_events
        join payment_orders
          on payment_orders.id = coalesce(payment_webhook_events.payment_order_id, payment_webhook_events.order_id)
        where payment_orders.user_id = $1
        order by payment_webhook_events.created_at desc
        limit 100
        `,
        [userId],
      ),
    ]);

  return {
    ...summary,
    tokenTransactions: transactionRows.map(mapTokenTransaction),
    apiKeys: apiKeyRows.map(mapApiKey),
    generations: generationRows.map(mapGeneration),
    batchJobs: batchJobRows.map(mapBatchJob),
    paymentOrdersList: paymentOrderRows.map(mapPaymentOrder),
    webhookEvents: webhookRows.map(mapPaymentWebhookEvent),
  };
}

export async function adjustCustomerTokens(input: {
  userId: string;
  adminUserId: string;
  amount: number;
  note: string | null;
}): Promise<{ ok: boolean; transaction: TokenTransactionRecord | null; balance: number; reason?: string }> {
  return withTransaction(async (client) => {
    const userRows = await client.query<UserRow>("select * from users where id = $1 for update", [
      input.userId,
    ]);
    if (userRows.rows.length === 0) {
      return { ok: false, transaction: null, balance: 0, reason: "USER_NOT_FOUND" };
    }

    const balanceRows = await client.query<QueryResultRow & { balance: number | string }>(
      "select coalesce(sum(amount), 0)::int as balance from token_transactions where user_id = $1",
      [input.userId],
    );
    const currentBalance = toNumber(balanceRows.rows[0]?.balance);
    if (currentBalance + input.amount < 0) {
      return {
        ok: false,
        transaction: null,
        balance: currentBalance,
        reason: "INSUFFICIENT_BALANCE",
      };
    }

    const now = new Date().toISOString();
    const transactionRows = await client.query<TokenTransactionRow>(
      `
      insert into token_transactions (id, user_id, amount, type, note, created_at)
      values ($1, $2, $3, $4, $5, $6)
      returning *
      `,
      [
        randomUUID(),
        input.userId,
        input.amount,
        "admin_adjustment",
        input.note
          ? `${input.note} (admin ${input.adminUserId})`
          : `Admin adjustment by ${input.adminUserId}`,
        now,
      ],
    );
    await client.query("update users set updated_at = $1 where id = $2", [now, input.userId]);

    return {
      ok: true,
      transaction: mapTokenTransaction(transactionRows.rows[0]),
      balance: currentBalance + input.amount,
    };
  });
}

export async function suspendCustomer(input: {
  userId: string;
  adminUserId: string;
  reason: string;
}): Promise<UserRecord | null> {
  const now = new Date().toISOString();
  const rows = await queryRows<UserRow>(
    `
    update users
    set suspended_at = $1,
      suspended_reason = $2,
      suspended_by_user_id = $3,
      updated_at = $1
    where id = $4
    returning *
    `,
    [now, input.reason, input.adminUserId, input.userId],
  );
  return rows[0] ? mapUser(rows[0]) : null;
}

export async function unsuspendCustomer(input: {
  userId: string;
  adminUserId: string;
}): Promise<UserRecord | null> {
  return withTransaction(async (client) => {
    const now = new Date().toISOString();
    const rows = await client.query<UserRow>(
      `
      update users
      set suspended_at = null,
        suspended_reason = null,
        suspended_by_user_id = null,
        updated_at = $1
      where id = $2
      returning *
      `,
      [now, input.userId],
    );
    if (rows.rows.length === 0) return null;

    await client.query(
      `
      insert into token_transactions (id, user_id, amount, type, note, created_at)
      values ($1, $2, $3, $4, $5, $6)
      `,
      [
        randomUUID(),
        input.userId,
        0,
        "admin_adjustment",
        `Account unsuspended by ${input.adminUserId}`,
        now,
      ],
    );
    return mapUser(rows.rows[0]);
  });
}

export async function revokeAllUserApiKeysForAdmin(userId: string): Promise<number> {
  return withTransaction(async (client) => {
    const now = new Date().toISOString();
    const rows = await client.query<ApiKeyRow>(
      `
      update api_keys
      set revoked_at = $1
      where user_id = $2 and revoked_at is null
      returning *
      `,
      [now, userId],
    );
    if (rows.rows.length > 0) {
      await client.query("update users set updated_at = $1 where id = $2", [now, userId]);
    }
    return rows.rows.length;
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
  const q = options?.q?.trim() ?? "";
  const rows = await queryRows<GenerationWithUserRow>(
    `
    select generations.*, users.email as user_email
    from generations
    left join users on users.id = generations.user_id
    where ($1 = 'all' or generations.mode = $1)
      and ($2 = 'all' or generations.source = $2)
      and ($3 = 'all' or generations.status = $3)
      and (
        $4 = ''
        or coalesce(users.email, '') ilike '%' || $4 || '%'
        or generations.input_preview ilike '%' || $4 || '%'
        or generations.model ilike '%' || $4 || '%'
        or generations.voice ilike '%' || $4 || '%'
      )
    order by generations.created_at desc
    limit $5
    `,
    [mode, source, status, q, limit],
  );
  return rows.map(mapGenerationWithUser);
}

export type AdminGenerationsPage = {
  rows: GenerationWithUser[];
  total: number;
};

// Paginated, date-filterable generation feed for the admin Activity Log. Unlike
// listGenerationsForAdmin (capped "latest N" feed), this supports deep history
// via offset paging and returns the total matching count for the pager.
export async function listGenerationsPageForAdmin(options?: {
  limit?: number;
  offset?: number;
  mode?: GenerationMode | "all";
  source?: GenerationSource | "all";
  status?: GenerationStatus | "all";
  q?: string;
  fromDate?: string | null; // inclusive ISO/date string (UTC)
  toDate?: string | null;   // exclusive ISO/date string (UTC)
}): Promise<AdminGenerationsPage> {
  const limit = Math.max(1, Math.min(options?.limit ?? 100, 500));
  const offset = Math.max(0, options?.offset ?? 0);
  const mode = options?.mode ?? "all";
  const source = options?.source ?? "all";
  const status = options?.status ?? "all";
  const q = options?.q?.trim() ?? "";
  const fromDate = options?.fromDate?.trim() || null;
  const toDate = options?.toDate?.trim() || null;

  // Shared WHERE clause + params for both the count and the page query.
  const where = `
    where ($1 = 'all' or generations.mode = $1)
      and ($2 = 'all' or generations.source = $2)
      and ($3 = 'all' or generations.status = $3)
      and (
        $4 = ''
        or coalesce(users.email, '') ilike '%' || $4 || '%'
        or generations.input_preview ilike '%' || $4 || '%'
        or generations.model ilike '%' || $4 || '%'
        or generations.voice ilike '%' || $4 || '%'
      )
      and ($5::timestamptz is null or generations.created_at >= $5::timestamptz)
      and ($6::timestamptz is null or generations.created_at < $6::timestamptz)
  `;
  const filterParams = [mode, source, status, q, fromDate, toDate];

  const countRows = await queryRows<{ total: string }>(
    `select count(*)::text as total from generations
     left join users on users.id = generations.user_id
     ${where}`,
    filterParams,
  );
  const total = Number(countRows[0]?.total ?? "0");

  const rows = await queryRows<GenerationWithUserRow>(
    `select generations.*, users.email as user_email
     from generations
     left join users on users.id = generations.user_id
     ${where}
     order by generations.created_at desc
     limit $7 offset $8`,
    [...filterParams, limit, offset],
  );
  return { rows: rows.map(mapGenerationWithUser), total };
}

type ApiErrorRow = QueryResultRow & {
  id: string;
  user_id: string | null;
  api_key_id: string | null;
  source: string;
  endpoint: string;
  method: string;
  status_code: number;
  error_code: string | null;
  error_message: string;
  input_preview: string | null;
  request_params: string | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string | Date;
};

type ApiErrorWithUserRow = ApiErrorRow & { user_email: string | null };

function mapApiError(row: ApiErrorRow): ApiErrorRecord {
  return {
    id: row.id,
    userId: row.user_id,
    apiKeyId: row.api_key_id,
    source: row.source as GenerationSource,
    endpoint: row.endpoint,
    method: row.method,
    statusCode: row.status_code,
    errorCode: row.error_code,
    errorMessage: row.error_message,
    inputPreview: row.input_preview,
    requestParams: row.request_params,
    ipAddress: row.ip_address,
    userAgent: row.user_agent,
    createdAt: iso(row.created_at),
  };
}

export async function createApiError(
  input: Omit<ApiErrorRecord, "id" | "createdAt"> & { id?: string; createdAt?: string },
): Promise<ApiErrorRecord> {
  const rows = await queryRows<ApiErrorRow>(
    `
    insert into api_errors (
      id, user_id, api_key_id, source, endpoint, method, status_code,
      error_code, error_message, input_preview, request_params,
      ip_address, user_agent, created_at
    )
    values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
    returning *
    `,
    [
      input.id ?? randomUUID(),
      input.userId,
      input.apiKeyId,
      input.source,
      input.endpoint,
      input.method,
      input.statusCode,
      input.errorCode,
      input.errorMessage,
      input.inputPreview,
      input.requestParams,
      input.ipAddress,
      input.userAgent,
      input.createdAt ?? new Date().toISOString(),
    ],
  );
  return mapApiError(rows[0]);
}

export type AdminApiErrorsPage = {
  rows: ApiErrorWithUser[];
  total: number;
};

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
  const q = options?.q?.trim() ?? "";
  const fromDate = options?.fromDate?.trim() || null;
  const toDate = options?.toDate?.trim() || null;

  const where = `
    where ($1 = 'all' or api_errors.source = $1)
      and (
        $2 = 'all'
        or ($2 = '4xx' and api_errors.status_code >= 400 and api_errors.status_code < 500)
        or ($2 = '5xx' and api_errors.status_code >= 500)
      )
      and (
        $3 = ''
        or coalesce(users.email, '') ilike '%' || $3 || '%'
        or api_errors.endpoint ilike '%' || $3 || '%'
        or api_errors.error_message ilike '%' || $3 || '%'
        or coalesce(api_errors.error_code, '') ilike '%' || $3 || '%'
        or coalesce(api_errors.input_preview, '') ilike '%' || $3 || '%'
      )
      and ($4::timestamptz is null or api_errors.created_at >= $4::timestamptz)
      and ($5::timestamptz is null or api_errors.created_at < $5::timestamptz)
  `;
  const filterParams = [source, statusGroup, q, fromDate, toDate];

  const countRows = await queryRows<{ total: string }>(
    `select count(*)::text as total from api_errors
     left join users on users.id = api_errors.user_id
     ${where}`,
    filterParams,
  );
  const total = Number(countRows[0]?.total ?? "0");

  const rows = await queryRows<ApiErrorWithUserRow>(
    `select api_errors.*, users.email as user_email
     from api_errors
     left join users on users.id = api_errors.user_id
     ${where}
     order by api_errors.created_at desc
     limit $6 offset $7`,
    [...filterParams, limit, offset],
  );
  return {
    rows: rows.map((row) => ({ ...mapApiError(row), userEmail: row.user_email })),
    total,
  };
}

export async function listBatchJobsForAdmin(options?: {
  limit?: number;
  status?: BatchJobStatus | "all";
  q?: string;
}): Promise<BatchJobWithUser[]> {
  const limit = Math.max(1, Math.min(options?.limit ?? 100, 500));
  const status = options?.status ?? "all";
  const q = options?.q?.trim() ?? "";
  const rows = await queryRows<BatchJobWithUserRow>(
    `
    select batch_jobs.*, users.email as user_email
    from batch_jobs
    left join users on users.id = batch_jobs.user_id
    where ($1 = 'all' or batch_jobs.status = $1)
      and (
        $2 = ''
        or coalesce(users.email, '') ilike '%' || $2 || '%'
        or batch_jobs.title ilike '%' || $2 || '%'
        or batch_jobs.voice ilike '%' || $2 || '%'
        or batch_jobs.model ilike '%' || $2 || '%'
        or batch_jobs.id ilike '%' || $2 || '%'
        or coalesce(batch_jobs.external_id, '') ilike '%' || $2 || '%'
      )
    order by batch_jobs.created_at desc
    limit $3
    `,
    [status, q, limit],
  );
  return rows.map(mapBatchJobWithUser);
}

export async function listBatchJobWebhookAttemptsForAdmin(options?: {
  limit?: number;
  jobId?: string | null;
  deliveryStatus?: BatchJobWebhookDeliveryStatus | "all";
}): Promise<BatchJobWebhookAttemptWithUser[]> {
  const limit = Math.max(1, Math.min(options?.limit ?? 100, 500));
  const jobId = options?.jobId?.trim() ?? "";
  const deliveryStatus = options?.deliveryStatus ?? "all";
  const rows = await queryRows<BatchJobWebhookAttemptWithUserRow>(
    `
    select batch_job_webhook_attempts.*,
      users.email as user_email,
      batch_jobs.title as job_title,
      batch_jobs.status as job_status,
      batch_jobs.external_id as external_id
    from batch_job_webhook_attempts
    left join users on users.id = batch_job_webhook_attempts.user_id
    left join batch_jobs on batch_jobs.id = batch_job_webhook_attempts.job_id
    where ($1 = '' or batch_job_webhook_attempts.job_id = $1)
      and ($2 = 'all' or batch_job_webhook_attempts.delivery_status = $2)
    order by batch_job_webhook_attempts.created_at desc
    limit $3
    `,
    [jobId, deliveryStatus, limit],
  );
  return rows.map(mapBatchJobWebhookAttemptWithUser);
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
  const now = new Date().toISOString();
  const rows = await queryRows<BusinessApiRequestRow>(
    `
    insert into business_api_requests (
      id, user_id, company_name, app_name, use_case,
      expected_monthly_tokens, expected_peak_concurrency,
      webhook_url, contact_telegram, contact_email,
      status, sales_stage, sales_note, follow_up_at, last_contacted_at, admin_note,
      applied_daily_token_limit, applied_monthly_token_limit,
      applied_max_concurrent_requests, applied_max_concurrent_jobs, applied_max_queued_jobs, applied_clone_credit_rate,
      reviewed_by_user_id, created_at, updated_at, reviewed_at
    )
    values (
      $1, $2, $3, $4, $5,
      $6, $7,
      $8, $9, $10,
      'pending', 'new', null, null, null, null,
      null, null, null, null, null, null,
      null, $11, $11, null
    )
    returning *
    `,
    [
      randomUUID(),
      input.userId,
      input.companyName,
      input.appName,
      input.useCase,
      Math.max(1, Math.round(input.expectedMonthlyTokens)),
      Math.max(1, Math.round(input.expectedPeakConcurrency)),
      input.webhookUrl,
      input.contactTelegram,
      input.contactEmail,
      now,
    ],
  );
  return mapBusinessApiRequest(rows[0]);
}

export async function listUserBusinessApiRequests(userId: string): Promise<BusinessApiRequestRecord[]> {
  const rows = await queryRows<BusinessApiRequestRow>(
    `
    select *
    from business_api_requests
    where user_id = $1
    order by created_at desc
    `,
    [userId],
  );
  return rows.map(mapBusinessApiRequest);
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
  const q = options?.q?.trim() ?? "";
  const rows = await queryRows<BusinessApiRequestWithUserRow>(
    `
    select business_api_requests.*, users.email as user_email
    from business_api_requests
    left join users on users.id = business_api_requests.user_id
    where ($1 = 'all' or business_api_requests.status = $1)
      and ($2 = 'all' or business_api_requests.sales_stage = $2)
      and (
        $3 = ''
        or coalesce(users.email, '') ilike '%' || $3 || '%'
        or business_api_requests.company_name ilike '%' || $3 || '%'
        or business_api_requests.app_name ilike '%' || $3 || '%'
        or business_api_requests.contact_email ilike '%' || $3 || '%'
        or business_api_requests.use_case ilike '%' || $3 || '%'
        or coalesce(business_api_requests.sales_note, '') ilike '%' || $3 || '%'
      )
    order by business_api_requests.created_at desc
    limit $4
    `,
    [status, salesStage, q, limit],
  );
  return rows.map(mapBusinessApiRequestWithUser);
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
  return withTransaction(async (client) => {
    const now = new Date().toISOString();
    const limits = input.limits ?? {};
    const dailyTokenLimit = input.status === "approved" ? normalizeOptionalLimit(limits.dailyTokenLimit) : null;
    const monthlyTokenLimit = input.status === "approved" ? normalizeOptionalLimit(limits.monthlyTokenLimit) : null;
    const maxConcurrentRequests =
      input.status === "approved" ? normalizeOptionalLimit(limits.maxConcurrentRequests) : null;
    const maxConcurrentJobs = input.status === "approved" ? normalizeOptionalLimit(limits.maxConcurrentJobs) : null;
    const maxQueuedJobs = input.status === "approved" ? normalizeOptionalLimit(limits.maxQueuedJobs) : null;
    const cloneCreditRate = input.status === "approved" ? normalizeCloneCreditRate(limits.cloneCreditRate) : null;

    const rows = await client.query<BusinessApiRequestRow>(
      `
      update business_api_requests
      set status = $1,
        admin_note = $2,
        sales_stage = case when $1 = 'approved' then 'won' when $1 = 'rejected' then 'lost' else sales_stage end,
        applied_daily_token_limit = $3,
        applied_monthly_token_limit = $4,
        applied_max_concurrent_requests = $5,
        applied_max_concurrent_jobs = $6,
        applied_max_queued_jobs = $7,
        applied_clone_credit_rate = $8,
        reviewed_by_user_id = $9,
        reviewed_at = $10,
        updated_at = $10
      where id = $11
      returning *
      `,
      [
        input.status,
        input.adminNote,
        dailyTokenLimit,
        monthlyTokenLimit,
        maxConcurrentRequests,
        maxConcurrentJobs,
        maxQueuedJobs,
        cloneCreditRate,
        input.adminUserId,
        now,
        input.requestId,
      ],
    );
    const request = rows.rows[0];
    if (!request) return null;

    if (input.status === "approved" && input.applyToActiveKeys !== false) {
      await client.query(
        `
        update api_keys
        set daily_token_limit = $1,
          monthly_token_limit = $2,
          max_concurrent_requests = $3,
          max_concurrent_jobs = $4,
          max_queued_jobs = $5
        where user_id = $6 and revoked_at is null
        `,
        [
          dailyTokenLimit,
          monthlyTokenLimit,
          maxConcurrentRequests,
          maxConcurrentJobs,
          maxQueuedJobs,
          request.user_id,
        ],
      );
    }

    return mapBusinessApiRequest(request);
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
  const now = new Date().toISOString();
  const followUpAt = input.followUpAt ? new Date(input.followUpAt) : null;
  const normalizedFollowUpAt =
    followUpAt && !Number.isNaN(followUpAt.getTime()) ? followUpAt.toISOString() : null;
  const salesNote = input.salesNote?.trim() ? input.salesNote.trim().slice(0, 1000) : null;
  const rows = await queryRows<BusinessApiRequestRow>(
    `
    update business_api_requests
    set sales_stage = $1,
      sales_note = $2,
      follow_up_at = $3,
      last_contacted_at = case when $4 then $5 else last_contacted_at end,
      updated_at = $5
    where id = $6
    returning *
    `,
    [
      input.salesStage,
      salesNote,
      normalizedFollowUpAt,
      Boolean(input.markContacted),
      now,
      input.requestId,
    ],
  );
  return rows[0] ? mapBusinessApiRequest(rows[0]) : null;
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
  const rows = await queryRows<WebhookTestEventRow>(
    `
    insert into webhook_test_events (
      id, user_id, webhook_url, event_type, delivery_status,
      http_status, response_preview, error_message, latency_ms, created_at
    )
    values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    returning *
    `,
    [
      randomUUID(),
      input.userId,
      input.webhookUrl,
      input.eventType,
      input.deliveryStatus,
      input.httpStatus,
      input.responsePreview,
      input.errorMessage,
      Math.max(0, Math.round(input.latencyMs)),
      new Date().toISOString(),
    ],
  );
  return mapWebhookTestEvent(rows[0]);
}

export async function listUserWebhookTestEvents(
  userId: string,
  options?: { limit?: number },
): Promise<WebhookTestEventRecord[]> {
  const limit = Math.max(1, Math.min(options?.limit ?? 20, 100));
  const rows = await queryRows<WebhookTestEventRow>(
    `
    select *
    from webhook_test_events
    where user_id = $1
    order by created_at desc
    limit $2
    `,
    [userId, limit],
  );
  return rows.map(mapWebhookTestEvent);
}

function mapUserVoice(row: UserVoiceRow): UserVoiceRecord {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    description: row.description,
    fileName: row.file_name,
    mimeType: row.mime_type,
    fileSize: toNumber(row.file_size),
    audioBase64: row.audio_base64,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

export async function listUserVoices(userId: string): Promise<UserVoiceRecord[]> {
  const rows = await queryRows<UserVoiceRow>(
    `
    select *
    from user_voices
    where user_id = $1
    order by created_at desc
    `,
    [userId],
  );
  return rows.map(mapUserVoice);
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
  const id = randomUUID();
  const now = new Date().toISOString();
  const rows = await queryRows<UserVoiceRow>(
    `
    insert into user_voices (
      id, user_id, name, description, file_name, mime_type, file_size, audio_base64, created_at, updated_at
    )
    values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    returning *
    `,
    [
      id,
      input.userId,
      input.name,
      input.description,
      input.fileName,
      input.mimeType,
      input.fileSize,
      input.audioBase64,
      now,
      now,
    ],
  );
  return mapUserVoice(rows[0]);
}

export async function deleteUserVoice(userId: string, voiceId: string): Promise<boolean> {
  const result = await getPool().query(
    `
    delete from user_voices
    where id = $1 and user_id = $2
    `,
    [voiceId, userId],
  );
  return (result.rowCount ?? 0) > 0;
}

export async function findUserVoiceById(userId: string, voiceId: string): Promise<UserVoiceRecord | null> {
  const rows = await queryRows<UserVoiceRow>(
    `
    select *
    from user_voices
    where id = $1 and user_id = $2
    limit 1
    `,
    [voiceId, userId],
  );
  return rows[0] ? mapUserVoice(rows[0]) : null;
}

export async function getSystemSetting(key: string, defaultValue: string): Promise<string> {
  const rows = await queryRows<{ value: string }>(
    `
    select value
    from system_settings
    where key = $1
    limit 1
    `,
    [key],
  );
  return rows[0] ? rows[0].value : defaultValue;
}

export async function setSystemSetting(key: string, value: string): Promise<void> {
  await queryRows(
    `
    insert into system_settings (key, value, updated_at)
    values ($1, $2, now())
    on conflict (key)
    do update set value = excluded.value, updated_at = excluded.updated_at
    `,
    [key, value],
  );
}
