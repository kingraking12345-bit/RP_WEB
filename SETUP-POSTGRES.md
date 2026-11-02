# RAKING PRODUCTIONS: PostgreSQL setup and GitHub hosting

## How it fits together

```
Visitor's browser ──▶ GitHub Pages (the website: index/, Games/, Tools/ ...)
        │
        └──────────▶ RP API (server/, hosted on Render) ──▶ PostgreSQL (Neon)
```

A web page cannot talk to PostgreSQL directly, and GitHub Pages can only hold files, not run programs. So there is a small
API program in `server/` between the site and the database. The pages still call the same functions as before; only the
address they talk to changed.

| Piece | Where it lives | Cost |
|---|---|---|
| Website | GitHub Pages | free |
| API (`server/`) | Render web service | free (sleeps after 15 min idle; the first visit after a sleep takes about a minute) |
| PostgreSQL | Neon | free (1 GB, no expiry) |

Do not use Render's own free Postgres: it is deleted 30 days after creation.

---

## Part 1: Create the PostgreSQL database (Neon)

1. Go to **neon.com**, sign up, and create a project (any name, e.g. `rp`). Pick the region closest to your visitors.
2. On the project dashboard click **Connect**. Copy the connection string. It looks like
   `postgresql://USER:PASSWORD@ep-xxxx.region.aws.neon.tech/neondb?sslmode=require`. Keep it secret.

Prefer to use PostgreSQL on your own PC instead? Install PostgreSQL 16, create a database named `rp`, and use
`postgresql://postgres:YOURPASSWORD@localhost:5432/rp` (this needs `?sslmode=disable` on the end).

## Part 2: Run everything on your own computer first

You need **Node.js 20.6 or newer** (nodejs.org).

```bash
cd server
npm install
copy .env.example .env        # Mac/Linux: cp .env.example .env
```

Open `server/.env` and fill in:

- `DATABASE_URL`: the string from Part 1.
- `JWT_SECRET`: run `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` and paste the result.
- `ALLOWED_ORIGINS`: leave the localhost values for now.

Create all tables and functions (this runs your SQL files in the right order; it is safe to run again):

```bash
npm run migrate
```

Start the API:

```bash
npm start
```

You should see `Database OK: ... functions` and `RP API listening on port 3000`.
Open `http://localhost:3000/health`. It should show `{"ok":true}`.

In a second terminal, serve the website from the **project root** (the folder that contains `index/`, `Games/`, `server/`):

```bash
python -m http.server 8000
```

Open `http://localhost:8000/index/index.html`. `index/rp-config.js` is already set to `"postgres"` and `http://localhost:3000`.
Create an account, then claim the Creator seat. The first account to claim it becomes the Creator.

Optional self-check of the API: `cd server && npm test` (creates a few throw-away `smoketest-...` accounts).

## Part 3: Put the API on Render

1. Put the project on GitHub first (Part 4, steps 1 and 2), then come back here.
2. On **render.com** choose **New > Web Service**, connect your GitHub repo, and set:
   - **Root Directory:** `server`
   - **Build Command:** `npm install --omit=dev`
   - **Start Command:** `npm start`
   - **Instance type:** Free
3. Under **Environment** add:
   - `DATABASE_URL`: your Neon string
   - `JWT_SECRET`: a long random value (same command as above; use a new one, not your local one)
   - `ALLOWED_ORIGINS`: `https://YOURNAME.github.io` (your GitHub user name, no slash and no repo name at the end)
   - `TRUST_PROXY`: `1`
4. Deploy. Render gives you an address like `https://rp-api.onrender.com`. Check `https://rp-api.onrender.com/health`.

The database tables are created from your PC (Part 2 `npm run migrate` with the Neon string), not by Render.

If visitors start seeing "Too many attempts" while few people are using the site, set `TRUST_PROXY` to `2`.

## Part 4: Host the website on GitHub Pages

1. Create a new repository on github.com (for example `rp-site`). Public is fine; `.env` is excluded by `.gitignore`, so no secrets go up.
2. Before pushing, open `index/rp-config.js` and set your API address:
   ```js
   window.RP_API_URL = "https://rp-api.onrender.com";
   ```
3. Push the project folder (the one containing `index/`, `server/`, `.github/`):
   ```bash
   git init
   git add .
   git commit -m "RP site"
   git branch -M main
   git remote add origin https://github.com/YOURNAME/rp-site.git
   git push -u origin main
   ```
4. In the repo go to **Settings > Pages**, and under **Build and deployment** set **Source** to **GitHub Actions**.
5. Open the **Actions** tab. The workflow "Deploy site to GitHub Pages" runs on every push to `main`. When it turns green your
   site is live at `https://YOURNAME.github.io/rp-site/`.
6. Make sure Render's `ALLOWED_ORIGINS` is exactly `https://YOURNAME.github.io`, then redeploy it if you changed it.

The workflow publishes only the website folders. It leaves out `server/` and the `.sql` files.

Later changes: edit, `git add .`, `git commit`, `git push`. The site updates in about a minute.

## What changed in the project

- `server/` (new): the API (`src/index.js`), the database setup script (`migrate.js`), and two new SQL files:
  `sql/00-compat.sql` (the `anon`/`authenticated` roles and `auth.uid()` that your SQL files expect) and
  `sql/01-account-system.sql` (accounts, roles, Creator actions).
- `index/pg/client.js` (new): replaces the Supabase browser library. It also redirects the old hard-coded database address that
  is still written inside the page scripts to your API, so those scripts did not need editing.
- `index/rp-config.js`: now `RP_BACKEND = "postgres"` and `RP_API_URL`.
- `index/rp-backend.js`: loads the new client instead of the Supabase library. Local test mode still works (`?backend=local`).
- Page messages that mentioned Supabase were reworded. A root `index.html`, `.github/workflows/pages.yml`, `render.yaml` and `.gitignore` were added.

## Things to know

- **`account-system.sql` was not in the zip.** Your README lists it, but the file is missing. I rebuilt it as
  `server/sql/01-account-system.sql` from your local-mode code, so function names, arguments and results match what the pages call.
  If you have the original, compare the two before relying on it.
- **Existing Supabase data is not copied over.** Start with a fresh database. Passwords from Supabase cannot be moved.
- **Passwords** must be at least 10 characters (the sign-up form already asks for this). Sign-in tokens last 7 days and renew themselves.
- **Free-tier sleep:** after 15 minutes without visitors the API sleeps, and the next request waits about a minute.
  A free uptime monitor that opens `/health` every 10 minutes keeps it awake (note that Render gives free services 750 hours per month).
- **Backups:** Neon's free plan has limited history. Before real users arrive, export regularly with `pg_dump "YOUR_NEON_STRING" > backup.sql`.
- **Security:** never put `DATABASE_URL` or `JWT_SECRET` in any file under `index/` or in GitHub. They belong only in Render's Environment page and your local `server/.env`.
