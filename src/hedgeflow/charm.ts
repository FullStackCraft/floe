import { ExposurePerExpiry } from '../types';
import { CharmIntegralConfig, CharmIntegral, CharmBucket } from './types';

/**
 * Compute the charm integral from now until expiration.
 * 
 * The charm integral represents the cumulative expected delta change
 * from time decay alone — i.e., what happens to dealer hedging
 * regardless of price movement. This is the "unconditional" pressure.
 * 
 * The dollar CEX values already incorporate Black-Scholes time decay
 * acceleration (charm ∝ 1/√T near expiry), so no additional time
 * weighting is needed. Larger CEX values near expiry are the math
 * doing its job, not something we need to amplify.
 * 
 * When open interest changes intraday (detected via live OI tracking),
 * this function should be recomputed with updated exposures to reflect
 * the new charm landscape.
 * 
 * @param exposures - Current per-strike exposure data (with live OI if available)
 * @param config - Optional time step configuration
 * @returns Charm integral analysis with cumulative curve and per-strike breakdown
 */
export function computeCharmIntegral(
  exposures: ExposurePerExpiry,
  config: CharmIntegralConfig = {},
): CharmIntegral {
  const { timeStepMinutes = 15 } = config;

  const spot = exposures.spotPrice;
  const expiration = exposures.expiration;
  const now = Date.now();
  const msRemaining = expiration - now;
  const minutesRemaining = Math.max(0, msRemaining / 60000);

  // Per-strike charm breakdown
  const totalAbsCharm = exposures.strikeExposures.reduce(
    (sum, s) => sum + Math.abs(s.charmExposure),
    0,
  );

  const strikeContributions = exposures.strikeExposures
    .filter(s => s.charmExposure !== 0)
    .map(s => ({
      strike: s.strikePrice,
      charmExposure: s.charmExposure,
      fractionOfTotal: totalAbsCharm > 0
        ? Math.abs(s.charmExposure) / totalAbsCharm
        : 0,
    }))
    .sort((a, b) => Math.abs(b.charmExposure) - Math.abs(a.charmExposure));

  // Build time-bucketed charm curve
  // The total CEX is already a per-day rate. For sub-day intervals,
  // we scale by the fraction of the day each bucket represents.
  const totalCEX = exposures.totalCharmExposure;

  const buckets: CharmBucket[] = [];
  let cumulativeCEX = 0;

  if (minutesRemaining <= 0) {
    // Already expired
    return {
      spot,
      expiration,
      computedAt: now,
      minutesRemaining: 0,
      totalCharmToClose: 0,
      direction: 'neutral',
      buckets: [],
      strikeContributions,
    };
  }

  // Walk from now backward toward expiry in timeStepMinutes increments.
  // At each step, the charm exposure intensifies because the remaining
  // options are closer to expiry.
  //
  // Since CEX is already the dollar exposure rate that incorporates the
  // current time to expiry, and charm accelerates as 1/√T, we model
  // the instantaneous charm at t minutes remaining as:
  //
  //   CEX(t) ≈ totalCEX * √(minutesRemaining / t)
  //
  // This scaling comes from charm ∝ 1/√T: if current charm is computed
  // at T minutes out, then at t < T minutes it will be larger by √(T/t).
  //
  // The integral of CEX(t) dt from t=minutesRemaining down to t=0
  // gives the total expected delta change, but note the integral of
  // 1/√t diverges — in practice, charm exposure is bounded because
  // deep ITM/OTM options have vanishing charm. We cap at t=1 minute.

  for (
    let t = minutesRemaining;
    t >= Math.max(1, timeStepMinutes);
    t -= timeStepMinutes
  ) {
    // Charm at this time: scale by √(minutesRemaining / t)
    const timeScaling = Math.sqrt(minutesRemaining / t);
    const instantCEX = totalCEX * timeScaling;

    // Each bucket represents timeStepMinutes of elapsed time.
    // Convert to fraction of a trading day for the integral.
    // 6.5 hours = 390 minutes in a standard session.
    const bucketFractionOfDay = timeStepMinutes / 390;
    const bucketContribution = instantCEX * bucketFractionOfDay;

    cumulativeCEX += bucketContribution;

    buckets.push({
      minutesRemaining: t,
      instantaneousCEX: instantCEX,
      cumulativeCEX,
    });
  }

  // Determine direction
  let direction: 'buying' | 'selling' | 'neutral' = 'neutral';
  if (cumulativeCEX > 0) {
    direction = 'buying';
  } else if (cumulativeCEX < 0) {
    direction = 'selling';
  }

  return {
    spot,
    expiration,
    computedAt: now,
    minutesRemaining,
    totalCharmToClose: cumulativeCEX,
    direction,
    buckets,
    strikeContributions,
  };
}
