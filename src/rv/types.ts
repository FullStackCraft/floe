/**
 * A single price observation for realized volatility computation.
 */
export interface PriceObservation {
  /** Price of the underlying (mid, last, or whatever the consumer provides) */
  price: number;
  /** Timestamp in milliseconds */
  timestamp: number;
}

/**
 * Result of computing realized volatility from price observations.
 */
export interface RealizedVolatilityResult {
  /** Annualized realized volatility as decimal (e.g. 0.18 = 18%) */
  realizedVolatility: number;
  /** Annualized realized variance */
  annualizedVariance: number;
  /** Raw quadratic variation: Σ (ln(Pᵢ/Pᵢ₋₁))² */
  quadraticVariation: number;
  /** Number of price observations used */
  numObservations: number;
  /** Number of returns computed (observations - 1) */
  numReturns: number;
  /** Elapsed time in minutes from first to last observation */
  elapsedMinutes: number;
  /** Elapsed time in years (for annualization reference) */
  elapsedYears: number;
  /** Timestamp of first observation */
  firstObservation: number;
  /** Timestamp of last observation */
  lastObservation: number;
}
