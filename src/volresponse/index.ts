import {
  VolResponseObservation,
  VolResponseCoefficients,
  VolResponseConfig,
  VolResponseResult,
} from './types';

export type {
  VolResponseObservation,
  VolResponseCoefficients,
  VolResponseConfig,
  VolResponseResult,
} from './types';

// Number of features in the regression (intercept + 4 regressors)
const NUM_FEATURES = 5;

// Small ridge penalty for numerical stability of the normal equations
const RIDGE_LAMBDA = 1e-8;

/**
 * Build a VolResponseObservation from consecutive IV/RV/spot readings.
 *
 * The consumer calls this on each tick after the first, passing the
 * current and previous IV/spot values. The resulting observation can
 * then be accumulated and passed to computeVolResponseZScore.
 *
 * @param current - Current tick values
 * @param previous - Previous tick values (IV and spot only)
 * @returns A VolResponseObservation ready for the regression
 */
export function buildVolResponseObservation(
  current: { iv: number; rv: number; spot: number; timestamp: number },
  previous: { iv: number; spot: number },
): VolResponseObservation {
  const deltaIV = current.iv - previous.iv;
  const spotReturn = Math.log(current.spot / previous.spot);

  return {
    timestamp: current.timestamp,
    deltaIV,
    spotReturn,
    absSpotReturn: Math.abs(spotReturn),
    rvLevel: current.rv,
    ivLevel: current.iv,
  };
}

/**
 * Compute the vol response z-score from accumulated observations.
 *
 * Fits an expanding-window OLS regression:
 *
 *   deltaIV(t) ~ a + b1*return + b2*|return| + b3*RV + b4*IV_level
 *
 * Then computes the residual of the most recent observation and
 * normalizes it by the residual standard deviation to produce a z-score.
 *
 * Interpretation:
 * - z >> 0: vol is bid relative to baseline (stress / demand)
 * - z << 0: vol is offered relative to baseline (supply / crush)
 * - z ~ 0: normal vol response given the price path
 *
 * @param observations - All accumulated VolResponseObservation for the session
 * @param config - Optional configuration overrides
 * @returns VolResponseResult with z-score and signal classification
 */
export function computeVolResponseZScore(
  observations: VolResponseObservation[],
  config: VolResponseConfig = {},
): VolResponseResult {
  const {
    minObservations = 30,
    volBidThreshold = 1.5,
    volOfferedThreshold = -1.5,
  } = config;

  const emptyCoefficients: VolResponseCoefficients = {
    intercept: 0,
    betaReturn: 0,
    betaAbsReturn: 0,
    betaRV: 0,
    betaIVLevel: 0,
  };

  if (observations.length < minObservations) {
    return {
      isValid: false,
      minObservations,
      numObservations: observations.length,
      coefficients: emptyCoefficients,
      rSquared: 0,
      residualStdDev: 0,
      expectedDeltaIV: 0,
      observedDeltaIV: observations.length > 0 ? observations[observations.length - 1].deltaIV : 0,
      residual: 0,
      zScore: 0,
      signal: 'insufficient_data',
      timestamp: observations.length > 0 ? observations[observations.length - 1].timestamp : 0,
    };
  }

  // Build design matrix X and response vector y
  const n = observations.length;
  const X: number[][] = new Array(n);
  const y: number[] = new Array(n);

  for (let i = 0; i < n; i++) {
    const obs = observations[i];
    X[i] = [1, obs.spotReturn, obs.absSpotReturn, obs.rvLevel, obs.ivLevel];
    y[i] = obs.deltaIV;
  }

  // Solve OLS via normal equations with ridge regularization
  const ols = solveOLS(X, y);

  if (!ols) {
    return {
      isValid: false,
      minObservations,
      numObservations: n,
      coefficients: emptyCoefficients,
      rSquared: 0,
      residualStdDev: 0,
      expectedDeltaIV: 0,
      observedDeltaIV: observations[n - 1].deltaIV,
      residual: 0,
      zScore: 0,
      signal: 'insufficient_data',
      timestamp: observations[n - 1].timestamp,
    };
  }

  const { beta, residuals, rSquared, residualStdDev } = ols;
  const lastObs = observations[n - 1];
  const lastX = X[n - 1];

  // Predicted deltaIV for the most recent observation
  let expectedDeltaIV = 0;
  for (let j = 0; j < NUM_FEATURES; j++) {
    expectedDeltaIV += beta[j] * lastX[j];
  }

  const residual = lastObs.deltaIV - expectedDeltaIV;
  const zScore = residualStdDev > 0 ? residual / residualStdDev : 0;

  let signal: VolResponseResult['signal'] = 'neutral';
  if (zScore > volBidThreshold) {
    signal = 'vol_bid';
  } else if (zScore < volOfferedThreshold) {
    signal = 'vol_offered';
  }

  const coefficients: VolResponseCoefficients = {
    intercept: beta[0],
    betaReturn: beta[1],
    betaAbsReturn: beta[2],
    betaRV: beta[3],
    betaIVLevel: beta[4],
  };

  return {
    isValid: true,
    minObservations,
    numObservations: n,
    coefficients,
    rSquared,
    residualStdDev,
    expectedDeltaIV,
    observedDeltaIV: lastObs.deltaIV,
    residual,
    zScore,
    signal,
    timestamp: lastObs.timestamp,
  };
}

