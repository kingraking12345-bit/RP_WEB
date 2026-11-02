-- RP Community: a social network (posts, comments, likes, follows, profiles, bookmarks, notifications, reports)
-- plus moderation tools for Community employees. Run once in the Supabase SQL Editor AFTER account-system.sql. Safe to run again.
--
--   * Everything is stored in Supabase and shared by all devices. Visitors only call the rp_community_* functions below;
--     tables cannot be read or written directly. Every write checks: signed in, account active, not muted/banned,
--     community not in read-only mode, slow mode, banned words and per-hour limits.
--   * Moderators (roles: Creator, Community Studio Director, Community Employee) use community-employee.html.
--     Every moderator action is written to rp_audit_log.

insert into public.rp_roles(role_name, description, is_system) values
  ('Community Employee', 'Moderates the Community branch.', true)
on conflict(role_name) do nothing;

create table if not exists public.rp_community_profiles (
  account_id uuid primary key references auth.users(id) on delete cascade,
  username text not null,
  bio text not null default '' check (char_length(bio) <= 200),
  emoji text not null default '🙂' check (char_length(emoji) <= 8),
  notif_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create unique index if not exists rp_community_profiles_username on public.rp_community_profiles (lower(username));

create table if not exists public.rp_community_posts (
  id bigint generated always as identity primary key,
  author uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 2000),
  image_url text check (image_url is null or (image_url ~ '^https://' and char_length(image_url) <= 500)),
  pinned boolean not null default false,
  removed boolean not null default false,
  removed_reason text,
  removed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  edited_at timestamptz
);
create index if not exists rp_community_posts_feed on public.rp_community_posts (id desc) where not removed;
create index if not exists rp_community_posts_author on public.rp_community_posts (author, id desc);

create table if not exists public.rp_community_comments (
  id bigint generated always as identity primary key,
  post_id bigint not null references public.rp_community_posts(id) on delete cascade,
  parent_id bigint references public.rp_community_comments(id) on delete cascade,
  author uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 500),
  removed boolean not null default false,
  removed_reason text,
  removed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists rp_community_comments_post on public.rp_community_comments (post_id, id);

create table if not exists public.rp_community_likes (post_id bigint not null references public.rp_community_posts(id) on delete cascade, account_id uuid not null references auth.users(id) on delete cascade, created_at timestamptz not null default now(), primary key (post_id, account_id));
create table if not exists public.rp_community_follows (follower uuid not null references auth.users(id) on delete cascade, followee uuid not null references auth.users(id) on delete cascade, created_at timestamptz not null default now(), primary key (follower, followee), check (follower <> followee));
create table if not exists public.rp_community_bookmarks (account_id uuid not null references auth.users(id) on delete cascade, post_id bigint not null references public.rp_community_posts(id) on delete cascade, created_at timestamptz not null default now(), primary key (account_id, post_id));

create table if not exists public.rp_community_reports (
  id bigint generated always as identity primary key,
  reporter uuid not null references auth.users(id) on delete cascade,
  target_type text not null check (target_type in ('post','comment','user')),
  target_id text not null,
  reason text not null check (reason in ('spam','harassment','hate','sexual','violence','scam','privacy','other')),
  details text not null default '' check (char_length(details) <= 500),
  status text not null default 'open' check (status in ('open','actioned','dismissed')),
  resolution text,
  handled_by uuid references auth.users(id) on delete set null,
  handled_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists rp_community_reports_status on public.rp_community_reports (status, id desc);

create table if not exists public.rp_community_restrictions (
  account_id uuid primary key references auth.users(id) on delete cascade,
  kind text not null check (kind in ('mute','ban')),
  until timestamptz,
  reason text not null default '',
  set_by uuid references auth.users(id) on delete set null,
  set_at timestamptz not null default now()
);

create table if not exists public.rp_community_notices (
  id bigint generated always as identity primary key,
  account_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('warning','removed','restricted','restored','lifted')),
  message text not null,
  created_at timestamptz not null default now()
);
create index if not exists rp_community_notices_account on public.rp_community_notices (account_id, id desc);

create table if not exists public.rp_community_settings (
  id int primary key default 1 check (id = 1),
  slow_mode_seconds int not null default 0 check (slow_mode_seconds between 0 and 3600),
  read_only boolean not null default false,
  images_allowed boolean not null default true,
  announcement text not null default '' check (char_length(announcement) <= 300),
  updated_at timestamptz not null default now()
);
insert into public.rp_community_settings(id) values (1) on conflict do nothing;
create table if not exists public.rp_community_words (word text primary key check (char_length(word) between 2 and 40));

do $$ declare t text; begin
  foreach t in array array['profiles','posts','comments','likes','follows','bookmarks','reports','restrictions','notices','settings','words'] loop
    execute format('alter table public.rp_community_%s enable row level security', t);
    execute format('revoke all on public.rp_community_%s from anon, authenticated', t);
  end loop;
end $$;

/* ---------------- helpers (not callable by visitors) ---------------- */
create or replace function public.rp_community_is_mod() returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists(select 1 from public.rp_accounts where id = (select auth.uid()) and status = 'active' and roles && array['Creator','Community Studio Director','Community Employee']::text[])
$$;
create or replace function public.rp_community_require_mod() returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin if not public.rp_community_is_mod() then raise exception 'Community moderator role required'; end if; end $$;

create or replace function public.rp_community_is_staff(p_id uuid) returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((select roles && array['Creator','Community Studio Director','Community Employee']::text[] from public.rp_accounts where id = p_id), false)
$$;

create or replace function public.rp_community_ensure_profile() returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := auth.uid(); v_name text;
begin
  if v_uid is null then raise exception 'Sign in to use Community'; end if;
  select username into v_name from public.rp_accounts where id = v_uid;
  if v_name is null then raise exception 'Account profile is not initialized'; end if;
  insert into public.rp_community_profiles(account_id, username) values (v_uid, v_name)
    on conflict (account_id) do update set username = excluded.username where public.rp_community_profiles.username <> excluded.username;
  return v_uid;
