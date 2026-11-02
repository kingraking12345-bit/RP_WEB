"use strict";
/* RAKING PRODUCTIONS API  (one dependency: "pg", the PostgreSQL driver; everything else is built into Node)

   Website (GitHub Pages)  ->  this server  ->  PostgreSQL

   It answers the same URLs the pages already use:
     POST /auth/v1/signup | /auth/v1/token | /auth/v1/logout     GET /auth/v1/user
     POST /rest/v1/rpc/<function>        calls a database function as the signed-in user
     GET  /rest/v1/<table>?select=..&col=eq.x&order=..&limit=..  reads a table (row-level security applies)

   Every request runs in one transaction as the database role "anon" or "authenticated", with the caller's id set,
   so the row-level-security rules and grants written in the SQL files are what really protect the data. */
const http = require("http");
const crypto = require("crypto");
const { Pool } = require("pg");

/* ------------------------------ configuration ------------------------------ */
const env = process.env;
const ACCESS_SECONDS = 7 * 24 * 3600, REFRESH_SECONDS = 60 * 24 * 3600;
function readConfig() {
  const c = {
    port: Number(env.PORT || 3000),
    databaseUrl: env.DATABASE_URL,
    secret: env.JWT_SECRET || "",
    origins: String(env.ALLOWED_ORIGINS || "").split(",").map(s => s.trim().replace(/\/+$/, "")).filter(Boolean),
    maxBody: Number(env.MAX_BODY_MB || 20) * 1024 * 1024,
    proxyHops: env.TRUST_PROXY === undefined ? 1 : Number(env.TRUST_PROXY) || 0,
    poolMax: Number(env.PG_POOL_MAX || 8)
  };
  if (!c.databaseUrl) throw new Error("DATABASE_URL is not set.");
  if (c.secret.length < 32) throw new Error("JWT_SECRET must be at least 32 characters. Make one with: node -e \"console.log(require('crypto').randomBytes(48).toString('hex'))\"");
  return c;
}

/* ------------------------------ small helpers ------------------------------ */
class HttpError extends Error { constructor(status, message, code) { super(message); this.status = status; this.code = code || ""; } }
const ident = s => '"' + String(s).replace(/"/g, '""') + '"';
const IDENT_RE = /^[a-z_][a-z0-9_]{0,62}$/;
const b64u = v => Buffer.from(v).toString("base64url");

function errorReply(err, role) {
  if (err instanceof HttpError) return { status: err.status, body: { message: err.message, code: err.code, details: null, hint: null } };
  const c = err && err.code ? String(err.code) : "";
  let status = 500, message = "Internal server error";
  if (c === "P0001") { status = 400; message = err.message; }                                       // raise exception 'text' inside a function
  else if (c === "42501") { status = role === "anon" ? 401 : 403; message = err.message; }          // permission denied
  else if (c === "23505" || c === "23503") { status = 409; message = err.message; }                  // unique / foreign key
  else if (c.startsWith("22") || c.startsWith("23")) { status = 400; message = err.message; }        // bad value / constraint
  else if (c === "42883" || c === "42P01" || c === "42703") { status = 404; message = err.message; } // missing function / table / column
  else if (c === "57014") { status = 408; message = "The request took too long"; }
  else console.error("[error]", c, err && err.message);
  return { status, body: { message, code: c || "500", details: null, hint: null } };
}

/* ------------------------------ passwords (scrypt) ------------------------------ */
const scrypt = (pw, salt) => new Promise((ok, bad) => crypto.scrypt(pw, salt, 64, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }, (e, k) => e ? bad(e) : ok(k)));
let busy = 0; const waiting = [];
async function slot() { if (busy >= 4) await new Promise(r => waiting.push(r)); busy++; return () => { busy--; const n = waiting.shift(); if (n) n(); }; } // at most 4 hashes at once
async function hashPassword(pw) { const free = await slot(); try { const salt = crypto.randomBytes(16); return "scrypt$" + salt.toString("base64") + "$" + (await scrypt(pw, salt)).toString("base64"); } finally { free(); } }
async function checkPassword(pw, stored) {
  const parts = String(stored || "").split("$"); if (parts[0] !== "scrypt" || parts.length !== 3) return false;
  const free = await slot();
  try { const key = await scrypt(pw, Buffer.from(parts[1], "base64")), want = Buffer.from(parts[2], "base64"); return key.length === want.length && crypto.timingSafeEqual(key, want); } finally { free(); }
}
let dummyHash = null; // so "no such user" takes as long as "wrong password"
const getDummyHash = async () => dummyHash || (dummyHash = await hashPassword("dummy-password-for-timing"));

