-- RP Education: courses, degrees, Refane-gated unlocking and graded final exams.
-- Run this once in the Supabase SQL Editor AFTER account-system.sql. Safe to run again.
--
-- How it works
--   * Education employees build courses and degrees in education-employee.html (drafts live in their browser).
--   * "Publish to everyone" sends one snapshot to rp_publish_education().
--   * The PUBLIC snapshot has course cards, outlines and the content of free courses without requirements.
--     Content of paid / degree-gated courses (videos, notes, documents, links, exam questions) and ALL exam
--     answer keys are kept in a private table that visitors can never read directly.
--   * rp_unlock_education_course(): checks required degrees, charges Refane from the account balance, enrolls.
--   * rp_get_education_course(): returns the private content only to enrolled accounts and employees.
--   * rp_submit_education_exam(): grades on the server and awards the degree when the pass mark is reached.

insert into public.rp_roles(role_name, description, is_system) values
  ('Education Employee', 'Builds courses and degrees for the Education branch.', true)
on conflict(role_name) do nothing;

create table if not exists public.rp_education_publications (
  version bigint generated always as identity primary key,
  snapshot jsonb not null,
  note text not null default '',
  published_by uuid references auth.users(id) on delete set null,
  published_at timestamptz not null default now(),
  constraint rp_education_snapshot_is_object check (jsonb_typeof(snapshot) = 'object')
);
alter table public.rp_education_publications enable row level security;
revoke all on public.rp_education_publications from anon, authenticated;
grant select (version, snapshot, published_at) on public.rp_education_publications to anon;
grant select (version, snapshot, published_at, note) on public.rp_education_publications to authenticated;
drop policy if exists rp_education_publications_read on public.rp_education_publications;
create policy rp_education_publications_read on public.rp_education_publications for select to anon, authenticated using (true);

create table if not exists public.rp_education_private (
  version bigint not null references public.rp_education_publications(version) on delete cascade,
  course_id text not null,
  content jsonb not null default '{}'::jsonb,
  answers jsonb not null default '[]'::jsonb,
  primary key (version, course_id)
);
alter table public.rp_education_private enable row level security;
revoke all on public.rp_education_private from anon, authenticated;

create table if not exists public.rp_education_enrollments (
  account_id uuid not null references auth.users(id) on delete cascade,
  course_id text not null,
  price bigint not null default 0,
  unlocked_at timestamptz not null default now(),
  primary key (account_id, course_id)
);
alter table public.rp_education_enrollments enable row level security;
revoke all on public.rp_education_enrollments from anon, authenticated;
grant select on public.rp_education_enrollments to authenticated;
drop policy if exists rp_education_enrollments_own on public.rp_education_enrollments;
create policy rp_education_enrollments_own on public.rp_education_enrollments for select to authenticated using (account_id = (select auth.uid()));

create table if not exists public.rp_education_degrees (
  account_id uuid not null references auth.users(id) on delete cascade,
  degree_id text not null,
  course_id text not null,
  score int not null,
  earned_at timestamptz not null default now(),
  primary key (account_id, degree_id)
);
alter table public.rp_education_degrees enable row level security;
revoke all on public.rp_education_degrees from anon, authenticated;
grant select on public.rp_education_degrees to authenticated;
drop policy if exists rp_education_degrees_own on public.rp_education_degrees;
create policy rp_education_degrees_own on public.rp_education_degrees for select to authenticated using (account_id = (select auth.uid()));

create table if not exists public.rp_education_attempts (
  id bigint generated always as identity primary key,
  account_id uuid not null references auth.users(id) on delete cascade,
  course_id text not null,
  score int not null,
  passed boolean not null,
  attempted_at timestamptz not null default now()
);
alter table public.rp_education_attempts enable row level security;
revoke all on public.rp_education_attempts from anon, authenticated;

create or replace function public.rp_is_education_editor()
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists(select 1 from public.rp_accounts where id = (select auth.uid()) and status = 'active'
    and roles && array['Creator','Education Studio Director','Education Employee']::text[])
$$;

create or replace function public.rp_edu_levels() returns text[] language sql immutable as $$
  select array['Grade 1','Grade 2','Grade 3','Grade 4','Grade 5','Grade 6','Grade 7','Grade 8','Grade 9','Grade 10','Grade 11','Grade 12','College','University']