end $$;

create or replace function public.rp_community_active_restriction(p_id uuid) returns public.rp_community_restrictions language sql stable security definer set search_path = public, pg_temp as $$
  select r from public.rp_community_restrictions r where r.account_id = p_id and (r.until is null or r.until > now())
$$;

-- Every write goes through this gate.
create or replace function public.rp_community_gate(p_text text, p_kind text) returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid; v_acc public.rp_accounts%rowtype; v_set public.rp_community_settings%rowtype; v_res public.rp_community_restrictions%rowtype; v_last timestamptz; v_n int;
begin
  v_uid := public.rp_community_ensure_profile();
  select * into v_acc from public.rp_accounts where id = v_uid;
  if v_acc.status <> 'active' then raise exception 'Your account cannot post right now'; end if;
  select * into v_set from public.rp_community_settings where id = 1;
  if public.rp_community_is_mod() then return v_uid; end if;
  if v_set.read_only then raise exception 'Community is in read-only mode right now'; end if;
  select * into v_res from public.rp_community_restrictions where account_id = v_uid and (until is null or until > now());
  if found then
    if v_res.kind = 'ban' then raise exception 'You are banned from Community%', case when v_res.reason <> '' then ': ' || v_res.reason else '' end; end if;
    raise exception 'You are muted until %', coalesce(to_char(v_res.until at time zone 'UTC', 'YYYY-MM-DD HH24:MI "UTC"'), 'further notice') || case when v_res.reason <> '' then ' (' || v_res.reason || ')' else '' end;
  end if;
  if p_text is not null and exists (select 1 from public.rp_community_words w where lower(p_text) ~ ('\m' || regexp_replace(lower(w.word), '([.^$*+?()\[\]{}|\\])', '\\\1', 'g') || '\M')) then
    raise exception 'Your message contains a word that is not allowed in Community';
  end if;
  if p_kind = 'post' then
    select max(created_at) into v_last from public.rp_community_posts where author = v_uid;
    if v_set.slow_mode_seconds > 0 and v_last is not null and v_last > now() - make_interval(secs => v_set.slow_mode_seconds) then
      raise exception 'Slow mode is on. Wait % more second(s)', ceil(extract(epoch from (v_last + make_interval(secs => v_set.slow_mode_seconds) - now())))::int;
    end if;
    select count(*) into v_n from public.rp_community_posts where author = v_uid and created_at > now() - interval '1 hour';
    if v_n >= 20 then raise exception 'You are posting too fast. Try again later'; end if;
  elsif p_kind = 'comment' then
    select count(*) into v_n from public.rp_community_comments where author = v_uid and created_at > now() - interval '1 hour';
    if v_n >= 60 then raise exception 'You are commenting too fast. Try again later'; end if;
  end if;
  return v_uid;
end $$;

create or replace function public.rp_community_author_json(p_id uuid) returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object('username', coalesce(p.username, '[deleted]'), 'emoji', coalesce(p.emoji, '🙂'), 'staff', public.rp_community_is_staff(p_id))
  from (select 1) x left join public.rp_community_profiles p on p.account_id = p_id
$$;

create or replace function public.rp_community_post_json(p public.rp_community_posts, p_me uuid) returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object('id', p.id, 'body', p.body, 'image', p.image_url, 'pinned', p.pinned, 'created_at', p.created_at, 'edited_at', p.edited_at,
    'author', public.rp_community_author_json(p.author),
    'likes', (select count(*) from public.rp_community_likes l where l.post_id = p.id),
    'comments', (select count(*) from public.rp_community_comments c where c.post_id = p.id and not c.removed),
    'liked', p_me is not null and exists (select 1 from public.rp_community_likes l where l.post_id = p.id and l.account_id = p_me),
    'saved', p_me is not null and exists (select 1 from public.rp_community_bookmarks b where b.post_id = p.id and b.account_id = p_me),
    'following', p_me is not null and exists (select 1 from public.rp_community_follows f where f.follower = p_me and f.followee = p.author),
    'mine', p_me is not null and p.author = p_me)
$$;

/* ---------------- reads (anyone) ---------------- */
create or replace function public.rp_community_settings_public() returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object('slow_mode_seconds', slow_mode_seconds, 'read_only', read_only, 'images_allowed', images_allowed, 'announcement', announcement) from public.rp_community_settings where id = 1
$$;

