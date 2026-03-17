---
title: Dataset API Clients
description: Query hindsight, dealer minute surfaces, and AMT datasets with the unified ApiClient.
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
