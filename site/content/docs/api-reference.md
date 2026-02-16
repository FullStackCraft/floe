---
title: API Reference
description: Complete documentation for all floe functions and types.
order: 2
---

## Pricing Functions

### blackScholes

Calculates the theoretical price of a European option using the Black-Scholes-Merton model.

```typescript
import { blackScholes } from "@fullstackcraftllc/floe";

const price = blackScholes({
  spot: 100,           // Current price of underlying
  strike: 105,         // Option strike price
  timeToExpiry: 0.25,  // Time to expiration in years
  riskFreeRate: 0.05,  // Annual risk-free interest rate
  volatility: 0.20,    // Annualized volatility (as decimal)
  optionType: "call",  // "call" or "put"
  dividendYield: 0.02  // Optional: continuous dividend yield (as decimal)
});
```

## Implied Volatility

### calculateImpliedVolatility

Uses the Black-Scholes model with iterative bisection to compute the implied volatility given an option price.

```typescript
import { calculateImpliedVolatility } from "@fullstackcraftllc/floe";

const iv = calculateImpliedVolatility(
  3.50,      // price: observed option price
  100,       // spot: current underlying price
  105,       // strike: option strike price
  0.05,      // riskFreeRate: annual risk-free rate (as decimal)
  0.02,      // dividendYield: continuous dividend yield (as decimal)
  0.25,      // timeToExpiry: time to expiration in years
  "call"     // optionType: "call" or "put"
);

console.log(`Implied Volatility: ${iv.toFixed(2)}%`);
// Note: Returns IV as a percentage (e.g., 20.0 for 20% volatility)
```

## Greeks

### calculateGreeks

Calculate all Greeks up to third order for European call and put options. Returns a complete Greeks object containing the option price and all sensitivity measures.

```typescript
import { calculateGreeks } from "@fullstackcraftllc/floe";

const greeks = calculateGreeks({
  spot: 100,
  strike: 105,
  timeToExpiry: 0.25,
  riskFreeRate: 0.05,
  volatility: 0.20,
  optionType: "call",      // "call" or "put"
  dividendYield: 0.02      // optional
});

// Access individual Greeks from the returned object:
console.log(`Price: ${greeks.price}`);
console.log(`Delta: ${greeks.delta}`);
console.log(`Gamma: ${greeks.gamma}`);
console.log(`Theta: ${greeks.theta}`);   // per day
console.log(`Vega: ${greeks.vega}`);     // per 1% volatility change
console.log(`Rho: ${greeks.rho}`);       // per 1% rate change
```

### Greeks Interface

The calculateGreeks function returns a Greeks object with all sensitivity measures:

```typescript
interface Greeks {
  price: number;   // Option theoretical value
  delta: number;   // Rate of change of option price with respect to underlying
  gamma: number;   // Rate of change of delta with respect to underlying
  theta: number;   // Time decay (per day)
  vega: number;    // Sensitivity to volatility (per 1% change)
  rho: number;     // Sensitivity to interest rate (per 1% change)
  vanna: number;   // Sensitivity of delta to volatility
  charm: number;   // Delta decay (per day)
  volga: number;   // Sensitivity of vega to volatility (also known as vomma)
  speed: number;   // Rate of change of gamma
  zomma: number;   // Sensitivity of gamma to volatility
  color: number;   // Gamma decay
  ultima: number;  // Sensitivity of volga to volatility
}
```

## Time Utilities

### getTimeToExpirationInYears

Convert an expiration timestamp to time in years:

```typescript
import { getTimeToExpirationInYears } from "@fullstackcraftllc/floe";

const expirationTimestamp = Date.now() + 30 * 24 * 60 * 60 * 1000; // 30 days from now
const timeToExpiry = getTimeToExpirationInYears(expirationTimestamp);
// Returns: ~0.0822 (30/365)
```

### getMillisecondsToExpiration

Get milliseconds until expiration:

```typescript
import { getMillisecondsToExpiration } from "@fullstackcraftllc/floe";

const ms = getMillisecondsToExpiration(expirationTimestamp);
```

## Statistical Utilities

### cumulativeNormalDistribution

Standard normal cumulative distribution function (CDF):

