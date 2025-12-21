import { NormalizedOption, NormalizedTicker, OptionType } from '../../types';
import { getUnderlyingFromOptionRoot } from '../../utils/indexOptions';
import { parseOCCSymbol } from '../../utils/occ';
import {
  BaseBrokerClient,
  BaseBrokerClientOptions,
  AggressorSide,
  IntradayTrade,
  FlowSummary,
  BrokerClientEventType,
  BrokerEventListener,
  OCC_OPTION_PATTERN,
} from './BaseBrokerClient';

// Re-export types for backwards compatibility
export { AggressorSide, IntradayTrade, FlowSummary };
export type TradierClientEventType = BrokerClientEventType;
export type TradierEventListener<T> = BrokerEventListener<T>;

/**
 * Tradier streaming session information returned from session creation endpoint
 */
interface TradierStreamSession {
  /** WebSocket URL (not used - we use a fixed URL) */
  url: string;
  /** Session ID required for authentication */
  sessionid: string;
}

/**
 * Tradier stream session API response
 */
interface TradierStreamResponse {
  stream: TradierStreamSession;
}

/**
 * Tradier quote event from WebSocket stream
 * @example {"type":"quote","symbol":"QQQ","bid":502.50,"bidsz":100,"bidexch":"Q","biddate":"1761837637000","ask":502.55,"asksz":200,"askexch":"Q","askdate":"1761837637000"}
 */
interface TradierQuoteEvent {
  type: 'quote';
  symbol: string;
  bid: number;
  bidsz: number;
  bidexch: string;
  biddate: string;
  ask: number;
  asksz: number;
  askexch: string;
  askdate: string;
}

/**
 * Tradier trade event from WebSocket stream
 * @example {"type":"trade","symbol":"QQQ","exch":"D","price":"502.52","size":"100","cvol":"928236","date":"1761837620278","last":"502.52"}
 */
interface TradierTradeEvent {
  type: 'trade';
  symbol: string;
  exch: string;
  price: string;
  size: string;
  cvol: string;
  date: string;
  last: string;
}

/**
 * Tradier summary event from WebSocket stream
 * @example {"type":"summary","symbol":"SPY","open":"282.42","high":"283.49","low":"281.07","prevClose":"288.1"}
 */
interface TradierSummaryEvent {
  type: 'summary';
  symbol: string;
  open: string;
  high: string;
  low: string;
  prevClose: string;
}

/**
 * Tradier timesale event from WebSocket stream - includes bid/ask at time of trade
 * @example {"type":"timesale","symbol":"SPY","exch":"Q","bid":"282.08","ask":"282.09","last":"282.09","size":"100","date":"1557758874355","seq":352795,"flag":"","cancel":false,"correction":false,"session":"normal"}
 */
interface TradierTimesaleEvent {
  type: 'timesale';
  symbol: string;
  exch: string;
  bid: string;
  ask: string;
  last: string;
  size: string;
  date: string;
  seq: number;
  flag: string;
  cancel: boolean;
  correction: boolean;
  session: string;
}

/**
 * Union type for all Tradier stream events
 */
type TradierStreamEvent = TradierQuoteEvent | TradierTradeEvent | TradierSummaryEvent | TradierTimesaleEvent;

/**
 * Tradier option chain item from REST API
 * GET /v1/markets/options/chains
 */
interface TradierOptionChainItem {
  symbol: string;
  description: string;
  exch: string;
  type: string;
  last: number | null;
  change: number | null;
  volume: number;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  bid: number;
  ask: number;
  underlying: string;
  strike: number;
  change_percentage: number | null;
  average_volume: number;
  last_volume: number;
  trade_date: number;
  prevclose: number | null;
  week_52_high: number;
  week_52_low: number;
  bidsize: number;
  bidexch: string;
  bid_date: number;
  asksize: number;
  askexch: string;
  ask_date: number;
  open_interest: number;
  contract_size: number;
  expiration_date: string;
  expiration_type: string;
  option_type: 'call' | 'put';
  root_symbol: string;
  greeks?: {
    delta: number;
    gamma: number;
    theta: number;
    vega: number;
    rho: number;
    phi: number;
    bid_iv: number;
    mid_iv: number;
    ask_iv: number;
    smv_vol: number;
    updated_at: string;
  };
}

/**
 * Tradier options chain API response
 */
interface TradierOptionsChainResponse {
  options: {
    option: TradierOptionChainItem[] | TradierOptionChainItem | null;
  } | null;
}

