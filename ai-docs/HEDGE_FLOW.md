---
created: 2025-02-16 08:15:00
updated: 2025-02-16 08:50:00
created_by: claude opus 4.6
---

# Hedge Flow Module (`src/hedgeflow/`)

## Overview

Module providing two complementary dealer positioning analyses for 0DTE options, plus IV surface regime derivation:

1. **Hedge Impulse Curve** — combines gamma and vanna exposures into a single price-space response function via the empirical spot-vol coupling relationship
2. **Charm Integral** — accumulates expected delta change from time decay alone from now until expiration
3. **Regime Derivation** — extracts market regime parameters (ATM IV, spot-vol correlation, vol-of-vol) from the IV surface itself

This module fully replaces the former `src/pressure/` module. See `ai-docs/PRESSURE_FIELD_ARCHIVE.md` for what was removed and why.

## Key Design Decisions

### No Time Weighting
Dollar GEX/VEX/CEX already incorporate all time-to-expiry effects through the Black-Scholes Greeks. Additional time weighting (like step-function approaches in typical composite scores) double-counts.

### Physical Combination via Taylor Expansion
Rather than combining gamma and vanna with arbitrary regime-dependent weights, the hedge impulse uses the Taylor expansion of dealer delta change:

```
H(S) = GEX(S) - (k / S) * VEX(S)
```

The coupling coefficient `k` is derived from the IV surface skew slope, not hardcoded. For equity indices, k typically falls in range [4, 12].

### Adaptive Kernel Width
Gaussian kernel for smoothing strike-space exposures into price-space uses width defined in strike spacings (default: 2 × modal strike spacing) rather than percentage of spot. This ensures consistent smoothing across underlyings with different contract specifications (SPX 5-pt strikes vs NQ 25-pt strikes vs IWM 1-pt strikes).

### Orthogonal Panel Design
The impulse curve (conditional: "what if price moves?") and charm integral (unconditional: "what does time do?") are kept separate because they answer fundamentally different questions. No composite score is produced — the separation is the feature.

## Files

- `types.ts` — All type definitions including `MarketRegime`, `RegimeParams`, `HedgeImpulseCurve`, `CharmIntegral`, `HedgeFlowAnalysis`
- `regime.ts` — IV surface regime derivation (ATM IV, skew → correlation, curvature → vol-of-vol)
- `curve.ts` — Hedge impulse curve computation (kernel smoothing, zero crossings, extrema, asymmetry, regime classification)
- `charm.ts` — Charm integral computation (time-bucketed cumulative CEX to close)
- `index.ts` — Re-exports and `analyzeHedgeFlow()` combined analysis function

## Exports from `src/index.ts`

Functions: `deriveRegimeParams`, `interpolateIVAtStrike`, `computeHedgeImpulseCurve`, `computeCharmIntegral`, `computePressureCloud`, `analyzeHedgeFlow`

Types: `MarketRegime`, `RegimeParams`, `HedgeImpulseConfig`, `HedgeImpulsePoint`, `HedgeImpulseCurve`, `ZeroCrossing`, `ImpulseExtremum`, `DirectionalAsymmetry`, `ImpulseRegime`, `CharmIntegralConfig`, `CharmBucket`, `CharmIntegral`, `HedgeFlowAnalysis`, `HedgeContractEstimates`, `PressureZone`, `RegimeEdge`, `PressureLevel`, `PressureCloudConfig`, `PressureCloud`

See also: `ai-docs/PRESSURE_CLOUD.md` for the pressure cloud module documentation.

## Whitepaper

Section "Hedge Flow Analysis: Impulse Curve and Charm Integral" in `whitepaper/whitepaper.tex` covers:
- Motivation (dollar exposures as sufficient statistics, no time weighting needed)
- Regime derivation from IV surface
- Taylor expansion derivation of the hedge impulse
- k calibration from skew slope
- Gaussian kernel smoothing with adaptive width
- Curve analysis features (zero crossings, basins/peaks, asymmetry, regime)
- Charm integral formulation
- Real-time recalculation on OI changes
