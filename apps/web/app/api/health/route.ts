import { getDatabase } from "@/lib/database";

export function GET() {
  try {
    const database = getDatabase();
    database.prepare("select 1").get();
    const activeRuns = (
      database
        .prepare(
          "select count(*) as count from source_runs where status = 'active'",
        )
        .get() as { count: number }
    ).count;
    return Response.json(
      { status: "ok", service: "ordis-prime", database: "ok", activeRuns },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    return Response.json(
      {
        status: "error",
        service: "ordis-prime",
        database: "unavailable",
        error:
          error instanceof Error ? error.message : "Unknown database error",
      },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }
}
