---
title: API Reference
description: Complete documentation for all floe functions and types.
order: 2
---

## Pricing Functions

### blackScholes

Calculates the theoretical price of a European option using the Black-Scholes-Merton model.

```typescript
import { blackScholes } from "@fullstackcraftllc/floe";

const price = blackScholes({
  spot: 100,           // Current price of underlying
  strike: 105,         // Option strike price
  timeToExpiry: 0.25,  // Time to expiration in years
  riskFreeRate: 0.05,  // Annual risk-free interest rate
  volatility: 0.20,    // Annualized volatility (as decimal)
  optionType: "call",  // "call" or "put"
  dividendYield: 0.02  // Optional: continuous dividend yield (as decimal)
});
```

## Implied Volatility

### calculateImpliedVolatility

Uses the Black-Scholes model with iterative bisection to compute the implied volatility given an option price.

```typescript
import { calculateImpliedVolatility } from "@fullstackcraftllc/floe";

const iv = calculateImpliedVolatility(
  3.50,      // price: observed option price
  100,       // spot: current underlying price
  105,       // strike: option strike price
  0.05,      // riskFreeRate: annual risk-free rate (as decimal)
  0.02,      // dividendYield: continuous dividend yield (as decimal)
  0.25,      // timeToExpiry: time to expiration in years
  "call"     // optionType: "call" or "put"
);

console.log(`Implied Volatility: ${iv.toFixed(2)}%`);
// Note: Returns IV as a percentage (e.g., 20.0 for 20% volatility)
```

## Greeks

### calculateGreeks

Calculate all Greeks up to third order for European call and put options. Returns a complete Greeks object containing the option price and all sensitivity measures.

```typescript
import { calculateGreeks } from "@fullstackcraftllc/floe";

const greeks = calculateGreeks({
  spot: 100,
  strike: 105,
  timeToExpiry: 0.25,
  riskFreeRate: 0.05,
  volatility: 0.20,
  optionType: "call",      // "call" or "put"
  dividendYield: 0.02      // optional
});

// Access individual Greeks from the returned object:
console.log(`Price: ${greeks.price}`);
console.log(`Delta: ${greeks.delta}`);
console.log(`Gamma: ${greeks.gamma}`);
console.log(`Theta: ${greeks.theta}`);   // per day
console.log(`Vega: ${greeks.vega}`);     // per 1% volatility change
console.log(`Rho: ${greeks.rho}`);       // per 1% rate change
```

### Greeks Interface

The calculateGreeks function returns a Greeks object with all sensitivity measures:

```typescript
interface Greeks {
  price: number;   // Option theoretical value
  delta: number;   // Rate of change of option price with respect to underlying
  gamma: number;   // Rate of change of delta with respect to underlying
  theta: number;   // Time decay (per day)
  vega: number;    // Sensitivity to volatility (per 1% change)
  rho: number;     // Sensitivity to interest rate (per 1% change)
  vanna: number;   // Sensitivity of delta to volatility
  charm: number;   // Delta decay (per day)
  volga: number;   // Sensitivity of vega to volatility (also known as vomma)
  speed: number;   // Rate of change of gamma
  zomma: number;   // Sensitivity of gamma to volatility
  color: number;   // Gamma decay
  ultima: number;  // Sensitivity of volga to volatility
}
```

## Time Utilities

### getTimeToExpirationInYears

Convert an expiration timestamp to time in years:

```typescript
import { getTimeToExpirationInYears } from "@fullstackcraftllc/floe";

const expirationTimestamp = Date.now() + 30 * 24 * 60 * 60 * 1000; // 30 days from now
const timeToExpiry = getTimeToExpirationInYears(expirationTimestamp);
// Returns: ~0.0822 (30/365)
```

### getMillisecondsToExpiration

Get milliseconds until expiration:

```typescript
import { getMillisecondsToExpiration } from "@fullstackcraftllc/floe";

const ms = getMillisecondsToExpiration(expirationTimestamp);
```

## Statistical Utilities

### cumulativeNormalDistribution

Standard normal cumulative distribution function (CDF):

```typescript
import { cumulativeNormalDistribution } from "@fullstackcraftllc/floe";

const prob = cumulativeNormalDistribution(1.96);
// Returns: ~0.975 (97.5% probability)
```

### normalPDF

Standard normal probability density function:

```typescript
import { normalPDF } from "@fullstackcraftllc/floe";

const density = normalPDF(0);
// Returns: ~0.3989 (peak of the normal curve)
```

## IV Surfaces

### getIVSurfaces

Generate implied volatility surfaces for all options across all expirations. Used as input for dealer exposure calculations.

```typescript
import { getIVSurfaces, OptionChain } from "@fullstackcraftllc/floe";

const chain: OptionChain = {
  symbol: 'SPY',
  spot: 450.50,
  riskFreeRate: 0.05,
  dividendYield: 0.02,
  options: normalizedOptions
};

const surfaces = getIVSurfaces('blackscholes', 'totalvariance', chain);
// Returns array of IVSurface objects with rawIVs and smoothedIVs
```

### getIVForStrike

Lookup a specific IV from the surface:

```typescript
import { getIVForStrike } from "@fullstackcraftllc/floe";

const iv = getIVForStrike(surfaces, expirationTimestamp, 'call', 105);
// Returns smoothed IV as percentage (e.g., 23.0 for 23%)
```

### smoothTotalVarianceSmile

Apply total variance smoothing to a volatility smile:

```typescript
import { smoothTotalVarianceSmile } from "@fullstackcraftllc/floe";

const smoothedIVs = smoothTotalVarianceSmile(
  [90, 95, 100, 105, 110],  // strikes
  [22, 20, 18, 20, 22],      // raw IVs as percentages
  0.25                        // time to expiry in years
);
```

## Dealer Exposures

### calculateGammaVannaCharmExposures

Calculate aggregate dealer exposures across an option chain:

```typescript
import { 
  calculateGammaVannaCharmExposures, 
  getIVSurfaces 
} from "@fullstackcraftllc/floe";

const ivSurfaces = getIVSurfaces('blackscholes', 'totalvariance', chain);
const exposures = calculateGammaVannaCharmExposures(chain, ivSurfaces);

for (const expiry of exposures) {
  console.log(`Expiration: ${new Date(expiry.expiration).toDateString()}`);
  console.log(`  Total Gamma: ${expiry.totalGammaExposure}`);
  console.log(`  Total Vanna: ${expiry.totalVannaExposure}`);
  console.log(`  Total Charm: ${expiry.totalCharmExposure}`);
}
```

### calculateSharesNeededToCover

Calculate dealer hedging requirements:

```typescript
import { calculateSharesNeededToCover } from "@fullstackcraftllc/floe";

const coverage = calculateSharesNeededToCover(
  900_000_000,   // shares outstanding
  -5_000_000,    // net exposure
  450.50         // spot price
);

console.log(`Action: ${coverage.actionToCover}`);
console.log(`Shares: ${coverage.sharesToCover}`);
console.log(`Implied Move: ${coverage.impliedMoveToCover}%`);
```

## Implied PDF

### estimateImpliedProbabilityDistribution

Estimate implied probability distribution for a single expiration:

```typescript
import { estimateImpliedProbabilityDistribution } from "@fullstackcraftllc/floe";

const result = estimateImpliedProbabilityDistribution("QQQ", 502.50, callOptions);

if (result.success) {
  const dist = result.distribution;
  console.log(`Mode: ${dist.mostLikelyPrice}`);
  console.log(`Expected Move: ${dist.expectedMove}`);
}
```

### estimateImpliedProbabilityDistributions

Process all expirations at once:

```typescript
import { estimateImpliedProbabilityDistributions } from "@fullstackcraftllc/floe";

const distributions = estimateImpliedProbabilityDistributions("QQQ", 502.50, options);
```

### getProbabilityInRange

Get probability of finishing in a price range:

```typescript
import { getProbabilityInRange } from "@fullstackcraftllc/floe";

const prob = getProbabilityInRange(distribution, 495, 510);
// Returns probability (e.g., 0.65 for 65%)
```

### getCumulativeProbability

Get cumulative probability up to a price:

```typescript
import { getCumulativeProbability } from "@fullstackcraftllc/floe";

const prob = getCumulativeProbability(distribution, 500);
```

### getQuantile

Get strike at a probability quantile:

```typescript
import { getQuantile } from "@fullstackcraftllc/floe";

const p10 = getQuantile(distribution, 0.10);  // 10th percentile
const p90 = getQuantile(distribution, 0.90);  // 90th percentile
```

## OCC Symbol Utilities

### buildOCCSymbol

Build an OCC-formatted option symbol:

```typescript
import { buildOCCSymbol } from "@fullstackcraftllc/floe";

const symbol = buildOCCSymbol({
  symbol: 'AAPL',
  expiration: '2025-01-17',
  optionType: 'call',
  strike: 150,
  padded: false  // optional, default false
});
// Returns: 'AAPL250117C00150000'
```

### parseOCCSymbol

Parse an OCC symbol into components:

```typescript
import { parseOCCSymbol } from "@fullstackcraftllc/floe";

const parsed = parseOCCSymbol('AAPL250117C00150000');
// Returns: { symbol: 'AAPL', expiration: Date, optionType: 'call', strike: 150 }
```

### generateStrikesAroundSpot

Generate strike prices around a spot price:

```typescript
import { generateStrikesAroundSpot } from "@fullstackcraftllc/floe";

const strikes = generateStrikesAroundSpot({
  spot: 450,
  strikesAbove: 10,
  strikesBelow: 10,
  strikeIncrementInDollars: 5
});
// Returns: [400, 405, 410, ..., 495, 500]
```

### generateOCCSymbolsForStrikes

Generate OCC symbols for specific strikes:

```typescript
import { generateOCCSymbolsForStrikes } from "@fullstackcraftllc/floe";

const symbols = generateOCCSymbolsForStrikes(
  'SPY',
  '2025-12-20',
  [440, 445, 450, 455, 460],
  ['call', 'put']  // optional, default both
);
```

### generateOCCSymbolsAroundSpot

