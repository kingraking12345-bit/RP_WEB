-- RP Creator claim: whoever claims the Creator role FIRST becomes the Creator.
-- Run once in the Supabase SQL Editor AFTER account-system.sql. Safe to run again.
--
--   * rp_creator_exists()  - anyone can ask whether the Creator seat is still unclaimed (true/false only).
--   * rp_claim_creator()   - a signed-in, active account claims it. Allowed only while no Creator exists.
--     It takes the same lock as Creator transfer and the database allows only one Creator row, so two people
--     claiming at the same moment can never both win. The claim is written to the audit log.
--   * After that the Creator role only moves by "Transfer Creator" in the Creator workspace.

create or replace function public.rp_creator_exists()
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists(select 1 from public.rp_accounts where roles @> array['Creator']::text[])
$$;

create or replace function public.rp_claim_creator()
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_account public.rp_accounts%rowtype;
begin
  if v_uid is null then raise exception 'Sign in first'; end if;
  perform pg_advisory_xact_lock(hashtext('rp_creator_transfer'));
  select * into v_account from public.rp_accounts where id = v_uid for update;
  if not found then raise exception 'Account profile is not initialized'; end if;
  if v_account.status <> 'active' then raise exception 'Your account cannot claim the Creator role right now'; end if;
  if exists(select 1 from public.rp_accounts where roles @> array['Creator']::text[]) then
    raise exception 'The Creator role has already been claimed';
  end if;
  update public.rp_accounts set roles = array(select distinct x from unnest(roles || array['Creator']::text[]) x), updated_at = now() where id = v_uid;
  insert into public.rp_audit_log(actor, action, target_account, details)
  values (v_uid, 'creator_claimed', v_account.account_number, jsonb_build_object('method', 'first claim'));
  return public.rp_get_account_context();
end;
$$;

revoke all on function public.rp_creator_exists() from public;
revoke all on function public.rp_claim_creator() from public, anon;
grant execute on function public.rp_creator_exists() to anon, authenticated;
grant execute on function public.rp_claim_creator() to authenticated;
