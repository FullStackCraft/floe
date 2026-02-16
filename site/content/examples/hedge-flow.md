---
title: Hedge Flow Analysis
description: Combine gamma and vanna into an actionable price-space response curve with a charm integral for time-decay pressure.
order: 5
---

## What is Hedge Flow Analysis?

Hedge flow analysis collapses the per-strike gamma, vanna, and charm exposures into two complementary views:

- **Hedge Impulse Curve**: A single curve across price space showing where dealer hedging amplifies or dampens moves. Combines gamma and vanna through the empirical spot-vol coupling (not arbitrary weights).
- **Charm Integral**: The cumulative expected delta change from time decay alone, from now until expiration.

These answer orthogonal questions: "what happens if price moves?" vs. "what happens from time passage alone?"

## Computing the Hedge Impulse Curve

The impulse curve is the core signal. At each price level S, it computes:

**H(S) = GEX(S) − (k / S) × VEX(S)**

where k is the spot-vol coupling coefficient derived automatically from the IV surface skew.

```typescript
import {
  computeHedgeImpulseCurve,
  calculateGammaVannaCharmExposures,
  getIVSurfaces,
  OptionChain,
} from "@fullstackcraftllc/floe";

// Build chain from your broker data
const chain: OptionChain = {
  symbol: 'SPY',
  spot: 600.50,
  riskFreeRate: 0.05,
  dividendYield: 0.02,
  options: allOptions,
};

// Build IV surfaces and exposures
const ivSurfaces = getIVSurfaces('blackscholes', 'totalvariance', chain);
const exposures = calculateGammaVannaCharmExposures(chain, ivSurfaces);

// Get the call surface for the nearest expiration
const nearestExpiry = exposures[0];
const callSurface = ivSurfaces.find(
  s => s.putCall === 'call' && s.expirationDate === nearestExpiry.expiration
);

// Compute the impulse curve
const curve = computeHedgeImpulseCurve(nearestExpiry, callSurface, {
  rangePercent: 3,       // ±3% price grid
  stepPercent: 0.05,     // 0.05% resolution
  kernelWidthStrikes: 2, // smooth over 2 strike spacings
});

// What's happening at current spot?
console.log(`Impulse at spot: ${curve.impulseAtSpot.toFixed(0)}`);
console.log(`Regime: ${curve.regime}`);
// 'pinned' = mean-reverting, 'expansion' = breakout likely,
// 'squeeze-up' / 'squeeze-down' = directional acceleration

// Where are the key levels?
for (const zc of curve.zeroCrossings) {
  console.log(`Flip level at $${zc.price.toFixed(1)} (${zc.direction})`);
}

// Basins = attractors (gamma walls), Peaks = accelerators (vacuums)
for (const ext of curve.extrema) {
  const label = ext.type === 'basin' ? 'ATTRACTOR' : 'ACCELERATOR';
  console.log(`${label} at $${ext.price.toFixed(1)} (impulse: ${ext.impulse.toFixed(0)})`);
}

// Directional bias
console.log(`Path of least resistance: ${curve.asymmetry.bias}`);
```

## Reading the Impulse Curve

The curve values tell you how dealers respond to price at each level:

- **Positive impulse** → dealer hedging dampens moves toward this level (mean-reversion, "sticky" price). These show up as basins in the curve — classic "gamma walls."
- **Negative impulse** → dealer hedging amplifies moves through this level (trend acceleration, "slippery" price). These are the peaks — "liquidity vacuums."
- **Zero crossings** → transitions between dampening and amplification. Price tends to decelerate as it approaches a rising crossing and accelerate through a falling crossing.

## Computing the Charm Integral

The charm integral shows the cumulative time-decay pressure from now until expiration, independent of price movement:

