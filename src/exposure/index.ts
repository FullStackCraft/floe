import {
  OptionChain,
  StrikeExposure,
  StrikeExposureVariants,
  ExposureVariantsPerExpiry,
  ExposureCalculationOptions,
  ExposureModeBreakdown,
  ExposureVector,
  IVSurface,
  MILLISECONDS_PER_YEAR,
  DAYS_PER_YEAR,
} from '../types';
import { calculateGreeks } from '../blackscholes';
import { getIVForStrike } from '../volatility';

type ExposureMode = 'canonical' | 'stateWeighted' | 'flowDelta';

/**
 * Calculate canonical, state-weighted, and flow-delta exposure variants.
 *
 * canonical:
 * - GEX: dollars per 1% underlying move
 * - VEX: dollars per 1 vol-point move
 * - CEX: dollars per 1 day of time decay
 *
 * stateWeighted:
 * - Gamma: same as canonical (spot is already the state variable)
 * - Vanna: canonical vanna weighted by strike IV level
 * - Charm: canonical charm weighted by days-to-expiration
 *
 * flowDelta:
 * - Canonical exposure formulas using OI deltas:
 *   (liveOpenInterest - openInterest)
 */
export function calculateGammaVannaCharmExposures(
  chain: OptionChain,
  ivSurfaces: IVSurface[],
  options: ExposureCalculationOptions = {},
): ExposureVariantsPerExpiry[] {
  const { spot, riskFreeRate, dividendYield, options: chainOptions } = chain;
  const asOfTimestamp = options.asOfTimestamp ?? Date.now();
  const exposureRows: ExposureVariantsPerExpiry[] = [];

  const expirationsSet = new Set<number>();
  for (const option of chainOptions) {
    expirationsSet.add(option.expirationTimestamp);
  }
  const expirations = Array.from(expirationsSet).sort((a, b) => a - b);

  const putOptionsByKey = new Map<string, OptionChain['options'][number]>();
  for (const option of chainOptions) {
    if (option.optionType === 'put') {
      putOptionsByKey.set(getOptionKey(option.expirationTimestamp, option.strike), option);
    }
  }

  for (const expiration of expirations) {
    if (expiration < asOfTimestamp) {
      continue;
    }

    const timeToExpirationInYears = (expiration - asOfTimestamp) / MILLISECONDS_PER_YEAR;
    if (timeToExpirationInYears <= 0) {
      continue;
    }

    const timeToExpirationInDays = Math.max(timeToExpirationInYears * DAYS_PER_YEAR, 0);
    const strikeExposureVariants: StrikeExposureVariants[] = [];

    for (const callOption of chainOptions) {
      if (callOption.expirationTimestamp !== expiration || callOption.optionType !== 'call') {
        continue;
      }

      const putOption = putOptionsByKey.get(getOptionKey(expiration, callOption.strike));
      if (!putOption) {
        continue;
      }

      const callIVAtStrike = resolveIVPercent(
        getIVForStrike(ivSurfaces, expiration, 'call', callOption.strike),
        callOption.impliedVolatility
      );
      const putIVAtStrike = resolveIVPercent(
        getIVForStrike(ivSurfaces, expiration, 'put', putOption.strike),
        putOption.impliedVolatility
      );

      const callGreeks = calculateGreeks({
        spot,
        strike: callOption.strike,
        timeToExpiry: timeToExpirationInYears,
        volatility: callIVAtStrike / 100.0,
        riskFreeRate,
        dividendYield,
        optionType: 'call',
      });

      const putGreeks = calculateGreeks({
        spot,
        strike: putOption.strike,
        timeToExpiry: timeToExpirationInYears,
        volatility: putIVAtStrike / 100.0,
        riskFreeRate,
        dividendYield,
        optionType: 'put',
      });

      const callOpenInterest = sanitizeFinite(callOption.openInterest);
      const putOpenInterest = sanitizeFinite(putOption.openInterest);

      const canonical = calculateCanonicalVector(
        spot,
        callOpenInterest,
        putOpenInterest,
        callGreeks.gamma,
        putGreeks.gamma,
        callGreeks.vanna,
        putGreeks.vanna,
        callGreeks.charm,
        putGreeks.charm
      );

      const stateWeighted = calculateStateWeightedVector(
        spot,
        callOpenInterest,
        putOpenInterest,
        callGreeks.vanna,
        putGreeks.vanna,
        callGreeks.charm,
        putGreeks.charm,
        callIVAtStrike,
        putIVAtStrike,
        timeToExpirationInDays,
        canonical.gammaExposure
      );

      const callFlowDelta = resolveFlowDeltaOpenInterest(callOption.openInterest, callOption.liveOpenInterest);
      const putFlowDelta = resolveFlowDeltaOpenInterest(putOption.openInterest, putOption.liveOpenInterest);
      const flowDelta = calculateCanonicalVector(
        spot,
        callFlowDelta,
        putFlowDelta,
        callGreeks.gamma,
        putGreeks.gamma,
        callGreeks.vanna,
        putGreeks.vanna,
        callGreeks.charm,
        putGreeks.charm
      );

      strikeExposureVariants.push({
        strikePrice: callOption.strike,
        canonical,
        stateWeighted,
        flowDelta,
      });
    }

    if (strikeExposureVariants.length === 0) {
      continue;
    }

    const canonical = buildModeBreakdown(strikeExposureVariants, 'canonical');
    const stateWeighted = buildModeBreakdown(strikeExposureVariants, 'stateWeighted');
    const flowDelta = buildModeBreakdown(strikeExposureVariants, 'flowDelta');

    exposureRows.push({
      spotPrice: spot,
      expiration,
      canonical,
      stateWeighted,
      flowDelta,
      strikeExposureVariants,
    });
  }

  return exposureRows;
}

