import { NormalizedOption, NormalizedTicker, OptionType } from '../../types';

// ==================== Shared Types ====================

/**
 * Aggressor side of a trade - determined by comparing trade price to NBBO
 */
export type AggressorSide = 'buy' | 'sell' | 'unknown';

/**
 * Intraday trade information with aggressor classification
 */
export interface IntradayTrade {
  /** OCC option symbol */
  occSymbol: string;
  /** Trade price */
  price: number;
  /** Trade size (number of contracts) */
  size: number;
  /** Bid at time of trade */
  bid: number;
  /** Ask at time of trade */
  ask: number;
  /** Aggressor side determined from price vs NBBO */
  aggressorSide: AggressorSide;
  /** Timestamp of the trade */
  timestamp: number;
  /** Estimated OI change: +size for buy aggressor, -size for sell aggressor */
  estimatedOIChange: number;
}

/**
 * Flow summary statistics for an option
 */
export interface FlowSummary {
  buyVolume: number;
  sellVolume: number;
  unknownVolume: number;
  netOIChange: number;
  tradeCount: number;
}

/**
 * Event types emitted by broker clients
 */
export type BrokerClientEventType = 
  | 'tickerUpdate' 
  | 'optionUpdate' 
  | 'optionTrade' 
  | 'connected' 
  | 'disconnected' 
  | 'error';

/**
 * Event listener callback type
 */
export type BrokerEventListener<T> = (data: T) => void;

/**
 * Regex pattern to identify OCC option symbols (compact format)
 * Format: ROOT + YYMMDD + C/P + 8-digit strike
 * Example: "AAPL240517C00170000"
 */
export const OCC_OPTION_PATTERN = /^[A-Z]{1,6}\d{6}[CP]\d{8}$/;

/**
 * Regex pattern that also matches space-padded OCC symbols
 * Example: "AAPL  240517C00170000"
 */
export const OCC_OPTION_PATTERN_WITH_SPACES = /^.{1,6}\s*\d{6}[CP]\d{8}$/;

// ==================== Base Client Configuration ====================

/**
 * Base configuration options shared by all broker clients
 */
export interface BaseBrokerClientOptions {
  /** Whether to log verbose debug information */
  verbose?: boolean;
  /** Maximum reconnection attempts (default: 5) */
  maxReconnectAttempts?: number;
  /** Base reconnection delay in ms (default: 1000) */
  baseReconnectDelay?: number;
}

/**
 * Abstract base class for all broker streaming clients.
 * 
 * @remarks
 * This class provides shared state management, event handling, and utility methods
 * that are common across all broker implementations. Subclasses implement the
 * broker-specific connection, subscription, and data parsing logic.
 * 
 * All broker clients normalize their data to `NormalizedOption` and `NormalizedTicker`
 * formats, providing a consistent interface regardless of the underlying broker API.
 */
export abstract class BaseBrokerClient {
  // ==================== Shared State ====================

  /** Cached ticker data */
  protected tickerCache: Map<string, NormalizedTicker> = new Map();

  /** Cached option data */
  protected optionCache: Map<string, NormalizedOption> = new Map();

  /** Base open interest from REST API - used as t=0 reference */
  protected baseOpenInterest: Map<string, number> = new Map();

  /** Cumulative estimated OI change from intraday trades */
  protected cumulativeOIChange: Map<string, number> = new Map();

  /** History of intraday trades with aggressor classification */
  protected intradayTrades: Map<string, IntradayTrade[]> = new Map();

  /** Event listeners */
  protected eventListeners: Map<BrokerClientEventType, Set<BrokerEventListener<unknown>>> = new Map();

  /** Currently subscribed symbols */
  protected subscribedSymbols: Set<string> = new Set();

  /** Reconnection attempt counter */
  protected reconnectAttempts: number = 0;

  /** Maximum reconnection attempts */
  protected readonly maxReconnectAttempts: number;

  /** Reconnection delay in ms */
  protected readonly baseReconnectDelay: number;

  /** Whether to log verbose debug information */
  protected readonly verbose: boolean;

  /** Broker name for logging */
  protected abstract readonly brokerName: string;

  // ==================== Constructor ====================

  constructor(options: BaseBrokerClientOptions = {}) {
    this.verbose = options.verbose ?? false;
    this.maxReconnectAttempts = options.maxReconnectAttempts ?? 5;
    this.baseReconnectDelay = options.baseReconnectDelay ?? 1000;

    // Initialize event listener maps
    this.eventListeners.set('tickerUpdate', new Set());
    this.eventListeners.set('optionUpdate', new Set());
    this.eventListeners.set('optionTrade', new Set());
    this.eventListeners.set('connected', new Set());
    this.eventListeners.set('disconnected', new Set());
    this.eventListeners.set('error', new Set());
  }