$$;

create or replace function public.rp_edu_price(p_course jsonb) returns bigint language plpgsql immutable set search_path = public, pg_temp as $$
declare v_raw text := p_course ->> 'price';
begin
  if v_raw is null or v_raw = '' then return 0; end if;
  if v_raw !~ '^[0-9]{1,7}$' or v_raw::bigint > 1000000 then raise exception 'Course "%" has an invalid Refane price', coalesce(p_course ->> 'title', '?'); end if;
  return v_raw::bigint;
end;
$$;

create or replace function public.rp_edu_gated(p_course jsonb) returns boolean language plpgsql immutable set search_path = public, pg_temp as $$
begin
  return public.rp_edu_price(p_course) > 0 or jsonb_array_length(coalesce(p_course -> 'requires', '[]'::jsonb)) > 0;
end;
$$;

-- Public view of one course (no answers; gated courses lose their content except free-preview lessons).
create or replace function public.rp_edu_public_course(c jsonb) returns jsonb language plpgsql immutable set search_path = public, pg_temp as $$
declare
  v_gated boolean := public.rp_edu_gated(c);
  v_lessons jsonb := coalesce(c -> 'lessons', '[]'::jsonb);
  v_exam jsonb := (select coalesce(jsonb_agg(jsonb_build_object('q', e ->> 'q', 'options', e -> 'options')), '[]'::jsonb) from jsonb_array_elements(coalesce(c -> 'exam', '[]'::jsonb)) e);
  v_base jsonb;
begin
  v_base := jsonb_build_object(
    'id', c ->> 'id', 'title', left(c ->> 'title', 120), 'level', c ->> 'level', 'subject', left(coalesce(c ->> 'subject', ''), 60),
    'emoji', left(coalesce(c ->> 'emoji', '📘'), 8), 'description', left(coalesce(c ->> 'description', ''), 1200),
    'price', public.rp_edu_price(c), 'requires', coalesce(c -> 'requires', '[]'::jsonb), 'degree', coalesce(c ->> 'degree', ''),
    'passMark', coalesce((c ->> 'passMark')::int, 70), 'gated', v_gated, 'examCount', jsonb_array_length(v_exam),
    'outline', (select coalesce(jsonb_agg(jsonb_build_object('id', l ->> 'id', 'title', l ->> 'title', 'preview', coalesce((l ->> 'preview')::boolean, false))), '[]'::jsonb) from jsonb_array_elements(v_lessons) l));
  if not v_gated then
    return v_base || jsonb_build_object('lessons', v_lessons, 'resources', coalesce(c -> 'resources', '[]'::jsonb), 'exam', v_exam);
  end if;
  return v_base || jsonb_build_object('previewLessons', (select coalesce(jsonb_agg(l), '[]'::jsonb) from jsonb_array_elements(v_lessons) l where coalesce((l ->> 'preview')::boolean, false)));
end;
$$;

create or replace function public.rp_publish_education(p_snapshot jsonb, p_note text default '')
returns bigint language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_version bigint; v_course jsonb; v_q jsonb; v_ids text[]; v_pub jsonb;
  v_courses jsonb := coalesce(p_snapshot -> 'courses', '[]'::jsonb);
  v_degrees jsonb := coalesce(p_snapshot -> 'degrees', '[]'::jsonb);
  v_req text; v_n int;
