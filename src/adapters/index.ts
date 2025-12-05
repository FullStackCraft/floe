import { RawOptionData, NormalizedOption, OptionChain, BrokerAdapter } from '../types';

/**
 * Generic adapter that maps common field names
 * This is a fallback adapter when broker-specific adapters are not available
 */
export const genericAdapter: BrokerAdapter = (data: RawOptionData): NormalizedOption => {
  return {
    strike: Number(data.strike || data.strikePrice || 0),
    expiration: data.expiration || data.expirationDate || '',
    expirationTimestamp: data.expirationTimestamp || new Date(data.expiration || data.expirationDate).getTime(),
    optionType: (data.optionType || data.putCall || '').toLowerCase() === 'call' ? 'call' : 'put',
    bid: Number(data.bid || 0),
    ask: Number(data.ask || 0),
    mark: Number(data.mark || (data.bid + data.ask) / 2 || 0),
    last: Number(data.last || data.lastPrice || 0),
    volume: Number(data.volume || 0),
    openInterest: Number(data.openInterest || 0),
    impliedVolatility: Number(data.impliedVolatility || data.iv || 0),
  };
};

/**
 * Schwab-specific adapter for Schwab API responses
 */
export const schwabAdapter: BrokerAdapter = (data: RawOptionData): NormalizedOption => {
  return {
    strike: Number(data.strikePrice || 0),
    expiration: data.expirationDate || '',
    expirationTimestamp: new Date(data.expirationDate).getTime(),
    optionType: (data.putCall || '').toLowerCase() === 'call' ? 'call' : 'put',
    bid: Number(data.bid || 0),
    ask: Number(data.ask || 0),
    mark: Number(data.mark || 0),
    last: Number(data.last || 0),
    volume: Number(data.totalVolume || 0),
    openInterest: Number(data.openInterest || 0),
    impliedVolatility: Number(data.volatility || 0),
  };
};

/**
 * Interactive Brokers adapter
 */
export const ibkrAdapter: BrokerAdapter = (data: RawOptionData): NormalizedOption => {
  return {
    strike: Number(data.strike || 0),
    expiration: data.lastTradeDateOrContractMonth || '',
    expirationTimestamp: new Date(data.lastTradeDateOrContractMonth).getTime(),
    optionType: (data.right || '').toLowerCase() === 'c' ? 'call' : 'put',
    bid: Number(data.bid || 0),
    ask: Number(data.ask || 0),
    mark: Number(data.mark || (data.bid + data.ask) / 2 || 0),
    last: Number(data.lastTradedPrice || 0),
    volume: Number(data.volume || 0),
    openInterest: Number(data.openInterest || 0),
    impliedVolatility: Number(data.impliedVolatility || 0),
  };
};

/**
 * TD Ameritrade / Schwab TDA API adapter
 */
export const tdaAdapter: BrokerAdapter = (data: RawOptionData): NormalizedOption => {
  return {
    strike: Number(data.strikePrice || 0),
    expiration: data.expirationDate || '',
    expirationTimestamp: data.expirationDate ? new Date(data.expirationDate).getTime() : 0,
    optionType: (data.putCall || '').toLowerCase() === 'call' ? 'call' : 'put',
    bid: Number(data.bid || 0),
    ask: Number(data.ask || 0),
    mark: Number(data.mark || 0),
    last: Number(data.last || 0),
    volume: Number(data.totalVolume || 0),
    openInterest: Number(data.openInterest || 0),
    impliedVolatility: Number(data.volatility || 0),
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
