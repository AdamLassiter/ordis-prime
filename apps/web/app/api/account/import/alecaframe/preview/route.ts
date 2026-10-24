import { previewAlecaFrameImport } from "@ordis-prime/db";
import { auth } from "@/lib/auth";
import { getDatabase } from "@/lib/database";
import {
  ImportRequestError,
  readAlecaFrameImportRequest,
} from "@/lib/alecaframe-import-request";

export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session)
    return Response.json(
      { message: "Authentication required" },
      { status: 401 },
    );
  try {
    const { bytes, options } = await readAlecaFrameImportRequest(request);
    return Response.json(
      previewAlecaFrameImport(getDatabase(), session.user.id, bytes, options),
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    return Response.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "AlecaFrame import is invalid",
      },
      { status: error instanceof ImportRequestError ? error.status : 400 },
    );
  }
}
