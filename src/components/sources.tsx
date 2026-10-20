import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import * as s from "@/db/schema";
import { VerificationBadge, fmtDate } from "./badges";

/** Lists every source that reported this entity, with a link to the original. */
export async function SourceList({ entityType, entityId }: { entityType: (typeof s.sourceRecords.$inferSelect)["entityType"]; entityId: string }) {
  const rows = await db()
    .select()
    .from(s.sourceRecords)
    .where(and(eq(s.sourceRecords.entityType, entityType), eq(s.sourceRecords.entityId, entityId)));
  if (rows.length === 0) return <p className="muted small">Keine externen Quellen (manuell oder Demo).</p>;
  return (
    <ul className="small">
      {rows.map((r) => (
        <li key={r.id}>
          <strong>{r.source}</strong> <VerificationBadge v={r.verification} />{" "}
          {r.url ? (
            <a href={r.url} rel="noopener noreferrer" target="_blank">
              Original
            </a>
          ) : null}{" "}
          <span className="muted">· zuletzt importiert {fmtDate(r.lastImportedAt)} · geändert {fmtDate(r.lastChangedAt)}</span>
        </li>
      ))}
    </ul>
  );
}
