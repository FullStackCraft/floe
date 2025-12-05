import { BlackScholesParams, Greeks, OptionType, MILLISECONDS_PER_YEAR, DAYS_PER_YEAR } from '../types';
import { cumulativeNormalDistribution, normalPDF } from '../utils/statistics';

/**
 * Calculate option price using Black-Scholes model
 * 
 * @param params - Black-Scholes parameters
 * @returns Option price
 * 
 * @example
 * ```typescript
 * const price = blackScholes({
 *   spot: 100,
 *   strike: 105,
 *   timeToExpiry: 0.25,
 *   volatility: 0.20,
 *   riskFreeRate: 0.05,
 *   optionType: 'call'
 * });
 * ```
 */
export function blackScholes(params: BlackScholesParams): number {
  const greeks = calculateGreeks(params);
  return greeks.price;
}

/**
 * Calculate complete option Greeks using Black-Scholes-Merton model
 * Includes all first, second, and third-order Greeks
 * 
 * @param params - Black-Scholes parameters
 * @returns Complete Greeks including price
 * 
 * @example
 * ```typescript
 * const greeks = calculateGreeks({
 *   spot: 100,
 *   strike: 105,
 *   timeToExpiry: 0.25,
 *   volatility: 0.20,
 *   riskFreeRate: 0.05,
 *   optionType: 'call'
 * });
 * ```
 */
export function calculateGreeks(params: BlackScholesParams): Greeks {
  const {
    spot: S,
    strike: K,
    timeToExpiry: t,
    volatility: vol,
    riskFreeRate: r,
    optionType,
    dividendYield: q = 0,
  } = params;

  // Safety checks
  if (t < 0) {
    return createZeroGreeks();
  }

  if (vol <= 0 || S <= 0 || t <= 0) {
    return createZeroGreeks();
  }

  // Calculate d1 and d2
  const sqrtT = Math.sqrt(t);
  const d1 = (Math.log(S / K) + (r - q + (vol * vol) / 2) * t) / (vol * sqrtT);
  const d2 = d1 - vol * sqrtT;

  // Calculate probability functions
  const nd1 = normalPDF(d1);
  const Nd1 = cumulativeNormalDistribution(d1);
  const Nd2 = cumulativeNormalDistribution(d2);
  const eqt = Math.exp(-q * t);
  const ert = Math.exp(-r * t);

  if (optionType === 'call') {
    return calculateCallGreeks(S, K, r, q, t, vol, d1, d2, nd1, Nd1, Nd2, eqt, ert);
  } else {
    return calculatePutGreeks(S, K, r, q, t, vol, d1, d2, nd1, Nd1, Nd2, eqt, ert);
  }
}

/**
 * Calculate all Greeks for a call option
 * @internal
 */
function calculateCallGreeks(
  S: number,
  K: number,
  r: number,
  q: number,
  t: number,
  vol: number,
  d1: number,
  d2: number,
  nd1: number,
  Nd1: number,
  Nd2: number,
  eqt: number,
  ert: number
): Greeks {
  const sqrtT = Math.sqrt(t);

  // Price
  const price = S * eqt * Nd1 - K * ert * Nd2;

  // First-order Greeks
  const delta = eqt * Nd1;
  const gamma = (eqt * nd1) / (S * vol * sqrtT);
  const theta = -(S * vol * eqt * nd1) / (2 * sqrtT) - r * K * ert * Nd2 + q * S * eqt * Nd1;
  const vega = S * eqt * sqrtT * nd1;
  const rho = K * t * ert * Nd2;

  // Second-order Greeks
  const vanna = -eqt * nd1 * (d2 / vol);
  const charm = -q * eqt * Nd1 - (eqt * nd1 * (2 * (r - q) * t - d2 * vol * sqrtT)) / (2 * t * vol * sqrtT);
  const volga = vega * ((d1 * d2) / (S * vol));
  const speed = nd1 / (S * vol);
  const zomma = (nd1 * d1) / (S * vol * vol);

  // Third-order Greeks
  const color = -(d1 * d2 * nd1) / (vol * vol);
  const ultima = (d1 * d2 * d2 * nd1) / (vol * vol * vol);

  return {
    price: round(price, 2),
    delta: round(delta, 5),
    gamma: round(gamma, 5),
    theta: round(theta / DAYS_PER_YEAR, 5), // Per day
    vega: round(vega * 0.01, 5), // Per 1% change in volatility
    rho: round(rho * 0.01, 5), // Per 1% change in interest rate
    charm: round(charm / DAYS_PER_YEAR, 5), // Per day
    vanna: round(vanna, 5),
    volga: round(volga, 5),
    speed: round(speed, 5),
    zomma: round(zomma, 5),
    color: round(color, 5),
    ultima: round(ultima, 5),
  };
}

/**
 * Calculate all Greeks for a put option
 * @internal
 */
