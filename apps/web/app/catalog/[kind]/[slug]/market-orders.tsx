"use client";

import { useEffect, useState } from "react";
import type { MarketOrderSummary } from "@/lib/warframe-market";

export function MarketOrders({ slug }: { slug: string }) {
  const [state, setState] = useState<
    | { status: "loading" }
    | { status: "loaded"; summary: MarketOrderSummary }
    | { status: "failed" }
  >({ status: "loading" });
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/market/${encodeURIComponent(slug)}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("market unavailable");
        return (await response.json()) as MarketOrderSummary;
      })
      .then((summary) => setState({ status: "loaded", summary }))
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === "AbortError"))
          setState({ status: "failed" });
      });
    return () => controller.abort();
  }, [slug]);

  const marketUrl = `https://warframe.market/items/${encodeURIComponent(slug)}`;
  if (state.status === "loading")
    return <span className="muted">Loading live orders…</span>;
  if (state.status === "failed")
    return (
      <span>
        Live orders unavailable · <a href={marketUrl}>open Warframe.market</a>
      </span>
    );
  const { sell, buy, sellOrderCount, buyOrderCount } = state.summary;
  return (
    <span>
      {sell ? `Buy from ${formatOrder(sell)}` : "No online sell order"}
      {" · "}
      {buy ? `Sell to ${formatOrder(buy)}` : "No online buy order"}
      {` · ${sellOrderCount} sell / ${buyOrderCount} buy shown · `}
      <a href={marketUrl}>all listings</a>
    </span>
  );
}

function formatOrder(order: { platinum: number; perTrade: number }): string {
  return `${order.platinum} platinum${order.perTrade === 1 ? "" : ` per ${order.perTrade}`}`;
}
