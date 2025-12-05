---
title: Greeks Calculation
description: Calculate all option Greeks for risk management and trading decisions.
order: 2
---

## Complete Greeks Profile

Calculate all Greeks for a given option:

```typescript
import {
  delta,
  gamma,
  theta,
  vega,
  rho,
  vanna,
  charm,
  vomma,
  speed
} from "@fullstackcraftllc/floe";

const params = {
  spot: 100,
  strike: 100,
  timeToExpiry: 0.25,
  riskFreeRate: 0.05,
  volatility: 0.20
};

const greeksProfile = {
  // First-order
  delta: delta({ ...params, optionType: "call" }),
  gamma: gamma(params),
  theta: theta({ ...params, optionType: "call" }),
  vega: vega(params),
  rho: rho({ ...params, optionType: "call" }),
  
  // Second-order
  vanna: vanna(params),
  charm: charm({ ...params, optionType: "call" }),
  vomma: vomma(params),
  
  // Third-order
  speed: speed(params)
};

console.log("Greeks Profile for ATM Call:");
console.table(greeksProfile);
```

## Delta Hedging Calculation

Calculate shares needed to delta-hedge a position:

```typescript
import { delta } from "@fullstackcraftllc/floe";

const contracts = 10;
const multiplier = 100;  // 100 shares per contract

const d = delta({
  spot: 150,
  strike: 155,
  timeToExpiry: 0.0833,  // 1 month
  riskFreeRate: 0.05,
  volatility: 0.25,
  optionType: "call"
});

const sharesToHedge = contracts * multiplier * d;
console.log(`Delta: ${d.toFixed(4)}`);
console.log(`Shares to short for delta-neutral: ${sharesToHedge.toFixed(0)}`);
```

## Greeks Across Strikes

Visualize how delta changes across the option chain:

```typescript
import { delta, gamma } from "@fullstackcraftllc/floe";

const spot = 100;
const strikes = Array.from({ length: 21 }, (_, i) => 80 + i * 2);

const baseParams = {
  spot,
  timeToExpiry: 0.0833,
  riskFreeRate: 0.05,
  volatility: 0.20
};

const greeksChain = strikes.map(strike => ({
  strike,
  moneyness: ((spot / strike) * 100 - 100).toFixed(1) + "%",
  callDelta: delta({ ...baseParams, strike, optionType: "call" }).toFixed(4),
  putDelta: delta({ ...baseParams, strike, optionType: "put" }).toFixed(4),
  gamma: gamma({ ...baseParams, strike }).toFixed(6)
}));

console.table(greeksChain);
```
