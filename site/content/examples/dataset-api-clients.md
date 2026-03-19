---
title: Dataset API Clients
description: Query hindsight, dealer minute surfaces, AMT, and options screener datasets with the unified ApiClient.
order: 7
---

## Create the client

```typescript
import { NewApiClient } from "@fullstackcraftllc/floe";

const apiKey = process.env.FLOE_DATA_API_KEY!;
const client = NewApiClient(apiKey);
```

## Fetch hindsight economic report data

```typescript
const hindsightEvents = await client.GetHindsightData(undefined, {
  start_date: "2026-03-01",
  end_date: "2026-03-16",
  country: "US",
  min_volatility: 2,
  event: "CPI",
});

console.log(`hindsight rows: ${hindsightEvents.length}`);
console.log(hindsightEvents[0]?.event_name, hindsightEvents[0]?.actual);
```

## Fetch a hindsight sample payload

```typescript
const sample = await client.GetHindsightSample(undefined);
console.log(`sample rows: ${sample.length}`);
```

## Fetch dealer minute surfaces

```typescript
const rows = await client.GetDealerMinuteSurfaces(undefined, {
  symbol: "SPY",
  trade_date: "2026-03-10",
});

console.log(`minute rows: ${rows.length}`);
console.log(rows[0]?.minute_ts, rows[0]?.spot, rows[0]?.vix);
console.log(rows[0]?.surfaces.gamma?.[0]);
```

## Fetch AMT session stats

```typescript
const sessionRows = await client.GetAMTSessionStats(undefined, {
  symbol: "NQ",
  session_id: "2026-03-10",
});

console.log(`amt session rows: ${sessionRows.length}`);
console.log(sessionRows[0]?.session_data?.sessionType);
```

## Fetch AMT events

```typescript
const eventRows = await client.GetAMTEvents(undefined, {
  symbol: "NQ",
  session_id: "2026-03-10",
});

console.log(`amt event rows: ${eventRows.length}`);
console.log(eventRows[0]?.events?.[0]?.event_messages);
```

## Fetch Wheel Screener data

```typescript
const wheelData = await client.GetWheelScreenerData(undefined, {
  strategy: "CC",
  page_size: 10,
  order_by: "score",
  order_direction: "desc",
  extra_params: {
    min_score: "70",
    sector: "Technology",
  },
});

console.log(`wheel screener rows: ${wheelData.data.length}`);
console.log(`total: ${wheelData.total}, page: ${wheelData.page}`);
console.log(wheelData.data[0]?.ticker, wheelData.data[0]?.score);
```

## Fetch LEAPS Screener data

```typescript
const leapsData = await client.GetLeapsScreenerData(undefined, {
  strategy: "LC",
  extra_params: {
    min_dte: "180",
    max_delta: "0.7",
  },
});

console.log(`leaps screener rows: ${leapsData.data.length}`);
console.log(leapsData.data[0]?.ticker, leapsData.data[0]?.strategy);
```

## Fetch Option Screener data

```typescript
const optionData = await client.GetOptionScreenerData(undefined, {
  strategy: "CDS",
  search: "AAPL",
  page: 1,
  page_size: 25,
});

console.log(`option screener rows: ${optionData.data.length}`);
console.log(`total: ${optionData.total}`);
console.log(optionData.data[0]?.ticker, optionData.data[0]?.max_profit);
```
