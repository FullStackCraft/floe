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

## 5. Vol Response Z-Score (Is Vol Bid or Offered?)

The raw IV-RV spread tells you *whether* IV exceeds RV, but not whether this is abnormal given the price path. The vol response model answers: "Is IV moving more than expected given what the underlying is doing?"

```typescript
import {
  buildVolResponseObservation,
  computeVolResponseZScore,
  VolResponseObservation,
} from "@fullstackcraftllc/floe";

// Accumulate observations as the session progresses
const observations: VolResponseObservation[] = [];
let previous: { iv: number; spot: number } | null = null;

function onTick(iv: number, rv: number, spot: number) {
  if (previous) {
    const obs = buildVolResponseObservation(
      { iv, rv, spot, timestamp: Date.now() },
      previous
    );
    observations.push(obs);

    const result = computeVolResponseZScore(observations);

    if (result.isValid) {
      console.log(`Z-Score: ${result.zScore.toFixed(2)} (${result.signal})`);
      console.log(`R²: ${result.rSquared.toFixed(3)}`);
      console.log(`Expected ΔIV: ${(result.expectedDeltaIV * 10000).toFixed(1)} bps`);
      console.log(`Observed ΔIV: ${(result.observedDeltaIV * 10000).toFixed(1)} bps`);
    } else {
      console.log(`Warming up: ${result.numObservations}/${result.minObservations}`);
    }
  }

  previous = { iv, spot };
}
```

**Signal interpretation:**
- **z > 1.5 (vol_bid)**: IV is rising faster than the price action justifies — stress or demand for protection.
- **z < -1.5 (vol_offered)**: IV is falling faster than expected — supply or vol crush.
- **Near zero (neutral)**: Normal vol response given the return path.

The model uses an expanding window from session open, so it requires ~30 ticks to warm up. After that, the z-score becomes increasingly reliable as the regression coefficients stabilize.

## Practical Notes

- For 0DTE monitoring, recompute both IV and RV continuously as new quotes/ticks arrive.
- RV naturally stabilizes as more observations accumulate throughout the session.
- IV-RV is most useful as a **time series**, not a single point estimate.
- The vol response z-score adds a third dimension: whether the IV movement is *expected* or *anomalous* given price action.