create or replace function public.rp_community_feed(p_mode text default 'latest', p_before bigint default null, p_limit int default 20, p_tag text default null, p_query text default null, p_author text default null)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_me uuid := auth.uid(); v_limit int := least(greatest(coalesce(p_limit, 20), 1), 50); v_out jsonb; v_q text := nullif(trim(coalesce(p_query, '')), ''); v_tag text := nullif(lower(trim(both '#' from coalesce(p_tag, ''))), ''); v_author uuid;
begin
  if p_mode not in ('latest','following','trending','saved','user') then raise exception 'Unknown feed'; end if;
  if p_mode in ('following','saved') and v_me is null then raise exception 'Sign in to see this feed'; end if;
  if p_mode = 'user' then select account_id into v_author from public.rp_community_profiles where lower(username) = lower(coalesce(p_author, '')); if v_author is null then return '[]'::jsonb; end if; end if;
  if p_mode = 'trending' then
    select coalesce(jsonb_agg(public.rp_community_post_json(s.p, v_me) order by s.score desc, (s.p).id desc), '[]'::jsonb) into v_out from (
      select p, (select count(*) from public.rp_community_likes l where l.post_id = p.id) * 2 + (select count(*) from public.rp_community_comments c where c.post_id = p.id and not c.removed) as score
      from public.rp_community_posts p where not p.removed and p.created_at > now() - interval '3 days' order by 2 desc, p.id desc limit v_limit) s;
    return v_out;
  end if;
  select coalesce(jsonb_agg(public.rp_community_post_json(s.p, v_me) order by s.pin desc, (s.p).id desc), '[]'::jsonb) into v_out from (
    select p, case when p_mode = 'latest' and p_before is null and p.pinned then 1 else 0 end as pin from public.rp_community_posts p
    where not p.removed and (p_before is null or p.id < p_before)
      and (p_mode <> 'following' or p.author in (select followee from public.rp_community_follows where follower = v_me) or p.author = v_me)
      and (p_mode <> 'saved' or p.id in (select post_id from public.rp_community_bookmarks where account_id = v_me))
      and (p_mode <> 'user' or p.author = v_author)
      and (v_tag is null or lower(p.body) ~ ('#' || regexp_replace(v_tag, '([.^$*+?()\[\]{}|\\])', '\\\1', 'g') || '(\M|$)'))
      and (v_q is null or p.body ilike '%' || replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_') || '%')
    order by 2 desc, p.id desc limit v_limit) s;
  return v_out;
end $$;

create or replace function public.rp_community_comments(p_post_id bigint) returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'parent_id', c.parent_id, 'body', c.body, 'created_at', c.created_at, 'author', public.rp_community_author_json(c.author), 'mine', auth.uid() is not null and c.author = auth.uid()) order by c.id), '[]'::jsonb)
  from (select * from public.rp_community_comments where post_id = p_post_id and not removed order by id limit 300) c
  where exists (select 1 from public.rp_community_posts p where p.id = p_post_id and not p.removed)
$$;

create or replace function public.rp_community_profile(p_username text) returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_p public.rp_community_profiles%rowtype; v_me uuid := auth.uid();
begin
  select * into v_p from public.rp_community_profiles where lower(username) = lower(coalesce(p_username, ''));
  if not found then return null; end if;
  return jsonb_build_object('username', v_p.username, 'emoji', v_p.emoji, 'bio', v_p.bio, 'staff', public.rp_community_is_staff(v_p.account_id), 'joined', v_p.created_at,
    'posts', (select count(*) from public.rp_community_posts where author = v_p.account_id and not removed),
    'followers', (select count(*) from public.rp_community_follows where followee = v_p.account_id),
    'following', (select count(*) from public.rp_community_follows where follower = v_p.account_id),
    'followed_by_me', v_me is not null and exists (select 1 from public.rp_community_follows where follower = v_me and followee = v_p.account_id), 'is_me', v_me = v_p.account_id);
end $$;

