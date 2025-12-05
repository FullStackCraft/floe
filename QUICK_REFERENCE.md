# Floe Quick Reference

## Installation

```bash
npm install @fullstackcraftllc/floe
```

## Quick Start

```typescript
import { calculateGreeks, getIVSurfaces, calculateGammaVannaCharmExposures } from '@fullstackcraftllc/floe';
```

## Core Functions

### 1. Calculate Greeks

```typescript
const greeks = calculateGreeks({
  spot: 100,           // Current price
  strike: 105,         // Strike price
  timeToExpiry: 0.25,  // Years (e.g., 0.25 = 3 months)
  volatility: 0.20,    // Decimal (e.g., 0.20 = 20%)
  riskFreeRate: 0.05,  // Decimal (e.g., 0.05 = 5%)
  dividendYield: 0.02, // Decimal (e.g., 0.02 = 2%)
  optionType: 'call'   // 'call' or 'put'
});

// Returns: { price, delta, gamma, theta, vega, rho, charm, vanna, volga, speed, zomma, color, ultima }
```

### 2. Calculate Implied Volatility

```typescript
import { calculateImpliedVolatility } from '@fullstackcraftllc/floe';

const iv = calculateImpliedVolatility(
  5.50,    // Market price
  100,     // Spot price
  105,     // Strike price
  0.05,    // Risk-free rate (decimal)
  0.02,    // Dividend yield (decimal)
  0.25,    // Time to expiry (years)
  'call'   // Option type
);

// Returns: IV as percentage (e.g., 20.5 for 20.5%)
```

### 3. Build IV Surfaces

```typescript
const surfaces = getIVSurfaces(
  'blackscholes',      // Volatility model (currently: 'blackscholes')
  'totalvariance',     // Smoothing model ('totalvariance' or 'none')
  100,                 // Underlying price
  5.0,                 // Interest rate (%)
  2.0,                 // Dividend yield (%)
  normalizedOptions,   // Array of NormalizedOption
  expirations          // Array of timestamps (ms)
);

// Returns: Array of IVSurface objects
```

### 4. Calculate Exposures

```typescript
const exposures = calculateGammaVannaCharmExposures(
  'SPY ETF',           // Description
  options,             // Normalized options
  expirations,         // Expiration timestamps
  2.0,                 // Dividend yield (%)
  450.50,              // Spot price
  5.0,                 // Interest rate (%)
  ivSurfaces,          // From getIVSurfaces()
  Date.now(),          // Quote time
  1000000000           // Shares outstanding
);

// Returns: Array of ExposurePerExpiry objects
```

## Data Types

### NormalizedOption

```typescript
interface NormalizedOption {
  symbol: string;
  strike: number;
  expiration: string;
  expirationTimestamp: number;
  optionType: 'call' | 'put';
  bid: number;
  ask: number;
  mark: number;
  last: number;
  volume: number;
  openInterest: number;
  impliedVolatility: number;
  greeks?: Greeks;
}
```

### Greeks

```typescript
interface Greeks {
  price: number;   // Option theoretical value
  delta: number;   // ∂V/∂S
  gamma: number;   // ∂²V/∂S²
  theta: number;   // ∂V/∂t (per day)
  vega: number;    // ∂V/∂σ (per 1%)
  rho: number;     // ∂V/∂r (per 1%)
  charm: number;   // ∂²V/∂S∂t (per day)
  vanna: number;   // ∂²V/∂S∂σ
  volga: number;   // ∂²V/∂σ²
  speed: number;   // ∂³V/∂S³
  zomma: number;   // ∂³V/∂S²∂σ
  color: number;   // ∂³V/∂S²∂t
  ultima: number;  // ∂³V/∂σ³
}
```

### ExposurePerExpiry

```typescript
interface ExposurePerExpiry {
  description: string;
  spot: number;
  expirationDate: number;
  totalGammaExposure: number;
  totalVannaExposure: number;
  totalCharmExposure: number;
  totalNetExposure: number;
  strikeOfMaxGamma: number;
  strikeOfMinGamma: number;
  // ... more fields
  actionToCover: string;      // 'BUY' or 'SELL'
  sharesToCover: number;
  impliedMoveToCover: number; // Percentage
  resultingSpotToCover: number;
  strikeExposures: StrikeExposure[];
}
```

## Constants

```typescript
import { 
  MILLISECONDS_PER_YEAR,  // 31536000000
  MILLISECONDS_PER_DAY,   // 86400000
  DAYS_PER_YEAR           // 365
} from '@fullstackcraftllc/floe';
```

## Broker Adapters

Convert broker-specific data to NormalizedOption format:

```typescript
import { schwabAdapter, tdAmeritradeAdapter } from '@fullstackcraftllc/floe/adapters';

const normalized = schwabAdapter(rawSchwabData);
```

## Tips

### Time Conversions

```typescript
import { getTimeToExpirationInYears } from '@fullstackcraftllc/floe';

const years = getTimeToExpirationInYears(expirationTimestamp);
```

### Percentage Conventions

- **Input volatility**: Decimal (0.20 = 20%)
- **Input rates**: Decimal (0.05 = 5%)
- **Output IV**: Percentage (20.0 = 20%)
- **Greeks theta/charm**: Per day
- **Greeks vega/rho**: Per 1% change

### Exposure Perspective

- **Dealer perspective**: How dealers hedge their positions
- **Negative gamma**: Dealers are short (sold calls, bought puts)
- **Positive gamma**: Dealers are long (bought calls, sold puts)

## Common Patterns

### Full Workflow

```typescript
// 1. Get option chain data
const rawOptions = await fetchOptionsFromBroker('SPY');

// 2. Normalize data
const normalized = rawOptions.map(schwabAdapter);

// 3. Extract unique expirations
const expirations = [...new Set(normalized.map(o => o.expirationTimestamp))];

// 4. Build IV surfaces
const surfaces = getIVSurfaces(
  'blackscholes',
  'totalvariance',
  spotPrice,
  interestRate,
  dividendYield,
  normalized,
  expirations
);

// 5. Calculate exposures
const exposures = calculateGammaVannaCharmExposures(
  description,
  normalized,
  expirations,
  dividendYield,
  spotPrice,
  interestRate,
  surfaces,
  Date.now(),
  sharesOutstanding
);

// 6. Use results
console.log('Total Gamma Exposure:', exposures[0].totalGammaExposure);
console.log('Action to Cover:', exposures[0].actionToCover);
console.log('Implied Move:', exposures[0].impliedMoveToCover, '%');
```

## Troubleshooting

### Getting NaN Results
- Check for zero/negative volatility
- Check for zero/negative time to expiry
- Check for zero/negative spot price

### IV Not Converging
- Price may be at intrinsic value (no extrinsic)
- Try different initial bounds
- Check if option is deeply ITM/OTM

### Smoothing Not Working
- Need at least 5 valid data points
- IVs below 1.5% are filtered out
- Expired options are skipped

## Resources

- **Documentation**: See README.md
- **Testing Guide**: See TESTING_PLAN.md
- **API Reference**: See inline JSDoc comments
- **Examples**: See usage examples in source code

## Support

For issues or questions:
- GitHub: github.com/fullstackcraftllc/floe (when published)
- Email: support@fullstackcraft.com

---

**Current Version**: 1.0.0  
**License**: Dual (MIT for individuals, Commercial for businesses)  
**Last Updated**: December 3, 2024