/* ------------------------------ tokens (HS256 JWT) ------------------------------ */
function makeTokens(secret) {
  const sign = (payload, seconds) => {
    const now = Math.floor(Date.now() / 1000), data = b64u(JSON.stringify({ alg: "HS256", typ: "JWT" })) + "." + b64u(JSON.stringify({ ...payload, iat: now, exp: now + seconds }));
    return data + "." + crypto.createHmac("sha256", secret).update(data).digest("base64url");
  };
  const verify = token => {
    const p = String(token).split("."); if (p.length !== 3) throw new Error("malformed");
    const head = JSON.parse(Buffer.from(p[0], "base64url").toString());
    if (head.alg !== "HS256") throw new Error("bad alg");
    const want = crypto.createHmac("sha256", secret).update(p[0] + "." + p[1]).digest(), got = Buffer.from(p[2], "base64url");
    if (want.length !== got.length || !crypto.timingSafeEqual(want, got)) throw new Error("bad signature");
    const body = JSON.parse(Buffer.from(p[1], "base64url").toString());
    if (typeof body.exp !== "number" || body.exp <= Date.now() / 1000) { const e = new Error("expired"); e.expired = true; throw e; }
    return body;
  };
  return { sign, verify };
}

/* ------------------------------ tiny in-memory rate limiter ------------------------------ */
function limiter(max, windowMs) {
  const hits = new Map();
  setInterval(() => { const t = Date.now(); for (const [k, v] of hits) if (v.reset <= t) hits.delete(k); }, 60000).unref();
  return key => { const t = Date.now(); let h = hits.get(key); if (!h || h.reset <= t) { h = { n: 0, reset: t + windowMs }; hits.set(key, h); } h.n++; return h.n <= max; };
}

