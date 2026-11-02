-- RP account system (rebuilt for plain PostgreSQL).
-- This replaces the missing account-system.sql. It was rebuilt from the behaviour of the local-test backend
-- (index/local/accounts.js), so every function name, argument name and returned field matches what the pages call.
-- Run AFTER 00-compat.sql. Safe to run again.

create sequence if not exists public.rp_account_number_seq start 10000001;

create table if not exists public.rp_roles (
  role_name text primary key,
  description text not null default '',
  permissions text[] not null default '{}',
  is_system boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.rp_accounts (
  id uuid primary key references auth.users(id) on delete cascade,
  account_number bigint not null unique default nextval('public.rp_account_number_seq'),
  username text not null unique,
  roles text[] not null default array['Member']::text[],
  refane_balance numeric not null default 0,
  status text not null default 'active' check (status in ('active','timeout','banned')),
  timeout_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- only one Creator can ever exist
create unique index if not exists rp_accounts_one_creator on public.rp_accounts ((true)) where roles @> array['Creator']::text[];

create table if not exists public.rp_audit_log (
  id bigint generated always as identity primary key,
  actor uuid references auth.users(id) on delete set null,
  action text not null,
  target_account bigint,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.rp_branch_authority (
  branch_key text primary key,
  branch_name text not null,
  director_role text not null,
  director_account bigint,
  maintenance boolean not null default false,
  updated_at timestamptz not null default now()
);

create table if not exists public.rp_branch_budgets (
  branch_key text primary key,
  amount numeric not null default 0,
  currency text not null default 'USD',
  notes text not null default '',
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists public.rp_policies (
  id bigint generated always as identity primary key,
  title text not null,
  policy_type text not null default 'Policy',
  body text not null,
  version integer not null default 1,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.rp_announcements (
  id bigint generated always as identity primary key,
  title text not null,
  body text not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.rp_governance_records (
  id bigint generated always as identity primary key,
  record_type text not null check (record_type in ('asset','project_approval','employment','governance')),
  title text not null,
  status text not null,
  details text not null default '',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Row level security: a signed-in user may read only their own account row. Everything else goes through the functions below.
alter table public.rp_roles enable row level security;
alter table public.rp_accounts enable row level security;
alter table public.rp_audit_log enable row level security;
alter table public.rp_branch_authority enable row level security;
alter table public.rp_branch_budgets enable row level security;
alter table public.rp_policies enable row level security;
alter table public.rp_announcements enable row level security;
alter table public.rp_governance_records enable row level security;

grant select on public.rp_roles to authenticated;
grant select on public.rp_accounts to authenticated;
drop policy if exists rp_roles_read on public.rp_roles;
create policy rp_roles_read on public.rp_roles for select to authenticated using (true);
drop policy if exists rp_accounts_own on public.rp_accounts;
create policy rp_accounts_own on public.rp_accounts for select to authenticated using (id = (select auth.uid()));

insert into public.rp_roles(role_name, description, is_system) values
  ('Member','Default role for new accounts.',true),
  ('Creator','Single owner role for RP-wide governance.',true),
  ('Games Studio Director','Leads the Games branch.',true),
  ('Game Employee','Builds and manages RP Games pages and event previews.',true),
  ('Education Studio Director','Leads the Education branch.',true),
  ('Lab Studio Director','Leads the Labs branch.',true),
  ('Tool Studio Director','Leads the Tools branch.',true),
  ('Music Studio Director','Leads the Music branch.',true),
  ('Community Studio Director','Leads the Community branch.',true),
  ('Skills Studio Director','Leads the Skills branch.',true),
  ('Lab Scientist','Authorized scientist role for the Labs branch.',true),
  ('Tool Employee','Builds tools and edits Kignity AI.',true),
  ('Music Employee','Curates the Music branch.',true),
  ('Education Employee','Builds courses for the Education branch.',true),
  ('Skills Employee','Builds skills and courses.',true),
  ('Community Employee','Moderates the Community branch.',true),
  ('Labs Employee','Builds labs and experiments.',true),
  ('Games Developer','Dev Team: edits Games code in the Coder.',true),
  ('Tools Developer','Dev Team: edits Tools code in the Coder.',true),
  ('Music Developer','Dev Team: edits Music code in the Coder.',true),
  ('Education Developer','Dev Team: edits Education code in the Coder.',true),
  ('Skills Developer','Dev Team: edits Skills code in the Coder.',true),
  ('Community Developer','Dev Team: edits Community code in the Coder.',true),
  ('Labs Developer','Dev Team: edits Labs code in the Coder.',true)
on conflict (role_name) do nothing;

insert into public.rp_branch_authority(branch_key, branch_name, director_role) values
  ('labs','Labs','Lab Studio Director'), ('games','Games','Games Studio Director'),
  ('education','Education','Education Studio Director'), ('tools','Tools','Tool Studio Director'),
  ('music','Music','Music Studio Director'), ('community','Community','Community Studio Director'),
  ('skills','Skills','Skills Studio Director')
on conflict (branch_key) do nothing;

-- A new login account automatically gets an RP account (this replaces the Supabase signup trigger).
create or replace function public.rp_handle_new_user() returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare v_num bigint := nextval('public.rp_account_number_seq'); v_base text; v_name text;
begin
  v_base := lower(coalesce(new.raw_user_meta_data ->> 'username', 'member'));
  v_base := regexp_replace(regexp_replace(v_base, '[^a-zA-Z0-9_-]+', '-', 'g'), '^-+|-+$', '', 'g');
  if length(v_base) < 2 then v_base := 'member'; end if;
  v_name := left(v_base, 48);
  if exists (select 1 from public.rp_accounts where username = v_name) then v_name := left(v_base, 38) || '-' || v_num; end if;
  insert into public.rp_accounts(id, account_number, username) values (new.id, v_num, v_name);
  return new;
end;
$$;
drop trigger if exists rp_on_auth_user_created on auth.users;
create trigger rp_on_auth_user_created after insert on auth.users for each row execute function public.rp_handle_new_user();

-- ---------- helpers ----------
create or replace function public.rp_is_creator() returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists(select 1 from public.rp_accounts a where a.id = (select auth.uid()) and a.status = 'active' and a.roles @> array['Creator']::text[])
$$;

create or replace function public.rp_require_creator() returns void language plpgsql stable security definer set search_path = public, pg_temp as $$
begin if not public.rp_is_creator() then raise exception 'Creator role required'; end if; end;
$$;

-- ---------- account context ----------
create or replace function public.rp_get_account_context() returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare a public.rp_accounts%rowtype;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  select * into a from public.rp_accounts where id = auth.uid();
  if not found then raise exception 'Account profile is not initialized'; end if;
  if a.status = 'timeout' and a.timeout_until is not null and a.timeout_until <= now() then
    update public.rp_accounts set status = 'active', timeout_until = null, updated_at = now() where id = a.id returning * into a;
  end if;
  return jsonb_build_object('account_number', a.account_number, 'username', a.username, 'roles', to_jsonb(a.roles),
    'refane_balance', a.refane_balance, 'status', a.status, 'timeout_until', a.timeout_until, 'created_at', a.created_at);
end;
$$;

create or replace function public.rp_creator_overview() returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform public.rp_require_creator();
  return jsonb_build_object(
    'accounts', coalesce((select jsonb_agg(jsonb_build_object('account_number', x.account_number, 'username', x.username, 'roles', to_jsonb(x.roles),
        'refane_balance', x.refane_balance, 'status', x.status, 'timeout_until', x.timeout_until, 'created_at', x.created_at) order by x.account_number) from public.rp_accounts x), '[]'::jsonb),
    'roles', coalesce((select jsonb_agg(to_jsonb(r) order by r.is_system desc, r.role_name) from public.rp_roles r), '[]'::jsonb),
    'branches', coalesce((select jsonb_agg(to_jsonb(b) order by b.branch_name) from public.rp_branch_authority b), '[]'::jsonb),
    'budgets', coalesce((select jsonb_agg(to_jsonb(b)) from public.rp_branch_budgets b), '[]'::jsonb),
    'policies', coalesce((select jsonb_agg(to_jsonb(p)) from (select * from public.rp_policies order by created_at desc, id desc limit 100) p), '[]'::jsonb),
    'announcements', coalesce((select jsonb_agg(to_jsonb(p)) from (select * from public.rp_announcements order by created_at desc, id desc limit 100) p), '[]'::jsonb),
    'audit', coalesce((select jsonb_agg(to_jsonb(p)) from (select * from public.rp_audit_log order by id desc limit 200) p), '[]'::jsonb),
    'governance_records', coalesce((select jsonb_agg(to_jsonb(p)) from (select * from public.rp_governance_records order by created_at desc, id desc limit 200) p), '[]'::jsonb),
    'account_count', (select count(*) from public.rp_accounts),
    'active_count', (select count(*) from public.rp_accounts where status = 'active'));
end;
$$;

-- ---------- Creator actions ----------
create or replace function public.rp_set_account_role(p_account_number bigint, p_role_name text, p_grant boolean) returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v public.rp_accounts%rowtype;
begin
  perform public.rp_require_creator();
  if p_role_name = 'Creator' then raise exception 'Use Creator transfer for the single Creator role'; end if;
  if not exists (select 1 from public.rp_roles where role_name = p_role_name) then raise exception 'Unknown role'; end if;
  select * into v from public.rp_accounts where account_number = p_account_number for update;
  if not found then raise exception 'Account not found'; end if;
  update public.rp_accounts set updated_at = now(),
    roles = case when coalesce(p_grant, false) then array(select distinct x from unnest(roles || array[p_role_name]) x) else array_remove(roles, p_role_name) end
  where id = v.id;
  insert into public.rp_audit_log(actor, action, target_account, details) values (auth.uid(), case when coalesce(p_grant,false) then 'role_granted' else 'role_removed' end, v.account_number, jsonb_build_object('role', p_role_name));
end;
$$;

create or replace function public.rp_set_account_status(p_account_number bigint, p_status text, p_timeout_until timestamptz default null, p_reason text default '') returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v public.rp_accounts%rowtype;
begin
  perform public.rp_require_creator();
  if p_status not in ('active','timeout','banned') then raise exception 'Invalid account status'; end if;
  if p_status = 'timeout' and p_timeout_until is null then raise exception 'Timeout end time is required'; end if;
  if p_status = 'timeout' and p_timeout_until <= now() then raise exception 'Timeout end time must be in the future'; end if;
  select * into v from public.rp_accounts where account_number = p_account_number for update;
  if not found then raise exception 'Account not found'; end if;
  update public.rp_accounts set status = p_status, timeout_until = case when p_status = 'timeout' then p_timeout_until else null end, updated_at = now() where id = v.id;
  insert into public.rp_audit_log(actor, action, target_account, details) values (auth.uid(), 'account_status_changed', v.account_number,
    jsonb_build_object('status', p_status, 'reason', left(coalesce(p_reason,''), 500), 'timeout_until', p_timeout_until));
end;
$$;

create or replace function public.rp_transfer_creator(p_target_account_number bigint) returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_target public.rp_accounts%rowtype; v_old public.rp_accounts%rowtype;
begin
  perform public.rp_require_creator();
  perform pg_advisory_xact_lock(hashtext('rp_creator_transfer'));
  select * into v_target from public.rp_accounts where account_number = p_target_account_number and status = 'active';
  if not found then raise exception 'Active target account not found'; end if;
  select * into v_old from public.rp_accounts where roles @> array['Creator']::text[];
  if found and v_old.id = v_target.id then raise exception 'That account is already Creator'; end if;
  if found then update public.rp_accounts set roles = array_remove(roles, 'Creator'), updated_at = now() where id = v_old.id; end if;
  update public.rp_accounts set roles = array(select distinct x from unnest(roles || array['Creator']) x), updated_at = now() where id = v_target.id;
  insert into public.rp_audit_log(actor, action, target_account, details) values (auth.uid(), 'creator_transferred', v_target.account_number, jsonb_build_object('previous_creator_account', v_old.account_number));
end;
$$;

create or replace function public.rp_create_role(p_role_name text, p_description text default '', p_permissions text[] default '{}') returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare n text := btrim(coalesce(p_role_name, ''));
begin
  perform public.rp_require_creator();
  if length(n) < 3 or length(n) > 60 then raise exception 'Role name must be 3 to 60 characters'; end if;
  insert into public.rp_roles(role_name, description, permissions, is_system) values (n, left(coalesce(p_description,''), 300), coalesce(p_permissions, '{}'), false);
  insert into public.rp_audit_log(actor, action, details) values (auth.uid(), 'role_created', jsonb_build_object('role', n));
end;
$$;

create or replace function public.rp_assign_branch_director(p_branch_key text, p_account_number bigint default null) returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare br public.rp_branch_authority%rowtype; v_target public.rp_accounts%rowtype; v_old bigint;
begin
  perform public.rp_require_creator();
  select * into br from public.rp_branch_authority where branch_key = p_branch_key for update;
  if not found then raise exception 'Unknown branch'; end if;
  if p_account_number is not null then
    select * into v_target from public.rp_accounts where account_number = p_account_number and status = 'active';
    if not found then raise exception 'Active target account not found'; end if;
  end if;
  v_old := br.director_account;
  if v_old is not null then update public.rp_accounts set roles = array_remove(roles, br.director_role), updated_at = now() where account_number = v_old; end if;
  update public.rp_branch_authority set director_account = p_account_number, updated_at = now() where branch_key = p_branch_key;
  if p_account_number is not null then update public.rp_accounts set roles = array(select distinct x from unnest(roles || array[br.director_role]) x), updated_at = now() where id = v_target.id; end if;
  insert into public.rp_audit_log(actor, action, target_account, details) values (auth.uid(), 'branch_director_changed', p_account_number,
    jsonb_build_object('branch', p_branch_key, 'previous_account', v_old, 'role', br.director_role));
end;
$$;

create or replace function public.rp_publish_policy(p_title text, p_type text default 'Policy', p_body text default '') returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare t text := btrim(coalesce(p_title,'')); v int;
begin
  perform public.rp_require_creator();
  if length(t) < 3 or length(btrim(coalesce(p_body,''))) < 10 then raise exception 'Policy title and body are required'; end if;
  select coalesce(max(version), 0) + 1 into v from public.rp_policies where title = t;
  insert into public.rp_policies(title, policy_type, body, version, created_by) values (left(t,120), left(coalesce(p_type,'Policy'),40), left(p_body,20000), v, auth.uid());
  insert into public.rp_audit_log(actor, action, details) values (auth.uid(), 'policy_published', jsonb_build_object('title', left(t,120), 'version', v));
end;
$$;

create or replace function public.rp_broadcast(p_title text, p_body text) returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform public.rp_require_creator();
  if length(btrim(coalesce(p_title,''))) < 3 or length(btrim(coalesce(p_body,''))) < 2 then raise exception 'Announcement title and body are required'; end if;
  insert into public.rp_announcements(title, body, created_by) values (left(btrim(p_title),120), left(p_body,5000), auth.uid());
  insert into public.rp_audit_log(actor, action, details) values (auth.uid(), 'global_broadcast', jsonb_build_object('title', left(btrim(p_title),120)));
end;
$$;

create or replace function public.rp_set_branch_budget(p_branch_key text, p_amount numeric, p_currency text default 'USD', p_notes text default '') returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform public.rp_require_creator();
  if p_amount is null or p_amount < 0 or p_amount > 1000000000 then raise exception 'Budget amount is out of range'; end if;
  insert into public.rp_branch_budgets(branch_key, amount, currency, notes, updated_by) values (p_branch_key, p_amount, upper(left(coalesce(p_currency,'USD'),8)), left(coalesce(p_notes,''),1000), auth.uid())
  on conflict (branch_key) do update set amount = excluded.amount, currency = excluded.currency, notes = excluded.notes, updated_by = excluded.updated_by, updated_at = now();
  insert into public.rp_audit_log(actor, action, details) values (auth.uid(), 'branch_budget_changed', jsonb_build_object('branch', p_branch_key, 'amount', p_amount, 'currency', p_currency));
end;
$$;

create or replace function public.rp_set_branch_maintenance(p_branch_key text, p_enabled boolean, p_reason text default '') returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform public.rp_require_creator();
  update public.rp_branch_authority set maintenance = coalesce(p_enabled,false), updated_at = now() where branch_key = p_branch_key;
  if not found then raise exception 'Unknown branch'; end if;
  insert into public.rp_audit_log(actor, action, details) values (auth.uid(), 'branch_maintenance_changed', jsonb_build_object('branch', p_branch_key, 'enabled', coalesce(p_enabled,false), 'reason', left(coalesce(p_reason,''),500)));
end;
$$;

create or replace function public.rp_create_governance_record(p_type text, p_title text, p_status text, p_details text default '') returns bigint language plpgsql security definer set search_path = public, pg_temp as $$
declare v_id bigint; t text := btrim(coalesce(p_title,''));
begin
  perform public.rp_require_creator();
  if p_type not in ('asset','project_approval','employment','governance') then raise exception 'Invalid record type'; end if;
  if p_status not in ('draft','pending','approved','rejected','active','resolved','review') then raise exception 'Invalid record status'; end if;
  if length(t) < 3 or length(t) > 160 then raise exception 'Title must be 3 to 160 characters'; end if;
  insert into public.rp_governance_records(record_type, title, status, details, created_by) values (p_type, t, p_status, left(coalesce(p_details,''),8000), auth.uid()) returning id into v_id;
  insert into public.rp_audit_log(actor, action, details) values (auth.uid(), 'governance_record_created', jsonb_build_object('record_id', v_id, 'type', p_type, 'title', t));
  return v_id;
end;
$$;

create or replace function public.rp_update_governance_record(p_id bigint, p_status text, p_details text default '') returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare r public.rp_governance_records%rowtype;
begin
  perform public.rp_require_creator();
  if p_status not in ('draft','pending','approved','rejected','active','resolved','review') then raise exception 'Invalid record status'; end if;
  update public.rp_governance_records set status = p_status, details = left(coalesce(p_details,''),8000), updated_at = now() where id = p_id returning * into r;
  if not found then raise exception 'Record not found'; end if;
  insert into public.rp_audit_log(actor, action, details) values (auth.uid(), 'governance_record_updated', jsonb_build_object('record_id', r.id, 'type', r.record_type, 'title', r.title, 'status', p_status));
end;
$$;

-- ---------- who may call what ----------
do $$
declare f text;
begin
  foreach f in array array[
    'rp_is_creator()', 'rp_require_creator()', 'rp_get_account_context()', 'rp_creator_overview()',
    'rp_set_account_role(bigint,text,boolean)', 'rp_set_account_status(bigint,text,timestamptz,text)', 'rp_transfer_creator(bigint)',
    'rp_create_role(text,text,text[])', 'rp_assign_branch_director(text,bigint)', 'rp_publish_policy(text,text,text)', 'rp_broadcast(text,text)',
    'rp_set_branch_budget(text,numeric,text,text)', 'rp_set_branch_maintenance(text,boolean,text)',
    'rp_create_governance_record(text,text,text,text)', 'rp_update_governance_record(bigint,text,text)']
  loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
revoke all on function public.rp_handle_new_user() from public, anon, authenticated;
