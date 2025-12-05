# `floe`

![npm](https://img.shields.io/npm/v/@fullstackcraftllc/floe?style=flat-square) ![License](https://img.shields.io/npm/l/@fullstackcraftllc/floe?style=flat-square) ![TypeScript](https://img.shields.io/badge/TypeScript-4.9-blue?style=flat-square&logo=typescript)

Browser-only TypeScript functions for calculating Black-Scholes, Greeks, and dealer exposures with a clean, type-safe API. Built for use in trading platforms and fintech applications.

The same library that is used in Full Stack Craft's various fintech products including [The Wheel Screener](https://wheelscreener.com), [LEAPS Screener](https://leapsscreener.com), [Option Screener](https://option-screener.com),  [AMT JOY](https://amtjoy.com), and [VannaCharm](https://vannacharm.com).

## 📋 Dual License

**This project is dual-licensed:**

- ✅ **MIT License** - Free for individuals, personal projects, and non-commercial use
- 💼 **Commercial License** - Required for businesses and commercial applications

[Read full licensing details](LICENSE.md) | [Get Commercial License](mailto:hi@fullstackcraft.com)

---

## Features

- 🎯 **Black-Scholes Pricing** - Fast, accurate options pricing
- 📊 **Greeks Calculations** - Delta, gamma, theta, vega, rho
- 🔄 **Dealer Exposure Metrics** - GEX, VEX, and CEX exposures
- 🔌 **Broker-Agnostic** - Normalize data from any broker
- 💪 **Type-Safe** - Full TypeScript support
- ⚡ **Zero Dependencies** - Lightweight and fast

## Installation

```bash
npm install @fullstackcraftllc/floe
```

## Quick Start

Nearly everything in `floe` revolves around the `NormalizedOption` interface, which provides a consistent way to represent options data regardless of the broker source:

```typescript
/**
 * Normalized option data structure (broker-agnostic)
 */
export interface NormalizedOption {
  /** Underlying symbol */
  symbol: string;
  /** Strike price */
  strike: number;
  /** Expiration date (ISO 8601) */
  expiration: string;
  /** Option type */
  optionType: OptionType;
  /** Current bid price */
  bid: number;
  /** Current ask price */
  ask: number;
  /** Last traded price */
  last: number;
  /** Trading volume */
  volume: number;
  /** Open interest */
  openInterest: number;
  /** Implied volatility (as decimal) */
  impliedVolatility: number;
  /** Pre-calculated Greeks (optional) */
  greeks?: Greeks;
}
```

```typescript
import { blackScholes, calculateGreeks, calculateGEX } from '@fullstackcraftllc/floe';

// Calculate option price
const price = blackScholes({
  spot: 100,
  strike: 105,
  timeToExpiry: 0.25,
  volatility: 0.20,
  riskFreeRate: 0.05,
  optionType: 'call'
});

// Calculate Greeks
const greeks = calculateGreeks({
  spot: 100,
  strike: 105,
  timeToExpiry: 0.25,
  volatility: 0.20,
  riskFreeRate: 0.05,
  optionType: 'call'
});

const normalizedOptions = [
  {
    symbol: 'AAPL',
    strike: 105,
    expiration: '2025-12-20',
    optionType: 'call',
    bid: 2.50,
    ask: 2.60,
    last: 2.55,
    volume: 150,
    openInterest: 2000,
    impliedVolatility: 0.22
  },
  // ...more options
];

const gexData = calculateGEX(normalizedOptions, 100, 100);

console.log('Option Price:', price);
console.log('Delta:', greeks.delta);
console.log('Gamma:', greeks.gamma);
console.log('Net Gamma:', gexData.netGamma);
console.log('Strike of Max Gamma:', gexData.maxPositiveStrike);
console.log('Strike of Min Gamma:', gexData.maxNegativeStrike);
console.log('Zero Gamma Level:', gexData.zeroGammaLevel);
```

## Broker Normalization

Floe provides adapters for normalizing options data from multiple brokers:

```typescript
import { normalizeTastyworksData } from '@fullstackcraftllc/floe';

// Tastyworks data
const normalizedOptions = normalizeTastyworksData(rawTastyData);

// Now both use the same interface
normalizedOptions.forEach(option => {
  const greeks = calculateGreeks(option);
  console.log(greeks);
});
```

## For Devs - Example / Documentation Site

The website at [fullstackcraft.github.io/floe](https://fullstackcraft.github.io/floe) contains live code examples and documentation and is here locally at `./site`. It is a static site build with Next.js.

## API Documentation

### Black-Scholes Pricing

```typescript
blackScholes(params: BlackScholesParams): number
```

Calculate option price using Black-Scholes model.

**Parameters:**
- `spot`: Current price of underlying asset
- `strike`: Strike price of option
- `timeToExpiry`: Time to expiration in years
- `volatility`: Implied volatility (annualized)
- `riskFreeRate`: Risk-free interest rate (annualized)
- `optionType`: 'call' | 'put'
- `dividendYield?`: Dividend yield (optional, default 0)

### Greeks Calculation

```typescript
calculateGreeks(params: BlackScholesParams): Greeks
```

Calculate all Greeks for an option.

**Returns:**
- `delta`: Rate of change of option price with respect to underlying price
- `gamma`: Rate of change of delta with respect to underlying price
- `theta`: Rate of change of option price with respect to time
- `vega`: Rate of change of option price with respect to volatility
- `rho`: Rate of change of option price with respect to interest rate

### Estimate Implied Volatility Surface

```typescript
estimateIVSurface(options: NormalizedOption[], spot: number): IVSurface
```

### Dealer Exposure Metrics

```typescript
calculateGEX(options: NormalizedOption[]): GEXMetrics
calculateVanna(options: NormalizedOption[]): VannaMetrics
calculateCharm(options: NormalizedOption[]): CharmMetrics
```

### Notional Intraday Dealer Exposure Metrics

This process assume that dealer inventory consists of the previously reported open interest at t=0 (09:30AM EST), and that all options volume is bought or sold at market price based on the NBBO at the time of the trade. This is a simplification and may not reflect actual dealer inventory changes throughout the day.

Note that the nature of this calculation requires continuous intraday data including time-stamped trades and quotes to accurately model dealer inventory changes.

```typescript
calculateIntradayGEX(trades: Trade[], quotes: Quote[], initialOpenInterest: Map<string, number>, spotPrices: Map<string, number>): IntradayGEXMetrics
```

Calculate dealer exposure metrics across an options chain.

## License

**Free for Individuals** - Use the MIT License for personal, educational, and non-commercial projects.

**Commercial License Required** - Businesses and commercial applications must obtain a commercial license.

See [LICENSE.md](LICENSE.md) for full details.

**Need a Commercial License?** Contact us at [hi@fullstackcraft.com](mailto:hi@fullstackcraft.com)

## Pricing

### Individual (MIT License)
**$0/month** - Free forever
- ✅ Personal projects
- ✅ Open-source projects
- ✅ Educational use
- ✅ Community support

### Developer (Commercial)
**$149/month** or **$1,490/year**
- ✅ Commercial use
- ✅ Up to 100K calculations/month
- ✅ Email support
- ✅ All broker integrations

### Professional (Commercial)
**$499/month** or **$4,990/year**
- ✅ Unlimited calculations
- ✅ Priority support
- ✅ SLA guarantees
- ✅ Custom integrations

### Enterprise (Commercial)
**Custom pricing**
- ✅ White-label options
- ✅ Dedicated support
- ✅ On-premise deployment
- ✅ Custom broker adapters

[Contact hi@fullstackcraft.com for Enterprise pricing](mailto:hi@fullstackcraft.com)

## Documentation

Full documentation coming soon at [fullstackcraft.github.io/floe](https://fullstackcraft.github.io/floe)

## Support

- **Email:** hi@fullstackcraft.com
- **Bug Reports:** [GitHub Issues](https://github.com/FullStackCraft/floe/issues)
- **Discussions:** [GitHub Discussions](https://github.com/FullStackCraft/floe/discussions)

## Contributing

Contributions welcome! Please open an issue or PR.

By contributing, you agree that your contributions will be licensed under the same dual-license terms.

## Roadmap

- [ ] Homepage / documentation site
- [ ] Volatility surface estimation with a variety of interpolation methods
- [ ] Implied PDF calculations
- [ ] Tradier integration, normalization, and docs
- [ ] TradeStation integration, normalization, and docs
- [ ] Interactive Brokers integration, normalization, and docs


## Credits

Built with ❤️ by [Full Stack Craft LLC](https://fullstackcraft.com)

---

**© 2025 Full Stack Craft LLC** - All rights reserved.
