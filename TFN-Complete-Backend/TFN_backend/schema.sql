-- =====================================================================
-- ProMatch — canonical schema (Supabase Postgres)
--
-- This file is the source of truth for DB structure. Apply via:
--   supabase db reset  (local)
--   supabase migration up  (after splitting into migrations/*.sql)
--
-- Conventions:
--   - All public tables have RLS enabled.
--   - All timestamps are timestamptz.
--   - Primary keys are UUIDs (v4 via gen_random_uuid()).
--   - Arrays preferred over join tables for small bounded sets (intents, tags).
--   - ON CONFLICT patterns used everywhere for idempotency.
-- =====================================================================

-- ---------- EXTENSIONS ----------
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";      -- gen_random_uuid
create extension if not exists "citext";        -- case-insensitive text
create extension if not exists "pg_trgm";       -- fuzzy search
create extension if not exists "vector";        -- pgvector
create extension if not exists "unaccent";

-- ---------- ENUMS ----------
create type intent_type as enum (
  'dating',
  'collaboration',
  'mentorship_mentor',
  'mentorship_mentee',
  'networking',
  'cofounder'
);

create type user_role as enum (
  'student',
  'professional',
  'researcher',
  'founder',
  'other'
);

create type seniority_level as enum (
  'early',
  'mid',
  'senior',
  'unspecified'
);

create type visibility_type as enum (
  'public',
  'members_only',
  'private'
);

create type link_kind as enum (
  'github',
  'linkedin',
  'scholar',
  'orcid',
  'kaggle',
  'leetcode',
  'personal',
  'twitter',
  'other'
);

create type match_status as enum (
  'active',
  'closed_by_a',
  'closed_by_b',
  'archived'
);

create type message_kind as enum (
  'text',
  'image',
  'file',
  'system',
  'booking_card',
  'event_invite'
);

create type report_reason as enum (
  'harassment',
  'inappropriate_content',
  'fake_profile',
  'spam',
  'underage',
  'safety',
  'other'
);

create type report_status as enum (
  'open',
  'reviewing',
  'resolved',
  'dismissed'
);

create type event_host_type as enum (
  'platform',
  'user'
);

create type event_kind as enum (
  'meetup',
  'hackathon',
  'workshop',
  'paper_reading',
  'talk',
  'coworking',
  'other'
);

create type event_mode as enum (
  'online',
  'offline',
  'hybrid'
);

create type event_attendee_status as enum (
  'rsvp_going',
  'rsvp_maybe',
  'waitlist',
  'attended',
  'no_show',
  'cancelled'
);

create type event_approval_status as enum (
  'draft',
  'pending_review',
  'approved',
  'rejected'
);

create type booking_kind as enum (
  'coffee',
  'mentoring',
  'project_review',
  'interview_prep',
  'other'
);

create type booking_status as enum (
  'pending',
  'confirmed',
  'cancelled_by_host',
  'cancelled_by_guest',
  'completed',
  'no_show'
);

create type payment_status as enum (
  'not_required',
  'pending',
  'paid',
  'refunded',
  'failed'
);

create type notification_kind as enum (
  'new_match',
  'new_like',
  'new_message',
  'booking_request',
  'booking_confirmed',
  'booking_cancelled',
  'event_reminder',
  'event_starting',
  'event_approved',
  'event_rejected',
  'system'
);

create type verification_kind as enum (
  'github',
  'linkedin',
  'scholar',
  'email',
  'phone'
);

-- ---------- HELPERS ----------
create or replace function moddatetime()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Canonical ordering for (user_a, user_b) on matches: smaller uuid first.
create or replace function order_pair(a uuid, b uuid)
returns uuid[] language sql immutable as $$
  select case when a < b then array[a, b] else array[b, a] end;
$$;

-- =====================================================================
-- PROFILES
-- =====================================================================
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username citext unique not null,
  display_name text not null,
  headline text,                      -- short tagline, ≤120 chars
  bio text,                            -- long-form, ≤800 chars
  avatar_url text,
  cover_url text,

  role user_role not null default 'other',
  seniority seniority_level not null default 'unspecified',
  institution_or_company text,

  location_city text,
  location_country text,
  location_lat double precision,
  location_lng double precision,

  looking_for intent_type[] not null default '{}',
  visibility visibility_type not null default 'public',

  is_verified boolean not null default false,
  is_active boolean not null default true,     -- false = suspended or user-deactivated
  last_active_at timestamptz not null default now(),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index profiles_username_trgm_idx on public.profiles using gin (username gin_trgm_ops);
create index profiles_city_idx on public.profiles (location_city) where location_city is not null;
create index profiles_looking_for_idx on public.profiles using gin (looking_for);
create index profiles_active_idx on public.profiles (is_active, last_active_at desc) where is_active = true;

create trigger profiles_mod before update on public.profiles
  for each row execute function moddatetime();

-- Auto-create a profile row on new auth.users insert. Username defaults to
-- a derived slug; user can change on onboarding.
create or replace function handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, username, display_name)
  values (
    new.id,
    'user_' || substr(new.id::text, 1, 8),
    coalesce(new.raw_user_meta_data->>'full_name', new.email)
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- =====================================================================
-- PROFILE LINKS
-- =====================================================================
create table public.profile_links (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  kind link_kind not null,
  url text not null,
  display_label text,
  is_verified boolean not null default false,
  verification_metadata jsonb,
  created_at timestamptz not null default now(),
  unique (profile_id, kind, url)
);

create index profile_links_profile_idx on public.profile_links (profile_id);

-- =====================================================================
-- VERIFICATION BADGES (aggregate of verified links + email/phone)
-- =====================================================================
create table public.verification_badges (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  kind verification_kind not null,
  verified_at timestamptz not null default now(),
  metadata jsonb,
  primary key (profile_id, kind)
);

-- =====================================================================
-- INTERESTS (lookup)
-- =====================================================================
create table public.interests (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  category text not null,
  synonyms text[] not null default '{}',
  created_at timestamptz not null default now()
);

create index interests_category_idx on public.interests (category);
create index interests_name_trgm_idx on public.interests using gin (name gin_trgm_ops);

create table public.profile_interests (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  interest_id uuid not null references public.interests(id) on delete cascade,
  weight real not null default 0.5 check (weight >= 0 and weight <= 1),
  created_at timestamptz not null default now(),
  primary key (profile_id, interest_id)
);

create index profile_interests_interest_idx on public.profile_interests (interest_id);

-- =====================================================================
-- PROJECTS
-- =====================================================================
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  description text,
  url text,
  repo_url text,
  tags text[] not null default '{}',
  media_urls text[] not null default '{}',
  is_seeking_collab boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index projects_profile_idx on public.projects (profile_id, created_at desc);
create index projects_tags_idx on public.projects using gin (tags);
create trigger projects_mod before update on public.projects
  for each row execute function moddatetime();

-- =====================================================================
-- LIKES / PASSES
-- =====================================================================
create table public.likes (
  id uuid primary key default gen_random_uuid(),
  liker_id uuid not null references public.profiles(id) on delete cascade,
  likee_id uuid not null references public.profiles(id) on delete cascade,
  intents intent_type[] not null check (array_length(intents, 1) >= 1),
  note text check (note is null or char_length(note) <= 280),
  created_at timestamptz not null default now(),
  unique (liker_id, likee_id),
  check (liker_id <> likee_id)
);

create index likes_likee_idx on public.likes (likee_id, created_at desc);
create index likes_liker_idx on public.likes (liker_id, created_at desc);

create table public.passes (
  liker_id uuid not null references public.profiles(id) on delete cascade,
  likee_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (liker_id, likee_id),
  check (liker_id <> likee_id)
);

-- =====================================================================
-- MATCHES
-- =====================================================================
create table public.matches (
  id uuid primary key default gen_random_uuid(),
  user_a_id uuid not null references public.profiles(id) on delete cascade,
  user_b_id uuid not null references public.profiles(id) on delete cascade,
  shared_intents intent_type[] not null check (array_length(shared_intents, 1) >= 1),
  status match_status not null default 'active',
  last_message_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_a_id, user_b_id),
  check (user_a_id < user_b_id)   -- canonical ordering
);

create index matches_a_idx on public.matches (user_a_id, last_message_at desc nulls last);
create index matches_b_idx on public.matches (user_b_id, last_message_at desc nulls last);

-- Trigger: when a mutual like exists with overlapping intents, create a match.
create or replace function try_create_match()
returns trigger language plpgsql security definer as $$
declare
  reciprocal_intents intent_type[];
  pair uuid[];
  overlap intent_type[];
begin
  -- Look for reciprocal like
  select l.intents into reciprocal_intents
  from public.likes l
  where l.liker_id = new.likee_id
    and l.likee_id = new.liker_id
  limit 1;

  if reciprocal_intents is null then
    return new;
  end if;

  -- Compute intent overlap
  select array_agg(distinct x) into overlap
  from unnest(new.intents) as x
  where x = any(reciprocal_intents);

  if overlap is null or array_length(overlap, 1) = 0 then
    return new;
  end if;

  pair := order_pair(new.liker_id, new.likee_id);

  insert into public.matches (user_a_id, user_b_id, shared_intents)
  values (pair[1], pair[2], overlap)
  on conflict (user_a_id, user_b_id) do update
    set shared_intents = excluded.shared_intents,
        status = 'active';

  -- Insert notifications for both users
  insert into public.notifications (profile_id, kind, payload)
  values
    (new.liker_id, 'new_match', jsonb_build_object('other_user_id', new.likee_id, 'shared_intents', overlap)),
    (new.likee_id, 'new_match', jsonb_build_object('other_user_id', new.liker_id, 'shared_intents', overlap));

  return new;
end;
$$;

create trigger on_like_maybe_match
  after insert on public.likes
  for each row execute function try_create_match();

-- =====================================================================
-- BLOCKS
-- =====================================================================
create table public.blocks (
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

-- When a block is created, archive any existing match between the two.
create or replace function archive_match_on_block()
returns trigger language plpgsql security definer as $$
declare
  pair uuid[];
begin
  pair := order_pair(new.blocker_id, new.blocked_id);
  update public.matches
    set status = 'archived'
    where user_a_id = pair[1] and user_b_id = pair[2];
  return new;
end;
$$;

create trigger on_block_archive_match
  after insert on public.blocks
  for each row execute function archive_match_on_block();

-- =====================================================================
-- REPORTS
-- =====================================================================
create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  reported_profile_id uuid not null references public.profiles(id) on delete cascade,
  reason report_reason not null,
  details text,
  status report_status not null default 'open',
  resolution_notes text,
  resolved_by uuid references public.profiles(id),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (reporter_id <> reported_profile_id)
);

create index reports_status_idx on public.reports (status, created_at desc);
create index reports_reported_idx on public.reports (reported_profile_id);
create trigger reports_mod before update on public.reports
  for each row execute function moddatetime();

-- =====================================================================
-- MESSAGES
-- =====================================================================
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  kind message_kind not null default 'text',
  content text,                                -- required for text; optional for others
  attachments jsonb not null default '[]'::jsonb,
  is_read boolean not null default false,
  is_deleted boolean not null default false,
  edited_at timestamptz,
  created_at timestamptz not null default now(),
  check (kind <> 'text' or (content is not null and char_length(content) between 1 and 4000))
);

create index messages_match_idx on public.messages (match_id, created_at desc);
create index messages_sender_idx on public.messages (sender_id, created_at desc);

-- Update match.last_message_at on new message
create or replace function bump_match_last_message()
returns trigger language plpgsql security definer as $$
begin
  update public.matches
    set last_message_at = new.created_at
    where id = new.match_id;
  return new;
end;
$$;

create trigger on_message_bump_match
  after insert on public.messages
  for each row execute function bump_match_last_message();

-- =====================================================================
-- EVENTS
-- =====================================================================
create table public.events (
  id uuid primary key default gen_random_uuid(),
  host_type event_host_type not null,
  host_profile_id uuid references public.profiles(id) on delete set null,
  title text not null check (char_length(title) between 3 and 160),
  description text,
  kind event_kind not null default 'meetup',
  mode event_mode not null default 'offline',

  venue_name text,
  venue_address text,
  venue_lat double precision,
  venue_lng double precision,
  city text,
  meeting_url text,

  starts_at timestamptz not null,
  ends_at timestamptz not null,
  rsvp_deadline timestamptz,

  capacity integer check (capacity is null or capacity > 0),
  attendee_count integer not null default 0,
  cover_url text,
  tags text[] not null default '{}',

  is_paid boolean not null default false,
  price_cents integer check (price_cents is null or price_cents >= 0),
  currency text not null default 'INR',

  approval_status event_approval_status not null default 'draft',
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  review_notes text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  check (ends_at > starts_at),
  check (host_type = 'platform' or host_profile_id is not null),
  check (not is_paid or price_cents is not null)
);

create index events_starts_idx on public.events (starts_at) where approval_status = 'approved';
create index events_city_idx on public.events (city) where approval_status = 'approved';
create index events_tags_idx on public.events using gin (tags);
create index events_host_idx on public.events (host_profile_id);
create index events_approval_idx on public.events (approval_status, created_at desc);
create trigger events_mod before update on public.events
  for each row execute function moddatetime();

-- =====================================================================
-- EVENT ATTENDEES
-- =====================================================================
create table public.event_attendees (
  event_id uuid not null references public.events(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  status event_attendee_status not null default 'rsvp_going',
  ticket_id text,                  -- for paid events, reference to payment
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (event_id, profile_id)
);

create index event_attendees_profile_idx on public.event_attendees (profile_id);
create trigger event_attendees_mod before update on public.event_attendees
  for each row execute function moddatetime();

-- Keep events.attendee_count in sync
create or replace function bump_event_attendee_count()
returns trigger language plpgsql security definer as $$
begin
  if tg_op = 'INSERT' and new.status in ('rsvp_going', 'attended') then
    update public.events set attendee_count = attendee_count + 1 where id = new.event_id;
  elsif tg_op = 'DELETE' and old.status in ('rsvp_going', 'attended') then
    update public.events set attendee_count = attendee_count - 1 where id = old.event_id;
  elsif tg_op = 'UPDATE' then
    if old.status in ('rsvp_going', 'attended') and new.status not in ('rsvp_going', 'attended') then
      update public.events set attendee_count = attendee_count - 1 where id = new.event_id;
    elsif old.status not in ('rsvp_going', 'attended') and new.status in ('rsvp_going', 'attended') then
      update public.events set attendee_count = attendee_count + 1 where id = new.event_id;
    end if;
  end if;
  return coalesce(new, old);
end;
$$;

create trigger on_attendee_count
  after insert or update or delete on public.event_attendees
  for each row execute function bump_event_attendee_count();

-- =====================================================================
-- AVAILABILITY & BOOKINGS
-- =====================================================================
create table public.availability_slots (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  is_recurring boolean not null default false,
  rrule text,                        -- RFC 5545; nullable
  is_available boolean not null default true,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at),
  check (not is_recurring or rrule is not null)
);

create index availability_profile_idx on public.availability_slots (profile_id, starts_at);

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references public.profiles(id) on delete cascade,
  guest_id uuid not null references public.profiles(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  kind booking_kind not null default 'coffee',
  status booking_status not null default 'pending',
  meeting_url text,
  notes text,

  is_paid boolean not null default false,
  price_cents integer,
  currency text not null default 'INR',
  payment_status payment_status,
  payment_provider_id text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  check (host_id <> guest_id),
  check (ends_at > starts_at),
  check (not is_paid or (price_cents is not null and payment_status is not null))
);

create index bookings_host_idx on public.bookings (host_id, starts_at desc);
create index bookings_guest_idx on public.bookings (guest_id, starts_at desc);
create index bookings_status_idx on public.bookings (status, starts_at);
create trigger bookings_mod before update on public.bookings
  for each row execute function moddatetime();

-- =====================================================================
-- EMBEDDINGS (pgvector)
-- =====================================================================
create table public.profile_embeddings (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  embedding vector(1536) not null,
  source_text_hash text not null,
  updated_at timestamptz not null default now()
);

-- IVFFlat index. Run ANALYZE after first 1k rows to tune lists.
-- For small tables (<10k rows) this is fine; migrate to HNSW when scaling.
create index profile_embeddings_idx on public.profile_embeddings
  using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

-- =====================================================================
-- FEEDBACK (ranker training signal)
-- =====================================================================
create table public.feedback (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  target_profile_id uuid references public.profiles(id) on delete set null,
  target_match_id uuid references public.matches(id) on delete set null,
  event_type text not null,          -- 'shown' | 'dwell' | 'opened' | 'liked' | 'matched' | 'messaged' | 'rated'
  value jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index feedback_profile_idx on public.feedback (profile_id, created_at desc);
create index feedback_event_idx on public.feedback (event_type, created_at desc);

-- =====================================================================
-- NOTIFICATIONS
-- =====================================================================
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  kind notification_kind not null,
  payload jsonb not null default '{}'::jsonb,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create index notifications_profile_idx on public.notifications (profile_id, created_at desc);
create index notifications_unread_idx on public.notifications (profile_id, is_read) where is_read = false;

-- =====================================================================
-- ADMIN AUDIT LOG
-- =====================================================================
create table public.admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid references public.profiles(id),
  action text not null,
  target_type text not null,
  target_id uuid,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index admin_audit_created_idx on public.admin_audit_log (created_at desc);
create index admin_audit_admin_idx on public.admin_audit_log (admin_id);

-- =====================================================================
-- HELPER: admin check
-- =====================================================================
create or replace function is_admin()
returns boolean language sql stable security definer as $$
  select coalesce(
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin',
    false
  );
$$;

-- =====================================================================
-- ROW LEVEL SECURITY
-- =====================================================================

-- Enable RLS on all public tables
alter table public.profiles enable row level security;
alter table public.profile_links enable row level security;
alter table public.verification_badges enable row level security;
alter table public.interests enable row level security;
alter table public.profile_interests enable row level security;
alter table public.projects enable row level security;
alter table public.likes enable row level security;
alter table public.passes enable row level security;
alter table public.matches enable row level security;
alter table public.blocks enable row level security;
alter table public.reports enable row level security;
alter table public.messages enable row level security;
alter table public.events enable row level security;
alter table public.event_attendees enable row level security;
alter table public.availability_slots enable row level security;
alter table public.bookings enable row level security;
alter table public.profile_embeddings enable row level security;
alter table public.feedback enable row level security;
alter table public.notifications enable row level security;
alter table public.admin_audit_log enable row level security;

-- ---------- PROFILES ----------
create policy profiles_read on public.profiles for select using (
  is_active = true
  and (
    visibility in ('public', 'members_only')
    or id = auth.uid()
    or is_admin()
  )
);

create policy profiles_update_own on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());
-- No INSERT policy: profiles are created by trigger only.
-- No DELETE policy: cascade from auth.users handles it.

-- ---------- PROFILE LINKS ----------
create policy links_read on public.profile_links for select using (
  exists (select 1 from public.profiles p where p.id = profile_id and p.visibility <> 'private')
  or profile_id = auth.uid()
  or is_admin()
);
create policy links_write_own on public.profile_links for all using (profile_id = auth.uid()) with check (profile_id = auth.uid());

-- ---------- VERIFICATION BADGES ----------
create policy badges_read on public.verification_badges for select using (true);
-- badges are written by server only (service role)

-- ---------- INTERESTS (lookup) ----------
create policy interests_read on public.interests for select using (true);
-- no write policies; service role only

-- ---------- PROFILE INTERESTS ----------
create policy profile_interests_read on public.profile_interests for select using (true);
create policy profile_interests_write_own on public.profile_interests for all using (profile_id = auth.uid()) with check (profile_id = auth.uid());

-- ---------- PROJECTS ----------
create policy projects_read on public.projects for select using (
  exists (select 1 from public.profiles p where p.id = profile_id and p.visibility <> 'private')
  or profile_id = auth.uid()
  or is_admin()
);
create policy projects_write_own on public.projects for all using (profile_id = auth.uid()) with check (profile_id = auth.uid());

-- ---------- LIKES ----------
-- You can see likes you made; you can see likes made to you (for "who liked me").
create policy likes_read_own on public.likes for select using (liker_id = auth.uid() or likee_id = auth.uid() or is_admin());
create policy likes_insert_own on public.likes for insert with check (
  liker_id = auth.uid()
  and likee_id <> auth.uid()
  -- block blocked users from liking
  and not exists (
    select 1 from public.blocks b
    where (b.blocker_id = likee_id and b.blocked_id = liker_id)
       or (b.blocker_id = liker_id and b.blocked_id = likee_id)
  )
);

-- ---------- PASSES ----------
create policy passes_read_own on public.passes for select using (liker_id = auth.uid());
create policy passes_insert_own on public.passes for insert with check (liker_id = auth.uid());

-- ---------- MATCHES ----------
create policy matches_read_participants on public.matches for select using (
  user_a_id = auth.uid() or user_b_id = auth.uid() or is_admin()
);
-- no INSERT policy: trigger uses SECURITY DEFINER
create policy matches_update_participants on public.matches for update using (
  user_a_id = auth.uid() or user_b_id = auth.uid()
) with check (
  user_a_id = auth.uid() or user_b_id = auth.uid()
);

-- ---------- BLOCKS ----------
create policy blocks_read_own on public.blocks for select using (blocker_id = auth.uid() or is_admin());
create policy blocks_insert_own on public.blocks for insert with check (blocker_id = auth.uid());
create policy blocks_delete_own on public.blocks for delete using (blocker_id = auth.uid());

-- ---------- REPORTS ----------
create policy reports_read_own on public.reports for select using (reporter_id = auth.uid() or is_admin());
create policy reports_insert on public.reports for insert with check (reporter_id = auth.uid());
create policy reports_admin_update on public.reports for update using (is_admin()) with check (is_admin());

-- ---------- MESSAGES ----------
create policy messages_read_participants on public.messages for select using (
  exists (
    select 1 from public.matches m
    where m.id = match_id
      and (m.user_a_id = auth.uid() or m.user_b_id = auth.uid())
  )
);
create policy messages_insert_participant on public.messages for insert with check (
  sender_id = auth.uid()
  and exists (
    select 1 from public.matches m
    where m.id = match_id
      and m.status = 'active'
      and (m.user_a_id = auth.uid() or m.user_b_id = auth.uid())
  )
);
create policy messages_update_own on public.messages for update using (sender_id = auth.uid()) with check (sender_id = auth.uid());

-- ---------- EVENTS ----------
create policy events_read_approved on public.events for select using (
  approval_status = 'approved'
  or host_profile_id = auth.uid()
  or is_admin()
);
create policy events_insert on public.events for insert with check (
  (host_type = 'user' and host_profile_id = auth.uid())
  or (host_type = 'platform' and is_admin())
);
create policy events_update_host_or_admin on public.events for update using (
  host_profile_id = auth.uid() or is_admin()
) with check (
  host_profile_id = auth.uid() or is_admin()
);
create policy events_delete_host_or_admin on public.events for delete using (
  host_profile_id = auth.uid() or is_admin()
);

-- ---------- EVENT ATTENDEES ----------
-- RSVP list visibility is gated at the API layer (only show to other attendees
-- via a server endpoint that joins against their own RSVP). Keeping this RLS
-- simple avoids the self-reference recursion trap in Postgres RLS.
-- DB level: attendees see their own RSVPs; event host/admin sees all.
create policy attendees_read on public.event_attendees for select using (
  profile_id = auth.uid()
  or exists (
    select 1 from public.events e
    where e.id = event_id and (e.host_profile_id = auth.uid() or is_admin())
  )
);
create policy attendees_insert_self on public.event_attendees for insert with check (profile_id = auth.uid());
create policy attendees_update_self on public.event_attendees for update using (profile_id = auth.uid()) with check (profile_id = auth.uid());
create policy attendees_delete_self on public.event_attendees for delete using (profile_id = auth.uid());

-- ---------- AVAILABILITY ----------
create policy availability_read on public.availability_slots for select using (true);
create policy availability_write_own on public.availability_slots for all using (profile_id = auth.uid()) with check (profile_id = auth.uid());

-- ---------- BOOKINGS ----------
create policy bookings_read_participants on public.bookings for select using (
  host_id = auth.uid() or guest_id = auth.uid() or is_admin()
);
create policy bookings_insert_guest on public.bookings for insert with check (
  guest_id = auth.uid() and host_id <> auth.uid()
);
create policy bookings_update_participants on public.bookings for update using (
  host_id = auth.uid() or guest_id = auth.uid()
) with check (
  host_id = auth.uid() or guest_id = auth.uid()
);

-- ---------- EMBEDDINGS ----------
-- Read: service role only. Nothing client-side should query embeddings directly.
-- (No policy = no access for authenticated role.)

-- ---------- FEEDBACK ----------
create policy feedback_read_own on public.feedback for select using (profile_id = auth.uid() or is_admin());
create policy feedback_insert_own on public.feedback for insert with check (profile_id = auth.uid());

-- ---------- NOTIFICATIONS ----------
create policy notifications_read_own on public.notifications for select using (profile_id = auth.uid());
create policy notifications_update_own on public.notifications for update using (profile_id = auth.uid()) with check (profile_id = auth.uid());

-- ---------- ADMIN AUDIT LOG ----------
create policy admin_audit_read on public.admin_audit_log for select using (is_admin());

-- =====================================================================
-- REALTIME PUBLICATIONS
-- Supabase Realtime listens on supabase_realtime publication.
-- Add tables we want clients to subscribe to.
-- =====================================================================
alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.matches;
alter publication supabase_realtime add table public.notifications;

-- =====================================================================
-- SEED DATA (interests)
-- Minimal seed. Expand in supabase/seed.sql
-- =====================================================================
insert into public.interests (slug, name, category) values
  ('ai-ml', 'AI / ML', 'AI/ML'),
  ('deep-learning', 'Deep Learning', 'AI/ML'),
  ('nlp', 'NLP', 'AI/ML'),
  ('computer-vision', 'Computer Vision', 'AI/ML'),
  ('rl', 'Reinforcement Learning', 'AI/ML'),
  ('systems', 'Systems / Infra', 'Systems'),
  ('distributed', 'Distributed Systems', 'Systems'),
  ('databases', 'Databases', 'Systems'),
  ('frontend', 'Frontend', 'Web'),
  ('backend', 'Backend', 'Web'),
  ('mobile', 'Mobile', 'Web'),
  ('security', 'Security', 'Systems'),
  ('robotics', 'Robotics', 'Hardware'),
  ('hardware', 'Hardware / Embedded', 'Hardware'),
  ('research', 'Academic Research', 'Research'),
  ('open-source', 'Open Source', 'Community'),
  ('hackathons', 'Hackathons', 'Community'),
  ('startups', 'Startups', 'Career'),
  ('product', 'Product', 'Career'),
  ('design', 'Design', 'Design')
on conflict (slug) do nothing;

-- =====================================================================
-- END OF SCHEMA
-- =====================================================================
