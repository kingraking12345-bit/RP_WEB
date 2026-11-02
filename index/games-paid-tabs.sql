-- RP Games: tabs that cost Refane to unlock.
-- Run this once in the Supabase SQL Editor AFTER account-system.sql and games-content.sql.
-- Safe to run again.
--
-- How it works
--   * An employee sets a Refane price on a Games tab (0 = free).
--   * When published, the content of every PAID tab (html/css/js) is moved out of the public snapshot
--     into a private table. Visitors only see the tab name, subtitle and price.
--   * A signed-in account unlocks a tab with rp_unlock_games_tab(): the price is read from the live
--     published version on the server, the balance is checked and deducted, and the unlock is stored.
--   * rp_get_games_tab() returns the private content only to accounts that unlocked it (and to employees).
--   * Unlocks are permanent for the account, and stay unlocked even if the price changes later.

create table if not exists public.rp_games_tab_content (
  version bigint not null references public.rp_games_publications(version) on delete cascade,
  tab_id text not null,
  html text not null default '',
  css text not null default '',
  js text not null default '',
  primary key (version, tab_id)
);
alter table public.rp_games_tab_content enable row level security;
revoke all on public.rp_games_tab_content from anon, authenticated;

create table if not exists public.rp_games_tab_unlocks (
  account_id uuid not null references auth.users(id) on delete cascade,
  tab_id text not null,
  price bigint not null,
  unlocked_at timestamptz not null default now(),
  primary key (account_id, tab_id)
);
alter table public.rp_games_tab_unlocks enable row level security;
revoke all on public.rp_games_tab_unlocks from anon, authenticated;
grant select on public.rp_games_tab_unlocks to authenticated;
drop policy if exists rp_games_unlocks_read_own on public.rp_games_tab_unlocks;
create policy rp_games_unlocks_read_own on public.rp_games_tab_unlocks
  for select to authenticated using (account_id = (select auth.uid()));

-- Shared by publish and the tab price checks.
create or replace function public.rp_games_tab_price(p_tab jsonb)
returns bigint language plpgsql immutable set search_path = public, pg_temp as $$
declare v_raw text := p_tab ->> 'price'; v_price numeric;
begin
  if v_raw is null or v_raw = '' then return 0; end if;
  if v_raw !~ '^[0-9]{1,7}$' then raise exception 'Tab "%" has an invalid Refane price', coalesce(p_tab ->> 'name', '?'); end if;
  v_price := v_raw::numeric;
  if v_price > 1000000 then raise exception 'Tab "%" price is too high (max 1,000,000)', coalesce(p_tab ->> 'name', '?'); end if;
  return v_price::bigint;
end;
$$;

create or replace function public.rp_publish_games(p_snapshot jsonb, p_note text default '')
returns bigint language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_version bigint;
  v_key text;
  v_tab jsonb;
  v_public jsonb;
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

  -- Public copy: paid tabs lose their content and are marked locked.
  v_public := p_snapshot;
  if p_snapshot ? 'tabs' then
    for v_tab in select value from jsonb_array_elements(p_snapshot -> 'tabs') loop
      if jsonb_typeof(v_tab) <> 'object' or coalesce(v_tab ->> 'id', '') = '' then
        raise exception 'Every tab needs an id';
      end if;
      perform public.rp_games_tab_price(v_tab);
    end loop;
    v_public := jsonb_set(p_snapshot, '{tabs}', coalesce((
      select jsonb_agg(
        case when public.rp_games_tab_price(t.value) > 0
          then (t.value - 'html' - 'css' - 'js') || jsonb_build_object('locked', true, 'price', public.rp_games_tab_price(t.value))
          else t.value end order by t.ord)
      from jsonb_array_elements(p_snapshot -> 'tabs') with ordinality as t(value, ord)
    ), '[]'::jsonb));
  end if;

  insert into public.rp_games_publications(snapshot, note, published_by)
  values (v_public, left(coalesce(p_note, ''), 200), auth.uid())
  returning version into v_version;

  if p_snapshot ? 'tabs' then
    insert into public.rp_games_tab_content(version, tab_id, html, css, js)
    select v_version, t.value ->> 'id', coalesce(t.value ->> 'html', ''), coalesce(t.value ->> 'css', ''), coalesce(t.value ->> 'js', '')
    from jsonb_array_elements(p_snapshot -> 'tabs') as t(value)
    where public.rp_games_tab_price(t.value) > 0;
  end if;

  insert into public.rp_audit_log(actor, action, details)
  values (auth.uid(), 'games_content_published', jsonb_build_object('version', v_version, 'note', left(coalesce(p_note, ''), 200)));

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
  insert into public.rp_games_tab_content(version, tab_id, html, css, js)
  select v_new, tab_id, html, css, js from public.rp_games_tab_content where version = p_version;
  insert into public.rp_audit_log(actor, action, details)
  values (auth.uid(), 'games_content_restored', jsonb_build_object('restored_version', p_version, 'version', v_new));
  delete from public.rp_games_publications where version <= v_new - 50;
  return v_new;
