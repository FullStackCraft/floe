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
