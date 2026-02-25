import { ExposurePerExpiry } from '../types';
import { HedgeImpulseCurve, HedgeImpulsePoint, ImpulseExtremum, ZeroCrossing } from './types';
import { RegimeParams } from './types';

// ============================================================================
// Pressure Cloud Types
// ============================================================================

/**
 * Expected dealer hedge volume in futures contracts for a 1-point spot move.
 * Positive = dealers buying, negative = dealers selling.
 */
export interface HedgeContractEstimates {
  /** E-mini Nasdaq 100 (multiplier: 20) */
  nq: number;
  /** Micro E-mini Nasdaq 100 (multiplier: 2) */
  mnq: number;
  /** E-mini S&P 500 (multiplier: 50) */
  es: number;
  /** Micro E-mini S&P 500 (multiplier: 5) */
  mes: number;
}

/**
 * A zone where price is likely to stabilize (positive impulse)
 * or accelerate (negative impulse).
 */
export interface PressureZone {
  /** Center price of the zone (peak of the impulse) */
  center: number;
  /** Lower bound of the zone (25th percentile of the peak width) */
  lower: number;
  /** Upper bound of the zone (75th percentile of the peak width) */
  upper: number;
  /** Normalized strength 0-1 (relative to the strongest zone found) */
  strength: number;
  /** Whether this zone is above or below current spot */
  side: 'above-spot' | 'below-spot';
  /**
   * Trade type this zone favors:
   * - Stability zones below spot → long (buy the bounce)
   * - Stability zones above spot → short (sell the rejection)
   * - Acceleration zones below spot → short (momentum downside)
   * - Acceleration zones above spot → long (momentum upside / squeeze)
   */
  tradeType: 'long' | 'short';
  /**
   * Hedge execution type:
   * - passive: dealers post resting limit orders (positive gamma → absorption)
   * - aggressive: dealers send market orders (negative gamma → sweeping)
   */
  hedgeType: 'passive' | 'aggressive';
}

/**
 * A regime boundary where behavior flips between mean-reverting and trend-amplifying.
 */
export interface RegimeEdge {
  /** Price at which the impulse curve crosses zero */
  price: number;
  /** Direction of the transition relative to a downward price move */
  transitionType: 'stable-to-unstable' | 'unstable-to-stable';
}

/**
 * Per-price-level detail for the full pressure overlay.
 */
export interface PressureLevel {
  /** Price level */
  price: number;
  /**
   * Stability score: positive means mean-reverting pressure at this level.
   * Higher = stronger buffering. Weighted by proximity to spot.
   */
  stabilityScore: number;
  /**
   * Acceleration score: positive means trend-amplifying pressure at this level.
   * Higher = stronger momentum fuel. Weighted by proximity to spot.
   */
  accelerationScore: number;
  /**
   * Expected signed hedge contracts (positive = dealers buy, negative = dealers sell)
   * for a 1-point spot move toward this level. Units depend on product.
   * @deprecated Use hedgeContracts instead for multi-product estimates.
   */
  expectedHedgeContracts: number;
  /** Multi-product hedge contract estimates */
  hedgeContracts: HedgeContractEstimates;
  /**
   * Whether dealers would hedge passively (limit orders / absorption)
   * or aggressively (market orders / sweeping) at this level.
   */
  hedgeType: 'passive' | 'aggressive';
}

/**
 * Configuration for pressure cloud computation.
 */
export interface PressureCloudConfig {
  /**
   * Product multiplier for contract conversion.
   * NQ = 20, MNQ = 2, ES = 50, MES = 5, SPY = 100 (shares).
   * Default: 20 (NQ)
   */
  contractMultiplier?: number;
  /** Product type hint for primary contract display. Default: 'NQ' */
  product?: 'NQ' | 'MNQ' | 'ES' | 'MES' | 'SPY';
  /**
   * How many expected-daily-moves to consider "reachable".
   * Levels beyond this get heavily penalized. Default: 2.0
   */
  reachabilityMultiple?: number;
  /**
   * Minimum impulse magnitude (as fraction of mean abs impulse) to
   * qualify as a zone. Default: 0.15
   */
  zoneThreshold?: number;
}