/**
 * Calculate shares needed to cover net exposure
 *
 * @param sharesOutstanding - Total shares outstanding
 * @param totalNetExposure - Total net exposure (gamma + vanna + charm)
 * @param underlyingMark - Current spot price
 * @returns Action to cover, shares to cover, implied move %, and resulting price
 *
 * @example
 * ```typescript
 * const coverage = calculateSharesNeededToCover(1000000000, -5000000, 450.50);
 * console.log(`Action: ${coverage.actionToCover}`);
 * console.log(`Shares: ${coverage.sharesToCover}`);
 * ```
 */
export function calculateSharesNeededToCover(
  sharesOutstanding: number,
  totalNetExposure: number,
  underlyingMark: number
): {
  actionToCover: string;
  sharesToCover: number;
  impliedMoveToCover: number;
  resultingSpotToCover: number;
} {
  let actionToCover = 'BUY';
  if (totalNetExposure > 0) {
    actionToCover = 'SELL';
  }

  // Protect from inf or nan
  if (
    sharesOutstanding === 0 ||
    isNaN(sharesOutstanding) ||
    !isFinite(sharesOutstanding)
  ) {
    return {
      actionToCover: '',
      sharesToCover: 0,
      impliedMoveToCover: 0,
      resultingSpotToCover: underlyingMark,
    };
  }

  // Protect against division by zero for underlyingMark
  if (
    underlyingMark === 0 ||
    isNaN(underlyingMark) ||
    !isFinite(underlyingMark)
  ) {
    return {
      actionToCover: '',
      sharesToCover: 0,
      impliedMoveToCover: 0,
      resultingSpotToCover: underlyingMark,
    };
  }

  // Since this is the action the dealer makes, we negate it to get the implied move
  // i.e. negative exposure means the dealer has to buy to cover, which implies upward pressure
  // likewise positive exposure means the dealer has to sell to cover, which implies downward pressure
  const sharesNeededToCoverFloat = -totalNetExposure / underlyingMark;
  const impliedChange = (sharesNeededToCoverFloat / sharesOutstanding) * 100.0;
  const resultingPrice = underlyingMark * (1 + impliedChange / 100);

  return {
    actionToCover,
    sharesToCover: Math.abs(sharesNeededToCoverFloat),
    impliedMoveToCover: impliedChange,
    resultingSpotToCover: resultingPrice,
  };
}

function getOptionKey(expiration: number, strike: number): string {
  return `${expiration}:${strike}`;
}

function calculateCanonicalVector(
  spot: number,
  callPosition: number,
  putPosition: number,
  callGamma: number,
  putGamma: number,
  callVanna: number,
  putVanna: number,
  callCharm: number,
  putCharm: number
): ExposureVector {
  const gammaExposure =
    -callPosition * callGamma * (spot * 100.0) * spot * 0.01 +
    putPosition * putGamma * (spot * 100.0) * spot * 0.01;

  const vannaExposure =
    -callPosition * callVanna * (spot * 100.0) * 0.01 +
    putPosition * putVanna * (spot * 100.0) * 0.01;

  const charmExposure =
    -callPosition * callCharm * (spot * 100.0) +
    putPosition * putCharm * (spot * 100.0);

  return sanitizeVector({
    gammaExposure,
    vannaExposure,
    charmExposure,
    netExposure: gammaExposure + vannaExposure + charmExposure,
  });
}