```typescript
import { cumulativeNormalDistribution } from "@fullstackcraftllc/floe";

const prob = cumulativeNormalDistribution(1.96);
// Returns: ~0.975 (97.5% probability)
```

### normalPDF

Standard normal probability density function:

```typescript
import { normalPDF } from "@fullstackcraftllc/floe";

const density = normalPDF(0);
// Returns: ~0.3989 (peak of the normal curve)
```

## IV Surfaces

### getIVSurfaces

Generate implied volatility surfaces for all options across all expirations. Used as input for dealer exposure calculations.

```typescript
import { getIVSurfaces, OptionChain } from "@fullstackcraftllc/floe";

const chain: OptionChain = {
  symbol: 'SPY',
  spot: 450.50,
  riskFreeRate: 0.05,
  dividendYield: 0.02,
  options: normalizedOptions
};

const surfaces = getIVSurfaces('blackscholes', 'totalvariance', chain);
// Returns array of IVSurface objects with rawIVs and smoothedIVs
```

### getIVForStrike

Lookup a specific IV from the surface:

```typescript
import { getIVForStrike } from "@fullstackcraftllc/floe";

const iv = getIVForStrike(surfaces, expirationTimestamp, 'call', 105);
// Returns smoothed IV as percentage (e.g., 23.0 for 23%)
```

### smoothTotalVarianceSmile

Apply total variance smoothing to a volatility smile:

```typescript
import { smoothTotalVarianceSmile } from "@fullstackcraftllc/floe";

const smoothedIVs = smoothTotalVarianceSmile(
  [90, 95, 100, 105, 110],  // strikes
  [22, 20, 18, 20, 22],      // raw IVs as percentages
  0.25                        // time to expiry in years
);
```

## Dealer Exposures

### calculateGammaVannaCharmExposures

Calculate aggregate dealer exposures across an option chain:

```typescript
import { 
  calculateGammaVannaCharmExposures, 
  getIVSurfaces 
} from "@fullstackcraftllc/floe";

const ivSurfaces = getIVSurfaces('blackscholes', 'totalvariance', chain);
const exposureVariants = calculateGammaVannaCharmExposures(chain, ivSurfaces);

// exposureVariants contains canonical, stateWeighted, and flowDelta modes.
// Project canonical mode if downstream code expects ExposurePerExpiry.
const exposures = exposureVariants.map(e => ({ spotPrice: e.spotPrice, expiration: e.expiration, ...e.canonical }));

for (const expiry of exposures) {
  console.log(`Expiration: ${new Date(expiry.expiration).toDateString()}`);
  console.log(`  Total Gamma: ${expiry.totalGammaExposure}`);
  console.log(`  Total Vanna: ${expiry.totalVannaExposure}`);
  console.log(`  Total Charm: ${expiry.totalCharmExposure}`);
}
```

### calculateSharesNeededToCover

Calculate dealer hedging requirements:

```typescript
import { calculateSharesNeededToCover } from "@fullstackcraftllc/floe";

const coverage = calculateSharesNeededToCover(
  900_000_000,   // shares outstanding
  -5_000_000,    // net exposure
  450.50         // spot price
);

console.log(`Action: ${coverage.actionToCover}`);
console.log(`Shares: ${coverage.sharesToCover}`);
console.log(`Implied Move: ${coverage.impliedMoveToCover}%`);
```

## Implied PDF

### estimateImpliedProbabilityDistribution

Estimate implied probability distribution for a single expiration:

```typescript
import { estimateImpliedProbabilityDistribution } from "@fullstackcraftllc/floe";

const result = estimateImpliedProbabilityDistribution("QQQ", 502.50, callOptions);

if (result.success) {
  const dist = result.distribution;
  console.log(`Mode: ${dist.mostLikelyPrice}`);
  console.log(`Expected Move: ${dist.expectedMove}`);
}
```

### estimateImpliedProbabilityDistributions

Process all expirations at once:

```typescript
import { estimateImpliedProbabilityDistributions } from "@fullstackcraftllc/floe";

const distributions = estimateImpliedProbabilityDistributions("QQQ", 502.50, options);
```

### getProbabilityInRange

Get probability of finishing in a price range:

```typescript
import { getProbabilityInRange } from "@fullstackcraftllc/floe";

const prob = getProbabilityInRange(distribution, 495, 510);
// Returns probability (e.g., 0.65 for 65%)
```

