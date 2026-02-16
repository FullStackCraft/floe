---
title: IV vs RV Analysis
description: Compare model-free implied volatility from options with tick-based realized volatility in real time.
order: 6
---

## What is IV vs RV Analysis?

This workflow compares:

- **Implied Volatility (IV)** from the option chain using model-free variance-swap methodology.
- **Realized Volatility (RV)** from actual price observations using quadratic variation.

Monitoring both together gives you a live view of whether options are pricing more or less movement than the underlying is actually realizing.

## 1. Compute Model-Free 0DTE IV

Use all calls and puts for one expiration:

```typescript
import { computeVarianceSwapIV, NormalizedOption } from "@fullstackcraftllc/floe";

const todayOptions: NormalizedOption[] = getTodayOptions(); // your chain slice
const spot = 600.0;
const riskFreeRate = 0.05;

const iv = computeVarianceSwapIV(todayOptions, spot, riskFreeRate);

console.log("0DTE IV:", (iv.impliedVolatility * 100).toFixed(2) + "%");
console.log("Forward:", iv.forward.toFixed(2));
console.log("K0:", iv.k0);
console.log("Contributing strikes:", iv.numStrikes);
```

## 2. Optional: Interpolate Across Two Terms

You can compute a constant-maturity estimate by blending near/far expirations:

```typescript
import { computeImpliedVolatility, NormalizedOption } from "@fullstackcraftllc/floe";

const nearTermOptions: NormalizedOption[] = getNearTermOptions();
const farTermOptions: NormalizedOption[] = getFarTermOptions();

const result = computeImpliedVolatility(
  nearTermOptions,
  600.0,
  0.05,
  farTermOptions,
  1 // targetDays
);

console.log("Interpolated IV:", (result.impliedVolatility * 100).toFixed(2) + "%");
console.log("Near-term IV:", (result.nearTerm.impliedVolatility * 100).toFixed(2) + "%");
console.log("Far-term IV:", ((result.farTerm?.impliedVolatility ?? 0) * 100).toFixed(2) + "%");
```

## 3. Compute Tick-Based RV

Pass all observed prices and timestamps:

```typescript
import { computeRealizedVolatility, PriceObservation } from "@fullstackcraftllc/floe";

const observations: PriceObservation[] = [
  { price: 600.10, timestamp: 1708099800000 },
  { price: 600.25, timestamp: 1708099860000 },
  { price: 599.80, timestamp: 1708099920000 },
  // ...streaming ticks
];

const rv = computeRealizedVolatility(observations);

console.log("RV:", (rv.realizedVolatility * 100).toFixed(2) + "%");
console.log("Observations:", rv.numObservations);
console.log("Elapsed (min):", rv.elapsedMinutes.toFixed(0));
console.log("Quadratic Variation:", rv.quadraticVariation.toFixed(8));
```

## 4. Track the IV-RV Spread

Compute the live spread and monitor flips:

```typescript
const spread = iv.impliedVolatility - rv.realizedVolatility;

console.log("IV - RV:", (spread * 100).toFixed(2) + " pts");

if (spread > 0) {
  console.log("Options imply more movement than has been realized.");
} else if (spread < 0) {
  console.log("Realized movement is exceeding implied expectations.");
} else {
  console.log("Implied and realized are currently aligned.");
}
```

## Practical Notes

- For 0DTE monitoring, recompute both IV and RV continuously as new quotes/ticks arrive.
- RV naturally stabilizes as more observations accumulate throughout the session.
- IV-RV is most useful as a **time series**, not a single point estimate.