```typescript
import { computeCharmIntegral } from "@fullstackcraftllc/floe";

const charm = computeCharmIntegral(nearestExpiry, {
  timeStepMinutes: 15,  // 15-minute buckets
});

console.log(`Minutes to expiry: ${charm.minutesRemaining.toFixed(0)}`);
console.log(`Total charm to close: ${charm.totalCharmToClose.toLocaleString()}`);
console.log(`Direction: ${charm.direction}`);

// The cumulative curve shows how charm accelerates toward close
for (const bucket of charm.buckets) {
  console.log(`  ${bucket.minutesRemaining} min: cumulative ${bucket.cumulativeCEX.toLocaleString()}`);
}

// Which strikes are driving the charm pressure?
for (const sc of charm.strikeContributions.slice(0, 5)) {
  console.log(`  $${sc.strike}: ${(sc.fractionOfTotal * 100).toFixed(1)}% of total`);
}
```

## Combined Analysis

Use `analyzeHedgeFlow` to compute everything in one call:

```typescript
import { analyzeHedgeFlow } from "@fullstackcraftllc/floe";

const analysis = analyzeHedgeFlow(nearestExpiry, callSurface);

const { impulseCurve, charmIntegral, regimeParams } = analysis;

// Market regime derived from IV surface
console.log(`Market regime: ${regimeParams.regime}`);
console.log(`ATM IV: ${(regimeParams.atmIV * 100).toFixed(1)}%`);

// Impulse summary
console.log(`Impulse regime: ${impulseCurve.regime}`);
console.log(`Spot-vol coupling k: ${impulseCurve.spotVolCoupling.toFixed(2)}`);

// Charm summary
console.log(`Charm direction: ${charmIntegral.direction}`);
console.log(`Charm to close: ${charmIntegral.totalCharmToClose.toLocaleString()}`);
```

## Real-Time Updates with Live OI

When using `FloeClient` with live OI tracking, recompute the analysis as positioning changes:

```typescript
import {
  FloeClient,
  Broker,
  calculateGammaVannaCharmExposures,
  getIVSurfaces,
  analyzeHedgeFlow,
} from "@fullstackcraftllc/floe";

const client = new FloeClient({ verbose: false });
await client.connect(Broker.TRADIER, process.env.TRADIER_TOKEN!);

// Subscribe to options and underlying
client.subscribeToOptions(symbols);
client.subscribeToTickers(['SPY']);
await client.fetchOpenInterest();

// On each update cycle, recompute
function recompute(chain: OptionChain) {
  const surfaces = getIVSurfaces('blackscholes', 'totalvariance', chain);
  const exposures = calculateGammaVannaCharmExposures(chain, surfaces);
  const callSurface = surfaces.find(s => s.putCall === 'call');
  
  const analysis = analyzeHedgeFlow(exposures[0], callSurface);
  
  // Log the key signals
  console.log(`[${new Date().toLocaleTimeString()}]`);
  console.log(`  Regime: ${analysis.impulseCurve.regime}`);
  console.log(`  Impulse at spot: ${analysis.impulseCurve.impulseAtSpot.toFixed(0)}`);
  console.log(`  Bias: ${analysis.impulseCurve.asymmetry.bias}`);
  console.log(`  Charm direction: ${analysis.charmIntegral.direction}`);
  
  // When OI changes mid-session (new positions opened/closed),
  // both the impulse curve and charm integral automatically
  // reflect the new positioning landscape.
}
```

## Interpreting the Two Panels Together

The impulse curve and charm integral are intentionally separated because they represent different forces:

| Impulse Curve | Charm Integral | Interpretation |
|---------------|----------------|----------------|
| Pinned (positive at spot) | Buying | Strong support — dealers dampen moves AND time decay adds buying |
| Pinned | Selling | Contested — dampening now but time decay works against it |
| Expansion (negative at spot) | Buying | Breakout likely, but charm cushions the downside |
| Expansion | Selling | Most vulnerable — breakout acceleration with time decay adding selling pressure |
| Squeeze-up | Either | Upside acceleration — look for the nearest attractor above |
| Squeeze-down | Either | Downside acceleration — look for the nearest attractor below |
