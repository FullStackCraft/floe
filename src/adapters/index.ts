import { RawOptionData, NormalizedOption, OptionChain, BrokerAdapter } from '../types';
import { buildOCCSymbol } from '../utils/occ';

/**
 * Helper to build OCC symbol from raw data
 */
function buildOCCFromRaw(underlying: string, expiration: string | Date, optionType: 'call' | 'put', strike: number): string {
  try {
    return buildOCCSymbol({ symbol: underlying, expiration, optionType, strike });
  } catch {
    return '';
  }
}

/**
 * Generic adapter that maps common field names
 * This is a fallback adapter when broker-specific adapters are not available
 */
export const genericAdapter: BrokerAdapter = (data: RawOptionData): NormalizedOption => {
  const underlying = String(data.underlying || data.symbol || data.underlyingSymbol || '');
  const expiration = data.expiration || data.expirationDate || '';
  const optionType = (data.optionType || data.putCall || '').toLowerCase() === 'call' ? 'call' as const : 'put' as const;
  const strike = Number(data.strike || data.strikePrice || 0);
  
  return {
    occSymbol: data.occSymbol || data.symbol || buildOCCFromRaw(underlying, expiration, optionType, strike),
    underlying,
    strike,
    expiration,
    expirationTimestamp: data.expirationTimestamp || new Date(expiration).getTime(),
    optionType,
    bid: Number(data.bid || 0),
    bidSize: Number(data.bidSize || data.bidQty || 0),
    ask: Number(data.ask || 0),
    askSize: Number(data.askSize || data.askQty || 0),
    mark: Number(data.mark || (data.bid + data.ask) / 2 || 0),
    last: Number(data.last || data.lastPrice || 0),
    volume: Number(data.volume || 0),
    openInterest: Number(data.openInterest || 0),
    impliedVolatility: Number(data.impliedVolatility || data.iv || 0),
    timestamp: Number(data.timestamp || Date.now()),
  };
};

/**
 * Schwab-specific adapter for Schwab API responses
 */
export const schwabAdapter: BrokerAdapter = (data: RawOptionData): NormalizedOption => {
  const underlying = String(data.underlying || data.underlyingSymbol || '');
  const expiration = data.expirationDate || '';
  const optionType = (data.putCall || '').toLowerCase() === 'call' ? 'call' as const : 'put' as const;
  const strike = Number(data.strikePrice || 0);
  
  return {
    occSymbol: data.symbol || buildOCCFromRaw(underlying, expiration, optionType, strike),
    underlying,
    strike,
    expiration,
    expirationTimestamp: new Date(expiration).getTime(),
    optionType,
    bid: Number(data.bid || 0),
    bidSize: Number(data.bidSize || 0),
    ask: Number(data.ask || 0),
    askSize: Number(data.askSize || 0),
    mark: Number(data.mark || 0),
    last: Number(data.last || 0),
    volume: Number(data.totalVolume || 0),
    openInterest: Number(data.openInterest || 0),
    impliedVolatility: Number(data.volatility || 0),
    timestamp: Number(data.quoteTime || Date.now()),
  };
};

/**
 * Interactive Brokers adapter
 */
export const ibkrAdapter: BrokerAdapter = (data: RawOptionData): NormalizedOption => {
  const underlying = String(data.underlying || data.symbol || '');
  const expiration = data.lastTradeDateOrContractMonth || '';
  const optionType = (data.right || '').toLowerCase() === 'c' ? 'call' as const : 'put' as const;
  const strike = Number(data.strike || 0);
  
  return {
    occSymbol: data.localSymbol || buildOCCFromRaw(underlying, expiration, optionType, strike),
    underlying,
    strike,
    expiration,
    expirationTimestamp: new Date(expiration).getTime(),
    optionType,
    bid: Number(data.bid || 0),
    bidSize: Number(data.bidSize || 0),
    ask: Number(data.ask || 0),
    askSize: Number(data.askSize || 0),
    mark: Number(data.mark || (data.bid + data.ask) / 2 || 0),
    last: Number(data.lastTradedPrice || 0),
    volume: Number(data.volume || 0),
    openInterest: Number(data.openInterest || 0),
    impliedVolatility: Number(data.impliedVolatility || 0),
    timestamp: Number(data.time || Date.now()),
  };
};

/**
 * TD Ameritrade / Schwab TDA API adapter
 */
export const tdaAdapter: BrokerAdapter = (data: RawOptionData): NormalizedOption => {
  const underlying = String(data.underlying || data.underlyingSymbol || '');
  const expiration = data.expirationDate || '';
  const optionType = (data.putCall || '').toLowerCase() === 'call' ? 'call' as const : 'put' as const;
  const strike = Number(data.strikePrice || 0);
  
  return {
    occSymbol: data.symbol || buildOCCFromRaw(underlying, expiration, optionType, strike),
    underlying,
    strike,
    expiration,
    expirationTimestamp: expiration ? new Date(expiration).getTime() : 0,
    optionType,
    bid: Number(data.bid || 0),
    bidSize: Number(data.bidSize || 0),
    ask: Number(data.ask || 0),
    askSize: Number(data.askSize || 0),
    mark: Number(data.mark || 0),
    last: Number(data.last || 0),
    volume: Number(data.totalVolume || 0),
    openInterest: Number(data.openInterest || 0),
    impliedVolatility: Number(data.volatility || 0),
    timestamp: Number(data.quoteTimeInLong || Date.now()),
  };
};

/**
 * Map of broker names to their adapters
 */
export const brokerAdapters: Record<string, BrokerAdapter> = {
  generic: genericAdapter,
  schwab: schwabAdapter,
  ibkr: ibkrAdapter,
  tda: tdaAdapter,
};

/**
 * Get adapter for a specific broker
 * @param brokerName - Name of the broker
 * @returns Broker adapter function
 */
export function getAdapter(brokerName: string): BrokerAdapter {
  return brokerAdapters[brokerName.toLowerCase()] || genericAdapter;
}

/**
 * Create an option chain from raw broker data
 * 
 * @param symbol - Underlying symbol (e.g., 'SPY')
 * @param spot - Current spot price of the underlying
 * @param riskFreeRate - Risk-free interest rate (as decimal, e.g., 0.05 for 5%)
 * @param dividendYield - Dividend yield (as decimal, e.g., 0.02 for 2%)
 * @param rawOptions - Array of raw option data from broker
 * @param broker - Broker name for adapter selection (default: 'generic')
 * @returns Complete option chain with market context
 * 
 * @example
 * ```typescript
 * const chain = createOptionChain(
 *   'SPY',
 *   450.50,
 *   0.05,
 *   0.02,
 *   rawOptionsFromBroker,
 *   'schwab'
 * );
 * ```
 */
export function createOptionChain(
  symbol: string,
  spot: number,
  riskFreeRate: number,
  dividendYield: number,
  rawOptions: RawOptionData[],
  broker: string = 'generic'
): OptionChain {
  const adapter = getAdapter(broker);
  return {
    symbol,
    spot,
    riskFreeRate,
    dividendYield,
    options: rawOptions.map(adapter),
  };
}
