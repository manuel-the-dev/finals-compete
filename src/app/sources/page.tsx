import { VERIFICATION_LABEL } from "@/domain/verification";
import { ADAPTERS } from "@/sources/registry";

export default function SourcesPage() {
  return (
    <>
      <h1>Quellen &amp; Methodik</h1>
      <h2>Quellenhierarchie</h2>
      <ol>
        <li><strong>{VERIFICATION_LABEL.official}</strong>: Herausgeber oder offizieller Turnierveranstalter.</li>
        <li><strong>{VERIFICATION_LABEL.database}</strong>: etablierte Turnierdatenbank (Liquipedia).</li>
        <li><strong>{VERIFICATION_LABEL.team_claim}</strong>: Ankündigungen von Teams und Spielern.</li>
        <li><strong>{VERIFICATION_LABEL.unverified}</strong>: Community-Berichte.</li>
      </ol>
      <p>Ein Ergebnis gilt nur als bestätigt, wenn Stufe 1 oder 2 es liefert und keine Quelle widerspricht. Social-Media-Beiträge setzen nie ein Ergebnis, sie lösen höchstens eine Prüfung aus. Bei Widersprüchen entscheidet ein Administrator mit Quellenangabe. <strong>{VERIFICATION_LABEL.demo}</strong> sind simuliert und immer gekennzeichnet.</p>
      <h2>Cashouts und Live-Daten</h2>
      <p>Keine angebundene Quelle liefert derzeit strukturierte Cashout-, Runden- oder Live-Platzierungsdaten. Märkte, die solche Daten brauchen, werden nicht automatisch abgerechnet. Als live gekennzeichnet sind nur Twitch-Streams, deren Status direkt von Twitch kommt.</p>
      <h2>Angebundene Quellen</h2>
      <ul>
        {ADAPTERS.map((a) => (
          <li key={a.id}>
            <strong>{a.label}</strong>: {a.description} <a href={a.docsUrl} rel="noopener noreferrer">Bedingungen/Doku</a>
          </li>
        ))}
      </ul>
      <h2>Lizenz</h2>
      <p>Daten von Liquipedia stehen unter <a href="https://creativecommons.org/licenses/by-sa/3.0/">CC BY-SA 3.0</a>. Jede importierte Angabe verlinkt auf die Originalseite.</p>
    </>
  );
}
