---
created: 2025-02-16 08:45:00
created_by: claude opus 4.6
---

# Pressure Field Module — Archived Experiments

The `src/pressure/` module was removed prior to initial release. This documents what was built and why it was replaced by `src/hedgeflow/`.

## What Existed

### `regime.ts` — **Kept** (moved to `src/hedgeflow/regime.ts`)
Derives market regime parameters from the IV surface: ATM IV, skew-derived spot-vol correlation, curvature-derived vol-of-vol, and regime classification (calm/normal/stressed/crisis). This is shared infrastructure used by the hedge impulse computation.

### `normalize.ts` — **Removed**
Converted raw GEX/VEX/CEX into "expected daily flow" units by multiplying by expected daily trigger frequencies. Produced relative weights (e.g., gamma 40%, vanna 35%, charm 25%) to show which Greek dominates.

**Why removed:** Dollar exposures already incorporate time-to-expiry effects through the Black-Scholes Greeks. The normalization double-counted this information. The hedge impulse curve provides a more precise answer to "which Greek dominates" by showing the combined curve shape directly.

### `grid.ts` — **Removed**
Built a 2D pressure grid (spot × time) with separate gamma/vanna/charm flow components combined via regime-dependent weight tables. Identified support/resistance levels and path of least resistance.

**Why removed:** Two critical issues:
1. **No locality weighting** — All strikes contributed equally regardless of distance from the evaluation point. A gamma wall 200 points away had the same influence as one 5 points away. The hedge impulse curve's Gaussian kernel smoothing fixes this.
2. **Heuristic combination** — Gamma, vanna, and charm were combined as independent additive flows with arbitrary regime weights (e.g., crisis: gamma 0.25, vanna 0.6, charm 0.15). The hedge impulse's Taylor expansion provides a physically motivated combination with one free parameter (k) derived from observables.

The time dimension was the only unique capability, but the implementation was approximate (static exposures across time steps without re-computing Greeks), so the charm integral provides a tighter answer to the time-evolution question.

### `ivpath.ts` — **Removed**
Predicted IV surface evolution based on dealer positioning. Included vanna/vomma/veta IV pressure computation, surface evolution prediction, and cascade simulation (iterative feedback loops).

**Why removed:** The *concept* is sound and worth revisiting (now in Future Work), but the implementation had too many hardcoded parameters to ship with confidence:
- `vommaProxy = vannaExposure * 0.1` — No actual vomma computation in floe
- `ivImpactPerMillion = 0.0005` — Hardcoded market impact coefficient
- `estimateSpotPressureFromIVChange` — Used magic number division by 10^9 with 0.001 fudge factor
- Liquidity score `1 - moneyness * 0.4` — Arbitrary decay

All of these would need to be either derived from observables (like the hedge impulse's k derivation) or properly calibrated before shipping. The framework is documented in Future Work for revisiting.

## Whitepaper Changes

The whitepaper section "Hedging Pressure Field and IV Path Dynamics" was removed. Key concepts that were worth preserving (regime derivation, IV surface parameter extraction) were folded into the new "Hedge Flow Analysis" section. The IV path prediction and cascade simulation concepts remain in Future Work.

## TODO for Future Work

1. **IV Surface Evolution Prediction** — Revisit ivpath.ts with proper vomma computation and observable-derived impact parameters
2. **Cascade Simulation** — The feedback loop concept (IV change → hedging → further IV change) is valuable but needs rigorous parameterization
3. **2D Time Evolution** — If a time grid is revisited, it should re-compute Greeks at each time step rather than assuming static exposures