### getCumulativeProbability

Get cumulative probability up to a price:

```typescript
import { getCumulativeProbability } from "@fullstackcraftllc/floe";

const prob = getCumulativeProbability(distribution, 500);
```

### getQuantile

Get strike at a probability quantile:

```typescript
import { getQuantile } from "@fullstackcraftllc/floe";

const p10 = getQuantile(distribution, 0.10);  // 10th percentile
const p90 = getQuantile(distribution, 0.90);  // 90th percentile
```

## Exposure-Adjusted Implied PDF

### estimateExposureAdjustedPDF

Modify the Breeden-Litzenberger implied PDF to account for dealer gamma, vanna, and charm positioning effects:

```typescript
import {
  estimateExposureAdjustedPDF,
  calculateGammaVannaCharmExposures,
  getIVSurfaces,
} from "@fullstackcraftllc/floe";

const ivSurfaces = getIVSurfaces('blackscholes', 'totalvariance', chain);
const exposureVariants = calculateGammaVannaCharmExposures(chain, ivSurfaces);
const exposures = exposureVariants.map(e => ({ spotPrice: e.spotPrice, expiration: e.expiration, ...e.canonical }));

// Use call options for the same expiration as the exposures
const callOptions = chain.options.filter(
  o => o.optionType === 'call' && o.expirationTimestamp === exposures[0].expiration
);

const result = estimateExposureAdjustedPDF(
  'SPY',
  chain.spot,
  callOptions,
  exposures[0],      // ExposurePerExpiry for the target expiration
  {}                  // Optional: partial ExposureAdjustmentConfig overrides
);

if (result.success) {
  console.log(`Baseline mode: $${result.baseline.mostLikelyPrice}`);
  console.log(`Adjusted mode: $${result.adjusted.mostLikelyPrice}`);
  console.log(`Mean shift: ${result.comparison.meanShift.toFixed(2)}`);
  console.log(`Skew change: ${result.comparison.skewChange.toFixed(4)}`);
  console.log(`Kurtosis change: ${result.comparison.kurtosisChange.toFixed(4)}`);
}
```

### Preset Configurations

Four regime-specific configurations are exported:

```typescript
import {
  DEFAULT_ADJUSTMENT_CONFIG,  // Balanced for normal markets
  LOW_VOL_CONFIG,             // Strong gamma pinning, moderate vanna
  CRISIS_CONFIG,              // Amplified vanna cascade, weak pinning
  OPEX_CONFIG,                // Strong pinning + accelerated charm
} from "@fullstackcraftllc/floe";

// Use a preset
const result = estimateExposureAdjustedPDF('SPY', spot, calls, exposures[0], CRISIS_CONFIG);
```

### getEdgeAtPrice

Compare cumulative probabilities between baseline and adjusted distributions at a given price:

```typescript
import { getEdgeAtPrice } from "@fullstackcraftllc/floe";

// Positive edge = adjusted PDF assigns more probability below this price
const edge = getEdgeAtPrice(result, 445.0);
console.log(`Edge at $445: ${(edge * 100).toFixed(2)}%`);
```

### getSignificantAdjustmentLevels

Find strikes where the exposure adjustment has the largest effect:

```typescript
import { getSignificantAdjustmentLevels } from "@fullstackcraftllc/floe";

const levels = getSignificantAdjustmentLevels(result, 0.01); // 1% threshold

for (const level of levels) {
  console.log(`$${level.strike}: baseline ${(level.baselineProb * 100).toFixed(1)}% → adjusted ${(level.adjustedProb * 100).toFixed(1)}% (edge: ${(level.edge * 100).toFixed(2)}%)`);
}
```

## Hedge Flow Analysis

Combines dealer gamma and vanna exposures into an actionable price-space response curve, paired with a charm integral that captures time-decay pressure independently.

### deriveRegimeParams

Extract market regime parameters from the IV surface:

