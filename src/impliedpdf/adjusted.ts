import { 
  ImpliedProbabilityDistribution,
  StrikeProbability,
  estimateImpliedProbabilityDistribution,
  getProbabilityInRange,
  getCumulativeProbability,
  getQuantile,
} from './index';
import { StrikeExposure, ExposurePerExpiry, NormalizedOption } from '../types';

// ============================================================================
// Types
// ============================================================================

/**
 * Configuration for exposure-based PDF adjustments
 */
export interface ExposureAdjustmentConfig {
  /** Gamma adjustment settings */
  gamma: {
    /** Enable gamma-based kurtosis adjustment */
    enabled: boolean;
    /** Strength of attractor effect at +GEX strikes (0-1) */
    attractorStrength: number;
    /** Strength of repellent effect at -GEX strikes (0-1) */
    repellentStrength: number;
    /** Minimum absolute GEX to consider significant (in dollars) */
    threshold: number;
    /** Decay rate for influence distance (higher = more localized) */
    decayRate: number;
  };
  /** Vanna adjustment settings */
  vanna: {
    /** Enable vanna-based tail adjustment */
    enabled: boolean;
    /** Spot-vol beta: IV change per 1% spot move (typically -2 to -4 for indices) */
    spotVolBeta: number;
    /** Maximum tail fattening multiplier */
    maxTailMultiplier: number;
    /** Number of feedback iterations to simulate */
    feedbackIterations: number;
  };
  /** Charm adjustment settings */
  charm: {
    /** Enable charm-based mean shift */
    enabled: boolean;
    /** Time horizon multiplier ('intraday' = 0.25, 'daily' = 1.0, 'weekly' = 5.0) */
    timeHorizon: 'intraday' | 'daily' | 'weekly';
    /** Scaling factor for mean shift */
    shiftScale: number;
  };
}

/**
 * Result of exposure-adjusted PDF calculation
 */
export interface AdjustedPDFResult {
  /** Original market-implied distribution */
  baseline: ImpliedProbabilityDistribution;
  /** Exposure-adjusted distribution */
  adjusted: ImpliedProbabilityDistribution;
  /** Gamma modifier applied at each strike (multiplicative) */
  gammaModifiers: number[];
  /** Vanna modifier applied at each strike (multiplicative) */
  vannaModifiers: number[];
  /** Charm-induced mean shift (in price units) */
  charmShift: number;
  /** Comparison metrics between baseline and adjusted */
  comparison: PDFComparison;
}

/**
 * Comparison metrics between baseline and adjusted PDFs
 */
export interface PDFComparison {
  /** Shift in expected value */
  meanShift: number;
  /** Shift as percentage of spot */
  meanShiftPercent: number;
  /** Change in standard deviation */
  stdDevChange: number;
  /** Change in tail skew ratio */
  tailSkewChange: number;
  /** 5th percentile: baseline vs adjusted */
  leftTail: { baseline: number; adjusted: number; ratio: number };
  /** 95th percentile: baseline vs adjusted */
  rightTail: { baseline: number; adjusted: number; ratio: number };
  /** Dominant adjustment factor */
  dominantFactor: 'gamma' | 'vanna' | 'charm' | 'none';
}

// ============================================================================
// Default Configuration
// ============================================================================

/**
 * Default configuration tuned for SPX-like indices
 */
export const DEFAULT_ADJUSTMENT_CONFIG: ExposureAdjustmentConfig = {
  gamma: {
    enabled: true,
    attractorStrength: 0.3,
    repellentStrength: 0.3,
    threshold: 1_000_000, // $1M GEX
    decayRate: 2.0,
  },
  vanna: {
    enabled: true,
    spotVolBeta: -3.0,
    maxTailMultiplier: 2.5,
    feedbackIterations: 3,
  },
  charm: {
    enabled: true,
    timeHorizon: 'daily',
    shiftScale: 1.0,
  },
};

/**
 * Configuration for low volatility / grinding markets
 */
