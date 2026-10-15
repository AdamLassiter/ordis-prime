import { exportPlayerProfile } from "@ordis-prime/db";
import { auth } from "@/lib/auth";
import { getDatabase } from "@/lib/database";

export async function GET(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session)
    return Response.json(
      { message: "Authentication required" },
      { status: 401 },
    );
  const profile = exportPlayerProfile(getDatabase(), session.user.id);
  return new Response(`${JSON.stringify(profile, null, 2)}\n`, {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": "attachment; filename=ordis-prime-profile.json",
      "cache-control": "no-store",
    },
  });
}
