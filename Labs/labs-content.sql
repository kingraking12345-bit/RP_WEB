-- RP Labs: science labs (Physics, Chemistry, Biology, ...) with scripted experiments and research papers.
-- Run once in the Supabase SQL Editor AFTER account-system.sql. Safe to run again.
--
--   * Lab employees (scientists) build labs, experiment scripts and papers in labs-employee.html (drafts live in their browser) and publish a snapshot.
--   * Published scripts are public. Visitors' browsers run them inside a locked-down sandbox (no network, no storage, 5 s limit).
--   * The server validates shape and size on publish; it never executes scripts.

insert into public.rp_roles(role_name, description, is_system) values
  ('Labs Employee', 'Builds labs, experiments and research papers for the Labs branch.', true)
on conflict(role_name) do nothing;

create table if not exists public.rp_labs_publications (
  version bigint generated always as identity primary key,
  snapshot jsonb not null,
  note text not null default '',
  published_by uuid references auth.users(id) on delete set null,
  published_at timestamptz not null default now(),
  constraint rp_labs_snapshot_is_object check (jsonb_typeof(snapshot) = 'object')
);
alter table public.rp_labs_publications enable row level security;
revoke all on public.rp_labs_publications from anon, authenticated;
grant select (version, snapshot, published_at) on public.rp_labs_publications to anon;
grant select (version, snapshot, published_at, note) on public.rp_labs_publications to authenticated;
drop policy if exists rp_labs_publications_read on public.rp_labs_publications;
create policy rp_labs_publications_read on public.rp_labs_publications for select to anon, authenticated using (true);

create or replace function public.rp_is_labs_editor()
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists(select 1 from public.rp_accounts where id = (select auth.uid()) and status = 'active'
    and roles && array['Creator','Lab Studio Director','Lab Scientist','Labs Employee']::text[])
$$;

create or replace function public.rp_publish_labs(p_snapshot jsonb, p_note text default '')
returns bigint language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_version bigint; v_item jsonb; v_lab_ids text[]; v_exp_ids text[];
  v_labs jsonb := coalesce(p_snapshot -> 'labs', '[]'::jsonb);
  v_exps jsonb := coalesce(p_snapshot -> 'experiments', '[]'::jsonb);
  v_papers jsonb := coalesce(p_snapshot -> 'papers', '[]'::jsonb);
