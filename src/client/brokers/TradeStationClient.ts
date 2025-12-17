import { NormalizedOption, NormalizedTicker, OptionType } from '../../types';
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
export type TradeStationClientEventType = BrokerClientEventType;
export type TradeStationEventListener<T> = BrokerEventListener<T>;

// ==================== TradeStation API Types ====================

/**
 * TradeStation quote stream response
 * From GET /v3/marketdata/stream/quotes/{symbols}
 */
interface TradeStationQuoteStream {
  Symbol: string;
  Open?: string;
  PreviousClose?: string;
  Last?: string;
  Ask?: string;
  AskSize?: string;
  Bid?: string;
  BidSize?: string;
  NetChange?: string;
  NetChangePct?: string;
  High52Week?: string;
  High52WeekTimestamp?: string;
  Low52Week?: string;
  Low52WeekTimestamp?: string;
  Volume?: string;
  PreviousVolume?: string;
  Close?: string;
  DailyOpenInterest?: string;
  TradeTime?: string;
  TickSizeTier?: string;
  MarketFlags?: {
    IsDelayed?: boolean;
    IsHardToBorrow?: boolean;
    IsBats?: boolean;
    IsHalted?: boolean;
  };
  Error?: string;
}

/**
 * TradeStation option chain stream response
 * From GET /v3/marketdata/stream/options/chains/{underlying}
 */
interface TradeStationOptionChainStream {
  Delta?: string;
  Theta?: string;
  Gamma?: string;
  Rho?: string;
  Vega?: string;
  ImpliedVolatility?: string;
  IntrinsicValue?: string;
  ExtrinsicValue?: string;
  TheoreticalValue?: string;
  ProbabilityITM?: string;
  ProbabilityOTM?: string;
  DailyOpenInterest?: number;
  Ask?: string;
  Bid?: string;
  Mid?: string;
  AskSize?: number;
  BidSize?: number;
  Close?: string;
  High?: string;
  Last?: string;
  Low?: string;
  NetChange?: string;
  NetChangePct?: string;
  Open?: string;
  PreviousClose?: string;
  Volume?: number;
  Side?: 'Call' | 'Put';
  Strikes?: string[];
  Legs?: TradeStationOptionLeg[];
  Error?: string;
  StreamStatus?: 'EndSnapshot' | 'GoAway';
}

/**
 * TradeStation option leg in chain response
 */
interface TradeStationOptionLeg {
  Symbol: string;
  OpenInterest?: number;
  ExpirationDate?: string;
  Underlying?: string;
  StrikePrice?: string;
  OptionType?: 'Call' | 'Put';
}

/**
 * TradeStation option quote stream response
 * From GET /v3/marketdata/stream/options/quotes
 */
interface TradeStationOptionQuoteStream {
  Delta?: string;
  Theta?: string;
  Gamma?: string;
  Rho?: string;
  Vega?: string;
  ImpliedVolatility?: string;
  IntrinsicValue?: string;
  ExtrinsicValue?: string;
  TheoreticalValue?: string;
  DailyOpenInterest?: number;
  Ask?: string;
  Bid?: string;
  Mid?: string;
  AskSize?: number;
  BidSize?: number;
  Close?: string;
  High?: string;
  Last?: string;
  Low?: string;
  Volume?: number;
  Side?: 'Call' | 'Put';
  Strikes?: string[];
  Legs?: TradeStationOptionLeg[];
  Error?: string;
  StreamStatus?: 'EndSnapshot' | 'GoAway';
}

/**
 * TradeStation quote snapshot response
 * From GET /v3/marketdata/quotes/{symbols}
 */
interface TradeStationQuoteSnapshot {
  Quotes: TradeStationQuoteStream[];
}

/**
 * TradeStation option expirations response
 */
interface TradeStationExpirationsResponse {
  Expirations: Array<{
    Date: string;
    Type: string;
  }>;
}

/**
 * TradeStation symbol details response
 */
interface TradeStationSymbolDetails {
  Symbols: Array<{
    Symbol: string;
    Description?: string;
    Exchange?: string;
    Currency?: string;
    PointValue?: number;
    AssetType?: string;
    FutureType?: string;
    ExpirationDate?: string;
    StrikePrice?: number;
    OptionType?: string;
    Root?: string;
    Underlying?: string;
  }>;
  Errors: Array<{ Symbol: string; Error: string }>;
}

