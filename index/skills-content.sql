-- RP Skills: skills with courses (no grades, no exams), unlocked by degrees from RP Education and/or Refane.
-- Run once in the Supabase SQL Editor AFTER account-system.sql AND education-content.sql. Safe to run again.
--
--   * Skills employees build skills + courses in skills-employee.html (drafts live in their browser) and publish a snapshot.
--   * A skill can require degrees (earned in Education). A course can add its own degrees and/or a Refane price.
--   * Locked course content (videos, notes, links) is never in the public snapshot; it sits in a private table.
--   * rp_unlock_skills_course checks degrees, charges Refane, enrolls. rp_get_skills_course returns content to enrolled accounts only.

insert into public.rp_roles(role_name, description, is_system) values
  ('Skills Employee', 'Builds skills and courses for the Skills branch.', true)
on conflict(role_name) do nothing;

create table if not exists public.rp_skills_publications (
  version bigint generated always as identity primary key,
  snapshot jsonb not null,
  note text not null default '',
  published_by uuid references auth.users(id) on delete set null,
  published_at timestamptz not null default now(),
  constraint rp_skills_snapshot_is_object check (jsonb_typeof(snapshot) = 'object')
);
alter table public.rp_skills_publications enable row level security;
revoke all on public.rp_skills_publications from anon, authenticated;
grant select (version, snapshot, published_at) on public.rp_skills_publications to anon;
grant select (version, snapshot, published_at, note) on public.rp_skills_publications to authenticated;
drop policy if exists rp_skills_publications_read on public.rp_skills_publications;
create policy rp_skills_publications_read on public.rp_skills_publications for select to anon, authenticated using (true);

create table if not exists public.rp_skills_private (
  version bigint not null references public.rp_skills_publications(version) on delete cascade,
  course_id text not null,
  content jsonb not null default '{}'::jsonb,
  primary key (version, course_id)
);
alter table public.rp_skills_private enable row level security;
revoke all on public.rp_skills_private from anon, authenticated;

create table if not exists public.rp_skills_enrollments (
  account_id uuid not null references auth.users(id) on delete cascade,
  course_id text not null,
  price bigint not null default 0,
  unlocked_at timestamptz not null default now(),
  primary key (account_id, course_id)
);
alter table public.rp_skills_enrollments enable row level security;
revoke all on public.rp_skills_enrollments from anon, authenticated;
grant select on public.rp_skills_enrollments to authenticated;
drop policy if exists rp_skills_enrollments_own on public.rp_skills_enrollments;
create policy rp_skills_enrollments_own on public.rp_skills_enrollments for select to authenticated using (account_id = (select auth.uid()));

create or replace function public.rp_is_skills_editor()
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists(select 1 from public.rp_accounts where id = (select auth.uid()) and status = 'active'
    and roles && array['Creator','Skills Studio Director','Skills Employee']::text[])
$$;

create or replace function public.rp_skl_price(p_course jsonb) returns bigint language plpgsql immutable set search_path = public, pg_temp as $$
declare v_raw text := p_course ->> 'price';
begin
  if v_raw is null or v_raw = '' then return 0; end if;
  if v_raw !~ '^[0-9]{1,7}$' or v_raw::bigint > 1000000 then raise exception 'Course "%" has an invalid Refane price', coalesce(p_course ->> 'title', '?'); end if;
  return v_raw::bigint;
end;
$$;

-- All degree ids a course needs: its skill's degrees plus its own.
create or replace function public.rp_skl_requires(p_snapshot jsonb, p_course jsonb) returns text[] language sql immutable set search_path = public, pg_temp as $$
  select coalesce(array_agg(distinct x), '{}') from (
    select jsonb_array_elements_text(coalesce(p_course -> 'requires', '[]'::jsonb)) x
    union all
    select jsonb_array_elements_text(coalesce(s.value -> 'requires', '[]'::jsonb))
      from jsonb_array_elements(coalesce(p_snapshot -> 'skills', '[]'::jsonb)) s(value) where s.value ->> 'id' = p_course ->> 'skill'
  ) t
$$;

