import { createPlayerImportPairing } from "@ordis-prime/db";
import { auth } from "@/lib/auth";
import { getDatabase } from "@/lib/database";

export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session)
    return Response.json(
      { message: "Authentication required" },
      { status: 401 },
    );
  try {
    const baseUrl = process.env.ORDIS_BASE_URL ?? new URL(request.url).origin;
    return Response.json(
      createPlayerImportPairing(getDatabase(), session.user.id, baseUrl),
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    return Response.json(
      { message: error instanceof Error ? error.message : "Pairing failed" },
      { status: 400 },
    );
  }
}
