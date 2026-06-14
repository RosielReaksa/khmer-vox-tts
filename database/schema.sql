-- Schema is defined inline in lib/postgres-store.ts (SCHEMA_SQL constant).
-- This file is used by scripts/db.mjs for CLI setup. Keep both in sync.

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
alter table generations add column if not exists audio_base64 text;
alter table generations add column if not exists content_type text;

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
create unique index if not exists payment_orders_provider_transaction_unique
  on payment_orders(provider_transaction_id)
  where provider_transaction_id is not null;

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
alter table business_api_requests add column if not exists applied_daily_token_limit integer;
alter table business_api_requests add column if not exists applied_monthly_token_limit integer;
alter table business_api_requests add column if not exists applied_max_concurrent_requests integer;
alter table business_api_requests add column if not exists applied_max_concurrent_jobs integer;
alter table business_api_requests add column if not exists applied_max_queued_jobs integer;
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