/**
 * Tradier client configuration options
 */
export interface TradierClientOptions extends BaseBrokerClientOptions {
  /** Tradier API authentication token */
  authToken: string;
}

/**
 * TradierClient handles real-time streaming connections to the Tradier API.
 * 
 * @remarks
 * This client manages WebSocket connections to Tradier's streaming API,
 * normalizes incoming quote and trade data, and emits events for upstream
 * consumption by the FloeClient.
 * 
 * @example
 * ```typescript
 * const client = new TradierClient({ authToken: 'your-api-key' });
 * 
 * client.on('tickerUpdate', (ticker) => {
 *   console.log(`${ticker.symbol}: ${ticker.spot}`);
 * });
 * 
 * await client.connect();
 * client.subscribe(['QQQ', 'AAPL  240119C00500000']);
 * ```
 */
export class TradierClient extends BaseBrokerClient {
  protected readonly brokerName = 'Tradier';

  /** Tradier API authentication token */
  private authToken: string;

  /** Current streaming session */
  private streamSession: TradierStreamSession | null = null;

  /** WebSocket connection */
  private ws: WebSocket | null = null;

  /** Connection state */
  private connected: boolean = false;

  /** Tradier API base URL */
  private readonly apiBaseUrl: string = 'https://api.tradier.com/v1';

  /** Tradier WebSocket URL */
  private readonly wsUrl: string = 'wss://ws.tradier.com/v1/markets/events';

  /**
   * Creates a new TradierClient instance.
   * 
   * @param options - Client configuration options
   * @param options.authToken - Tradier API auth token (required)
   * @param options.verbose - Whether to log verbose debug information (default: false)
   */
  constructor(options: TradierClientOptions) {
    super(options);
    this.authToken = options.authToken;
  }

  // ==================== Public API ====================

  /**
   * Establishes a streaming connection to Tradier.
   * 
   * @returns Promise that resolves when connected
   * @throws {Error} If session creation or WebSocket connection fails
   */
  async connect(): Promise<void> {
    // Create streaming session
    const session = await this.createStreamSession();
    if (!session) {
      throw new Error('Failed to create Tradier streaming session');
    }

    this.streamSession = session;

    // Connect WebSocket
    await this.connectWebSocket();
  }

  /**
   * Disconnects from the Tradier streaming API.
   */
  disconnect(): void {
    if (this.ws) {
      this.ws.close(1000, 'Client disconnect');
      this.ws = null;
    }
    this.connected = false;
    this.streamSession = null;
    this.subscribedSymbols.clear();
  }

  /**
   * Subscribes to real-time updates for the specified symbols.
   * 
   * @param symbols - Array of ticker symbols and/or OCC option symbols
   */
  subscribe(symbols: string[]): void {
    if (!this.connected || !this.ws || !this.streamSession) {
      // Queue symbols for subscription when connected
      symbols.forEach(s => this.subscribedSymbols.add(s));
      return;
    }

    // Add to tracked symbols
    symbols.forEach(s => this.subscribedSymbols.add(s));

    // Send subscription message
    const payload = {
      sessionid: this.streamSession.sessionid,
      symbols: symbols,
    };

    this.ws.send(JSON.stringify(payload));
  }

  /**
   * Unsubscribes from real-time updates for the specified symbols.
   * 
   * @param symbols - Array of symbols to unsubscribe from
   * 
   * @remarks
   * Since Tradier's streaming API doesn't support selective unsubscription,
   * this method disconnects and reconnects with the updated symbol list.
   */
  async unsubscribe(symbols: string[]): Promise<void> {
    symbols.forEach(s => this.subscribedSymbols.delete(s));
    
    // If connected, reconnect with the new symbol list
    if (this.connected) {
      await this.reconnectWithSymbols();
    }
  }

  /**
   * Unsubscribes from all symbols.
   * 
   * @remarks
   * Since Tradier's streaming API doesn't support selective unsubscription,
   * this method disconnects and reconnects without any symbols.
   */
  async unsubscribeFromAll(): Promise<void> {
    this.subscribedSymbols.clear();
    
    // If connected, reconnect with empty symbol list
    if (this.connected) {
      await this.reconnectWithSymbols();
    }
  }

  /**
   * Returns whether the client is currently connected.
   */
  isConnected(): boolean {
    return this.connected;
  }

