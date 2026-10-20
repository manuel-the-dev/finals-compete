import type { Metadata } from "next";
import Link from "next/link";
import { currentUser } from "@/lib/auth";
import { logoutAction } from "./actions";
import "./globals.css";

export const metadata: Metadata = {
  title: "FINALS COMPETE",
  description: "Turniere, Resultate mit Quellenangaben und Prediction-Märkte mit virtueller Währung für die THE-FINALS-Szene.",
};

export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser().catch(() => null);
  return (
    <html lang="de">
      <body>
        <header className="site">
          <Link href="/" className="brand">
            FINALS <span>COMPETE</span>
          </Link>
          <nav>
            <Link href="/tournaments">Turniere</Link>
            <Link href="/teams">Teams</Link>
            <Link href="/markets">Märkte</Link>
            <Link href="/news">News</Link>
            <Link href="/sources">Quellen</Link>
            {user?.role === "admin" ? <Link href="/admin">Admin</Link> : null}
            {user ? <Link href="/wallet">Wallet</Link> : <Link href="/login">Login</Link>}
          </nav>
          {user ? (
            <form action={logoutAction} style={{ marginLeft: "auto" }}>
              <button className="secondary" type="submit">
                Logout ({user.displayName})
              </button>
            </form>
          ) : null}
        </header>
        <main>{children}</main>
        <footer className="site">
          Prediction-Märkte nutzen ausschliesslich virtuelle Coins ohne Geldwert. Turnierdaten teilweise von{" "}
          <a href="https://liquipedia.net/thefinals/" rel="noopener noreferrer">
            Liquipedia
          </a>{" "}
          unter{" "}
          <a href="https://creativecommons.org/licenses/by-sa/3.0/" rel="noopener noreferrer">
            CC BY-SA 3.0
          </a>
          . Nicht mit Embark Studios verbunden. <Link href="/sources">Quellen &amp; Methodik</Link>
        </footer>
      </body>
    </html>
  );
}
