"use strict";
/* End-to-end check of the API against a real database.  Run:  npm test
   Needs DATABASE_URL + JWT_SECRET in .env and a migrated database. It creates a few throw-away "smoketest-..." accounts. */
const test = require("node:test"), assert = require("node:assert/strict");
const { createApp, readConfig } = require("../src/index.js");

let base, app;
const cfg = readConfig(); cfg.origins = ["https://example.github.io"]; cfg.port = 0;
test.before(async () => { app = createApp(cfg); await app.loadCatalog(); await new Promise(r => app.server.listen(0, "127.0.0.1", r)); base = "http://127.0.0.1:" + app.server.address().port; });
test.after(async () => { await new Promise(r => app.server.close(r)); await app.pool.end(); });

const call = async (method, path, { body, token, headers } = {}) => {
  const r = await fetch(base + path, { method, headers: { "content-type": "application/json", ...(token ? { authorization: "Bearer " + token } : {}), ...(headers || {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await r.text(); let json = null; try { json = text ? JSON.parse(text) : null; } catch (e) { /* none */ }
  return { status: r.status, json, headers: r.headers };
};
const stamp = Date.now().toString(36);
const user = n => ({ email: `smoketest-${n}-${stamp}@users.rp.invalid`, password: "correct horse battery", data: { username: `smoketest-${n}-${stamp}` } });

test("health + CORS", async () => {
  assert.equal((await call("GET", "/health")).json.ok, true);
  const pre = await call("OPTIONS", "/rest/v1/rpc/rp_creator_exists", { headers: { origin: "https://example.github.io" } });
  assert.equal(pre.status, 204); assert.equal(pre.headers.get("access-control-allow-origin"), "https://example.github.io");
  const bad = await call("OPTIONS", "/rest/v1/rpc/rp_creator_exists", { headers: { origin: "https://evil.example" } });
  assert.equal(bad.headers.get("access-control-allow-origin"), null);
});

test("anonymous reads: function, table, filters, errors", async () => {
  assert.equal(typeof (await call("POST", "/rest/v1/rpc/rp_creator_exists", { body: {} })).json, "boolean");
  const b = await call("GET", "/rest/v1/rp_branches?select=slug,parent,name,sort&order=sort.asc");
  assert.equal(b.status, 200); assert.ok(Array.isArray(b.json)); assert.ok(b.json.length > 0);
  const one = await call("GET", "/rest/v1/rp_branches?select=slug&slug=eq." + b.json[0].slug + "&limit=1", { headers: { accept: "application/vnd.pgrst.object+json" } });
  assert.equal(one.json.slug, b.json[0].slug);
  assert.equal((await call("GET", "/rest/v1/rp_accounts")).status, 401);            // anon may not read accounts
  assert.equal((await call("GET", "/rest/v1/rp_nope")).status, 404);
  assert.equal((await call("POST", "/rest/v1/rpc/rp_get_account_context", { body: {} })).status, 401);
  assert.equal((await call("GET", "/rest/v1/auth_users")).status, 404);
  assert.equal((await call("GET", "/rest/v1/rp_branches?select=slug;drop")).status, 400);
  assert.equal((await call("GET", "/rest/v1/rp_branches?slug=eq.x%22%20or%201=1")).status, 200);  // injection attempt is just a value
});

test("sign up, sign in, wrong password, duplicates, weak password", async () => {
  const u = user("a");
  assert.equal((await call("POST", "/auth/v1/signup", { body: { ...u, password: "short" } })).status, 422);
  const s = await call("POST", "/auth/v1/signup", { body: u }); assert.equal(s.status, 200); assert.ok(s.json.access_token); assert.ok(s.json.expires_at > Date.now() / 1000);
  assert.equal((await call("POST", "/auth/v1/signup", { body: u })).json.message, "User already registered");
  assert.equal((await call("POST", "/auth/v1/token?grant_type=password", { body: { email: u.email, password: "wrong password!!" } })).status, 400);
  const ok = await call("POST", "/auth/v1/token?grant_type=password", { body: { email: u.email, password: u.password } }); assert.equal(ok.status, 200);
  const ctx = await call("POST", "/rest/v1/rpc/rp_get_account_context", { body: {}, token: ok.json.access_token });
  assert.equal(ctx.status, 200); assert.deepEqual(ctx.json.roles, ["Member"]); assert.equal(ctx.json.status, "active"); assert.equal(typeof ctx.json.account_number, "number");
  const me = await call("GET", "/rest/v1/rp_accounts?select=username", { token: ok.json.access_token });
  assert.equal(me.json.length, 1);                                                  // row-level security: only my own row
  assert.equal((await call("GET", "/auth/v1/user", { token: ok.json.access_token })).json.email, u.email);
  const r = await call("POST", "/auth/v1/token?grant_type=refresh_token", { body: { refresh_token: ok.json.refresh_token } }); assert.equal(r.status, 200);
  assert.equal((await call("POST", "/auth/v1/token?grant_type=refresh_token", { body: { refresh_token: ok.json.access_token } })).status, 400); // an access token is not a refresh token
  assert.equal((await call("GET", "/auth/v1/user", { token: ok.json.access_token + "x" })).status, 401);
});

test("only the Creator can use Creator functions; the Creator seat can be claimed only once", async () => {
  const a = (await call("POST", "/auth/v1/signup", { body: user("b") })).json, b = (await call("POST", "/auth/v1/signup", { body: user("c") })).json;
  assert.equal((await call("POST", "/rest/v1/rpc/rp_creator_overview", { body: {}, token: a.access_token })).json.message, "Creator role required");
  const exists = (await call("POST", "/rest/v1/rpc/rp_creator_exists", { body: {} })).json;
  if (!exists) {
    const claim = await call("POST", "/rest/v1/rpc/rp_claim_creator", { body: {}, token: a.access_token });
    assert.equal(claim.status, 200); assert.ok(claim.json.roles.includes("Creator"));
    assert.equal((await call("POST", "/rest/v1/rpc/rp_claim_creator", { body: {}, token: b.access_token })).json.message, "The Creator role has already been claimed");
    const ov = await call("POST", "/rest/v1/rpc/rp_creator_overview", { body: {}, token: a.access_token });
    assert.equal(ov.status, 200); assert.ok(ov.json.accounts.length >= 2); assert.ok(ov.json.roles.length >= 20);
    const num = ov.json.accounts.find(x => x.username.startsWith("smoketest-c")).account_number;
    const g = await call("POST", "/rest/v1/rpc/rp_set_account_role", { body: { p_account_number: num, p_role_name: "Game Employee", p_grant: true }, token: a.access_token });
    assert.equal(g.status, 200); assert.equal(g.json, null);
    assert.ok((await call("POST", "/rest/v1/rpc/rp_get_account_context", { body: {}, token: b.access_token })).json.roles.includes("Game Employee"));
    assert.equal((await call("POST", "/rest/v1/rpc/rp_set_account_role", { body: { p_account_number: num, p_role_name: "Creator", p_grant: true }, token: a.access_token })).status, 400);
  }
});

test("sign out everywhere / other sessions", async () => {
  const u = user("d"); const s1 = (await call("POST", "/auth/v1/signup", { body: u })).json;
  const s2 = (await call("POST", "/auth/v1/token?grant_type=password", { body: { email: u.email, password: u.password } })).json;
  const fresh = await call("POST", "/auth/v1/logout?scope=others", { token: s2.access_token }); assert.equal(fresh.status, 200);
  assert.equal((await call("POST", "/rest/v1/rpc/rp_get_account_context", { body: {}, token: s1.access_token })).status, 401);   // other session ended
  assert.equal((await call("POST", "/rest/v1/rpc/rp_get_account_context", { body: {}, token: s2.access_token })).status, 401);   // the old token of this session also ended...
  assert.equal((await call("POST", "/rest/v1/rpc/rp_get_account_context", { body: {}, token: fresh.json.access_token })).status, 200); // ...but the fresh one works
  assert.equal((await call("POST", "/auth/v1/logout?scope=global", { token: fresh.json.access_token })).status, 204);
  assert.equal((await call("POST", "/rest/v1/rpc/rp_get_account_context", { body: {}, token: fresh.json.access_token })).status, 401);
});
