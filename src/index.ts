/**
 * @fullstackcraftllc/floe - Options Analytics Library
 * 
 * A comprehensive TypeScript library for options pricing, Greeks calculation,
 * and dealer exposure analysis across multiple brokers.
 */

// Core types
export * from './types';

// Black-Scholes pricing and Greeks
export {
  blackScholes,
  calculateGreeks,
  calculateImpliedVolatility,
  getMillisecondsToExpiration,
  getTimeToExpirationInYears,
} from './blackscholes';

// Volatility surface construction
export {
  getIVSurfaces,
  getIVForStrike,
} from './volatility';

// Smoothing algorithms
export {
  smoothTotalVarianceSmile,
} from './volatility/smoothing';

// Exposure calculations
export {
  calculateGammaVannaCharmExposures,
  calculateSharesNeededToCover,
} from './exposure';

// Statistical utilities
export {
  cumulativeNormalDistribution,
  normalPDF,
} from './utils/statistics';

// OCC symbol utilities
export {
  buildOCCSymbol,
  parseOCCSymbol,
  generateStrikesAroundSpot,
  generateOCCSymbolsForStrikes,
  generateOCCSymbolsAroundSpot,
} from './utils/occ';
export type {
  OCCSymbolParams,
  ParsedOCCSymbol,
  StrikeGenerationParams,
} from './utils/occ';

// Implied PDF (probability density function)
export {
  estimateImpliedProbabilityDistribution,
  estimateImpliedProbabilityDistributions,
  getProbabilityInRange,
  getCumulativeProbability,
  getQuantile,
  // Exposure-adjusted PDF
  estimateExposureAdjustedPDF,
  getEdgeAtPrice,
  getSignificantAdjustmentLevels,
  DEFAULT_ADJUSTMENT_CONFIG,
  LOW_VOL_CONFIG,
  CRISIS_CONFIG,
  OPEX_CONFIG,
} from './impliedpdf';
export type {
  StrikeProbability,
  ImpliedProbabilityDistribution,
  ImpliedPDFResult,
  // Exposure-adjusted PDF types
  ExposureAdjustmentConfig,
  AdjustedPDFResult,
  PDFComparison,
} from './impliedpdf';

// Hedge flow analysis (impulse curve, charm integral, regime derivation)
export {
  // Regime derivation from IV surface
  deriveRegimeParams,
  interpolateIVAtStrike,
  // Hedge impulse curve
  computeHedgeImpulseCurve,
  // Charm integral
  computeCharmIntegral,
  // Combined analysis
  analyzeHedgeFlow,
} from './hedgeflow';
export type {
  // Regime types
  MarketRegime,
  RegimeParams,
  // Hedge impulse types
  HedgeImpulseConfig,
  HedgeImpulsePoint,
  HedgeImpulseCurve,
  ZeroCrossing,
  ImpulseExtremum,
  DirectionalAsymmetry,
  ImpulseRegime,
  // Charm integral types
  CharmIntegralConfig,
  CharmBucket,
  CharmIntegral,
  // Combined analysis
  HedgeFlowAnalysis,
} from './hedgeflow';

// Client
export { FloeClient, Broker } from './client/FloeClient';
export { TradierClient } from './client/brokers/TradierClient';
export { TastyTradeClient } from './client/brokers/TastyTradeClient';
export { TradeStationClient } from './client/brokers/TradeStationClient';
export type { AggressorSide, IntradayTrade } from './client/brokers/TradierClient';

// Broker adapters
export {
  genericAdapter,
  schwabAdapter,
  ibkrAdapter,
  tdaAdapter,
  brokerAdapters,
  getAdapter,
  createOptionChain,
} from './adapters';

// Model-free implied volatility (variance swap / VIX methodology)
export {
  computeVarianceSwapIV,
  computeImpliedVolatility,
} from './iv';
export type {
  VarianceSwapResult,
  ImpliedVolatilityResult,
} from './iv';

// Realized volatility (tick-based quadratic variation)
export {
  computeRealizedVolatility,
} from './rv';
export type {
  PriceObservation,
  RealizedVolatilityResult,
} from './rv';
