---
title: Implied Probability Distribution
description: Extract market-implied probability distributions from option prices using Breeden-Litzenberger.
order: 4
---

## What is the Implied PDF?

The implied probability density function (PDF) represents the market's collective view of where an asset's price will be at expiration. It's derived from option prices using **Breeden-Litzenberger** methodology—computing the second derivative of call prices with respect to strike price.

Take these raw values with a grain of salt, as the quite literally represent the 'neutral, risk free _closing_ price' of the underlying ONLY.

The implied PDF gives you:
- **Mode**: Most likely price at expiration
- **Median**: 50th percentile price
- **Expected Move**: Standard deviation of the distribution
- **Tail Skew**: Asymmetry in upside vs downside probability
- **Range Probabilities**: Chance of finishing in any price range

## Basic Usage

Estimate the implied PDF for a single expiration:

```typescript
import {
  estimateImpliedProbabilityDistribution,
  NormalizedOption,
} from "@fullstackcraftllc/floe";

// Call options for a single expiry (filtered from your chain)
const callOptions: NormalizedOption[] = [
  { strike: 490, bid: 15.20, ask: 15.40, optionType: "call", /* ... */ },
  { strike: 495, bid: 11.50, ask: 11.70, optionType: "call", /* ... */ },
  { strike: 500, bid: 8.30, ask: 8.50, optionType: "call", /* ... */ },
  { strike: 505, bid: 5.60, ask: 5.80, optionType: "call", /* ... */ },
  { strike: 510, bid: 3.40, ask: 3.60, optionType: "call", /* ... */ },
  // ... more strikes
];

const result = estimateImpliedProbabilityDistribution(
  "QQQ",
  502.50,  // current spot price
  callOptions
);

if (result.success) {
  const dist = result.distribution;
  console.log("Most Likely Price:", dist.mostLikelyPrice);
  console.log("Median Price:", dist.medianPrice);
  console.log("Expected Move: ±$" + dist.expectedMove.toFixed(2));
  console.log("Tail Skew:", dist.tailSkew.toFixed(2));
  console.log("P(above spot):", (dist.cumulativeProbabilityAboveSpot * 100).toFixed(1) + "%");
  console.log("P(below spot):", (dist.cumulativeProbabilityBelowSpot * 100).toFixed(1) + "%");
}
```

## Processing Multiple Expirations

Process all expirations in an option chain at once:

```typescript
import {
  estimateImpliedProbabilityDistributions,
  OptionChain,
} from "@fullstackcraftllc/floe";

// Your full option chain with all expirations
const chain: OptionChain = {
  symbol: "QQQ",
  spot: 502.50,
  riskFreeRate: 0.05,
  dividendYield: 0.01,
  options: allOptions,  // includes calls and puts, all expirations
};

// Get implied PDF for each expiration
const distributions = estimateImpliedProbabilityDistributions(
  chain.symbol,
  chain.spot,
  chain.options
);

for (const dist of distributions) {
  const expiry = new Date(dist.expiryDate).toDateString();
  console.log(`\n${expiry}:`);
  console.log(`  Mode: $${dist.mostLikelyPrice}`);
  console.log(`  Expected Move: ±$${dist.expectedMove.toFixed(2)}`);
}
```

## Range Probability Analysis

Calculate the probability of finishing within a specific price range:

```typescript
import {
  getProbabilityInRange,
  getCumulativeProbability,
  getQuantile,
} from "@fullstackcraftllc/floe";

// Assuming you have a distribution from above
const dist = result.distribution;

// Probability of finishing between 495 and 510
const rangeProb = getProbabilityInRange(dist, 495, 510);
console.log(`P($495 ≤ price ≤ $510): ${(rangeProb * 100).toFixed(1)}%`);

// Probability of finishing below 490
const belowProb = getCumulativeProbability(dist, 490);
console.log(`P(price ≤ $490): ${(belowProb * 100).toFixed(1)}%`);

// Find confidence intervals
const p5 = getQuantile(dist, 0.05);
const p95 = getQuantile(dist, 0.95);
console.log(`90% Confidence Interval: [$${p5}, $${p95}]`);

const p25 = getQuantile(dist, 0.25);
const p75 = getQuantile(dist, 0.75);
console.log(`50% Confidence Interval: [$${p25}, $${p75}]`);
```

## Trading Applications

### Iron Condor Strike Selection

Use the implied PDF to find strikes with specific probability of profit:

```typescript
// Find strikes where there's only 10% chance of breaching
const shortPutStrike = getQuantile(dist, 0.10);  // 10th percentile
const shortCallStrike = getQuantile(dist, 0.90); // 90th percentile

console.log("Iron Condor Strikes:");
console.log(`  Short Put: $${shortPutStrike} (10% chance of breach)`);
console.log(`  Short Call: $${shortCallStrike} (10% chance of breach)`);

// Expected range probability
const profitProb = getProbabilityInRange(dist, shortPutStrike, shortCallStrike);
console.log(`  P(profit): ${(profitProb * 100).toFixed(1)}%`);
```

### Directional Bias Detection

Compare the mode to spot price to detect market bias:

```typescript
const spotModeDiff = dist.mostLikelyPrice - dist.underlyingPrice;
const percentBias = (spotModeDiff / dist.underlyingPrice) * 100;

if (spotModeDiff > 0) {
  console.log(`Market is BULLISH - mode is $${spotModeDiff.toFixed(2)} above spot`);
  console.log(`Expected upside: ${percentBias.toFixed(2)}%`);
} else {
  console.log(`Market is BEARISH - mode is $${Math.abs(spotModeDiff).toFixed(2)} below spot`);
  console.log(`Expected downside: ${Math.abs(percentBias).toFixed(2)}%`);
}

// Tail skew interpretation
if (dist.tailSkew > 1.2) {
  console.log("Right tail is heavier - market pricing more upside risk");
} else if (dist.tailSkew < 0.8) {
  console.log("Left tail is heavier - market pricing more downside risk");
} else {
  console.log("Distribution is relatively symmetric");
}
```

## Visualizing the PDF

Two examples using the console to visualize the distribution:

```typescript
// Get the raw PDF data for visualization
console.log("Strike,Probability");
for (const sp of dist.strikeProbabilities) {
  if (sp.probability > 0.001) {  // Filter noise
    console.log(`${sp.strike},${sp.probability.toFixed(6)}`);
  }
}

// Or as a simple ASCII histogram
const maxProb = Math.max(...dist.strikeProbabilities.map(sp => sp.probability));
for (const sp of dist.strikeProbabilities) {
  if (sp.probability > 0.001) {
    const bars = Math.round((sp.probability / maxProb) * 40);
    const marker = sp.strike === dist.mostLikelyPrice ? " ← MODE" : "";
    console.log(`$${sp.strike.toString().padStart(6)} ${"█".repeat(bars)}${marker}`);
  }
}
```
