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
  volatility: 0.20,    // Annualized volatility
  optionType: "call",  // "call" or "put"
  dividend: 0.02       // Optional: continuous dividend yield
});
```

## Implied Volatility

Uses the Black-Scholes model with iterative bisection to compute the implied volatility given an option price.

```typescript
import { impliedVolatility } from "@fullstackcraftllc/floe";

const iv = impliedVolatility({
  spot: 100,
  strike: 105,
  timeToExpiry: 0.25,
  riskFreeRate: 0.05,
  optionPrice: 3.50,
  optionType: "call"
});
```

## Greeks

Calculate all greeks up to third order for European call and put options.

```typescript
import { calculateCallGreeks, calculatePutGreeks } from "@fullstackcraftllc/floe";

// Delta - rate of change of option price with respect to underlying
// Gamma - rate of change of delta with respect to underlying
// Theta - rate of change of option price with respect to time
// Vega - rate of change of option price with respect to volatility
// Rho - rate of change of option price with respect to interest rate
// Vanna - sensitivity of delta to volatility
// Charm - rate of change of delta with respect to time
// Vomma - sensitivity of vega to volatility
// Veta - sensitivity of vega to time
// Speed - rate of change of gamma with respect to underlying
// Zomma - rate of change of gamma with respect to volatility
// Color - rate of change of gamma with respect to time
// Ultima - sensitivity of vomma to volatility
const {
  delta,
  gamma,
  theta,
  vega,
  rho,
  vanna,
  charm,
  vomma,
  veta,
  speed,
  zomma,
  color,
  ultima
} = calculateCallGreeks({
  spot: 100,
  strike: 105,
  timeToExpiry: 0.25,
  riskFreeRate: 0.05,
  volatility: 0.20
});

const {
  delta,
  gamma,
  theta,
  vega,
  rho,
  vanna,
  charm,
  vomma,
  veta,
  speed,
  zomma,
  color,
  ultima
} = calculatePutGreeks({
  spot: 100,
  strike: 105,
  timeToExpiry: 0.25,
  riskFreeRate: 0.05,
  volatility: 0.20
});
```

## IV Surfaces

Generate implied volatility surfaces for all options across all expirations. Can be used in dealer exposure calculations.

```typescript
import { getIVSurfaces, OptionChain } from "@fullstackcraftllc/floe";

// Create an option chain with market context
const chain: OptionChain = {
  symbol: 'SPY',
  spot: 450.50,
  riskFreeRate: 0.05,    // as decimal (5%)
  dividendYield: 0.02,   // as decimal (2%)
  options: [...]         // array of NormalizedOption
};

const surfaces = getIVSurfaces('blackscholes', 'totalvariance', chain);

console.log(surfaces);
// surfaces is an array of IVSurface objects, each containing IV data per strike for a specific expiration:
//[
//  {
//    expirationDate: 1711929600000,
//    putCall: 'CALL',
//    strikes: [100, 105, 110, ...],
//    rawIVs: [0.20, 0.22, 0.25, ...],
//    smoothedIVs: [0.21, 0.23, 0.24, ...]
//  },
//  ...
//]
```

Lookup a specific IV from the surface:

```typescript
import { getIVForStrike } from "@fullstackcraftllc/floe";

const iv = getIVForStrike(surfaces, 1234567890000, 'call', 105);
console.log(iv);
// IV is the implied volatility for the 105 strike CALL option expiring on the given date
// 0.23 (i.e., 23%)
```

## Dealer Exposures

```typescript
import { calculateGammaVannaCharmExposures, OptionChain } from "@fullstackcraftllc/floe";

// Using the same chain from IV Surfaces
const exposures = calculateGammaVannaCharmExposures(chain, ivSurfaces);

