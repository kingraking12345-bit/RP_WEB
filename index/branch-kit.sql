-- RP Branch Kit: the 5 steps of "10 Steps to Success" for every branch, plus RP News.
-- Run once in the Supabase SQL Editor AFTER account-system.sql, account-claim.sql and site-code.sql. Safe to run again.
--
--   Step 1  Coder              rp_coder_*            per-branch code workspace saved on the server; developers publish files live
--   Step 2  Important pages    rp_pages              Policy, About and Contact pages per branch, edited by the Creator
--   Step 3  Refane             (balance chip in every branch; Refane policy seeded below)
--   Step 4  Hiring (common)    rp_applications       "I want to apply" for every branch; the Creator accepts and the role is granted automatically
--   Step 5  Accounts           (account-system.sql)  already in place
--   News                       rp_news_*             issues with 12 sections, a private letter and a secret video unlocked server-side

/* ---------- branches and roles ---------- */
create or replace function public.rp_branch_ok(p text) returns boolean language sql immutable as $$
  select p = any (array['rp','games','tools','music','education','skills','community','labs'])
$$;
create or replace function public.rp_branch_role(p_branch text, p_kind text) returns text language sql immutable as $$
  select case p_kind
    when 'employee' then case p_branch when 'games' then 'Game Employee' when 'tools' then 'Tool Employee' when 'music' then 'Music Employee' when 'education' then 'Education Employee' when 'skills' then 'Skills Employee' when 'community' then 'Community Employee' when 'labs' then 'Labs Employee' end
    when 'developer' then case p_branch when 'games' then 'Games Developer' when 'tools' then 'Tools Developer' when 'music' then 'Music Developer' when 'education' then 'Education Developer' when 'skills' then 'Skills Developer' when 'community' then 'Community Developer' when 'labs' then 'Labs Developer' end
    when 'director' then case p_branch when 'games' then 'Games Studio Director' when 'tools' then 'Tool Studio Director' when 'music' then 'Music Studio Director' when 'education' then 'Education Studio Director' when 'skills' then 'Skills Studio Director' when 'community' then 'Community Studio Director' when 'labs' then 'Lab Studio Director' end
  end
$$;
insert into public.rp_roles(role_name, description, is_system) values
  ('Games Developer', 'Dev Team: edits Games code in the Coder.', true), ('Tools Developer', 'Dev Team: edits Tools code in the Coder.', true),
  ('Music Developer', 'Dev Team: edits Music code in the Coder.', true), ('Education Developer', 'Dev Team: edits Education code in the Coder.', true),
  ('Skills Developer', 'Dev Team: edits Skills code in the Coder.', true), ('Community Developer', 'Dev Team: edits Community code in the Coder.', true),
  ('Labs Developer', 'Dev Team: edits Labs code in the Coder.', true)
on conflict(role_name) do nothing;
insert into public.rp_roles(role_name, description, is_system) values
  ('Game Employee', 'Builds and manages RP Games pages.', true), ('Tool Employee', 'Builds tools and edits Kignity AI.', true), ('Music Employee', 'Curates the Music branch.', true),
  ('Education Employee', 'Builds courses for the Education branch.', true), ('Skills Employee', 'Builds skills and courses.', true), ('Community Employee', 'Moderates the Community branch.', true), ('Labs Employee', 'Builds labs and experiments.', true)
on conflict(role_name) do nothing;

create or replace function public.rp_is_branch_dev(p_branch text)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select public.rp_branch_ok(p_branch) and p_branch <> 'rp' and exists(select 1 from public.rp_accounts a where a.id = (select auth.uid()) and a.status = 'active'
    and (a.roles @> array['Creator']::text[] or a.roles && array[public.rp_branch_role(p_branch, 'developer'), public.rp_branch_role(p_branch, 'director')]::text[]))
$$;

/* ---------- Step 2: important pages (Policy, About, Contact) ---------- */
create table if not exists public.rp_pages (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('policy', 'about', 'contact')),
  branch text not null check (public.rp_branch_ok(branch)),
  title text not null check (char_length(title) between 1 and 160),
  sort integer not null default 0,
  published boolean not null default true,
  data jsonb not null default '{}'::jsonb,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);
create index if not exists rp_pages_lookup on public.rp_pages(kind, branch, sort, id);
alter table public.rp_pages enable row level security;
revoke all on public.rp_pages from anon, authenticated;
grant select (id, kind, branch, title, sort, data, updated_at) on public.rp_pages to anon, authenticated;
drop policy if exists rp_pages_read on public.rp_pages;
create policy rp_pages_read on public.rp_pages for select to anon, authenticated using (published);

