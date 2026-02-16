import { NormalizedOption, MILLISECONDS_PER_YEAR } from '../types';
import { getTimeToExpirationInYears } from '../blackscholes';
import { VarianceSwapResult, ImpliedVolatilityResult } from './types';

export type { VarianceSwapResult, ImpliedVolatilityResult } from './types';

// ============================================================================
// Internal helpers
// ============================================================================

/**
 * Compute ΔK for each strike: half the distance between adjacent strikes.
 * For endpoints, use the distance to the single neighbor.
 */
function computeDeltaK(strikes: number[]): Map<number, number> {
  const deltaK = new Map<number, number>();

  if (strikes.length === 0) return deltaK;
  if (strikes.length === 1) {
    deltaK.set(strikes[0], 1); // fallback
    return deltaK;
  }

  for (let i = 0; i < strikes.length; i++) {
    if (i === 0) {
      deltaK.set(strikes[i], strikes[i + 1] - strikes[i]);
    } else if (i === strikes.length - 1) {
      deltaK.set(strikes[i], strikes[i] - strikes[i - 1]);
    } else {
      deltaK.set(strikes[i], (strikes[i + 1] - strikes[i - 1]) / 2);
    }
  }

  return deltaK;
}

/**
 * Group options by strike, pairing calls and puts.
 */
function pairOptionsByStrike(
  options: NormalizedOption[],
): Map<number, { call?: NormalizedOption; put?: NormalizedOption }> {
  const pairs = new Map<number, { call?: NormalizedOption; put?: NormalizedOption }>();

  for (const opt of options) {
    const existing = pairs.get(opt.strike) || {};
    if (opt.optionType === 'call') {
      existing.call = opt;
    } else {
      existing.put = opt;
    }
    pairs.set(opt.strike, existing);
  }

  return pairs;
}

/**
 * Get mid price for an option. Returns 0 if no valid quote.
 */
function midPrice(opt?: NormalizedOption): number {
  if (!opt) return 0;
  if (opt.bid > 0 && opt.ask > 0) return (opt.bid + opt.ask) / 2;
  if (opt.mark > 0) return opt.mark;
  return 0;
}

/**
 * Compute the model-free implied variance for a single expiration
 * using the CBOE variance swap methodology.
 *
 * This implements the formula:
 *
 *   σ² = (2/T) × Σᵢ (ΔKᵢ/Kᵢ²) × e^(rT) × Q(Kᵢ) - (1/T) × (F/K₀ - 1)²
 *
 * Where:
 * - K₀ is the strike where |call_mid - put_mid| is minimized
 * - F = K₀ + e^(rT) × (call(K₀) - put(K₀)) is the forward price
 * - Q(Kᵢ) = put mid for Kᵢ < K₀, call mid for Kᵢ > K₀,
 *   average of call and put mids at K₀
 * - ΔKᵢ = (Kᵢ₊₁ - Kᵢ₋₁) / 2 (actual strike spacing, not hardcoded)
 *
 * Two consecutive zero-bid options terminate the summation in each
 * direction (puts walking down, calls walking up), per CBOE rules.
 *
 * @param options - All options for one expiration (calls and puts)
 * @param spot - Current underlying price
 * @param riskFreeRate - Annual risk-free rate as decimal (e.g. 0.05)
 * @returns Variance swap result with annualized IV
 */
export function computeVarianceSwapIV(
  options: NormalizedOption[],
  spot: number,
  riskFreeRate: number,
): VarianceSwapResult {
  // Pair calls and puts by strike
  const pairs = pairOptionsByStrike(options);
  const strikes = Array.from(pairs.keys()).sort((a, b) => a - b);

  if (strikes.length === 0) {
    return emptyResult(spot);
  }

  // Use first option's expiration (all should be same expiry)
  const expiration = options[0].expirationTimestamp;
  const T = getTimeToExpirationInYears(expiration);

  if (T <= 0) {
    return emptyResult(spot);
  }

  const r = riskFreeRate;
  const eRT = Math.exp(r * T);

  // Step 1: Find K₀ — strike where |call_mid - put_mid| is minimized
  // Only consider strikes within reasonable range of spot
  let k0 = strikes[0];
  let minDiff = Infinity;
  let callAtK0 = 0;
  let putAtK0 = 0;

  for (const strike of strikes) {
    const pair = pairs.get(strike)!;
    const callMid = midPrice(pair.call);
    const putMid = midPrice(pair.put);

    if (callMid > 0 && putMid > 0) {
      const diff = Math.abs(callMid - putMid);
      if (diff < minDiff) {
        minDiff = diff;
        k0 = strike;
        callAtK0 = callMid;
        putAtK0 = putMid;
      }
    }
  }

  // Step 2: Forward price via put-call parity
  const F = k0 + eRT * (callAtK0 - putAtK0);

  // Step 3: Compute ΔK for each strike
  const deltaKMap = computeDeltaK(strikes);

  // Step 4: Sum OTM contributions
  // Puts below K₀ (walk down, stop after two consecutive zero bids)
  let putContribution = 0;
  let callContribution = 0;
  let numStrikes = 0;

  // Put side: strikes ≤ K₀, walking downward from K₀
  const putStrikes = strikes.filter(k => k <= k0).reverse(); // descending
  let consecutiveZeroBids = 0;

  for (const strike of putStrikes) {
    const pair = pairs.get(strike)!;
    const dk = deltaKMap.get(strike) || 1;
    let Q = 0;

    if (strike === k0) {
      // At K₀: average of call and put
      Q = (midPrice(pair.call) + midPrice(pair.put)) / 2;
    } else {
      // Below K₀: use put
      if (!pair.put || pair.put.bid === 0) {
        consecutiveZeroBids++;
        if (consecutiveZeroBids >= 2) break;
        continue;
      }
      consecutiveZeroBids = 0;
      Q = midPrice(pair.put);
    }

    if (Q > 0) {
      putContribution += (dk / (strike * strike)) * eRT * Q;
      numStrikes++;
    }
  }

  // Call side: strikes ≥ K₀, walking upward from K₀
  const callStrikes = strikes.filter(k => k >= k0); // ascending
  consecutiveZeroBids = 0;

  for (const strike of callStrikes) {
    const pair = pairs.get(strike)!;
    const dk = deltaKMap.get(strike) || 1;
    let Q = 0;

    if (strike === k0) {
      // Already counted in put side, skip to avoid double-counting
      continue;
    } else {
      // Above K₀: use call
      if (!pair.call || pair.call.bid === 0) {
        consecutiveZeroBids++;
        if (consecutiveZeroBids >= 2) break;
        continue;
      }
      consecutiveZeroBids = 0;
      Q = midPrice(pair.call);
    }

    if (Q > 0) {
      callContribution += (dk / (strike * strike)) * eRT * Q;
      numStrikes++;
    }
  }

  // Step 5: Compute σ²
  const totalContribution = putContribution + callContribution;
  const variance = (2 / T) * totalContribution - (1 / T) * Math.pow(F / k0 - 1, 2);

  // Guard against negative variance (can happen with bad data)
  const clampedVariance = Math.max(0, variance);
  const iv = Math.sqrt(clampedVariance);

  return {
    impliedVolatility: iv,
    annualizedVariance: clampedVariance,
    forward: F,
    k0,
    timeToExpiry: T,
    expiration,
    numStrikes,
    putContribution,
    callContribution,
  };
}