export const LOW_VOL_CONFIG: ExposureAdjustmentConfig = {
  gamma: {
    enabled: true,
    attractorStrength: 0.4, // Stronger pinning
    repellentStrength: 0.2,
    threshold: 500_000,
    decayRate: 1.5,
  },
  vanna: {
    enabled: true,
    spotVolBeta: -2.0, // Less reactive
    maxTailMultiplier: 1.5,
    feedbackIterations: 2,
  },
  charm: {
    enabled: true,
    timeHorizon: 'daily',
    shiftScale: 1.5, // Charm matters more in calm markets
  },
};

/**
 * Configuration for high volatility / crisis markets
 */
export const CRISIS_CONFIG: ExposureAdjustmentConfig = {
  gamma: {
    enabled: true,
    attractorStrength: 0.1, // Pins don't hold
    repellentStrength: 0.5, // -GEX acceleration dominates
    threshold: 2_000_000,
    decayRate: 3.0,
  },
  vanna: {
    enabled: true,
    spotVolBeta: -5.0, // Highly reactive
    maxTailMultiplier: 3.0,
    feedbackIterations: 5,
  },
  charm: {
    enabled: true,
    timeHorizon: 'intraday',
    shiftScale: 0.5, // Charm less important vs gamma/vanna
  },
};

/**
 * Configuration for OPEX week
 */
export const OPEX_CONFIG: ExposureAdjustmentConfig = {
  gamma: {
    enabled: true,
    attractorStrength: 0.5, // Strong pinning into expiry
    repellentStrength: 0.4,
    threshold: 1_000_000,
    decayRate: 2.5,
  },
  vanna: {
    enabled: true,
    spotVolBeta: -3.0,
    maxTailMultiplier: 2.0,
    feedbackIterations: 3,
  },
  charm: {
    enabled: true,
    timeHorizon: 'intraday', // Charm accelerates into expiry
    shiftScale: 2.0,
  },
};

// ============================================================================
// Core Functions
// ============================================================================

/**
 * Estimate an exposure-adjusted implied probability distribution.
 * 
 * This function takes the standard market-implied PDF (Breeden-Litzenberger)
 * and adjusts it based on dealer Greek exposures to produce a "mechanically-informed"
 * probability distribution that accounts for:
 * 
 * - **Gamma**: Creates "sticky" zones (+GEX) where price pins, and "slippery" zones
 *   (-GEX) where price accelerates through
 * - **Vanna**: Fattens tails based on the IV-spot feedback loop (selloffs spike IV,
 *   which forces more selling via negative vanna)
 * - **Charm**: Shifts the mean based on predictable delta decay over time
 * 
 * @param symbol - Underlying ticker symbol
 * @param underlyingPrice - Current spot price
 * @param callOptions - Call options for a single expiry
 * @param exposures - Canonical exposure metrics from calculateGammaVannaCharmExposures()
 * @param config - Adjustment configuration (uses defaults if not provided)
 * @returns Baseline and adjusted PDFs with comparison metrics
 * 
 * @example
 * ```typescript
 * // Get exposures first
 * const allExposures = calculateGammaVannaCharmExposures(chain, ivSurfaces);
 * const expiry = allExposures.find(e => e.expiration === targetExpiry);
 * const expiryExposures = expiry
 *   ? { spotPrice: expiry.spotPrice, expiration: expiry.expiration, ...expiry.canonical }
 *   : undefined;
 * 
 * // Calculate adjusted PDF
 * const result = estimateExposureAdjustedPDF(
 *   'SPX',
 *   4520,
 *   callOptionsForExpiry,
 *   expiryExposures
 * );
 * 
 * // Compare probabilities
 * const target = 4400;
 * const baselineProb = getCumulativeProbability(result.baseline, target);
 * const adjustedProb = getCumulativeProbability(result.adjusted, target);
 * console.log(`Market says ${baselineProb}% chance of ${target}`);
 * console.log(`Flow-adjusted: ${adjustedProb}% chance`);
 * ```
 */