create or replace function public.rp_community_people(p_query text default '') returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object('username', username, 'emoji', emoji, 'bio', bio, 'staff', public.rp_community_is_staff(account_id))), '[]'::jsonb)
  from (select * from public.rp_community_profiles where p_query = '' or username ilike '%' || replace(replace(replace(p_query, '\', '\\'), '%', '\%'), '_', '\_') || '%' order by (select count(*) from public.rp_community_follows f where f.followee = account_id) desc, username limit 20) t
$$;

/* ---------------- my account ---------------- */
create or replace function public.rp_community_me() returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := public.rp_community_ensure_profile(); v_p public.rp_community_profiles%rowtype; v_r public.rp_community_restrictions%rowtype;
begin
  select * into v_p from public.rp_community_profiles where account_id = v_uid;
  select * into v_r from public.rp_community_restrictions where account_id = v_uid and (until is null or until > now());
  return jsonb_build_object('username', v_p.username, 'emoji', v_p.emoji, 'bio', v_p.bio, 'mod', public.rp_community_is_mod(),
    'restriction', case when v_r.account_id is null then null else jsonb_build_object('kind', v_r.kind, 'until', v_r.until, 'reason', v_r.reason) end,
    'unseen', (select count(*) from public.rp_community_notices n where n.account_id = v_uid and n.created_at > v_p.notif_seen_at)
      + (select count(*) from public.rp_community_likes l join public.rp_community_posts p on p.id = l.post_id where p.author = v_uid and l.account_id <> v_uid and l.created_at > v_p.notif_seen_at)
      + (select count(*) from public.rp_community_comments c join public.rp_community_posts p on p.id = c.post_id where p.author = v_uid and c.author <> v_uid and c.created_at > v_p.notif_seen_at and not c.removed)
      + (select count(*) from public.rp_community_follows f where f.followee = v_uid and f.created_at > v_p.notif_seen_at));
end $$;

create or replace function public.rp_community_set_profile(p_bio text, p_emoji text) returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := public.rp_community_ensure_profile();
begin
  if char_length(coalesce(p_bio, '')) > 200 then raise exception 'Bio is limited to 200 characters'; end if;
  if char_length(coalesce(p_emoji, '')) not between 1 and 8 then raise exception 'Pick one emoji for your avatar'; end if;
  if exists (select 1 from public.rp_community_words w where lower(coalesce(p_bio, '')) ~ ('\m' || regexp_replace(lower(w.word), '([.^$*+?()\[\]{}|\\])', '\\\1', 'g') || '\M')) and not public.rp_community_is_mod() then raise exception 'Your bio contains a word that is not allowed'; end if;
  update public.rp_community_profiles set bio = trim(coalesce(p_bio, '')), emoji = p_emoji where account_id = v_uid;
end $$;

create or replace function public.rp_community_notifications() returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_uid uuid := auth.uid(); v_seen timestamptz;
begin
  if v_uid is null then raise exception 'Sign in to see notifications'; end if;
  select notif_seen_at into v_seen from public.rp_community_profiles where account_id = v_uid;
  return (select coalesce(jsonb_agg(to_jsonb(t) order by t.at desc), '[]'::jsonb) from (
    select * from (
      select 'notice' as type, n.kind as sub, n.message as text, null::bigint as post_id, null::text as who, n.created_at as at from public.rp_community_notices n where n.account_id = v_uid
      union all select 'like', null, left(p.body, 80), p.id, pr.username, l.created_at from public.rp_community_likes l join public.rp_community_posts p on p.id = l.post_id join public.rp_community_profiles pr on pr.account_id = l.account_id where p.author = v_uid and l.account_id <> v_uid and not p.removed
      union all select 'comment', null, left(c.body, 80), c.post_id, pr.username, c.created_at from public.rp_community_comments c join public.rp_community_posts p on p.id = c.post_id join public.rp_community_profiles pr on pr.account_id = c.author where p.author = v_uid and c.author <> v_uid and not c.removed and not p.removed
      union all select 'follow', null, null, null, pr.username, f.created_at from public.rp_community_follows f join public.rp_community_profiles pr on pr.account_id = f.follower where f.followee = v_uid
    ) u order by at desc limit 40) t);
end $$;
create or replace function public.rp_community_mark_seen() returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin if auth.uid() is null then return; end if; update public.rp_community_profiles set notif_seen_at = now() where account_id = auth.uid(); end $$;

/* ---------------- writes (visitors) ---------------- */
create or replace function public.rp_community_post(p_body text, p_image text default null) returns bigint language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid; v_body text := trim(coalesce(p_body, '')); v_img text := nullif(trim(coalesce(p_image, '')), ''); v_id bigint;
begin
  if char_length(v_body) not between 1 and 2000 then raise exception 'Posts must be 1 to 2000 characters'; end if;
  v_uid := public.rp_community_gate(v_body, 'post');
  if v_img is not null then
    if not (select images_allowed from public.rp_community_settings where id = 1) and not public.rp_community_is_mod() then raise exception 'Images are turned off right now'; end if;
    if v_img !~ '^https://[^\s<>"'']+$' or char_length(v_img) > 500 then raise exception 'Image address must be an https:// link'; end if;
  end if;
  insert into public.rp_community_posts(author, body, image_url) values (v_uid, v_body, v_img) returning id into v_id; return v_id;
end $$;

create or replace function public.rp_community_edit_post(p_id bigint, p_body text) returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid; v_body text := trim(coalesce(p_body, ''));
begin
  if char_length(v_body) not between 1 and 2000 then raise exception 'Posts must be 1 to 2000 characters'; end if;
  v_uid := public.rp_community_gate(v_body, 'edit');
  update public.rp_community_posts set body = v_body, edited_at = now() where id = p_id and author = v_uid and not removed;
  if not found then raise exception 'You can only edit your own posts'; end if;
end $$;

create or replace function public.rp_community_comment(p_post_id bigint, p_body text, p_parent bigint default null) returns bigint language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid; v_body text := trim(coalesce(p_body, '')); v_id bigint;
begin
  if char_length(v_body) not between 1 and 500 then raise exception 'Comments must be 1 to 500 characters'; end if;
  v_uid := public.rp_community_gate(v_body, 'comment');
  if not exists (select 1 from public.rp_community_posts where id = p_post_id and not removed) then raise exception 'That post is no longer available'; end if;
  if p_parent is not null and not exists (select 1 from public.rp_community_comments where id = p_parent and post_id = p_post_id and parent_id is null and not removed) then raise exception 'You can only reply to a top-level comment'; end if;
  insert into public.rp_community_comments(post_id, parent_id, author, body) values (p_post_id, p_parent, v_uid, v_body) returning id into v_id; return v_id;
end $$;

create or replace function public.rp_community_delete_own(p_type text, p_id bigint) returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'Sign in first'; end if;
  if p_type = 'post' then update public.rp_community_posts set removed = true, removed_reason = 'Deleted by author', removed_by = v_uid, pinned = false where id = p_id and author = v_uid and not removed;
  elsif p_type = 'comment' then update public.rp_community_comments set removed = true, removed_reason = 'Deleted by author', removed_by = v_uid where id = p_id and author = v_uid and not removed;
  else raise exception 'Unknown type'; end if;
  if not found then raise exception 'Nothing to delete'; end if;
end $$;

create or replace function public.rp_community_like(p_post_id bigint, p_on boolean) returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := public.rp_community_ensure_profile();
begin
  if not exists (select 1 from public.rp_community_posts where id = p_post_id and not removed) then raise exception 'That post is no longer available'; end if;
  if p_on then
    if (select count(*) from public.rp_community_likes where account_id = v_uid and created_at > now() - interval '1 hour') >= 200 then raise exception 'Too many likes. Slow down'; end if;
    insert into public.rp_community_likes(post_id, account_id) values (p_post_id, v_uid) on conflict do nothing;
  else delete from public.rp_community_likes where post_id = p_post_id and account_id = v_uid; end if;
end $$;

create or replace function public.rp_community_save(p_post_id bigint, p_on boolean) returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := public.rp_community_ensure_profile();
begin
  if p_on then
    if not exists (select 1 from public.rp_community_posts where id = p_post_id and not removed) then raise exception 'That post is no longer available'; end if;
    insert into public.rp_community_bookmarks(account_id, post_id) values (v_uid, p_post_id) on conflict do nothing;
  else delete from public.rp_community_bookmarks where account_id = v_uid and post_id = p_post_id; end if;
end $$;

create or replace function public.rp_community_follow(p_username text, p_on boolean) returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := public.rp_community_ensure_profile(); v_t uuid;
begin
  select account_id into v_t from public.rp_community_profiles where lower(username) = lower(coalesce(p_username, ''));
  if v_t is null then raise exception 'That member does not exist'; end if;
  if v_t = v_uid then raise exception 'You cannot follow yourself'; end if;
  if p_on then
    if (select count(*) from public.rp_community_follows where follower = v_uid) >= 2000 then raise exception 'You follow too many members'; end if;
    insert into public.rp_community_follows(follower, followee) values (v_uid, v_t) on conflict do nothing;
  else delete from public.rp_community_follows where follower = v_uid and followee = v_t; end if;
end $$;

create or replace function public.rp_community_report(p_type text, p_id text, p_reason text, p_details text default '') returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := public.rp_community_ensure_profile(); v_owner uuid;
begin
  if p_type = 'post' and p_id ~ '^[0-9]{1,18}$' then select author into v_owner from public.rp_community_posts where id = p_id::bigint and not removed;
  elsif p_type = 'comment' and p_id ~ '^[0-9]{1,18}$' then select author into v_owner from public.rp_community_comments where id = p_id::bigint and not removed;
  elsif p_type = 'user' then select account_id into v_owner from public.rp_community_profiles where lower(username) = lower(p_id);
  else raise exception 'Unknown report type'; end if;
  if v_owner is null then raise exception 'That content is no longer available'; end if;
  if v_owner = v_uid then raise exception 'You cannot report your own content'; end if;
  if char_length(coalesce(p_details, '')) > 500 then raise exception 'Details are limited to 500 characters'; end if;
  if exists (select 1 from public.rp_community_reports where reporter = v_uid and target_type = p_type and target_id = case when p_type = 'user' then lower(p_id) else p_id end and status = 'open') then raise exception 'You already reported this. A moderator will review it'; end if;
  if (select count(*) from public.rp_community_reports where reporter = v_uid and created_at > now() - interval '1 day') >= 20 then raise exception 'You have sent many reports today. Please wait'; end if;
  insert into public.rp_community_reports(reporter, target_type, target_id, reason, details) values (v_uid, p_type, case when p_type = 'user' then lower(p_id) else p_id end, p_reason, trim(coalesce(p_details, '')));
end $$;

/* ---------------- moderation (moderators only) ---------------- */
create or replace function public.rp_community_audit(p_action text, p_target uuid, p_details jsonb) returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into public.rp_audit_log(actor, action, target_account, details)
  values (auth.uid(), p_action, (select account_number from public.rp_accounts where id = p_target), coalesce(p_details, '{}'::jsonb));
end $$;

create or replace function public.rp_community_notice(p_account uuid, p_kind text, p_message text) returns void language sql security definer set search_path = public, pg_temp as $$
  insert into public.rp_community_notices(account_id, kind, message) values (p_account, p_kind, left(p_message, 300))
$$;

create or replace function public.rp_community_remove_item(p_type text, p_id bigint, p_reason text) returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare v_owner uuid;
begin
  perform public.rp_community_require_mod();
  if p_type = 'post' then update public.rp_community_posts set removed = true, removed_reason = left(coalesce(p_reason, ''), 200), removed_by = auth.uid(), pinned = false where id = p_id and not removed returning author into v_owner;
  elsif p_type = 'comment' then update public.rp_community_comments set removed = true, removed_reason = left(coalesce(p_reason, ''), 200), removed_by = auth.uid() where id = p_id and not removed returning author into v_owner;
  else raise exception 'Unknown type'; end if;
  if v_owner is null then raise exception 'That item was already removed or does not exist'; end if;
  perform public.rp_community_notice(v_owner, 'removed', 'A moderator removed your ' || p_type || coalesce(': ' || nullif(p_reason, ''), '.'));
  perform public.rp_community_audit('community_removed_' || p_type, v_owner, jsonb_build_object('id', p_id, 'reason', left(coalesce(p_reason, ''), 200)));
  update public.rp_community_reports set status = 'actioned', resolution = 'Removed', handled_by = auth.uid(), handled_at = now() where status = 'open' and target_type = p_type and target_id = p_id::text;
  return v_owner;
end $$;

create or replace function public.rp_community_apply_restriction(p_target uuid, p_kind text, p_hours int, p_reason text, p_purge boolean) returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_until timestamptz;
begin
  if p_kind not in ('mute','ban') then raise exception 'Unknown restriction'; end if;
  if p_target = auth.uid() then raise exception 'You cannot restrict yourself'; end if;
  if public.rp_community_is_staff(p_target) and not exists (select 1 from public.rp_accounts where id = auth.uid() and 'Creator' = any(roles)) then raise exception 'Only the Creator can restrict staff'; end if;
  if p_hours is not null then
    if p_hours < 1 or p_hours > 24 * 365 then raise exception 'Duration must be between 1 hour and 1 year'; end if;
    v_until := now() + make_interval(hours => p_hours);
  elsif p_kind = 'mute' then raise exception 'A mute needs a duration in hours (use a ban for permanent)'; end if;
  insert into public.rp_community_restrictions(account_id, kind, until, reason, set_by, set_at) values (p_target, p_kind, v_until, left(coalesce(p_reason, ''), 200), auth.uid(), now())
    on conflict (account_id) do update set kind = excluded.kind, until = excluded.until, reason = excluded.reason, set_by = excluded.set_by, set_at = now();
  if p_purge then
    update public.rp_community_posts set removed = true, removed_reason = 'Removed with ban', removed_by = auth.uid(), pinned = false where author = p_target and not removed;
    update public.rp_community_comments set removed = true, removed_reason = 'Removed with ban', removed_by = auth.uid() where author = p_target and not removed;
  end if;
  perform public.rp_community_notice(p_target, 'restricted', case p_kind when 'ban' then 'You were banned from Community' else 'You were muted in Community' end || case when v_until is null then ' permanently' else ' until ' || to_char(v_until at time zone 'UTC', 'YYYY-MM-DD HH24:MI "UTC"') end || coalesce(': ' || nullif(p_reason, ''), '.'));
  perform public.rp_community_audit('community_' || p_kind, p_target, jsonb_build_object('hours', p_hours, 'reason', left(coalesce(p_reason, ''), 200), 'purged', coalesce(p_purge, false)));
end $$;

create or replace function public.rp_mod_overview() returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform public.rp_community_require_mod();
  return jsonb_build_object(
    'open_reports', (select count(*) from public.rp_community_reports where status = 'open'),
    'posts_today', (select count(*) from public.rp_community_posts where created_at > now() - interval '1 day' and not removed),
    'comments_today', (select count(*) from public.rp_community_comments where created_at > now() - interval '1 day' and not removed),
    'removed_today', (select count(*) from public.rp_community_posts where removed and removed_by <> author and created_at > now() - interval '1 day') + (select count(*) from public.rp_community_comments where removed and removed_by <> author and created_at > now() - interval '1 day'),
    'members', (select count(*) from public.rp_community_profiles),
    'restricted', (select count(*) from public.rp_community_restrictions where until is null or until > now()),
    'settings', public.rp_community_settings_public());
end $$;

create or replace function public.rp_mod_reports(p_status text default 'open', p_limit int default 50) returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform public.rp_community_require_mod();
  return (select coalesce(jsonb_agg(to_jsonb(t) order by t.id desc), '[]'::jsonb) from (
    select r.id, r.target_type, r.target_id, r.reason, r.details, r.status, r.resolution, r.created_at, r.handled_at,
      (select username from public.rp_community_profiles where account_id = r.reporter) as reporter,
      (select username from public.rp_accounts where id = r.handled_by) as handled_by,
      (select count(*) from public.rp_community_reports o where o.target_type = r.target_type and o.target_id = r.target_id and o.status = 'open') as open_for_target,
      case r.target_type
        when 'post' then (select jsonb_build_object('text', p.body, 'image', p.image_url, 'removed', p.removed, 'author', (select username from public.rp_community_profiles where account_id = p.author)) from public.rp_community_posts p where p.id = r.target_id::bigint)
        when 'comment' then (select jsonb_build_object('text', c.body, 'removed', c.removed, 'post_id', c.post_id, 'author', (select username from public.rp_community_profiles where account_id = c.author)) from public.rp_community_comments c where c.id = r.target_id::bigint)
        else (select jsonb_build_object('author', username, 'text', bio) from public.rp_community_profiles where lower(username) = r.target_id) end as target
    from public.rp_community_reports r
    where (p_status = 'open' and r.status = 'open') or (p_status = 'handled' and r.status <> 'open')
    order by r.id desc limit least(greatest(coalesce(p_limit, 50), 1), 100)) t);
end $$;

create or replace function public.rp_mod_resolve_report(p_id bigint, p_action text, p_note text default '', p_hours int default null) returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_r public.rp_community_reports%rowtype; v_owner uuid;
begin
  perform public.rp_community_require_mod();
  select * into v_r from public.rp_community_reports where id = p_id for update;
  if not found then raise exception 'Report not found'; end if;
  if v_r.status <> 'open' then raise exception 'This report was already handled'; end if;
  if p_action = 'dismiss' then
    update public.rp_community_reports set status = 'dismissed', resolution = 'Dismissed' || coalesce(': ' || nullif(p_note, ''), ''), handled_by = auth.uid(), handled_at = now() where id = p_id;
    perform public.rp_community_audit('community_report_dismissed', null, jsonb_build_object('report', p_id));
    return;
  end if;
  if v_r.target_type = 'user' then select account_id into v_owner from public.rp_community_profiles where lower(username) = v_r.target_id;
  elsif v_r.target_type = 'post' then select author into v_owner from public.rp_community_posts where id = v_r.target_id::bigint;
  else select author into v_owner from public.rp_community_comments where id = v_r.target_id::bigint; end if;
  if v_owner is null then raise exception 'The reported content no longer exists. Dismiss the report'; end if;
  if p_action = 'remove' then
    if v_r.target_type = 'user' then raise exception 'Choose warn, mute or ban for a member report'; end if;
    perform public.rp_community_remove_item(v_r.target_type, v_r.target_id::bigint, coalesce(nullif(p_note, ''), v_r.reason));
  elsif p_action = 'warn' then
    perform public.rp_community_notice(v_owner, 'warning', 'Community warning (' || v_r.reason || ')' || coalesce(': ' || nullif(p_note, ''), '.'));
    perform public.rp_community_audit('community_warned', v_owner, jsonb_build_object('report', p_id, 'note', left(coalesce(p_note, ''), 200)));
  elsif p_action in ('mute','ban') then
    perform public.rp_community_apply_restriction(v_owner, p_action, p_hours, coalesce(nullif(p_note, ''), v_r.reason), false);
    if v_r.target_type in ('post','comment') then perform public.rp_community_remove_item(v_r.target_type, v_r.target_id::bigint, coalesce(nullif(p_note, ''), v_r.reason)); end if;
  else raise exception 'Unknown action'; end if;
  update public.rp_community_reports set status = 'actioned', resolution = initcap(p_action) || coalesce(': ' || nullif(p_note, ''), ''), handled_by = auth.uid(), handled_at = now() where id = p_id or (status = 'open' and target_type = v_r.target_type and target_id = v_r.target_id);
end $$;

create or replace function public.rp_mod_content(p_type text default 'post', p_query text default '', p_removed boolean default false, p_limit int default 40) returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_q text := '%' || replace(replace(replace(coalesce(p_query, ''), '\', '\\'), '%', '\%'), '_', '\_') || '%';
begin
  perform public.rp_community_require_mod();
  if p_type = 'comment' then
    return (select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'post_id', c.post_id, 'text', c.body, 'author', pr.username, 'created_at', c.created_at, 'removed', c.removed, 'removed_reason', c.removed_reason) order by c.id desc), '[]'::jsonb)
      from (select * from public.rp_community_comments where removed = p_removed order by id desc limit 400) c join public.rp_community_profiles pr on pr.account_id = c.author where c.body ilike v_q or pr.username ilike v_q limit least(greatest(p_limit, 1), 100));
  end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'text', p.body, 'image', p.image_url, 'author', pr.username, 'created_at', p.created_at, 'removed', p.removed, 'removed_reason', p.removed_reason, 'pinned', p.pinned,
      'likes', (select count(*) from public.rp_community_likes l where l.post_id = p.id), 'comments', (select count(*) from public.rp_community_comments c where c.post_id = p.id and not c.removed)) order by p.id desc), '[]'::jsonb)
    from (select * from public.rp_community_posts where removed = p_removed order by id desc limit 400) p join public.rp_community_profiles pr on pr.account_id = p.author where p.body ilike v_q or pr.username ilike v_q limit least(greatest(p_limit, 1), 100));