create or replace function public.rp_page_validate(p_kind text, p_data jsonb) returns void language plpgsql immutable set search_path = public, pg_temp as $$
declare v jsonb; s jsonb;
begin
  if p_data is null or jsonb_typeof(p_data) <> 'object' then raise exception 'Page data must be an object'; end if;
  if octet_length(p_data::text) > 400000 then raise exception 'Page is too large'; end if;
  if p_kind = 'policy' then
    if jsonb_typeof(coalesce(p_data -> 'body', '""'::jsonb)) <> 'string' then raise exception 'Policy text must be text'; end if;
  elsif p_kind = 'about' then
    if coalesce(p_data ->> 'font', 'system') <> all (array['system','serif','mono','rounded','display']) then raise exception 'Unknown font'; end if;
    if coalesce(p_data ->> 'accent', '#2ee6e6') !~ '^#[0-9a-fA-F]{6}$' then raise exception 'Accent must be a #rrggbb colour'; end if;
    if jsonb_typeof(coalesce(p_data -> 'blocks', '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_data -> 'blocks', '[]'::jsonb)) > 200 then raise exception 'About pages can have at most 200 blocks'; end if;
    for v in select value from jsonb_array_elements(coalesce(p_data -> 'blocks', '[]'::jsonb)) loop
      if jsonb_typeof(v) <> 'object' or coalesce(v ->> 'type', '') <> all (array['heading','sub','text','canva','image']) then raise exception 'Unknown About block type'; end if;
      if length(coalesce(v ->> 'text', '')) > 8000 then raise exception 'An About block is too long'; end if;
      if v ->> 'type' = 'canva' and coalesce(v ->> 'url', '') !~ '^https://www\.canva\.com/design/[A-Za-z0-9_-]+/[A-Za-z0-9_-]+/(view|watch)(\?[A-Za-z0-9=&_%-]*)?$' then raise exception 'Canva blocks need a Canva share link like https://www.canva.com/design/ID/TOKEN/view?embed'; end if;
      if v ->> 'type' = 'image' and coalesce(v ->> 'url', '') !~ '^https://[^\s]{4,255}$' then raise exception 'Image blocks need an https:// link'; end if;
    end loop;
  elsif p_kind = 'contact' then
    if jsonb_typeof(coalesce(p_data -> 'entries', '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_data -> 'entries', '[]'::jsonb)) > 100 then raise exception 'Contact pages can have at most 100 roles'; end if;
    for v in select value from jsonb_array_elements(coalesce(p_data -> 'entries', '[]'::jsonb)) loop
      if jsonb_typeof(v) <> 'object' or coalesce(v ->> 'role', '') = '' or length(v ->> 'role') > 80 then raise exception 'Every contact needs a role name'; end if;
      if coalesce(v ->> 'email', '') <> '' and (v ->> 'email') !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Invalid email for %', v ->> 'role'; end if;
      if coalesce(v ->> 'phone', '') <> '' and (v ->> 'phone') !~ '^[0-9+() .-]{3,30}$' then raise exception 'Invalid phone number for %', v ->> 'role'; end if;
      if jsonb_typeof(coalesce(v -> 'socials', '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(v -> 'socials', '[]'::jsonb)) > 8 then raise exception 'Too many social links for %', v ->> 'role'; end if;
      for s in select value from jsonb_array_elements(coalesce(v -> 'socials', '[]'::jsonb)) loop
        if coalesce(s ->> 'url', '') !~ '^https://[^\s]{4,255}$' then raise exception 'Social links for % must start with https://', v ->> 'role'; end if;
      end loop;
    end loop;
  end if;
end;
$$;

create or replace function public.rp_save_page(p_id bigint, p_kind text, p_branch text, p_title text, p_sort integer, p_published boolean, p_data jsonb)
returns bigint language plpgsql security definer set search_path = public, pg_temp as $$
declare v_id bigint;
begin
  if not public.rp_is_creator() then raise exception 'Creator role required'; end if;
  if p_kind not in ('policy','about','contact') then raise exception 'Unknown page kind'; end if;
  if not public.rp_branch_ok(p_branch) then raise exception 'Unknown branch'; end if;
  if btrim(coalesce(p_title, '')) = '' then raise exception 'A title is required'; end if;
  perform public.rp_page_validate(p_kind, p_data);
  if p_id is null then
    insert into public.rp_pages(kind, branch, title, sort, published, data, updated_by) values (p_kind, p_branch, btrim(p_title), coalesce(p_sort, 0), coalesce(p_published, true), p_data, auth.uid()) returning id into v_id;
  else
    update public.rp_pages set kind = p_kind, branch = p_branch, title = btrim(p_title), sort = coalesce(p_sort, 0), published = coalesce(p_published, true), data = p_data, updated_by = auth.uid(), updated_at = now() where id = p_id returning id into v_id;
    if v_id is null then raise exception 'That page no longer exists'; end if;
  end if;
  insert into public.rp_audit_log(actor, action, details) values (auth.uid(), 'page_saved', jsonb_build_object('id', v_id, 'kind', p_kind, 'branch', p_branch, 'title', left(p_title, 80)));
  return v_id;
end;
$$;
create or replace function public.rp_delete_page(p_id bigint) returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not public.rp_is_creator() then raise exception 'Creator role required'; end if;
  delete from public.rp_pages where id = p_id; if not found then raise exception 'That page no longer exists'; end if;
  insert into public.rp_audit_log(actor, action, details) values (auth.uid(), 'page_deleted', jsonb_build_object('id', p_id));
end;
$$;
create or replace function public.rp_admin_pages() returns setof public.rp_pages language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not public.rp_is_creator() then raise exception 'Creator role required'; end if;
  return query select * from public.rp_pages order by kind, branch, sort, id;
end;
$$;

-- Starter policies from the brochure (only added once, and only while there are no policy pages at all).
insert into public.rp_pages(kind, branch, title, sort, data)
select 'policy', 'rp', t.title, t.sort, jsonb_build_object('body', t.body)
from (values
  ('Refane Policy', 10, E'## What Refane is\nRefane is a currency that works across the whole of Raking Productions. You buy Refane once with real money and it never expires. Spend it on anything to get a head start or to open paid content.\n\n## Paying\nIn all of Raking Productions you cannot buy anything with real money except Refane. All payment is handled by the Creator.\n\n## Earning\nYou can also receive Refane as gifts, buy it on the official RP website, or earn it from your creations.\n\n## Refunds\n- There are no refunds once you have bought Refane.\n- You may ask customer service about a mistaken purchase. The Refane you bought is then taken back and 75% of the amount you paid is returned.\n\n## Third-party sellers\nIf you buy Refane from any third-party website your account is permanently terminated. You have 10 days to contact support and ask for a review. After 10 days the appeal window closes forever.\n\n## Agreement\nBy obtaining Refane for the first time you agree to all Refane-related policy and cannot challenge it later in any form. If you do not agree, disable Refane in your account settings.'),
  ('Employment and Work Hours', 20, E'## Applying\nUse the **I want to apply** page on the main RP website. Fill in the interview form. If the Creator accepts you, you are notified and get access to your employee workspace automatically.\n\n## Work hours\n5 hours a day. Saturday and Sunday are off unless a major release is coming.\n\n## Pay\nPay depends on your productivity each month.')
) as t(title, sort, body)
where not exists (select 1 from public.rp_pages where kind = 'policy');

/* ---------- Step 4: hiring ---------- */
create table if not exists public.rp_applications (
  id bigint generated always as identity primary key,
  account_id uuid not null references auth.users(id) on delete cascade,
  branch text not null check (public.rp_branch_ok(branch) and branch <> 'rp'),
  kind text not null check (kind in ('employee', 'developer')),
  answers jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected', 'withdrawn')),
  decision_note text not null default '',
  decided_by uuid references auth.users(id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists rp_applications_one_pending on public.rp_applications(account_id, branch, kind) where status = 'pending';
alter table public.rp_applications enable row level security;
revoke all on public.rp_applications from anon, authenticated;

create table if not exists public.rp_notifications (
  id bigint generated always as identity primary key,
  account_id uuid not null references auth.users(id) on delete cascade,
  title text not null, body text not null default '', link text not null default '',
  read boolean not null default false, created_at timestamptz not null default now()
);
create index if not exists rp_notifications_account on public.rp_notifications(account_id, id desc);
alter table public.rp_notifications enable row level security;
revoke all on public.rp_notifications from anon, authenticated;

create or replace function public.rp_submit_application(p_branch text, p_kind text, p_answers jsonb)
returns bigint language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := auth.uid(); v_acc public.rp_accounts%rowtype; v_role text; v_id bigint;
begin
  if v_uid is null then raise exception 'Sign in to apply'; end if;
  select * into v_acc from public.rp_accounts where id = v_uid;
  if not found or v_acc.status <> 'active' then raise exception 'Your account cannot apply right now'; end if;
  if not public.rp_branch_ok(p_branch) or p_branch = 'rp' then raise exception 'Choose a branch'; end if;
  if p_kind not in ('employee', 'developer') then raise exception 'Choose employee or developer'; end if;
  v_role := public.rp_branch_role(p_branch, p_kind);
  if v_acc.roles @> array['Creator']::text[] or v_acc.roles @> array[v_role]::text[] then raise exception 'You already have access to this role'; end if;
  if p_answers is null or jsonb_typeof(p_answers) <> 'object' or octet_length(p_answers::text) > 20000 then raise exception 'The application is invalid or too long'; end if;
  if length(btrim(coalesce(p_answers ->> 'why', ''))) < 20 then raise exception 'Tell us in a few sentences why you want to join'; end if;
  if length(btrim(coalesce(p_answers ->> 'qualifications', ''))) < 10 then raise exception 'Describe your qualifications'; end if;
  if (select count(*) from public.rp_applications where account_id = v_uid and created_at > now() - interval '1 day') >= 5 then raise exception 'You can send at most 5 applications a day'; end if;
  if exists(select 1 from public.rp_applications where account_id = v_uid and branch = p_branch and kind = p_kind and status = 'pending') then raise exception 'You already have a pending application for this role'; end if;
  insert into public.rp_applications(account_id, branch, kind, answers) values (v_uid, p_branch, p_kind, p_answers) returning id into v_id;
  return v_id;
end;
$$;
create or replace function public.rp_my_applications()
returns table(id bigint, branch text, kind text, status text, decision_note text, created_at timestamptz, decided_at timestamptz)
language sql stable security definer set search_path = public, pg_temp as $$
  select a.id, a.branch, a.kind, a.status, a.decision_note, a.created_at, a.decided_at from public.rp_applications a where a.account_id = (select auth.uid()) order by a.id desc limit 50
$$;
create or replace function public.rp_withdraw_application(p_id bigint) returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update public.rp_applications set status = 'withdrawn', decided_at = now() where id = p_id and account_id = auth.uid() and status = 'pending';
  if not found then raise exception 'No pending application found'; end if;
end;
$$;
create or replace function public.rp_list_applications(p_status text default 'pending')
returns table(id bigint, account_number bigint, username text, branch text, kind text, status text, answers jsonb, decision_note text, created_at timestamptz, decided_at timestamptz)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not public.rp_is_creator() then raise exception 'Creator role required'; end if;
  return query select a.id, c.account_number, c.username, a.branch, a.kind, a.status, a.answers, a.decision_note, a.created_at, a.decided_at
    from public.rp_applications a join public.rp_accounts c on c.id = a.account_id where p_status = 'all' or a.status = p_status order by a.id desc limit 200;
end;
$$;
create or replace function public.rp_decide_application(p_id bigint, p_accept boolean, p_note text default '')
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v public.rp_applications%rowtype; v_role text; v_num bigint; v_link text;
begin
  if not public.rp_is_creator() then raise exception 'Creator role required'; end if;
  select * into v from public.rp_applications where id = p_id for update;
  if not found then raise exception 'Application not found'; end if;
  if v.status <> 'pending' then raise exception 'This application was already decided'; end if;
  v_role := public.rp_branch_role(v.branch, v.kind);
  select account_number into v_num from public.rp_accounts where id = v.account_id;
  if p_accept then
    update public.rp_accounts set roles = array(select distinct x from unnest(roles || array[v_role]::text[]) x), updated_at = now() where id = v.account_id;
    v_link := case when v.kind = 'developer' then '../index/coder.html?branch=' || v.branch else '../index/index.html' end;
    insert into public.rp_notifications(account_id, title, body, link) values (v.account_id, 'Application accepted 🎉', 'You are now ' || v_role || '. Open the main page and choose your workspace to start working. Work hours: 5 hours a day, Saturday and Sunday off unless a major release is coming.' || case when btrim(coalesce(p_note, '')) <> '' then E'\n\nNote from the Creator: ' || left(p_note, 500) else '' end, v_link);
  else
    insert into public.rp_notifications(account_id, title, body, link) values (v.account_id, 'Application update', 'Your application for ' || v_role || ' was not accepted this time.' || case when btrim(coalesce(p_note, '')) <> '' then E'\n\nNote from the Creator: ' || left(p_note, 500) else '' end, '../index/apply.html');
  end if;
  update public.rp_applications set status = case when p_accept then 'accepted' else 'rejected' end, decision_note = left(coalesce(p_note, ''), 500), decided_by = auth.uid(), decided_at = now() where id = p_id;
  insert into public.rp_audit_log(actor, action, target_account, details) values (auth.uid(), case when p_accept then 'application_accepted' else 'application_rejected' end, v_num, jsonb_build_object('application', p_id, 'branch', v.branch, 'role', v_role));
end;
$$;
create or replace function public.rp_my_notifications(p_limit integer default 20)
returns table(id bigint, title text, body text, link text, read boolean, created_at timestamptz)
language sql stable security definer set search_path = public, pg_temp as $$
  select n.id, n.title, n.body, n.link, n.read, n.created_at from public.rp_notifications n where n.account_id = (select auth.uid()) order by n.id desc limit least(greatest(coalesce(p_limit, 20), 1), 50)
$$;
create or replace function public.rp_mark_notifications_read() returns void language sql security definer set search_path = public, pg_temp as $$
  update public.rp_notifications set read = true where account_id = (select auth.uid()) and not read
$$;

/* ---------- Step 1: the Coder (server-side workspace per branch) ---------- */
create table if not exists public.rp_coder_files (
  branch text not null check (public.rp_branch_ok(branch) and branch <> 'rp'),
  path text not null check (path ~ '^[A-Za-z0-9_-]+(/[A-Za-z0-9_-]+)*(/[A-Za-z0-9_.-]+\.[A-Za-z0-9]{1,8}|/\.folder)$|^[A-Za-z0-9_.-]+\.[A-Za-z0-9]{1,8}$' and path !~ '\.\.'),
  content text not null default '' check (char_length(content) <= 500000),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (branch, path)
);
alter table public.rp_coder_files enable row level security;
revoke all on public.rp_coder_files from anon, authenticated;

create or replace function public.rp_coder_require(p_branch text) returns void language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not public.rp_is_branch_dev(p_branch) then raise exception 'Developer access for this branch is required'; end if;
end;
$$;
create or replace function public.rp_coder_list(p_branch text)
returns table(path text, size integer, updated_at timestamptz) language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform public.rp_coder_require(p_branch);
  return query select f.path, char_length(f.content), f.updated_at from public.rp_coder_files f where f.branch = p_branch order by f.path;
end;
$$;
create or replace function public.rp_coder_get(p_branch text, p_path text) returns text language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v text;
begin
  perform public.rp_coder_require(p_branch);
  select content into v from public.rp_coder_files where branch = p_branch and path = p_path; return v;
end;
$$;
create or replace function public.rp_coder_save(p_branch text, p_path text, p_content text) returns timestamptz language plpgsql security definer set search_path = public, pg_temp as $$
declare v timestamptz;
begin
  perform public.rp_coder_require(p_branch);
  if p_path !~ '^[A-Za-z0-9_-]+(/[A-Za-z0-9_-]+)*(/[A-Za-z0-9_.-]+\.[A-Za-z0-9]{1,8}|/\.folder)$|^[A-Za-z0-9_.-]+\.[A-Za-z0-9]{1,8}$' or p_path ~ '\.\.' then raise exception 'Use letters, numbers, dash, underscore and dot in names'; end if;
  if (select count(*) from public.rp_coder_files where branch = p_branch) >= 400 and not exists(select 1 from public.rp_coder_files where branch = p_branch and path = p_path) then raise exception 'A branch workspace can hold at most 400 files'; end if;
  insert into public.rp_coder_files(branch, path, content, updated_by, updated_at) values (p_branch, p_path, coalesce(p_content, ''), auth.uid(), now())
  on conflict (branch, path) do update set content = excluded.content, updated_by = auth.uid(), updated_at = now() returning updated_at into v;
  return v;
end;
$$;
create or replace function public.rp_coder_delete(p_branch text, p_path text, p_folder boolean default false) returns integer language plpgsql security definer set search_path = public, pg_temp as $$
declare n integer;
begin
  perform public.rp_coder_require(p_branch);
  if p_folder then delete from public.rp_coder_files where branch = p_branch and (path = p_path or path like replace(replace(p_path, '_', '\_'), '%', '\%') || '/%'); else delete from public.rp_coder_files where branch = p_branch and path = p_path; end if;
  get diagnostics n = row_count; return n;
end;
$$;
-- "Apply code": publishes a top-level HTML/JS/CSS file of the workspace as the live version of Folder/file for every visitor.
create or replace function public.rp_coder_apply(p_branch text, p_path text, p_note text default '') returns integer language plpgsql security definer set search_path = public, pg_temp as $$
declare v_folder text; v_site text; v_content text; v_version integer;
begin
  perform public.rp_coder_require(p_branch);
  v_folder := case p_branch when 'games' then 'Games' when 'tools' then 'Tools' when 'music' then 'Music' when 'education' then 'Education' when 'skills' then 'Skills' when 'community' then 'Community' when 'labs' then 'Labs' end;
  if p_path !~ '^[A-Za-z0-9_.-]+\.(html|js|css)$' then raise exception 'Only top-level .html, .js and .css files can be applied to the live site'; end if;
  select content into v_content from public.rp_coder_files where branch = p_branch and path = p_path;
  if v_content is null or btrim(v_content) = '' then raise exception 'That file is empty or does not exist'; end if;
  v_site := v_folder || '/' || p_path; perform public.rp_site_check_path(v_site);
  insert into public.rp_site_files(path, content, version, enabled, note, updated_by, updated_at) values (v_site, v_content, 1, true, left(coalesce(p_note, 'Applied from the Coder'), 200), auth.uid(), now())
  on conflict (path) do update set content = excluded.content, version = public.rp_site_files.version + 1, enabled = true, note = excluded.note, updated_by = auth.uid(), updated_at = now() returning version into v_version;
  insert into public.rp_site_file_history(path, version, action, note, content, saved_by) values (v_site, v_version, 'save', left(coalesce(p_note, 'Applied from the Coder'), 200), v_content, auth.uid());
  delete from public.rp_site_file_history where path = v_site and id not in (select id from public.rp_site_file_history where path = v_site order by id desc limit 30);
  insert into public.rp_audit_log(actor, action, details) values (auth.uid(), 'coder_applied', jsonb_build_object('branch', p_branch, 'path', v_site, 'version', v_version));
  return v_version;
end;
$$;
create or replace function public.rp_coder_live(p_branch text)
returns table(path text, version integer, enabled boolean) language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_folder text;
begin
  perform public.rp_coder_require(p_branch);
  v_folder := case p_branch when 'games' then 'Games' when 'tools' then 'Tools' when 'music' then 'Music' when 'education' then 'Education' when 'skills' then 'Skills' when 'community' then 'Community' when 'labs' then 'Labs' end;
  return query select substr(f.path, length(v_folder) + 2), f.version, f.enabled from public.rp_site_files f where f.path like v_folder || '/%';
end;
$$;
create or replace function public.rp_coder_unapply(p_branch text, p_path text) returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_folder text; v_site text; v public.rp_site_files%rowtype;
begin
  perform public.rp_coder_require(p_branch);
  v_folder := case p_branch when 'games' then 'Games' when 'tools' then 'Tools' when 'music' then 'Music' when 'education' then 'Education' when 'skills' then 'Skills' when 'community' then 'Community' when 'labs' then 'Labs' end;
  v_site := v_folder || '/' || p_path;
  delete from public.rp_site_files where path = v_site returning * into v; if not found then raise exception 'That file has no live override'; end if;
  insert into public.rp_site_file_history(path, version, action, note, content, saved_by) values (v_site, v.version + 1, 'reset', 'Reset to the original file', v.content, auth.uid());
  insert into public.rp_audit_log(actor, action, details) values (auth.uid(), 'coder_unapplied', jsonb_build_object('branch', p_branch, 'path', v_site));
end;
$$;

/* ---------- RP News ---------- */
create table if not exists public.rp_news_issues (
  issue_no integer primary key check (issue_no between 1 and 9999),
  title text not null check (char_length(title) between 1 and 160),
  subtitle text not null default '',
  published_on date not null default current_date,
  status text not null default 'draft' check (status in ('draft', 'published')),
  sections jsonb not null default '{}'::jsonb,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);
alter table public.rp_news_issues enable row level security;
revoke all on public.rp_news_issues from anon, authenticated;
grant select (issue_no, title, subtitle, published_on, sections, updated_at) on public.rp_news_issues to anon, authenticated;
drop policy if exists rp_news_read on public.rp_news_issues;
create policy rp_news_read on public.rp_news_issues for select to anon, authenticated using (status = 'published');

create table if not exists public.rp_news_secrets (
  issue_no integer primary key references public.rp_news_issues(issue_no) on delete cascade,
  letter_password_hash text not null default '',
  letter_pdf_url text not null default '',
  secret_video_url text not null default '',
  levels_needed integer not null default 10 check (levels_needed between 1 and 50)
);
alter table public.rp_news_secrets enable row level security;
revoke all on public.rp_news_secrets from anon, authenticated;
create table if not exists public.rp_news_levels (
  account_id uuid not null references auth.users(id) on delete cascade,
  issue_no integer not null references public.rp_news_issues(issue_no) on delete cascade,
  level integer not null check (level between 1 and 50),
  primary key (account_id, issue_no, level)
);
alter table public.rp_news_levels enable row level security;
revoke all on public.rp_news_levels from anon, authenticated;
create table if not exists public.rp_news_attempts (
  id bigint generated always as identity primary key, account_id uuid not null, issue_no integer not null, at timestamptz not null default now()
);
alter table public.rp_news_attempts enable row level security;
revoke all on public.rp_news_attempts from anon, authenticated;

create or replace function public.rp_news_hash(p_issue integer, p_password text) returns text language sql immutable as $$
  select encode(sha256(convert_to('rp-news:' || p_issue::text || ':' || lower(btrim(coalesce(p_password, ''))), 'UTF8')), 'hex')
$$;
create or replace function public.rp_news_validate(p_sections jsonb) returns void language plpgsql immutable set search_path = public, pg_temp as $$
declare k text; v jsonb;
begin
  if p_sections is null or jsonb_typeof(p_sections) <> 'object' then raise exception 'Sections must be an object'; end if;
  if octet_length(p_sections::text) > 600000 then raise exception 'The issue is too large'; end if;
  for k, v in select key, value from jsonb_each(p_sections) loop
    if k not in ('welcome','private_letter','public_letter','secret_video','presentation','games','facts','songs','announcements','highlights','blog','vlogs','secrets','next') then raise exception 'Unknown section %', k; end if;
  end loop;
  for k in select unnest(array['games','facts','songs','announcements','highlights','vlogs']) loop
    if p_sections ? k and (jsonb_typeof(p_sections -> k) <> 'array' or jsonb_array_length(p_sections -> k) > 50) then raise exception 'Section % must be a list of at most 50 items', k; end if;
  end loop;
  for v in select value from jsonb_array_elements(coalesce(p_sections -> 'games', '[]'::jsonb) || coalesce(p_sections -> 'songs', '[]'::jsonb) || coalesce(p_sections -> 'vlogs', '[]'::jsonb)) loop
    if jsonb_typeof(v) = 'object' and coalesce(v ->> 'url', '') <> '' and (v ->> 'url') !~ '^https://[^\s]{4,255}$' then raise exception 'Links in news items must start with https://'; end if;
  end loop;
  if coalesce(p_sections #>> '{presentation,url}', '') <> '' and (p_sections #>> '{presentation,url}') !~ '^https://[^\s]{4,255}$' then raise exception 'The presentation link must start with https://'; end if;
end;
$$;
create or replace function public.rp_news_save_issue(p_issue integer, p_title text, p_subtitle text, p_date date, p_status text, p_sections jsonb, p_password text default null, p_pdf_url text default null, p_video_url text default null, p_levels integer default null)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not public.rp_is_creator() then raise exception 'Creator role required'; end if;
  if p_status not in ('draft', 'published') then raise exception 'Status must be draft or published'; end if;
  if btrim(coalesce(p_title, '')) = '' then raise exception 'An issue title is required'; end if;
  perform public.rp_news_validate(p_sections);
  if coalesce(p_pdf_url, '') <> '' and p_pdf_url !~ '^https://[^\s]{4,255}$' then raise exception 'The private letter link must start with https://'; end if;
  if coalesce(p_video_url, '') <> '' and p_video_url !~ '^https://[^\s]{4,255}$' then raise exception 'The secret video link must start with https://'; end if;
  insert into public.rp_news_issues(issue_no, title, subtitle, published_on, status, sections, updated_by) values (p_issue, btrim(p_title), left(coalesce(p_subtitle, ''), 200), coalesce(p_date, current_date), p_status, p_sections, auth.uid())
  on conflict (issue_no) do update set title = excluded.title, subtitle = excluded.subtitle, published_on = excluded.published_on, status = excluded.status, sections = excluded.sections, updated_by = auth.uid(), updated_at = now();
  insert into public.rp_news_secrets(issue_no) values (p_issue) on conflict do nothing;
  if p_password is not null and btrim(p_password) <> '' then update public.rp_news_secrets set letter_password_hash = public.rp_news_hash(p_issue, p_password) where issue_no = p_issue; end if;
  if p_pdf_url is not null then update public.rp_news_secrets set letter_pdf_url = p_pdf_url where issue_no = p_issue; end if;
  if p_video_url is not null then update public.rp_news_secrets set secret_video_url = p_video_url where issue_no = p_issue; end if;
  if p_levels is not null then update public.rp_news_secrets set levels_needed = least(greatest(p_levels, 1), 50) where issue_no = p_issue; end if;
  insert into public.rp_audit_log(actor, action, details) values (auth.uid(), 'news_issue_saved', jsonb_build_object('issue', p_issue, 'status', p_status));
end;
$$;
create or replace function public.rp_news_admin_issues() returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not public.rp_is_creator() then raise exception 'Creator role required'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('issue_no', i.issue_no, 'title', i.title, 'subtitle', i.subtitle, 'published_on', i.published_on, 'status', i.status, 'sections', i.sections,
    'has_password', coalesce(s.letter_password_hash, '') <> '', 'pdf_url', coalesce(s.letter_pdf_url, ''), 'video_url', coalesce(s.secret_video_url, ''), 'levels_needed', coalesce(s.levels_needed, 10)) order by i.issue_no desc)
    from public.rp_news_issues i left join public.rp_news_secrets s on s.issue_no = i.issue_no), '[]'::jsonb);
end;
$$;
create or replace function public.rp_news_delete_issue(p_issue integer) returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not public.rp_is_creator() then raise exception 'Creator role required'; end if;
  delete from public.rp_news_issues where issue_no = p_issue; if not found then raise exception 'That issue does not exist'; end if;
  insert into public.rp_audit_log(actor, action, details) values (auth.uid(), 'news_issue_deleted', jsonb_build_object('issue', p_issue));
end;
$$;
create or replace function public.rp_news_unlock_letter(p_issue integer, p_password text) returns text language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := auth.uid(); s public.rp_news_secrets%rowtype;
begin
  if v_uid is null then raise exception 'Sign in to unlock the private letter'; end if;
  if not exists(select 1 from public.rp_news_issues where issue_no = p_issue and status = 'published') then raise exception 'That issue is not published'; end if;
  if (select count(*) from public.rp_news_attempts where account_id = v_uid and issue_no = p_issue and at > now() - interval '1 hour') >= 10 then raise exception 'Too many tries. Wait an hour and look for the clue again.'; end if;
  select * into s from public.rp_news_secrets where issue_no = p_issue;
  if not found or s.letter_password_hash = '' then raise exception 'The private letter is not ready yet'; end if;
  if public.rp_news_hash(p_issue, p_password) <> s.letter_password_hash then insert into public.rp_news_attempts(account_id, issue_no) values (v_uid, p_issue); raise exception 'Incorrect password. Look for the clue in the newsletter.'; end if;
  if s.letter_pdf_url = '' then raise exception 'Password accepted! The publisher has not added the letter yet.'; end if;
  return s.letter_pdf_url;
end;
$$;
create or replace function public.rp_news_mark_level(p_issue integer, p_level integer) returns integer language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := auth.uid(); n integer;
begin
  if v_uid is null then raise exception 'Sign in to save level progress'; end if;
  if not exists(select 1 from public.rp_news_issues where issue_no = p_issue and status = 'published') then raise exception 'That issue is not published'; end if;
  insert into public.rp_news_levels(account_id, issue_no, level) values (v_uid, p_issue, p_level) on conflict do nothing;
  select count(*) into n from public.rp_news_levels where account_id = v_uid and issue_no = p_issue; return n;
end;
$$;
create or replace function public.rp_news_unmark_level(p_issue integer, p_level integer) returns integer language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := auth.uid(); n integer;
begin
  if v_uid is null then raise exception 'Sign in to save level progress'; end if;
  delete from public.rp_news_levels where account_id = v_uid and issue_no = p_issue and level = p_level;
  select count(*) into n from public.rp_news_levels where account_id = v_uid and issue_no = p_issue; return n;
end;
$$;
create or replace function public.rp_news_my_levels(p_issue integer) returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object('levels', coalesce((select jsonb_agg(level order by level) from public.rp_news_levels where account_id = (select auth.uid()) and issue_no = p_issue), '[]'::jsonb),
    'needed', coalesce((select levels_needed from public.rp_news_secrets where issue_no = p_issue), 10))
$$;
create or replace function public.rp_news_claim_video(p_issue integer) returns text language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := auth.uid(); s public.rp_news_secrets%rowtype; n integer;
begin
  if v_uid is null then raise exception 'Sign in to claim the secret video'; end if;
  select * into s from public.rp_news_secrets where issue_no = p_issue; if not found then raise exception 'No secret video for this issue'; end if;
  select count(*) into n from public.rp_news_levels where account_id = v_uid and issue_no = p_issue and level <= s.levels_needed;
  if n < s.levels_needed then raise exception 'Complete all % levels first (you have %)', s.levels_needed, n; end if;
  if s.secret_video_url = '' then raise exception 'The secret video has not been added yet'; end if;
  return s.secret_video_url;
end;
$$;

-- Issue 1 (from the RP Newsletters starter file). Only added when there are no issues yet.
insert into public.rp_news_issues(issue_no, title, subtitle, published_on, status, sections)
select 1, 'RP Newsletters', 'The world of RP, delivered.', date '2026-10-21', 'published', jsonb_build_object(
  'welcome', jsonb_build_object('text', E'Welcome to the first edition of RP Newsletters, a publication by Raking Productions.\n\nDiscover company updates, educational facts, games, music, presentations, fictional characters, and hidden secrets.\n\nThis is the first edition. More editions will follow!'),
  'private_letter', jsonb_build_object('text', 'A special company letter waiting to be unlocked. Search through this newsletter to discover the password clue.'),
  'public_letter', jsonb_build_object('text', E'Welcome to RP Newsletters Issue 1!\n\nThis public letter is where Raking Productions shares company progress, projects, milestones, upcoming releases, and other important developments.'),
  'secret_video', jsonb_build_object('text', 'Ten platformal levels. One secret video. Can you complete the challenge?'),
  'presentation', jsonb_build_object('text', 'A presentation to learn about RP projects, ideas and company milestones.', 'url', ''),
  'games', '[]'::jsonb,
  'facts', jsonb_build_array(
    jsonb_build_object('title', 'Space is not empty', 'text', 'Space is not completely empty; it contains particles and fields.'),
    jsonb_build_object('title', 'Sunlight takes time', 'text', 'Light from the Sun takes about eight minutes to reach Earth.'),
    jsonb_build_object('title', 'Three states of water', 'text', 'Water can naturally exist as a solid, liquid, and gas.'),
    jsonb_build_object('title', 'Underground fungi', 'text', 'Some fungi form extensive underground networks.'),
    jsonb_build_object('title', 'Proof', 'text', 'A mathematical proof can establish why a result is true.')),
  'songs', '[]'::jsonb,
  'announcements', jsonb_build_array('Welcome to the first RP Newsletters edition!', 'More announcements will be added as RP projects progress.'),
  'highlights', jsonb_build_array('Explore all 12 sections of Issue 1.', 'Discover the private letter password clue.', 'Try the 10-level secret video challenge.', 'Look out for the next edition.'),
  'blog', jsonb_build_object('title', 'Behind the Beginning', 'body', E'Every project begins with an idea. RP Newsletters is a place to bring company updates, creativity, educational discoveries, and entertainment together.'),
  'vlogs', '[]'::jsonb,
  'secrets', jsonb_build_object('text', 'Look carefully. Future clues could be hidden in articles, facts, games, character vlogs, and other parts of the publication. More secrets will be revealed in future editions.'),
  'next', jsonb_build_object('title', 'Issue 2 soon.', 'text', 'New stories. New discoveries. New secrets.'))
where not exists (select 1 from public.rp_news_issues);
insert into public.rp_news_secrets(issue_no) select 1 where exists (select 1 from public.rp_news_issues where issue_no = 1) on conflict do nothing;

/* ---------- permissions ---------- */
revoke all on function public.rp_is_branch_dev(text) from public, anon;
revoke all on function public.rp_page_validate(text, jsonb) from public, anon, authenticated;
revoke all on function public.rp_news_validate(jsonb) from public, anon, authenticated;
revoke all on function public.rp_coder_require(text) from public, anon, authenticated;
revoke all on function public.rp_save_page(bigint, text, text, text, integer, boolean, jsonb) from public, anon;
revoke all on function public.rp_delete_page(bigint) from public, anon;
revoke all on function public.rp_admin_pages() from public, anon;
revoke all on function public.rp_submit_application(text, text, jsonb) from public, anon;
revoke all on function public.rp_my_applications() from public, anon;
revoke all on function public.rp_withdraw_application(bigint) from public, anon;
revoke all on function public.rp_list_applications(text) from public, anon;
revoke all on function public.rp_decide_application(bigint, boolean, text) from public, anon;
revoke all on function public.rp_my_notifications(integer) from public, anon;
revoke all on function public.rp_mark_notifications_read() from public, anon;
revoke all on function public.rp_coder_list(text) from public, anon;
revoke all on function public.rp_coder_get(text, text) from public, anon;
revoke all on function public.rp_coder_save(text, text, text) from public, anon;
revoke all on function public.rp_coder_delete(text, text, boolean) from public, anon;
revoke all on function public.rp_coder_apply(text, text, text) from public, anon;
revoke all on function public.rp_coder_live(text) from public, anon;
revoke all on function public.rp_coder_unapply(text, text) from public, anon;
revoke all on function public.rp_news_save_issue(integer, text, text, date, text, jsonb, text, text, text, integer) from public, anon;
revoke all on function public.rp_news_admin_issues() from public, anon;
revoke all on function public.rp_news_delete_issue(integer) from public, anon;
revoke all on function public.rp_news_unlock_letter(integer, text) from public, anon;
revoke all on function public.rp_news_mark_level(integer, integer) from public, anon;
revoke all on function public.rp_news_unmark_level(integer, integer) from public, anon;
revoke all on function public.rp_news_my_levels(integer) from public, anon;
revoke all on function public.rp_news_claim_video(integer) from public, anon;
grant execute on function public.rp_is_branch_dev(text), public.rp_save_page(bigint, text, text, text, integer, boolean, jsonb), public.rp_delete_page(bigint), public.rp_admin_pages(),
  public.rp_submit_application(text, text, jsonb), public.rp_my_applications(), public.rp_withdraw_application(bigint), public.rp_list_applications(text), public.rp_decide_application(bigint, boolean, text),
  public.rp_my_notifications(integer), public.rp_mark_notifications_read(), public.rp_coder_list(text), public.rp_coder_get(text, text), public.rp_coder_save(text, text, text), public.rp_coder_delete(text, text, boolean),
  public.rp_coder_apply(text, text, text), public.rp_coder_live(text), public.rp_coder_unapply(text, text), public.rp_news_save_issue(integer, text, text, date, text, jsonb, text, text, text, integer),
  public.rp_news_admin_issues(), public.rp_news_delete_issue(integer), public.rp_news_unlock_letter(integer, text), public.rp_news_mark_level(integer, integer), public.rp_news_unmark_level(integer, integer),
  public.rp_news_my_levels(integer), public.rp_news_claim_video(integer) to authenticated;
