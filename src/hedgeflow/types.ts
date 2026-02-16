import { ExposurePerExpiry, IVSurface } from '../types';

// ============================================================================
// Regime Types (derived from IV surface characteristics)
// ============================================================================

/**
 * Regime classification based on IV level and surface characteristics
 */
export type MarketRegime = 'calm' | 'normal' | 'stressed' | 'crisis';

/**
 * Parameters derived from the IV surface itself (no external data needed)
 */
export interface RegimeParams {
  /** ATM implied volatility (as decimal, e.g., 0.18 for 18%) */
  atmIV: number;
  /** Implied spot-vol correlation derived from skew */
  impliedSpotVolCorr: number;
  /** Implied vol-of-vol derived from smile curvature */
  impliedVolOfVol: number;
  /** Regime classification */
  regime: MarketRegime;
  /** Expected daily spot move (as decimal) */
  expectedDailySpotMove: number;
  /** Expected daily vol move (as decimal) */
  expectedDailyVolMove: number;
}

// ============================================================================
// Hedge Impulse Types (combined gamma-vanna response curve)
// ============================================================================

/**
 * Configuration for the hedge impulse curve computation
 */
export interface HedgeImpulseConfig {
  /** Price grid range as percentage of spot (e.g. 3 for ±3%). Default: 3 */
  rangePercent?: number;
  /** Price grid step as percentage of spot (e.g. 0.05 for 0.05%). Default: 0.05 */
  stepPercent?: number;
  /**
   * Gaussian kernel width in number of strike spacings.
   * Auto-detected from the option chain's strike spacing.
   * Default: 2 (i.e. lambda = 2 * modal strike spacing)
   */
  kernelWidthStrikes?: number;
}

/**
 * Hedge impulse value at a single price level
 * 
 * The hedge impulse H(S) represents the net dealer delta hedge change
 * per unit spot move if price were at S. It combines gamma and vanna
 * via the empirical spot-vol coupling:
 * 
 *   H(S) = Gamma(S) - (k / S) * Vanna(S)
 * 
 * where k is derived from the IV surface skew slope.
 */
export interface HedgeImpulsePoint {
  /** Price level */
  price: number;
  /** Smoothed gamma exposure at this price level (kernel-weighted from strikes) */
  gamma: number;
  /** Smoothed vanna exposure at this price level (kernel-weighted from strikes) */
  vanna: number;
  /** Combined hedge impulse: gamma - (k/S) * vanna */
  impulse: number;
}

/**
 * A zero crossing of the hedge impulse curve
 */
export interface ZeroCrossing {
  /** Price at which the crossing occurs (interpolated) */
  price: number;
  /** Direction: 'rising' means impulse goes from negative to positive */
  direction: 'rising' | 'falling';
}

/**
 * A local extremum (basin or peak) of the hedge impulse curve
 */
export interface ImpulseExtremum {
  /** Price at the extremum */
  price: number;
  /** Impulse value at the extremum */
  impulse: number;
  /** 'basin' = positive local max (attractor), 'peak' = negative local min (accelerator) */
  type: 'basin' | 'peak';
}

/**
 * Directional asymmetry analysis around current spot
 */
export interface DirectionalAsymmetry {
  /** Integrated impulse from spot to spot + integrationRange */
  upside: number;
  /** Integrated impulse from spot to spot - integrationRange */
  downside: number;
  /** Integration range used (percentage of spot) */
  integrationRangePercent: number;
  /** Which side has more negative impulse (= path of least resistance) */
  bias: 'up' | 'down' | 'neutral';
  /** Ratio of |upside| to |downside| impulse. >1 means upside is larger magnitude */
  asymmetryRatio: number;
}

/**
 * Regime classification based on the impulse curve shape
 */
export type ImpulseRegime = 
  | 'pinned'       // Strong positive impulse at spot (mean-reverting)
  | 'expansion'    // Negative impulse at spot, could break either way
  | 'squeeze-up'   // Negative impulse above, positive below (upside acceleration)
  | 'squeeze-down' // Negative impulse below, positive above (downside acceleration)
  | 'neutral';     // Mixed or weak signals

/**
 * Complete hedge impulse curve result
 */
export interface HedgeImpulseCurve {
  /** Current spot price */
  spot: number;
  /** Expiration timestamp */
  expiration: number;
  /** Timestamp when this curve was computed */
  computedAt: number;
  /** Spot-vol coupling coefficient derived from IV surface */
  spotVolCoupling: number;
  /** Kernel width used (in price units) */
  kernelWidth: number;
  /** Strike spacing detected from the option chain */
  strikeSpacing: number;
  /** The full curve of impulse values across the price grid */
  curve: HedgeImpulsePoint[];
  /** Impulse value at current spot (interpolated) */
  impulseAtSpot: number;
  /** Slope of the impulse curve at current spot (dH/dS) */
  slopeAtSpot: number;
  /** Zero crossings of the impulse curve */
  zeroCrossings: ZeroCrossing[];
  /** Local extrema (basins = attractors, peaks = accelerators) */
  extrema: ImpulseExtremum[];
  /** Directional asymmetry analysis */
  asymmetry: DirectionalAsymmetry;
  /** Regime classification */
  regime: ImpulseRegime;
  /** Nearest attractor (positive impulse basin) above spot, if any */
  nearestAttractorAbove: number | null;
  /** Nearest attractor (positive impulse basin) below spot, if any */
  nearestAttractorBelow: number | null;
}

// ============================================================================
// Charm Integral Types (time-decay pressure to close)
// ============================================================================

/**
 * Configuration for charm integral computation
 */
export interface CharmIntegralConfig {
  /** Time step for the integral in minutes. Default: 15 */
  timeStepMinutes?: number;
}

/**
 * Charm integral at a single time bucket
 */
export interface CharmBucket {
  /** Minutes remaining to expiry at start of this bucket */
  minutesRemaining: number;
  /** Instantaneous CEX at this time */
  instantaneousCEX: number;
  /** Cumulative CEX from now to this time */
  cumulativeCEX: number;
}

/**
 * Complete charm integral result
 */
export interface CharmIntegral {
  /** Current spot price */
  spot: number;
  /** Expiration timestamp */
  expiration: number;
  /** Timestamp when this was computed */
  computedAt: number;
  /** Minutes remaining from computation time to expiry */
  minutesRemaining: number;
  /** Total charm integral from now to close (cumulative expected delta change) */
  totalCharmToClose: number;
  /** Direction: positive = net buying pressure from charm, negative = net selling */
  direction: 'buying' | 'selling' | 'neutral';
  /** Bucketed charm integral curve for visualization */
  buckets: CharmBucket[];
  /** Per-strike charm breakdown (for understanding what drives the integral) */
  strikeContributions: Array<{
    strike: number;
    charmExposure: number;
    fractionOfTotal: number;
  }>;
}

// ============================================================================
// Combined Hedge Flow Analysis
// ============================================================================

/**
 * Complete hedge flow analysis combining impulse curve and charm integral
 */
export interface HedgeFlowAnalysis {
  /** The instantaneous hedge impulse curve (left panel) */
  impulseCurve: HedgeImpulseCurve;
  /** The charm integral to close (right panel) */
  charmIntegral: CharmIntegral;
  /** Regime params derived from IV surface */
  regimeParams: RegimeParams;
}