end;
$$;

-- Pay Refane to unlock a published paid tab.
create or replace function public.rp_unlock_games_tab(p_tab_id text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_account public.rp_accounts%rowtype;
  v_tab jsonb;
  v_price bigint;
begin
  if v_uid is null then raise exception 'Sign in to unlock tabs'; end if;
  select * into v_account from public.rp_accounts where id = v_uid for update;
  if not found or v_account.status <> 'active' then raise exception 'Your account cannot make purchases right now'; end if;

  if exists (select 1 from public.rp_games_tab_unlocks where account_id = v_uid and tab_id = p_tab_id) then
    return jsonb_build_object('unlocked', true, 'charged', 0, 'balance', v_account.refane_balance);
  end if;

  select t.value into v_tab
  from (select snapshot from public.rp_games_publications order by version desc limit 1) p,
       jsonb_array_elements(coalesce(p.snapshot -> 'tabs', '[]'::jsonb)) as t(value)
  where t.value ->> 'id' = p_tab_id limit 1;
  if v_tab is null then raise exception 'That tab is not published'; end if;
  v_price := public.rp_games_tab_price(v_tab);
  if v_price <= 0 then raise exception 'That tab is free'; end if;
  if v_account.refane_balance < v_price then
    raise exception 'Not enough Refane (you need %, you have %)', v_price, v_account.refane_balance;
  end if;

  update public.rp_accounts set refane_balance = refane_balance - v_price, updated_at = now() where id = v_uid;
  insert into public.rp_games_tab_unlocks(account_id, tab_id, price) values (v_uid, p_tab_id, v_price);
  insert into public.rp_audit_log(actor, action, target_account, details)
  values (v_uid, 'games_tab_unlocked', v_account.account_number, jsonb_build_object('tab_id', p_tab_id, 'tab', left(coalesce(v_tab ->> 'name', ''), 40), 'price', v_price));
  return jsonb_build_object('unlocked', true, 'charged', v_price, 'balance', v_account.refane_balance - v_price);
end;
$$;

-- Private content of a paid tab: only for accounts that unlocked it (and for employees).
create or replace function public.rp_get_games_tab(p_tab_id text)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_row public.rp_games_tab_content%rowtype;
begin
  if v_uid is null then raise exception 'Sign in to view this tab'; end if;
  if not exists (select 1 from public.rp_accounts where id = v_uid and status = 'active') then raise exception 'Your account cannot view this tab right now'; end if;
  if not public.rp_is_games_editor() and not exists (select 1 from public.rp_games_tab_unlocks where account_id = v_uid and tab_id = p_tab_id) then
    raise exception 'This tab is locked. Unlock it with Refane first';
  end if;
  select c.* into v_row from public.rp_games_tab_content c
   where c.tab_id = p_tab_id
     and c.version = (select max(version) from public.rp_games_publications)
   limit 1;
  if not found then raise exception 'That tab has no content'; end if;
  return jsonb_build_object('html', v_row.html, 'css', v_row.css, 'js', v_row.js);
end;
$$;

revoke all on function public.rp_games_tab_price(jsonb) from public, anon, authenticated;
revoke all on function public.rp_publish_games(jsonb, text) from public, anon;
revoke all on function public.rp_republish_games(bigint) from public, anon;
revoke all on function public.rp_unlock_games_tab(text) from public, anon;
revoke all on function public.rp_get_games_tab(text) from public, anon;
grant execute on function public.rp_publish_games(jsonb, text) to authenticated;
grant execute on function public.rp_republish_games(bigint) to authenticated;
grant execute on function public.rp_unlock_games_tab(text) to authenticated;
grant execute on function public.rp_get_games_tab(text) to authenticated;
