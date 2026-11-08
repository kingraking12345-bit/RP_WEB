-- RP Labs: trained results, the "Not discovered yet" inbox, employee settings.
-- Run with "npm run migrate" (server folder) AFTER labs-content.sql. Safe to run again.
--
--   * Visitors can no longer teach the lab anything. When they try a combination, the page asks rp_labs_lookup().
--       - trained  -> the saved result is returned
--       - unknown  -> "Not discovered yet"; the attempt is saved in the inbox and every Labs employee gets a notification
--                     ("<account name> (#<account number>) discovered a combination you have not trained output of").
--   * Only Labs employees can train results (rp_labs_train), read the inbox, and change Labs settings.
--   * Trained results are never listed publicly: a visitor only ever receives the answer for the exact combination they tried.

create table if not exists public.rp_labs_training (
  kind text not null check (kind in ('lab', 'time', 'physics', 'exp')),
  key text not null check (char_length(key) between 1 and 400),
  data jsonb not null check (jsonb_typeof(data) = 'object'),
  trained_by uuid references auth.users(id) on delete set null,
  trained_at timestamptz not null default now(),
  primary key (kind, key)
);
alter table public.rp_labs_training enable row level security;
revoke all on public.rp_labs_training from anon, authenticated;

create table if not exists public.rp_labs_attempts (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('lab', 'time', 'physics', 'exp')),
  key text not null,
  account_id uuid not null references auth.users(id) on delete cascade,
  account_number bigint not null,
  username text not null,
  label text not null default '',
  params jsonb not null default '{}'::jsonb,
  attempts integer not null default 1,
  status text not null default 'new' check (status in ('new', 'seen', 'dismissed')),
  first_at timestamptz not null default now(),
  last_at timestamptz not null default now(),
  notified_at timestamptz,
  unique (kind, key, account_id)
);
create index if not exists rp_labs_attempts_last on public.rp_labs_attempts (last_at desc);
alter table public.rp_labs_attempts enable row level security;
revoke all on public.rp_labs_attempts from anon, authenticated;

create table if not exists public.rp_labs_settings (
  id integer primary key check (id = 1),
  data jsonb not null default '{}'::jsonb,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);
alter table public.rp_labs_settings enable row level security;
revoke all on public.rp_labs_settings from anon, authenticated;
insert into public.rp_labs_settings(id, data) values (1, '{}'::jsonb) on conflict (id) do nothing;

-- ---------- settings ----------
create or replace function public.rp_labs_default_settings() returns jsonb language sql immutable as $$
  select jsonb_build_object(
    'labs_open', true,
    'banner', '', 'banner_tone', 'info',
    'not_discovered_text', 'Not discovered yet. The Labs team has been told about your combination.',
    'guest_text', 'Sign in to an account so the Labs team knows who found it.',
    'notify_enabled', true, 'notify_cap_per_day', 200, 'attempts_cap_per_account_day', 200, 'notify_discoverer', true,
    'starting_money', 50, 'price_multiplier', 1, 'max_selection', 4, 'quiz_reward_both', 25, 'quiz_reward_one', 10,
    'show_daily_experiment', true, 'sandbox_timeout_ms', 5000,
    'tabs', jsonb_build_object('lab', true, 'scilabs', true, 'research', true, 'library', true, 'store', true,
      'addmaterial', true, 'timeskip', true, 'physicslab', true, 'materialinfo', true, 'earn', true))
$$;

create or replace function public.rp_labs_settings_public() returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select public.rp_labs_default_settings() || coalesce((select data from public.rp_labs_settings where id = 1), '{}'::jsonb)
$$;

create or replace function public.rp_labs_settings_save(p_data jsonb) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v jsonb := '{}'::jsonb; k text; d jsonb := coalesce(p_data, '{}'::jsonb); t text;
  allowed_tabs text[] := array['lab','scilabs','research','library','store','addmaterial','timeskip','physicslab','materialinfo','earn'];
