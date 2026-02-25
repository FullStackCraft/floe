/**
 * A single observation for the vol response regression model.
 * The consumer accumulates these as the 0DTE session progresses.
 */
export interface VolResponseObservation {
  /** Timestamp in milliseconds */
  timestamp: number;
  /** Change in IV from previous observation: IV(t) - IV(t-1), as decimal */
  deltaIV: number;
  /** Log return of spot: ln(S(t) / S(t-1)) */
  spotReturn: number;
  /** Absolute value of the log return */
  absSpotReturn: number;
  /** Current realized volatility level (annualized, decimal) */
  rvLevel: number;
  /** Current IV level (annualized, decimal) */
  ivLevel: number;
}

/**
 * Regression coefficients from the IV response model.
 *
 *   deltaIV(t) ~ intercept + b1*return + b2*|return| + b3*RV + b4*IV_level
 */
export interface VolResponseCoefficients {
  /** Intercept */
  intercept: number;
  /** Coefficient on signed spot return (captures spot-vol correlation) */
  betaReturn: number;
  /** Coefficient on |return| (captures vol-of-vol / convexity response) */
  betaAbsReturn: number;
  /** Coefficient on RV level (captures RV mean-reversion effect) */
  betaRV: number;
  /** Coefficient on IV level (captures IV mean-reversion effect) */
  betaIVLevel: number;
}

/**
 * Configuration for the vol response model.
 */
export interface VolResponseConfig {
  /** Minimum observations before the model is considered valid. Default: 30 */
  minObservations?: number;
  /** Z-score threshold for vol_bid signal. Default: 1.5 */
  volBidThreshold?: number;
  /** Z-score threshold for vol_offered signal. Default: -1.5 */
  volOfferedThreshold?: number;
}

/**
 * Full result of the vol response residual model.
 */
export interface VolResponseResult {
  /** Whether the model has enough data to be meaningful */
  isValid: boolean;
  /** Minimum number of observations required (for reference) */
  minObservations: number;
  /** Number of observations used in the regression */
  numObservations: number;
  /** Fitted regression coefficients */
  coefficients: VolResponseCoefficients;
  /** R-squared of the regression */
  rSquared: number;
  /** Standard deviation of the residuals */
  residualStdDev: number;
  /** The most recent predicted (expected) deltaIV */
  expectedDeltaIV: number;
  /** The most recent observed deltaIV */
  observedDeltaIV: number;
  /** The residual: observed - expected */
  residual: number;
  /** The z-score: residual / residualStdDev */
  zScore: number;
  /** Discrete signal classification */
  signal: 'vol_bid' | 'vol_offered' | 'neutral' | 'insufficient_data';
  /** Timestamp of the most recent observation */
  timestamp: number;
}
