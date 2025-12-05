/**
 * Core types for options analytics
 */

/**
 * Option type (call or put)
 */
export type OptionType = 'call' | 'put';

/**
 * Volatility calculation method
 */
export type VolatilityModel = 'blackscholes' | 'svm' | 'garch';

/**
 * Smoothing method for IV surface
 */
export type SmoothingModel = 'totalvariance' | 'none';

/**
 * Parameters for Black-Scholes calculation
 */
export interface BlackScholesParams {
  /** Current price of the underlying asset */
  spot: number;
  /** Strike price of the option */
  strike: number;
  /** Time to expiration in years */
  timeToExpiry: number;
  /** Implied volatility (annualized, as decimal e.g., 0.20 for 20%) */
  volatility: number;
  /** Risk-free interest rate (annualized, as decimal) */
  riskFreeRate: number;
  /** Option type */
  optionType: OptionType;
  /** Dividend yield (annualized, as decimal) */
  dividendYield?: number;
}

/**
 * Complete set of option Greeks and higher-order Greeks
 */
export interface Greeks {
  /** Price: Option theoretical value */
  price: number;
  /** Delta: Rate of change of option price with respect to underlying price */
  delta: number;
  /** Gamma: Rate of change of delta with respect to underlying price */
  gamma: number;
  /** Theta: Rate of change of option price with respect to time (per day) */
  theta: number;
  /** Vega: Rate of change of option price with respect to volatility (per 1% change) */
  vega: number;
  /** Rho: Rate of change of option price with respect to interest rate (per 1% change) */
  rho: number;
  /** Charm: Rate of change of delta with respect to time (per day) */
  charm: number;
  /** Vanna: Rate of change of delta with respect to volatility */
  vanna: number;
  /** Volga (Vomma): Rate of change of vega with respect to volatility */
  volga: number;
  /** Speed: Rate of change of gamma with respect to underlying price */
  speed: number;
  /** Zomma: Rate of change of gamma with respect to volatility */
  zomma: number;
  /** Color: Rate of change of gamma with respect to time */
  color: number;
  /** Ultima: Rate of change of volga with respect to volatility */
  ultima: number;
}

/**
 * Normalized option data structure (broker-agnostic)
 */
export interface NormalizedOption {
  /** Strike price */
  strike: number;
  /** Expiration date (ISO 8601) */
  expiration: string;
  /** Expiration timestamp in milliseconds */
  expirationTimestamp: number;
  /** Option type */
  optionType: OptionType;
  /** Current bid price */
  bid: number;
  /** Current ask price */
  ask: number;
  /** Mark (mid) price */
  mark: number;
  /** Last traded price */
  last: number;
  /** Trading volume */
  volume: number;
  /** Open interest */
  openInterest: number;
  /** Implied volatility (as decimal) */
  impliedVolatility: number;
  /** Pre-calculated Greeks (optional) */
  greeks?: Greeks;
}

/**
 * Complete option chain with market context
 */
export interface OptionChain {
  /** Underlying symbol */
  symbol: string;
  /** Current spot price of the underlying */
  spot: number;
  /** Risk-free interest rate (as decimal, e.g., 0.05 for 5%) */
  riskFreeRate: number;
  /** Dividend yield (as decimal, e.g., 0.02 for 2%) */
  dividendYield: number;
  /** All options in the chain */
  options: NormalizedOption[];
}

/**
 * IV Surface for a single expiration and option type
 */
export interface IVSurface {
  /** Expiration timestamp in milliseconds */
  expirationDate: number;
  /** Option type (CALL or PUT) */
  putCall: OptionType;
  /** Sorted strike prices */
  strikes: number[];
  /** Raw calculated IVs (as percentages) */
  rawIVs: number[];
  /** Smoothed IVs after applying smoothing algorithm (as percentages) */
  smoothedIVs: number[];
}

/**
 * Strike-level exposure metrics
 */
export interface StrikeExposure {
  /** Strike price */
  strikePrice: number;
  /** Gamma exposure at this strike */
  gammaExposure: number;
  /** Vanna exposure at this strike */
  vannaExposure: number;
  /** Charm exposure at this strike */
  charmExposure: number;
  /** Net exposure (gamma + vanna + charm) */
  netExposure: number;
}

/**
 * Exposure metrics per expiration
 */
export interface ExposurePerExpiry {
  /** Current spot price */
  spotPrice: number;
  /** Expiration timestamp in milliseconds */
  expiration: number;
  /** Total gamma exposure for this expiration */
  totalGammaExposure: number;
  /** Total vanna exposure for this expiration */
  totalVannaExposure: number;
  /** Total charm exposure for this expiration */
  totalCharmExposure: number;
  /** Total net exposure (sum of all three) */
  totalNetExposure: number;
  /** Strike with maximum gamma */
  strikeOfMaxGamma: number;
  /** Strike with minimum gamma */
  strikeOfMinGamma: number;
  /** Strike with maximum vanna */
  strikeOfMaxVanna: number;
  /** Strike with minimum vanna */
  strikeOfMinVanna: number;
  /** Strike with maximum charm */
  strikeOfMaxCharm: number;
  /** Strike with minimum charm */
  strikeOfMinCharm: number;
  /** Strike with maximum net exposure */
  strikeOfMaxNet: number;
  /** Strike with minimum net exposure */
  strikeOfMinNet: number;
  /** Per-strike exposures */
  strikeExposures: StrikeExposure[];
}

/**
 * Dealer Gamma Exposure (GEX) metrics
 */
export interface GEXMetrics {
  /** Total gamma exposure by strike */
  byStrike: Map<number, number>;
  /** Net gamma exposure */
  netGamma: number;
  /** Largest positive gamma strike */
  maxPositiveStrike: number;
  /** Largest negative gamma strike */
  maxNegativeStrike: number;
  /** Zero gamma level (flip point) */
  zeroGammaLevel: number | null;
}

/**
 * Dealer Vanna Exposure (VEX) metrics
 */
export interface VannaMetrics {
  /** Total vanna exposure by strike */
  byStrike: Map<number, number>;
  /** Net vanna exposure */
  netVanna: number;
}

/**
 * Dealer Charm Exposure (CEX) metrics
 */
export interface CharmMetrics {
  /** Total charm exposure by strike */
  byStrike: Map<number, number>;
  /** Net charm exposure */
  netCharm: number;
}

/**
 * Broker-specific data types
 */

/**
 * Raw option data from any broker (to be normalized)
 */
export interface RawOptionData {
  [key: string]: any;
}

/**
 * Adapter function type for normalizing broker data
 */
export type BrokerAdapter = (data: RawOptionData) => NormalizedOption;

/**
 * Constants
 */
export const MILLISECONDS_PER_YEAR = 31536000000;
export const MILLISECONDS_PER_DAY = 86400000;
export const MINUTES_PER_YEAR = 525600;
export const MINUTES_PER_DAY = 1440;
export const DAYS_PER_YEAR = 365;
