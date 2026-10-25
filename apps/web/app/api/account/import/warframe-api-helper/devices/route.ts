import { listPlayerImportDevices } from "@ordis-prime/db";
import { auth } from "@/lib/auth";
import { getDatabase } from "@/lib/database";

export async function GET(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session)
    return Response.json(
      { message: "Authentication required" },
      { status: 401 },
    );
  return Response.json(
    { devices: listPlayerImportDevices(getDatabase(), session.user.id) },
    { headers: { "cache-control": "no-store" } },
  );
}