  // ==================== Abstract Methods (Broker-Specific) ====================

  /**
   * Establishes a streaming connection to the broker.
   * @returns Promise that resolves when connected
   * @throws {Error} If connection fails
   */
  abstract connect(): Promise<void>;

  /**
   * Disconnects from the broker streaming API.
   */
  abstract disconnect(): void;

  /**
   * Subscribes to real-time updates for the specified symbols.
   * @param symbols - Array of ticker symbols and/or OCC option symbols
   */
  abstract subscribe(symbols: string[]): void;

  /**
   * Unsubscribes from real-time updates for the specified symbols.
   * @param symbols - Array of symbols to unsubscribe from
   */
  abstract unsubscribe(symbols: string[]): void;

  /**
   * Unsubscribes from all real-time updates.
   */
  abstract unsubscribeFromAll(): void;

  /**
   * Returns whether the client is currently connected.
   */
  abstract isConnected(): boolean;

  /**
   * Fetches open interest and other static data for the specified options.
   * @param occSymbols - Array of OCC option symbols to fetch data for
   */
  abstract fetchOpenInterest(occSymbols: string[]): Promise<void>;

  // ==================== Concrete Public Methods ====================

  /**
   * Returns cached option data for a symbol.
   * @param occSymbol - OCC option symbol
   */
  getOption(occSymbol: string): NormalizedOption | undefined {
    return this.optionCache.get(this.normalizeOccSymbol(occSymbol));
  }

  /**
   * Returns all cached options.
   */
  getAllOptions(): Map<string, NormalizedOption> {
    return new Map(this.optionCache);
  }

  /**
   * Returns cached ticker data for a symbol.
   * @param symbol - Ticker symbol
   */
  getTicker(symbol: string): NormalizedTicker | undefined {
    return this.tickerCache.get(symbol);
  }

  /**
   * Returns all cached tickers.
   */
  getAllTickers(): Map<string, NormalizedTicker> {
    return new Map(this.tickerCache);
  }

  /**
   * Returns intraday trades for an option.
   * @param occSymbol - OCC option symbol
   */
  getIntradayTrades(occSymbol: string): IntradayTrade[] {
    return this.intradayTrades.get(this.normalizeOccSymbol(occSymbol)) ?? [];
  }

  /**
   * Returns flow summary statistics for an option.
   * @param occSymbol - OCC option symbol
   */
  getFlowSummary(occSymbol: string): FlowSummary {
    const normalizedSymbol = this.normalizeOccSymbol(occSymbol);
    const trades = this.intradayTrades.get(normalizedSymbol) ?? [];

    let buyVolume = 0;
    let sellVolume = 0;
    let unknownVolume = 0;

    for (const trade of trades) {
      switch (trade.aggressorSide) {
        case 'buy':
          buyVolume += trade.size;
          break;
        case 'sell':
          sellVolume += trade.size;
          break;
        case 'unknown':
          unknownVolume += trade.size;
          break;
      }
    }

    return {
      buyVolume,
      sellVolume,
      unknownVolume,
      netOIChange: this.cumulativeOIChange.get(normalizedSymbol) ?? 0,
      tradeCount: trades.length,
    };
  }

  /**
   * Resets intraday tracking data.
   * @param occSymbols - Optional specific symbols to reset. If not provided, resets all.
   */
  resetIntradayData(occSymbols?: string[]): void {
    const symbolsToReset = occSymbols?.map(s => this.normalizeOccSymbol(s))
      ?? Array.from(this.intradayTrades.keys());

    for (const symbol of symbolsToReset) {
      this.intradayTrades.delete(symbol);
      this.cumulativeOIChange.set(symbol, 0);
    }
  }