  /**
   * Fetches options chain data from Tradier REST API.
   * 
   * @param symbol - Underlying symbol (e.g., 'QQQ')
   * @param expiration - Expiration date in YYYY-MM-DD format
   * @param greeks - Whether to include Greeks data (default: true)
   * @returns Array of option chain items, or empty array on failure
   */
  async fetchOptionsChain(
    symbol: string,
    expiration: string,
    greeks: boolean = true
  ): Promise<TradierOptionChainItem[]> {
    try {
      const params = new URLSearchParams({
        symbol,
        expiration,
        greeks: String(greeks),
      });

      const url = `${this.apiBaseUrl}/markets/options/chains?${params.toString()}`;

      const response = await fetch(
        url,
        {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${this.authToken}`,
            'Accept': 'application/json',
          },
        }
      );

      // log raw response for debugging
      const rawResponse = await response.clone().text();
      console.log('Raw options chain response:', rawResponse);

      if (!response.ok) {
        this.emit('error', new Error(`Failed to fetch options chain: ${response.statusText}`));
        return [];
      }

      const data = await response.json() as TradierOptionsChainResponse;
      
      if (!data.options || !data.options.option) {
        return [];
      }

      // Handle case where API returns single object instead of array
      const options = Array.isArray(data.options.option)
        ? data.options.option
        : [data.options.option];

      return options;
    } catch (error) {
      this.emit('error', error instanceof Error ? error : new Error(String(error)));
      return [];
    }
  }

  /**
   * Fetches open interest and other static data for subscribed options via REST API.
   * Call this after subscribing to options to populate open interest.
   * 
   * @param occSymbols - Array of OCC option symbols to fetch data for
   * @returns Promise that resolves when all data is fetched
   * 
   * @remarks
   * Open interest is only available via the REST API, not streaming.
   * This method groups options by underlying and expiration to minimize API calls.
   */
  async fetchOpenInterest(occSymbols: string[]): Promise<void> {
    // Group symbols by underlying and expiration to minimize API calls
    const groups = new Map<string, Set<string>>();

    for (const occSymbol of occSymbols) {
      try {
        const parsed = parseOCCSymbol(occSymbol);
        const underlying = getUnderlyingFromOptionRoot(parsed.symbol);
        const key = `${underlying}:${parsed.expiration.toISOString().split('T')[0]}`;
        
        if (!groups.has(key)) {
          groups.set(key, new Set());
        }
        groups.get(key)!.add(occSymbol);
      } catch {
        // Skip invalid OCC symbols
        continue;
      }
    }

    // Fetch chains for each underlying/expiration combination
    const fetchPromises = Array.from(groups.entries()).map(async ([key, symbols]) => {
      const [underlying, expiration] = key.split(':');
      const chain = await this.fetchOptionsChain(underlying, expiration);

      // Update cache with open interest data
      for (const item of chain) {
        // Tradier returns symbols in the same format we use (compact OCC)
        if (symbols.has(item.symbol)) {
          // Store base open interest for live OI calculation (t=0 reference)
          this.baseOpenInterest.set(item.symbol, item.open_interest);
          
          if (this.verbose) {
            console.log(`[Tradier:OI] Base OI set for ${item.symbol}: ${item.open_interest}`);
          }
          
          // Initialize cumulative OI change if not already set
          if (!this.cumulativeOIChange.has(item.symbol)) {
            this.cumulativeOIChange.set(item.symbol, 0);
          }

          const existing = this.optionCache.get(item.symbol);
          if (existing) {
            // Update existing cache entry with REST data
            existing.openInterest = item.open_interest;
            existing.liveOpenInterest = this.calculateLiveOpenInterest(item.symbol);
            existing.volume = item.volume;
            existing.impliedVolatility = item.greeks?.mid_iv ?? existing.impliedVolatility;
            
            // Also update bid/ask if not yet populated
            if (existing.bid === 0 && item.bid > 0) {
              existing.bid = item.bid;
              existing.bidSize = item.bidsize;
            }
            if (existing.ask === 0 && item.ask > 0) {
              existing.ask = item.ask;
              existing.askSize = item.asksize;
            }
            if (existing.last === 0 && item.last !== null) {
              existing.last = item.last;
            }
            if (existing.mark === 0) {
              existing.mark = (item.bid + item.ask) / 2;
            }

            this.optionCache.set(item.symbol, existing);
            this.emit('optionUpdate', existing);
          } else {
            // Create new cache entry from REST data
            const parsedSymbol = parseOCCSymbol(item.symbol);
            const option: NormalizedOption = {
              occSymbol: item.symbol,
              underlying: item.underlying,
              strike: item.strike,
              expiration: item.expiration_date,
              expirationTimestamp: parsedSymbol.expiration.getTime(),
              optionType: item.option_type,
              bid: item.bid,
              bidSize: item.bidsize,
              ask: item.ask,
              askSize: item.asksize,
              mark: (item.bid + item.ask) / 2,
              last: item.last ?? 0,
              volume: item.volume,
              openInterest: item.open_interest,
              liveOpenInterest: this.calculateLiveOpenInterest(item.symbol),
              impliedVolatility: item.greeks?.mid_iv ?? 0,
              timestamp: Date.now(),
            };

            this.optionCache.set(item.symbol, option);
            this.emit('optionUpdate', option);
          }
        }
      }
    });

    await Promise.all(fetchPromises);
  }

  // ==================== Private Methods ====================

  /**
   * Creates a streaming session with Tradier API.
   */
  private async createStreamSession(): Promise<TradierStreamSession | null> {
    try {
      const response = await fetch(`${this.apiBaseUrl}/markets/events/session`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.authToken}`,
          'Accept': 'application/json',
        },
      });

      if (!response.ok) {
        this.emit('error', new Error(`Failed to create stream session: ${response.statusText}`));
        return null;
      }

      const data = await response.json() as TradierStreamResponse;
      return data.stream;
    } catch (error) {
      this.emit('error', error instanceof Error ? error : new Error(String(error)));
      return null;
    }
  }

  /**
   * Connects to the Tradier WebSocket.
   */
  private connectWebSocket(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.wsUrl);

      this.ws.onopen = () => {
        this.connected = true;
        this.reconnectAttempts = 0;
        if (this.verbose) {
          console.log('[Tradier:WS] Connected to streaming API');
        }
        this.emit('connected', undefined);

        // Subscribe to any queued symbols
        if (this.subscribedSymbols.size > 0 && this.streamSession) {
          const payload = {
            sessionid: this.streamSession.sessionid,
            symbols: Array.from(this.subscribedSymbols),
          };
          this.ws!.send(JSON.stringify(payload));
        }

        resolve();
      };

      this.ws.onmessage = (event) => {
        this.handleMessage(event.data);
      };

      this.ws.onclose = (event) => {
        this.connected = false;
        this.emit('disconnected', { reason: event.reason });

        // Attempt reconnection if not a clean close
        if (event.code !== 1000) {
          this.attemptReconnect();
        }
      };

      this.ws.onerror = (error) => {
        this.emit('error', new Error('WebSocket error'));
        reject(error);
      };
    });
  }

  /**
   * Attempts to reconnect with exponential backoff.
   */
  private async attemptReconnect(): Promise<void> {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.emit('error', new Error('Max reconnection attempts reached'));
      return;
    }

    this.reconnectAttempts++;
    const delay = this.baseReconnectDelay * Math.pow(2, this.reconnectAttempts - 1);

    if (this.verbose) {
      console.log(`[Tradier:WS] Reconnection attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${delay}ms`);
    }

    await this.sleep(delay);

    try {
      await this.connect();
    } catch {
      // Reconnect attempt failed, will try again via onclose
    }
  }

  /**
   * Reconnects with the current symbol list.
   * Used for unsubscribe operations since Tradier doesn't support selective unsubscription.
   */
  private async reconnectWithSymbols(): Promise<void> {
    if (this.verbose) {
      console.log(`[Tradier:WS] Reconnecting with ${this.subscribedSymbols.size} symbols`);
    }

    // Disconnect cleanly
    this.disconnect();

    // Wait briefly to ensure clean disconnect
    await this.sleep(100);

    // Reconnect with current symbol list
    await this.connect();
  }

  /**
   * Handles incoming WebSocket messages.
   */
  private handleMessage(data: string): void {
    try {
      const event: TradierStreamEvent = JSON.parse(data);
      
      if (event.type === 'quote') {
        this.handleQuoteEvent(event as TradierQuoteEvent);
      } else if (event.type === 'trade') {
        this.handleTradeEvent(event as TradierTradeEvent);
      } else if (event.type === 'timesale') {
        this.handleTimesaleEvent(event as TradierTimesaleEvent);
      }
      // 'summary' events don't have data we need for NormalizedTicker/Option
    } catch (error) {
      // Ignore parse errors for heartbeat/status messages
    }
  }

  /**
   * Handles quote events (bid/ask updates).
   */
  private handleQuoteEvent(event: TradierQuoteEvent): void {
    const { symbol } = event;
    const timestamp = parseInt(event.biddate, 10) || Date.now();
    const isOption = this.isTradierOptionSymbol(symbol);

    if (isOption) {
      this.updateOptionFromQuote(symbol, event, timestamp);
    } else {
      this.updateTickerFromQuote(symbol, event, timestamp);
    }
  }

  /**
   * Handles trade events (last price/volume updates).
   */
  private handleTradeEvent(event: TradierTradeEvent): void {
    const { symbol } = event;
    const timestamp = parseInt(event.date, 10) || Date.now();
    const isOption = this.isTradierOptionSymbol(symbol);

    if (isOption) {
      this.updateOptionFromTrade(symbol, event, timestamp);
    } else {
      this.updateTickerFromTrade(symbol, event, timestamp);
    }
  }

  /**
   * Handles timesale events (trade with bid/ask at time of sale).
   * This is particularly useful for options where quote events may be sparse.
   */
  private handleTimesaleEvent(event: TradierTimesaleEvent): void {
    const { symbol } = event;
    const timestamp = parseInt(event.date, 10) || Date.now();
    const isOption = this.isTradierOptionSymbol(symbol);

    if (isOption) {
      this.updateOptionFromTimesale(symbol, event, timestamp);
    } else {
      this.updateTickerFromTimesale(symbol, event, timestamp);
    }
  }

  /**
   * Updates ticker data from a quote event.
   */
  private updateTickerFromQuote(symbol: string, event: TradierQuoteEvent, timestamp: number): void {
    this.updateTickerFromQuoteData(symbol, event.bid, event.bidsz, event.ask, event.asksz, timestamp);
  }

  /**
   * Updates ticker data from a trade event.
   */
  private updateTickerFromTrade(symbol: string, event: TradierTradeEvent, timestamp: number): void {
    const last = parseFloat(event.last);
    const volume = parseInt(event.cvol, 10);
    this.updateTickerFromTradeData(symbol, last, 0, volume, timestamp);
  }

  /**
   * Updates option data from a quote event.
   */
  private updateOptionFromQuote(occSymbol: string, event: TradierQuoteEvent, timestamp: number): void {
    this.updateOptionFromQuoteData(occSymbol, event.bid, event.bidsz, event.ask, event.asksz, timestamp, parseOCCSymbol);
  }

  /**
   * Updates option data from a trade event.
   */
  private updateOptionFromTrade(occSymbol: string, event: TradierTradeEvent, timestamp: number): void {
    const last = parseFloat(event.last);
    const volume = parseInt(event.cvol, 10);
    this.updateOptionFromTradeData(occSymbol, last, 0, volume, timestamp, parseOCCSymbol);
  }

  /**
   * Updates ticker data from a timesale event.
   * Timesale events include bid/ask at the time of the trade.
   */
  private updateTickerFromTimesale(symbol: string, event: TradierTimesaleEvent, timestamp: number): void {
    const existing = this.tickerCache.get(symbol);
    const bid = parseFloat(event.bid);
    const ask = parseFloat(event.ask);
    const last = parseFloat(event.last);
    const size = parseInt(event.size, 10);

    const ticker: NormalizedTicker = {
      symbol,
      spot: (bid + ask) / 2,
      bid,
      bidSize: existing?.bidSize ?? 0, // timesale doesn't include bid/ask size
      ask,
      askSize: existing?.askSize ?? 0,
      last,
      volume: (existing?.volume ?? 0) + size, // Accumulate volume
      timestamp,
    };

    this.tickerCache.set(symbol, ticker);
    this.emit('tickerUpdate', ticker);
  }

  /**
   * Updates option data from a timesale event.
   * Timesale events include bid/ask at the time of the trade, enabling aggressor side detection.
   */
  private updateOptionFromTimesale(occSymbol: string, event: TradierTimesaleEvent, timestamp: number): void {
    const bid = parseFloat(event.bid);
    const ask = parseFloat(event.ask);
    const last = parseFloat(event.last);
    const size = parseInt(event.size, 10);

    this.updateOptionFromTimesaleData(occSymbol, last, size, bid, ask, timestamp, parseOCCSymbol);
  }

  /**
   * Checks if a symbol is an OCC option symbol.
   */
  private isTradierOptionSymbol(symbol: string): boolean {
    return OCC_OPTION_PATTERN.test(symbol);
  }
}