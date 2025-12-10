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
} from './impliedpdf';
export type {
  StrikeProbability,
  ImpliedProbabilityDistribution,
  ImpliedPDFResult,
} from './impliedpdf';

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