  /**
   * Registers an event listener.
   * @param event - Event type to listen for
   * @param listener - Callback function
   */
  on<T>(event: BrokerClientEventType, listener: BrokerEventListener<T>): this {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      listeners.add(listener as BrokerEventListener<unknown>);
    }
    return this;
  }

  /**
   * Removes an event listener.
   * @param event - Event type
   * @param listener - Callback function to remove
   */
  off<T>(event: BrokerClientEventType, listener: BrokerEventListener<T>): this {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      listeners.delete(listener as BrokerEventListener<unknown>);
    }
    return this;
  }

  // ==================== Protected Helpers ====================

  /**
   * Determines the aggressor side of a trade by comparing trade price to NBBO.
   * 
   * @param tradePrice - The executed trade price
   * @param bid - The bid price at time of trade
   * @param ask - The ask price at time of trade
   * @returns The aggressor side: 'buy' if lifting offer, 'sell' if hitting bid, 'unknown' if mid
   * 
   * @remarks
   * The aggressor is the party that initiated the trade by crossing the spread:
   * - Buy aggressor: Buyer lifts the offer (trades at or above ask) → bullish intent
   * - Sell aggressor: Seller hits the bid (trades at or below bid) → bearish intent
   * - Unknown: Trade occurred mid-market (could be internalized, crossed, or negotiated)
   */
  protected determineAggressorSide(tradePrice: number, bid: number, ask: number): AggressorSide {
    if (bid <= 0 || ask <= 0) return 'unknown';

    const spread = ask - bid;
    const tolerance = spread > 0 ? spread * 0.001 : 0.001;

    if (tradePrice >= ask - tolerance) {
      return 'buy';
    } else if (tradePrice <= bid + tolerance) {
      return 'sell';
    }
    return 'unknown';
  }

  /**
   * Calculates the estimated open interest change from a single trade.
   * 
   * @param aggressorSide - The aggressor side of the trade
   * @param size - Number of contracts traded
   * @returns Estimated OI change (positive = OI increase, negative = OI decrease)
   * 
   * @remarks
   * This uses a simplified heuristic:
   * - Buy aggressor → typically opening new long positions → +OI
   * - Sell aggressor → typically closing longs or opening shorts → -OI
   * - Unknown → ambiguous, assume neutral impact
   */
  protected calculateOIChangeFromTrade(aggressorSide: AggressorSide, size: number): number {
    if (aggressorSide === 'unknown') return 0;
    return aggressorSide === 'buy' ? size : -size;
  }

  /**
   * Calculates the live (intraday) open interest estimate for an option.
   * 
   * @param occSymbol - OCC option symbol
   * @returns Live OI estimate = base OI + cumulative estimated changes
   */
  protected calculateLiveOpenInterest(occSymbol: string): number {
    const baseOI = this.baseOpenInterest.get(occSymbol) ?? 0;
    const cumulativeChange = this.cumulativeOIChange.get(occSymbol) ?? 0;
    return Math.max(0, baseOI + cumulativeChange);
  }

  /**
   * Records a trade and updates OI tracking.
   */
  protected recordTrade(
    occSymbol: string,
    price: number,
    size: number,
    bid: number,
    ask: number,
    timestamp: number,
    optionType?: OptionType
  ): void {
    const aggressorSide = this.determineAggressorSide(price, bid, ask);
    const estimatedOIChange = this.calculateOIChangeFromTrade(aggressorSide, size);
    const currentChange = this.cumulativeOIChange.get(occSymbol) ?? 0;
    this.cumulativeOIChange.set(occSymbol, currentChange + estimatedOIChange);

    if (this.verbose && estimatedOIChange !== 0) {
      const baseOI = this.baseOpenInterest.get(occSymbol) ?? 0;
      const newLiveOI = Math.max(0, baseOI + currentChange + estimatedOIChange);
      console.log(
        `[${this.brokerName}:OI] ${occSymbol} trade: price=${price.toFixed(2)}, size=${size}, ` +
        `aggressor=${aggressorSide}, OI change=${estimatedOIChange > 0 ? '+' : ''}${estimatedOIChange}, ` +
        `liveOI=${newLiveOI} (base=${baseOI}, cumulative=${currentChange + estimatedOIChange})`
      );
    }

    const trade: IntradayTrade = {
      occSymbol,
      price,
      size,
      bid,
      ask,
      aggressorSide,
      timestamp,
      estimatedOIChange,
    };

    if (!this.intradayTrades.has(occSymbol)) {
      this.intradayTrades.set(occSymbol, []);
    }
    this.intradayTrades.get(occSymbol)!.push(trade);
    this.emit('optionTrade', trade);
  }

  /**
   * Sets base open interest for a symbol.
   */
  protected setBaseOpenInterest(occSymbol: string, openInterest: number): void {
    if (openInterest > 0 && !this.baseOpenInterest.has(occSymbol)) {
      this.baseOpenInterest.set(occSymbol, openInterest);
      if (!this.cumulativeOIChange.has(occSymbol)) {
        this.cumulativeOIChange.set(occSymbol, 0);
      }

      if (this.verbose) {
        console.log(`[${this.brokerName}:OI] Base OI set for ${occSymbol}: ${openInterest}`);
      }
    }
  }

  /**
   * Emits an event to all registered listeners.
   */
  protected emit<T>(event: BrokerClientEventType, data: T): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      listeners.forEach(listener => {
        try {
          listener(data);
        } catch (error) {
          console.error(`[${this.brokerName}] Event listener error:`, error);
        }
      });
    }
  }

  /**
   * Normalizes an OCC symbol to consistent format.
   * Removes extra spaces, ensures proper formatting.
   */
  protected normalizeOccSymbol(symbol: string): string {
    const stripped = symbol.replace(/\s+/g, '');
    const match = stripped.match(/^([A-Z]+)(\d{6})([CP])(\d{8})$/);
    if (match) {
      return `${match[1]}${match[2]}${match[3]}${match[4]}`;
    }
    return stripped;
  }

  /**
   * Checks if a symbol is an OCC option symbol.
   */
  protected isOptionSymbol(symbol: string): boolean {
    const normalized = symbol.replace(/\s+/g, '');
    return OCC_OPTION_PATTERN.test(normalized) || /\d{6}[CP]\d{8}/.test(normalized);
  }

  /**
   * Converts value to number, handling NaN and null.
   */
  protected toNumber(value: unknown): number {
    if (value === null || value === undefined) return 0;
    if (typeof value === 'number') return isNaN(value) ? 0 : value;
    if (typeof value === 'string') {
      const num = parseFloat(value);
      return isNaN(num) ? 0 : num;
    }
    return 0;
  }

  /**
   * Sleep utility for delays and reconnection backoff.
   */
  protected sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Calculates reconnection delay with exponential backoff.
   */
  protected getReconnectDelay(): number {
    return this.baseReconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
  }

  /**
   * Logs a message if verbose mode is enabled.
   */
  protected log(message: string): void {
    if (this.verbose) {
      console.log(`[${this.brokerName}] ${message}`);
    }
  }

  // ==================== Common Update Helpers ====================

  /**
   * Updates or creates a ticker from quote data (bid/ask update).
   * @returns The updated ticker
   */
  protected updateTickerFromQuoteData(
    symbol: string,
    bid: number,
    bidSize: number,
    ask: number,
    askSize: number,
    timestamp: number
  ): NormalizedTicker {
    const existing = this.tickerCache.get(symbol);

    const ticker: NormalizedTicker = {
      symbol,
      spot: bid > 0 && ask > 0 ? (bid + ask) / 2 : existing?.spot ?? 0,
      bid,
      bidSize,
      ask,
      askSize,
      last: existing?.last ?? 0,
      volume: existing?.volume ?? 0,
      timestamp,
    };

    this.tickerCache.set(symbol, ticker);
    this.emit('tickerUpdate', ticker);
    return ticker;
  }

  /**
   * Updates or creates a ticker from trade data (last price/volume update).
   * @returns The updated ticker
   */
  protected updateTickerFromTradeData(
    symbol: string,
    price: number,
    size: number,
    dayVolume: number | null,
    timestamp: number
  ): NormalizedTicker {
    const existing = this.tickerCache.get(symbol);

    const ticker: NormalizedTicker = {
      symbol,
      spot: existing?.spot ?? price,
      bid: existing?.bid ?? 0,
      bidSize: existing?.bidSize ?? 0,
      ask: existing?.ask ?? 0,
      askSize: existing?.askSize ?? 0,
      last: price,
      volume: dayVolume !== null ? dayVolume : (existing?.volume ?? 0) + size,
      timestamp,
    };

    this.tickerCache.set(symbol, ticker);
    this.emit('tickerUpdate', ticker);
    return ticker;
  }

  /**
   * Updates or creates an option from quote data (bid/ask update).
   * @returns The updated option, or null if symbol cannot be parsed
   */
  protected updateOptionFromQuoteData(
    occSymbol: string,
    bid: number,
    bidSize: number,
    ask: number,
    askSize: number,
    timestamp: number,
    parseSymbolFn: (symbol: string) => { symbol: string; expiration: Date; optionType: OptionType; strike: number }
  ): NormalizedOption | null {
    const existing = this.optionCache.get(occSymbol);

    let parsed: { symbol: string; expiration: Date; optionType: OptionType; strike: number };
    try {
      parsed = parseSymbolFn(occSymbol);
    } catch {
      if (!existing) return null;
      parsed = {
        symbol: existing.underlying,
        expiration: new Date(existing.expirationTimestamp),
        optionType: existing.optionType,
        strike: existing.strike,
      };
    }

    const option: NormalizedOption = {
      occSymbol,
      underlying: parsed.symbol,
      strike: parsed.strike,
      expiration: parsed.expiration.toISOString().split('T')[0],
      expirationTimestamp: parsed.expiration.getTime(),
      optionType: parsed.optionType,
      bid,
      bidSize,
      ask,
      askSize,
      mark: bid > 0 && ask > 0 ? (bid + ask) / 2 : existing?.mark ?? 0,
      last: existing?.last ?? 0,
      volume: existing?.volume ?? 0,
      openInterest: existing?.openInterest ?? 0,
      liveOpenInterest: this.calculateLiveOpenInterest(occSymbol),
      impliedVolatility: existing?.impliedVolatility ?? 0,
      timestamp,
    };

    this.optionCache.set(occSymbol, option);
    this.emit('optionUpdate', option);
    return option;
  }

  /**
   * Updates or creates an option from trade data, including OI tracking.
   * @returns The updated option, or null if symbol cannot be parsed
   */
  protected updateOptionFromTradeData(
    occSymbol: string,
    price: number,
    size: number,
    dayVolume: number | null,
    timestamp: number,
    parseSymbolFn: (symbol: string) => { symbol: string; expiration: Date; optionType: OptionType; strike: number }
  ): NormalizedOption | null {
    const existing = this.optionCache.get(occSymbol);

    let parsed: { symbol: string; expiration: Date; optionType: OptionType; strike: number };
    try {
      parsed = parseSymbolFn(occSymbol);
    } catch {
      if (!existing) return null;
      parsed = {
        symbol: existing.underlying,
        expiration: new Date(existing.expirationTimestamp),
        optionType: existing.optionType,
        strike: existing.strike,
      };
    }

    const bid = existing?.bid ?? 0;
    const ask = existing?.ask ?? 0;

    // Record trade for OI tracking
    this.recordTrade(occSymbol, price, size, bid, ask, timestamp, parsed.optionType);

    const option: NormalizedOption = {
      occSymbol,
      underlying: parsed.symbol,
      strike: parsed.strike,
      expiration: parsed.expiration.toISOString().split('T')[0],
      expirationTimestamp: parsed.expiration.getTime(),
      optionType: parsed.optionType,
      bid,
      bidSize: existing?.bidSize ?? 0,
      ask,
      askSize: existing?.askSize ?? 0,
      mark: bid > 0 && ask > 0 ? (bid + ask) / 2 : price,
      last: price,
      volume: dayVolume !== null ? dayVolume : (existing?.volume ?? 0) + size,
      openInterest: existing?.openInterest ?? 0,
      liveOpenInterest: this.calculateLiveOpenInterest(occSymbol),
      impliedVolatility: existing?.impliedVolatility ?? 0,
      timestamp,
    };

    this.optionCache.set(occSymbol, option);
    this.emit('optionUpdate', option);
    return option;
  }

  /**
   * Updates or creates an option from timesale data (trade with bid/ask at time of sale).
   * This is particularly useful for live OI tracking.
   * @returns The updated option, or null if symbol cannot be parsed
   */
  protected updateOptionFromTimesaleData(
    occSymbol: string,
    price: number,
    size: number,
    bid: number,
    ask: number,
    timestamp: number,
    parseSymbolFn: (symbol: string) => { symbol: string; expiration: Date; optionType: OptionType; strike: number }
  ): NormalizedOption | null {
    const existing = this.optionCache.get(occSymbol);

    let parsed: { symbol: string; expiration: Date; optionType: OptionType; strike: number };
    try {
      parsed = parseSymbolFn(occSymbol);
    } catch {
      if (!existing) return null;
      parsed = {
        symbol: existing.underlying,
        expiration: new Date(existing.expirationTimestamp),
        optionType: existing.optionType,
        strike: existing.strike,
      };
    }

    // Record trade for OI tracking (timesale has fresh bid/ask)
    this.recordTrade(occSymbol, price, size, bid, ask, timestamp, parsed.optionType);

    const option: NormalizedOption = {
      occSymbol,
      underlying: parsed.symbol,
      strike: parsed.strike,
      expiration: parsed.expiration.toISOString().split('T')[0],
      expirationTimestamp: parsed.expiration.getTime(),
      optionType: parsed.optionType,
      bid,
      bidSize: existing?.bidSize ?? 0,
      ask,
      askSize: existing?.askSize ?? 0,
      mark: (bid + ask) / 2,
      last: price,
      volume: (existing?.volume ?? 0) + size,
      openInterest: existing?.openInterest ?? 0,
      liveOpenInterest: this.calculateLiveOpenInterest(occSymbol),
      impliedVolatility: existing?.impliedVolatility ?? 0,
      timestamp,
    };

    this.optionCache.set(occSymbol, option);
    this.emit('optionUpdate', option);
    return option;
  }
}
