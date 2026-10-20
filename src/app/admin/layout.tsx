import Link from "next/link";
import { requireAdmin } from "@/lib/auth";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return (
    <>
      <nav className="card small" style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        <Link href="/admin">Übersicht</Link>
        <Link href="/admin/sources">Datenquellen</Link>
        <Link href="/admin/conflicts">Konflikte &amp; Prüfungen</Link>
        <Link href="/admin/markets">Märkte</Link>
        <Link href="/admin/export">Export</Link>
      </nav>
      {children}
    </>
  );
}
