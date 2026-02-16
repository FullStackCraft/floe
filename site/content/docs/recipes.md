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

// Bundle everything into the OptionChain type
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
const exposureVariants = calculateGammaVannaCharmExposures(chain, ivSurfaces);
const exposures = exposureVariants.map(e => ({ spotPrice: e.spotPrice, expiration: e.expiration, ...e.canonical }));

// Each expiration now has aggregated exposure metrics
for (const expiry of exposures) {
  console.log(`Expiration: ${new Date(expiry.expiration).toDateString()}`);
  console.log(`  Total Gamma: ${expiry.totalGammaExposure.toLocaleString()}`);
  console.log(`  Total Vanna: ${expiry.totalVannaExposure.toLocaleString()}`);
  console.log(`  Total Charm: ${expiry.totalCharmExposure.toLocaleString()}`);
  console.log(`  Max Gamma Strike: ${expiry.strikeOfMaxGamma}`);
}
```


## Calculate Greeks Based on Market IV

```typescript
import {
  calculateGreeks,
  calculateImpliedVolatility,
  getTimeToExpirationInYears,
} from "@fullstackcraftllc/floe";

// Market data for an option
const optionData = {
  optionType: 'call' as const,
  strike: 105,
  expirationTimestamp: 1711929600000,  // example expiration date
  marketPrice: 2.50,  // observed market price of the option
};

const spot = 100;
const riskFreeRate = 0.05;   // as decimal (5%)
const dividendYield = 0.02;  // as decimal (2%)

// Calculate time to expiration
const timeToExpiry = getTimeToExpirationInYears(optionData.expirationTimestamp);

// First, calculate the IV from the market price
// calculateImpliedVolatility returns IV as a percentage (e.g., 20.0 for 20%)
const ivPercent = calculateImpliedVolatility(
  optionData.marketPrice,  // price
  spot,                     // spot
  optionData.strike,        // strike
  riskFreeRate,             // riskFreeRate
  dividendYield,            // dividendYield
  timeToExpiry,             // timeToExpiry
  optionData.optionType     // optionType
);

console.log(`Implied Volatility: ${ivPercent.toFixed(2)}%`);

// Then use that IV to re-calculate the Greeks
// Note: calculateGreeks expects volatility as a decimal (0.20 for 20%)
const greeks = calculateGreeks({
  spot,
  strike: optionData.strike,
  timeToExpiry,
  riskFreeRate,
  volatility: ivPercent / 100,  // Convert percentage to decimal
  optionType: optionData.optionType,
  dividendYield,
});

console.log(`Theoretical Price: $${greeks.price.toFixed(2)}`);
console.log(`Delta: ${greeks.delta.toFixed(4)}`);
console.log(`Gamma: ${greeks.gamma.toFixed(6)}`);
console.log(`Theta: ${greeks.theta.toFixed(4)} per day`);
console.log(`Vega: ${greeks.vega.toFixed(4)} per 1% vol`);
```