create or replace function public.rp_skl_gated(p_snapshot jsonb, p_course jsonb) returns boolean language sql immutable set search_path = public, pg_temp as $$
  select public.rp_skl_price(p_course) > 0 or cardinality(public.rp_skl_requires(p_snapshot, p_course)) > 0
$$;

create or replace function public.rp_skl_public_course(p_snapshot jsonb, c jsonb) returns jsonb language plpgsql immutable set search_path = public, pg_temp as $$
declare
  v_gated boolean := public.rp_skl_gated(p_snapshot, c); v_lessons jsonb := coalesce(c -> 'lessons', '[]'::jsonb); v_base jsonb;
begin
  v_base := jsonb_build_object('id', c ->> 'id', 'title', left(c ->> 'title', 120), 'skill', c ->> 'skill', 'emoji', left(coalesce(c ->> 'emoji', '🛠️'), 8),
    'description', left(coalesce(c ->> 'description', ''), 1200), 'price', public.rp_skl_price(c), 'requires', to_jsonb(public.rp_skl_requires(p_snapshot, c)), 'gated', v_gated,
    'outline', (select coalesce(jsonb_agg(jsonb_build_object('id', l ->> 'id', 'title', l ->> 'title', 'preview', coalesce((l ->> 'preview')::boolean, false))), '[]'::jsonb) from jsonb_array_elements(v_lessons) l));
  if not v_gated then return v_base || jsonb_build_object('lessons', v_lessons, 'resources', coalesce(c -> 'resources', '[]'::jsonb)); end if;
  return v_base || jsonb_build_object('previewLessons', (select coalesce(jsonb_agg(l), '[]'::jsonb) from jsonb_array_elements(v_lessons) l where coalesce((l ->> 'preview')::boolean, false)));
end;
$$;

create or replace function public.rp_publish_skills(p_snapshot jsonb, p_note text default '')
returns bigint language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_version bigint; v_course jsonb; v_skill_ids text[]; v_deg_ids text[]; v_pub jsonb; v_req text;
  v_courses jsonb := coalesce(p_snapshot -> 'courses', '[]'::jsonb); v_skills jsonb := coalesce(p_snapshot -> 'skills', '[]'::jsonb); v_edu jsonb;