begin
  if not public.rp_is_labs_editor() then raise exception 'Labs employee role required'; end if;
  if jsonb_typeof(d) <> 'object' then raise exception 'Settings must be an object'; end if;
  foreach k in array array['labs_open','notify_enabled','notify_discoverer','show_daily_experiment'] loop
    if d ? k then if jsonb_typeof(d -> k) <> 'boolean' then raise exception 'Setting % must be on or off', k; end if; v := v || jsonb_build_object(k, d -> k); end if;
  end loop;
  foreach k in array array['banner','not_discovered_text','guest_text'] loop
    if d ? k then if jsonb_typeof(d -> k) <> 'string' or length(d ->> k) > 400 then raise exception 'Setting % must be text of at most 400 characters', k; end if; v := v || jsonb_build_object(k, d -> k); end if;
  end loop;
  if d ? 'banner_tone' then if (d ->> 'banner_tone') not in ('info','good','warn','bad') then raise exception 'Banner colour must be info, good, warn or bad'; end if; v := v || jsonb_build_object('banner_tone', d -> 'banner_tone'); end if;
  foreach k in array array['notify_cap_per_day','attempts_cap_per_account_day','starting_money','max_selection','quiz_reward_both','quiz_reward_one','sandbox_timeout_ms'] loop
    if d ? k then
      if jsonb_typeof(d -> k) <> 'number' then raise exception 'Setting % must be a number', k; end if;
      if k = 'max_selection' and ((d ->> k)::numeric < 2 or (d ->> k)::numeric > 8) then raise exception 'Items per experiment must be 2 to 8'; end if;
      if k = 'sandbox_timeout_ms' and ((d ->> k)::numeric < 1000 or (d ->> k)::numeric > 120000) then raise exception 'Test time limit must be 1 to 120 seconds'; end if;
      if k in ('notify_cap_per_day','attempts_cap_per_account_day') and ((d ->> k)::numeric < 0 or (d ->> k)::numeric > 100000) then raise exception 'Daily limits must be 0 to 100000'; end if;
      if k in ('starting_money','quiz_reward_both','quiz_reward_one') and ((d ->> k)::numeric < 0 or (d ->> k)::numeric > 1000000) then raise exception 'Money values must be 0 to 1000000'; end if;
      v := v || jsonb_build_object(k, to_jsonb(floor((d ->> k)::numeric)));
    end if;
  end loop;
  if d ? 'price_multiplier' then
    if jsonb_typeof(d -> 'price_multiplier') <> 'number' or (d ->> 'price_multiplier')::numeric < 0.1 or (d ->> 'price_multiplier')::numeric > 10 then raise exception 'Price multiplier must be 0.1 to 10'; end if;
    v := v || jsonb_build_object('price_multiplier', to_jsonb(round((d ->> 'price_multiplier')::numeric, 2)));
  end if;
  if d ? 'tabs' then
    if jsonb_typeof(d -> 'tabs') <> 'object' then raise exception 'Tabs must be an object'; end if;
    for t in select jsonb_object_keys(d -> 'tabs') loop
      if t <> all (allowed_tabs) then raise exception 'Unknown tab %', t; end if;
      if jsonb_typeof(d -> 'tabs' -> t) <> 'boolean' then raise exception 'Tab % must be on or off', t; end if;
    end loop;
  end if;
  -- a setting that was not sent keeps its current value
  v := public.rp_labs_default_settings() || coalesce((select data from public.rp_labs_settings where id = 1), '{}'::jsonb) || v;
  v := jsonb_set(v, '{tabs}', (public.rp_labs_default_settings() -> 'tabs') || coalesce((select data -> 'tabs' from public.rp_labs_settings where id = 1), '{}'::jsonb) || coalesce(d -> 'tabs', '{}'::jsonb));
  v := (select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) from jsonb_each(v) where key = any (array(select jsonb_object_keys(public.rp_labs_default_settings()))));
  insert into public.rp_labs_settings(id, data, updated_by, updated_at) values (1, v, auth.uid(), now())
    on conflict (id) do update set data = excluded.data, updated_by = excluded.updated_by, updated_at = now();
  insert into public.rp_audit_log(actor, action, details) values (auth.uid(), 'labs_settings_saved', jsonb_build_object('keys', (select coalesce(jsonb_agg(x), '[]'::jsonb) from jsonb_object_keys(d) x)));
  return public.rp_labs_settings_public();
end;
$$;

