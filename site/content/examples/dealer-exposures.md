---
title: Dealer Exposures
description: Calculate gamma, vanna, and charm exposures for market analysis.
order: 3
---

## Understanding Dealer Exposures

Dealers who sell options to customers accumulate exposure that they must hedge. This hedging activity can amplify or dampen market moves.

## Gamma Exposure (GEX)

Gamma exposure tells you how much dealers need to buy or sell the underlying as price moves:

```typescript
import { dealerGammaExposure } from "@fullstackcraftllc/floe";

const gex = dealerGammaExposure({
  spot: 450,
  strike: 450,
  timeToExpiry: 0.0192,  // 7 days
  riskFreeRate: 0.05,
  volatility: 0.15,
  openInterest: 50000,
  optionType: "call"
});

console.log(`Gamma Exposure: ${gex.toLocaleString()} shares per 1% move`);
```

## Vanna Exposure

Vanna exposure shows sensitivity to changes in implied volatility:

```typescript
import { dealerVannaExposure } from "@fullstackcraftllc/floe";

const vex = dealerVannaExposure({
  spot: 450,
  strike: 440,
  timeToExpiry: 0.0833,
  riskFreeRate: 0.05,
  volatility: 0.18,
  openInterest: 25000,
  optionType: "put"
});

console.log(`Vanna Exposure: ${vex.toLocaleString()}`);
```

## Charm Exposure

Charm exposure measures how gamma changes as time passes:

```typescript
import { dealerCharmExposure } from "@fullstackcraftllc/floe";

const chex = dealerCharmExposure({
  spot: 450,
  strike: 455,
  timeToExpiry: 0.00274,  // 1 day (0DTE)
  riskFreeRate: 0.05,
  volatility: 0.20,
  openInterest: 100000,
  optionType: "call"
});

console.log(`Charm Exposure: ${chex.toLocaleString()}`);
```

## Aggregate Exposure Across Chain

Calculate total exposure across all strikes:

```typescript
import { 
  dealerGammaExposure,
  dealerVannaExposure 
} from "@fullstackcraftllc/floe";

interface OptionData {
  strike: number;
  callOI: number;
  putOI: number;
}

const optionsChain: OptionData[] = [
  { strike: 440, callOI: 10000, putOI: 15000 },
  { strike: 445, callOI: 20000, putOI: 25000 },
  { strike: 450, callOI: 50000, putOI: 45000 },
  { strike: 455, callOI: 30000, putOI: 20000 },
  { strike: 460, callOI: 15000, putOI: 10000 },
];

const spot = 450;
const baseParams = {
  spot,
  timeToExpiry: 0.0192,
  riskFreeRate: 0.05,
  volatility: 0.16
};

let totalGEX = 0;

for (const opt of optionsChain) {
  const callGEX = dealerGammaExposure({
    ...baseParams,
    strike: opt.strike,
    openInterest: opt.callOI,
    optionType: "call"
  });
  
  const putGEX = dealerGammaExposure({
    ...baseParams,
    strike: opt.strike,
    openInterest: opt.putOI,
    optionType: "put"
  });
  
  totalGEX += callGEX + putGEX;
}

console.log(`Total GEX: ${totalGEX.toLocaleString()} shares`);
```
