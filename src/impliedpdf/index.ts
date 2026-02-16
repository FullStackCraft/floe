import { NormalizedOption } from '../types';

/**
 * Strike-level probability from the implied PDF
 */
export interface StrikeProbability {
  /** Strike price */
  strike: number;
  /** Probability density at this strike (normalized to sum to 1) */
  probability: number;
}

/**
 * Implied probability distribution derived from option prices
 * using Breeden-Litzenberger style numerical differentiation
 */
export interface ImpliedProbabilityDistribution {
  /** Underlying symbol */
  symbol: string;
  /** Expiration timestamp in milliseconds */
  expiryDate: number;
  /** Timestamp when the distribution was calculated (milliseconds) */
  calculationTimestamp: number;
  /** Current underlying price */
  underlyingPrice: number;
  /** Strike probabilities (the PDF) */
  strikeProbabilities: StrikeProbability[];
  /** Most likely price (mode of the distribution) */
  mostLikelyPrice: number;
  /** Median price (50th percentile) */
  medianPrice: number;
  /** Expected value (mean) of the distribution */
  expectedValue: number;
  /** Expected move (standard deviation) */
  expectedMove: number;
  /** Tail skew ratio (right tail / left tail relative to mean) */
  tailSkew: number;
  /** Cumulative probability of finishing above current spot */
  cumulativeProbabilityAboveSpot: number;
  /** Cumulative probability of finishing below current spot */
  cumulativeProbabilityBelowSpot: number;
}

/**
 * Result of estimating implied probability distribution
 */
export type ImpliedPDFResult = 
  | { success: true; distribution: ImpliedProbabilityDistribution }
  | { success: false; error: string };

/**
 * Estimate an implied probability density function (PDF) for a single expiry
 * using Breeden-Litzenberger style numerical differentiation of call prices.
 * 
 * This method computes the second derivative of call option prices with respect
 * to strike price, which under risk-neutral pricing gives the probability density
 * of the underlying ending at each strike.
 * 
 * @param symbol - Underlying ticker symbol
 * @param underlyingPrice - Current spot/mark price of the underlying
 * @param callOptions - Array of call options for a single expiry (must have bid > 0 and ask > 0)
 * @returns ImpliedProbabilityDistribution with strike-level probabilities and summary statistics
 * 
 * @example
 * ```typescript
 * const result = estimateImpliedProbabilityDistribution(
 *   'QQQ',
 *   500.00,
 *   callOptionsForExpiry
 * );
 * 
 * if (result.success) {
 *   console.log('Mode:', result.distribution.mostLikelyPrice);
 *   console.log('Expected move:', result.distribution.expectedMove);
 * }
 * ```
 */
