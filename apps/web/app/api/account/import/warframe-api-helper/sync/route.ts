import {
  applyPairedWarframeApiHelperImport,
  PairingImportError,
} from "@ordis-prime/db";
import { getDatabase } from "@/lib/database";

const MAXIMUM_INVENTORY_BYTES = 10 * 1024 * 1024;

export async function POST(request: Request) {
  try {
    const token = bearerToken(request.headers.get("authorization"));
    if (!token) throw new PairingImportError("Pairing code is required", 401);
    const contentType = request.headers.get("content-type") ?? "";
    if (!contentType.toLowerCase().startsWith("application/json"))
      throw new PairingImportError("Inventory must be JSON", 415);
    const bytes = await readBoundedBody(request, MAXIMUM_INVENTORY_BYTES);
    const { pairingId, result } = applyPairedWarframeApiHelperImport(
      getDatabase(),
      token,
      bytes,
    );
    return Response.json(
      {
        pairingId,
        applied: true,
        changedItems: result.inventory.changedItems,
        resolvedItems: result.inventory.resolvedItems,
        unresolvedCount:
          result.inventory.unresolvedCount + result.loadout.unresolvedCount,
        message: `Imported ${result.inventory.changedItems} collection changes.`,
      },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    const status = error instanceof PairingImportError ? error.status : 400;
    return Response.json(
      {
        message:
          error instanceof Error ? error.message : "Inventory import failed",
      },
      { status, headers: { "cache-control": "no-store" } },
    );
  }
}

function bearerToken(header: string | null) {
  const match = header?.match(/^Bearer ([A-Za-z0-9_-]{43})$/);
  return match?.[1];
}

async function readBoundedBody(request: Request, maximum: number) {
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > maximum)
    throw new PairingImportError("Inventory exceeds the 10 MB limit", 413);
  if (!request.body) throw new PairingImportError("Inventory is empty", 400);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > maximum) {
      await reader.cancel();
      throw new PairingImportError("Inventory exceeds the 10 MB limit", 413);
    }
    chunks.push(value);
  }
  if (!length) throw new PairingImportError("Inventory is empty", 400);
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}
