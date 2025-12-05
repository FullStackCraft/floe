---
title: Recipes
description: Practical examples showing how to combine floe functions for real-world use cases.
order: 3
---

## Calculate Dealer Exposures Using Smoothed IV

```typescript
import {
  getIVSurfaces,
  calculateGammaVannaCharmExposures,
  OptionChain,
} from "@fullstackcraftllc/floe";

// Assume we have a large array of all options across all expiries for a given symbol
// As well as the spot price, risk-free rate, and dividend yield
// This would typically come from your broker API or market data provider
const spot = 450.50; // Current underlying price
const riskFreeRate = 0.05;   // as decimal (5%)
const dividendYield = 0.02;  // as decimal (2%)
const options = [...]; // array of NormalizedOption

// Bundle everything into an OptionChain
const chain: OptionChain = {
  symbol: 'SPY',
  spot,
  riskFreeRate,
  dividendYield,
  options
};

// Build IV surfaces with smoothing applied
const ivSurfaces = getIVSurfaces('blackscholes', 'totalvariance', chain);

// Calculate dealer gamma, vanna, and charm exposures
const exposures = calculateGammaVannaCharmExposures(chain, ivSurfaces);

// Each expiration now has aggregated exposure metrics
for (const expiry of exposures) {
  console.log(`Expiration: ${new Date(expiry.expiration).toDateString()}`);
  console.log(`  Total Gamma: ${expiry.totalGammaExposure.toLocaleString()}`);
  console.log(`  Total Vanna: ${expiry.totalVannaExposure.toLocaleString()}`);
  console.log(`  Total Charm: ${expiry.totalCharmExposure.toLocaleString()}`);
  console.log(`  Max Gamma Strike: ${expiry.strikeOfMaxGamma}`);
}
```


## Calculate Greeks Based on Real IV

```typescript
import {
  calculateGreeks,
  Option,
} from "@fullstackcraftllc/floe";


const option: Option = {
  optionType: 'call',
  strike: 105,
  expirationTimestamp: 1711929600000, // example expiration date
  mark: 2.50, // market price of the option
};

const spot = 450.50; // Current underlying price
const riskFreeRate = 0.05;   // as decimal (5%)
const dividendYield = 0.02;  // as decimal (2%)
const timeToExpirationInYears = 30 / 365; // example time to expiration

// first calculate the IV for the option using market price
const iv = impliedVolatility({
  spot
  strike
  timeToExpiry,
  riskFreeRate,
  optionPrice,
  optionType: "call"
});

// then use that IV to calculate the Greeks
const greeks = calculateGreeks(
  option,
  spot,
  riskFreeRate,
  dividendYield,
  volatility,
  timeToExpirationInYears
);

```

