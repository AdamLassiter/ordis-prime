import {
  cancelPlayerImportPairing,
  getPlayerImportPairing,
} from "@ordis-prime/db";
import { auth } from "@/lib/auth";
import { getDatabase } from "@/lib/database";

interface Context {
  params: Promise<{ id: string }>;
}

export async function GET(request: Request, context: Context) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session)
    return Response.json(
      { message: "Authentication required" },
      { status: 401 },
    );
  const { id } = await context.params;
  const pairing = getPlayerImportPairing(getDatabase(), session.user.id, id);
  return pairing
    ? Response.json(pairing, { headers: { "cache-control": "no-store" } })
    : Response.json({ message: "Pairing not found" }, { status: 404 });
}

export async function DELETE(request: Request, context: Context) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session)
    return Response.json(
      { message: "Authentication required" },
      { status: 401 },
    );
  const { id } = await context.params;
  const cancelled = cancelPlayerImportPairing(
    getDatabase(),
    session.user.id,
    id,
  );
  return cancelled
    ? new Response(null, { status: 204 })
    : Response.json({ message: "Pending pairing not found" }, { status: 404 });
}