// ============================================================================
// Internal OLS implementation (normal equations with ridge regularization)
// ============================================================================

interface OLSResult {
  beta: number[];
  residuals: number[];
  rSquared: number;
  residualStdDev: number;
}

/**
 * Solve ordinary least squares: beta = (X'X + lambda*I)^{-1} X'y
 *
 * For a small system (5 features), direct inversion via Gauss-Jordan
 * elimination is efficient and avoids external dependencies.
 */
function solveOLS(X: number[][], y: number[]): OLSResult | null {
  const n = X.length;
  const p = NUM_FEATURES;

  // Compute X'X (p x p)
  const XtX: number[][] = new Array(p);
  for (let i = 0; i < p; i++) {
    XtX[i] = new Array(p).fill(0);
    for (let j = 0; j < p; j++) {
      let sum = 0;
      for (let k = 0; k < n; k++) {
        sum += X[k][i] * X[k][j];
      }
      XtX[i][j] = sum;
    }
  }

  // Add ridge penalty to diagonal (skip intercept at index 0)
  for (let i = 1; i < p; i++) {
    XtX[i][i] += RIDGE_LAMBDA;
  }

  // Compute X'y (p x 1)
  const Xty: number[] = new Array(p).fill(0);
  for (let i = 0; i < p; i++) {
    let sum = 0;
    for (let k = 0; k < n; k++) {
      sum += X[k][i] * y[k];
    }
    Xty[i] = sum;
  }

  // Solve (X'X + lambda*I) * beta = X'y via Gauss-Jordan elimination
  // Augment [XtX | Xty] into a (p x p+1) matrix
  const aug: number[][] = new Array(p);
  for (let i = 0; i < p; i++) {
    aug[i] = new Array(p + 1);
    for (let j = 0; j < p; j++) {
      aug[i][j] = XtX[i][j];
    }
    aug[i][p] = Xty[i];
  }

  // Forward elimination with partial pivoting
  for (let col = 0; col < p; col++) {
    // Find pivot
    let maxVal = Math.abs(aug[col][col]);
    let maxRow = col;
    for (let row = col + 1; row < p; row++) {
      const val = Math.abs(aug[row][col]);
      if (val > maxVal) {
        maxVal = val;
        maxRow = row;
      }
    }

    if (maxVal < 1e-14) {
      return null; // Singular matrix
    }

    // Swap rows
    if (maxRow !== col) {
      const temp = aug[col];
      aug[col] = aug[maxRow];
      aug[maxRow] = temp;
    }

    // Eliminate below and above
    const pivot = aug[col][col];
    for (let j = col; j <= p; j++) {
      aug[col][j] /= pivot;
    }

    for (let row = 0; row < p; row++) {
      if (row === col) continue;
      const factor = aug[row][col];
      for (let j = col; j <= p; j++) {
        aug[row][j] -= factor * aug[col][j];
      }
    }
  }

  // Extract beta
  const beta: number[] = new Array(p);
  for (let i = 0; i < p; i++) {
    beta[i] = aug[i][p];
    if (!isFinite(beta[i])) return null;
  }

  // Compute residuals and statistics
  const residuals: number[] = new Array(n);
  let ssRes = 0;
  let yMean = 0;

  for (let i = 0; i < n; i++) {
    yMean += y[i];
  }
  yMean /= n;

  let ssTot = 0;
  for (let i = 0; i < n; i++) {
    let predicted = 0;
    for (let j = 0; j < p; j++) {
      predicted += beta[j] * X[i][j];
    }
    residuals[i] = y[i] - predicted;
    ssRes += residuals[i] * residuals[i];
    ssTot += (y[i] - yMean) * (y[i] - yMean);
  }

  const rSquared = ssTot > 0 ? Math.max(0, 1 - ssRes / ssTot) : 0;

  // Residual standard deviation (using n - p degrees of freedom)
  const dof = Math.max(n - p, 1);
  const residualStdDev = Math.sqrt(ssRes / dof);

  return { beta, residuals, rSquared, residualStdDev };
}