/**
 * Compute implied volatility from option prices using the CBOE
 * variance swap methodology.
 *
 * If only nearTermOptions are provided, computes the single-expiration
 * model-free implied volatility directly.
 *
 * If farTermOptions are also provided, performs CBOE VIX-style
 * interpolation between the two terms to produce a constant-maturity
 * measure at `targetDays` (defaults to the far term's DTE).
 *
 * The interpolation formula (in variance space):
 *
 *   VIX = 100 × √{ [T₁σ₁² × (N₂ - N_target)/(N₂ - N₁)
 *                   + T₂σ₂² × (N_target - N₁)/(N₂ - N₁)]
 *                   × N_365 / N_target }
 *
 * @param nearTermOptions - Options for the near-term expiration
 * @param spot - Current underlying price
 * @param riskFreeRate - Annual risk-free rate as decimal
 * @param farTermOptions - Options for the far-term expiration (optional)
 * @param targetDays - Target constant maturity in days for interpolation
 *                     (defaults to far term DTE if far term provided)
 */
export function computeImpliedVolatility(
  nearTermOptions: NormalizedOption[],
  spot: number,
  riskFreeRate: number,
  farTermOptions?: NormalizedOption[] | null,
  targetDays?: number,
): ImpliedVolatilityResult {
  const nearResult = computeVarianceSwapIV(nearTermOptions, spot, riskFreeRate);

  // Single-term mode
  if (!farTermOptions || farTermOptions.length === 0) {
    return {
      impliedVolatility: nearResult.impliedVolatility,
      nearTerm: nearResult,
      farTerm: null,
      targetDays: null,
      isInterpolated: false,
    };
  }

  // Two-term interpolation mode
  const farResult = computeVarianceSwapIV(farTermOptions, spot, riskFreeRate);

  const N1 = nearResult.timeToExpiry * MILLISECONDS_PER_YEAR; // near term ms
  const N2 = farResult.timeToExpiry * MILLISECONDS_PER_YEAR;  // far term ms
  const T1 = nearResult.timeToExpiry;
  const T2 = farResult.timeToExpiry;
  const sigma1sq = nearResult.annualizedVariance;
  const sigma2sq = farResult.annualizedVariance;

  // Target in milliseconds
  const N365 = MILLISECONDS_PER_YEAR;
  const effectiveTargetDays = targetDays ?? Math.round(farResult.timeToExpiry * 365);
  const Ntarget = effectiveTargetDays * (MILLISECONDS_PER_YEAR / 365);

  // Guard: if near and far are the same expiration, just return near
  if (Math.abs(N2 - N1) < 1) {
    return {
      impliedVolatility: nearResult.impliedVolatility,
      nearTerm: nearResult,
      farTerm: farResult,
      targetDays: effectiveTargetDays,
      isInterpolated: false,
    };
  }

  // CBOE interpolation in variance space
  const weight1 = (N2 - Ntarget) / (N2 - N1);
  const weight2 = (Ntarget - N1) / (N2 - N1);

  const interpolatedVariance =
    (T1 * sigma1sq * weight1 + T2 * sigma2sq * weight2) * (N365 / Ntarget);

  const clampedVariance = Math.max(0, interpolatedVariance);
  const iv = Math.sqrt(clampedVariance);

  return {
    impliedVolatility: iv,
    nearTerm: nearResult,
    farTerm: farResult,
    targetDays: effectiveTargetDays,
    isInterpolated: true,
  };
}

function emptyResult(spot: number): VarianceSwapResult {
  return {
    impliedVolatility: 0,
    annualizedVariance: 0,
    forward: spot,
    k0: spot,
    timeToExpiry: 0,
    expiration: 0,
    numStrikes: 0,
    putContribution: 0,
    callContribution: 0,
  };
}