export function estimateImpliedProbabilityDistribution(
  symbol: string,
  underlyingPrice: number,
  callOptions: NormalizedOption[],
): ImpliedPDFResult {
  // Sort call options by strike price ascending
  const sortedOptions = [...callOptions].sort((a, b) => a.strike - b.strike);
  
  const n = sortedOptions.length;
  if (n < 3) {
    return { success: false, error: 'Not enough data points (need at least 3 call options)' };
  }

  // Get expiration from first option (assuming all same expiry)
  const expiryDate = sortedOptions[0].expirationTimestamp;

  // Estimate second derivative numerically (central difference)
  // f(K) ≈ d²C/dK² where C is the call price
  const strikeProbabilities: StrikeProbability[] = new Array(n);
  
  // Initialize edge cases with zero probability
  strikeProbabilities[0] = { strike: sortedOptions[0].strike, probability: 0 };
  strikeProbabilities[n - 1] = { strike: sortedOptions[n - 1].strike, probability: 0 };

  for (let i = 1; i < n - 1; i++) {
    const kPrev = sortedOptions[i - 1].strike;
    const kCurr = sortedOptions[i].strike;
    const kNext = sortedOptions[i + 1].strike;

    // Use mid prices for stability
    const midPrev = (sortedOptions[i - 1].bid + sortedOptions[i - 1].ask) / 2;
    const midCurr = (sortedOptions[i].bid + sortedOptions[i].ask) / 2;
    const midNext = (sortedOptions[i + 1].bid + sortedOptions[i + 1].ask) / 2;

    const cPrev = midPrev;
    const cNext = midNext;

    // Protect against division by zero if strikes are too close
    const strikeDiff = kNext - kPrev;
    if (Math.abs(strikeDiff) < 1e-9) {
      strikeProbabilities[i] = { strike: kCurr, probability: 0 };
      continue;
    }

    // Second derivative: d²C/dK² ≈ (C(K+) - 2*C(K) + C(K-)) / (ΔK)²
    const d2 = (cNext - 2 * midCurr + cPrev) / Math.pow(strikeDiff, 2);
    
    // f(K) = e^{rT} * d²C/dK², ignoring discount for simplicity
    // Ensure non-negative probability
    strikeProbabilities[i] = { strike: kCurr, probability: Math.max(d2, 0) };
  }

  // Normalize densities to sum to 1
  let sum = 0;
  for (const sp of strikeProbabilities) {
    sum += sp.probability;
  }

  // Protect against division by zero if all probabilities are 0
  if (sum < 1e-9) {
    return { success: false, error: `Insufficient probability mass to normalize (sum=${sum})` };
  }

  for (let i = 0; i < strikeProbabilities.length; i++) {
    strikeProbabilities[i].probability /= sum;
  }

  // Compute summary statistics

  // Most likely price (mode)
  let mostLikelyPrice = strikeProbabilities[0].strike;
  let maxProb = 0;
  for (const sp of strikeProbabilities) {
    if (sp.probability > maxProb) {
      maxProb = sp.probability;
      mostLikelyPrice = sp.strike;
    }
  }

  // Compute cumulative distribution for median
  let cumulative = 0;
  let medianPrice = strikeProbabilities[Math.floor(strikeProbabilities.length / 2)].strike;
  for (const sp of strikeProbabilities) {
    cumulative += sp.probability;
    if (cumulative >= 0.5) {
      medianPrice = sp.strike;
      break;
    }
  }

  // Expected value (mean)
  let mean = 0;
  for (const sp of strikeProbabilities) {
    mean += sp.strike * sp.probability;
  }

  // Variance and expected move (standard deviation)
  let variance = 0;
  for (const sp of strikeProbabilities) {
    const diff = sp.strike - mean;
    variance += diff * diff * sp.probability;
  }
  const expectedMove = Math.sqrt(variance);

  // Tail skew: rightTail / leftTail relative to mean
  let leftTail = 0;
  let rightTail = 0;
  for (const sp of strikeProbabilities) {
    if (sp.strike < mean) {
      leftTail += sp.probability;
    } else {
      rightTail += sp.probability;
    }
  }
  const tailSkew = rightTail / Math.max(leftTail, 1e-9);

  // Cumulative probabilities above and below spot price
  let cumulativeBelowSpot = 0;
  let cumulativeAboveSpot = 0;
  for (const sp of strikeProbabilities) {
    if (sp.strike < underlyingPrice) {
      cumulativeBelowSpot += sp.probability;
    } else if (sp.strike > underlyingPrice) {
      cumulativeAboveSpot += sp.probability;
    }
  }

  return {
    success: true,
    distribution: {
      symbol,
      expiryDate,
      calculationTimestamp: Date.now(),
      underlyingPrice,
      strikeProbabilities,
      mostLikelyPrice,
      medianPrice,
      expectedValue: mean,
      expectedMove,
      tailSkew,
      cumulativeProbabilityAboveSpot: cumulativeAboveSpot,
      cumulativeProbabilityBelowSpot: cumulativeBelowSpot,
    },
  };
}

/**
 * Estimate implied probability distributions for all expirations in an option chain
 * 
 * @param symbol - Underlying ticker symbol
 * @param underlyingPrice - Current spot/mark price of the underlying
 * @param options - Array of all options (calls and puts, all expirations)
 * @returns Array of ImpliedProbabilityDistribution for each expiration
 * 
 * @example
 * ```typescript
 * const distributions = estimateImpliedProbabilityDistributions(
 *   'QQQ',
 *   500.00,
 *   chain.options
 * );
 * 
 * for (const dist of distributions) {
 *   console.log(`Expiry: ${new Date(dist.expiryDate).toISOString()}`);
 *   console.log(`Mode: ${dist.mostLikelyPrice}`);
 * }
 * ```
 */