/**
 * Complete pressure cloud analysis combining stability and acceleration zones.
 */
export interface PressureCloud {
  /** Current spot price */
  spot: number;
  /** Expiration timestamp */
  expiration: number;
  /** Timestamp when this cloud was computed */
  computedAt: number;

  /**
   * Stability zones: levels where positive dealer impulse creates
   * mean-reverting pressure. Price decelerates into these zones.
   * Trade approach: reversal / bounce entries.
   */
  stabilityZones: PressureZone[];

  /**
   * Acceleration zones: levels where negative dealer impulse creates
   * trend-amplifying pressure. Price accelerates through these zones.
   * Trade approach: momentum / breakout continuation.
   */
  accelerationZones: PressureZone[];

  /**
   * Regime edges: prices where the impulse curve crosses zero,
   * marking transitions between mean-reverting and trend-amplifying behavior.
   */
  regimeEdges: RegimeEdge[];

  /**
   * Per-price-level detail for the full chart overlay.
   * Every point on the impulse curve grid, enriched with scores and contract estimates.
   */
  priceLevels: PressureLevel[];
}

/** Product multipliers for contract conversion */
const PRODUCT_MULTIPLIERS = {
  NQ: 20,
  MNQ: 2,
  ES: 50,
  MES: 5,
} as const;

/**
 * Convert a dollar impulse value to hedge contracts for a given product multiplier.
 * contracts = impulse / (multiplier * spot * 0.01)
 */
function impulseToContracts(impulse: number, multiplier: number, spot: number): number {
  const denominator = multiplier * spot * 0.01;
  return denominator > 0 ? sanitize(impulse / denominator) : 0;
}

/**
 * Compute multi-product hedge contract estimates from a dollar impulse value.
 */
function computeHedgeContractEstimates(impulse: number, spot: number): HedgeContractEstimates {
  return {
    nq: impulseToContracts(impulse, PRODUCT_MULTIPLIERS.NQ, spot),
    mnq: impulseToContracts(impulse, PRODUCT_MULTIPLIERS.MNQ, spot),
    es: impulseToContracts(impulse, PRODUCT_MULTIPLIERS.ES, spot),
    mes: impulseToContracts(impulse, PRODUCT_MULTIPLIERS.MES, spot),
  };
}

// ============================================================================
// Implementation
// ============================================================================

/**
 * Compute a pressure cloud from an existing hedge impulse curve.
 *
 * The pressure cloud translates the raw impulse curve into actionable
 * trading zones:
 *
 * - **Stability zones** (positive impulse peaks, weighted by proximity):
 *   Where dealer hedging creates counter-trend flow. These are bounce/rejection
 *   targets — price decelerates into them and often stalls or reverses.
 *
 * - **Acceleration zones** (negative impulse troughs, weighted by proximity):
 *   Where dealer hedging creates with-trend flow. If price reaches these levels,
 *   dealers amplify the move. These are momentum/breakout zones — price
 *   accelerates through them.
 *
 * - **Regime edges** (zero crossings):
 *   Where behavior flips. Critical for understanding "if price breaks past X,
 *   the character of the tape changes."
 *
 * @param impulseCurve - A previously computed hedge impulse curve
 * @param regimeParams - Regime parameters (for expected daily move / reachability)
 * @param config - Optional tuning parameters
 * @returns Complete pressure cloud analysis
 */
