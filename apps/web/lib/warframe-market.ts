export interface MarketOrderSummary {
  apiVersion: string;
  sell?: { platinum: number; quantity: number; perTrade: number };
  buy?: { platinum: number; quantity: number; perTrade: number };
  sellOrderCount: number;
  buyOrderCount: number;
}

export function summarizeMarketTopOrders(value: unknown): MarketOrderSummary {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Warframe.market response is not an object");
  const payload = value as Record<string, unknown>;
  if (payload.error) throw new Error("Warframe.market returned an error");
  if (typeof payload.apiVersion !== "string")
    throw new Error("Warframe.market response has no API version");
  if (
    !payload.data ||
    typeof payload.data !== "object" ||
    Array.isArray(payload.data)
  )
    throw new Error("Warframe.market response has no order data");
  const data = payload.data as Record<string, unknown>;
  const sell = parseOrders(data.sell, "sell");
  const buy = parseOrders(data.buy, "buy");
  return {
    apiVersion: payload.apiVersion,
    sell: sell[0],
    buy: buy[0],
    sellOrderCount: sell.length,
    buyOrderCount: buy.length,
  };
}

function parseOrders(
  value: unknown,
  expectedType: "sell" | "buy",
): Array<{ platinum: number; quantity: number; perTrade: number }> {
  if (!Array.isArray(value))
    throw new Error(`Warframe.market ${expectedType} orders are invalid`);
  return value.map((entry, index) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry))
      throw new Error(
        `Warframe.market ${expectedType} order ${index} is invalid`,
      );
    const order = entry as Record<string, unknown>;
    if (order.type !== expectedType)
      throw new Error(
        `Warframe.market ${expectedType} order ${index} has the wrong type`,
      );
    const platinum = positiveInteger(order.platinum, "platinum");
    const quantity = positiveInteger(order.quantity, "quantity");
    const perTrade =
      order.perTrade === undefined
        ? 1
        : positiveInteger(order.perTrade, "perTrade");
    return { platinum, quantity, perTrade };
  });
}

function positiveInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1)
    throw new Error(`Warframe.market order ${label} is invalid`);
  return value as number;
}