/* ------------------------------ the app ------------------------------ */
function createApp(cfg) {
  const pool = new Pool({ connectionString: cfg.databaseUrl, max: cfg.poolMax, idleTimeoutMillis: 30000, connectionTimeoutMillis: 15000 });
  pool.on("error", e => console.error("[pg pool]", e.message));
  const tokens = makeTokens(cfg.secret);
  const loginOk = limiter(30, 15 * 60 * 1000), signupOk = limiter(12, 60 * 60 * 1000);

  function publicUser(u) { return { id: u.id, aud: "authenticated", role: "authenticated", email: u.email, user_metadata: u.raw_user_meta_data || {}, app_metadata: { provider: "email" }, created_at: u.created_at }; }
  function issueSession(u) {
    return {
      access_token: tokens.sign({ sub: u.id, role: "authenticated", aud: "authenticated", typ: "access", sv: u.session_version, email: u.email }, ACCESS_SECONDS),
      token_type: "bearer", expires_in: ACCESS_SECONDS, expires_at: Math.floor(Date.now() / 1000) + ACCESS_SECONDS,
      refresh_token: tokens.sign({ sub: u.id, typ: "refresh", sv: u.session_version }, REFRESH_SECONDS), user: publicUser(u)
    };
  }
  /* Claims of the Bearer token, or null when none was sent.
     strict=false (database reads and functions): an unknown/expired token simply counts as "not signed in", so public pages keep working
     (some pages send the old public key as a Bearer token). Anything that needs a signed-in user then fails with "permission denied". */
  function readToken(req, strict) {
    const m = /^Bearer\s+(.+)$/i.exec(req.headers.authorization || ""); if (!m) return null;
    let p; try { p = tokens.verify(m[1]); } catch (e) { if (!strict) return null; throw new HttpError(401, e.expired ? "JWT expired" : "Invalid token", "PGRST301"); }
    if (p.typ !== "access" || !p.sub) { if (!strict) return null; throw new HttpError(401, "Invalid token", "PGRST301"); }
    return p;
  }

  /* One transaction per request: check the session is still valid, become anon/authenticated, tell the database who is calling. */
  async function asRole(claims, fn, opts) {
    const role = claims ? "authenticated" : "anon", client = await pool.connect();
    try {
      await client.query("BEGIN");
      if (claims) {
        const ok = await client.query("select 1 from auth.users where id = $1 and session_version = $2", [claims.sub, claims.sv]);
        if (!ok.rowCount) throw new HttpError(401, "Session ended. Please sign in again.", "PGRST301");
      }
      await client.query(role === "authenticated" ? "SET LOCAL ROLE authenticated" : "SET LOCAL ROLE anon");
      await client.query("SET LOCAL statement_timeout = '20s'");
      if (opts && opts.readOnly) await client.query("SET TRANSACTION READ ONLY");
      const jc = claims ? { sub: claims.sub, role: "authenticated", email: claims.email } : { role: "anon" };
      await client.query("select set_config('request.jwt.claims', $1, true), set_config('request.jwt.claim.sub', $2, true), set_config('request.jwt.claim.role', $3, true)", [JSON.stringify(jc), claims ? claims.sub : "", role]);
      const out = await fn(client);
      await client.query("COMMIT");
      return out;
    } catch (e) { try { await client.query("ROLLBACK"); } catch (_) { /* ignore */ } throw e; }
    finally { client.release(); }
  }

  /* ---- catalog: which functions / tables exist (refreshed when something is missing, so SQL changes need no restart) ---- */
  let FUNCS = new Map(), TABLES = new Map(), catalogAt = 0;
  async function loadCatalog() {
    const f = await pool.query(`
      select p.proname, p.proretset, rt.typtype, p.prorettype::regtype::text as rettype,
        (select coalesce(jsonb_agg(jsonb_build_object('name', u.n, 'type', format_type(u.ty, null)) order by u.ord), '[]'::jsonb)
           from unnest(coalesce(p.proallargtypes, p.proargtypes::oid[]), p.proargnames, p.proargmodes) with ordinality as u(ty, n, m, ord)
          where coalesce(u.m, 'i') in ('i', 'b', 'v') and u.n is not null) as args
      from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace join pg_type rt on rt.oid = p.prorettype
      where ns.nspname = 'public' and p.prokind = 'f' and p.proname like 'rp\\_%'`);
    const fm = new Map(); for (const r of f.rows) { if (!fm.has(r.proname)) fm.set(r.proname, []); fm.get(r.proname).push(r); }
    const t = await pool.query(`
      select c.relname, a.attname from pg_class c join pg_namespace n on n.oid = c.relnamespace
      join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
      where n.nspname = 'public' and c.relkind in ('r', 'v', 'm', 'p') and c.relname like 'rp\\_%'`);
    const tm = new Map(); for (const r of t.rows) { if (!tm.has(r.relname)) tm.set(r.relname, new Set()); tm.get(r.relname).add(r.attname); }
    FUNCS = fm; TABLES = tm; catalogAt = Date.now();
  }
  async function ensureCatalog(missing) { if (!catalogAt || (missing && Date.now() - catalogAt > 10000)) await loadCatalog(); }

  /* ---- POST /rest/v1/rpc/<function> ---- */
  function castParam(type, value) {
    const t = String(type);
    if (value === null || value === undefined) return { sql: `NULL::${t}` };
    if (t === "jsonb" || t === "json") return { sql: `$#::${t}`, val: JSON.stringify(value) };
    if (t.endsWith("[]")) {
      if (!Array.isArray(value)) throw new HttpError(400, "Expected a list for a " + t + " value", "22P02");
      return { sql: `$#::${t}`, val: value.map(v => (v !== null && typeof v === "object") ? JSON.stringify(v) : v) };
    }
    if (typeof value === "object") throw new HttpError(400, "Expected a simple value for a " + t + " argument", "22P02");
    return { sql: `$#::${t}`, val: String(value) };
  }
  async function rpc(name, body, ctx, req) {
    const notFound = () => new HttpError(404, `Could not find the function public.${name} in the schema cache`, "PGRST202");
    if (!/^rp_[a-z0-9_]{1,80}$/.test(name)) throw notFound();
    await ensureCatalog(false); if (!FUNCS.has(name)) await ensureCatalog(true);
    const cands = FUNCS.get(name); if (!cands) throw notFound();
    const args = body && typeof body === "object" && !Array.isArray(body) ? body : {}, keys = Object.keys(args);
    const fn = cands.find(c => keys.every(k => c.args.some(a => a.name === k)));   // the overload that knows every argument sent
    if (!fn) throw new HttpError(404, `Could not find the function public.${name}(${keys.join(", ")}) in the schema cache`, "PGRST202");
    const claims = readToken(req); if (claims) ctx.role = "authenticated";
    const params = [], parts = [];
    for (const k of keys) {
      const a = fn.args.find(x => x.name === k), c = castParam(a.type, args[k]);
      if (c.val === undefined) parts.push(`${ident(k)} => ${c.sql}`);
      else { params.push(c.val); parts.push(`${ident(k)} => ${c.sql.replace("$#", "$" + params.length)}`); }
    }
    const call = `public.${ident(name)}(${parts.join(", ")})`;
    let sql;
    if (fn.rettype === "void") sql = `select null::jsonb as r from (select ${call}) _v`;
    else if (fn.proretset) sql = (fn.typtype === "c" || fn.rettype === "record")
      ? `select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) as r from ${call} t`
      : `select coalesce(jsonb_agg(to_jsonb(t.v)), '[]'::jsonb) as r from (select ${call} as v) t`;
    else sql = `select to_jsonb(${call}) as r`;
    const out = await asRole(claims, c => c.query(sql, params));
    return out.rows[0] && out.rows[0].r !== undefined ? out.rows[0].r : null;
  }

  /* ---- GET /rest/v1/<table>  (a small PostgREST-compatible subset) ---- */
  const OPS = { eq: "=", neq: "<>", gt: ">", gte: ">=", lt: "<", lte: "<=" };
  function splitList(v) {
    const inner = String(v).trim().replace(/^\(/, "").replace(/\)$/, ""); if (!inner.trim()) return [];
    return (inner.match(/"(?:[^"\\]|\\.)*"|[^,]+/g) || []).map(s => { s = s.trim(); return s.startsWith('"') ? s.slice(1, -1).replace(/\\(.)/g, "$1") : s; });
  }
  function buildSelect(table, cols, q) {
    const params = [], where = [];
    const need = c => { if (!IDENT_RE.test(c) || !cols.has(c)) throw new HttpError(400, `column "${c}" does not exist on table ${table}`, "42703"); return ident(c); };
    let sel = "*"; const rawSel = q.get("select");
    if (rawSel && rawSel !== "*") {
      if (/[()!:]/.test(rawSel)) throw new HttpError(400, "Embedded selects are not supported here", "PGRST100");
      sel = rawSel.split(",").map(s => s.trim()).filter(Boolean).map(c => c === "*" ? "*" : need(c)).join(", ") || "*";
    }
    for (const [k, v] of q.entries()) {
      if (["select", "order", "limit", "offset"].includes(k)) continue;
      if (k === "or" || k === "and") throw new HttpError(400, "or/and filters are not supported here", "PGRST100");
      const m = /^(not\.)?(eq|neq|gt|gte|lt|lte|like|ilike|in|is)\.([\s\S]*)$/.exec(v); if (!m) throw new HttpError(400, `Bad filter for "${k}"`, "PGRST100");
      const col = need(k), neg = !!m[1], op = m[2], val = m[3]; let cond;
      if (op in OPS) { params.push(val); cond = `${col} ${OPS[op]} $${params.length}`; }
      else if (op === "in") { params.push(splitList(val)); cond = `${col}::text = any($${params.length}::text[])`; }
      else if (op === "is") { const lv = val.toLowerCase(); if (!["null", "true", "false", "unknown"].includes(lv)) throw new HttpError(400, "Bad is. filter", "PGRST100"); cond = `${col} is ${lv}`; }
      else { params.push(val.replace(/\*/g, "%")); cond = `${col}::text ${op === "ilike" ? "ilike" : "like"} $${params.length}`; }
      where.push(neg ? `not (${cond})` : cond);
    }
    let order = ""; const rawOrder = q.get("order");
    if (rawOrder) order = " order by " + rawOrder.split(",").map(s => {
      const p = s.trim().split("."), col = need(p[0]), dir = p[1] === "desc" ? "desc" : "asc";
      return `${col} ${dir}${p.includes("nullsfirst") ? " nulls first" : p.includes("nullslast") ? " nulls last" : ""}`;
    }).join(", ");
    const lim = Math.min(1000, Math.max(0, parseInt(q.get("limit") || "1000", 10) || 0)), off = Math.max(0, parseInt(q.get("offset") || "0", 10) || 0);
    return { params, sql: `select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) as r from (select ${sel} from public.${ident(table)}${where.length ? " where " + where.join(" and ") : ""}${order} limit ${lim} offset ${off}) t` };
  }
  async function readTable(table, url, req, ctx) {
    const notFound = () => new HttpError(404, `relation "public.${table}" does not exist`, "42P01");
    if (!/^rp_[a-z0-9_]{1,80}$/.test(table)) throw notFound();
    await ensureCatalog(false); if (!TABLES.has(table)) await ensureCatalog(true);
    const cols = TABLES.get(table); if (!cols) throw notFound();
    const claims = readToken(req); if (claims) ctx.role = "authenticated";
    const { sql, params } = buildSelect(table, cols, url.searchParams);
    const rows = (await asRole(claims, c => c.query(sql, params), { readOnly: true })).rows[0].r;
    if (/application\/vnd\.pgrst\.object\+json/.test(req.headers.accept || "")) {
      if (rows.length !== 1) throw new HttpError(406, "JSON object requested, multiple (or no) rows returned", "PGRST116");
      return rows[0];
    }
    return rows;
  }

  /* ---- auth ---- */
  const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}$/;
  async function signup(body) {
    const email = String(body.email || "").trim().toLowerCase(), pw = String(body.password || "");
    const meta = body.data && typeof body.data === "object" ? body.data : {};
    const username = typeof meta.username === "string" ? meta.username.trim().slice(0, 48) : "";
    if (!EMAIL_RE.test(email)) throw new HttpError(422, "Signup requires a valid email", "validation_failed");
    if (pw.length < 10) throw new HttpError(422, "Password should be at least 10 characters.", "weak_password");
    if (pw.length > 200) throw new HttpError(422, "Password is too long.", "weak_password");
    if (username.length < 3) throw new HttpError(422, "Username must be at least 3 characters.", "validation_failed");
    const hash = await hashPassword(pw);
    try {
      const r = await pool.query("insert into auth.users(email, encrypted_password, raw_user_meta_data, last_sign_in_at) values ($1, $2, $3::jsonb, now()) returning *", [email, hash, JSON.stringify({ username })]);
      return issueSession(r.rows[0]);
    } catch (e) { if (e.code === "23505") throw new HttpError(422, "User already registered", "user_already_exists"); throw e; }
  }
  async function token(grant, body) {
    if (grant === "password") {
      const email = String(body.email || "").trim().toLowerCase(), pw = String(body.password || "");
      if (pw.length > 200) throw new HttpError(400, "Invalid login credentials", "invalid_credentials");
      const u = (await pool.query("select * from auth.users where lower(email) = $1", [email])).rows[0];
      const ok = await checkPassword(pw, u ? u.encrypted_password : await getDummyHash());
      if (!u || !ok) throw new HttpError(400, "Invalid login credentials", "invalid_credentials");
      pool.query("update auth.users set last_sign_in_at = now() where id = $1", [u.id]).catch(() => {});
      return issueSession(u);
    }
    if (grant === "refresh_token") {
      let p; try { p = tokens.verify(String(body.refresh_token || "")); } catch (e) { throw new HttpError(400, "Invalid Refresh Token", "refresh_token_not_found"); }
      if (p.typ !== "refresh") throw new HttpError(400, "Invalid Refresh Token", "refresh_token_not_found");
      const u = (await pool.query("select * from auth.users where id = $1 and session_version = $2", [p.sub, p.sv])).rows[0];
      if (!u) throw new HttpError(400, "Invalid Refresh Token", "refresh_token_not_found");
      return issueSession(u);
    }
    throw new HttpError(400, "Unsupported grant_type", "validation_failed");
  }

  /* ---- http plumbing ---- */
  const clientIp = req => {
    const xff = String(req.headers["x-forwarded-for"] || "").split(",").map(s => s.trim()).filter(Boolean);
    return cfg.proxyHops > 0 && xff.length ? xff[Math.max(0, xff.length - cfg.proxyHops)] : req.socket.remoteAddress || "?";
  };
  function readBody(req) {
    return new Promise((ok, bad) => {
      if (req.method !== "POST") return ok({});
      const chunks = []; let n = 0;
      req.on("data", c => { n += c.length; if (n > cfg.maxBody) { bad(new HttpError(413, "That is too large to save in one go.", "413")); req.destroy(); } else chunks.push(c); });
      req.on("end", () => { if (!n) return ok({}); try { ok(JSON.parse(Buffer.concat(chunks).toString("utf8"))); } catch (e) { bad(new HttpError(400, "Invalid JSON", "400")); } });
      req.on("error", bad);
    });
  }
  function send(res, status, body) {
    if (status === 204) { res.writeHead(204); return res.end(); }
    const data = JSON.stringify(body === undefined ? null : body);
    res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Content-Length": Buffer.byteLength(data) }); res.end(data);
  }

  async function route(req, res, ctx) {
    const url = new URL(req.url, "http://x"), path = url.pathname.replace(/\/+$/, "") || "/", m = req.method;
    let x;
    if (m === "GET" && path === "/") return send(res, 200, { ok: true, service: "rp-api" });
    if (m === "GET" && path === "/health") { await pool.query("select 1"); return send(res, 200, { ok: true }); }

    if (m === "POST" && path === "/auth/v1/signup") {
      if (!signupOk(clientIp(req))) throw new HttpError(429, "Too many new accounts from this connection. Try again later.", "429");
      return send(res, 200, await signup(await readBody(req)));
    }
    if (m === "POST" && path === "/auth/v1/token") {
      if (!loginOk(clientIp(req))) throw new HttpError(429, "Too many attempts. Please wait a few minutes and try again.", "429");
      return send(res, 200, await token(url.searchParams.get("grant_type"), await readBody(req)));
    }
    if (m === "GET" && path === "/auth/v1/user") {
      const p = readToken(req, true); if (!p) throw new HttpError(401, "Not signed in", "no_authorization");
      const u = (await pool.query("select * from auth.users where id = $1 and session_version = $2", [p.sub, p.sv])).rows[0];
      if (!u) throw new HttpError(401, "Session ended. Please sign in again.", "PGRST301");
      return send(res, 200, publicUser(u));
    }
    /* scope=local: nothing to do on the server. scope=global: every session (this one too) ends.
       scope=others: all other sessions end, and this one gets a fresh token so the browser stays signed in. */
    if (m === "POST" && path === "/auth/v1/logout") {
      const p = readToken(req, true); const scope = url.searchParams.get("scope") || "global";
      if (!p || scope === "local") return send(res, 204);
      const u = (await pool.query("update auth.users set session_version = session_version + 1, updated_at = now() where id = $1 and session_version = $2 returning *", [p.sub, p.sv])).rows[0];
      if (!u) throw new HttpError(401, "Session ended. Please sign in again.", "PGRST301");
      return scope === "others" ? send(res, 200, issueSession(u)) : send(res, 204);
    }
    if (m === "POST" && (x = /^\/rest\/v1\/rpc\/([^/]+)$/.exec(path))) return send(res, 200, await rpc(decodeURIComponent(x[1]), await readBody(req), ctx, req));
    if (m === "GET" && (x = /^\/rest\/v1\/([^/]+)$/.exec(path))) return send(res, 200, await readTable(decodeURIComponent(x[1]), url, req, ctx));
    throw new HttpError(404, "Not found", "404");
  }

  const server = http.createServer(async (req, res) => {
    const origin = String(req.headers.origin || "").replace(/\/+$/, "");
    res.setHeader("X-Content-Type-Options", "nosniff"); res.setHeader("Cache-Control", "no-store"); res.setHeader("Referrer-Policy", "no-referrer");
    if (origin && cfg.origins.includes(origin)) { res.setHeader("Access-Control-Allow-Origin", origin); res.setHeader("Vary", "Origin"); }
    if (req.method === "OPTIONS") {
      if (origin && cfg.origins.includes(origin)) { res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS"); res.setHeader("Access-Control-Allow-Headers", "authorization, content-type, apikey, accept, prefer, x-client-info"); res.setHeader("Access-Control-Max-Age", "86400"); }
      return send(res, 204);
    }
    const ctx = { role: "anon" };
    try { await route(req, res, ctx); }
    catch (e) { if (res.headersSent) return res.destroy(); const r = errorReply(e, ctx.role); send(res, r.status, r.body); }
  });
  server.keepAliveTimeout = 65000;
  return { server, pool, loadCatalog, stats: () => ({ functions: FUNCS.size, tables: TABLES.size }) };
}

/* ------------------------------ start ------------------------------ */
async function main() {
  let cfg; try { cfg = readConfig(); } catch (e) { console.error(e.message); process.exit(1); }
  if (!cfg.origins.length) console.warn("WARNING: ALLOWED_ORIGINS is empty. Browsers will be blocked until you add your website address.");
  const app = createApp(cfg);
  try { await app.loadCatalog(); } catch (e) { console.error("Cannot reach the database:", e.message); process.exit(1); }
  const has = (await app.pool.query("select to_regclass('auth.users') as t")).rows[0].t;
  if (!has) { console.error("The database is empty. Run:  npm run migrate"); process.exit(1); }
  const s = app.stats(); console.log(`Database OK: ${s.functions} functions, ${s.tables} tables.`);
  app.server.listen(cfg.port, () => console.log(`RP API listening on port ${cfg.port}`));
  const stop = () => { app.server.close(() => app.pool.end().then(() => process.exit(0))); setTimeout(() => process.exit(0), 8000).unref(); };
  process.on("SIGTERM", stop); process.on("SIGINT", stop);
  process.on("unhandledRejection", e => console.error("[unhandledRejection]", e));
}
if (require.main === module) main(); else module.exports = { createApp, readConfig };