begin
  if not public.rp_is_labs_editor() then raise exception 'Labs employee role required'; end if;
  if p_snapshot is null or jsonb_typeof(p_snapshot) <> 'object' then raise exception 'Snapshot must be a JSON object'; end if;
  if octet_length(p_snapshot::text) > 6000000 then raise exception 'Snapshot is too large (limit 6 MB)'; end if;
  if jsonb_typeof(v_labs) <> 'array' or jsonb_typeof(v_exps) <> 'array' or jsonb_typeof(v_papers) <> 'array' then raise exception 'Labs, experiments and papers must be lists'; end if;
  if jsonb_array_length(v_labs) > 20 or jsonb_array_length(v_exps) > 200 or jsonb_array_length(v_papers) > 200 then raise exception 'Too many labs, experiments or papers'; end if;

  for v_item in select value from jsonb_array_elements(v_labs) loop
    if jsonb_typeof(v_item) <> 'object' or coalesce(v_item ->> 'id', '') = '' or coalesce(v_item ->> 'name', '') = '' then raise exception 'Every lab needs an id and a name'; end if;
    if length(v_item ->> 'name') > 80 then raise exception 'Lab name "%" is too long', left(v_item ->> 'name', 30); end if;
  end loop;
  select coalesce(array_agg(l ->> 'id'), '{}') into v_lab_ids from jsonb_array_elements(v_labs) l;
  if (select count(distinct x) from unnest(v_lab_ids) x) <> cardinality(v_lab_ids) then raise exception 'Lab ids must be unique'; end if;

  for v_item in select value from jsonb_array_elements(v_exps) loop
    if jsonb_typeof(v_item) <> 'object' or coalesce(v_item ->> 'id', '') = '' or coalesce(v_item ->> 'title', '') = '' then raise exception 'Every experiment needs an id and a title'; end if;
    if not ((v_item ->> 'lab') = any (v_lab_ids)) then raise exception 'Experiment "%" belongs to a lab that does not exist', v_item ->> 'title'; end if;
    if jsonb_typeof(coalesce(v_item -> 'params', '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(v_item -> 'params', '[]'::jsonb)) > 12 then raise exception 'Experiment "%" can have at most 12 parameters', v_item ->> 'title'; end if;
    if jsonb_typeof(v_item -> 'script') <> 'string' or length(v_item ->> 'script') > 20000 then raise exception 'Experiment "%" needs a script of at most 20000 characters', v_item ->> 'title'; end if;
  end loop;
  select coalesce(array_agg(e ->> 'id'), '{}') into v_exp_ids from jsonb_array_elements(v_exps) e;
  if (select count(distinct x) from unnest(v_exp_ids) x) <> cardinality(v_exp_ids) then raise exception 'Experiment ids must be unique'; end if;

  for v_item in select value from jsonb_array_elements(v_papers) loop
    if jsonb_typeof(v_item) <> 'object' or coalesce(v_item ->> 'id', '') = '' or coalesce(v_item ->> 'title', '') = '' then raise exception 'Every paper needs an id and a title'; end if;
    if not ((v_item ->> 'lab') = any (v_lab_ids)) then raise exception 'Paper "%" belongs to a lab that does not exist', v_item ->> 'title'; end if;
    if length(coalesce(v_item ->> 'body', '')) > 60000 then raise exception 'Paper "%" is too long', v_item ->> 'title'; end if;
    if v_item -> 'figure' is not null and jsonb_typeof(v_item -> 'figure') = 'object' and coalesce(v_item -> 'figure' ->> 'experiment', '') <> ''
       and not ((v_item -> 'figure' ->> 'experiment') = any (v_exp_ids)) then raise exception 'Paper "%" reproduces an experiment that does not exist', v_item ->> 'title'; end if;
  end loop;

  insert into public.rp_labs_publications(snapshot, note, published_by)
  values (jsonb_build_object('schema', 1, 'labs', v_labs, 'experiments', v_exps, 'papers',
    (select coalesce(jsonb_agg(p), '[]'::jsonb) from jsonb_array_elements(v_papers) p where coalesce(p ->> 'status', 'published') <> 'draft')),
    left(coalesce(p_note, ''), 200), auth.uid())
  returning version into v_version;
  insert into public.rp_audit_log(actor, action, details) values (auth.uid(), 'labs_content_published', jsonb_build_object('version', v_version, 'note', left(coalesce(p_note, ''), 200)));
  delete from public.rp_labs_publications where version <= v_version - 50;
  return v_version;
end;
$$;

create or replace function public.rp_republish_labs(p_version bigint)
returns bigint language plpgsql security definer set search_path = public, pg_temp as $$
declare v_snapshot jsonb; v_new bigint;
begin
  if not public.rp_is_labs_editor() then raise exception 'Labs employee role required'; end if;
  select snapshot into v_snapshot from public.rp_labs_publications where version = p_version;
  if v_snapshot is null then raise exception 'That version no longer exists'; end if;
  insert into public.rp_labs_publications(snapshot, note, published_by) values (v_snapshot, 'Restored version ' || p_version, auth.uid()) returning version into v_new;
  insert into public.rp_audit_log(actor, action, details) values (auth.uid(), 'labs_content_restored', jsonb_build_object('restored_version', p_version, 'version', v_new));
  delete from public.rp_labs_publications where version <= v_new - 50;
  return v_new;
end;
$$;

revoke all on function public.rp_is_labs_editor() from public, anon;
revoke all on function public.rp_publish_labs(jsonb, text) from public, anon;
revoke all on function public.rp_republish_labs(bigint) from public, anon;
grant execute on function public.rp_is_labs_editor() to authenticated;
grant execute on function public.rp_publish_labs(jsonb, text) to authenticated;
grant execute on function public.rp_republish_labs(bigint) to authenticated;
