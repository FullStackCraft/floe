---
title: Dealer Exposures
description: Calculate gamma, vanna, and charm exposures for market analysis.
order: 3
---

## Understanding Dealer Exposures

Dealers who sell options to customers accumulate exposure that they must hedge. This hedging activity can amplify or dampen market moves. The `calculateGammaVannaCharmExposures` function computes these exposures across an entire option chain.

## Key Concepts

- **Gamma Exposure (GEX)**: Shows how much dealers need to buy/sell the underlying as price moves. Negative GEX means dealers buy dips and sell rallies (stabilizing). Positive GEX means dealers sell dips and buy rallies (destabilizing).

- **Vanna Exposure**: Sensitivity to changes in implied volatility. Shows how dealer hedging changes when IV moves.

- **Charm Exposure**: How delta (and therefore hedging needs) changes as time passes. Important for understanding end-of-day and expiration flows.

## Complete Exposure Calculation

Calculate all exposures across an option chain:

```typescript
import {
  calculateGammaVannaCharmExposures,
  getIVSurfaces,
  OptionChain,
  NormalizedOption
} from "@fullstackcraftllc/floe";

// Build your option chain with market data
const options: NormalizedOption[] = [
  {
    occSymbol: 'SPY251220C00440000',
    underlying: 'SPY',
    strike: 440,
    expiration: '2025-12-20',
    expirationTimestamp: 1766188800000,
    optionType: 'call',
    bid: 15.20,
    ask: 15.40,
    bidSize: 100,
    askSize: 150,
    mark: 15.30,
    last: 15.25,
    volume: 5000,
    openInterest: 10000,
    impliedVolatility: 0.18,
    timestamp: Date.now()
  },
  // ... more options with openInterest data
];

const chain: OptionChain = {
  symbol: 'SPY',
  spot: 450.50,
  riskFreeRate: 0.05,
  dividendYield: 0.02,
  options
};

// First, build IV surfaces
const ivSurfaces = getIVSurfaces('blackscholes', 'totalvariance', chain);

// Then calculate exposures
const exposures = calculateGammaVannaCharmExposures(chain, ivSurfaces);

// Analyze results by expiration
for (const expiry of exposures) {
  console.log(`\nExpiration: ${new Date(expiry.expiration).toDateString()}`);
  console.log(`  Spot: $${expiry.spotPrice}`);
  console.log(`  Total Gamma: ${expiry.totalGammaExposure.toLocaleString()}`);
  console.log(`  Total Vanna: ${expiry.totalVannaExposure.toLocaleString()}`);
  console.log(`  Total Charm: ${expiry.totalCharmExposure.toLocaleString()}`);
  console.log(`  Net Exposure: ${expiry.totalNetExposure.toLocaleString()}`);
  console.log(`  Max Gamma Strike: $${expiry.strikeOfMaxGamma}`);
  console.log(`  Min Gamma Strike: $${expiry.strikeOfMinGamma}`);
}
```

## Strike-Level Analysis

Drill down into individual strike exposures:

```typescript
// Using exposures from above
for (const expiry of exposures) {
  console.log(`\n=== ${new Date(expiry.expiration).toDateString()} ===`);
  console.log('Strike    | Gamma Exp     | Vanna Exp     | Charm Exp     | Net Exp');
  console.log('-'.repeat(75));
  
  // Sort by strike price
  const sortedStrikes = [...expiry.strikeExposures].sort(
    (a, b) => a.strikePrice - b.strikePrice
  );
  
  for (const strike of sortedStrikes) {
    const gamma = strike.gammaExposure.toLocaleString().padStart(12);
    const vanna = strike.vannaExposure.toLocaleString().padStart(12);
    const charm = strike.charmExposure.toLocaleString().padStart(12);
    const net = strike.netExposure.toLocaleString().padStart(12);
    
    console.log(`$${strike.strikePrice.toString().padStart(6)} | ${gamma} | ${vanna} | ${charm} | ${net}`);
  }
}
```

## Hedging Flow Estimation

Calculate how many shares dealers need to trade:

```typescript
import { calculateSharesNeededToCover } from "@fullstackcraftllc/floe";

// Sum up net exposure across all expirations
const totalNetExposure = exposures.reduce(
  (sum, exp) => sum + exp.totalNetExposure,
  0
);

// SPY has approximately 900M shares outstanding
const sharesOutstanding = 900_000_000;
const spot = 450.50;

const coverage = calculateSharesNeededToCover(
  sharesOutstanding,
  totalNetExposure,
  spot
);

console.log('\n=== Dealer Hedging Analysis ===');
console.log(`Total Net Exposure: ${totalNetExposure.toLocaleString()}`);
console.log(`Dealers need to: ${coverage.actionToCover}`);
console.log(`Shares to trade: ${coverage.sharesToCover.toLocaleString()}`);
console.log(`Implied price move: ${coverage.impliedMoveToCover.toFixed(2)}%`);
console.log(`Resulting price: $${coverage.resultingSpotToCover.toFixed(2)}`);
```

## Finding Key Levels

Identify important gamma levels for trading:

```typescript
// Find the "gamma wall" - strike with highest absolute gamma
let maxGammaStrike = 0;
let maxGamma = 0;

for (const expiry of exposures) {
  for (const strike of expiry.strikeExposures) {
    if (Math.abs(strike.gammaExposure) > maxGamma) {
      maxGamma = Math.abs(strike.gammaExposure);
      maxGammaStrike = strike.strikePrice;
    }
  }
}

console.log(`\nGamma Wall: $${maxGammaStrike}`);
console.log(`Gamma at wall: ${maxGamma.toLocaleString()}`);

// Find zero gamma level (flip point)
const nearestExpiry = exposures[0];
if (nearestExpiry) {
  const sortedByStrike = [...nearestExpiry.strikeExposures].sort(
    (a, b) => a.strikePrice - b.strikePrice
  );
  
  // Find where gamma crosses zero
  for (let i = 1; i < sortedByStrike.length; i++) {
    const prev = sortedByStrike[i - 1];
    const curr = sortedByStrike[i];
    
    if (prev.gammaExposure < 0 && curr.gammaExposure >= 0) {
      console.log(`Zero Gamma Level: ~$${(prev.strikePrice + curr.strikePrice) / 2}`);
      break;
    }
  }
}
```

## Real-World Integration

Combine with FloeClient for live exposure tracking:

```typescript
import {
  FloeClient,
  Broker,
  calculateGammaVannaCharmExposures,
  getIVSurfaces,
  generateOCCSymbolsAroundSpot
} from "@fullstackcraftllc/floe";

async function trackLiveExposures() {
  const client = new FloeClient({ verbose: false });
  await client.connect(Broker.TRADIER, process.env.TRADIER_TOKEN!);
  
  // Generate symbols for SPY options
  const symbols = generateOCCSymbolsAroundSpot('SPY', '2025-12-20', 450, {
    strikesAbove: 20,
    strikesBelow: 20,
    strikeIncrementInDollars: 1
  });
  
  const optionData = new Map();
  
  client.on('optionUpdate', (option) => {
    optionData.set(option.occSymbol, option);
  });
  
  client.subscribeToOptions(symbols);
  await client.fetchOpenInterest();
  
  // Wait for data to populate
  await new Promise(resolve => setTimeout(resolve, 5000));
  
  // Build chain from live data
  const chain = {
    symbol: 'SPY',
    spot: 450.50,  // Get from ticker update
    riskFreeRate: 0.05,
    dividendYield: 0.02,
    options: Array.from(optionData.values())
  };
  
  // Calculate exposures
  const surfaces = getIVSurfaces('blackscholes', 'totalvariance', chain);
  const exposures = calculateGammaVannaCharmExposures(chain, surfaces);
  
  // Output analysis
  console.log('Live Exposure Analysis:');
  for (const exp of exposures) {
    console.log(`${new Date(exp.expiration).toDateString()}: Net ${exp.totalNetExposure.toLocaleString()}`);
  }
  
  client.disconnect();
}

trackLiveExposures();
```