Convenience function combining strike generation and OCC symbol creation:

```typescript
import { generateOCCSymbolsAroundSpot } from "@fullstackcraftllc/floe";

const symbols = generateOCCSymbolsAroundSpot('SPY', '2025-12-20', 600, {
  strikesAbove: 10,
  strikesBelow: 10,
  strikeIncrementInDollars: 1
});
```

## Broker Adapters

### createOptionChain

Create an option chain from raw broker data:

```typescript
import { createOptionChain } from "@fullstackcraftllc/floe";

const chain = createOptionChain(
  'SPY',           // symbol
  450.50,          // spot
  0.05,            // riskFreeRate
  0.02,            // dividendYield
  rawBrokerData,   // raw options from broker
  'schwab'         // broker name for adapter selection
);
```

### getAdapter

Get a specific broker adapter:

```typescript
import { getAdapter } from "@fullstackcraftllc/floe";

const adapter = getAdapter('schwab');
const normalizedOption = adapter(rawOptionData);
```

### Available Adapters

```typescript
import { 
  genericAdapter,
  schwabAdapter,
  ibkrAdapter,
  tdaAdapter,
  brokerAdapters 
} from "@fullstackcraftllc/floe";

// brokerAdapters is a map: { generic, schwab, ibkr, tda }
```

## Real-Time Market Data (FloeClient)

### Supported Brokers

| Broker | Enum Value | Authentication |
|--------|------------|----------------|
| Tradier | `Broker.TRADIER` | API Token |
| TastyTrade | `Broker.TASTYTRADE` | Session Token |
| TradeStation | `Broker.TRADESTATION` | OAuth Token |
| Charles Schwab | `Broker.SCHWAB` | OAuth Token |

### Basic Usage

```typescript
import { FloeClient, Broker } from "@fullstackcraftllc/floe";

const client = new FloeClient({ verbose: false });
await client.connect(Broker.TRADIER, 'your-api-token');

client.on('optionUpdate', (option) => {
  console.log(`${option.occSymbol}: ${option.bid} / ${option.ask}`);
});

client.on('tickerUpdate', (ticker) => {
  console.log(`${ticker.symbol}: ${ticker.spot}`);
});

client.subscribeToOptions(['SPY251220C00600000']);
client.subscribeToTickers(['SPY']);
await client.fetchOpenInterest();

client.disconnect();
```

### Direct Broker Client Access

```typescript
import { TradierClient, TastyTradeClient, TradeStationClient } from "@fullstackcraftllc/floe";

// Use broker clients directly for advanced scenarios
const tradier = new TradierClient(token, { verbose: true });
```

## Core Types

### OptionType

```typescript
type OptionType = 'call' | 'put';
```

### BlackScholesParams

```typescript
interface BlackScholesParams {
  spot: number;
  strike: number;
  timeToExpiry: number;
  volatility: number;
  riskFreeRate: number;
  optionType: OptionType;
  dividendYield?: number;
}
```

### NormalizedOption

```typescript
interface NormalizedOption {
  occSymbol: string;
  underlying: string;
  strike: number;
  expiration: string;
  expirationTimestamp: number;
  optionType: OptionType;
  bid: number;
  bidSize: number;
  ask: number;
  askSize: number;
  mark: number;
  last: number;
  volume: number;
  openInterest: number;
  liveOpenInterest?: number;
  impliedVolatility: number;
  timestamp: number;
}
```

### NormalizedTicker

```typescript
interface NormalizedTicker {
  symbol: string;
  spot: number;
  bid: number;
  bidSize: number;
  ask: number;
  askSize: number;
  last: number;
  volume: number;
  timestamp: number;
}
```

### OptionChain

```typescript
interface OptionChain {
  symbol: string;
  spot: number;
  riskFreeRate: number;
  dividendYield: number;
  options: NormalizedOption[];
}
```

### IVSurface

```typescript
interface IVSurface {
  expirationDate: number;
  putCall: OptionType;
  strikes: number[];
  rawIVs: number[];
  smoothedIVs: number[];
}
```

### ExposurePerExpiry

```typescript
interface ExposurePerExpiry {
  spotPrice: number;
  expiration: number;
  totalGammaExposure: number;
  totalVannaExposure: number;
  totalCharmExposure: number;
  totalNetExposure: number;
  strikeOfMaxGamma: number;
  strikeOfMinGamma: number;
  strikeOfMaxVanna: number;
  strikeOfMinVanna: number;
  strikeOfMaxCharm: number;
  strikeOfMinCharm: number;
  strikeOfMaxNet: number;
  strikeOfMinNet: number;
  strikeExposures: StrikeExposure[];
}
```

### ImpliedProbabilityDistribution

```typescript
interface ImpliedProbabilityDistribution {
  symbol: string;
  expiryDate: number;
  calculationTimestamp: number;
  underlyingPrice: number;
  strikeProbabilities: StrikeProbability[];
  mostLikelyPrice: number;
  medianPrice: number;
  expectedValue: number;
  expectedMove: number;
  tailSkew: number;
  cumulativeProbabilityAboveSpot: number;
  cumulativeProbabilityBelowSpot: number;
}
```
