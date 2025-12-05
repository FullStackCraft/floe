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
import { blackScholes, delta, gamma } from "@fullstackcraftllc/floe";

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
```

## Core Concepts

floe provides three main categories of functions:

1. **Pricing** - Black-Scholes-Merton option pricing with dividend adjustments
2. **Greeks** - Complete suite of first, second, and third-order Greeks
3. **Dealer Exposures** - Gamma, vanna, and charm exposure calculations

All functions use structured parameter objects for clarity and full TypeScript type safety.

## Next Steps

- Read the [API Reference](/documentation/api-reference) for complete function documentation
- Check out [Examples](/examples) for real-world usage patterns