export function estimateExposureAdjustedPDF(
  symbol: string,
  underlyingPrice: number,
  callOptions: NormalizedOption[],
  exposures: ExposurePerExpiry,
  config: Partial<ExposureAdjustmentConfig> = {},
): AdjustedPDFResult | { success: false; error: string } {
  // Merge config with defaults
  const cfg = mergeConfig(config);

  // Step 1: Get baseline PDF using existing Breeden-Litzenberger implementation
  const baselineResult = estimateImpliedProbabilityDistribution(
    symbol,
    underlyingPrice,
    callOptions
  );

  if (!baselineResult.success) {
    return { success: false, error: baselineResult.error };
  }

  const baseline = baselineResult.distribution;

  // Step 2: Calculate gamma modifiers
  const gammaModifiers = cfg.gamma.enabled
    ? calculateGammaModifiers(baseline.strikeProbabilities, exposures, underlyingPrice, cfg.gamma)
    : baseline.strikeProbabilities.map(() => 1.0);

  // Step 3: Calculate vanna modifiers
  const vannaModifiers = cfg.vanna.enabled
    ? calculateVannaModifiers(baseline.strikeProbabilities, exposures, underlyingPrice, cfg.vanna)
    : baseline.strikeProbabilities.map(() => 1.0);

  // Step 4: Calculate charm-induced mean shift
  const charmShift = cfg.charm.enabled
    ? calculateCharmShift(exposures, underlyingPrice, cfg.charm)
    : 0;

  // Step 5: Apply modifiers to create adjusted probabilities
  const adjustedProbabilities = applyModifiers(
    baseline.strikeProbabilities,
    gammaModifiers,
    vannaModifiers,
    charmShift
  );

  // Step 6: Normalize to ensure probabilities sum to 1
  const normalizedProbabilities = normalizeProbabilities(adjustedProbabilities);

  // Step 7: Recalculate distribution statistics
  const adjusted = recalculateDistributionStats(
    baseline,
    normalizedProbabilities,
    underlyingPrice
  );

  // Step 8: Calculate comparison metrics
  const comparison = calculateComparison(
    baseline,
    adjusted,
    gammaModifiers,
    vannaModifiers,
    charmShift
  );

  return {
    baseline,
    adjusted,
    gammaModifiers,
    vannaModifiers,
    charmShift,
    comparison,
  };
}

// ============================================================================
// Modifier Calculations
// ============================================================================

/**
 * Calculate gamma-based probability modifiers.
 * 
 * Positive GEX creates "attractors" - price tends to pin at these levels.
 * Negative GEX creates "repellents" - price accelerates through these levels.
 * 
 * Uses 1/d² decay similar to the "local hedge pressure field" concept.
 */
function calculateGammaModifiers(
  strikeProbabilities: StrikeProbability[],
  exposures: ExposurePerExpiry,
  spot: number,
  config: ExposureAdjustmentConfig['gamma'],
): number[] {
  const modifiers: number[] = [];

  // Find max absolute GEX for normalization
  const maxGex = Math.max(
    ...exposures.strikeExposures.map(e => Math.abs(e.gammaExposure)),
    1 // Prevent division by zero
  );

  for (const prob of strikeProbabilities) {
    let modifier = 1.0;

    for (const exposure of exposures.strikeExposures) {
      // Skip insignificant exposures
      if (Math.abs(exposure.gammaExposure) < config.threshold) {
        continue;
      }

      // Distance normalized by spot price
      const distance = Math.abs(prob.strike - exposure.strikePrice) / spot;

      // Influence decays with distance squared (electrostatic/gravitational)
      const influence = 1 / (1 + config.decayRate * distance * distance);

      // Normalized GEX (-1 to 1)
      const normalizedGex = exposure.gammaExposure / maxGex;

      if (exposure.gammaExposure > 0) {
        // Positive GEX = attractor = increase probability density
        modifier *= 1 + config.attractorStrength * normalizedGex * influence;
      } else {
        // Negative GEX = repellent = decrease probability density
        modifier *= 1 - config.repellentStrength * Math.abs(normalizedGex) * influence;
      }
    }

    // Clamp to reasonable bounds
    modifiers.push(Math.max(0.1, Math.min(3.0, modifier)));
  }

  return modifiers;
}

