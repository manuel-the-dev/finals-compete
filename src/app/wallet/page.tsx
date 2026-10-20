import { desc, eq } from "drizzle-orm";
import { fmtDate } from "@/components/badges";
import { db } from "@/db";
import * as s from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { balanceOf } from "@/lib/wallet";

const KIND = { grant: "Startguthaben", stake: "Einsatz", payout: "Gewinn", refund: "Rückerstattung", adjustment: "Korrektur" } as const;

export default async function Wallet() {
  const user = await requireUser();
  const tx = await db().select().from(s.walletTransactions).where(eq(s.walletTransactions.userId, user.id)).orderBy(desc(s.walletTransactions.createdAt));
  return (
    <>
      <h1>Wallet</h1>
      <div className="card">Guthaben: <strong>{await balanceOf(db(), user.id)} Coins</strong> <span className="muted small">(virtuell, kein Geldwert)</span></div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Datum</th><th>Art</th><th>Betrag</th></tr></thead>
          <tbody>{tx.map((t) => <tr key={t.id}><td>{fmtDate(t.createdAt)}</td><td>{KIND[t.kind]}</td><td>{t.amount}</td></tr>)}</tbody>
        </table>
      </div>
    </>
  );
}