export function estimateImpliedProbabilityDistributions(
  symbol: string,
  underlyingPrice: number,
  options: NormalizedOption[],
): ImpliedProbabilityDistribution[] {
  // Get unique expirations
  const expirationsSet = new Set<number>();
  for (const option of options) {
    expirationsSet.add(option.expirationTimestamp);
  }
  const expirations = Array.from(expirationsSet).sort((a, b) => a - b);

  const distributions: ImpliedProbabilityDistribution[] = [];

  for (const expiry of expirations) {
    // Filter to call options at this expiry with valid bid/ask
    const callOptionsAtExpiry = options.filter(
      (opt) =>
        opt.expirationTimestamp === expiry &&
        opt.optionType === 'call' &&
        opt.bid > 0 &&
        opt.ask > 0
    );

    const result = estimateImpliedProbabilityDistribution(
      symbol,
      underlyingPrice,
      callOptionsAtExpiry
    );

    if (result.success) {
      distributions.push(result.distribution);
    }
    // Silently skip expirations that don't have enough data
  }

  return distributions;
}

/**
 * Get the probability of the underlying finishing between two price levels
 * 
 * @param distribution - Implied probability distribution
 * @param lowerBound - Lower price bound
 * @param upperBound - Upper price bound
 * @returns Probability of finishing between the bounds
 * 
 * @example
 * ```typescript
 * // Probability of QQQ finishing between 490 and 510
 * const prob = getProbabilityInRange(distribution, 490, 510);
 * console.log(`${(prob * 100).toFixed(1)}% chance of finishing in range`);
 * ```
 */
export function getProbabilityInRange(
  distribution: ImpliedProbabilityDistribution,
  lowerBound: number,
  upperBound: number,
): number {
  let probability = 0;
  for (const sp of distribution.strikeProbabilities) {
    if (sp.strike >= lowerBound && sp.strike <= upperBound) {
      probability += sp.probability;
    }
  }
  return probability;
}

/**
 * Get the cumulative probability up to a given price level
 * 
 * @param distribution - Implied probability distribution
 * @param price - Price level
 * @returns Cumulative probability of finishing at or below the price
 * 
 * @example
 * ```typescript
 * // Probability of QQQ finishing at or below 495
 * const prob = getCumulativeProbability(distribution, 495);
 * console.log(`${(prob * 100).toFixed(1)}% chance of finishing <= 495`);
 * ```
 */
export function getCumulativeProbability(
  distribution: ImpliedProbabilityDistribution,
  price: number,
): number {
  let probability = 0;
  for (const sp of distribution.strikeProbabilities) {
    if (sp.strike <= price) {
      probability += sp.probability;
    }
  }
  return probability;
}

/**
 * Get the quantile (inverse CDF) for a given probability
 * 
 * @param distribution - Implied probability distribution
 * @param probability - Probability value between 0 and 1
 * @returns Strike price at the given probability quantile
 * 
 * @example
 * ```typescript
 * // Find the 5th and 95th percentile strikes
 * const p5 = getQuantile(distribution, 0.05);
 * const p95 = getQuantile(distribution, 0.95);
 * console.log(`90% confidence interval: [${p5}, ${p95}]`);
 * ```
 */
export function getQuantile(
  distribution: ImpliedProbabilityDistribution,
  probability: number,
): number {
  if (probability <= 0) {
    return distribution.strikeProbabilities[0]?.strike ?? 0;
  }
  if (probability >= 1) {
    return distribution.strikeProbabilities[distribution.strikeProbabilities.length - 1]?.strike ?? 0;
  }

  let cumulative = 0;
  for (const sp of distribution.strikeProbabilities) {
    cumulative += sp.probability;
    if (cumulative >= probability) {
      return sp.strike;
    }
  }

  return distribution.strikeProbabilities[distribution.strikeProbabilities.length - 1]?.strike ?? 0;
}

// Re-export exposure-adjusted PDF functionality
export {
  estimateExposureAdjustedPDF,
  getEdgeAtPrice,
  getSignificantAdjustmentLevels,
  DEFAULT_ADJUSTMENT_CONFIG,
  LOW_VOL_CONFIG,
  CRISIS_CONFIG,
  OPEX_CONFIG,
  type ExposureAdjustmentConfig,
  type AdjustedPDFResult,
  type PDFComparison,
} from './adjusted';