-- ---------- lookup (what visitors call) ----------
create or replace function public.rp_labs_lookup(p_kind text, p_key text, p_label text default '', p_params jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_data jsonb; v_uid uuid := auth.uid(); v_acc public.rp_accounts%rowtype; v_set jsonb := public.rp_labs_settings_public();
  v_first boolean; v_id bigint; v_today integer; v_label text := left(coalesce(p_label, ''), 300);
  v_params jsonb := case when jsonb_typeof(coalesce(p_params, '{}'::jsonb)) = 'object' and octet_length(coalesce(p_params, '{}'::jsonb)::text) <= 4000 then coalesce(p_params, '{}'::jsonb) else '{}'::jsonb end;
begin
  if p_kind is null or p_kind not in ('lab', 'time', 'physics', 'exp') then raise exception 'Unknown lab type'; end if;
  if p_key is null or char_length(p_key) < 1 or char_length(p_key) > 400 then raise exception 'Invalid combination'; end if;
  if not coalesce((v_set ->> 'labs_open')::boolean, true) then return jsonb_build_object('found', false, 'closed', true); end if;
  select data into v_data from public.rp_labs_training where kind = p_kind and key = p_key;
  if v_data is not null then return jsonb_build_object('found', true, 'data', v_data); end if;
  if v_uid is null then return jsonb_build_object('found', false, 'guest', true); end if;
  select * into v_acc from public.rp_accounts where id = v_uid and status = 'active';
  if not found then return jsonb_build_object('found', false); end if;

  -- anti-spam: a limited number of new combinations per account per day
  select count(*) into v_today from public.rp_labs_attempts where account_id = v_uid and first_at >= date_trunc('day', now());
  if exists (select 1 from public.rp_labs_attempts where kind = p_kind and key = p_key and account_id = v_uid) then
    update public.rp_labs_attempts set attempts = attempts + 1, last_at = now(), label = case when v_label <> '' then v_label else label end,
      status = case when status = 'dismissed' then 'dismissed' else status end where kind = p_kind and key = p_key and account_id = v_uid;
    return jsonb_build_object('found', false, 'recorded', true);
  end if;
  if v_today >= coalesce((v_set ->> 'attempts_cap_per_account_day')::integer, 200) then return jsonb_build_object('found', false, 'limited', true); end if;

  v_first := not exists (select 1 from public.rp_labs_attempts where kind = p_kind and key = p_key);
  insert into public.rp_labs_attempts(kind, key, account_id, account_number, username, label, params)
    values (p_kind, p_key, v_uid, v_acc.account_number, v_acc.username, v_label, v_params) returning id into v_id;

  -- tell every Labs employee, once per combination, within the daily notification limit
  if v_first and coalesce((v_set ->> 'notify_enabled')::boolean, true)
     and (select count(*) from public.rp_labs_attempts where notified_at >= date_trunc('day', now())) < coalesce((v_set ->> 'notify_cap_per_day')::integer, 200) then
    insert into public.rp_notifications(account_id, title, body, link)
      select a.id, 'New undiscovered combination 🔬',
        v_acc.username || ' (#' || v_acc.account_number || ') discovered a combination you have not trained output of.' || E'\n' ||
        case p_kind when 'lab' then 'Lab bench' when 'time' then 'Time & Temp' when 'physics' then 'Physics Lab' else 'Science Labs experiment' end || ': ' || left(v_label, 200),
        '../Labs/labs-employee.html#inbox'
      from public.rp_accounts a
      where a.status = 'active' and a.id <> v_uid and a.roles && array['Creator', 'Lab Studio Director', 'Lab Scientist', 'Labs Employee']::text[];
    update public.rp_labs_attempts set notified_at = now() where id = v_id;
  end if;
  return jsonb_build_object('found', false, 'recorded', true);
end;
$$;

-- ---------- training (Labs employees only) ----------
create or replace function public.rp_labs_train(p_kind text, p_key text, p_data jsonb) returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_set jsonb := public.rp_labs_settings_public(); v_n integer;
begin
  if not public.rp_is_labs_editor() then raise exception 'Labs employee role required'; end if;
  if p_kind is null or p_kind not in ('lab', 'time', 'physics', 'exp') then raise exception 'Unknown lab type'; end if;
  if p_key is null or char_length(p_key) < 1 or char_length(p_key) > 400 then raise exception 'Invalid combination key'; end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' then raise exception 'A trained result must be an object'; end if;
  if octet_length(p_data::text) > 3000000 then raise exception 'That result is too large (limit 3 MB)'; end if;
  insert into public.rp_labs_training(kind, key, data, trained_by, trained_at) values (p_kind, p_key, p_data, auth.uid(), now())
    on conflict (kind, key) do update set data = excluded.data, trained_by = excluded.trained_by, trained_at = now();
  -- thank the visitors who found it
  if coalesce((v_set ->> 'notify_discoverer')::boolean, true) then
    insert into public.rp_notifications(account_id, title, body, link)
      select t.account_id, 'Your discovery now has a result 🎉', 'The Labs team trained the combination you tried: ' || left(t.label, 200), '../Labs/labs.html'
      from (select account_id, label from public.rp_labs_attempts where kind = p_kind and key = p_key and status <> 'dismissed' order by id limit 100) t;
  end if;
  update public.rp_labs_attempts set status = 'seen' where kind = p_kind and key = p_key and status = 'new';
  get diagnostics v_n = row_count;
end;
$$;

create or replace function public.rp_labs_train_many(p_items jsonb) returns integer language plpgsql security definer set search_path = public, pg_temp as $$
declare v_item jsonb; v_count integer := 0;
begin
  if not public.rp_is_labs_editor() then raise exception 'Labs employee role required'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' then raise exception 'Items must be a list'; end if;
  if jsonb_array_length(p_items) > 200 then raise exception 'At most 200 results per upload'; end if;
  for v_item in select value from jsonb_array_elements(p_items) loop
    if jsonb_typeof(v_item) <> 'object' then raise exception 'Every item must be an object'; end if;
    perform public.rp_labs_train(v_item ->> 'kind', v_item ->> 'key', v_item -> 'data');
    v_count := v_count + 1;
  end loop;
  insert into public.rp_audit_log(actor, action, details) values (auth.uid(), 'labs_trained', jsonb_build_object('count', v_count));
  return v_count;
end;
$$;

create or replace function public.rp_labs_untrain(p_kind text, p_key text) returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not public.rp_is_labs_editor() then raise exception 'Labs employee role required'; end if;
  delete from public.rp_labs_training where kind = p_kind and key = p_key;
  if not found then raise exception 'That trained result does not exist'; end if;
  insert into public.rp_audit_log(actor, action, details) values (auth.uid(), 'labs_untrained', jsonb_build_object('kind', p_kind, 'key', left(p_key, 200)));
end;
$$;

create or replace function public.rp_labs_training_list(p_kind text default null, p_query text default '', p_limit integer default 100, p_offset integer default 0)
returns table(kind text, key text, title text, bytes integer, trained_at timestamptz, trained_by text)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not public.rp_is_labs_editor() then raise exception 'Labs employee role required'; end if;
  return query select t.kind, t.key, left(coalesce(t.data ->> 'title', t.data ->> 'text', ''), 120), octet_length(t.data::text), t.trained_at, coalesce(a.username, '')
    from public.rp_labs_training t left join public.rp_accounts a on a.id = t.trained_by
    where (p_kind is null or p_kind = '' or t.kind = p_kind) and (coalesce(p_query, '') = '' or t.key ilike '%' || replace(replace(p_query, '%', ''), '_', '\_') || '%' or coalesce(t.data ->> 'title', '') ilike '%' || replace(replace(p_query, '%', ''), '_', '\_') || '%')
    order by t.trained_at desc limit least(greatest(coalesce(p_limit, 100), 1), 500) offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

create or replace function public.rp_labs_training_get(p_kind text, p_key text) returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v jsonb;
begin
  if not public.rp_is_labs_editor() then raise exception 'Labs employee role required'; end if;
  select data into v from public.rp_labs_training where kind = p_kind and key = p_key;
  return v;
end;
$$;

-- everything trained so far, for a backup (employees only)
create or replace function public.rp_labs_training_export(p_kind text default null) returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not public.rp_is_labs_editor() then raise exception 'Labs employee role required'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('kind', t.kind, 'key', t.key, 'data', t.data) order by t.kind, t.key) from public.rp_labs_training t where p_kind is null or p_kind = '' or t.kind = p_kind), '[]'::jsonb);
end;
$$;