end $$;

create or replace function public.rp_mod_remove(p_type text, p_id bigint, p_reason text default '') returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin perform public.rp_community_remove_item(p_type, p_id, p_reason); end $$;

create or replace function public.rp_mod_restore(p_type text, p_id bigint) returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_owner uuid;
begin
  perform public.rp_community_require_mod();
  if p_type = 'post' then update public.rp_community_posts set removed = false, removed_reason = null, removed_by = null where id = p_id and removed returning author into v_owner;
  elsif p_type = 'comment' then update public.rp_community_comments set removed = false, removed_reason = null, removed_by = null where id = p_id and removed returning author into v_owner;
  else raise exception 'Unknown type'; end if;
  if v_owner is null then raise exception 'Nothing to restore'; end if;
  perform public.rp_community_notice(v_owner, 'restored', 'A moderator restored your ' || p_type || '.');
  perform public.rp_community_audit('community_restored_' || p_type, v_owner, jsonb_build_object('id', p_id));
end $$;

create or replace function public.rp_mod_pin(p_id bigint, p_on boolean) returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_owner uuid;
begin
  perform public.rp_community_require_mod();
  if p_on and (select count(*) from public.rp_community_posts where pinned and not removed) >= 3 then raise exception 'Only 3 posts can be pinned. Unpin one first'; end if;
  update public.rp_community_posts set pinned = p_on where id = p_id and not removed returning author into v_owner;
  if v_owner is null then raise exception 'Post not found'; end if;
  perform public.rp_community_audit(case when p_on then 'community_pinned' else 'community_unpinned' end, v_owner, jsonb_build_object('id', p_id));
