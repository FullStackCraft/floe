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