```typescript
import { deriveRegimeParams, getIVSurfaces } from "@fullstackcraftllc/floe";

const ivSurfaces = getIVSurfaces('blackscholes', 'totalvariance', chain);

// Use a call surface for regime derivation
const callSurface = ivSurfaces.find(s => s.putCall === 'call');
const regime = deriveRegimeParams(callSurface, chain.spot);

console.log(`Regime: ${regime.regime}`);         // 'calm' | 'normal' | 'stressed' | 'crisis'
console.log(`ATM IV: ${(regime.atmIV * 100).toFixed(1)}%`);
console.log(`Spot-Vol Correlation: ${regime.impliedSpotVolCorr.toFixed(3)}`);
console.log(`Vol of Vol: ${regime.impliedVolOfVol.toFixed(4)}`);
console.log(`Expected Daily Vol Move: ${(regime.expectedDailyVolMove * 100).toFixed(2)} pts`);
```

### computeHedgeImpulseCurve

Compute the hedge impulse curve H(S) = GEX(S) - (k/S) × VEX(S) across a price grid:

```typescript
import {
  computeHedgeImpulseCurve,
  calculateGammaVannaCharmExposures,
  getIVSurfaces,
} from "@fullstackcraftllc/floe";

const ivSurfaces = getIVSurfaces('blackscholes', 'totalvariance', chain);
const exposureVariants = calculateGammaVannaCharmExposures(chain, ivSurfaces);
const exposures = exposureVariants.map(e => ({ spotPrice: e.spotPrice, expiration: e.expiration, ...e.canonical }));
const callSurface = ivSurfaces.find(s => s.putCall === 'call');

const curve = computeHedgeImpulseCurve(
  exposures[0],    // ExposurePerExpiry for target expiration
  callSurface,     // IVSurface for regime/k derivation
  {                // Optional HedgeImpulseConfig
    rangePercent: 3,         // ±3% price grid (default)
    stepPercent: 0.05,       // 0.05% grid step (default)
    kernelWidthStrikes: 2,   // kernel = 2 × strike spacing (default)
  }
);

// Instantaneous reading at current spot
console.log(`Impulse at spot: ${curve.impulseAtSpot.toFixed(0)}`);
console.log(`Slope at spot: ${curve.slopeAtSpot.toFixed(0)}`);
console.log(`Regime: ${curve.regime}`);
console.log(`Spot-vol coupling k: ${curve.spotVolCoupling.toFixed(2)}`);
console.log(`Strike spacing: ${curve.strikeSpacing}`);
console.log(`Kernel width: ${curve.kernelWidth.toFixed(1)} points`);

// Key levels
console.log(`
Zero crossings (flip levels):`);
for (const zc of curve.zeroCrossings) {
  console.log(`  $${zc.price.toFixed(1)} (${zc.direction})`);
}

console.log(`
Attractors (positive impulse basins):`);
for (const ext of curve.extrema.filter(e => e.type === 'basin')) {
  console.log(`  $${ext.price.toFixed(1)} (impulse: ${ext.impulse.toFixed(0)})`);
}

console.log(`
Accelerators (negative impulse peaks):`);
for (const ext of curve.extrema.filter(e => e.type === 'peak')) {
  console.log(`  $${ext.price.toFixed(1)} (impulse: ${ext.impulse.toFixed(0)})`);
}

// Directional asymmetry
const a = curve.asymmetry;
console.log(`
Directional bias: ${a.bias}`);
console.log(`Asymmetry ratio: ${a.asymmetryRatio.toFixed(2)}`);

// Nearest attractors
if (curve.nearestAttractorAbove) {
  console.log(`Nearest attractor above: $${curve.nearestAttractorAbove.toFixed(1)}`);
}
if (curve.nearestAttractorBelow) {
  console.log(`Nearest attractor below: $${curve.nearestAttractorBelow.toFixed(1)}`);
}
```

### computeCharmIntegral

Compute the cumulative charm exposure from now until expiration:

```typescript
import { computeCharmIntegral } from "@fullstackcraftllc/floe";

const charm = computeCharmIntegral(
  exposures[0],    // ExposurePerExpiry
  { timeStepMinutes: 15 }  // Optional CharmIntegralConfig
);

console.log(`Minutes remaining: ${charm.minutesRemaining.toFixed(0)}`);
console.log(`Total charm to close: ${charm.totalCharmToClose.toLocaleString()}`);
console.log(`Direction: ${charm.direction}`);  // 'buying' | 'selling' | 'neutral'

// Time-bucketed curve for visualization
console.log(`\nCharm curve (${charm.buckets.length} buckets):`);
for (const bucket of charm.buckets.slice(0, 5)) {
  console.log(`  ${bucket.minutesRemaining.toFixed(0)} min remaining: cumulative ${bucket.cumulativeCEX.toLocaleString()}`);
}

// Per-strike breakdown (top contributors)
console.log(`\nTop charm contributors:`);
for (const sc of charm.strikeContributions.slice(0, 5)) {
  console.log(`  $${sc.strike}: ${sc.charmExposure.toLocaleString()} (${(sc.fractionOfTotal * 100).toFixed(1)}%)`);
}
```

### analyzeHedgeFlow

Convenience function that computes both the impulse curve and charm integral in a single call:

```typescript
import { analyzeHedgeFlow } from "@fullstackcraftllc/floe";

const analysis = analyzeHedgeFlow(
  exposures[0],    // ExposurePerExpiry
  callSurface,     // IVSurface
  { rangePercent: 3, kernelWidthStrikes: 2 },  // Optional impulse config
  { timeStepMinutes: 15 }                       // Optional charm config
);

// Access both panels
const { impulseCurve, charmIntegral, regimeParams } = analysis;

console.log(`Regime: ${regimeParams.regime}`);
console.log(`Impulse regime: ${impulseCurve.regime}`);
console.log(`Impulse at spot: ${impulseCurve.impulseAtSpot.toFixed(0)}`);
console.log(`Charm to close: ${charmIntegral.totalCharmToClose.toLocaleString()}`);
console.log(`Charm direction: ${charmIntegral.direction}`);
```

## Model-Free Implied Volatility

Computes implied volatility from the full option chain using the CBOE variance swap methodology. Model-free (no Black-Scholes inversion required) and applicable to any optionable underlying.

### computeVarianceSwapIV

Compute model-free implied variance for a single expiration:

```typescript
import { computeVarianceSwapIV } from "@fullstackcraftllc/floe";

// Pass all options for one expiration (both calls and puts)
const todayOptions = chain.options.filter(
  o => o.expirationTimestamp === todayExpiration
);

const result = computeVarianceSwapIV(todayOptions, chain.spot, 0.05);

console.log(`Implied Vol: ${(result.impliedVolatility * 100).toFixed(1)}%`);
console.log(`Forward: $${result.forward.toFixed(2)}`);
console.log(`K₀ (ATM strike): $${result.k0}`);
console.log(`Time to expiry: ${(result.timeToExpiry * 365).toFixed(2)} days`);
console.log(`Strikes contributing: ${result.numStrikes}`);
console.log(`Put contribution: ${result.putContribution.toFixed(6)}`);
console.log(`Call contribution: ${result.callContribution.toFixed(6)}`);
```

### computeImpliedVolatility

Single-term or two-term interpolated implied volatility. Supports the standard CBOE VIX interpolation when two expirations are provided:

```typescript
import { computeImpliedVolatility } from "@fullstackcraftllc/floe";

// Single-term: IV from one expiration
const singleTerm = computeImpliedVolatility(todayOptions, chain.spot, 0.05);
console.log(`0DTE IV: ${(singleTerm.impliedVolatility * 100).toFixed(1)}%`);

// Two-term interpolation: bracket a target maturity
const tomorrowOptions = chain.options.filter(
  o => o.expirationTimestamp === tomorrowExpiration
);

const interpolated = computeImpliedVolatility(
  todayOptions,          // near-term options
  chain.spot,
  0.05,
  tomorrowOptions,       // far-term options
  1                      // target: 1-day constant maturity
);

console.log(`Interpolated IV: ${(interpolated.impliedVolatility * 100).toFixed(1)}%`);
console.log(`Is interpolated: ${interpolated.isInterpolated}`);
console.log(`Near-term IV: ${(interpolated.nearTerm.impliedVolatility * 100).toFixed(1)}%`);
console.log(`Far-term IV: ${(interpolated.farTerm?.impliedVolatility ?? 0 * 100).toFixed(1)}%`);
```

## Realized Volatility

Computes annualized realized volatility from price observations using quadratic variation. Tick-based, stateless, no windowing — pass all observations and it computes from the full series.

### computeRealizedVolatility

