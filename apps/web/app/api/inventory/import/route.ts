import { importWarframeInventory } from "@ordis-prime/db";
import { auth } from "@/lib/auth";
import { getDatabase } from "@/lib/database";

const maximumInventoryBytes = 10 * 1024 * 1024;

export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session)
    return Response.json(
      { message: "Authentication required" },
      { status: 401 },
    );
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > maximumInventoryBytes)
    return Response.json(
      { message: "Inventory exceeds the 10 MB limit" },
      { status: 413 },
    );
  const body = await request.text();
  if (Buffer.byteLength(body) > maximumInventoryBytes)
    return Response.json(
      { message: "Inventory exceeds the 10 MB limit" },
      { status: 413 },
    );
  let inventory: unknown;
  try {
    inventory = JSON.parse(body);
  } catch {
    return Response.json(
      { message: "Inventory is not valid JSON" },
      { status: 400 },
    );
  }
  try {
    return Response.json(
      importWarframeInventory(getDatabase(), session.user.id, inventory),
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    return Response.json(
      {
        message:
          error instanceof Error ? error.message : "Inventory is invalid",
      },
      { status: 400 },
    );
  }
}
