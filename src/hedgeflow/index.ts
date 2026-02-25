import { ExposurePerExpiry, IVSurface } from '../types';
import { deriveRegimeParams } from './regime';
import { computeHedgeImpulseCurve } from './curve';
import { computeCharmIntegral } from './charm';
import { HedgeImpulseConfig, CharmIntegralConfig, HedgeFlowAnalysis } from './types';

// Re-export all types
export type {
  // Regime types
  MarketRegime,
  RegimeParams,
  // Hedge impulse types
  HedgeImpulseConfig,
  HedgeImpulsePoint,
  HedgeImpulseCurve,
  ZeroCrossing,
  ImpulseExtremum,
  DirectionalAsymmetry,
  ImpulseRegime,
  // Charm integral types
  CharmIntegralConfig,
  CharmBucket,
  CharmIntegral,
  // Combined
  HedgeFlowAnalysis,
} from './types';

// Re-export pressure cloud types
export type {
  HedgeContractEstimates,
  PressureZone,
  RegimeEdge,
  PressureLevel,
  PressureCloudConfig,
  PressureCloud,
} from './pressurecloud';

// Re-export regime functions
export { deriveRegimeParams, interpolateIVAtStrike } from './regime';

// Re-export computation functions
export { computeHedgeImpulseCurve } from './curve';
export { computeCharmIntegral } from './charm';

// Re-export pressure cloud
export { computePressureCloud } from './pressurecloud';

/**
 * Compute a complete hedge flow analysis for a single expiration.
 * 
 * This combines the hedge impulse curve (conditional: what happens if 
 * price moves) with the charm integral (unconditional: what happens 
 * from time passage alone).
 * 
 * The two analyses are intentionally kept separate because they answer
 * orthogonal questions:
 * 
 * - Impulse curve: "If spot moves to price S, do dealers amplify or 
 *   dampen the move?" (Left panel)
 * - Charm integral: "If spot does nothing, where does time decay 
 *   push things?" (Right panel)
 * 
 * Both update in real-time as:
 * - Spot price changes → impulse curve re-evaluates k and kernel positions
 * - Option quotes change → IV surface updates → regime params change
 * - Open interest changes → exposure recalculation → both panels update
 * 
 * @param exposures - Per-strike gamma, vanna, charm exposures for one expiration
 * @param ivSurface - IV surface for the same expiration (used for regime derivation)
 * @param impulseConfig - Optional config for the impulse curve grid and kernel
 * @param charmConfig - Optional config for the charm integral time stepping
 * @returns Combined hedge flow analysis
 */
export function analyzeHedgeFlow(
  exposures: ExposurePerExpiry,
  ivSurface: IVSurface,
  impulseConfig: HedgeImpulseConfig = {},
  charmConfig: CharmIntegralConfig = {},
): HedgeFlowAnalysis {
  const regimeParams = deriveRegimeParams(ivSurface, exposures.spotPrice);
  const impulseCurve = computeHedgeImpulseCurve(exposures, ivSurface, impulseConfig);
  const charmIntegral = computeCharmIntegral(exposures, charmConfig);

  return {
    impulseCurve,
    charmIntegral,
    regimeParams,
  };
}
