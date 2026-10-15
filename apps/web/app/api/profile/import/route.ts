import { importPlayerProfile } from "@ordis-prime/db";
import { auth } from "@/lib/auth";
import { getDatabase } from "@/lib/database";

const maximumProfileBytes = 5 * 1024 * 1024;

export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session)
    return Response.json(
      { message: "Authentication required" },
      { status: 401 },
    );
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > maximumProfileBytes)
    return Response.json(
      { message: "Profile exceeds the 5 MB limit" },
      { status: 413 },
    );
  const body = await request.text();
  if (Buffer.byteLength(body) > maximumProfileBytes)
    return Response.json(
      { message: "Profile exceeds the 5 MB limit" },
      { status: 413 },
    );
  let profile: unknown;
  try {
    profile = JSON.parse(body);
  } catch {
    return Response.json(
      { message: "Profile is not valid JSON" },
      { status: 400 },
    );
  }
  const mode =
    new URL(request.url).searchParams.get("mode") === "replace"
      ? "replace"
      : "merge";
  try {
    return Response.json(
      importPlayerProfile(getDatabase(), session.user.id, profile, { mode }),
    );
  } catch (error) {
    return Response.json(
      {
        message: error instanceof Error ? error.message : "Profile is invalid",
      },
      { status: 400 },
    );
  }
}
