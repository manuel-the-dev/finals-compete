import { registerAction } from "../actions";

export default async function Register({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <>
      <h1>Registrieren</h1>
      <p className="muted">Du erhältst ein Startguthaben in virtuellen Coins. Diese haben keinen Geldwert und können nicht ausgezahlt werden.</p>
      {error ? <div className="card error">{error}</div> : null}
      <form action={registerAction} className="card stack" style={{ maxWidth: 400 }}>
        <label htmlFor="displayName">Anzeigename</label>
        <input id="displayName" name="displayName" required minLength={2} maxLength={40} />
        <label htmlFor="email">E-Mail</label>
        <input id="email" name="email" type="email" required autoComplete="email" />
        <label htmlFor="password">Passwort (min. 10 Zeichen)</label>
        <input id="password" name="password" type="password" required minLength={10} autoComplete="new-password" />
        <button type="submit">Konto erstellen</button>
      </form>
    </>
  );
}