begin
  if not public.rp_is_education_editor() then raise exception 'Education employee role required'; end if;
  if p_snapshot is null or jsonb_typeof(p_snapshot) <> 'object' then raise exception 'Snapshot must be a JSON object'; end if;
  if octet_length(p_snapshot::text) > 8000000 then raise exception 'Snapshot is too large (limit 8 MB)'; end if;
  if jsonb_typeof(v_courses) <> 'array' or jsonb_typeof(v_degrees) <> 'array' then raise exception 'Courses and degrees must be lists'; end if;
  if jsonb_array_length(v_courses) > 300 or jsonb_array_length(v_degrees) > 200 then raise exception 'Too many courses or degrees'; end if;

  select coalesce(array_agg(d ->> 'id'), '{}') into v_ids from jsonb_array_elements(v_degrees) d;
  if exists (select 1 from unnest(v_ids) i where coalesce(i, '') = '') then raise exception 'Every degree needs an id'; end if;

  for v_course in select value from jsonb_array_elements(v_courses) loop
    if jsonb_typeof(v_course) <> 'object' or coalesce(v_course ->> 'id', '') = '' or coalesce(v_course ->> 'title', '') = '' then raise exception 'Every course needs an id and a title'; end if;
    if not ((v_course ->> 'level') = any (public.rp_edu_levels())) then raise exception 'Course "%" has an invalid level', v_course ->> 'title'; end if;
    perform public.rp_edu_price(v_course);
    if coalesce(v_course ->> 'passMark', '70') !~ '^[0-9]{1,3}$' or coalesce(v_course ->> 'passMark', '70')::int not between 1 and 100 then raise exception 'Course "%" has an invalid pass mark', v_course ->> 'title'; end if;
    if jsonb_typeof(coalesce(v_course -> 'requires', '[]'::jsonb)) <> 'array' then raise exception 'Course "%" requires must be a list', v_course ->> 'title'; end if;
    for v_req in select jsonb_array_elements_text(coalesce(v_course -> 'requires', '[]'::jsonb)) loop
      if not (v_req = any (v_ids)) then raise exception 'Course "%" requires a degree that does not exist', v_course ->> 'title'; end if;
    end loop;
    if coalesce(v_course ->> 'degree', '') <> '' and not ((v_course ->> 'degree') = any (v_ids)) then raise exception 'Course "%" awards a degree that does not exist', v_course ->> 'title'; end if;
    if jsonb_typeof(coalesce(v_course -> 'lessons', '[]'::jsonb)) <> 'array' or jsonb_typeof(coalesce(v_course -> 'exam', '[]'::jsonb)) <> 'array' then raise exception 'Course "%" lessons and exam must be lists', v_course ->> 'title'; end if;
    for v_q in select value from jsonb_array_elements(coalesce(v_course -> 'exam', '[]'::jsonb)) loop
      if jsonb_typeof(v_q -> 'options') <> 'array' then raise exception 'Course "%" has an exam question without options', v_course ->> 'title'; end if;
      v_n := jsonb_array_length(v_q -> 'options');
      if v_n < 2 or v_n > 6 or coalesce(v_q ->> 'answer', '') !~ '^[0-9]$' or (v_q ->> 'answer')::int >= v_n then raise exception 'Course "%" has an exam question with an invalid answer', v_course ->> 'title'; end if;
    end loop;
    if coalesce(v_course ->> 'degree', '') <> '' and jsonb_array_length(coalesce(v_course -> 'exam', '[]'::jsonb)) = 0 then raise exception 'Course "%" awards a degree, so it needs a final exam', v_course ->> 'title'; end if;
  end loop;

  v_pub := jsonb_build_object('schema', 1, 'degrees', v_degrees,
    'courses', (select coalesce(jsonb_agg(public.rp_edu_public_course(c.value) order by c.ord), '[]'::jsonb) from jsonb_array_elements(v_courses) with ordinality c(value, ord)));

  insert into public.rp_education_publications(snapshot, note, published_by) values (v_pub, left(coalesce(p_note, ''), 200), auth.uid()) returning version into v_version;

  insert into public.rp_education_private(version, course_id, content, answers)
  select v_version, c.value ->> 'id',
    case when public.rp_edu_gated(c.value) then jsonb_build_object('lessons', coalesce(c.value -> 'lessons', '[]'::jsonb), 'resources', coalesce(c.value -> 'resources', '[]'::jsonb),
      'exam', (select coalesce(jsonb_agg(jsonb_build_object('q', e ->> 'q', 'options', e -> 'options')), '[]'::jsonb) from jsonb_array_elements(coalesce(c.value -> 'exam', '[]'::jsonb)) e)) else '{}'::jsonb end,
    (select coalesce(jsonb_agg(e -> 'answer'), '[]'::jsonb) from jsonb_array_elements(coalesce(c.value -> 'exam', '[]'::jsonb)) e)
  from jsonb_array_elements(v_courses) c(value);

  insert into public.rp_audit_log(actor, action, details) values (auth.uid(), 'education_content_published', jsonb_build_object('version', v_version, 'note', left(coalesce(p_note, ''), 200)));
  delete from public.rp_education_publications where version <= v_version - 50;
  return v_version;
end;
$$;