export function computePressureCloud(
  impulseCurve: HedgeImpulseCurve,
  regimeParams: RegimeParams,
  config: PressureCloudConfig = {},
): PressureCloud {
  const {
    contractMultiplier = 20, // NQ default
    reachabilityMultiple = 2.0,
    zoneThreshold = 0.15,
  } = config;

  const { spot, curve, extrema, zeroCrossings } = impulseCurve;
  const expectedMove = regimeParams.expectedDailySpotMove * spot;

  // Compute reachability-weighted scores for each price level
  const priceLevels = computePriceLevels(
    curve,
    spot,
    expectedMove,
    reachabilityMultiple,
    contractMultiplier,
  );

  // Extract stability zones from positive impulse peaks
  const stabilityZones = extractStabilityZones(
    extrema,
    curve,
    spot,
    expectedMove,
    reachabilityMultiple,
    zoneThreshold,
  );

  // Extract acceleration zones from negative impulse troughs
  const accelerationZones = extractAccelerationZones(
    extrema,
    curve,
    spot,
    expectedMove,
    reachabilityMultiple,
    zoneThreshold,
  );

  // Convert zero crossings to regime edges
  const regimeEdges = convertZeroCrossingsToEdges(zeroCrossings, spot);

  return {
    spot,
    expiration: impulseCurve.expiration,
    computedAt: Date.now(),
    stabilityZones,
    accelerationZones,
    regimeEdges,
    priceLevels,
  };
}

/**
 * Compute per-price-level detail from the impulse curve.
 */
function computePriceLevels(
  curve: HedgeImpulsePoint[],
  spot: number,
  expectedMove: number,
  reachabilityMultiple: number,
  contractMultiplier: number,
): PressureLevel[] {
  const reachRange = expectedMove * reachabilityMultiple;

  return curve.map((point) => {
    const distance = Math.abs(point.price - spot);
    const proximity = Math.exp(-((distance / reachRange) ** 2));

    // Stability: positive impulse weighted by proximity
    const stabilityScore = point.impulse > 0
      ? point.impulse * proximity
      : 0;

    // Acceleration: negative impulse magnitude weighted by proximity
    const accelerationScore = point.impulse < 0
      ? Math.abs(point.impulse) * proximity
      : 0;

    // Convert dollar impulse to signed contract count.
    // impulse is $ of hedging per 1% move. For contracts per 1 point:
    // contracts = impulse / (contractMultiplier * spot * 0.01)
    const contractDenominator = contractMultiplier * spot * 0.01;
    const expectedHedgeContracts = contractDenominator > 0
      ? point.impulse / contractDenominator
      : 0;

    return {
      price: point.price,
      stabilityScore,
      accelerationScore,
      expectedHedgeContracts: sanitize(expectedHedgeContracts),
      hedgeContracts: computeHedgeContractEstimates(point.impulse, spot),
      hedgeType: point.impulse >= 0 ? 'passive' as const : 'aggressive' as const,
    };
  });
}

/**
 * Extract stability zones from positive impulse peaks (basins).
 */
function extractStabilityZones(
  extrema: ImpulseExtremum[],
  curve: HedgeImpulsePoint[],
  spot: number,
  expectedMove: number,
  reachabilityMultiple: number,
  zoneThreshold: number,
): PressureZone[] {
  const basins = extrema.filter((e) => e.type === 'basin');
  if (basins.length === 0) return [];

  const reachRange = expectedMove * reachabilityMultiple;
  const maxImpulse = Math.max(...basins.map((b) => Math.abs(b.impulse)), 1e-10);

  // Filter by threshold
  const significant = basins.filter(
    (b) => Math.abs(b.impulse) / maxImpulse >= zoneThreshold,
  );

  // Build zones
  const zones: PressureZone[] = significant.map((basin) => {
    const proximity = Math.exp(-((Math.abs(basin.price - spot) / reachRange) ** 2));
    const rawStrength = (Math.abs(basin.impulse) / maxImpulse) * proximity;

    // Find zone width: where impulse drops to 50% of peak
    const halfPeak = basin.impulse * 0.5;
    const { lower, upper } = findZoneBounds(curve, basin.price, halfPeak);

    const side: PressureZone['side'] = basin.price >= spot ? 'above-spot' : 'below-spot';
    const tradeType: PressureZone['tradeType'] = side === 'below-spot' ? 'long' : 'short';

    return {
      center: basin.price,
      lower,
      upper,
      strength: Math.min(1, rawStrength),
      side,
      tradeType,
      hedgeType: 'passive' as const,
    };
  });

  // Sort by strength descending
  return zones.sort((a, b) => b.strength - a.strength);
}

