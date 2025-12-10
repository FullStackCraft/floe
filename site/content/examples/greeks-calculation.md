---
title: Greeks Calculation
description: Calculate all option Greeks for risk management and trading decisions.
order: 2
---

## Complete Greeks Profile

Calculate all Greeks for a given option using `calculateGreeks()`:

```typescript
import { calculateGreeks } from "@fullstackcraftllc/floe";

const params = {
  spot: 100,
  strike: 100,
  timeToExpiry: 0.25,
  riskFreeRate: 0.05,
  volatility: 0.20
};

// Calculate all Greeks for a call option
const callGreeks = calculateGreeks({
  ...params,
  optionType: "call"
});

// Calculate all Greeks for a put option
const putGreeks = calculateGreeks({
  ...params,
  optionType: "put"
});

console.log("ATM Call Greeks:");
console.log(`  Price: $${callGreeks.price.toFixed(2)}`);
console.log(`  Delta: ${callGreeks.delta.toFixed(4)}`);
console.log(`  Gamma: ${callGreeks.gamma.toFixed(6)}`);
console.log(`  Theta: ${callGreeks.theta.toFixed(4)} per day`);
console.log(`  Vega: ${callGreeks.vega.toFixed(4)} per 1% vol`);
console.log(`  Rho: ${callGreeks.rho.toFixed(4)} per 1% rate`);

console.log("\nSecond-Order Greeks:");
console.log(`  Vanna: ${callGreeks.vanna.toFixed(6)}`);
console.log(`  Charm: ${callGreeks.charm.toFixed(6)} per day`);
console.log(`  Volga: ${callGreeks.volga.toFixed(6)}`);

console.log("\nThird-Order Greeks:");
console.log(`  Speed: ${callGreeks.speed.toFixed(8)}`);
console.log(`  Zomma: ${callGreeks.zomma.toFixed(8)}`);
console.log(`  Color: ${callGreeks.color.toFixed(8)}`);
console.log(`  Ultima: ${callGreeks.ultima.toFixed(8)}`);
```

## Delta Hedging Calculation

Calculate shares needed to delta-hedge a position:

```typescript
import { calculateGreeks } from "@fullstackcraftllc/floe";

const contracts = 10;
const multiplier = 100;  // 100 shares per contract

const greeks = calculateGreeks({
  spot: 150,
  strike: 155,
  timeToExpiry: 0.0833,  // 1 month
  riskFreeRate: 0.05,
  volatility: 0.25,
  optionType: "call"
});

const sharesToHedge = contracts * multiplier * greeks.delta;
console.log(`Delta: ${greeks.delta.toFixed(4)}`);
console.log(`Shares to short for delta-neutral: ${sharesToHedge.toFixed(0)}`);
```

## Greeks Across Strikes

Visualize how Greeks change across the option chain:

```typescript
import { calculateGreeks } from "@fullstackcraftllc/floe";

const spot = 100;
const strikes = Array.from({ length: 21 }, (_, i) => 80 + i * 2);

const baseParams = {
  spot,
  timeToExpiry: 0.0833,
  riskFreeRate: 0.05,
  volatility: 0.20
};

const greeksChain = strikes.map(strike => {
  const callGreeks = calculateGreeks({ ...baseParams, strike, optionType: "call" });
  const putGreeks = calculateGreeks({ ...baseParams, strike, optionType: "put" });
  
  return {
    strike,
    moneyness: ((spot / strike) * 100 - 100).toFixed(1) + "%",
    callDelta: callGreeks.delta.toFixed(4),
    putDelta: putGreeks.delta.toFixed(4),
    gamma: callGreeks.gamma.toFixed(6)  // Gamma is the same for calls and puts
  };
});

console.table(greeksChain);
```

## Gamma Scalping Analysis

Monitor gamma exposure for a position:

```typescript
import { calculateGreeks } from "@fullstackcraftllc/floe";

const position = {
  contracts: 50,
  strike: 100,
  optionType: "call" as const
};

const spot = 100;
const multiplier = 100;

const greeks = calculateGreeks({
  spot,
  strike: position.strike,
  timeToExpiry: 0.0192,  // 7 days
  riskFreeRate: 0.05,
  volatility: 0.20,
  optionType: position.optionType
});

const totalGamma = position.contracts * multiplier * greeks.gamma;
const dollarGamma = totalGamma * spot * 0.01;  // Dollar gamma per 1% move

console.log(`Position Gamma: ${totalGamma.toFixed(2)}`);
console.log(`Dollar Gamma (per 1% move): $${dollarGamma.toFixed(2)}`);
console.log(`Theta Decay: $${(position.contracts * multiplier * greeks.theta).toFixed(2)} per day`);
```

## Time Decay Analysis

Track theta decay as expiration approaches:

```typescript
import { calculateGreeks } from "@fullstackcraftllc/floe";

const baseParams = {
  spot: 100,
  strike: 100,
  riskFreeRate: 0.05,
  volatility: 0.20,
  optionType: "call" as const
};

// Days to expiration
const daysToExpiry = [90, 60, 30, 14, 7, 3, 1];

console.log("Time Decay for ATM Call:");
console.log("-".repeat(60));

for (const days of daysToExpiry) {
  const timeToExpiry = days / 365;
  const greeks = calculateGreeks({ ...baseParams, timeToExpiry });
  
  console.log(
    `${days.toString().padStart(2)} days | ` +
    `Price: $${greeks.price.toFixed(2).padStart(5)} | ` +
    `Delta: ${greeks.delta.toFixed(3)} | ` +
    `Theta: $${greeks.theta.toFixed(3)} per day | ` +
    `Gamma: ${greeks.gamma.toFixed(4)}`
  );
}
```
