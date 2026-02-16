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
 * Normalized ticker data structure (broker-agnostic)
 */
export interface NormalizedTicker {
  /** Underlying symbol */
  symbol: string;
  /** Current spot price of the underlying (mid of bid/ask, or last trade) */
  spot: number;
  /** Current bid price */
  bid: number;
  /** Current bid size */
  bidSize: number;
  /** Current ask price */
  ask: number;
  /** Current ask size */
  askSize: number;
  /** Last traded price */
  last: number;
  /** Cumulative volume for the day */
  volume: number;
  /** Timestamp of the quote in milliseconds */
  timestamp: number;
}

/**
 * Normalized option data structure (broker-agnostic)
 */
export interface NormalizedOption {
  /** OCC-formatted option symbol (e.g., 'AAPL  230120C00150000') */
  occSymbol: string;
  /** Underlying ticker symbol */
  underlying: string;
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
  /** Current bid size */
  bidSize: number;
  /** Current ask price */
  ask: number;
  /** Current ask size */
  askSize: number;
  /** Mark (mid) price */
  mark: number;
  /** Last traded price */
  last: number;
  /** Trading volume */
  volume: number;
  /** Open interest */
  openInterest: number;
  /** Live open interest - calculated intraday by comparing using open interest as t=0 and comparing trades to the current NBBO for that option */
  liveOpenInterest?: number;
  /** Implied volatility (as decimal) */
  impliedVolatility: number;
  /** Timestamp of the quote in milliseconds */
  timestamp: number;
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
 * Input options for exposure calculations.
 */
export interface ExposureCalculationOptions {
  /**
   * Reference timestamp in milliseconds.
   * If omitted, Date.now() is used.
   */
  asOfTimestamp?: number;
}

/**
 * Exposure vector used by variant outputs.
 */
export interface ExposureVector {
  gammaExposure: number;
  vannaExposure: number;
  charmExposure: number;
  netExposure: number;
}

/**
 * Per-strike exposure variants (canonical, state-weighted, and flow delta).
 */
export interface StrikeExposureVariants {
  strikePrice: number;
  canonical: ExposureVector;
  stateWeighted: ExposureVector;
  flowDelta: ExposureVector;
}

/**
 * Full exposure breakdown for one mode.
 */
export interface ExposureModeBreakdown {
  totalGammaExposure: number;
  totalVannaExposure: number;
  totalCharmExposure: number;
  totalNetExposure: number;
  strikeOfMaxGamma: number;
  strikeOfMinGamma: number;
  strikeOfMaxVanna: number;
  strikeOfMinVanna: number;
  strikeOfMaxCharm: number;
  strikeOfMinCharm: number;
  strikeOfMaxNet: number;
  strikeOfMinNet: number;
  strikeExposures: StrikeExposure[];
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
 * Exposure variants per expiration.
 * canonical: classic per-1% / per-vol-point / per-day definitions
 * stateWeighted: level-weighted vanna/charm (gamma remains canonical)
 * flowDelta: exposure deltas from intraday OI changes (liveOpenInterest - openInterest)
 */
export interface ExposureVariantsPerExpiry {
  /** Current spot price */
  spotPrice: number;
  /** Expiration timestamp in milliseconds */
  expiration: number;
  /** Canonical exposure mode */
  canonical: ExposureModeBreakdown;
  /** State-weighted exposure mode */
  stateWeighted: ExposureModeBreakdown;
  /** Flow-delta exposure mode */
  flowDelta: ExposureModeBreakdown;
  /** Per-strike variants */
  strikeExposureVariants: StrikeExposureVariants[];
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
