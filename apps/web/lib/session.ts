import { headers } from "next/headers";
import { auth } from "./auth";

export async function getCurrentSession() {
  return auth.api.getSession({ headers: await headers() });
}

export async function requireCurrentSession() {
  const session = await getCurrentSession();
  if (!session) throw new Error("Authentication required");
  return session;
}
