-- Illume schema. Paste this into the Supabase SQL Editor.
-- RLS policies are permissive for the hackathon; tighten before production.

create extension if not exists "pgcrypto";

-- A registered identity. There is no auth; we identify users by their face
-- embedding and the local passport in their browser. handle is human-readable.
create table if not exists profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users(id) on delete cascade,
  handle text unique not null,
  face_hash text not null,
  face_embedding double precision[] not null,
  photo text,
  created_at timestamptz not null default now()
);

-- If profiles already existed before adding accounts, run:
-- alter table profiles add column if not exists user_id uuid unique references auth.users(id) on delete cascade;

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

-- A live skill test: AI-generated scenario, candidate's spoken answer + interview video.
create table if not exists skill_tests (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references profiles(id) on delete cascade,
  skill text not null,
  question text not null,
  answer text not null,
  duration_seconds int,
  video_url text,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  ai_score int check (ai_score is null or (ai_score between 0 and 100)),
  ai_verdict text check (ai_verdict is null or ai_verdict in ('approve','reject','borderline')),
  ai_rationale text,
  created_at timestamptz not null default now()
);

-- Run these in the Supabase dashboard → Storage to enable interview video uploads:
-- 1. Create a bucket named "interview-videos" and set it to PUBLIC.
-- 2. Add a storage policy: allow insert for all (anon) on interview-videos.
-- Or run:
-- insert into storage.buckets (id, name, public) values ('interview-videos', 'interview-videos', true) on conflict do nothing;
-- create policy "open upload interview-videos" on storage.objects for insert with check (bucket_id = 'interview-videos');
-- create policy "open read interview-videos" on storage.objects for select using (bucket_id = 'interview-videos');

-- If adding video_url to an existing table run:
-- alter table skill_tests add column if not exists video_url text;
create index if not exists skill_tests_status_idx on skill_tests(status);
create index if not exists skill_tests_skill_idx on skill_tests(skill);

-- User-uploaded photos of off-platform credentials (diplomas, licenses, etc).
create table if not exists credential_photos (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  label text,
  photo_url text not null,
  created_at timestamptz not null default now()
);
create index if not exists credential_photos_profile_idx on credential_photos(profile_id);

-- Run in Supabase Storage to enable credential photo uploads:
-- insert into storage.buckets (id, name, public) values ('credential-photos', 'credential-photos', true) on conflict do nothing;
-- create policy "open upload credential-photos" on storage.objects for insert with check (bucket_id = 'credential-photos');
-- create policy "open read credential-photos" on storage.objects for select using (bucket_id = 'credential-photos');
-- create policy "open delete credential-photos" on storage.objects for delete using (bucket_id = 'credential-photos');

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
alter table credential_photos enable row level security;

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

do $$ begin
  create policy "open read credential_photos" on credential_photos for select using (true);
  create policy "open write credential_photos" on credential_photos for insert with check (true);
  create policy "open delete credential_photos" on credential_photos for delete using (true);
exception when duplicate_object then null; end $$;
