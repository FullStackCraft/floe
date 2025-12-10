---
title: Black-Scholes Pricing
description: Calculate option prices using the Black-Scholes-Merton model.
order: 1
---

## Basic Option Pricing

This example demonstrates how to price both call and put options:

```typescript
import { blackScholes } from "@fullstackcraftllc/floe";

// Common parameters
const params = {
  spot: 100,
  strike: 105,
  timeToExpiry: 0.25,  // 3 months
  riskFreeRate: 0.05,
  volatility: 0.20
};

// Price a call option
const callPrice = blackScholes({
  ...params,
  optionType: "call"
});

// Price a put option
const putPrice = blackScholes({
  ...params,
  optionType: "put"
});

console.log(`Call Price: $${callPrice.toFixed(2)}`);
console.log(`Put Price: $${putPrice.toFixed(2)}`);
```

## With Dividend Yield

For stocks that pay dividends, include the continuous dividend yield:

```typescript
import { blackScholes } from "@fullstackcraftllc/floe";

const priceWithDividend = blackScholes({
  spot: 100,
  strike: 100,
  timeToExpiry: 0.5,
  riskFreeRate: 0.05,
  volatility: 0.25,
  optionType: "call",
  dividendYield: 0.02  // 2% annual dividend yield
});

console.log(`ATM Call with 2% dividend: $${priceWithDividend.toFixed(2)}`);
```

## Pricing an Options Chain

Calculate prices across multiple strikes:

```typescript
import { blackScholes } from "@fullstackcraftllc/floe";

const spot = 100;
const strikes = [90, 95, 100, 105, 110];
const baseParams = {
  spot,
  timeToExpiry: 0.25,
  riskFreeRate: 0.05,
  volatility: 0.20
};

const chain = strikes.map(strike => ({
  strike,
  call: blackScholes({ ...baseParams, strike, optionType: "call" }),
  put: blackScholes({ ...baseParams, strike, optionType: "put" })
}));

console.table(chain);
```