begin
  if not public.rp_is_skills_editor() then raise exception 'Skills employee role required'; end if;
  if p_snapshot is null or jsonb_typeof(p_snapshot) <> 'object' then raise exception 'Snapshot must be a JSON object'; end if;
  if octet_length(p_snapshot::text) > 8000000 then raise exception 'Snapshot is too large (limit 8 MB)'; end if;
  if jsonb_typeof(v_courses) <> 'array' or jsonb_typeof(v_skills) <> 'array' then raise exception 'Skills and courses must be lists'; end if;
  if jsonb_array_length(v_courses) > 400 or jsonb_array_length(v_skills) > 100 then raise exception 'Too many skills or courses'; end if;

  select coalesce(array_agg(s ->> 'id'), '{}') into v_skill_ids from jsonb_array_elements(v_skills) s;
  select p.snapshot into v_edu from public.rp_education_publications p order by p.version desc limit 1;
  select coalesce(array_agg(d ->> 'id'), '{}') into v_deg_ids from jsonb_array_elements(coalesce(v_edu -> 'degrees', '[]'::jsonb)) d;

  for v_course in select value from jsonb_array_elements(v_skills) loop
    if jsonb_typeof(v_course) <> 'object' or coalesce(v_course ->> 'id', '') = '' or coalesce(v_course ->> 'name', '') = '' then raise exception 'Every skill needs an id and a name'; end if;
    if jsonb_typeof(coalesce(v_course -> 'requires', '[]'::jsonb)) <> 'array' then raise exception 'Skill "%" requires must be a list', v_course ->> 'name'; end if;
    for v_req in select jsonb_array_elements_text(coalesce(v_course -> 'requires', '[]'::jsonb)) loop
      if not (v_req = any (v_deg_ids)) then raise exception 'Skill "%" requires a degree that is not published in Education', v_course ->> 'name'; end if;
    end loop;
  end loop;
  for v_course in select value from jsonb_array_elements(v_courses) loop
    if jsonb_typeof(v_course) <> 'object' or coalesce(v_course ->> 'id', '') = '' or coalesce(v_course ->> 'title', '') = '' then raise exception 'Every course needs an id and a title'; end if;
    if not ((v_course ->> 'skill') = any (v_skill_ids)) then raise exception 'Course "%" belongs to a skill that does not exist', v_course ->> 'title'; end if;
    perform public.rp_skl_price(v_course);
    if jsonb_typeof(coalesce(v_course -> 'requires', '[]'::jsonb)) <> 'array' or jsonb_typeof(coalesce(v_course -> 'lessons', '[]'::jsonb)) <> 'array' then raise exception 'Course "%" has invalid lists', v_course ->> 'title'; end if;
    for v_req in select jsonb_array_elements_text(coalesce(v_course -> 'requires', '[]'::jsonb)) loop
      if not (v_req = any (v_deg_ids)) then raise exception 'Course "%" requires a degree that is not published in Education', v_course ->> 'title'; end if;
    end loop;
  end loop;

  v_pub := jsonb_build_object('schema', 1,
    'skills', (select coalesce(jsonb_agg(jsonb_build_object('id', s ->> 'id', 'name', left(s ->> 'name', 80), 'emoji', left(coalesce(s ->> 'emoji', '🛠️'), 8), 'description', left(coalesce(s ->> 'description', ''), 400), 'requires', coalesce(s -> 'requires', '[]'::jsonb))), '[]'::jsonb) from jsonb_array_elements(v_skills) s),
    'degrees', (select coalesce(jsonb_agg(jsonb_build_object('id', d ->> 'id', 'name', d ->> 'name', 'emoji', d ->> 'emoji')), '[]'::jsonb) from jsonb_array_elements(coalesce(v_edu -> 'degrees', '[]'::jsonb)) d));
  v_pub := v_pub || jsonb_build_object('courses', (select coalesce(jsonb_agg(public.rp_skl_public_course(p_snapshot, c.value) order by c.ord), '[]'::jsonb) from jsonb_array_elements(v_courses) with ordinality c(value, ord)));

  insert into public.rp_skills_publications(snapshot, note, published_by) values (v_pub, left(coalesce(p_note, ''), 200), auth.uid()) returning version into v_version;
  insert into public.rp_skills_private(version, course_id, content)
  select v_version, c.value ->> 'id',
    case when public.rp_skl_gated(p_snapshot, c.value) then jsonb_build_object('lessons', coalesce(c.value -> 'lessons', '[]'::jsonb), 'resources', coalesce(c.value -> 'resources', '[]'::jsonb)) else '{}'::jsonb end
  from jsonb_array_elements(v_courses) c(value);
  insert into public.rp_audit_log(actor, action, details) values (auth.uid(), 'skills_content_published', jsonb_build_object('version', v_version, 'note', left(coalesce(p_note, ''), 200)));
  delete from public.rp_skills_publications where version <= v_version - 50;
  return v_version;
end;
$$;

create or replace function public.rp_republish_skills(p_version bigint)
returns bigint language plpgsql security definer set search_path = public, pg_temp as $$
declare v_snapshot jsonb; v_new bigint;
begin
  if not public.rp_is_skills_editor() then raise exception 'Skills employee role required'; end if;
  select snapshot into v_snapshot from public.rp_skills_publications where version = p_version;
  if v_snapshot is null then raise exception 'That version no longer exists'; end if;
  insert into public.rp_skills_publications(snapshot, note, published_by) values (v_snapshot, 'Restored version ' || p_version, auth.uid()) returning version into v_new;
  insert into public.rp_skills_private(version, course_id, content) select v_new, course_id, content from public.rp_skills_private where version = p_version;
  insert into public.rp_audit_log(actor, action, details) values (auth.uid(), 'skills_content_restored', jsonb_build_object('restored_version', p_version, 'version', v_new));
  delete from public.rp_skills_publications where version <= v_new - 50;
  return v_new;
end;
$$;

create or replace function public.rp_skl_live_course(p_course_id text) returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select c.value from (select snapshot from public.rp_skills_publications order by version desc limit 1) p,
         jsonb_array_elements(coalesce(p.snapshot -> 'courses', '[]'::jsonb)) c(value) where c.value ->> 'id' = p_course_id limit 1
