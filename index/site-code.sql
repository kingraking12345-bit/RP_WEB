-- RP Site Code: lets the Creator edit any HTML / JS / CSS file of the website from the Creator > Code tab.
-- Run once in the Supabase SQL Editor AFTER account-system.sql. Safe to run again.
--
--   * Edits are stored as "overrides" (full file text) in rp_site_files. Every page loads rp-site-loader.js first;
--     it swaps in the overrides for that page (and for the scripts/styles it uses) before the page runs.
--   * Only the Creator can save, disable or reset overrides. Everyone can read them (the site code is public anyway).
--   * Every save is kept in rp_site_file_history (last 30 versions per file) and written to the audit log.
--   * Emergency exit: open any page with ?rpsafe=1 to ignore all overrides in that browser tab session.

create table if not exists public.rp_site_files (
  path text primary key,
  content text not null,
  version integer not null default 1,
  enabled boolean not null default true,
  note text not null default '',
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint rp_site_files_path check (path ~ '^[A-Za-z0-9_-]+/[A-Za-z0-9_.-]+\.(html|js|css)$' and path !~ '\.\.' and path <> 'index/rp-site-loader.js'),
  constraint rp_site_files_size check (char_length(content) <= 2000000)
);
create table if not exists public.rp_site_file_history (
  id bigint generated always as identity primary key,
  path text not null,
  version integer not null,
  action text not null default 'save',
  note text not null default '',
  content text not null,
  saved_by uuid references auth.users(id) on delete set null,
  saved_at timestamptz not null default now()
);
create index if not exists rp_site_file_history_path on public.rp_site_file_history(path, id desc);

alter table public.rp_site_files enable row level security;
alter table public.rp_site_file_history enable row level security;
revoke all on public.rp_site_files from anon, authenticated;
revoke all on public.rp_site_file_history from anon, authenticated;
grant select (path, content, version, enabled, updated_at) on public.rp_site_files to anon, authenticated;
drop policy if exists rp_site_files_read on public.rp_site_files;
create policy rp_site_files_read on public.rp_site_files for select to anon, authenticated using (enabled);

create or replace function public.rp_site_is_creator()
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists(select 1 from public.rp_accounts where id = (select auth.uid()) and status = 'active' and 'Creator' = any(roles))
$$;

create or replace function public.rp_site_check_path(p_path text) returns void language plpgsql immutable set search_path = public, pg_temp as $$
begin
  if p_path is null or p_path !~ '^[A-Za-z0-9_-]+/[A-Za-z0-9_.-]+\.(html|js|css)$' or p_path ~ '\.\.' then raise exception 'Path must look like Folder/file.html (.html, .js or .css)'; end if;
  if p_path = 'index/rp-site-loader.js' then raise exception 'The site loader cannot be overridden'; end if;
end;
$$;

create or replace function public.rp_list_site_files()
returns table(path text, version integer, enabled boolean, note text, size integer, updated_at timestamptz)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not public.rp_site_is_creator() then raise exception 'Creator role required'; end if;
  return query select f.path, f.version, f.enabled, f.note, char_length(f.content), f.updated_at from public.rp_site_files f order by f.path;
end;
$$;

create or replace function public.rp_get_site_file(p_path text)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v jsonb;
begin
  if not public.rp_site_is_creator() then raise exception 'Creator role required'; end if;
  select jsonb_build_object('path', path, 'content', content, 'version', version, 'enabled', enabled, 'note', note, 'updated_at', updated_at) into v from public.rp_site_files where path = p_path;
  return v;
end;
$$;