/**
 * Extract acceleration zones from negative impulse troughs (peaks in the type system).
 */
function extractAccelerationZones(
  extrema: ImpulseExtremum[],
  curve: HedgeImpulsePoint[],
  spot: number,
  expectedMove: number,
  reachabilityMultiple: number,
  zoneThreshold: number,
): PressureZone[] {
  const peaks = extrema.filter((e) => e.type === 'peak');
  if (peaks.length === 0) return [];

  const reachRange = expectedMove * reachabilityMultiple;
  const maxImpulse = Math.max(...peaks.map((p) => Math.abs(p.impulse)), 1e-10);

  const significant = peaks.filter(
    (p) => Math.abs(p.impulse) / maxImpulse >= zoneThreshold,
  );

  const zones: PressureZone[] = significant.map((peak) => {
    const proximity = Math.exp(-((Math.abs(peak.price - spot) / reachRange) ** 2));
    const rawStrength = (Math.abs(peak.impulse) / maxImpulse) * proximity;

    const halfTrough = peak.impulse * 0.5;
    const { lower, upper } = findZoneBounds(curve, peak.price, halfTrough);

    const side: PressureZone['side'] = peak.price >= spot ? 'above-spot' : 'below-spot';
    // Acceleration below spot → momentum short (waterfall)
    // Acceleration above spot → momentum long (squeeze)
    const tradeType: PressureZone['tradeType'] = side === 'below-spot' ? 'short' : 'long';

    return {
      center: peak.price,
      lower,
      upper,
      strength: Math.min(1, rawStrength),
      side,
      tradeType,
      hedgeType: 'aggressive' as const,
    };
  });

  return zones.sort((a, b) => b.strength - a.strength);
}

/**
 * Find the price bounds where impulse drops to the given threshold
 * around a peak/trough center price.
 */
function findZoneBounds(
  curve: HedgeImpulsePoint[],
  centerPrice: number,
  thresholdImpulse: number,
): { lower: number; upper: number } {
  // Find the center index
  let centerIdx = 0;
  let minDist = Infinity;
  for (let i = 0; i < curve.length; i++) {
    const d = Math.abs(curve[i].price - centerPrice);
    if (d < minDist) {
      minDist = d;
      centerIdx = i;
    }
  }

  const isPositive = thresholdImpulse > 0;

  // Scan left for lower bound
  let lowerIdx = centerIdx;
  for (let i = centerIdx - 1; i >= 0; i--) {
    if (isPositive ? curve[i].impulse < thresholdImpulse : curve[i].impulse > thresholdImpulse) {
      lowerIdx = i;
      break;
    }
    lowerIdx = i;
  }

  // Scan right for upper bound
  let upperIdx = centerIdx;
  for (let i = centerIdx + 1; i < curve.length; i++) {
    if (isPositive ? curve[i].impulse < thresholdImpulse : curve[i].impulse > thresholdImpulse) {
      upperIdx = i;
      break;
    }
    upperIdx = i;
  }

  return {
    lower: curve[lowerIdx].price,
    upper: curve[upperIdx].price,
  };
}

/**
 * Convert impulse zero crossings into regime edge descriptors.
 */
function convertZeroCrossingsToEdges(
  crossings: ZeroCrossing[],
  spot: number,
): RegimeEdge[] {
  return crossings.map((crossing) => {
    // A "falling" crossing means impulse goes from positive to negative.
    // If this is below spot, moving down into it means going from
    // stable (positive impulse) to unstable (negative impulse).
    // If above spot, it's the reverse perspective.
    const isBelow = crossing.price < spot;

    let transitionType: RegimeEdge['transitionType'];
    if (crossing.direction === 'falling') {
      // Impulse goes + → -
      transitionType = isBelow ? 'stable-to-unstable' : 'unstable-to-stable';
    } else {
      // Impulse goes - → +
      transitionType = isBelow ? 'unstable-to-stable' : 'stable-to-unstable';
    }

    return {
      price: crossing.price,
      transitionType,
    };
  });
}

function sanitize(value: number): number {
  return isFinite(value) && !isNaN(value) ? value : 0;
}