$$;

create or replace function public.rp_unlock_skills_course(p_course_id text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid(); v_account public.rp_accounts%rowtype; v_course jsonb; v_price bigint; v_req text; v_name text; v_snap jsonb;
begin
  if v_uid is null then raise exception 'Sign in to enroll'; end if;
  select * into v_account from public.rp_accounts where id = v_uid for update;
  if not found or v_account.status <> 'active' then raise exception 'Your account cannot enroll right now'; end if;
  if exists (select 1 from public.rp_skills_enrollments where account_id = v_uid and course_id = p_course_id) then
    return jsonb_build_object('enrolled', true, 'charged', 0, 'balance', v_account.refane_balance);
  end if;
  v_course := public.rp_skl_live_course(p_course_id);
  if v_course is null then raise exception 'That course is not published'; end if;
  select snapshot into v_snap from public.rp_skills_publications order by version desc limit 1;
  for v_req in select jsonb_array_elements_text(coalesce(v_course -> 'requires', '[]'::jsonb)) loop
    if not exists (select 1 from public.rp_education_degrees where account_id = v_uid and degree_id = v_req) then
      select d ->> 'name' into v_name from jsonb_array_elements(coalesce(v_snap -> 'degrees', '[]'::jsonb)) d where d ->> 'id' = v_req limit 1;
      raise exception 'Missing required degree: %', coalesce(v_name, v_req);
    end if;
  end loop;
  v_price := public.rp_skl_price(v_course);
  if v_price > v_account.refane_balance then raise exception 'Not enough Refane (you need %, you have %)', v_price, v_account.refane_balance; end if;
  if v_price > 0 then update public.rp_accounts set refane_balance = refane_balance - v_price, updated_at = now() where id = v_uid; end if;
  insert into public.rp_skills_enrollments(account_id, course_id, price) values (v_uid, p_course_id, v_price);
  insert into public.rp_audit_log(actor, action, target_account, details) values (v_uid, 'skills_course_unlocked', v_account.account_number, jsonb_build_object('course_id', p_course_id, 'course', left(v_course ->> 'title', 80), 'price', v_price));
  return jsonb_build_object('enrolled', true, 'charged', v_price, 'balance', v_account.refane_balance - v_price);
end;
$$;

create or replace function public.rp_get_skills_course(p_course_id text)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_uid uuid := auth.uid(); v_row public.rp_skills_private%rowtype;
begin
  if v_uid is null then raise exception 'Sign in to open this course'; end if;
  if not exists (select 1 from public.rp_accounts where id = v_uid and status = 'active') then raise exception 'Your account cannot open this course right now'; end if;
  if not public.rp_is_skills_editor() and not exists (select 1 from public.rp_skills_enrollments where account_id = v_uid and course_id = p_course_id) then
    raise exception 'This course is locked. Enroll first';
  end if;
  select * into v_row from public.rp_skills_private where course_id = p_course_id and version = (select max(version) from public.rp_skills_publications);
  if not found or v_row.content = '{}'::jsonb then raise exception 'That course has no private content'; end if;
  return v_row.content;
end;
$$;

revoke all on function public.rp_is_skills_editor() from public, anon;
revoke all on function public.rp_skl_price(jsonb) from public, anon, authenticated;
revoke all on function public.rp_skl_requires(jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.rp_skl_gated(jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.rp_skl_public_course(jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.rp_skl_live_course(text) from public, anon, authenticated;
revoke all on function public.rp_publish_skills(jsonb, text) from public, anon;
revoke all on function public.rp_republish_skills(bigint) from public, anon;
revoke all on function public.rp_unlock_skills_course(text) from public, anon;
revoke all on function public.rp_get_skills_course(text) from public, anon;
grant execute on function public.rp_is_skills_editor() to authenticated;
grant execute on function public.rp_publish_skills(jsonb, text) to authenticated;
grant execute on function public.rp_republish_skills(bigint) to authenticated;
grant execute on function public.rp_unlock_skills_course(text) to authenticated;
grant execute on function public.rp_get_skills_course(text) to authenticated;
