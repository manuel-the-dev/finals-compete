import type { Pool, PoolClient } from "pg";

/**
 * Tables in foreign-key order. Export and import both use this order so a
 * JSON export can be restored into an empty, migrated database.
 */
export const EXPORT_TABLES = [
  "users",
  "teams",
  "players",
  "tournaments",
  "team_memberships",
  "tournament_participants",
  "matches",
  "match_participants",
  "data_sources",
  "sync_runs",
  "source_records",
  "result_claims",
  "social_posts",
  "conflicts",
  "markets",
  "market_outcomes",
  "predictions",
  "wallet_transactions",
  "audit_logs",
] as const;
export type ExportTable = (typeof EXPORT_TABLES)[number];

/** Columns with personal data. Only included when includePersonal is set (admin, documented reason). */
const PERSONAL_COLUMNS: Partial<Record<ExportTable, string[]>> = { users: ["email"] };
/** Never exported in JSON/CSV. Credentials only travel in a full database dump. */
const SECRET_COLUMNS: Partial<Record<ExportTable, string[]>> = { users: ["password_hash"], data_sources: ["request_log"] };

export type ExportBundle = {
  meta: { format: "finals-compete-export"; version: 1; exportedAt: string; appEnv: string; migration: string | null; includePersonal: boolean };
  tables: Partial<Record<ExportTable, Record<string, unknown>[]>>;
};

type Queryable = Pool | PoolClient;

export async function exportTable(db: Queryable, table: ExportTable, includePersonal: boolean) {
  const { rows } = await db.query(`SELECT * FROM ${table} ORDER BY 1`);
  const drop = [...(SECRET_COLUMNS[table] ?? []), ...(includePersonal ? [] : (PERSONAL_COLUMNS[table] ?? []))];
  return rows.map((r) => {
    const copy = { ...r };
    for (const c of drop) delete copy[c];
    return copy;
  });
}

export async function exportAll(db: Queryable, opts: { includePersonal: boolean; appEnv: string; tables?: ExportTable[] }): Promise<ExportBundle> {
  let migration: string | null = null;
  try {
    const m = await db.query(`SELECT hash FROM drizzle.__drizzle_migrations ORDER BY created_at DESC LIMIT 1`);
    migration = m.rows[0]?.hash ?? null;
  } catch {
    migration = null;
  }
  const tables: ExportBundle["tables"] = {};
  for (const t of opts.tables ?? EXPORT_TABLES) tables[t] = await exportTable(db, t, opts.includePersonal);
  return {
    meta: { format: "finals-compete-export", version: 1, exportedAt: new Date().toISOString(), appEnv: opts.appEnv, migration, includePersonal: opts.includePersonal },
    tables,
  };
}

function csvCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = v instanceof Date ? v.toISOString() : typeof v === "object" ? JSON.stringify(v) : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const cols = Object.keys(rows[0]);
  return [cols.join(","), ...rows.map((r) => cols.map((c) => csvCell(r[c])).join(","))].join("\n") + "\n";
}

/**
 * Imports an export bundle into an EMPTY migrated database, keeping all ids.
 * Users without a password hash get an unusable one and must reset/re-create
 * their password (credentials are deliberately not part of JSON exports).
 */
export async function importAll(client: PoolClient, bundle: ExportBundle) {
  if (bundle.meta?.format !== "finals-compete-export") throw new Error("Unbekanntes Exportformat");
  const counts: Record<string, number> = {};
  await client.query("BEGIN");
  try {
    for (const t of EXPORT_TABLES) {
      const existing = await client.query(`SELECT 1 FROM ${t} LIMIT 1`);
      if (existing.rowCount) throw new Error(`Tabelle ${t} ist nicht leer; Import nur in eine leere Datenbank.`);
    }
    for (const t of EXPORT_TABLES) {
      let rows = bundle.tables[t] ?? [];
      if (t === "users") {
        rows = rows.map((r) => ({ email: `restored-${r.id}@invalid.local`, password_hash: "!disabled-after-import", ...r }));
      }
      if (rows.length === 0) {
        counts[t] = 0;
        continue;
      }
      // json_populate_recordset maps JSON keys to the table's own column types.
      for (let i = 0; i < rows.length; i += 1000) {
        await client.query(`INSERT INTO ${t} SELECT * FROM json_populate_recordset(NULL::${t}, $1::json)`, [JSON.stringify(rows.slice(i, i + 1000))]);
      }
      counts[t] = rows.length;
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  }
  return counts;
}
