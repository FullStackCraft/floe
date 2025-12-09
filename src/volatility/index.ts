import { OptionChain, IVSurface, VolatilityModel, SmoothingModel, MILLISECONDS_PER_YEAR } from '../types';
import { calculateImpliedVolatility, getTimeToExpirationInYears } from '../blackscholes';
import { smoothTotalVarianceSmile } from './smoothing';

/**
 * Build IV surfaces for all expirations in an option chain
 * 
 * @param volatilityModel - Method to calculate IV
 *   - 'blackscholes': Use Black-Scholes IV inversion (implemented) ✅
 *   - 'svm': TODO - Support Vector Machine based IV estimation
 *   - 'garch': TODO - GARCH model for volatility forecasting
 * @param smoothingModel - Smoothing method to apply
 *   - 'totalvariance': Cubic spline + convex hull (implemented) ✅
 *   - 'none': No smoothing, use raw IVs ✅
 *   - TODO: Future - 'svi', 'ssvi', 'sabr' parametric models
 * @param chain - Option chain with market context (spot, rates, options)
 * @returns Array of IV surfaces (one per expiration per option type)
 * 
 * @example
 * ```typescript
 * const surfaces = getIVSurfaces('blackscholes', 'totalvariance', chain);
 * ```
 */
export function getIVSurfaces(
  volatilityModel: VolatilityModel,
  smoothingModel: SmoothingModel,
  chain: OptionChain,
): IVSurface[] {
  const { spot, riskFreeRate, dividendYield, options } = chain;
  const ivSurfaces: IVSurface[] = [];

  // Get all unique expirations from options
  const expirationsSet = new Set<number>();
  for (const option of options) {
    expirationsSet.add(option.expirationTimestamp);
  }
  const expirations = Array.from(expirationsSet).sort((a, b) => a - b);

  // Loop through all expirations
  for (const expiration of expirations) {
    // Separate CALL and PUT surfaces for this expiration
    const callStrikes: number[] = [];
    const callIVs: number[] = [];
    const putStrikes: number[] = [];
    const putIVs: number[] = [];

    // Loop through options to find those that match the expiration
    for (const option of options) {
      if (option.expirationTimestamp !== expiration) {
        continue;
      }

      // Compute IV using selected model
      if (volatilityModel === 'blackscholes') {
        const timeToExpirationInYears = getTimeToExpirationInYears(option.expirationTimestamp);
        const isCall = option.optionType === 'call';
        
        // Rates are already decimals in OptionChain
        const iv = calculateImpliedVolatility(
          option.mark,
          spot,
          option.strike,
          riskFreeRate,
          dividendYield,
          timeToExpirationInYears,
          option.optionType
        );

        if (isCall) {
          callStrikes.push(option.strike);
          callIVs.push(iv);
        } else {
          putStrikes.push(option.strike);
          putIVs.push(iv);
        }
      }
      // TODO: Implement 'svm' model
      // else if (volatilityModel === 'svm') {
      //   // Support Vector Machine based IV estimation
      //   // Could use historical data patterns to predict IV
      // }
      // TODO: Implement 'garch' model
      // else if (volatilityModel === 'garch') {
      //   // GARCH model for volatility forecasting
      //   // Time series approach for IV prediction
      // }
    }

    // Helper to sort and append surface
    const appendSurface = (strikes: number[], ivs: number[], optionType: 'call' | 'put') => {
      if (strikes.length === 0) {
        return;
      }

      // Sort by strike
      const pairs = strikes.map((strike, i) => ({ strike, iv: ivs[i] }));
      pairs.sort((a, b) => a.strike - b.strike);

      const sortedStrikes = pairs.map((p) => p.strike);
      const rawIVs = pairs.map((p) => p.iv);

      // Default: no smoothing, smoothedIVs = copy of rawIVs
      let smoothedIVs = [...rawIVs];

      // Only smooth if we have enough valid data points (IV > 1.5% floor)
      // Filter out floor values before smoothing to avoid contamination
      if (smoothingModel === 'totalvariance' && expiration > Date.now()) {
        const IV_FLOOR = 1.5; // IVs at or below this are considered unreliable (deep ITM/OTM)

        // Find the range of valid IVs
        const validData: Array<{ strike: number; iv: number; index: number }> = [];

        for (let i = 0; i < rawIVs.length; i++) {
          if (rawIVs[i] > IV_FLOOR) {
            validData.push({
              strike: sortedStrikes[i],
              iv: rawIVs[i],
              index: i,
            });
          }
        }

        // Only smooth if we have at least 5 valid points
        if (validData.length >= 5) {
          const validStrikes = validData.map((d) => d.strike);
          const validIVs = validData.map((d) => d.iv);
          const T = (expiration - Date.now()) / MILLISECONDS_PER_YEAR;

          const smoothedValidIVs = smoothTotalVarianceSmile(validStrikes, validIVs, T);

          // Copy smoothed values back to corresponding indices
          smoothedIVs = [...rawIVs]; // Start with raw IVs
          for (let j = 0; j < validData.length; j++) {
            smoothedIVs[validData[j].index] = smoothedValidIVs[j];
          }
        }
      }
      // TODO: Future smoothing models
      // else if (smoothingModel === 'svi') {
      //   // Stochastic Volatility Inspired parametric model
      // }
      // else if (smoothingModel === 'ssvi') {
      //   // Surface SVI for multiple expirations
      // }

      const ivSurface: IVSurface = {
        expirationDate: expiration,
        putCall: optionType,
        strikes: sortedStrikes,
        rawIVs,
        smoothedIVs,
      };

      ivSurfaces.push(ivSurface);
    };

    // Append call and put surfaces if present
    appendSurface(callStrikes, callIVs, 'call');
    appendSurface(putStrikes, putIVs, 'put');
  }

  return ivSurfaces;
}

/**
 * Helper function to get the smoothed IV for a specific expiration, option type, and strike combination
 * 
 * @param ivSurfaces - Array of IV surfaces
 * @param expiration - Expiration timestamp in milliseconds
 * @param optionType - 'call' or 'put'
 * @param strike - Strike price
 * @returns Smoothed IV as a percentage, or 0 if not found
 * 
 * @example
 * ```typescript
 * const iv = getIVForStrike(surfaces, 1234567890000, 'call', 105);
 * console.log(`IV: ${iv}%`);
 * ```
 */
export function getIVForStrike(
  ivSurfaces: IVSurface[],
  expiration: number,
  optionType: 'call' | 'put',
  strike: number
): number {
  for (const ivSurface of ivSurfaces) {
    if (ivSurface.expirationDate === expiration && ivSurface.putCall === optionType) {
      // Find the strike in the strikes array
      for (let i = 0; i < ivSurface.strikes.length; i++) {
        if (ivSurface.strikes[i] === strike) {
          return ivSurface.smoothedIVs[i];
        }
      }
    }
  }
  return 0.0;
}
