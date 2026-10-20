import Link from "next/link";
import { loginAction } from "../actions";

export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <>
      <h1>Login</h1>
      {error ? <div className="card error">{error}</div> : null}
      <form action={loginAction} className="card stack" style={{ maxWidth: 400 }}>
        <label htmlFor="email">E-Mail</label>
        <input id="email" name="email" type="email" required autoComplete="email" />
        <label htmlFor="password">Passwort</label>
        <input id="password" name="password" type="password" required autoComplete="current-password" />
        <button type="submit">Einloggen</button>
      </form>
      <p>Noch kein Konto? <Link href="/register">Registrieren</Link></p>
    </>
  );
}
