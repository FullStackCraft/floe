import { NormalizedOption, NormalizedTicker, OptionType } from '../../types';
import { parseOCCSymbol } from '../../utils/occ';

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
  /** Estimated OI change: +size for buy aggressor (new longs), -size for sell aggressor (closing longs/new shorts) */
  estimatedOIChange: number;
}

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
 * Event types emitted by TradierClient
 */
type TradierClientEventType = 'tickerUpdate' | 'optionUpdate' | 'optionTrade' | 'connected' | 'disconnected' | 'error';

/**
 * Event listener callback type
 */
type TradierEventListener<T> = (data: T) => void;

/**
 * Regex pattern to identify OCC option symbols
 * Matches both compact format (e.g., AAPL230120C00150000) and 
 * padded format (e.g., 'AAPL  230120C00150000')
 * Pattern: 1-6 char root + YYMMDD + C/P + 8-digit strike
 */
const OCC_OPTION_PATTERN = /^.{1,6}\d{6}[CP]\d{8}$/;

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
 * const client = new TradierClient('your-api-key');
 * 
 * client.on('tickerUpdate', (ticker) => {
 *   console.log(`${ticker.symbol}: ${ticker.spot}`);
 * });
 * 
 * await client.connect();
 * client.subscribe(['QQQ', 'AAPL  240119C00500000']);
 * ```
 */
export class TradierClient {
  /** Tradier API authentication token */
  private authToken: string;

  /** Current streaming session */
  private streamSession: TradierStreamSession | null = null;

  /** WebSocket connection */
  private ws: WebSocket | null = null;

  /** Connection state */
  private connected: boolean = false;

  /** Currently subscribed symbols (tickers and options) */
  private subscribedSymbols: Set<string> = new Set();

  /** Cached ticker data (for merging quote and trade events) */
  private tickerCache: Map<string, NormalizedTicker> = new Map();

  /** Cached option data (for merging quote and trade events) */
  private optionCache: Map<string, NormalizedOption> = new Map();

  /** 
   * Base open interest from REST API - used as t=0 reference for live OI calculation
   * Key: OCC symbol, Value: open interest at start of day / time of fetch
   */
  private baseOpenInterest: Map<string, number> = new Map();

  /**
   * Cumulative estimated OI change from intraday trades
   * Key: OCC symbol, Value: net estimated change (positive = more contracts opened)
   */
  private cumulativeOIChange: Map<string, number> = new Map();

  /**
   * History of intraday trades with aggressor classification
   * Key: OCC symbol, Value: array of trades
   */
  private intradayTrades: Map<string, IntradayTrade[]> = new Map();

  /** Event listeners */
  private eventListeners: Map<TradierClientEventType, Set<TradierEventListener<any>>> = new Map();

  /** Reconnection attempt counter */
  private reconnectAttempts: number = 0;

  /** Maximum reconnection attempts */
  private readonly maxReconnectAttempts: number = 5;

  /** Reconnection delay in ms (doubles with each attempt) */
  private readonly baseReconnectDelay: number = 1000;

  /** Tradier API base URL */
  private readonly apiBaseUrl: string = 'https://api.tradier.com/v1';

  /** Tradier WebSocket URL */
  private readonly wsUrl: string = 'wss://ws.tradier.com/v1/markets/events';

  /** Whether to log verbose debug information */
  private readonly verbose: boolean;

  /**
   * Creates a new TradierClient instance.
   * 
   * @param authToken - Tradier API auth token
   * @param options - Optional configuration options
   * @param options.verbose - Whether to log verbose debug information (default: false)
   */
  constructor(authToken: string, options?: { verbose?: boolean }) {
    this.authToken = authToken;
    this.verbose = options?.verbose ?? false;

    // Initialize event listener maps
    this.eventListeners.set('tickerUpdate', new Set());
    this.eventListeners.set('optionUpdate', new Set());
    this.eventListeners.set('optionTrade', new Set());
    this.eventListeners.set('connected', new Set());
    this.eventListeners.set('disconnected', new Set());
    this.eventListeners.set('error', new Set());
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
        const key = `${parsed.symbol}:${parsed.expiration.toISOString().split('T')[0]}`;
        
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

  /**
   * Returns the cached option data for a symbol.
   * 
   * @param occSymbol - OCC option symbol
   * @returns Cached option data or undefined
   */
  getOption(occSymbol: string): NormalizedOption | undefined {
    return this.optionCache.get(occSymbol);
  }

  /**
   * Returns all cached options.
   * 
   * @returns Map of OCC symbols to option data
   */
  getAllOptions(): Map<string, NormalizedOption> {
    return new Map(this.optionCache);
  }

  /**
   * Registers an event listener.
   * 
   * @param event - Event type to listen for
   * @param listener - Callback function
   */
  on<T>(event: TradierClientEventType, listener: TradierEventListener<T>): this {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      listeners.add(listener);
    }
    return this;
  }

  /**
   * Removes an event listener.
   * 
   * @param event - Event type
   * @param listener - Callback function to remove
   */
  off<T>(event: TradierClientEventType, listener: TradierEventListener<T>): this {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      listeners.delete(listener);
    }
    return this;
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
    const isOption = this.isOptionSymbol(symbol);

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
    const isOption = this.isOptionSymbol(symbol);

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
    const isOption = this.isOptionSymbol(symbol);

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
    const existing = this.tickerCache.get(symbol);
    
    const ticker: NormalizedTicker = {
      symbol,
      spot: (event.bid + event.ask) / 2,
      bid: event.bid,
      bidSize: event.bidsz,
      ask: event.ask,
      askSize: event.asksz,
      last: existing?.last ?? 0,
      volume: existing?.volume ?? 0,
      timestamp,
    };

    this.tickerCache.set(symbol, ticker);
    this.emit('tickerUpdate', ticker);
  }

  /**
   * Updates ticker data from a trade event.
   */
  private updateTickerFromTrade(symbol: string, event: TradierTradeEvent, timestamp: number): void {
    const existing = this.tickerCache.get(symbol);
    const last = parseFloat(event.last);
    const volume = parseInt(event.cvol, 10);

    const ticker: NormalizedTicker = {
      symbol,
      spot: existing?.spot ?? last,
      bid: existing?.bid ?? 0,
      bidSize: existing?.bidSize ?? 0,
      ask: existing?.ask ?? 0,
      askSize: existing?.askSize ?? 0,
      last,
      volume,
      timestamp,
    };

    this.tickerCache.set(symbol, ticker);
    this.emit('tickerUpdate', ticker);
  }

  /**
   * Updates option data from a quote event.
   */
  private updateOptionFromQuote(occSymbol: string, event: TradierQuoteEvent, timestamp: number): void {
    const existing = this.optionCache.get(occSymbol);
    
    // Parse OCC symbol to extract option details
    let parsed: { symbol: string; expiration: Date; optionType: OptionType; strike: number };
    try {
      parsed = parseOCCSymbol(occSymbol);
    } catch {
      // Invalid OCC symbol, skip
      return;
    }

    const option: NormalizedOption = {
      occSymbol,
      underlying: parsed.symbol,
      strike: parsed.strike,
      expiration: parsed.expiration.toISOString().split('T')[0],
      expirationTimestamp: parsed.expiration.getTime(),
      optionType: parsed.optionType,
      bid: event.bid,
      bidSize: event.bidsz,
      ask: event.ask,
      askSize: event.asksz,
      mark: (event.bid + event.ask) / 2,
      last: existing?.last ?? 0,
      volume: existing?.volume ?? 0,
      openInterest: existing?.openInterest ?? 0,
      impliedVolatility: existing?.impliedVolatility ?? 0,
      timestamp,
    };

    this.optionCache.set(occSymbol, option);
    this.emit('optionUpdate', option);
  }

  /**
   * Updates option data from a trade event.
   */
  private updateOptionFromTrade(occSymbol: string, event: TradierTradeEvent, timestamp: number): void {
    const existing = this.optionCache.get(occSymbol);
    
    // Parse OCC symbol to extract option details
    let parsed: { symbol: string; expiration: Date; optionType: OptionType; strike: number };
    try {
      parsed = parseOCCSymbol(occSymbol);
    } catch {
      // Invalid OCC symbol, skip
      return;
    }

    const last = parseFloat(event.last);
    const volume = parseInt(event.cvol, 10);

    const option: NormalizedOption = {
      occSymbol,
      underlying: parsed.symbol,
      strike: parsed.strike,
      expiration: parsed.expiration.toISOString().split('T')[0],
      expirationTimestamp: parsed.expiration.getTime(),
      optionType: parsed.optionType,
      bid: existing?.bid ?? 0,
      bidSize: existing?.bidSize ?? 0,
      ask: existing?.ask ?? 0,
      askSize: existing?.askSize ?? 0,
      mark: existing?.mark ?? last,
      last,
      volume,
      openInterest: existing?.openInterest ?? 0,
      impliedVolatility: existing?.impliedVolatility ?? 0,
      timestamp,
    };

    this.optionCache.set(occSymbol, option);
    this.emit('optionUpdate', option);
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
   * 
   * This is the primary method for calculating live open interest:
   * - Aggressor side is determined by comparing trade price to NBBO
   * - Buy aggressor (lifting ask) typically indicates new long positions → OI increases
   * - Sell aggressor (hitting bid) typically indicates closing longs or new shorts → OI decreases
   */
  private updateOptionFromTimesale(occSymbol: string, event: TradierTimesaleEvent, timestamp: number): void {
    const existing = this.optionCache.get(occSymbol);
    
    // Parse OCC symbol to extract option details
    let parsed: { symbol: string; expiration: Date; optionType: OptionType; strike: number };
    try {
      parsed = parseOCCSymbol(occSymbol);
    } catch {
      // Invalid OCC symbol, skip
      return;
    }

    const bid = parseFloat(event.bid);
    const ask = parseFloat(event.ask);
    const last = parseFloat(event.last);
    const size = parseInt(event.size, 10);

    // Determine aggressor side by comparing trade price to NBBO
    const aggressorSide = this.determineAggressorSide(last, bid, ask);
    
    // Calculate estimated OI change based on aggressor side
    // Buy aggressor (lifting the offer) → typically opening new long positions → +OI
    // Sell aggressor (hitting the bid) → typically closing longs or opening shorts → -OI
    const estimatedOIChange = this.calculateOIChangeFromTrade(aggressorSide, size, parsed.optionType);
    
    // Update cumulative OI change
    const currentChange = this.cumulativeOIChange.get(occSymbol) ?? 0;
    this.cumulativeOIChange.set(occSymbol, currentChange + estimatedOIChange);
    
    if (this.verbose && estimatedOIChange !== 0) {
      const baseOI = this.baseOpenInterest.get(occSymbol) ?? 0;
      const newLiveOI = Math.max(0, baseOI + currentChange + estimatedOIChange);
      console.log(`[Tradier:OI] ${occSymbol} trade: price=${last.toFixed(2)}, size=${size}, aggressor=${aggressorSide}, OI change=${estimatedOIChange > 0 ? '+' : ''}${estimatedOIChange}, liveOI=${newLiveOI} (base=${baseOI}, cumulative=${currentChange + estimatedOIChange})`);
    }
    
    // Record the trade for analysis
    const trade: IntradayTrade = {
      occSymbol,
      price: last,
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
    
    // Emit trade event with aggressor info
    this.emit('optionTrade', trade);

    const option: NormalizedOption = {
      occSymbol,
      underlying: parsed.symbol,
      strike: parsed.strike,
      expiration: parsed.expiration.toISOString().split('T')[0],
      expirationTimestamp: parsed.expiration.getTime(),
      optionType: parsed.optionType,
      bid,
      bidSize: existing?.bidSize ?? 0, // timesale doesn't include bid/ask size
      ask,
      askSize: existing?.askSize ?? 0,
      mark: (bid + ask) / 2,
      last,
      volume: (existing?.volume ?? 0) + size, // Accumulate volume
      openInterest: existing?.openInterest ?? 0,
      liveOpenInterest: this.calculateLiveOpenInterest(occSymbol),
      impliedVolatility: existing?.impliedVolatility ?? 0,
      timestamp,
    };

    this.optionCache.set(occSymbol, option);
    this.emit('optionUpdate', option);
  }

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
  private determineAggressorSide(tradePrice: number, bid: number, ask: number): AggressorSide {
    // Use a small tolerance for floating point comparison (0.1% of spread)
    const spread = ask - bid;
    const tolerance = spread > 0 ? spread * 0.001 : 0.001;
    
    if (tradePrice >= ask - tolerance) {
      // Trade at or above ask → buyer lifted the offer
      return 'buy';
    } else if (tradePrice <= bid + tolerance) {
      // Trade at or below bid → seller hit the bid
      return 'sell';
    } else {
      // Trade mid-market - could be either side or internalized
      return 'unknown';
    }
  }

  /**
   * Calculates the estimated open interest change from a single trade.
   * 
   * @param aggressorSide - The aggressor side of the trade
   * @param size - Number of contracts traded
   * @param optionType - Whether this is a call or put
   * @returns Estimated OI change (positive = OI increase, negative = OI decrease)
   * 
   * @remarks
   * This uses a simplified heuristic based on typical market behavior:
   * 
   * For CALLS:
   * - Buy aggressor (lifting offer) → typically bullish, opening new longs → +OI
   * - Sell aggressor (hitting bid) → typically closing longs or bearish new shorts → -OI
   * 
   * For PUTS:
   * - Buy aggressor (lifting offer) → typically bearish/hedging, opening new longs → +OI
   * - Sell aggressor (hitting bid) → typically closing longs → -OI
   * 
   * Note: This is an estimate. Without knowing if trades are opening or closing,
   * we use aggressor side as a proxy. SpotGamma and similar providers use
   * more sophisticated models that may incorporate position sizing, strike
   * selection patterns, and other heuristics.
   */
  private calculateOIChangeFromTrade(
    aggressorSide: AggressorSide, 
    size: number, 
    optionType: OptionType
  ): number {
    if (aggressorSide === 'unknown') {
      // Mid-market trades are ambiguous - assume neutral impact on OI
      return 0;
    }
    
    // Simple heuristic: buy aggressor = new positions opening, sell aggressor = positions closing
    // This applies to both calls and puts since we're measuring contract count, not direction
    if (aggressorSide === 'buy') {
      return size; // New positions opening
    } else {
      return -size; // Positions closing
    }
  }

  /**
   * Calculates the live (intraday) open interest estimate for an option.
   * 
   * @param occSymbol - OCC option symbol
   * @returns Live OI estimate = base OI + cumulative estimated changes
   * 
   * @remarks
   * Live Open Interest = Base OI (from REST at t=0) + Cumulative OI Changes (from trades)
   * 
   * This provides a real-time estimate of open interest that updates throughout
   * the trading day as trades occur. The accuracy depends on:
   * 1. The accuracy of aggressor side detection
   * 2. The assumption that aggressors are typically opening new positions
   * 
   * The official OI is only updated overnight by the OCC clearing house,
   * so this estimate fills the gap during trading hours.
   */
  private calculateLiveOpenInterest(occSymbol: string): number {
    const baseOI = this.baseOpenInterest.get(occSymbol) ?? 0;
    const cumulativeChange = this.cumulativeOIChange.get(occSymbol) ?? 0;
    
    // Live OI cannot go negative
    return Math.max(0, baseOI + cumulativeChange);
  }

  /**
   * Returns the intraday trades for an option with aggressor classification.
   * 
   * @param occSymbol - OCC option symbol
   * @returns Array of intraday trades, or empty array if none
   */
  getIntradayTrades(occSymbol: string): IntradayTrade[] {
    return this.intradayTrades.get(occSymbol) ?? [];
  }

  /**
   * Returns summary statistics for intraday option flow.
   * 
   * @param occSymbol - OCC option symbol
   * @returns Object with buy/sell volume, net OI change, and trade count
   */
  getFlowSummary(occSymbol: string): {
    buyVolume: number;
    sellVolume: number;
    unknownVolume: number;
    netOIChange: number;
    tradeCount: number;
  } {
    const trades = this.intradayTrades.get(occSymbol) ?? [];
    
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
      netOIChange: this.cumulativeOIChange.get(occSymbol) ?? 0,
      tradeCount: trades.length,
    };
  }

  /**
   * Resets intraday tracking data. Call this at market open or when re-fetching base OI.
   * 
   * @param occSymbols - Optional specific symbols to reset. If not provided, resets all.
   */
  resetIntradayData(occSymbols?: string[]): void {
    const symbolsToReset = occSymbols ?? Array.from(this.intradayTrades.keys());
    
    for (const symbol of symbolsToReset) {
      this.intradayTrades.delete(symbol);
      this.cumulativeOIChange.set(symbol, 0);
    }
  }

  /**
   * Checks if a symbol is an OCC option symbol.
   */
  private isOptionSymbol(symbol: string): boolean {
    return OCC_OPTION_PATTERN.test(symbol);
  }

  /**
   * Emits an event to all registered listeners.
   */
  private emit<T>(event: TradierClientEventType, data: T): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      listeners.forEach(listener => {
        try {
          listener(data);
        } catch (error) {
          // Don't let listener errors break the stream
          console.error('Event listener error:', error);
        }
      });
    }
  }

  /**
   * Simple sleep utility.
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}