/**
 * Calculate vanna-based probability modifiers.
 * 
 * Vanna creates feedback loops:
 * - Spot drops → IV spikes → negative vanna forces selling → spot drops more
 * 
 * This fattens the left tail beyond what the market-implied PDF shows.
 */
function calculateVannaModifiers(
  strikeProbabilities: StrikeProbability[],
  exposures: ExposurePerExpiry,
  spot: number,
  config: ExposureAdjustmentConfig['vanna'],
): number[] {
  const modifiers: number[] = [];

  // Sum vanna below and above spot
  const vannaBelow = exposures.strikeExposures
    .filter(e => e.strikePrice < spot)
    .reduce((sum, e) => sum + e.vannaExposure, 0);

  const vannaAbove = exposures.strikeExposures
    .filter(e => e.strikePrice > spot)
    .reduce((sum, e) => sum + e.vannaExposure, 0);

  for (const prob of strikeProbabilities) {
    let modifier = 1.0;

    // Percentage move to this strike
    const movePercent = (prob.strike - spot) / spot;

    if (movePercent < 0) {
      // Downside move: estimate IV spike
      const ivSpike = -movePercent * Math.abs(config.spotVolBeta);

      // Vanna flow from IV change
      // Negative vanna * positive IV change = selling pressure
      const vannaFlow = vannaBelow * ivSpike;

      if (vannaFlow < 0) {
        // Selling pressure increases left tail probability
        let cumulativeEffect = 0;
        let currentFlow = Math.abs(vannaFlow);

        // Iterate feedback loop (each iteration dampens ~50%)
        for (let i = 0; i < config.feedbackIterations; i++) {
          cumulativeEffect += currentFlow;
          currentFlow *= 0.5;
        }

        // Scale to modifier (normalize by spot * $1M for comparability)
        const effectScale = cumulativeEffect / (spot * 1_000_000);
        modifier = 1 + Math.min(config.maxTailMultiplier - 1, effectScale);
      }
    } else if (movePercent > 0) {
      // Upside move: IV typically compresses (asymmetrically less than down moves)
      const ivCompress = movePercent * Math.abs(config.spotVolBeta) * 0.5;

      // Positive vanna + IV compression = less buying pressure on upside
      const vannaFlow = vannaAbove * (-ivCompress);

      if (vannaFlow > 0) {
        const effectScale = vannaFlow / (spot * 1_000_000);
        modifier = Math.max(0.5, 1 - effectScale * 0.5);
      }
    }

    modifiers.push(modifier);
  }

  return modifiers;
}

/**
 * Calculate charm-induced mean shift.
 * 
 * Net charm represents guaranteed delta decay. Negative net charm means
 * dealers will be net sellers over time (downward pressure).
 */
function calculateCharmShift(
  exposures: ExposurePerExpiry,
  spot: number,
  config: ExposureAdjustmentConfig['charm'],
): number {
  const timeMultiplier = {
    'intraday': 0.25,
    'daily': 1.0,
    'weekly': 5.0,
  }[config.timeHorizon];

  // Estimate price impact of charm flow
  // Heuristic: $1B of flow ≈ 0.1% price impact for large indices
  const flowImpactPerBillion = 0.001 * spot;
  const priceShift = (exposures.totalCharmExposure / 1_000_000_000) * flowImpactPerBillion * timeMultiplier;

  return priceShift * config.shiftScale;
}

// ============================================================================
// PDF Operations
// ============================================================================

/**
 * Apply gamma, vanna, and charm modifiers to probability distribution
 */