function calculatePutGreeks(
  S: number,
  K: number,
  r: number,
  q: number,
  t: number,
  vol: number,
  d1: number,
  d2: number,
  nd1: number,
  Nd1: number,
  Nd2: number,
  eqt: number,
  ert: number
): Greeks {
  const sqrtT = Math.sqrt(t);

  // Price
  const price = K * ert * cumulativeNormalDistribution(-d2) - S * eqt * cumulativeNormalDistribution(-d1);

  // First-order Greeks
  const delta = -eqt * cumulativeNormalDistribution(-d1);
  const gamma = (eqt * nd1) / (S * vol * sqrtT); // Same as call
  const theta = -(S * vol * eqt * nd1) / (2 * sqrtT) + r * K * ert * cumulativeNormalDistribution(-d2) - q * S * eqt * cumulativeNormalDistribution(-d1);
  const vega = S * eqt * sqrtT * nd1; // Same as call
  const rho = -K * t * ert * cumulativeNormalDistribution(-d2);

  // Second-order Greeks (same as call for gamma, vega, vanna)
  const vanna = -eqt * nd1 * (d2 / vol); // Same as call
  const charm = -q * eqt * cumulativeNormalDistribution(-d1) - (eqt * nd1 * (2 * (r - q) * t - d2 * vol * sqrtT)) / (2 * t * vol * sqrtT);
  const volga = vega * ((d1 * d2) / (S * vol)); // Same as call
  const speed = (nd1 * d1 * d1) / vol;
  const zomma = ((1 + d1 * d2) * nd1) / (vol * vol * sqrtT);

  // Third-order Greeks
  const color = ((1 - d1 * d2) * nd1) / S;
  const ultima = (t * S * nd1 * d1 * d1) / vol;

  return {
    price: round(price, 2),
    delta: round(delta, 5),
    gamma: round(gamma, 5),
    theta: round(theta / DAYS_PER_YEAR, 5), // Per day
    vega: round(vega * 0.01, 5), // Per 1% change in volatility
    rho: round(rho * 0.01, 5), // Per 1% change in interest rate
    charm: round(charm / DAYS_PER_YEAR, 5), // Per day
    vanna: round(vanna, 5),
    volga: round(volga, 5),
    speed: round(speed, 5),
    zomma: round(zomma, 5),
    color: round(color, 5),
    ultima: round(ultima, 5),
  };
}

/**
 * Calculate implied volatility using bisection method
 * 
 * @param price - Observed option price
 * @param spot - Current spot price
 * @param strike - Strike price
 * @param riskFreeRate - Risk-free interest rate (as decimal)
 * @param dividendYield - Dividend yield (as decimal)
 * @param timeToExpiry - Time to expiration in years
 * @param optionType - 'call' or 'put'
 * @returns Implied volatility as a percentage (e.g., 20.0 for 20%)
 * 
 * @example
 * ```typescript
 * const iv = calculateImpliedVolatility(5.50, 100, 105, 0.05, 0, 0.25, 'call');
 * console.log(`IV: ${iv}%`);
 * ```
 */
export function calculateImpliedVolatility(
  price: number,
  spot: number,
  strike: number,
  riskFreeRate: number,
  dividendYield: number,
  timeToExpiry: number,
  optionType: OptionType
): number {
  // Sanity checks
  if (price <= 0 || spot <= 0 || strike <= 0 || timeToExpiry <= 0) {
    return 0;
  }

  // Calculate intrinsic value
  const intrinsic =
    optionType === 'call'
      ? Math.max(0, spot * Math.exp(-dividendYield * timeToExpiry) - strike * Math.exp(-riskFreeRate * timeToExpiry))
      : Math.max(0, strike * Math.exp(-riskFreeRate * timeToExpiry) - spot * Math.exp(-dividendYield * timeToExpiry));

  // If price is at or below intrinsic value, return minimum IV
  const extrinsic = price - intrinsic;
  if (extrinsic <= 0.01) {
    return 1.0; // 1% IV as floor
  }

  // Bisection search bounds (in decimal form)
  let low = 0.0001;
  let high = 5.0; // 500% volatility
  let mid = 0;

  // Bisection method
  for (let i = 0; i < 100; i++) {
    mid = 0.5 * (low + high);

    const modelPrice = blackScholes({
      spot,
      strike,
      timeToExpiry,
      volatility: mid,
      riskFreeRate,
      dividendYield,
      optionType,
    });

    const diff = modelPrice - price;

    if (Math.abs(diff) < 1e-6) {
      return mid * 100.0; // Return as percentage
    }

    if (diff > 0) {
      // Model price too high → volatility too high
      high = mid;
    } else {
      // Model price too low → volatility too low
      low = mid;
    }
  }

  // Return midpoint as percentage
  return 0.5 * (low + high) * 100.0;
}

/**
 * Get milliseconds until expiration
 * 
 * @param expirationTimestamp - Expiration timestamp in milliseconds
 * @returns Milliseconds until expiration
 */
export function getMillisecondsToExpiration(expirationTimestamp: number): number {
  return expirationTimestamp - Date.now();
}

/**
 * Get time to expiration in years
 * 
 * @param expirationTimestamp - Expiration timestamp in milliseconds
 * @returns Time to expiration in years
 */
export function getTimeToExpirationInYears(expirationTimestamp: number): number {
  const milliseconds = getMillisecondsToExpiration(expirationTimestamp);
  return milliseconds / MILLISECONDS_PER_YEAR;
}

/**
 * Helper: Round number to specified decimal places
 * @internal
 */
function round(value: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

/**
 * Helper: Create zero Greeks object
 * @internal
 */
function createZeroGreeks(): Greeks {
  return {
    price: 0,
    delta: 0,
    gamma: 0,
    theta: 0,
    vega: 0,
    rho: 0,
    charm: 0,
    vanna: 0,
    volga: 0,
    speed: 0,
    zomma: 0,
    color: 0,
    ultima: 0,
  };
}