end $$;

create or replace function public.rp_mod_member(p_username text) returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_p public.rp_community_profiles%rowtype; v_r public.rp_community_restrictions%rowtype;
begin
  perform public.rp_community_require_mod();
  select * into v_p from public.rp_community_profiles where lower(username) = lower(trim(coalesce(p_username, '')));
  if not found then return null; end if;
  select * into v_r from public.rp_community_restrictions where account_id = v_p.account_id;
  return jsonb_build_object('username', v_p.username, 'emoji', v_p.emoji, 'bio', v_p.bio, 'joined', v_p.created_at, 'staff', public.rp_community_is_staff(v_p.account_id),
    'restriction', case when v_r.account_id is null then null else jsonb_build_object('kind', v_r.kind, 'until', v_r.until, 'reason', v_r.reason, 'active', v_r.until is null or v_r.until > now(), 'set_at', v_r.set_at) end,
    'posts', (select count(*) from public.rp_community_posts where author = v_p.account_id), 'removed_posts', (select count(*) from public.rp_community_posts where author = v_p.account_id and removed),
    'comments', (select count(*) from public.rp_community_comments where author = v_p.account_id),
    'reports_against', (select count(*) from public.rp_community_reports r where (r.target_type = 'user' and r.target_id = lower(v_p.username)) or (r.target_type = 'post' and r.target_id in (select id::text from public.rp_community_posts where author = v_p.account_id)) or (r.target_type = 'comment' and r.target_id in (select id::text from public.rp_community_comments where author = v_p.account_id))),
    'recent', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'text', left(body, 160), 'removed', removed, 'created_at', created_at) order by id desc), '[]'::jsonb) from (select * from public.rp_community_posts where author = v_p.account_id order by id desc limit 8) x),
    'notices', (select coalesce(jsonb_agg(jsonb_build_object('kind', kind, 'message', message, 'created_at', created_at) order by id desc), '[]'::jsonb) from (select * from public.rp_community_notices where account_id = v_p.account_id order by id desc limit 8) y));