-- ---------- inbox ----------
create or replace function public.rp_labs_inbox(p_status text default 'open', p_limit integer default 200)
returns table(id bigint, kind text, key text, label text, params jsonb, account_number bigint, username text, attempts integer, status text, first_at timestamptz, last_at timestamptz, trained boolean)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not public.rp_is_labs_editor() then raise exception 'Labs employee role required'; end if;
  return query select a.id, a.kind, a.key, a.label, a.params, a.account_number, a.username, a.attempts, a.status, a.first_at, a.last_at,
      exists (select 1 from public.rp_labs_training t where t.kind = a.kind and t.key = a.key)
    from public.rp_labs_attempts a
    where case coalesce(p_status, 'open') when 'open' then a.status in ('new', 'seen') when 'all' then true else a.status = p_status end
    order by a.last_at desc limit least(greatest(coalesce(p_limit, 200), 1), 1000);
end;
$$;

create or replace function public.rp_labs_inbox_set(p_id bigint, p_status text) returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not public.rp_is_labs_editor() then raise exception 'Labs employee role required'; end if;
  if p_status not in ('new', 'seen', 'dismissed') then raise exception 'Invalid status'; end if;
  update public.rp_labs_attempts set status = p_status where id = p_id;
  if not found then raise exception 'That entry no longer exists'; end if;
