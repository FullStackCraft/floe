---
created: 2025-02-20 14:30:00
created_by: claude opus 4.6
---

# Pressure Cloud (`src/hedgeflow/pressurecloud.ts`)

## Overview

The pressure cloud translates the raw hedge impulse curve (see `HEDGE_FLOW.md`) into actionable trading zones. It identifies where dealer hedging creates **mean-reversion pressure** (stability zones) and where it creates **trend-amplification pressure** (acceleration zones), weighted by how reachable each price level is from current spot.

This module builds on top of the hedge impulse curve — it does not compute the curve itself. The typical call chain is:

```
analyzeHedgeFlow(exposures, ivSurface) → { impulseCurve, regimeParams }
computePressureCloud(impulseCurve, regimeParams) → PressureCloud
```

## Two Zone Types

### Stability Zones (Mean-Reversion)

- **Source**: Positive impulse peaks (basins) on the impulse curve
- **Mechanism**: Dealers hedge counter-trend — they buy dips and sell rips via resting limit orders (absorption)
- **Effect**: Price decelerates into these zones, often stalling or reversing
- **Trading implication**:
  - Below spot = **support** → long entry on bounce
  - Above spot = **resistance** → short entry on rejection
- **`hedgeType: 'passive'`** — dealers post limit orders

### Acceleration Zones (Trend-Amplification)

- **Source**: Negative impulse troughs (peaks) on the impulse curve
- **Mechanism**: Dealers hedge with-trend — they sell into declines and buy into rallies via market orders (sweeping)
- **Effect**: Price accelerates through these zones; dealers amplify the move
- **Trading implication**:
  - Below spot = **waterfall** → short continuation if price reaches zone
  - Above spot = **squeeze** → long continuation if price reaches zone
- **`hedgeType: 'aggressive'`** — dealers send market orders

## Reachability Weighting

Not all zones are equally relevant. A massive stability basin 10% away from spot is less actionable than a moderate one 0.5% away. The pressure cloud weights zone strength by reachability:

```
reachRange = expectedDailySpotMove * spot * reachabilityMultiple
proximity = exp(-((distance / reachRange)^2))
strength = (|impulse| / maxImpulse) * proximity
```

Default `reachabilityMultiple` is 2.0, meaning levels beyond 2x the expected daily move are heavily penalized (Gaussian decay). This focuses attention on levels the market can realistically reach in the current session.

## Hedge Contract Conversion

Each price level includes estimated hedge contracts across four products:

```
contracts = impulse / (multiplier * spot * 0.01)
```

| Product | Multiplier | Typical Scale |
|---------|-----------|---------------|
| NQ (E-mini Nasdaq) | 20 | Base unit |
| MNQ (Micro Nasdaq) | 2 | 10x NQ |
| ES (E-mini S&P) | 50 | 0.4x NQ |
| MES (Micro S&P) | 5 | 4x NQ |

Positive contracts = dealers buying. Negative = dealers selling. The `expectedHedgeContracts` legacy field uses the config's `contractMultiplier` (default: 20/NQ). The new `hedgeContracts: HedgeContractEstimates` provides all four products simultaneously.

## Regime Edges

Zero crossings of the impulse curve mark regime boundaries — prices where market behavior flips between mean-reverting and trend-amplifying:

| Crossing | Location | Transition |
|----------|----------|------------|
| Falling (+ → -) | Below spot | `stable-to-unstable` |
| Falling (+ → -) | Above spot | `unstable-to-stable` |
| Rising (- → +) | Below spot | `unstable-to-stable` |
| Rising (- → +) | Above spot | `stable-to-unstable` |

These edges answer: "If price breaks past X, the character of the tape changes."

## Configuration

```typescript
interface PressureCloudConfig {
  contractMultiplier?: number;  // Default: 20 (NQ). For legacy expectedHedgeContracts.
  product?: 'NQ' | 'MNQ' | 'ES' | 'MES' | 'SPY';  // Primary product hint.
  reachabilityMultiple?: number;  // Default: 2.0. Levels beyond this × daily move get penalized.
  zoneThreshold?: number;  // Default: 0.15. Min impulse fraction to qualify as a zone.
}
```

Sensible defaults work for most 0DTE use cases. Adjust `reachabilityMultiple` for longer-dated expirations (higher = more distant zones included).

## Types

- **`PressureCloud`** — Top-level result: `spot`, `expiration`, `computedAt`, `stabilityZones`, `accelerationZones`, `regimeEdges`, `priceLevels`
- **`PressureZone`** — A zone with `center`, `lower`, `upper`, `strength` (0-1), `side`, `tradeType`, `hedgeType`
- **`PressureLevel`** — Per-price detail: `price`, `stabilityScore`, `accelerationScore`, `expectedHedgeContracts`, `hedgeContracts`, `hedgeType`
- **`RegimeEdge`** — Zero crossing: `price`, `transitionType`
- **`HedgeContractEstimates`** — Multi-product: `nq`, `mnq`, `es`, `mes`

## Exports from `src/index.ts`

Functions: `computePressureCloud`

Types: `HedgeContractEstimates`, `PressureZone`, `RegimeEdge`, `PressureLevel`, `PressureCloudConfig`, `PressureCloud`

## Consumption in vannacharm.com

The pressure cloud is computed in `DealerExposureMonitor.tsx` via a `useEffect` that:
1. Calls `analyzeHedgeFlow()` to get the impulse curve and regime params
2. Calls `computePressureCloud()` on the result
3. Stores in `pressureCloud` state
4. Renders via `<CandlestickPressureChart spotTicks={spotTicks} pressureCloud={pressureCloud} currentSpot={currentSpot} activeExposures={activeCanonicalExposures} symbol={symbol} />`

The chart component (`CandlestickPressureChart.tsx`) renders:
- Intraday candlesticks from aggregated live spot ticks (1m/5m/15m/30m/1h)
- Pressure overlays as price lines for stability/acceleration zones and regime edges
- Optional right-edge horizontal GEX/VEX/CEX bar primitive from active exposures
- Zone summary badges (including estimated NQ contracts at zone center)
- Crosshair hover info with hedge type and contract estimates per product

## Tests

`src/hedgeflow/pressurecloud.test.ts` covers:
- Basic zone extraction (stability and acceleration)
- Reachability weighting (near > far, distant penalized)
- Regime edge transitions (all four cases)
- Hedge contract math (exact values, multi-product ratios, sign preservation)
- Edge cases (empty curve, flat curve, all-positive, all-negative)
- Configuration (custom multiplier, custom threshold)
