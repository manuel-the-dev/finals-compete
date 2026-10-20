import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { closeDb, db } from "@/db";
import * as s from "@/db/schema";

/**
 * Usage: ADMIN_EMAIL=... ADMIN_PASSWORD=... npm run admin:create
 * Creates the user or promotes an existing one to admin. Credentials come from env, never from code.
 */
async function main() {
  const email = process.env.ADMIN_EMAIL?.toLowerCase().trim();
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password || password.length < 12) throw new Error("ADMIN_EMAIL und ADMIN_PASSWORD (min. 12 Zeichen) setzen");
  const [existing] = await db().select().from(s.users).where(eq(s.users.email, email));
  if (existing) {
    await db().update(s.users).set({ role: "admin", passwordHash: await bcrypt.hash(password, 12) }).where(eq(s.users.id, existing.id));
    console.log(`Benutzer ${email} ist jetzt Admin.`);
  } else {
    const [u] = await db()
      .insert(s.users)
      .values({ email, passwordHash: await bcrypt.hash(password, 12), displayName: email.split("@")[0], role: "admin" })
      .returning();
    console.log(`Admin ${email} angelegt (${u.id}).`);
  }
  await db().insert(s.auditLogs).values({ actorKind: "system", action: "admin.created_via_cli", entityType: "user", details: { email } });
  await closeDb();
}

main().catch(async (err) => {
  console.error(err);
  await closeDb();
  process.exit(1);
});
