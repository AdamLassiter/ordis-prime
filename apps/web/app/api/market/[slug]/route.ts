import { NextResponse } from "next/server";
import { summarizeMarketTopOrders } from "@/lib/warframe-market";

export const revalidate = 60;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  if (!/^[a-z0-9]+(?:_[a-z0-9]+)*$/.test(slug))
    return NextResponse.json({ error: "Invalid market item" }, { status: 400 });
  try {
    const response = await fetch(
      `https://api.warframe.market/v2/orders/item/${encodeURIComponent(slug)}/top`,
      {
        headers: {
          Accept: "application/json",
          Language: "en",
          Platform: "pc",
          Crossplay: "true",
          "User-Agent":
            "OrdisPrime/0.1 (+https://gitea-infra.lassiter.uk/adaml/ordis-prime)",
        },
        next: { revalidate: 60 },
      },
    );
    if (!response.ok) throw new Error(`upstream status ${response.status}`);
    const summary = summarizeMarketTopOrders(await response.json());
    return NextResponse.json(summary, {
      headers: {
        "Cache-Control": "public, max-age=60, stale-while-revalidate=300",
      },
    });
  } catch {
    return NextResponse.json(
      {
        error: "Live market orders are temporarily unavailable",
      },
      { status: 503 },
    );
  }
}