end;
$$;

create or replace function public.rp_labs_inbox_mark_all_seen() returns integer language plpgsql security definer set search_path = public, pg_temp as $$
declare v integer;
begin
  if not public.rp_is_labs_editor() then raise exception 'Labs employee role required'; end if;
  update public.rp_labs_attempts set status = 'seen' where status = 'new'; get diagnostics v = row_count; return v;
end;
$$;

create or replace function public.rp_labs_stats() returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not public.rp_is_labs_editor() then raise exception 'Labs employee role required'; end if;
  return jsonb_build_object(
    'trained', coalesce((select jsonb_object_agg(kind, n) from (select kind, count(*) n from public.rp_labs_training group by kind) x), '{}'::jsonb),
    'inbox_new', (select count(*) from public.rp_labs_attempts where status = 'new'),
    'inbox_open', (select count(*) from public.rp_labs_attempts where status in ('new', 'seen')),
    'untrained_open', (select count(*) from (select distinct kind, key from public.rp_labs_attempts a where a.status in ('new', 'seen')
        and not exists (select 1 from public.rp_labs_training t where t.kind = a.kind and t.key = a.key)) y),
    'explorers', (select count(distinct account_id) from public.rp_labs_attempts),
    'bytes', coalesce((select sum(octet_length(data::text)) from public.rp_labs_training), 0));
end;
$$;

-- ---------- private scripts ----------
create or replace function public.rp_labs_scripts_get() returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not public.rp_is_labs_editor() then raise exception 'Labs employee role required'; end if;
  return coalesce((select jsonb_object_agg(exp_id, script) from public.rp_labs_scripts), '{}'::jsonb);
end;
$$;

-- ---------- who may call what ----------
do $$
declare f text;
begin
  foreach f in array array[
    'rp_labs_settings_save(jsonb)', 'rp_labs_train(text,text,jsonb)', 'rp_labs_train_many(jsonb)', 'rp_labs_untrain(text,text)',
    'rp_labs_training_list(text,text,integer,integer)', 'rp_labs_training_get(text,text)', 'rp_labs_training_export(text)',
    'rp_labs_inbox(text,integer)', 'rp_labs_inbox_set(bigint,text)', 'rp_labs_inbox_mark_all_seen()', 'rp_labs_stats()', 'rp_labs_scripts_get()']
  loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
  foreach f in array array['rp_labs_settings_public()', 'rp_labs_lookup(text,text,text,jsonb)']
  loop
    execute format('revoke all on function public.%s from public', f);
    execute format('grant execute on function public.%s to anon, authenticated', f);
  end loop;
  revoke all on function public.rp_labs_default_settings() from public, anon, authenticated;
end $$;
