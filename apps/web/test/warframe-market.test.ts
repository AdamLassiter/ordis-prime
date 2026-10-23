import assert from "node:assert/strict";
import test from "node:test";
import { summarizeMarketTopOrders } from "../lib/warframe-market.ts";

test("market order summaries preserve the ranked top buy and sell offers", () => {
  assert.deepEqual(
    summarizeMarketTopOrders({
      apiVersion: "0.25.0",
      error: null,
      data: {
        sell: [
          { type: "sell", platinum: 12, quantity: 3, perTrade: 1 },
          { type: "sell", platinum: 15, quantity: 1, perTrade: 1 },
        ],
        buy: [{ type: "buy", platinum: 9, quantity: 2 }],
      },
    }),
    {
      apiVersion: "0.25.0",
      sell: { platinum: 12, quantity: 3, perTrade: 1 },
      buy: { platinum: 9, quantity: 2, perTrade: 1 },
      sellOrderCount: 2,
      buyOrderCount: 1,
    },
  );
});

test("market order summaries reject malformed prices", () => {
  assert.throws(
    () =>
      summarizeMarketTopOrders({
        apiVersion: "0.25.0",
        error: null,
        data: {
          sell: [{ type: "sell", platinum: 0, quantity: 1 }],
          buy: [],
        },
      }),
    /platinum is invalid/,
  );
});