console.log(exposures);
// exposures is an array of ExposurePerExpiry objects, each containing gamma, vanna, and charm exposures per strike for a specific expiration:
// [
//   {
//     expiration: 1711929600000,
//     spotPrice: 450.50,
//     totalGammaExposure: 1234567.89,
//     totalVannaExposure: 234567.89,
//     totalCharmExposure: 34567.89,
//     totalNetExposure: 1503703.67,
//     strikeOfMaxGamma: 455,
//     strikeOfMinGamma: 440,
//     strikeOfMaxVanna: 460,
//     strikeOfMinVanna: 435,
//     strikeOfMaxCharm: 450,
//     strikeOfMinCharm: 445,
//     strikeOfMaxNet: 455,
//     strikeOfMinNet: 440,
//     strikeExposures: [
//       {
//         strikePrice: 440,
//         gammaExposure: 123456.78,
//         vannaExposure: 23456.78,
//         charmExposure: 3456.78,
//         netExposure: 150370.34
//       },
//       ...
//     ]
//   },
//   ...
// ]
```

## Implied PDF

Estimate the market-implied probability distribution from option prices using Breeden-Litzenberger numerical differentiation.

### estimateImpliedProbabilityDistribution

Estimate the implied PDF for a single expiration from call option prices:

```typescript
import { 
  estimateImpliedProbabilityDistribution,
  NormalizedOption 
} from "@fullstackcraftllc/floe";

// Call options for a single expiry
const callOptions: NormalizedOption[] = [
  { strike: 495, bid: 11.50, ask: 11.70, optionType: "call", /* ... */ },
  { strike: 500, bid: 8.30, ask: 8.50, optionType: "call", /* ... */ },
  { strike: 505, bid: 5.60, ask: 5.80, optionType: "call", /* ... */ },
  // ... more strikes (need at least 3)
];

const result = estimateImpliedProbabilityDistribution(
  "QQQ",           // symbol
  502.50,          // current spot price
  callOptions      // call options for single expiry
);

if (result.success) {
  console.log(result.distribution);
  // {
  //   symbol: "QQQ",
  //   expiryDate: 1702598400000,
  //   calculationTimestamp: 1702512000000,
  //   underlyingPrice: 502.50,
  //   mostLikelyPrice: 505,
  //   medianPrice: 503,
  //   expectedValue: 502.8,
  //   expectedMove: 8.5,
  //   tailSkew: 1.05,
  //   cumulativeProbabilityAboveSpot: 0.52,
  //   cumulativeProbabilityBelowSpot: 0.48,
  //   strikeProbabilities: [
  //     { strike: 495, probability: 0.08 },
  //     { strike: 500, probability: 0.22 },
  //     { strike: 505, probability: 0.28 },
  //     ...
  //   ]
  // }
}
```

### estimateImpliedProbabilityDistributions

Process all expirations in a chain at once:

```typescript
import { estimateImpliedProbabilityDistributions } from "@fullstackcraftllc/floe";

const distributions = estimateImpliedProbabilityDistributions(
  "QQQ",           // symbol
  502.50,          // spot price
  chain.options    // all options (calls and puts, all expirations)
);

// Returns array of ImpliedProbabilityDistribution for each expiration
for (const dist of distributions) {
  console.log(`Expiry: ${new Date(dist.expiryDate).toDateString()}`);
  console.log(`  Mode: ${dist.mostLikelyPrice}`);
  console.log(`  Expected Move: ±${dist.expectedMove.toFixed(2)}`);
}
```

### Utility Functions

```typescript
import {
  getProbabilityInRange,
  getCumulativeProbability,
  getQuantile
} from "@fullstackcraftllc/floe";

// Probability of finishing between two strikes
const prob = getProbabilityInRange(distribution, 495, 510);
// 0.65 (65% chance of finishing between $495 and $510)

// Cumulative probability up to a price
const cumProb = getCumulativeProbability(distribution, 500);
// 0.35 (35% chance of finishing at or below $500)

// Find the strike at a given probability quantile
const p10 = getQuantile(distribution, 0.10);  // 10th percentile strike
const p90 = getQuantile(distribution, 0.90);  // 90th percentile strike
// Use for iron condor strike selection, confidence intervals, etc.
```