end $$;

create or replace function public.rp_mod_restrictions() returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform public.rp_community_require_mod();
  return (select coalesce(jsonb_agg(jsonb_build_object('username', p.username, 'kind', r.kind, 'until', r.until, 'reason', r.reason, 'set_at', r.set_at) order by r.set_at desc), '[]'::jsonb)
    from public.rp_community_restrictions r join public.rp_community_profiles p on p.account_id = r.account_id where r.until is null or r.until > now());
end $$;

create or replace function public.rp_mod_restrict(p_username text, p_kind text, p_hours int default null, p_reason text default '', p_purge boolean default false) returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_t uuid;
begin
  perform public.rp_community_require_mod();
  select account_id into v_t from public.rp_community_profiles where lower(username) = lower(trim(coalesce(p_username, '')));
  if v_t is null then raise exception 'No Community member with that username'; end if;
  perform public.rp_community_apply_restriction(v_t, p_kind, p_hours, p_reason, coalesce(p_purge, false));
end $$;

create or replace function public.rp_mod_unrestrict(p_username text) returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_t uuid;
begin
  perform public.rp_community_require_mod();
  select account_id into v_t from public.rp_community_profiles where lower(username) = lower(trim(coalesce(p_username, '')));
  if v_t is null then raise exception 'No Community member with that username'; end if;
  delete from public.rp_community_restrictions where account_id = v_t;
  if not found then raise exception 'That member has no restriction'; end if;
  perform public.rp_community_notice(v_t, 'lifted', 'Your Community restriction was lifted.');
  perform public.rp_community_audit('community_restriction_lifted', v_t, '{}'::jsonb);
end $$;