```typescript
import { computeRealizedVolatility, PriceObservation } from "@fullstackcraftllc/floe";

// Accumulate price observations from streaming data
const observations: PriceObservation[] = [
  { price: 600.10, timestamp: 1708099800000 },
  { price: 600.25, timestamp: 1708099860000 },
  { price: 599.80, timestamp: 1708099920000 },
  // ... every tick from the session
];

const rv = computeRealizedVolatility(observations);

console.log(`Realized Vol: ${(rv.realizedVolatility * 100).toFixed(1)}%`);
console.log(`Observations: ${rv.numObservations}`);
console.log(`Returns computed: ${rv.numReturns}`);
console.log(`Elapsed: ${rv.elapsedMinutes.toFixed(0)} minutes`);
console.log(`Quadratic variation: ${rv.quadraticVariation.toFixed(8)}`);
```

## OCC Symbol Utilities

### buildOCCSymbol

Build an OCC-formatted option symbol:

```typescript
import { buildOCCSymbol } from "@fullstackcraftllc/floe";

const symbol = buildOCCSymbol({
  symbol: 'AAPL',
  expiration: '2025-01-17',
  optionType: 'call',
  strike: 150,
  padded: false  // optional, default false
});
// Returns: 'AAPL250117C00150000'
```

### parseOCCSymbol

Parse an OCC symbol into components:

```typescript
import { parseOCCSymbol } from "@fullstackcraftllc/floe";

const parsed = parseOCCSymbol('AAPL250117C00150000');
// Returns: { symbol: 'AAPL', expiration: Date, optionType: 'call', strike: 150 }
```

### generateStrikesAroundSpot

Generate strike prices around a spot price:

```typescript
import { generateStrikesAroundSpot } from "@fullstackcraftllc/floe";

const strikes = generateStrikesAroundSpot({
  spot: 450,
  strikesAbove: 10,
  strikesBelow: 10,
  strikeIncrementInDollars: 5
});
// Returns: [400, 405, 410, ..., 495, 500]
```

### generateOCCSymbolsForStrikes

Generate OCC symbols for specific strikes:

```typescript
import { generateOCCSymbolsForStrikes } from "@fullstackcraftllc/floe";

const symbols = generateOCCSymbolsForStrikes(
  'SPY',
  '2025-12-20',
  [440, 445, 450, 455, 460],
  ['call', 'put']  // optional, default both
);
```

### generateOCCSymbolsAroundSpot

Convenience function combining strike generation and OCC symbol creation:

```typescript
import { generateOCCSymbolsAroundSpot } from "@fullstackcraftllc/floe";

const symbols = generateOCCSymbolsAroundSpot('SPY', '2025-12-20', 600, {
  strikesAbove: 10,
  strikesBelow: 10,
  strikeIncrementInDollars: 1
});
```

## Broker Adapters

### createOptionChain

Create an option chain from raw broker data:

```typescript
import { createOptionChain } from "@fullstackcraftllc/floe";

const chain = createOptionChain(
  'SPY',           // symbol
  450.50,          // spot
  0.05,            // riskFreeRate
  0.02,            // dividendYield
  rawBrokerData,   // raw options from broker
  'schwab'         // broker name for adapter selection
);
```

### getAdapter

Get a specific broker adapter:

```typescript
import { getAdapter } from "@fullstackcraftllc/floe";

const adapter = getAdapter('schwab');
const normalizedOption = adapter(rawOptionData);
```

### Available Adapters

```typescript
import { 
  genericAdapter,
  schwabAdapter,
  ibkrAdapter,
  tdaAdapter,
  brokerAdapters 
} from "@fullstackcraftllc/floe";

// brokerAdapters is a map: { generic, schwab, ibkr, tda }
```

## Real-Time Market Data (FloeClient)

### Supported Brokers

| Broker | Enum Value | Authentication |
|--------|------------|----------------|
| Tradier | `Broker.TRADIER` | API Token |
| TastyTrade | `Broker.TASTYTRADE` | Session Token |
| TradeStation | `Broker.TRADESTATION` | OAuth Token |
| Charles Schwab | `Broker.SCHWAB` | OAuth Token |
| Interactive Brokers | `Broker.IBKR` | OAuth Token |

### Basic Usage

