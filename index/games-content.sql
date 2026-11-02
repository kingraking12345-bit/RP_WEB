-- RP Games published content (shared by every visitor on every device).
-- Run this once in the Supabase SQL Editor AFTER account-system.sql.
--
-- How it works
--   * Employees edit drafts in game-employee.html (stored in their browser).
--   * "Publish to everyone" sends one snapshot to rp_publish_games().
--   * Every visitor's Games page reads the newest snapshot (public, read-only).
--   * Only Creator, Games Studio Director and Game Employee accounts can publish.
--   * Nothing can be written to the table directly; only through the functions below.

create table if not exists public.rp_games_publications (
  version bigint generated always as identity primary key,
  snapshot jsonb not null,
  note text not null default '',
  published_by uuid references auth.users(id) on delete set null,
  published_at timestamptz not null default now(),
  constraint rp_games_snapshot_is_object check (jsonb_typeof(snapshot) = 'object')
);

alter table public.rp_games_publications enable row level security;

revoke all on public.rp_games_publications from anon, authenticated;
-- Visitors may read the snapshot, but never see who published it.
grant select (version, snapshot, published_at) on public.rp_games_publications to anon;
grant select (version, snapshot, published_at, note) on public.rp_games_publications to authenticated;

drop policy if exists rp_games_publications_read on public.rp_games_publications;
create policy rp_games_publications_read on public.rp_games_publications
  for select to anon, authenticated using (true);

create or replace function public.rp_is_games_editor()
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists(
    select 1 from public.rp_accounts
    where id = (select auth.uid())
      and status = 'active'
      and roles && array['Creator','Games Studio Director','Game Employee']::text[]
  )
$$;

create or replace function public.rp_publish_games(p_snapshot jsonb, p_note text default '')
returns bigint language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_version bigint;
  v_key text;
begin
  if not public.rp_is_games_editor() then
    raise exception 'Games employee role required';
  end if;
  if p_snapshot is null or jsonb_typeof(p_snapshot) <> 'object' then
    raise exception 'Snapshot must be a JSON object';
  end if;
  if octet_length(p_snapshot::text) > 8000000 then
    raise exception 'Snapshot is too large (limit 8 MB). Use smaller event banners.';
  end if;
  foreach v_key in array array['tabs','events','features','patches','roadmap'] loop
    if p_snapshot ? v_key and jsonb_typeof(p_snapshot -> v_key) <> 'array' then
      raise exception 'Snapshot section "%" must be a list', v_key;
    end if;
  end loop;
  if p_snapshot ? 'banner' and jsonb_typeof(p_snapshot -> 'banner') not in ('object','null') then
    raise exception 'Snapshot section "banner" must be an object';
  end if;

  insert into public.rp_games_publications(snapshot, note, published_by)
  values (p_snapshot, left(coalesce(p_note, ''), 200), auth.uid())
  returning version into v_version;

  insert into public.rp_audit_log(actor, action, details)
  values (auth.uid(), 'games_content_published', jsonb_build_object('version', v_version, 'note', left(coalesce(p_note, ''), 200)));

  -- keep the most recent 50 versions
  delete from public.rp_games_publications where version <= v_version - 50;
  return v_version;
end;
$$;

create or replace function public.rp_republish_games(p_version bigint)
returns bigint language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_snapshot jsonb;
  v_new bigint;
begin
  if not public.rp_is_games_editor() then
    raise exception 'Games employee role required';
  end if;
  select snapshot into v_snapshot from public.rp_games_publications where version = p_version;
  if v_snapshot is null then raise exception 'That version no longer exists'; end if;
  insert into public.rp_games_publications(snapshot, note, published_by)
  values (v_snapshot, 'Restored version ' || p_version, auth.uid())
  returning version into v_new;
  insert into public.rp_audit_log(actor, action, details)
  values (auth.uid(), 'games_content_restored', jsonb_build_object('restored_version', p_version, 'version', v_new));
  delete from public.rp_games_publications where version <= v_new - 50;
  return v_new;
end;
$$;

revoke all on function public.rp_is_games_editor() from public, anon;
revoke all on function public.rp_publish_games(jsonb, text) from public, anon;
revoke all on function public.rp_republish_games(bigint) from public, anon;
grant execute on function public.rp_is_games_editor() to authenticated;
grant execute on function public.rp_publish_games(jsonb, text) to authenticated;
grant execute on function public.rp_republish_games(bigint) to authenticated;
