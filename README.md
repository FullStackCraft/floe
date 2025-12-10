# `floe`

![npm](https://img.shields.io/npm/v/@fullstackcraftllc/floe?style=flat-square) ![License](https://img.shields.io/npm/l/@fullstackcraftllc/floe?style=flat-square) ![TypeScript](https://img.shields.io/badge/TypeScript-4.9-blue?style=flat-square&logo=typescript)

Zero-dependency TypeScript functions for options flow: Black-Scholes, Greeks, and dealer exposures, and more, with a clean, type-safe API. Built for use in trading platforms and fintech applications.

The same library that is used in Full Stack Craft's various fintech products including [The Wheel Screener](https://wheelscreener.com), [LEAPS Screener](https://leapsscreener.com), [Option Screener](https://option-screener.com), [AMT JOY](https://amtjoy.com), and [VannaCharm](https://vannacharm.com).

## Quick Start / Documentation / Examples

[fullstackcraft.github.io/floe](https://fullstackcraft.github.io/floe)

## 📋 Dual License

**This project is dual-licensed:**

- ✅ **MIT License** - Free for individuals, personal projects, and non-commercial use
- 💼 **Commercial License** - Required for businesses and commercial applications

[Read full licensing details](LICENSE.md) | [Get Commercial License](mailto:hi@fullstackcraft.com)

---

## Features

- **Black-Scholes Pricing** - Fast, accurate options pricing
- **Greeks Calculations** - Delta, gamma, theta, vega, rho
- **Dealer Exposure Metrics** - GEX, VEX, and CEX exposures
- **Implied Volatility & Surfaces** - Calculate IV from market prices and build volatility surfaces
- **Implied PDF** - Risk-neutral probability density functions
- **Real-Time Data** - Stream normalized options data from multiple brokers
- **Broker-Agnostic** - Normalize data from any broker
- **Type-Safe** - Full TypeScript support
- **Zero Dependencies** - Lightweight and fast

## Broker Support Roadmap

Due to the overwhelming variety of how broker APIs structure their data (and how they make it available), there is a wide variety of how much support we can provide out-of-the-box for different brokers, summarized in this table:

| Broker                | Black-Scholes | Greeks | Open Interest Based Exposures | Options-Book Based Exposures | Implied PDF Calculations |
|-----------------------|--------------|--------|-------------------------------|------------------------------|-------------------------|
| Tradier (via WebSocket) | ✅           | ✅     | ✅                            | ✅                           |  ✅                         |
| Tastytrade (via WebSocket - DXLink Streamer)               |  ✅            |  ✅      |  ✅                             |  ✅                            |  ✅                         |
| TradeStation (via HTTP Streaming)              |  ✅            |  ✅      |  ✅                             |  ✅                            |  ✅                         |
| Schwab (via WebSocket)              |  ✅            |  ✅      |  ✅                             |  ✅                            |  ✅                         |
| Interactive Brokers (via WebSocket)              |  Coming Soon            |  Coming Soon      |  Coming Soon                             |  Coming Soon                            |  Coming Soon                         |

Ideally all aspects of `floe` will be available for all brokers, but this will take time to determine as we work through the various data structures and formats that each broker provides.

## Unsupported Brokers

The following brokers have no public API:

- Fidelity
- Robinhood

If your broker is not listed above, you can still use `floe` by normalizing your broker's data structures to match the expected input types. With options, you can get quite far with `floe` just by having the market price for the underlying and each option. (From those alone you can back out the IV, greeks, and exposures.)

## Installation

```bash
npm install @fullstackcraftllc/floe
```

## License

**Free for Individuals** - Use the MIT License for personal, educational, and non-commercial projects.

**Commercial License Required** - Businesses and commercial applications must obtain a commercial license.

See [LICENSE.md](LICENSE.md) for full details.

**Need a Commercial License?** Contact us at [hi@fullstackcraft.com](mailto:hi@fullstackcraft.com)

## Pricing

[Contact hi@fullstackcraft.com for pricing](mailto:hi@fullstackcraft.com)

## Contributing

Contributions welcome! Please open an issue or PR.

By contributing, you agree that your contributions will be licensed under the same dual-license terms.

## TODOs

- [ ] Implied PDF calculations
- [ ] Tradier integration, normalization, and docs
- [ ] TradeStation integration, normalization, and docs
- [ ] Interactive Brokers integration, normalization, and docs

## Credits

Built with ❤️ by [Full Stack Craft LLC](https://fullstackcraft.com)

---

**© 2025 Full Stack Craft LLC** - All rights reserved.