create or replace function public.rp_republish_education(p_version bigint)
returns bigint language plpgsql security definer set search_path = public, pg_temp as $$
declare v_snapshot jsonb; v_new bigint;
begin
  if not public.rp_is_education_editor() then raise exception 'Education employee role required'; end if;
  select snapshot into v_snapshot from public.rp_education_publications where version = p_version;
  if v_snapshot is null then raise exception 'That version no longer exists'; end if;
  insert into public.rp_education_publications(snapshot, note, published_by) values (v_snapshot, 'Restored version ' || p_version, auth.uid()) returning version into v_new;
  insert into public.rp_education_private(version, course_id, content, answers) select v_new, course_id, content, answers from public.rp_education_private where version = p_version;
  insert into public.rp_audit_log(actor, action, details) values (auth.uid(), 'education_content_restored', jsonb_build_object('restored_version', p_version, 'version', v_new));
  delete from public.rp_education_publications where version <= v_new - 50;
  return v_new;
end;
$$;

create or replace function public.rp_edu_live_course(p_course_id text) returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select c.value from (select snapshot from public.rp_education_publications order by version desc limit 1) p,
         jsonb_array_elements(coalesce(p.snapshot -> 'courses', '[]'::jsonb)) c(value) where c.value ->> 'id' = p_course_id limit 1
$$;

