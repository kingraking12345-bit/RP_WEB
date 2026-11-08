/* RP Labs: talks to the RP API for trained results, settings and the Labs inbox.
   Visitors can only ASK what a combination does (lookup). Only Labs employees can teach the lab (train). */
window.RPLabsServer = (() => {
  "use strict";
  const SB_URL = "https://nesxcgymsgegkqjhfydx.supabase.co", SB_KEY = "sb_publishable_Tj4frYyU-iAylsH_--y3Qg_esNYqce-";
  const SESSION_KEY = "sb-nesxcgymsgegkqjhfydx-auth-token";
  const EDITOR_ROLES = ["Creator", "Lab Studio Director", "Lab Scientist", "Labs Employee"];
  const DEFAULTS = {
    labs_open: true, banner: "", banner_tone: "info",
    not_discovered_text: "Not discovered yet. The Labs team has been told about your combination.",
    guest_text: "Sign in to an account so the Labs team knows who found it.",
    starting_money: 50, price_multiplier: 1, max_selection: 4, quiz_reward_both: 25, quiz_reward_one: 10,
    show_daily_experiment: true, sandbox_timeout_ms: 5000,
    tabs: { lab: true, scilabs: true, research: true, library: true, store: true, addmaterial: true, timeskip: true, physicslab: true, materialinfo: true, earn: true }
  };
  const token = () => { try { const s = JSON.parse(localStorage.getItem(SESSION_KEY) || "null"); if (s && typeof s.access_token === "string" && Number(s.expires_at) * 1000 > Date.now()) return s.access_token; } catch { /* none */ } return ""; };
  async function rpc(fn, args) {
    const t = token(), headers = { apikey: SB_KEY, "Content-Type": "application/json", Accept: "application/json" }; if (t) headers.Authorization = "Bearer " + t;
    const r = await fetch(SB_URL + "/rest/v1/rpc/" + fn, { method: "POST", headers, body: JSON.stringify(args || {}), cache: "no-store" });
    let j = null; try { j = await r.json(); } catch { /* empty */ }
    if (!r.ok) { const e = new Error((j && j.message) || "HTTP " + r.status); e.status = r.status; throw e; }
    return j;
  }
  let ctxP = null;
  const context = () => ctxP || (ctxP = (token() ? rpc("rp_get_account_context").catch(() => null) : Promise.resolve(null)));
  async function isEditor() { const c = await context(); return !!(c && c.status === "active" && Array.isArray(c.roles) && c.roles.some(r => EDITOR_ROLES.includes(r))); }
  let setP = null;
  const settings = (fresh) => { if (fresh || !setP) setP = rpc("rp_labs_settings_public").then(s => ({ ...DEFAULTS, ...s, tabs: { ...DEFAULTS.tabs, ...((s && s.tabs) || {}) } })).catch(() => ({ ...DEFAULTS })); return setP; };
  /* Ask the server what a combination does. Returns { found, data } | { found:false, guest|closed|limited|recorded } | { error } */
  async function lookup(kind, key, label, params) {
    try { return await rpc("rp_labs_lookup", { p_kind: kind, p_key: key, p_label: label || "", p_params: params || {} }); }
    catch (e) { return { found: false, error: e.message || "Could not reach the lab server." }; }
  }
  const train = (kind, key, data) => rpc("rp_labs_train", { p_kind: kind, p_key: key, p_data: data });
  const trainMany = items => rpc("rp_labs_train_many", { p_items: items });
  const exportAll = kind => rpc("rp_labs_training_export", { p_kind: kind || null });
  return { rpc, token, context, isEditor, settings, lookup, train, trainMany, exportAll, DEFAULTS, EDITOR_ROLES };
})();
