# FINALS COMPETE

Hub for the competitive THE FINALS scene: tournaments, teams, matches and results with
traceable sources, social-media news, and prediction markets with **virtual coins only**.

- Results are only "confirmed" when an official source or the tournament database (Liquipedia)
  reports them and no source contradicts them. Social media never sets a result.
- Conflicting sources block automatic settlement until an admin decides, with a cited source.
- Cashout / round-level markets have no reliable data source and are never settled automatically.

## Stack

| Part | Choice | Why |
|---|---|---|
| App | Next.js 16 (App Router, TypeScript) | One codebase for pages, admin and API |
| Database | PostgreSQL 17 (hosted on Neon) | Standard Postgres, `pg_dump` portable |
| ORM / migrations | Drizzle, plain SQL migrations in `drizzle/` | Migrations are readable SQL files |
| Hosting | Vercel | Project transfer between teams is documented |
| Jobs, backups, CI | GitHub Actions | Moves with the repository |

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), [docs/DATA_SOURCES.md](docs/DATA_SOURCES.md),
[docs/BACKUP_RESTORE.md](docs/BACKUP_RESTORE.md), [TRANSFER_GUIDE.md](TRANSFER_GUIDE.md) and
[OWNER_HANDOVER_CHECKLIST.md](OWNER_HANDOVER_CHECKLIST.md).

## Development (in a cloud workspace)

Requirements: Node 22, PostgreSQL 16+. No step needs a specific developer machine.

```bash
npm ci
cp .env.example .env.development.local   # fill in DATABASE_URL and SESSION_SECRET
set -a; . ./.env.development.local; set +a
npm run db:migrate
npm run db:seed-demo                       # fictional demo data, refused in production
ADMIN_EMAIL=you@example.com ADMIN_PASSWORD='a-long-password' npm run admin:create
npm run dev
```

Tests (needs a database whose name contains `test`):

```bash
TEST_DATABASE_URL=postgres://user:pw@localhost:5432/finals_test npm test
```

## Useful commands

| Command | What it does |
|---|---|
| `npm run sync -- --due` | Sync all sources whose interval elapsed |
| `npm run sync -- --source liquipedia` | Sync one source |
| `npm run export -- --out exports/now` | JSON + CSV export of all business data |
| `npm run import -- exports/now/export.json` | Restore a JSON export into an empty DB |
| `npm run backup` / `npm run restore` | Full `pg_dump` backup / restore |
| `npm run db:generate` | Create a migration after changing `src/db/schema.ts` |
