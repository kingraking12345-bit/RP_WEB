-- RP Branch Tree: sub-branches (branches of branches) with their own colour theme and settings, managed from Creator > Branch tree.
-- Run once in the Supabase SQL Editor AFTER branch-kit.sql. Safe to run again. (Only needed when you switch rp-config.js to "supabase".)

create table if not exists public.rp_branches (
  slug text primary key check (slug ~ '^[a-z0-9][a-z0-9-]{1,30}$'),
  parent text references public.rp_branches(slug) on delete restrict,
  name text not null check (char_length(name) between 1 and 60),
  tagline text not null default '' check (char_length(tagline) <= 40),
  description text not null default '' check (char_length(description) <= 600),
  icon text not null default '📁' check (char_length(icon) between 1 and 8),
  accent text not null default '' check (accent = '' or accent ~ '^#[0-9a-fA-F]{6}$'),
  tone text not null default 'graphite' check (tone in ('graphite','midnight','black','slate')),
  radius text not null default 'rounded' check (radius in ('sharp','rounded','soft')),
  sort integer not null default 0,
  enabled boolean not null default true,
  maintenance boolean not null default false,
  maintenance_note text not null default '' check (char_length(maintenance_note) <= 300),
  banner text not null default '' check (char_length(banner) <= 300),
  applications_open boolean not null default true,
  requires_login boolean not null default false,
  link text not null default '' check (link = '' or link ~ '^(https://[^\s]{4,255}|\.\./[A-Za-z0-9_./?=&#%-]{1,200}|[A-Za-z0-9_-]+\.html([?#][A-Za-z0-9_=&#.%-]*)?)$'),
  content text not null default '' check (char_length(content) <= 60000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.rp_branches enable row level security;
revoke all on public.rp_branches from anon, authenticated;
grant select on public.rp_branches to anon, authenticated;
drop policy if exists rp_branches_read on public.rp_branches;
create policy rp_branches_read on public.rp_branches for select to anon, authenticated using (enabled);

insert into public.rp_branches(slug, name, tagline, description, icon, accent, link, sort) values
  ('labs', 'Labs', 'Science', 'Virtual science labs and an experiment scripting studio for physics, chemistry and biology.', '🧪', '#38bdf8', '../Labs/labs.html', 10),
  ('games', 'Games', 'Entertainment', 'Games, events and releases from the RP Games studio.', '🎮', '#8b8cf8', '../Games/games.html', 20),
  ('education', 'Education', 'Learning', 'Courses, degrees and exams, from first lessons to university level.', '🎓', '#4aa3f0', '../Education/education.html', 30),
  ('tools', 'Tools', 'Utilities', 'Practical tools and the Kignity AI assistant.', '🧰', '#3fb7a6', '../Tools/tools.html', 40),
  ('music', 'Music', 'Creative', 'A browser music studio and a showcase for finished tracks.', '🎵', '#e8749f', '../Music/music.html', 50),
  ('community', 'Community', 'Social', 'A social space to share projects, ideas and updates.', '💬', '#4cc38a', '../Community/community.html', 60),
  ('skills', 'Skills', 'Learning', 'Practical skill courses unlocked by your degrees.', '🧠', '#e0a23b', '../Skills/skills.html', 70)
on conflict (slug) do nothing;

/* sub-branches belong to a main branch: they use its roles, folder and Coder */
create or replace function public.rp_branch_root(p text) returns text language sql stable security definer set search_path = public, pg_temp as $$
  with recursive up(slug, parent, n) as (select slug, parent, 0 from public.rp_branches where slug = p union all select b.slug, b.parent, up.n + 1 from public.rp_branches b join up on b.slug = up.parent where up.n < 8)
  select slug from up where parent is null limit 1
$$;
create or replace function public.rp_branch_ok(p text) returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select p = 'rp' or exists (select 1 from public.rp_branches where slug = p)
$$;
create or replace function public.rp_branch_role(p_branch text, p_kind text) returns text language sql stable security definer set search_path = public, pg_temp as $$
  select case p_kind
    when 'employee' then case public.rp_branch_root(p_branch) when 'games' then 'Game Employee' when 'tools' then 'Tool Employee' when 'music' then 'Music Employee' when 'education' then 'Education Employee' when 'skills' then 'Skills Employee' when 'community' then 'Community Employee' when 'labs' then 'Labs Employee' end
    when 'developer' then case public.rp_branch_root(p_branch) when 'games' then 'Games Developer' when 'tools' then 'Tools Developer' when 'music' then 'Music Developer' when 'education' then 'Education Developer' when 'skills' then 'Skills Developer' when 'community' then 'Community Developer' when 'labs' then 'Labs Developer' end
    when 'director' then case public.rp_branch_root(p_branch) when 'games' then 'Games Studio Director' when 'tools' then 'Tool Studio Director' when 'music' then 'Music Studio Director' when 'education' then 'Education Studio Director' when 'skills' then 'Skills Studio Director' when 'community' then 'Community Studio Director' when 'labs' then 'Lab Studio Director' end
  end
$$;

create or replace function public.rp_save_branch(p_slug text, p_parent text, p_name text, p_tagline text default '', p_description text default '', p_icon text default '📁', p_accent text default '', p_tone text default 'graphite', p_radius text default 'rounded', p_sort integer default 0,
  p_enabled boolean default true, p_maintenance boolean default false, p_maintenance_note text default '', p_banner text default '', p_applications_open boolean default true, p_requires_login boolean default false, p_link text default '', p_content text default '')
returns text language plpgsql security definer set search_path = public, pg_temp as $$
declare v_slug text := lower(btrim(coalesce(p_slug, ''))); v_old public.rp_branches%rowtype; v_parent text := nullif(lower(btrim(coalesce(p_parent, ''))), ''); v_depth integer; v_height integer;
begin
  if not public.rp_is_creator() then raise exception 'Creator role required'; end if;
  if v_slug !~ '^[a-z0-9][a-z0-9-]{1,30}$' then raise exception 'The key must be 2 to 31 letters, numbers or dashes'; end if;
  select * into v_old from public.rp_branches where slug = v_slug;
  if found and v_old.parent is null then v_parent := null;
  else
    if v_parent is null then raise exception 'Choose the branch this sub-branch belongs to'; end if;
    if not exists (select 1 from public.rp_branches where slug = v_parent) then raise exception 'The parent branch does not exist'; end if;
    if v_parent = v_slug or exists (with recursive d(slug) as (select slug from public.rp_branches where parent = v_slug union all select b.slug from public.rp_branches b join d on b.parent = d.slug) select 1 from d where slug = v_parent) then raise exception 'A branch cannot sit inside itself'; end if;
    with recursive up(slug, parent, n) as (select slug, parent, 1 from public.rp_branches where slug = v_parent union all select b.slug, b.parent, up.n + 1 from public.rp_branches b join up on b.slug = up.parent) select max(n) into v_depth from up;
    v_height := 1;
    if v_old.slug is not null then with recursive dn(slug, n) as (select slug, 1 from public.rp_branches where parent = v_slug union all select b.slug, dn.n + 1 from public.rp_branches b join dn on b.parent = dn.slug) select coalesce(max(n), 0) + 1 into v_height from dn; end if;
    if v_depth + v_height > 4 then raise exception 'Branches can go 3 levels deep below a main branch'; end if;
  end if;
  insert into public.rp_branches(slug, parent, name, tagline, description, icon, accent, tone, radius, sort, enabled, maintenance, maintenance_note, banner, applications_open, requires_login, link, content)
  values (v_slug, v_parent, btrim(p_name), btrim(coalesce(p_tagline, '')), btrim(coalesce(p_description, '')), coalesce(nullif(btrim(p_icon), ''), '📁'), coalesce(p_accent, ''), coalesce(p_tone, 'graphite'), coalesce(p_radius, 'rounded'), coalesce(p_sort, 0), coalesce(p_enabled, true), coalesce(p_maintenance, false),
    btrim(coalesce(p_maintenance_note, '')), btrim(coalesce(p_banner, '')), coalesce(p_applications_open, true), coalesce(p_requires_login, false), btrim(coalesce(p_link, '')), coalesce(p_content, ''))
  on conflict (slug) do update set parent = excluded.parent, name = excluded.name, tagline = excluded.tagline, description = excluded.description, icon = excluded.icon, accent = excluded.accent, tone = excluded.tone, radius = excluded.radius, sort = excluded.sort,
    enabled = excluded.enabled, maintenance = excluded.maintenance, maintenance_note = excluded.maintenance_note, banner = excluded.banner, applications_open = excluded.applications_open, requires_login = excluded.requires_login, link = excluded.link, content = excluded.content, updated_at = now();
  insert into public.rp_audit_log(actor, action, details) values (auth.uid(), case when v_old.slug is not null then 'branch_saved' else 'branch_created' end, jsonb_build_object('slug', v_slug, 'parent', v_parent));
  return v_slug;
end;
$$;
create or replace function public.rp_delete_branch(p_slug text) returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v public.rp_branches%rowtype;
begin
  if not public.rp_is_creator() then raise exception 'Creator role required'; end if;
  select * into v from public.rp_branches where slug = p_slug; if not found then raise exception 'That branch does not exist'; end if;
  if v.parent is null then raise exception 'Main branches cannot be deleted. Turn them off instead'; end if;
  if exists (select 1 from public.rp_branches where parent = p_slug) then raise exception 'Delete or move its sub-branches first'; end if;
  delete from public.rp_pages where branch = p_slug; delete from public.rp_applications where branch = p_slug; delete from public.rp_branches where slug = p_slug;
  insert into public.rp_audit_log(actor, action, details) values (auth.uid(), 'branch_deleted', jsonb_build_object('slug', p_slug));
end;
$$;
create or replace function public.rp_admin_branches() returns setof public.rp_branches language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not public.rp_is_creator() then raise exception 'Creator role required'; end if;
  return query select * from public.rp_branches order by sort, name;
end;
$$;
revoke all on function public.rp_branch_root(text) from public, anon, authenticated;
revoke all on function public.rp_save_branch(text, text, text, text, text, text, text, text, text, integer, boolean, boolean, text, text, boolean, boolean, text, text) from public, anon;
revoke all on function public.rp_delete_branch(text) from public, anon;
revoke all on function public.rp_admin_branches() from public, anon;
grant execute on function public.rp_save_branch(text, text, text, text, text, text, text, text, text, integer, boolean, boolean, text, text, boolean, boolean, text, text), public.rp_delete_branch(text), public.rp_admin_branches() to authenticated;
