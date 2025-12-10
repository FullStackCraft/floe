---
title: Getting Started
description: Install floe and start calculating options analytics in minutes.
order: 1
---

## Installation

Install floe via npm:

```bash
npm install @fullstackcraftllc/floe
```

## Quick Start

Import the functions you need and start calculating:

```typescript
import { blackScholes, calculateGreeks } from "@fullstackcraftllc/floe";

// Calculate option price
const price = blackScholes({
  spot: 100,
  strike: 105,
  timeToExpiry: 0.25,
  riskFreeRate: 0.05,
  volatility: 0.20,
  optionType: "call"
});

console.log(`Option Price: $${price.toFixed(2)}`);

// Calculate all Greeks at once
const greeks = calculateGreeks({
  spot: 100,
  strike: 105,
  timeToExpiry: 0.25,
  riskFreeRate: 0.05,
  volatility: 0.20,
  optionType: "call"
});

console.log(`Delta: ${greeks.delta.toFixed(4)}`);
console.log(`Gamma: ${greeks.gamma.toFixed(6)}`);
console.log(`Theta: ${greeks.theta.toFixed(4)} per day`);
console.log(`Vega: ${greeks.vega.toFixed(4)} per 1% vol`);
```

## Core Concepts

floe provides these main categories of functions:

1. **Pricing** - Black-Scholes-Merton option pricing with dividend adjustments
2. **Greeks** - Complete suite of first, second, and third-order Greeks via `calculateGreeks()`
3. **Implied Volatility** - Calculate IV from market prices via `calculateImpliedVolatility()`
4. **IV Surfaces** - Build smoothed volatility surfaces across strikes and expirations
5. **Dealer Exposures** - Gamma, vanna, and charm exposure calculations
6. **Implied PDF** - Risk-neutral probability density function from option prices
7. **Real-Time Data** - Broker-agnostic streaming of normalized options data via `FloeClient`

All functions use structured parameter objects for clarity and full TypeScript type safety.

## Next Steps

- Read the [API Reference](/documentation/api-reference) for complete function documentation
- Check out [Examples](/examples) for real-world usage patterns
