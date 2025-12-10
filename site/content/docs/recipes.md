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

// Then use that IV to calculate the Greeks
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


## Build a Complete Option Chain Analysis

```typescript
import {
  blackScholes,
  calculateGreeks,
  calculateImpliedVolatility,
  getTimeToExpirationInYears,
  NormalizedOption,
  OptionChain,
} from "@fullstackcraftllc/floe";

// Simulated market data
const spot = 100;
const riskFreeRate = 0.05;
const dividendYield = 0.01;
const expirationTimestamp = Date.now() + 30 * 24 * 60 * 60 * 1000; // 30 days out
const timeToExpiry = getTimeToExpirationInYears(expirationTimestamp);

// Create a simple option chain
const strikes = [95, 97.5, 100, 102.5, 105];
const marketVols = [0.22, 0.20, 0.18, 0.20, 0.22]; // Volatility smile

const analysis = strikes.map((strike, i) => {
  const vol = marketVols[i];
  
  // Calculate theoretical prices
  const callPrice = blackScholes({
    spot,
    strike,
    timeToExpiry,
    riskFreeRate,
    volatility: vol,
    optionType: 'call',
    dividendYield,
  });
  
  const putPrice = blackScholes({
    spot,
    strike,
    timeToExpiry,
    riskFreeRate,
    volatility: vol,
    optionType: 'put',
    dividendYield,
  });
  
  // Calculate Greeks
  const callGreeks = calculateGreeks({
    spot,
    strike,
    timeToExpiry,
    riskFreeRate,
    volatility: vol,
    optionType: 'call',
    dividendYield,
  });
  
  const putGreeks = calculateGreeks({
    spot,
    strike,
    timeToExpiry,
    riskFreeRate,
    volatility: vol,
    optionType: 'put',
    dividendYield,
  });
  
  return {
    strike,
    vol: `${(vol * 100).toFixed(1)}%`,
    callPrice: callPrice.toFixed(2),
    putPrice: putPrice.toFixed(2),
    callDelta: callGreeks.delta.toFixed(3),
    putDelta: putGreeks.delta.toFixed(3),
    gamma: callGreeks.gamma.toFixed(4),
  };
});

console.table(analysis);
```


## Price Options Across Multiple Expirations

```typescript
import {
  blackScholes,
  calculateGreeks,
} from "@fullstackcraftllc/floe";

const spot = 100;
const strike = 100;  // ATM
const riskFreeRate = 0.05;
const volatility = 0.20;

// Different expiration periods in years
const expirations = [
  { label: '1 week', years: 7 / 365 },
  { label: '1 month', years: 30 / 365 },
  { label: '3 months', years: 90 / 365 },
  { label: '6 months', years: 180 / 365 },
  { label: '1 year', years: 1 },
];

console.log('ATM Option Analysis by Expiration');
console.log('='.repeat(70));

for (const exp of expirations) {
  const callPrice = blackScholes({
    spot,
    strike,
    timeToExpiry: exp.years,
    riskFreeRate,
    volatility,
    optionType: 'call',
  });
  
  const greeks = calculateGreeks({
    spot,
    strike,
    timeToExpiry: exp.years,
    riskFreeRate,
    volatility,
    optionType: 'call',
  });
  
  console.log(`\n${exp.label}:`);
  console.log(`  Call Price: $${callPrice.toFixed(2)}`);
  console.log(`  Delta: ${greeks.delta.toFixed(3)}`);
  console.log(`  Gamma: ${greeks.gamma.toFixed(4)}`);
  console.log(`  Theta: $${greeks.theta.toFixed(3)} per day`);
  console.log(`  Vega: $${greeks.vega.toFixed(3)} per 1% vol`);
}
```


## Reverse Engineer Strike from Target Delta

```typescript
import { calculateGreeks } from "@fullstackcraftllc/floe";

// Find a strike with approximately the target delta
function findStrikeForDelta(
  targetDelta: number,
  spot: number,
  timeToExpiry: number,
  volatility: number,
  riskFreeRate: number,
  optionType: 'call' | 'put'
): number {
  // Binary search for the strike
  let low = spot * 0.5;
  let high = spot * 1.5;
  
  for (let i = 0; i < 50; i++) {
    const mid = (low + high) / 2;
    
    const greeks = calculateGreeks({
      spot,
      strike: mid,
      timeToExpiry,
      riskFreeRate,
      volatility,
      optionType,
    });
    
    const delta = Math.abs(greeks.delta);
    
    if (Math.abs(delta - targetDelta) < 0.001) {
      return mid;
    }
    
    if (optionType === 'call') {
      // Higher strike = lower delta for calls
      if (delta > targetDelta) {
        low = mid;
      } else {
        high = mid;
      }
    } else {
      // Higher strike = higher |delta| for puts
      if (delta < targetDelta) {
        low = mid;
      } else {
        high = mid;
      }
    }
  }
  
  return (low + high) / 2;
}

// Example: Find the 25-delta call and put
const spot = 100;
const timeToExpiry = 30 / 365;
const volatility = 0.20;
const riskFreeRate = 0.05;

const call25Strike = findStrikeForDelta(0.25, spot, timeToExpiry, volatility, riskFreeRate, 'call');
const put25Strike = findStrikeForDelta(0.25, spot, timeToExpiry, volatility, riskFreeRate, 'put');

console.log(`25-Delta Call Strike: $${call25Strike.toFixed(2)}`);
console.log(`25-Delta Put Strike: $${put25Strike.toFixed(2)}`);
console.log(`Risk Reversal Width: $${(call25Strike - put25Strike).toFixed(2)}`);
```