function applyModifiers(
  strikeProbabilities: StrikeProbability[],
  gammaModifiers: number[],
  vannaModifiers: number[],
  charmShift: number,
): StrikeProbability[] {
  return strikeProbabilities.map((sp, i) => ({
    strike: sp.strike + charmShift,
    probability: sp.probability * gammaModifiers[i] * vannaModifiers[i],
  }));
}

/**
 * Normalize probabilities to sum to 1
 */
function normalizeProbabilities(strikeProbabilities: StrikeProbability[]): StrikeProbability[] {
  const sum = strikeProbabilities.reduce((acc, sp) => acc + sp.probability, 0);

  if (sum < 1e-9) {
    // If all probabilities are essentially zero, return uniform
    const uniform = 1 / strikeProbabilities.length;
    return strikeProbabilities.map(sp => ({ ...sp, probability: uniform }));
  }

  return strikeProbabilities.map(sp => ({
    strike: sp.strike,
    probability: sp.probability / sum,
  }));
}

/**
 * Recalculate distribution statistics from adjusted probabilities
 */
function recalculateDistributionStats(
  baseline: ImpliedProbabilityDistribution,
  adjustedProbabilities: StrikeProbability[],
  underlyingPrice: number,
): ImpliedProbabilityDistribution {
  // Most likely price (mode)
  let mostLikelyPrice = adjustedProbabilities[0].strike;
  let maxProb = 0;
  for (const sp of adjustedProbabilities) {
    if (sp.probability > maxProb) {
      maxProb = sp.probability;
      mostLikelyPrice = sp.strike;
    }
  }

  // Median (50th percentile)
  let cumulative = 0;
  let medianPrice = adjustedProbabilities[Math.floor(adjustedProbabilities.length / 2)].strike;
  for (const sp of adjustedProbabilities) {
    cumulative += sp.probability;
    if (cumulative >= 0.5) {
      medianPrice = sp.strike;
      break;
    }
  }

  // Expected value (mean)
  let mean = 0;
  for (const sp of adjustedProbabilities) {
    mean += sp.strike * sp.probability;
  }

  // Variance and expected move (std dev)
  let variance = 0;
  for (const sp of adjustedProbabilities) {
    const diff = sp.strike - mean;
    variance += diff * diff * sp.probability;
  }
  const expectedMove = Math.sqrt(variance);

  // Tail skew
  let leftTail = 0;
  let rightTail = 0;
  for (const sp of adjustedProbabilities) {
    if (sp.strike < mean) {
      leftTail += sp.probability;
    } else {
      rightTail += sp.probability;
    }
  }
  const tailSkew = rightTail / Math.max(leftTail, 1e-9);

  // Cumulative above/below spot
  let cumulativeBelowSpot = 0;
  let cumulativeAboveSpot = 0;
  for (const sp of adjustedProbabilities) {
    if (sp.strike < underlyingPrice) {
      cumulativeBelowSpot += sp.probability;
    } else if (sp.strike > underlyingPrice) {
      cumulativeAboveSpot += sp.probability;
    }
  }

  return {
    symbol: baseline.symbol,
    expiryDate: baseline.expiryDate,
    calculationTimestamp: Date.now(),
    underlyingPrice,
    strikeProbabilities: adjustedProbabilities,
    mostLikelyPrice,
    medianPrice,
    expectedValue: mean,
    expectedMove,
    tailSkew,
    cumulativeProbabilityAboveSpot: cumulativeAboveSpot,
    cumulativeProbabilityBelowSpot: cumulativeBelowSpot,
  };
}

/**
 * Calculate comparison metrics between baseline and adjusted distributions
 */
