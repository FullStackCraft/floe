import { NormalizedOption } from '../types';

/**
 * Result of computing model-free implied variance for a single expiration
 * using the CBOE variance swap methodology.
 */
export interface VarianceSwapResult {
  /** Annualized implied volatility as decimal (e.g. 0.20 = 20%) */
  impliedVolatility: number;
  /** Annualized variance σ² */
  annualizedVariance: number;
  /** Forward price F derived from put-call parity at K₀ */
  forward: number;
  /** At-the-money strike K₀ (strike where |call - put| is minimized) */
  k0: number;
  /** Time to expiry in years */
  timeToExpiry: number;
  /** Expiration timestamp (ms) */
  expiration: number;
  /** Number of strikes that contributed to the variance sum */
  numStrikes: number;
  /** Total put-side contribution to variance */
  putContribution: number;
  /** Total call-side contribution to variance */
  callContribution: number;
}

/**
 * Result of computing implied volatility, either single-term or
 * interpolated between two terms (CBOE VIX-style).
 */
export interface ImpliedVolatilityResult {
  /** Final annualized implied volatility as decimal */
  impliedVolatility: number;
  /** Near-term (or only-term) variance swap result */
  nearTerm: VarianceSwapResult;
  /** Far-term variance swap result, if two terms provided */
  farTerm: VarianceSwapResult | null;
  /** Target days for interpolation (null if single-term) */
  targetDays: number | null;
  /** Whether the result is interpolated between two terms */
  isInterpolated: boolean;
}
