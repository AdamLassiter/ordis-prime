import {
  PairingImportError,
  registerWarframeUpdaterDevice,
} from "@ordis-prime/db";
import { getDatabase } from "@/lib/database";

export async function POST(request: Request) {
  try {
    const token = bearerToken(request.headers.get("authorization"));
    if (!token) throw new PairingImportError("Pairing code is required", 401);
    const { deviceId } = registerWarframeUpdaterDevice(getDatabase(), {
      token,
      deviceToken: requiredHeader(request, "x-ordis-device-token"),
      deviceName: requiredHeader(request, "x-ordis-device-name"),
    });
    return Response.json(
      {
        deviceId,
        message: "Device paired. Waiting for Warframe.",
      },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    const status = error instanceof PairingImportError ? error.status : 400;
    return Response.json(
      {
        message:
          error instanceof Error ? error.message : "Device pairing failed",
      },
      { status, headers: { "cache-control": "no-store" } },
    );
  }
}

function requiredHeader(request: Request, name: string) {
  const value = request.headers.get(name)?.trim();
  if (!value) throw new PairingImportError(`${name} is required`, 400);
  return value;
}

function bearerToken(header: string | null) {
  const match = header?.match(/^Bearer ([A-Za-z0-9_-]{43})$/);
  return match?.[1];
}
