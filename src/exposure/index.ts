import { 
  OptionChain,
  ExposurePerExpiry, 
  StrikeExposure,
  IVSurface,
  MILLISECONDS_PER_YEAR,
  DAYS_PER_YEAR
} from '../types';
import { calculateGreeks, getTimeToExpirationInYears } from '../blackscholes';
import { getIVForStrike } from '../volatility';

/**
 * Calculate Gamma, Vanna, and Charm exposures for an option chain
 * 
 * @param chain - Option chain with market context (spot, rates, options)
 * @param ivSurfaces - IV surfaces for all expirations
 * @returns Array of exposure metrics per expiration
 * 
 * @example
 * ```typescript
 * const exposures = calculateGammaVannaCharmExposures(chain, ivSurfaces);
 * ```
 */
export function calculateGammaVannaCharmExposures(
  chain: OptionChain,
  ivSurfaces: IVSurface[],
): ExposurePerExpiry[] {
  const { spot, riskFreeRate, dividendYield, options } = chain;
  const exposureRows: ExposurePerExpiry[] = [];

  // Get unique expirations from options
  const expirationsSet = new Set<number>();
  for (const option of options) {
    expirationsSet.add(option.expirationTimestamp);
  }
  const expirations = Array.from(expirationsSet).sort((a, b) => a - b);

  // Loop through all expirations
  for (const expiration of expirations) {
    // Skip any expiration that is in the past
    if (expiration < Date.now()) {
      continue;
    }

    // Reset totals for this expiration
    let totalGammaExposure = 0.0;
    let totalVannaExposure = 0.0;
    let totalCharmExposure = 0.0;
    let strikeOfMaxGamma = 0.0;
    let strikeOfMinGamma = 0.0;
    let strikeOfMaxVanna = 0.0;
    let strikeOfMinVanna = 0.0;
    let strikeOfMaxCharm = 0.0;
    let strikeOfMinCharm = 0.0;
    let strikeOfMaxNet = 0.0;
    let strikeOfMinNet = 0.0;

    const strikeExposures: StrikeExposure[] = [];

    // Process all call options first
    for (const callOption of options) {
      // Check if this option is at the expiration we are looking at
      if (callOption.expirationTimestamp !== expiration || callOption.optionType === 'put') {
        continue;
      }

      // Get the corresponding put option
      const putOption = options.find(
        (opt) =>
          opt.expirationTimestamp === expiration &&
          opt.optionType === 'put' &&
          opt.strike === callOption.strike
      );

      if (!putOption) {
        continue; // Skip if no matching put
      }

      // Get IV for this strike and expiry from the surface
      const callIVAtStrike = getIVForStrike(ivSurfaces, expiration, 'call', callOption.strike);
      const putIVAtStrike = getIVForStrike(ivSurfaces, expiration, 'put', putOption.strike);

      // Get time to expiration in years
      const timeToExpirationInYears = getTimeToExpirationInYears(expiration);

      // Calculate Greeks for both call and put
      // Rates are already decimals in OptionChain, IV from surface is percentage
      const callGreeks = calculateGreeks({
        spot,
        strike: callOption.strike,
        timeToExpiry: timeToExpirationInYears,
        volatility: callIVAtStrike / 100.0, // Convert from percentage to decimal
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

      // Calculate exposures from dealer perspective
      // Dealer is short calls (negative gamma) and long puts (positive gamma)
      // Multiply by 100 for contract size, multiply by spot for dollar exposure
      // Multiply by 0.01 for 1% move sensitivity
      
      // Gamma: second order with respect to price twice
      const gammaExposureForStrike =
        -callOption.openInterest * callGreeks.gamma * (spot * 100.0) * spot * 0.01 +
        putOption.openInterest * putGreeks.gamma * (spot * 100.0) * spot * 0.01;

      // Vanna: second order with respect to price and volatility
      const vannaExposureForStrike =
        -callOption.openInterest * callGreeks.vanna * (spot * 100.0) * callIVAtStrike * 0.01 +
        putOption.openInterest * putGreeks.vanna * (spot * 100.0) * putIVAtStrike * 0.01;

      // Charm: second order with respect to price and time
      // Already normalized per day in calculateGreeks
      const charmExposureForStrike =
        -callOption.openInterest * callGreeks.charm * (spot * 100.0) * DAYS_PER_YEAR * timeToExpirationInYears +
        putOption.openInterest * putGreeks.charm * (spot * 100.0) * DAYS_PER_YEAR * timeToExpirationInYears;

      // NaN checks
      const gammaExposure = isNaN(gammaExposureForStrike) ? 0.0 : gammaExposureForStrike;
      const vannaExposure = isNaN(vannaExposureForStrike) ? 0.0 : vannaExposureForStrike;
      const charmExposure = isNaN(charmExposureForStrike) ? 0.0 : charmExposureForStrike;

      // Add to totals
      totalGammaExposure += gammaExposure;
      totalVannaExposure += vannaExposure;
      totalCharmExposure += charmExposure;

      // Add to strike exposures
      strikeExposures.push({
        strikePrice: callOption.strike,
        gammaExposure,
        vannaExposure,
        charmExposure,
        netExposure: gammaExposure + vannaExposure + charmExposure,
      });
    }

    if (strikeExposures.length === 0) {
      continue; // No options for this expiration
    }

    // Sort by gamma exposure and find extremes
    strikeExposures.sort((a, b) => b.gammaExposure - a.gammaExposure);
    strikeOfMaxGamma = strikeExposures[0].strikePrice;
    strikeOfMinGamma = strikeExposures[strikeExposures.length - 1].strikePrice;

    // Sort by vanna exposure and find extremes
    strikeExposures.sort((a, b) => b.vannaExposure - a.vannaExposure);
    strikeOfMaxVanna = strikeExposures[0].strikePrice;
    strikeOfMinVanna = strikeExposures[strikeExposures.length - 1].strikePrice;

    // Sort by charm exposure and find extremes
    strikeExposures.sort((a, b) => b.charmExposure - a.charmExposure);
    strikeOfMaxCharm = strikeExposures[0].strikePrice;
    strikeOfMinCharm = strikeExposures[strikeExposures.length - 1].strikePrice;

    // Sort by net exposure and find extremes
    strikeExposures.sort((a, b) => b.netExposure - a.netExposure);
    strikeOfMaxNet = strikeExposures[0].strikePrice;
    strikeOfMinNet = strikeExposures[strikeExposures.length - 1].strikePrice;

    const totalNetExposure = totalGammaExposure + totalVannaExposure + totalCharmExposure;

    // Add exposure row
    exposureRows.push({
      spotPrice: spot,
      expiration,
      totalGammaExposure,
      totalVannaExposure,
      totalCharmExposure,
      totalNetExposure,
      strikeOfMaxGamma,
      strikeOfMinGamma,
      strikeOfMaxVanna,
      strikeOfMinVanna,
      strikeOfMaxCharm,
      strikeOfMinCharm,
      strikeOfMaxNet,
      strikeOfMinNet,
      strikeExposures
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