```typescript
import { FloeClient, Broker } from "@fullstackcraftllc/floe";

const client = new FloeClient({ verbose: false });
await client.connect(Broker.TRADIER, 'your-api-token');

client.on('optionUpdate', (option) => {
  console.log(`${option.occSymbol}: ${option.bid} / ${option.ask}`);
});

client.on('tickerUpdate', (ticker) => {
  console.log(`${ticker.symbol}: ${ticker.spot}`);
});

client.subscribeToOptions(['SPY251220C00600000']);
client.subscribeToTickers(['SPY']);
await client.fetchOpenInterest();

client.disconnect();
```

### Direct Broker Client Access

```typescript
import { TradierClient, TastyTradeClient, TradeStationClient } from "@fullstackcraftllc/floe";

// Use broker clients directly for advanced scenarios
const tradier = new TradierClient(token, { verbose: true });
```

## Core Types

### OptionType

```typescript
type OptionType = 'call' | 'put';
```

### BlackScholesParams

```typescript
interface BlackScholesParams {
  spot: number;
  strike: number;
  timeToExpiry: number;
  volatility: number;
  riskFreeRate: number;
  optionType: OptionType;
  dividendYield?: number;
}
```

### NormalizedOption

```typescript
interface NormalizedOption {
  occSymbol: string;
  underlying: string;
  strike: number;
  expiration: string;
  expirationTimestamp: number;
  optionType: OptionType;
  bid: number;
  bidSize: number;
  ask: number;
  askSize: number;
  mark: number;
  last: number;
  volume: number;
  openInterest: number;
  liveOpenInterest?: number;
  impliedVolatility: number;
  timestamp: number;
}
```

### NormalizedTicker

```typescript
interface NormalizedTicker {
  symbol: string;
  spot: number;
  bid: number;
  bidSize: number;
  ask: number;
  askSize: number;
  last: number;
  volume: number;
  timestamp: number;
}
```

### OptionChain

```typescript
interface OptionChain {
  symbol: string;
  spot: number;
  riskFreeRate: number;
  dividendYield: number;
  options: NormalizedOption[];
}
```

### IVSurface

```typescript
interface IVSurface {
  expirationDate: number;
  putCall: OptionType;
  strikes: number[];
  rawIVs: number[];
  smoothedIVs: number[];
}
```

### ExposureVector

```typescript
interface ExposureVector {
  gammaExposure: number;
  vannaExposure: number;
  charmExposure: number;
  netExposure: number;
}
```

### ExposureModeBreakdown

```typescript
interface ExposureModeBreakdown {
  totalGammaExposure: number;
  totalVannaExposure: number;
  totalCharmExposure: number;
  totalNetExposure: number;
  strikeOfMaxGamma: number;
  strikeOfMinGamma: number;
  strikeOfMaxVanna: number;
  strikeOfMinVanna: number;
  strikeOfMaxCharm: number;
  strikeOfMinCharm: number;
  strikeOfMaxNet: number;
  strikeOfMinNet: number;
  strikeExposures: StrikeExposure[];
}
```

### StrikeExposureVariants

```typescript
interface StrikeExposureVariants {
  strikePrice: number;
  canonical: ExposureVector;
  stateWeighted: ExposureVector;
  flowDelta: ExposureVector;
}
```

### ExposureVariantsPerExpiry

```typescript
interface ExposureVariantsPerExpiry {
  spotPrice: number;
  expiration: number;
  canonical: ExposureModeBreakdown;
  stateWeighted: ExposureModeBreakdown;
  flowDelta: ExposureModeBreakdown;
  strikeExposureVariants: StrikeExposureVariants[];
}
```

### ExposurePerExpiry (Canonical Projection)

```typescript
interface ExposurePerExpiry {
  spotPrice: number;
  expiration: number;
  totalGammaExposure: number;
  totalVannaExposure: number;
  totalCharmExposure: number;
  totalNetExposure: number;
  strikeOfMaxGamma: number;
  strikeOfMinGamma: number;
  strikeOfMaxVanna: number;
  strikeOfMinVanna: number;
  strikeOfMaxCharm: number;
  strikeOfMinCharm: number;
  strikeOfMaxNet: number;
  strikeOfMinNet: number;
  strikeExposures: StrikeExposure[];
}
```

