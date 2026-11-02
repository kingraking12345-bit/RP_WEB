"use strict";
/* Sets up (or updates) the database. Safe to run again: every file uses "create ... if not exists" / "create or replace".
   Usage:  npm run migrate          (reads DATABASE_URL from .env)
           node migrate.js --check  (only tests the connection) */
const fs = require("fs"), path = require("path");
const { Client } = require("pg");
const root = path.resolve(__dirname, "..");
const FILES = [
  "server/sql/00-compat.sql", "server/sql/01-account-system.sql",
  "index/account-claim.sql", "index/site-code.sql", "index/games-content.sql", "index/games-paid-tabs.sql", "index/tools-content.sql",
  "index/music-content.sql", "index/education-content.sql", "index/skills-content.sql", "Labs/labs-content.sql",
  "index/community-content.sql", "index/branch-kit.sql", "index/branches.sql"
];
(async () => {
  if (!process.env.DATABASE_URL) { console.error("DATABASE_URL is not set (put it in server/.env)."); process.exit(1); }
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  const v = await c.query("select version() v, current_user u"); console.log("Connected as", v.rows[0].u, "-", v.rows[0].v.split(",")[0]);
  if (process.argv.includes("--check")) return c.end();
  for (const f of FILES) {
    const p = path.join(root, f);
    if (!fs.existsSync(p)) { console.error("Missing file:", f, "(run this from the full project folder)"); process.exit(1); }
    process.stdout.write("  " + f + " ... ");
    try { await c.query("begin"); await c.query(fs.readFileSync(p, "utf8")); await c.query("commit"); console.log("ok"); }
    catch (e) { await c.query("rollback").catch(() => {}); console.log("FAILED"); console.error("\n" + e.message + (e.position ? " (at character " + e.position + ")" : "")); process.exit(1); }
  }
  await c.end(); console.log("Database is ready.");
})().catch(e => { console.error(e.message); process.exit(1); });
