-- Adds a base64 data-URL portrait to each profile.
alter table profiles
  add column if not exists photo text;