create or replace function public.rp_unlock_education_course(p_course_id text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid(); v_account public.rp_accounts%rowtype; v_course jsonb; v_price bigint; v_req text; v_name text;
begin
  if v_uid is null then raise exception 'Sign in to enroll'; end if;
  select * into v_account from public.rp_accounts where id = v_uid for update;
  if not found or v_account.status <> 'active' then raise exception 'Your account cannot enroll right now'; end if;
  if exists (select 1 from public.rp_education_enrollments where account_id = v_uid and course_id = p_course_id) then
    return jsonb_build_object('enrolled', true, 'charged', 0, 'balance', v_account.refane_balance);
  end if;
  v_course := public.rp_edu_live_course(p_course_id);
  if v_course is null then raise exception 'That course is not published'; end if;
  for v_req in select jsonb_array_elements_text(coalesce(v_course -> 'requires', '[]'::jsonb)) loop
    if not exists (select 1 from public.rp_education_degrees where account_id = v_uid and degree_id = v_req) then
      select d ->> 'name' into v_name from public.rp_education_publications p, jsonb_array_elements(p.snapshot -> 'degrees') d
       where p.version = (select max(version) from public.rp_education_publications) and d ->> 'id' = v_req limit 1;
      raise exception 'Missing required degree: %', coalesce(v_name, v_req);
    end if;
  end loop;
  v_price := public.rp_edu_price(v_course);
  if v_price > v_account.refane_balance then raise exception 'Not enough Refane (you need %, you have %)', v_price, v_account.refane_balance; end if;
  if v_price > 0 then update public.rp_accounts set refane_balance = refane_balance - v_price, updated_at = now() where id = v_uid; end if;
  insert into public.rp_education_enrollments(account_id, course_id, price) values (v_uid, p_course_id, v_price);
  insert into public.rp_audit_log(actor, action, target_account, details) values (v_uid, 'education_course_unlocked', v_account.account_number, jsonb_build_object('course_id', p_course_id, 'course', left(v_course ->> 'title', 80), 'price', v_price));
  return jsonb_build_object('enrolled', true, 'charged', v_price, 'balance', v_account.refane_balance - v_price);
end;
$$;

create or replace function public.rp_get_education_course(p_course_id text)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_uid uuid := auth.uid(); v_row public.rp_education_private%rowtype;
begin
  if v_uid is null then raise exception 'Sign in to open this course'; end if;
  if not exists (select 1 from public.rp_accounts where id = v_uid and status = 'active') then raise exception 'Your account cannot open this course right now'; end if;
  if not public.rp_is_education_editor() and not exists (select 1 from public.rp_education_enrollments where account_id = v_uid and course_id = p_course_id) then
    raise exception 'This course is locked. Enroll first';
  end if;
  select * into v_row from public.rp_education_private where course_id = p_course_id and version = (select max(version) from public.rp_education_publications);
  if not found or v_row.content = '{}'::jsonb then raise exception 'That course has no private content'; end if;
  return v_row.content;
end;
$$;

create or replace function public.rp_submit_education_exam(p_course_id text, p_answers jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid(); v_course jsonb; v_row public.rp_education_private%rowtype; v_total int; v_correct int := 0; v_i int;
  v_score int; v_pass int; v_passed boolean; v_degree text; v_dname text; v_recent int;
begin
  if v_uid is null then raise exception 'Sign in to take the exam'; end if;
  if not exists (select 1 from public.rp_accounts where id = v_uid and status = 'active') then raise exception 'Your account cannot take exams right now'; end if;
  v_course := public.rp_edu_live_course(p_course_id);
  if v_course is null then raise exception 'That course is not published'; end if;
  if (v_course ->> 'gated')::boolean and not exists (select 1 from public.rp_education_enrollments where account_id = v_uid and course_id = p_course_id) then
    raise exception 'Enroll in this course before taking the exam';
  end if;
  select * into v_row from public.rp_education_private where course_id = p_course_id and version = (select max(version) from public.rp_education_publications);
  if not found then raise exception 'This course has no exam'; end if;
  v_total := jsonb_array_length(v_row.answers);
  if v_total = 0 then raise exception 'This course has no exam'; end if;
  if jsonb_typeof(p_answers) <> 'array' or jsonb_array_length(p_answers) <> v_total then raise exception 'Answer every question'; end if;
  select count(*) into v_recent from public.rp_education_attempts where account_id = v_uid and course_id = p_course_id and attempted_at > now() - interval '1 hour';
  if v_recent >= 5 then raise exception 'Too many attempts. Try again in an hour'; end if;
  for v_i in 0 .. v_total - 1 loop
    if (p_answers ->> v_i) = (v_row.answers ->> v_i) then v_correct := v_correct + 1; end if;
  end loop;
  v_score := round(100.0 * v_correct / v_total); v_pass := coalesce((v_course ->> 'passMark')::int, 70); v_passed := v_score >= v_pass;
  insert into public.rp_education_attempts(account_id, course_id, score, passed) values (v_uid, p_course_id, v_score, v_passed);
  v_degree := coalesce(v_course ->> 'degree', '');
  if v_passed and v_degree <> '' then
    insert into public.rp_education_degrees(account_id, degree_id, course_id, score) values (v_uid, v_degree, p_course_id, v_score)
    on conflict (account_id, degree_id) do update set score = greatest(public.rp_education_degrees.score, excluded.score);
    select d ->> 'name' into v_dname from public.rp_education_publications p, jsonb_array_elements(p.snapshot -> 'degrees') d
     where p.version = (select max(version) from public.rp_education_publications) and d ->> 'id' = v_degree limit 1;
    insert into public.rp_audit_log(actor, action, details) values (v_uid, 'education_degree_earned', jsonb_build_object('course_id', p_course_id, 'degree_id', v_degree, 'score', v_score));
  end if;
  return jsonb_build_object('score', v_score, 'correct', v_correct, 'total', v_total, 'passMark', v_pass, 'passed', v_passed, 'degree', case when v_passed and v_degree <> '' then coalesce(v_dname, v_degree) else null end);
end;
$$;

revoke all on function public.rp_is_education_editor() from public, anon;
revoke all on function public.rp_edu_levels() from public, anon, authenticated;
revoke all on function public.rp_edu_price(jsonb) from public, anon, authenticated;
revoke all on function public.rp_edu_gated(jsonb) from public, anon, authenticated;
revoke all on function public.rp_edu_public_course(jsonb) from public, anon, authenticated;
revoke all on function public.rp_edu_live_course(text) from public, anon, authenticated;
revoke all on function public.rp_publish_education(jsonb, text) from public, anon;
revoke all on function public.rp_republish_education(bigint) from public, anon;
revoke all on function public.rp_unlock_education_course(text) from public, anon;
revoke all on function public.rp_get_education_course(text) from public, anon;
revoke all on function public.rp_submit_education_exam(text, jsonb) from public, anon;
grant execute on function public.rp_is_education_editor() to authenticated;
grant execute on function public.rp_publish_education(jsonb, text) to authenticated;
grant execute on function public.rp_republish_education(bigint) to authenticated;
grant execute on function public.rp_unlock_education_course(text) to authenticated;
grant execute on function public.rp_get_education_course(text) to authenticated;
grant execute on function public.rp_submit_education_exam(text, jsonb) to authenticated;