function calculateStateWeightedVector(
  spot: number,
  callPosition: number,
  putPosition: number,
  callVanna: number,
  putVanna: number,
  callCharm: number,
  putCharm: number,
  callIVPercent: number,
  putIVPercent: number,
  timeToExpirationInDays: number,
  canonicalGammaExposure: number
): ExposureVector {
  const callIVLevel = Math.max(callIVPercent * 0.01, 0);
  const putIVLevel = Math.max(putIVPercent * 0.01, 0);

  // Gamma already uses instantaneous price scaling in canonical GEX.
  const gammaExposure = canonicalGammaExposure;

  const vannaExposure =
    -callPosition * callVanna * (spot * 100.0) * 0.01 * callIVLevel +
    putPosition * putVanna * (spot * 100.0) * 0.01 * putIVLevel;

  const canonicalCharmComponent =
    -callPosition * callCharm * (spot * 100.0) +
    putPosition * putCharm * (spot * 100.0);
  const charmExposure = canonicalCharmComponent * Math.max(timeToExpirationInDays, 0);

  return sanitizeVector({
    gammaExposure,
    vannaExposure,
    charmExposure,
    netExposure: gammaExposure + vannaExposure + charmExposure,
  });
}

function resolveFlowDeltaOpenInterest(openInterest: number, liveOpenInterest?: number): number {
  if (typeof liveOpenInterest !== 'number' || !isFinite(liveOpenInterest)) {
    return 0;
  }
  return sanitizeFinite(liveOpenInterest - openInterest);
}

function resolveIVPercent(ivFromSurface: number, optionImpliedVolatilityDecimal: number): number {
  if (isFinite(ivFromSurface) && ivFromSurface > 0) {
    return ivFromSurface;
  }

  const fallback = optionImpliedVolatilityDecimal * 100.0;
  if (isFinite(fallback) && fallback > 0) {
    return fallback;
  }

  return 0;
}

function buildModeBreakdown(
  strikeExposureVariants: StrikeExposureVariants[],
  mode: ExposureMode
): ExposureModeBreakdown {
  const strikeExposures: StrikeExposure[] = strikeExposureVariants.map((strike) => ({
    strikePrice: strike.strikePrice,
    ...strike[mode],
  }));

  if (strikeExposures.length === 0) {
    return {
      totalGammaExposure: 0,
      totalVannaExposure: 0,
      totalCharmExposure: 0,
      totalNetExposure: 0,
      strikeOfMaxGamma: 0,
      strikeOfMinGamma: 0,
      strikeOfMaxVanna: 0,
      strikeOfMinVanna: 0,
      strikeOfMaxCharm: 0,
      strikeOfMinCharm: 0,
      strikeOfMaxNet: 0,
      strikeOfMinNet: 0,
      strikeExposures: [],
    };
  }

  const totalGammaExposure = strikeExposures.reduce((sum, s) => sum + s.gammaExposure, 0);
  const totalVannaExposure = strikeExposures.reduce((sum, s) => sum + s.vannaExposure, 0);
  const totalCharmExposure = strikeExposures.reduce((sum, s) => sum + s.charmExposure, 0);
  const totalNetExposure = totalGammaExposure + totalVannaExposure + totalCharmExposure;

  const byGamma = [...strikeExposures].sort((a, b) => b.gammaExposure - a.gammaExposure);
  const byVanna = [...strikeExposures].sort((a, b) => b.vannaExposure - a.vannaExposure);
  const byCharm = [...strikeExposures].sort((a, b) => b.charmExposure - a.charmExposure);
  const byNet = [...strikeExposures].sort((a, b) => b.netExposure - a.netExposure);

  return {
    totalGammaExposure: sanitizeFinite(totalGammaExposure),
    totalVannaExposure: sanitizeFinite(totalVannaExposure),
    totalCharmExposure: sanitizeFinite(totalCharmExposure),
    totalNetExposure: sanitizeFinite(totalNetExposure),
    strikeOfMaxGamma: byGamma[0].strikePrice,
    strikeOfMinGamma: byGamma[byGamma.length - 1].strikePrice,
    strikeOfMaxVanna: byVanna[0].strikePrice,
    strikeOfMinVanna: byVanna[byVanna.length - 1].strikePrice,
    strikeOfMaxCharm: byCharm[0].strikePrice,
    strikeOfMinCharm: byCharm[byCharm.length - 1].strikePrice,
    strikeOfMaxNet: byNet[0].strikePrice,
    strikeOfMinNet: byNet[byNet.length - 1].strikePrice,
    strikeExposures: byNet,
  };
}

function sanitizeVector(vector: ExposureVector): ExposureVector {
  return {
    gammaExposure: sanitizeFinite(vector.gammaExposure),
    vannaExposure: sanitizeFinite(vector.vannaExposure),
    charmExposure: sanitizeFinite(vector.charmExposure),
    netExposure: sanitizeFinite(vector.netExposure),
  };
}

function sanitizeFinite(value: number): number {
  return isFinite(value) && !isNaN(value) ? value : 0;
}