function calculateComparison(
  baseline: ImpliedProbabilityDistribution,
  adjusted: ImpliedProbabilityDistribution,
  gammaModifiers: number[],
  vannaModifiers: number[],
  charmShift: number,
): PDFComparison {
  // Tail percentiles
  const baseline5 = getQuantile(baseline, 0.05);
  const baseline95 = getQuantile(baseline, 0.95);
  const adjusted5 = getQuantile(adjusted, 0.05);
  const adjusted95 = getQuantile(adjusted, 0.95);

  // Determine dominant factor
  const gammaEffect = Math.max(...gammaModifiers) - Math.min(...gammaModifiers);
  const vannaEffect = Math.max(...vannaModifiers) - Math.min(...vannaModifiers);
  const charmEffect = Math.abs(charmShift) / baseline.underlyingPrice;

  let dominantFactor: 'gamma' | 'vanna' | 'charm' | 'none' = 'none';
  const maxEffect = Math.max(gammaEffect, vannaEffect, charmEffect);

  if (maxEffect > 0.01) {
    if (gammaEffect === maxEffect) dominantFactor = 'gamma';
    else if (vannaEffect === maxEffect) dominantFactor = 'vanna';
    else dominantFactor = 'charm';
  }

  return {
    meanShift: adjusted.expectedValue - baseline.expectedValue,
    meanShiftPercent: ((adjusted.expectedValue - baseline.expectedValue) / baseline.underlyingPrice) * 100,
    stdDevChange: adjusted.expectedMove - baseline.expectedMove,
    tailSkewChange: adjusted.tailSkew - baseline.tailSkew,
    leftTail: {
      baseline: baseline5,
      adjusted: adjusted5,
      ratio: adjusted5 / baseline5,
    },
    rightTail: {
      baseline: baseline95,
      adjusted: adjusted95,
      ratio: adjusted95 / baseline95,
    },
    dominantFactor,
  };
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Merge partial config with defaults
 */
function mergeConfig(partial: Partial<ExposureAdjustmentConfig>): ExposureAdjustmentConfig {
  return {
    gamma: { ...DEFAULT_ADJUSTMENT_CONFIG.gamma, ...partial.gamma },
    vanna: { ...DEFAULT_ADJUSTMENT_CONFIG.vanna, ...partial.vanna },
    charm: { ...DEFAULT_ADJUSTMENT_CONFIG.charm, ...partial.charm },
  };
}

/**
 * Get the "edge" - the difference between market-implied and flow-adjusted
 * probability of reaching a price level.
 * 
 * Positive edge means the market is underpricing the probability of reaching that level.
 * Negative edge means the market is overpricing it.
 * 
 * @example
 * ```typescript
 * const result = estimateExposureAdjustedPDF(...);
 * const edge = getEdgeAtPrice(result, 4400);
 * console.log(`Edge at 4400: ${(edge * 100).toFixed(2)}%`);
 * // Output: "Edge at 4400: 2.35%"
 * // Meaning: flow mechanics suggest 2.35% higher probability than market prices
 * ```
 */
export function getEdgeAtPrice(result: AdjustedPDFResult, price: number): number {
  const baselineProb = getCumulativeProbability(result.baseline, price);
  const adjustedProb = getCumulativeProbability(result.adjusted, price);
  return adjustedProb - baselineProb;
}

/**
 * Get price levels where the adjustment is most significant
 */
export function getSignificantAdjustmentLevels(
  result: AdjustedPDFResult,
  threshold: number = 0.01,
): Array<{ strike: number; baselineProb: number; adjustedProb: number; edge: number }> {
  const levels: Array<{ strike: number; baselineProb: number; adjustedProb: number; edge: number }> = [];

  for (let i = 0; i < result.baseline.strikeProbabilities.length; i++) {
    const baselineProb = result.baseline.strikeProbabilities[i].probability;
    const adjustedProb = result.adjusted.strikeProbabilities[i]?.probability ?? 0;
    const edge = adjustedProb - baselineProb;

    if (Math.abs(edge) >= threshold) {
      levels.push({
        strike: result.baseline.strikeProbabilities[i].strike,
        baselineProb,
        adjustedProb,
        edge,
      });
    }
  }

  // Sort by absolute edge descending
  return levels.sort((a, b) => Math.abs(b.edge) - Math.abs(a.edge));
}

// Re-export utility functions from base module for convenience
export { getProbabilityInRange, getCumulativeProbability, getQuantile };
