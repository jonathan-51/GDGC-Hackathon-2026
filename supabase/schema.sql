-- Vouch schema. Paste this into the Supabase SQL Editor.
-- RLS policies are permissive for the hackathon; tighten before production.

create extension if not exists "pgcrypto";

-- A registered identity. There is no auth; we identify users by their face
-- embedding and the local passport in their browser. handle is human-readable.
create table if not exists profiles (
  id uuid primary key default gen_random_uuid(),
  handle text unique not null,
  face_hash text not null,
  face_embedding double precision[] not null,
  created_at timestamptz not null default now()
);

-- A vouch: voucher signs that vouchee is real / known to them.
create table if not exists vouches (
  id uuid primary key default gen_random_uuid(),
  voucher_id uuid not null references profiles(id) on delete cascade,
  vouchee_id uuid not null references profiles(id) on delete cascade,
  context text,
  match_distance double precision,
  created_at timestamptz not null default now(),
  unique(voucher_id, vouchee_id),
  check (voucher_id <> vouchee_id)
);
create index if not exists vouches_vouchee_idx on vouches(vouchee_id);
create index if not exists vouches_voucher_idx on vouches(voucher_id);

-- A live skill test: AI-generated scenario, candidate's timed answer.
create table if not exists skill_tests (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references profiles(id) on delete cascade,
  skill text not null,
  question text not null,
  answer text not null,
  duration_seconds int,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  ai_score int check (ai_score is null or (ai_score between 0 and 100)),
  ai_verdict text check (ai_verdict is null or ai_verdict in ('approve','reject','borderline')),
  ai_rationale text,
  created_at timestamptz not null default now()
);
create index if not exists skill_tests_status_idx on skill_tests(status);
create index if not exists skill_tests_skill_idx on skill_tests(skill);

-- A peer review of a skill test.
create table if not exists skill_reviews (
  id uuid primary key default gen_random_uuid(),
  test_id uuid not null references skill_tests(id) on delete cascade,
  reviewer_id uuid not null references profiles(id) on delete cascade,
  verdict text not null check (verdict in ('approve','reject')),
  notes text,
  created_at timestamptz not null default now(),
  unique(test_id, reviewer_id)
);

-- A revocable credential issued after enough peer approvals.
create table if not exists credentials (
  id uuid primary key default gen_random_uuid(),
  holder_id uuid not null references profiles(id) on delete cascade,
  skill text not null,
  test_id uuid references skill_tests(id) on delete set null,
  issued_at timestamptz not null default now(),
  expires_at timestamptz,
  revoked boolean not null default false
);
create index if not exists credentials_holder_idx on credentials(holder_id);

-- Permissive RLS for hackathon demo. Tighten later by binding rows to
-- auth.uid() and gating writes by signed nonce / face-match attestation.
alter table profiles enable row level security;
alter table vouches enable row level security;
alter table skill_tests enable row level security;
alter table skill_reviews enable row level security;
alter table credentials enable row level security;

do $$ begin
  create policy "open read profiles" on profiles for select using (true);
  create policy "open write profiles" on profiles for insert with check (true);
  create policy "open update profiles" on profiles for update using (true);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "open read vouches" on vouches for select using (true);
  create policy "open write vouches" on vouches for insert with check (true);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "open read tests" on skill_tests for select using (true);
  create policy "open write tests" on skill_tests for insert with check (true);
  create policy "open update tests" on skill_tests for update using (true);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "open read reviews" on skill_reviews for select using (true);
  create policy "open write reviews" on skill_reviews for insert with check (true);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "open read credentials" on credentials for select using (true);
  create policy "open write credentials" on credentials for insert with check (true);
  create policy "open update credentials" on credentials for update using (true);
exception when duplicate_object then null; end $$;
