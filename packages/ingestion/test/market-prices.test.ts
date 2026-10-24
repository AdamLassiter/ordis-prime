import assert from "node:assert/strict";
import test from "node:test";
import { parseOrders, summarizeVariant } from "../src/index.ts";

test("market price summaries filter online variants and normalize bulk trades", () => {
  const order = (
    type: "sell" | "buy",
    platinum: number,
    options: Record<string, unknown> = {},
  ) => ({
    type,
    platinum,
    quantity: 10,
    perTrade: 1,
    visible: true,
    user: { status: "online" },
    ...options,
  });
  const parsed = parseOrders({
    apiVersion: "fixture",
    error: null,
    data: [
      order("sell", 2, { subtype: "radiant" }),
      order("sell", 3, { subtype: "radiant" }),
      order("sell", 4, { subtype: "radiant" }),
      order("sell", 5, { subtype: "radiant" }),
      order("sell", 100, { subtype: "radiant" }),
      order("sell", 12, { subtype: "radiant", perTrade: 6 }),
      order("buy", 2, { subtype: "radiant" }),
      order("buy", 1, { subtype: "radiant" }),
      order("sell", 1, { subtype: "intact" }),
      {
        ...order("sell", 1, { subtype: "radiant" }),
        user: { status: "offline" },
      },
    ],
  });
  assert.deepEqual(
    summarizeVariant(parsed, { subtype: "radiant", rank: null }),
    {
      listingPrice: 3,
      quickSalePrice: 2,
      sellOrderCount: 6,
      buyOrderCount: 2,
    },
  );
});

test("market price summaries distinguish a valid empty book", () => {
  assert.deepEqual(
    summarizeVariant(
      parseOrders({ apiVersion: "fixture", error: null, data: [] }),
      {
        subtype: null,
        rank: 0,
      },
    ),
    {
      listingPrice: null,
      quickSalePrice: null,
      sellOrderCount: 0,
      buyOrderCount: 0,
    },
  );
});
