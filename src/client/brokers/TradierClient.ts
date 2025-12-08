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
 * Union type for all Tradier stream events
 */
type TradierStreamEvent = TradierQuoteEvent | TradierTradeEvent;

/**
 * Event types emitted by TradierClient
 */
type TradierClientEventType = 'tickerUpdate' | 'optionUpdate' | 'connected' | 'disconnected' | 'error';

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
  private authKey: string;

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

  /**
   * Creates a new TradierClient instance.
   * 
   * @param authKey - Tradier API access token
   */
  constructor(authKey: string) {
    this.authKey = authKey;

    // Initialize event listener maps
    this.eventListeners.set('tickerUpdate', new Set());
    this.eventListeners.set('optionUpdate', new Set());
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
   * Note: Tradier's streaming API doesn't support unsubscription for individual
   * symbols. This method removes them from local tracking. To fully unsubscribe,
   * you would need to disconnect and reconnect with the new symbol list.
   */
  unsubscribe(symbols: string[]): void {
    symbols.forEach(s => this.subscribedSymbols.delete(s));
    // Note: Tradier doesn't support selective unsubscribe
    // Would need to reconnect with new symbol list for full effect
  }

  /**
   * Returns whether the client is currently connected.
   */
  isConnected(): boolean {
    return this.connected;
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
          'Authorization': `Bearer ${this.authKey}`,
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

    await this.sleep(delay);

    try {
      await this.connect();
    } catch {
      // Reconnect attempt failed, will try again via onclose
    }
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
      }
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