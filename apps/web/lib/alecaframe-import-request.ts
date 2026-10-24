import type { AlecaFrameImportOptions } from "@ordis-prime/db";

const MAXIMUM_SNAPSHOT_BYTES = 10 * 1024 * 1024;
const MAXIMUM_MULTIPART_OVERHEAD = 1024 * 1024;

export interface AlecaFrameImportRequest {
  bytes: Uint8Array;
  options: AlecaFrameImportOptions;
  expectedHash?: string;
}

export async function readAlecaFrameImportRequest(
  request: Request,
): Promise<AlecaFrameImportRequest> {
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > MAXIMUM_SNAPSHOT_BYTES + MAXIMUM_MULTIPART_OVERHEAD)
    throw new ImportRequestError(
      "AlecaFrame snapshot exceeds the 10 MB limit",
      413,
    );
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    throw new ImportRequestError("AlecaFrame import form is invalid", 400);
  }
  const snapshot = form.get("snapshot");
  if (!(snapshot instanceof File) || !snapshot.size)
    throw new ImportRequestError("Choose an AlecaFrame lastData.dat file", 400);
  if (snapshot.size > MAXIMUM_SNAPSHOT_BYTES)
    throw new ImportRequestError(
      "AlecaFrame snapshot exceeds the 10 MB limit",
      413,
    );
  const mode = form.get("mode");
  if (mode !== "merge" && mode !== "replace")
    throw new ImportRequestError("AlecaFrame import mode is invalid", 400);
  const buildTitle = stringField(form.get("buildTitle"));
  return {
    bytes: new Uint8Array(await snapshot.arrayBuffer()),
    options: {
      mode,
      includeInventory: form.get("includeInventory") === "true",
      includeProgression: form.get("includeProgression") === "true",
      createBuild: form.get("createBuild") === "true",
      ...(buildTitle ? { buildTitle } : {}),
    },
    expectedHash: stringField(form.get("expectedHash")),
  };
}

export class ImportRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

function stringField(value: FormDataEntryValue | null) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
