import { EXPORT_TABLES } from "@/lib/export";

export default function AdminExport() {
  return (
    <>
      <h1>Datenexport</h1>
      <p>Exporte enthalten nie Passwort-Hashes. E-Mail-Adressen nur mit ausdrücklicher Auswahl; jeder Export wird im Audit-Log festgehalten. Für eine vollständige Sicherung inklusive Zugangsdaten siehe <code>docs/BACKUP_RESTORE.md</code> (Datenbank-Dump).</p>
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Komplettexport (JSON, wieder importierbar)</h2>
        <a href="/api/admin/export?format=json">Ohne personenbezogene Daten</a> · <a href="/api/admin/export?format=json&personal=1">Mit E-Mail-Adressen</a>
      </div>
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Einzelne Tabellen (CSV)</h2>
        <ul className="small">
          {EXPORT_TABLES.map((t) => (
            <li key={t}><a href={`/api/admin/export?format=csv&table=${t}`}>{t}.csv</a></li>
          ))}
        </ul>
      </div>
    </>
  );
}