create or replace function public.rp_mod_warn(p_username text, p_message text) returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_t uuid;
begin
  perform public.rp_community_require_mod();
  if char_length(trim(coalesce(p_message, ''))) not between 3 and 250 then raise exception 'Write a warning of 3 to 250 characters'; end if;
  select account_id into v_t from public.rp_community_profiles where lower(username) = lower(trim(coalesce(p_username, '')));
  if v_t is null then raise exception 'No Community member with that username'; end if;
  perform public.rp_community_notice(v_t, 'warning', 'Community warning: ' || trim(p_message));
  perform public.rp_community_audit('community_warned', v_t, jsonb_build_object('note', left(trim(p_message), 200)));
end $$;

create or replace function public.rp_mod_set_settings(p_slow int, p_read_only boolean, p_images boolean, p_announcement text) returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform public.rp_community_require_mod();
  if p_slow is null or p_slow not between 0 and 3600 then raise exception 'Slow mode must be 0 to 3600 seconds'; end if;
  if char_length(coalesce(p_announcement, '')) > 300 then raise exception 'Announcement is limited to 300 characters'; end if;
  update public.rp_community_settings set slow_mode_seconds = p_slow, read_only = coalesce(p_read_only, false), images_allowed = coalesce(p_images, true), announcement = trim(coalesce(p_announcement, '')), updated_at = now() where id = 1;
  perform public.rp_community_audit('community_settings_changed', null, jsonb_build_object('slow', p_slow, 'read_only', p_read_only, 'images', p_images, 'announcement', left(coalesce(p_announcement, ''), 100)));
end $$;

create or replace function public.rp_mod_words() returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
begin perform public.rp_community_require_mod(); return (select coalesce(jsonb_agg(word order by word), '[]'::jsonb) from public.rp_community_words); end $$;
create or replace function public.rp_mod_word_add(p_word text) returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v text := lower(trim(coalesce(p_word, '')));
begin
  perform public.rp_community_require_mod();
  if char_length(v) not between 2 and 40 then raise exception 'Words must be 2 to 40 characters'; end if;
  if (select count(*) from public.rp_community_words) >= 500 then raise exception 'The word list is full (500)'; end if;
  insert into public.rp_community_words(word) values (v) on conflict do nothing;
  perform public.rp_community_audit('community_word_added', null, jsonb_build_object('word', v));
end $$;
create or replace function public.rp_mod_word_remove(p_word text) returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin perform public.rp_community_require_mod(); delete from public.rp_community_words where word = lower(trim(coalesce(p_word, ''))); perform public.rp_community_audit('community_word_removed', null, jsonb_build_object('word', lower(trim(coalesce(p_word, ''))))); end $$;

create or replace function public.rp_mod_log(p_limit int default 100) returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform public.rp_community_require_mod();
  return (select coalesce(jsonb_agg(to_jsonb(t) order by t.id desc), '[]'::jsonb) from (
    select l.id, l.action, l.details, l.created_at, (select username from public.rp_accounts where id = l.actor) as actor, (select username from public.rp_accounts where account_number = l.target_account) as target
    from public.rp_audit_log l where l.action like 'community\_%' order by l.id desc limit least(greatest(coalesce(p_limit, 100), 1), 200)) t);
end $$;

/* ---------------- permissions ---------------- */
do $$ declare f record; begin
  for f in select p.oid::regprocedure as sig, p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and (p.proname like 'rp\_community\_%' or p.proname like 'rp\_mod\_%') loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
  end loop;
end $$;
grant execute on function public.rp_community_settings_public() to anon, authenticated;
grant execute on function public.rp_community_feed(text, bigint, int, text, text, text) to anon, authenticated;
grant execute on function public.rp_community_comments(bigint) to anon, authenticated;
grant execute on function public.rp_community_profile(text) to anon, authenticated;
grant execute on function public.rp_community_people(text) to anon, authenticated;
grant execute on function public.rp_community_me() to authenticated;
grant execute on function public.rp_community_set_profile(text, text) to authenticated;
grant execute on function public.rp_community_notifications() to authenticated;
grant execute on function public.rp_community_mark_seen() to authenticated;
grant execute on function public.rp_community_post(text, text) to authenticated;
grant execute on function public.rp_community_edit_post(bigint, text) to authenticated;
grant execute on function public.rp_community_comment(bigint, text, bigint) to authenticated;
grant execute on function public.rp_community_delete_own(text, bigint) to authenticated;
grant execute on function public.rp_community_like(bigint, boolean) to authenticated;
grant execute on function public.rp_community_save(bigint, boolean) to authenticated;
grant execute on function public.rp_community_follow(text, boolean) to authenticated;
grant execute on function public.rp_community_report(text, text, text, text) to authenticated;
grant execute on function public.rp_mod_overview() to authenticated;
grant execute on function public.rp_mod_reports(text, int) to authenticated;
grant execute on function public.rp_mod_resolve_report(bigint, text, text, int) to authenticated;
grant execute on function public.rp_mod_content(text, text, boolean, int) to authenticated;
grant execute on function public.rp_mod_remove(text, bigint, text) to authenticated;
grant execute on function public.rp_mod_restore(text, bigint) to authenticated;
grant execute on function public.rp_mod_pin(bigint, boolean) to authenticated;
grant execute on function public.rp_mod_member(text) to authenticated;
grant execute on function public.rp_mod_restrictions() to authenticated;
grant execute on function public.rp_mod_restrict(text, text, int, text, boolean) to authenticated;
grant execute on function public.rp_mod_unrestrict(text) to authenticated;
grant execute on function public.rp_mod_warn(text, text) to authenticated;
grant execute on function public.rp_mod_set_settings(int, boolean, boolean, text) to authenticated;
grant execute on function public.rp_mod_words() to authenticated;
grant execute on function public.rp_mod_word_add(text) to authenticated;
grant execute on function public.rp_mod_word_remove(text) to authenticated;
grant execute on function public.rp_mod_log(int) to authenticated;