/**
 * Regex pattern to identify TradeStation option symbols
 * TradeStation uses space-padded format: "MSFT 220916C305"
 */
const TS_OPTION_PATTERN = /^[A-Z]+\s+\d{6}[CP]\d+(\.\d+)?$/;

/**
 * TradeStation client configuration options
 */
export interface TradeStationClientOptions extends BaseBrokerClientOptions {
  /** TradeStation OAuth access token (required) */
  accessToken: string;
  /** OAuth refresh token for automatic token renewal */
  refreshToken?: string;
  /** Whether to use simulation environment (default: false) */
  simulation?: boolean;
  /** Callback when token is refreshed */
  onTokenRefresh?: (newToken: string) => void;
}

/**
 * TradeStationClient handles real-time streaming connections to the TradeStation API
 * via HTTP chunked transfer encoding.
 * 
 * @remarks
 * This client manages HTTP streaming connections to TradeStation's market data API,
 * normalizes incoming quote data, and emits events for upstream consumption by
 * the FloeClient.
 * 
 * TradeStation uses HTTP streaming (chunked transfer encoding) instead of WebSockets.
 * Each stream is a long-lived HTTP connection that returns JSON objects separated
 * by newlines.
 * 
 * @example
 * ```typescript
 * const client = new TradeStationClient({
 *   accessToken: 'your-oauth-access-token'
 * });
 * 
 * client.on('tickerUpdate', (ticker) => {
 *   console.log(`${ticker.symbol}: ${ticker.spot}`);
 * });
 * 
 * await client.connect();
 * client.subscribe(['MSFT', 'AAPL']);
 * ```
 */
export class TradeStationClient extends BaseBrokerClient {
  protected readonly brokerName = 'TradeStation';

  /** TradeStation OAuth access token */
  private accessToken: string;

  /** Connection state */
  private connected: boolean = false;

  /** Currently subscribed ticker symbols */
  private subscribedTickers: Set<string> = new Set();

  /** Currently subscribed option symbols */
  private subscribedOptions: Set<string> = new Set();

  /** Active AbortControllers for streams */
  private activeStreams: Map<string, AbortController> = new Map();

  /** TradeStation API base URL */
  private readonly apiBaseUrl: string = 'https://api.tradestation.com/v3';

  /** Whether to use simulation environment */
  private readonly simulation: boolean;

  /** Refresh token for token refresh */
  private refreshToken: string | null = null;

  /** Token refresh callback */
  private onTokenRefresh: ((newToken: string) => void) | null = null;

  /**
   * Creates a new TradeStationClient instance.
   * 
   * @param options - Client configuration options
   * @param options.accessToken - TradeStation OAuth access token (required)
   * @param options.refreshToken - OAuth refresh token for automatic token renewal
   * @param options.simulation - Whether to use simulation environment (default: false)
   * @param options.onTokenRefresh - Callback when token is refreshed
   * @param options.verbose - Whether to log verbose debug information (default: false)
   */
  constructor(options: TradeStationClientOptions) {
    super(options);
    this.accessToken = options.accessToken;
    this.refreshToken = options.refreshToken ?? null;
    this.simulation = options.simulation ?? false;
    this.onTokenRefresh = options.onTokenRefresh ?? null;
  }

  // ==================== Public API ====================

  /**
   * Establishes connection state for TradeStation streaming.
   * 
   * @returns Promise that resolves when ready to stream
   * @throws {Error} If token validation fails
   * 
   * @remarks
   * Unlike WebSocket-based clients, TradeStation uses HTTP streaming.
   * This method validates the access token by making a test API call.
   */
  async connect(): Promise<void> {
    try {
      // Validate token by making a simple API call
      const response = await fetch(`${this.apiBaseUrl}/brokerage/accounts`, {
        method: 'GET',
        headers: this.getAuthHeaders(),
      });

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('TradeStation authentication failed - invalid or expired token');
        }
        throw new Error(`TradeStation connection failed: ${response.statusText}`);
      }

