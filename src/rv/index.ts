import { MILLISECONDS_PER_YEAR } from '../types';
import { PriceObservation, RealizedVolatilityResult } from './types';

export type { PriceObservation, RealizedVolatilityResult } from './types';

/**
 * Compute annualized realized volatility from price observations.
 *
 * Uses the standard quadratic variation estimator:
 *
 *   QV = Σᵢ (ln(Pᵢ / Pᵢ₋₁))²
 *
 * Annualized as:
 *
 *   σ_realized = √(QV × (N_year / elapsed_time))
 *
 * This function is stateless and tick-based: pass all observed prices
 * and it computes from the full set. No windowing, no sampling — the
 * consumer decides what observations to include. As the session
 * progresses and more ticks arrive, the estimate naturally converges.
 *
 * Observations are sorted by timestamp internally, so order does not
 * matter. Duplicate timestamps are preserved (both contribute).
 * Zero or negative prices are filtered out.
 *
 * @param observations - Array of { price, timestamp } observations
 * @returns Realized volatility result with annualized RV
 */
export function computeRealizedVolatility(
  observations: PriceObservation[],
): RealizedVolatilityResult {
  // Filter invalid observations and sort by timestamp
  const valid = observations
    .filter(o => o.price > 0 && isFinite(o.price) && isFinite(o.timestamp))
    .sort((a, b) => a.timestamp - b.timestamp);

  if (valid.length < 2) {
    return emptyResult(valid);
  }

  // Compute sum of squared log returns
  let quadraticVariation = 0;
  let numReturns = 0;

  for (let i = 1; i < valid.length; i++) {
    const logReturn = Math.log(valid[i].price / valid[i - 1].price);
    quadraticVariation += logReturn * logReturn;
    numReturns++;
  }

  // Elapsed time
  const firstTs = valid[0].timestamp;
  const lastTs = valid[valid.length - 1].timestamp;
  const elapsedMs = lastTs - firstTs;
  const elapsedMinutes = elapsedMs / 60000;
  const elapsedYears = elapsedMs / MILLISECONDS_PER_YEAR;

  // Guard against zero elapsed time
  if (elapsedYears <= 0) {
    return emptyResult(valid);
  }

  // Annualize: σ² = QV × (year / elapsed)
  const annualizedVariance = quadraticVariation / elapsedYears;
  const realizedVolatility = Math.sqrt(annualizedVariance);

  return {
    realizedVolatility,
    annualizedVariance,
    quadraticVariation,
    numObservations: valid.length,
    numReturns,
    elapsedMinutes,
    elapsedYears,
    firstObservation: firstTs,
    lastObservation: lastTs,
  };
}

function emptyResult(valid: PriceObservation[]): RealizedVolatilityResult {
  return {
    realizedVolatility: 0,
    annualizedVariance: 0,
    quadraticVariation: 0,
    numObservations: valid.length,
    numReturns: 0,
    elapsedMinutes: 0,
    elapsedYears: 0,
    firstObservation: valid.length > 0 ? valid[0].timestamp : 0,
    lastObservation: valid.length > 0 ? valid[valid.length - 1].timestamp : 0,
  };
}
