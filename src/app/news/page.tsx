import { desc } from "drizzle-orm";
import { VerificationBadge, fmtDate } from "@/components/badges";
import { db } from "@/db";
import * as s from "@/db/schema";

const TYPE: Record<string, string> = {
  tournament_announcement: "Turnierankündigung",
  schedule: "Spielplan",
  schedule_change: "Spielplanänderung",
  result: "Ergebnismeldung",
  result_correction: "Ergebniskorrektur",
  lineup_change: "Lineup-Änderung",
  transfer: "Teamwechsel",
  qualification: "Qualifikation",
  cancellation: "Absage",
  stream: "Stream",
  video: "Video",
  other: "Sonstiges",
};

export default async function News() {
  const posts = await db().select().from(s.socialPosts).orderBy(desc(s.socialPosts.publishedAt)).limit(100);
  return (
    <>
      <h1>News aus Social Media</h1>
      <p className="muted">Beiträge sind Hinweise, keine bestätigten Resultate. Die Einstufung erfolgt automatisch nach Stichworten.</p>
      {posts.map((p) => (
        <div key={p.id} className="card">
          <div className="small muted">
            {TYPE[p.infoType]} · {p.platform} · {p.accountName ?? p.accountHandle} ({p.accountKind}) · veröffentlicht {fmtDate(p.publishedAt)} · importiert {fmtDate(p.importedAt)}{" "}
            <VerificationBadge v={p.verification} /> {p.isLive ? <span className="badge b-bad">LIVE</span> : null}
          </div>
          <a href={p.url} rel="noopener noreferrer" target="_blank"><strong>{p.title || p.body.slice(0, 140)}</strong></a>
          {p.title ? <p className="small">{p.body.slice(0, 280)}</p> : null}
        </div>
      ))}
      {posts.length === 0 ? <p className="muted">Noch keine Beiträge importiert.</p> : null}
    </>
  );
}
