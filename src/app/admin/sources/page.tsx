import { count, desc, eq } from "drizzle-orm";
import { fmtDate } from "@/components/badges";
import { db } from "@/db";
import * as s from "@/db/schema";
import { env } from "@/lib/env";
import { ensureDataSource } from "@/sources/pipeline";
import { ADAPTERS } from "@/sources/registry";
import { runSourceAction, updateSourceAction } from "../../actions";

export default async function AdminSources({ searchParams }: { searchParams: Promise<{ ran?: string; status?: string }> }) {
  const sp = await searchParams;
  const e = env();
  const rows = [];
  for (const a of ADAPTERS) {
    const ds = await ensureDataSource(db(), a);
    const cfg = a.configured(e);
    const runs = await db().select().from(s.syncRuns).where(eq(s.syncRuns.sourceId, a.id)).orderBy(desc(s.syncRuns.startedAt)).limit(5);
    const [records] = await db().select({ n: count() }).from(s.sourceRecords).where(eq(s.sourceRecords.source, a.id));
    const windowStart = Date.now() - a.rateLimit.windowMs;
    const used = (ds.requestLog ?? []).filter((t) => t > windowStart).length;
    rows.push({ a, ds, cfg, runs, records: records.n, used });
  }
  const [pendingReview] = await db().select({ n: count() }).from(s.matches).where(eq(s.matches.needsReview, true));
  const [openConflicts] = await db().select({ n: count() }).from(s.conflicts).where(eq(s.conflicts.status, "open"));
  return (
    <>
      <h1>Datenquellen</h1>
      <p className="muted">
        Ausstehende Verifizierungen: <strong>{pendingReview.n}</strong> · Widersprüchliche Resultate: <strong>{openConflicts.n}</strong>. API-Schlüssel werden hier nie angezeigt, nur ob sie gesetzt sind.
      </p>
      {sp.ran ? <div className="card">Synchronisation {sp.ran}: {sp.status}</div> : null}
      {rows.map(({ a, ds, cfg, runs, records, used }) => {
        const status = !cfg.ok ? "Nicht verbunden" : !ds.enabled ? "Deaktiviert" : ds.lastFailureAt && (!ds.lastSuccessAt || ds.lastFailureAt > ds.lastSuccessAt) ? "Fehler" : ds.lastSuccessAt ? "Verbunden" : "Noch nie synchronisiert";
        return (
          <div key={a.id} className="card">
            <h2 style={{ marginTop: 0 }}>
              {a.label} <span className={`badge ${status === "Verbunden" ? "b-official" : status === "Fehler" ? "b-bad" : "b-unverified"}`}>{status}</span>
            </h2>
            <p className="small">{a.description} <a href={a.docsUrl} rel="noopener noreferrer">Bedingungen/Doku</a></p>
            <div className="table-wrap">
              <table className="small">
                <tbody>
                  <tr><th>Konfiguration</th><td>{cfg.ok ? "vollständig" : `fehlt: ${cfg.missing.join(", ")} (als Umgebungsvariable beim Hosting hinterlegen)`}</td></tr>
                  <tr><th>Letzte erfolgreiche Sync.</th><td>{fmtDate(ds.lastSuccessAt)}</td></tr>
                  <tr><th>Letzte fehlgeschlagene Sync.</th><td>{fmtDate(ds.lastFailureAt)} {ds.lastError ? <span className="muted">· {ds.lastError}</span> : null}</td></tr>
                  <tr><th>Importierte Datensätze</th><td>{records}</td></tr>
                  <tr><th>API-Limit</th><td>{a.rateLimit.note} · genutzt im aktuellen Fenster: {used}/{a.rateLimit.limit}</td></tr>
                  <tr><th>Warnungen</th><td>{(ds.lastWarnings ?? []).length ? <ul>{ds.lastWarnings!.map((w, i) => <li key={i}>{w}</li>)}</ul> : "keine"}</td></tr>
                </tbody>
              </table>
            </div>
            <form action={updateSourceAction} className="inline" style={{ marginTop: 8 }}>
              <input type="hidden" name="id" value={a.id} />
              <label className="inline"><input type="checkbox" name="enabled" defaultChecked={ds.enabled} /> aktiv</label>
              <label className="inline">Intervall (Min.) <input type="number" name="intervalMinutes" min={5} defaultValue={ds.intervalMinutes} style={{ width: 90 }} /></label>
              <button type="submit" className="secondary">Speichern</button>
            </form>
            <form action={runSourceAction} className="inline" style={{ marginTop: 8 }}>
              <input type="hidden" name="id" value={a.id} />
              <button type="submit" disabled={!cfg.ok}>Jetzt synchronisieren</button>
            </form>
            <details style={{ marginTop: 8 }}>
              <summary className="small">Letzte Läufe</summary>
              <ul className="small">
                {runs.map((r) => (
                  <li key={r.id}>
                    {fmtDate(r.startedAt)} · {r.trigger} · {r.status} · Requests {r.requests} · neu {r.created} · geändert {r.updated} · unverändert {r.unchanged}
                    {r.errors.length ? <div className="muted">Fehler: {r.errors.join(" | ")}</div> : null}
                    {r.warnings.length ? <div className="muted">Warnungen: {r.warnings.join(" | ")}</div> : null}
                  </li>
                ))}
              </ul>
            </details>
          </div>
        );
      })}
    </>
  );
}