### ImpliedProbabilityDistribution

```typescript
interface ImpliedProbabilityDistribution {
  symbol: string;
  expiryDate: number;
  calculationTimestamp: number;
  underlyingPrice: number;
  strikeProbabilities: StrikeProbability[];
  mostLikelyPrice: number;
  medianPrice: number;
  expectedValue: number;
  expectedMove: number;
  tailSkew: number;
  cumulativeProbabilityAboveSpot: number;
  cumulativeProbabilityBelowSpot: number;
}
```

### RegimeParams

```typescript
type MarketRegime = 'calm' | 'normal' | 'stressed' | 'crisis';

interface RegimeParams {
  regime: MarketRegime;
  atmIV: number;                 // decimal (e.g. 0.18 for 18%)
  impliedSpotVolCorr: number;    // typically [-0.9, -0.5] for indices
  impliedVolOfVol: number;
  expectedDailyMove: number;
  expectedDailyVolMove: number;
}
```

### HedgeImpulseCurve

```typescript
interface HedgeImpulseCurve {
  spot: number;
  expiration: number;
  computedAt: number;
  spotVolCoupling: number;       // k coefficient derived from IV skew
  kernelWidth: number;           // in price units
  strikeSpacing: number;         // detected modal strike spacing
  curve: HedgeImpulsePoint[];    // full price grid
  impulseAtSpot: number;         // H(S) at current spot
  slopeAtSpot: number;           // dH/dS at current spot
  zeroCrossings: ZeroCrossing[];
  extrema: ImpulseExtremum[];
  asymmetry: DirectionalAsymmetry;
  regime: ImpulseRegime;         // 'pinned' | 'expansion' | 'squeeze-up' | 'squeeze-down' | 'neutral'
  nearestAttractorAbove: number | null;
  nearestAttractorBelow: number | null;
}

interface HedgeImpulsePoint {
  price: number;
  gamma: number;    // kernel-smoothed GEX at this price
  vanna: number;    // kernel-smoothed VEX at this price
  impulse: number;  // gamma - (k/S) * vanna
}

interface ZeroCrossing {
  price: number;
  direction: 'rising' | 'falling';
}

interface ImpulseExtremum {
  price: number;
  impulse: number;
  type: 'basin' | 'peak';  // basin = attractor, peak = accelerator
}

interface DirectionalAsymmetry {
  upside: number;
  downside: number;
  integrationRangePercent: number;
  bias: 'up' | 'down' | 'neutral';
  asymmetryRatio: number;
}
```

### CharmIntegral

```typescript
interface CharmIntegral {
  spot: number;
  expiration: number;
  computedAt: number;
  minutesRemaining: number;
  totalCharmToClose: number;
  direction: 'buying' | 'selling' | 'neutral';
  buckets: CharmBucket[];
  strikeContributions: Array<{
    strike: number;
    charmExposure: number;
    fractionOfTotal: number;
  }>;
}

interface CharmBucket {
  minutesRemaining: number;
  instantaneousCEX: number;
  cumulativeCEX: number;
}
```

### VarianceSwapResult

```typescript
interface VarianceSwapResult {
  impliedVolatility: number;   // annualized, decimal
  annualizedVariance: number;
  forward: number;             // forward price F
  k0: number;                  // ATM strike
  timeToExpiry: number;
  expiration: number;
  numStrikes: number;
  putContribution: number;
  callContribution: number;
}
```

### ImpliedVolatilityResult

```typescript
interface ImpliedVolatilityResult {
  impliedVolatility: number;
  nearTerm: VarianceSwapResult;
  farTerm: VarianceSwapResult | null;
  targetDays: number | null;
  isInterpolated: boolean;
}
```

### PriceObservation

```typescript
interface PriceObservation {
  price: number;
  timestamp: number;  // milliseconds
}
```

### RealizedVolatilityResult

```typescript
interface RealizedVolatilityResult {
  realizedVolatility: number;   // annualized, decimal
  annualizedVariance: number;
  quadraticVariation: number;   // raw sum of squared log returns
  numObservations: number;
  numReturns: number;
  elapsedMinutes: number;
  elapsedYears: number;
  firstObservation: number;
  lastObservation: number;
}
```
