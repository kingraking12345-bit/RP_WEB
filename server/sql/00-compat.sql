-- RP on plain PostgreSQL, step 1: the small "compatibility layer".
-- Your existing SQL files were written for Supabase and expect: the roles anon / authenticated,
-- a table auth.users, and a function auth.uid(). This file creates exactly those, on any normal PostgreSQL.
-- Safe to run again.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin noinherit; end if;
end $$;

-- The API connects as your database user and switches to anon / authenticated for each request
-- (this is what keeps your row-level-security rules working).
do $$ begin execute format('grant anon, authenticated to %I', current_user); end $$;

create extension if not exists pgcrypto;  -- optional; ignored if your host does not allow it

grant usage on schema public to anon, authenticated;

create schema if not exists auth;
grant usage on schema auth to anon, authenticated;

-- Login accounts. NOT readable by anon/authenticated: only the API server (the table owner) touches it.
create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  encrypted_password text not null,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  session_version integer not null default 0,   -- bump this to sign a user out everywhere
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_sign_in_at timestamptz
);
create unique index if not exists auth_users_email_key on auth.users (lower(email));
revoke all on auth.users from public, anon, authenticated;

-- Who is making this request? The API sets request.jwt.claims for every request.
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
  ), '')::uuid
$$;
create or replace function auth.role() returns text language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', 'anon')
$$;
grant execute on function auth.uid() to anon, authenticated;
grant execute on function auth.role() to anon, authenticated;