      this.connected = true;
      this.reconnectAttempts = 0;
      if (this.verbose) {
        console.log('[TradeStation:HTTP] Connected to streaming API');
      }
      this.emit('connected', undefined);
    } catch (error) {
      this.emit('error', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * Disconnects from all TradeStation streaming APIs.
   */
  disconnect(): void {
    // Abort all active streams
    for (const [streamId, controller] of this.activeStreams) {
      controller.abort();
    }
    this.activeStreams.clear();

    this.connected = false;
    this.subscribedTickers.clear();
    this.subscribedOptions.clear();
    this.emit('disconnected', { reason: 'Client disconnect' });
  }

  /**
   * Subscribes to real-time updates for the specified symbols.
   * 
   * @param symbols - Array of ticker symbols and/or option symbols
   * 
   * @remarks
   * TradeStation uses different streaming endpoints for equities and options.
   * This method automatically routes symbols to the appropriate endpoint.
   * 
   * Option symbols can be in either:
   * - TradeStation format: "MSFT 220916C305"
   * - OCC format: "MSFT220916C00305000"
   */
  subscribe(symbols: string[]): void {
    const tickers: string[] = [];
    const options: string[] = [];

    for (const symbol of symbols) {
      if (this.isTradeStationOptionSymbol(symbol)) {
        options.push(symbol);
        this.subscribedOptions.add(symbol);
      } else {
        tickers.push(symbol);
        this.subscribedTickers.add(symbol);
      }
    }

    if (tickers.length > 0) {
      this.startQuoteStream(tickers);
    }

    if (options.length > 0) {
      this.startOptionQuoteStream(options);
    }
  }

  /**
   * Unsubscribes from real-time updates for the specified symbols.
   * 
   * @param symbols - Array of symbols to unsubscribe from
   * 
   * @remarks
   * For TradeStation, unsubscribing requires stopping the stream and
   * restarting with the remaining symbols.
   */
  unsubscribe(symbols: string[]): void {
    const tickersToRemove: string[] = [];
    const optionsToRemove: string[] = [];

    for (const symbol of symbols) {
      if (this.isTradeStationOptionSymbol(symbol)) {
        this.subscribedOptions.delete(symbol);
        optionsToRemove.push(symbol);
      } else {
        this.subscribedTickers.delete(symbol);
        tickersToRemove.push(symbol);
      }
    }

    // Restart streams with remaining symbols
    if (tickersToRemove.length > 0 && this.subscribedTickers.size > 0) {
      this.stopStream('quotes');
      this.startQuoteStream(Array.from(this.subscribedTickers));
    } else if (tickersToRemove.length > 0) {
      this.stopStream('quotes');
    }

    if (optionsToRemove.length > 0 && this.subscribedOptions.size > 0) {
      this.stopStream('options');
      this.startOptionQuoteStream(Array.from(this.subscribedOptions));
    } else if (optionsToRemove.length > 0) {
      this.stopStream('options');
    }
  }

  /**
   * Unsubscribes from all real-time updates.
   */
  unsubscribeFromAll(): void {
    this.subscribedTickers.clear();
    this.subscribedOptions.clear();
    this.stopStream('quotes');
    this.stopStream('options');
  }

  /**
   * Returns whether the client is currently connected.
   */
  isConnected(): boolean {
    return this.connected;
  }

  /**
   * Fetches quote snapshots for the specified symbols.
   * 
   * @param symbols - Array of symbols (max 100)
   * @returns Array of normalized tickers
   */
  async fetchQuotes(symbols: string[]): Promise<NormalizedTicker[]> {
    try {
      const symbolList = symbols.slice(0, 100).join(',');
      const url = `${this.apiBaseUrl}/marketdata/quotes/${encodeURIComponent(symbolList)}`;

      const response = await fetch(url, {
        method: 'GET',
        headers: this.getAuthHeaders(),
      });

      if (!response.ok) {
        this.emit('error', new Error(`Failed to fetch quotes: ${response.statusText}`));
        return [];
      }

      const data = await response.json() as TradeStationQuoteSnapshot;
      const tickers: NormalizedTicker[] = [];

      for (const quote of data.Quotes) {
        if (!quote.Error) {
          const ticker = this.normalizeQuote(quote);
          this.tickerCache.set(ticker.symbol, ticker);
          tickers.push(ticker);
        }
      }

      return tickers;
    } catch (error) {
      this.emit('error', error instanceof Error ? error : new Error(String(error)));
      return [];
    }
  }

  /**
   * Fetches option expirations for an underlying symbol.
   * 
   * @param underlying - Underlying symbol (e.g., 'AAPL')
   * @returns Array of expiration dates
   */
  async fetchOptionExpirations(underlying: string): Promise<string[]> {
    try {
      const url = `${this.apiBaseUrl}/marketdata/options/expirations/${encodeURIComponent(underlying)}`;

      const response = await fetch(url, {
        method: 'GET',
        headers: this.getAuthHeaders(),
      });

      if (!response.ok) {
        this.emit('error', new Error(`Failed to fetch option expirations: ${response.statusText}`));
        return [];
      }

      const data = await response.json() as TradeStationExpirationsResponse;
      return data.Expirations.map(exp => exp.Date);
    } catch (error) {
      this.emit('error', error instanceof Error ? error : new Error(String(error)));
      return [];
    }
  }

  /**
   * Streams option chain data for an underlying symbol.
   * 
   * @param underlying - Underlying symbol (e.g., 'AAPL')
   * @param options - Stream options
   * @returns Promise that resolves when stream is established
   */
  async streamOptionChain(
    underlying: string,
    options?: {
      expiration?: string;
      strikeProximity?: number;
      enableGreeks?: boolean;
      optionType?: 'All' | 'Call' | 'Put';
    }
  ): Promise<void> {
    const params = new URLSearchParams();
    if (options?.expiration) params.set('expiration', options.expiration);
    if (options?.strikeProximity) params.set('strikeProximity', options.strikeProximity.toString());
    if (options?.enableGreeks !== undefined) params.set('enableGreeks', options.enableGreeks.toString());
    if (options?.optionType) params.set('optionType', options.optionType);

    const url = `${this.apiBaseUrl}/marketdata/stream/options/chains/${encodeURIComponent(underlying)}?${params.toString()}`;
    const streamId = `chain_${underlying}`;

    await this.startHttpStream(streamId, url, (data: TradeStationOptionChainStream) => {
      this.handleOptionChainData(underlying, data);
    });
  }

  /**
   * Fetches symbol details for the specified symbols.
   * 
   * @param symbols - Array of symbols (max 50)
   * @returns Symbol details response
   */
  async fetchSymbolDetails(symbols: string[]): Promise<TradeStationSymbolDetails> {
    try {
      const symbolList = symbols.slice(0, 50).join(',');
      const url = `${this.apiBaseUrl}/marketdata/symbols/${encodeURIComponent(symbolList)}`;

      const response = await fetch(url, {
        method: 'GET',
        headers: this.getAuthHeaders(),
      });

      if (!response.ok) {
        this.emit('error', new Error(`Failed to fetch symbol details: ${response.statusText}`));
        return { Symbols: [], Errors: [] };
      }

      return await response.json() as TradeStationSymbolDetails;
    } catch (error) {
      this.emit('error', error instanceof Error ? error : new Error(String(error)));
      return { Symbols: [], Errors: [] };
    }
  }

  /**
   * Updates the access token (for token refresh scenarios).
   */
  updateAccessToken(newToken: string): void {
    this.accessToken = newToken;
  }

  /**
   * Fetches open interest and other static data for subscribed options.
   * 
   * @param occSymbols - Array of OCC option symbols to fetch data for
   * 
   * @remarks
   * TradeStation provides open interest via the streaming option quotes.
   * This method is a no-op placeholder to satisfy the abstract interface.
   * OI data will be populated automatically through the streaming connection.
   */
  async fetchOpenInterest(occSymbols: string[]): Promise<void> {
    // TradeStation provides OI through the option quote stream
    // The subscribedOptions will receive OI data automatically
    // This is a no-op to satisfy the abstract method requirement
    if (this.verbose) {
      console.log(`[TradeStation] fetchOpenInterest called for ${occSymbols.length} symbols - data comes via stream`);
    }
  }

  // ==================== Private Methods ====================

  /**
   * Gets authorization headers for API requests.
   */
  private getAuthHeaders(): Record<string, string> {
    return {
      'Authorization': `Bearer ${this.accessToken}`,
      'Accept': 'application/json',
    };
  }

  /**
   * Gets headers for streaming requests.
   */
  private getStreamHeaders(): Record<string, string> {
    return {
      'Authorization': `Bearer ${this.accessToken}`,
      'Accept': 'application/vnd.tradestation.streams.v2+json',
    };
  }

  /**
   * Starts a quote stream for ticker symbols.
   */
  private async startQuoteStream(symbols: string[]): Promise<void> {
    if (symbols.length === 0) return;

    const symbolList = symbols.slice(0, 100).join(',');
    const url = `${this.apiBaseUrl}/marketdata/stream/quotes/${encodeURIComponent(symbolList)}`;

    await this.startHttpStream('quotes', url, (data: TradeStationQuoteStream) => {
      this.handleQuoteData(data);
    });
  }

  /**
   * Starts an option quote stream.
   */
  private async startOptionQuoteStream(symbols: string[]): Promise<void> {
    if (symbols.length === 0) return;

    // TradeStation option streaming uses legs parameter
    // Build URL with legs for each option
    const params = new URLSearchParams();
    symbols.forEach((symbol, index) => {
      const tsSymbol = this.toTradeStationOptionSymbol(symbol);
      params.set(`legs[${index}].Symbol`, tsSymbol);
      params.set(`legs[${index}].Ratio`, '1');
    });
    params.set('enableGreeks', 'true');

    const url = `${this.apiBaseUrl}/marketdata/stream/options/quotes?${params.toString()}`;

    await this.startHttpStream('options', url, (data: TradeStationOptionQuoteStream) => {
      this.handleOptionQuoteData(data);
    });
  }

  /**
   * Starts an HTTP streaming connection.
   */
  private async startHttpStream<T>(
    streamId: string,
    url: string,
    onData: (data: T) => void
  ): Promise<void> {
    // Stop any existing stream with this ID
    this.stopStream(streamId);

    const controller = new AbortController();
    this.activeStreams.set(streamId, controller);

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: this.getStreamHeaders(),
        signal: controller.signal,
      });

      if (!response.ok) {
        if (response.status === 401) {
          this.emit('error', new Error('TradeStation stream authentication failed'));
          return;
        }
        this.emit('error', new Error(`TradeStation stream failed: ${response.statusText}`));
        return;
      }

      if (!response.body) {
        this.emit('error', new Error('TradeStation stream response has no body'));
        return;
      }

      // Process the stream
      this.processStream(streamId, response.body, onData);
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        // Stream was intentionally aborted
        return;
      }
      this.emit('error', error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Processes an HTTP chunked stream.
   */
  private async processStream<T>(
    streamId: string,
    body: ReadableStream<Uint8Array>,
    onData: (data: T) => void
  ): Promise<void> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          // Stream ended
          this.handleStreamEnd(streamId);
          break;
        }

        // Decode chunk and add to buffer
        buffer += decoder.decode(value, { stream: true });

        // Process complete JSON objects
        // TradeStation separates objects with newlines
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? ''; // Keep incomplete line in buffer

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;

          try {
            const data = JSON.parse(trimmed) as T;
            onData(data);
          } catch {
            // May be chunk boundary or malformed JSON, skip
          }
        }
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return;
      }
      this.emit('error', error instanceof Error ? error : new Error(String(error)));
      this.handleStreamEnd(streamId);
    } finally {
      reader.releaseLock();
    }
  }

  /**
   * Handles stream end/disconnect.
   */
  private handleStreamEnd(streamId: string): void {
    this.activeStreams.delete(streamId);
    
    if (this.activeStreams.size === 0) {
      this.emit('disconnected', { reason: 'All streams ended' });
    }
  }

  /**
   * Stops a stream by ID.
   */
  private stopStream(streamId: string): void {
    const controller = this.activeStreams.get(streamId);
    if (controller) {
      controller.abort();
      this.activeStreams.delete(streamId);
    }
  }

  /**
   * Handles incoming quote stream data.
   */
  private handleQuoteData(data: TradeStationQuoteStream): void {
    // Check for stream status
    if ((data as any).StreamStatus) {
      if ((data as any).StreamStatus === 'GoAway') {
        // Server is terminating stream, need to reconnect
        this.handleStreamGoAway('quotes');
      }
      return;
    }

    // Check for errors
    if (data.Error) {
      this.emit('error', new Error(`TradeStation quote error: ${data.Error}`));
      return;
    }

    if (!data.Symbol) return;

    const ticker = this.normalizeQuote(data);
    this.tickerCache.set(ticker.symbol, ticker);
    this.emit('tickerUpdate', ticker);
  }

  /**
   * Handles incoming option quote stream data.
   */
  private handleOptionQuoteData(data: TradeStationOptionQuoteStream): void {
    // Check for stream status
    if (data.StreamStatus) {
      if (data.StreamStatus === 'GoAway') {
        this.handleStreamGoAway('options');
      }
      return;
    }

    if (data.Error) {
      this.emit('error', new Error(`TradeStation option error: ${data.Error}`));
      return;
    }

    if (!data.Legs || data.Legs.length === 0) return;

    // Process each leg
    for (const leg of data.Legs) {
      if (!leg.Symbol) continue;
      
      const option = this.normalizeOptionQuote(data, leg);
      if (option) {
        this.optionCache.set(option.occSymbol, option);
        this.emit('optionUpdate', option);
      }
    }
  }

  /**
   * Handles option chain stream data.
   */
  private handleOptionChainData(underlying: string, data: TradeStationOptionChainStream): void {
    if (data.StreamStatus) {
      if (data.StreamStatus === 'GoAway') {
        this.handleStreamGoAway(`chain_${underlying}`);
      }
      return;
    }

    if (data.Error) {
      this.emit('error', new Error(`TradeStation chain error: ${data.Error}`));
      return;
    }

    if (!data.Legs || data.Legs.length === 0) return;

    for (const leg of data.Legs) {
      if (!leg.Symbol) continue;

      const option = this.normalizeOptionQuote(data, leg);
      if (option) {
        // Store base OI
        if (leg.OpenInterest !== undefined) {
          this.baseOpenInterest.set(option.occSymbol, leg.OpenInterest);
          
          if (this.verbose) {
            console.log(`[TradeStation:OI] Base OI set for ${option.occSymbol}: ${leg.OpenInterest}`);
          }
        }
        if (!this.cumulativeOIChange.has(option.occSymbol)) {
          this.cumulativeOIChange.set(option.occSymbol, 0);
        }

        this.optionCache.set(option.occSymbol, option);
        this.emit('optionUpdate', option);
      }
    }
  }

  /**
   * Handles GoAway stream status - server is terminating stream.
   */
  private handleStreamGoAway(streamId: string): void {
    // Remove the stream and attempt to restart after a delay
    this.stopStream(streamId);

    setTimeout(() => {
      if (!this.connected) return;

      if (streamId === 'quotes' && this.subscribedTickers.size > 0) {
        this.startQuoteStream(Array.from(this.subscribedTickers));
      } else if (streamId === 'options' && this.subscribedOptions.size > 0) {
        this.startOptionQuoteStream(Array.from(this.subscribedOptions));
      } else if (streamId.startsWith('chain_')) {
        const underlying = streamId.replace('chain_', '');
        this.streamOptionChain(underlying);
      }
    }, this.baseReconnectDelay);
  }

  /**
   * Normalizes TradeStation quote to NormalizedTicker.
   */
  private normalizeQuote(quote: TradeStationQuoteStream): NormalizedTicker {
    const bid = this.toNumber(quote.Bid);
    const ask = this.toNumber(quote.Ask);
    const last = this.toNumber(quote.Last);

    return {
      symbol: quote.Symbol,
      spot: bid > 0 && ask > 0 ? (bid + ask) / 2 : last,
      bid,
      bidSize: this.toNumber(quote.BidSize),
      ask,
      askSize: this.toNumber(quote.AskSize),
      last,
      volume: this.toNumber(quote.Volume),
      timestamp: quote.TradeTime ? new Date(quote.TradeTime).getTime() : Date.now(),
    };
  }

  /**
   * Normalizes TradeStation option quote to NormalizedOption.
   */
  private normalizeOptionQuote(
    data: TradeStationOptionQuoteStream | TradeStationOptionChainStream,
    leg: TradeStationOptionLeg
  ): NormalizedOption | null {
    // Convert TradeStation symbol to OCC format
    const occSymbol = this.toOCCSymbol(leg.Symbol);
    if (!occSymbol) return null;

    // Parse OCC symbol for details
    let parsed: { symbol: string; expiration: Date; optionType: OptionType; strike: number };
    try {
      parsed = parseOCCSymbol(occSymbol);
    } catch {
      // Try to extract from leg data
      if (!leg.Underlying || !leg.ExpirationDate || !leg.StrikePrice || !leg.OptionType) {
        return null;
      }
      parsed = {
        symbol: leg.Underlying,
        expiration: new Date(leg.ExpirationDate),
        optionType: leg.OptionType.toLowerCase() as OptionType,
        strike: parseFloat(leg.StrikePrice),
      };
    }

    const bid = this.toNumber(data.Bid);
    const ask = this.toNumber(data.Ask);
    const last = this.toNumber(data.Last);
    const existingOI = this.baseOpenInterest.get(occSymbol) ?? 0;

    return {
      occSymbol,
      underlying: leg.Underlying ?? parsed.symbol,
      strike: parseFloat(leg.StrikePrice ?? parsed.strike.toString()),
      expiration: leg.ExpirationDate ?? parsed.expiration.toISOString().split('T')[0],
      expirationTimestamp: parsed.expiration.getTime(),
      optionType: (leg.OptionType?.toLowerCase() ?? parsed.optionType) as OptionType,
      bid,
      bidSize: data.BidSize ?? 0,
      ask,
      askSize: data.AskSize ?? 0,
      mark: bid > 0 && ask > 0 ? (bid + ask) / 2 : last,
      last,
      volume: data.Volume ?? 0,
      openInterest: data.DailyOpenInterest ?? leg.OpenInterest ?? existingOI,
      liveOpenInterest: this.calculateLiveOpenInterest(occSymbol),
      impliedVolatility: this.toNumber(data.ImpliedVolatility),
      timestamp: Date.now(),
    };
  }

  /**
   * Converts TradeStation option symbol to OCC format.
   * TradeStation format: "MSFT 220916C305" or "MSFT 220916C305.00"
   * OCC format: "MSFT220916C00305000"
   */
  private toOCCSymbol(tsSymbol: string): string | null {
    if (!tsSymbol) return null;

    // Already in OCC format?
    if (OCC_OPTION_PATTERN.test(tsSymbol.replace(/\s+/g, ''))) {
      return tsSymbol.replace(/\s+/g, '');
    }

    // Parse TradeStation format
    const match = tsSymbol.match(/^([A-Z]+)\s+(\d{6})([CP])(\d+(?:\.\d+)?)$/);
    if (!match) return null;

    const [, root, dateStr, optType, strikeStr] = match;
    const strike = parseFloat(strikeStr);
    const strikeFormatted = Math.round(strike * 1000).toString().padStart(8, '0');

    return `${root}${dateStr}${optType}${strikeFormatted}`;
  }

  /**
   * Converts OCC symbol to TradeStation format.
   * OCC format: "MSFT220916C00305000"
   * TradeStation format: "MSFT 220916C305"
   */
  private toTradeStationOptionSymbol(symbol: string): string {
    // If already in TradeStation format, return as-is
    if (TS_OPTION_PATTERN.test(symbol)) {
      return symbol;
    }

    // Parse OCC format
    try {
      const parsed = parseOCCSymbol(symbol);
      const dateStr = [
        parsed.expiration.getFullYear().toString().slice(-2),
        (parsed.expiration.getMonth() + 1).toString().padStart(2, '0'),
        parsed.expiration.getDate().toString().padStart(2, '0'),
      ].join('');
      const optType = parsed.optionType === 'call' ? 'C' : 'P';
      
      // Format strike - remove trailing zeros
      let strikeStr = parsed.strike.toString();
      if (parsed.strike % 1 === 0) {
        strikeStr = parsed.strike.toFixed(0);
      }

      return `${parsed.symbol} ${dateStr}${optType}${strikeStr}`;
    } catch {
      return symbol;
    }
  }

  /**
   * Checks if a symbol is an option symbol (TradeStation or OCC format).
   */
  private isTradeStationOptionSymbol(symbol: string): boolean {
    return TS_OPTION_PATTERN.test(symbol) || OCC_OPTION_PATTERN.test(symbol);
  }
}
