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
