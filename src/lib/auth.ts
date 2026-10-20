import "server-only";
import { eq } from "drizzle-orm";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/db";
import * as s from "@/db/schema";
import { env } from "./env";

type SessionData = { userId?: string };

export async function getSession() {
  return getIronSession<SessionData>(await cookies(), {
    password: env().SESSION_SECRET,
    cookieName: "fc_session",
    cookieOptions: { secure: env().APP_ENV === "production" || env().APP_ENV === "preview", httpOnly: true, sameSite: "lax" },
  });
}

export async function currentUser() {
  const session = await getSession();
  if (!session.userId) return null;
  const [u] = await db()
    .select({ id: s.users.id, email: s.users.email, displayName: s.users.displayName, role: s.users.role })
    .from(s.users)
    .where(eq(s.users.id, session.userId));
  return u ?? null;
}

export async function requireUser() {
  const u = await currentUser();
  if (!u) redirect("/login");
  return u;
}

export async function requireAdmin() {
  const u = await currentUser();
  if (!u || u.role !== "admin") redirect("/login?admin=1");
  return u;
}
