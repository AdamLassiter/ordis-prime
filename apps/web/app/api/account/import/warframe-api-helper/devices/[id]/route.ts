import { revokePlayerImportDevice } from "@ordis-prime/db";
import { auth } from "@/lib/auth";
import { getDatabase } from "@/lib/database";

interface Context {
  params: Promise<{ id: string }>;
}

export async function DELETE(request: Request, context: Context) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session)
    return Response.json(
      { message: "Authentication required" },
      { status: 401 },
    );
  const { id } = await context.params;
  return revokePlayerImportDevice(getDatabase(), session.user.id, id)
    ? new Response(null, { status: 204 })
    : Response.json({ message: "Active device not found" }, { status: 404 });
}