create or replace function public.rp_save_site_file(p_path text, p_content text, p_note text default '')
returns integer language plpgsql security definer set search_path = public, pg_temp as $$
declare v_version integer;
begin
  if not public.rp_site_is_creator() then raise exception 'Creator role required'; end if;
  perform public.rp_site_check_path(p_path);
  if p_content is null or btrim(p_content) = '' then raise exception 'File content cannot be empty (use Reset to original instead)'; end if;
  if char_length(p_content) > 2000000 then raise exception 'File is too large (limit 2,000,000 characters)'; end if;
  insert into public.rp_site_files(path, content, version, enabled, note, updated_by, updated_at)
  values (p_path, p_content, 1, true, left(coalesce(p_note, ''), 200), auth.uid(), now())
  on conflict (path) do update set content = excluded.content, version = public.rp_site_files.version + 1, enabled = true, note = excluded.note, updated_by = auth.uid(), updated_at = now()
  returning version into v_version;
  insert into public.rp_site_file_history(path, version, action, note, content, saved_by) values (p_path, v_version, 'save', left(coalesce(p_note, ''), 200), p_content, auth.uid());
  delete from public.rp_site_file_history where path = p_path and id not in (select id from public.rp_site_file_history where path = p_path order by id desc limit 30);
  insert into public.rp_audit_log(actor, action, details) values (auth.uid(), 'site_file_saved', jsonb_build_object('path', p_path, 'version', v_version, 'chars', char_length(p_content), 'note', left(coalesce(p_note, ''), 200)));
  return v_version;
end;
$$;

create or replace function public.rp_set_site_file_enabled(p_path text, p_enabled boolean)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not public.rp_site_is_creator() then raise exception 'Creator role required'; end if;
  update public.rp_site_files set enabled = p_enabled, version = version + 1, updated_by = auth.uid(), updated_at = now() where path = p_path;
  if not found then raise exception 'No override exists for that file'; end if;
  insert into public.rp_audit_log(actor, action, details) values (auth.uid(), case when p_enabled then 'site_file_enabled' else 'site_file_disabled' end, jsonb_build_object('path', p_path));
end;
$$;

create or replace function public.rp_reset_site_file(p_path text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v public.rp_site_files%rowtype;
begin
  if not public.rp_site_is_creator() then raise exception 'Creator role required'; end if;
  delete from public.rp_site_files where path = p_path returning * into v;
  if not found then raise exception 'No override exists for that file'; end if;
  insert into public.rp_site_file_history(path, version, action, note, content, saved_by) values (p_path, v.version + 1, 'reset', 'Reset to the original file', v.content, auth.uid());
  insert into public.rp_audit_log(actor, action, details) values (auth.uid(), 'site_file_reset', jsonb_build_object('path', p_path));
end;
$$;

create or replace function public.rp_site_file_history(p_path text)
returns table(id bigint, version integer, action text, note text, size integer, saved_at timestamptz)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not public.rp_site_is_creator() then raise exception 'Creator role required'; end if;
  return query select h.id, h.version, h.action, h.note, char_length(h.content), h.saved_at from public.rp_site_file_history h where h.path = p_path order by h.id desc limit 30;
end;
$$;

create or replace function public.rp_site_file_history_content(p_id bigint)
returns text language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v text;
begin
  if not public.rp_site_is_creator() then raise exception 'Creator role required'; end if;
  select content into v from public.rp_site_file_history where id = p_id;
  return v;
end;
$$;

revoke all on function public.rp_site_is_creator() from public, anon;
revoke all on function public.rp_site_check_path(text) from public, anon, authenticated;
revoke all on function public.rp_list_site_files() from public, anon;
revoke all on function public.rp_get_site_file(text) from public, anon;
revoke all on function public.rp_save_site_file(text, text, text) from public, anon;
revoke all on function public.rp_set_site_file_enabled(text, boolean) from public, anon;
revoke all on function public.rp_reset_site_file(text) from public, anon;
revoke all on function public.rp_site_file_history(text) from public, anon;
revoke all on function public.rp_site_file_history_content(bigint) from public, anon;
grant execute on function public.rp_site_is_creator() to authenticated;
grant execute on function public.rp_list_site_files() to authenticated;
grant execute on function public.rp_get_site_file(text) to authenticated;
grant execute on function public.rp_save_site_file(text, text, text) to authenticated;
grant execute on function public.rp_set_site_file_enabled(text, boolean) to authenticated;
grant execute on function public.rp_reset_site_file(text) to authenticated;
grant execute on function public.rp_site_file_history(text) to authenticated;
grant execute on function public.rp_site_file_history_content(bigint) to authenticated;
