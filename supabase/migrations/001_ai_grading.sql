-- Run this on an existing database to add AI grading columns.
alter table skill_tests
  add column if not exists ai_score int check (ai_score is null or (ai_score between 0 and 100)),
  add column if not exists ai_verdict text check (ai_verdict is null or ai_verdict in ('approve','reject','borderline')),
  add column if not exists ai_rationale text;
