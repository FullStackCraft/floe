import { NormalizedOption, NormalizedTicker, OptionType } from '../../types';
import { getUnderlyingFromOptionRoot } from '../../utils/indexOptions';
import { parseOCCSymbol, buildOCCSymbol } from '../../utils/occ';
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
export type IBKRClientEventType = BrokerClientEventType;
export type IBKREventListener<T> = BrokerEventListener<T>;

// ==================== IBKR Market Data Field Tags ====================
// Reference: https://www.interactivebrokers.com/campus/ibkr-api-page/webapi-ref/#tag/Market-Data

/**
 * IBKR market data field tags for snapshot and streaming requests
 */
export const IBKR_FIELD_TAGS = {
  // Price fields
  LAST_PRICE: '31',
  BID_PRICE: '84',
  BID_SIZE: '85',
  ASK_PRICE: '86',
  ASK_SIZE: '88',
  
  // Volume fields
  VOLUME: '7059',
  VOLUME_LONG: '7762',
  
  // Option-specific fields
  OPEN_INTEREST: '7089',
  IMPLIED_VOLATILITY: '7283',
  IMPLIED_VOLATILITY_PERCENT: '7284',
  DELTA: '7308',
  GAMMA: '7309',
  THETA: '7310',
  VEGA: '7311',
  
  // Time and sales
  LAST_SIZE: '32',
  LAST_TIMESTAMP: '7295',
  
  // Additional fields
  OPEN: '7296',
  HIGH: '7297',
  LOW: '7298',
  CLOSE: '7299',
  CHANGE: '82',
  CHANGE_PERCENT: '83',
  
  // Contract info
  UNDERLYING_CONID: '6457',
  CONTRACT_DESC: '6509',
  
  // Mark/Mid
  MARK: '7219',
} as const;

// ==================== IBKR Types ====================

/**
 * IBKR contract information returned from search endpoints
 */
export interface IBKRContract {
  conid: number;
  symbol: string;
  secType: string;
  exchange: string;
  listingExchange: string | null;
  right?: 'C' | 'P';
  strike?: number;
  currency: string;
  maturityDate?: string;
  multiplier?: string;
  tradingClass?: string;
  validExchanges?: string;
  desc1?: string;
  desc2?: string;
}

/**
 * IBKR security definition search response
 */
export interface IBKRSecDefSearchResult {
  conid: string;
  companyHeader?: string;
  companyName: string;
  symbol: string;
  description: string;
  sections: Array<{
    secType: string;
    months?: string;
    exchange?: string;
  }>;
}

/**
 * IBKR market data snapshot response
 */
export interface IBKRMarketDataSnapshot {
  conid: number;
  conidEx: string;
  _updated?: number;
  server_id?: string;
  [key: string]: string | number | undefined;
}

/**
 * IBKR WebSocket message types
 */
type IBKRWSMessageType = 
  | 'sts' // Status
  | 'blt' // Bulletin
  | 'ntf' // Notification
  | 'system' // System message
  | 'tic' // Ticker update
  | 'smd' // Streaming market data
  | 'smh' // Streaming market history
  | 'act' // Account update
  | 'ord' // Order update
  | 'error'; // Error

/**
 * IBKR WebSocket market data message
 */
interface IBKRWSMarketDataMessage {
  topic: string;
  conid: number;
  conidEx?: string;
  _updated?: number;
  [key: string]: string | number | undefined;
}

/**
 * IBKR option chain info from REST API
 */
interface IBKROptionInfo {
  conid: number;
  symbol: string;
  secType: string;
  exchange: string;
  right: 'C' | 'P';
  strike: number;
  currency: string;
  maturityDate: string;
  multiplier: string;
  tradingClass: string;
  desc1: string;
  desc2: string;
}

/**
 * IBKR client configuration options
 */
export interface IBKRClientOptions extends BaseBrokerClientOptions {
  /**
   * Base URL for the IBKR API
   * For Client Portal Gateway: 'https://localhost:5000/v1/api'
   * For OAuth/Direct: 'https://api.ibkr.com/v1/api'
   */
  baseUrl: string;
  
  /**
   * OAuth access token (if using OAuth authentication)
   */
  accessToken?: string;
  
  /**
   * Account ID for trading operations
   */
  accountId?: string;
  
  /**
   * Whether to skip SSL certificate validation (for local gateway)
   * @default false
   */
  rejectUnauthorized?: boolean;
}

/**
 * IBKRClient handles real-time streaming connections to the Interactive Brokers Web API.
 * 
 * @remarks
 * This client manages WebSocket connections to IBKR's streaming API,
 * normalizes incoming quote and trade data, and emits events for upstream
 * consumption by the FloeClient.
 * 
 * IBKR uses contract IDs (conids) to identify instruments. This client maintains
 * a mapping between OCC option symbols and IBKR conids for seamless integration.
 * 
 * @example
 * ```typescript
 * // Using Client Portal Gateway (local)
 * const client = new IBKRClient({
 *   baseUrl: 'https://localhost:5000/v1/api',
 *   rejectUnauthorized: false
 * });
 * 
 * // Using OAuth (direct API)
 * const client = new IBKRClient({
 *   baseUrl: 'https://api.ibkr.com/v1/api',
 *   accessToken: 'your-oauth-token'
 * });
 * 
 * client.on('tickerUpdate', (ticker) => {
 *   console.log(`${ticker.symbol}: ${ticker.spot}`);
 * });
 * 
 * await client.connect();
 * client.subscribe(['QQQ', 'AAPL240119C00500000']);
 * ```
 */
export class IBKRClient extends BaseBrokerClient {
  protected readonly brokerName = 'IBKR';

  /** Base URL for REST API calls */
  private readonly baseUrl: string;

  /** OAuth access token */
  private accessToken?: string;

  /** Account ID for trading */
  private accountId?: string;

  /** Whether to reject unauthorized SSL certificates */
  private readonly rejectUnauthorized: boolean;

  /** WebSocket connection */
  private ws: WebSocket | null = null;

  /** Connection state */
  private connected: boolean = false;

  /** 
   * Mapping from OCC symbol to IBKR conid
   * This is populated as options are discovered/subscribed
   */
  private occToConid: Map<string, number> = new Map();

  /** 
   * Mapping from IBKR conid to OCC symbol (reverse lookup)
   */
  private conidToOcc: Map<number, string> = new Map();

  /**
   * Mapping from ticker symbol to IBKR conid (for underlyings)
   */
  private symbolToConid: Map<string, number> = new Map();

  /**
   * Mapping from conid to ticker symbol (reverse lookup for underlyings)
   */
  private conidToSymbol: Map<number, string> = new Map();

  /**
   * Set of conids that have been "primed" for market data
   * (IBKR requires a pre-flight request before streaming)
   */
  private primedConids: Set<number> = new Set();

  /**
   * Creates a new IBKRClient instance.
   * 
   * @param options - Client configuration options
   */
  constructor(options: IBKRClientOptions) {
    super(options);
    this.baseUrl = options.baseUrl.replace(/\/$/, ''); // Remove trailing slash
    this.accessToken = options.accessToken;
    this.accountId = options.accountId;
    this.rejectUnauthorized = options.rejectUnauthorized ?? true;
  }

  // ==================== Public API ====================

  /**
   * Establishes a connection to IBKR.
   * 
   * @returns Promise that resolves when connected
   * @throws {Error} If connection fails
   */
  async connect(): Promise<void> {
    // First, validate the brokerage session
    await this.validateSession();

    // Connect WebSocket for streaming
    await this.connectWebSocket();
  }

  /**
   * Disconnects from the IBKR API.
   */
  disconnect(): void {
    if (this.ws) {
      this.ws.close(1000, 'Client disconnect');
      this.ws = null;
    }
    this.connected = false;
    this.subscribedSymbols.clear();
    this.primedConids.clear();
  }

  /**
   * Subscribes to real-time updates for the specified symbols.
   * 
   * @param symbols - Array of ticker symbols and/or OCC option symbols
   */
  async subscribe(symbols: string[]): Promise<void> {
    // Separate options from underlyings
    const optionSymbols = symbols.filter(s => this.isOptionSymbol(s));
    const tickerSymbols = symbols.filter(s => !this.isOptionSymbol(s));

    // Resolve conids for all symbols
    await this.resolveConids([...tickerSymbols], [...optionSymbols]);

    // Add to tracked symbols
    symbols.forEach(s => this.subscribedSymbols.add(s));

    if (!this.connected || !this.ws) {
      // Symbols queued for subscription when connected
      return;
    }

    // Prime market data for all conids (IBKR requires this)
    await this.primeMarketData(symbols);

    // Subscribe via WebSocket
    for (const symbol of symbols) {
      const conid = this.getConidForSymbol(symbol);
      if (conid) {
        this.subscribeToConid(conid);
      }
    }
  }

  /**
   * Unsubscribes from real-time updates for the specified symbols.
   * 
   * @param symbols - Array of symbols to unsubscribe from
   */
  unsubscribe(symbols: string[]): void {
    symbols.forEach(s => this.subscribedSymbols.delete(s));

    if (!this.connected || !this.ws) {
      return;
    }

    for (const symbol of symbols) {
      const conid = this.getConidForSymbol(symbol);
      if (conid) {
        this.unsubscribeFromConid(conid);
      }
    }
  }

  /**
   * Unsubscribes from all symbols.
   */
  unsubscribeFromAll(): void {
    const symbols = Array.from(this.subscribedSymbols);
    this.unsubscribe(symbols);
  }

  /**
   * Returns whether the client is currently connected.
   */
  isConnected(): boolean {
    return this.connected;
  }

  /**
   * Fetches open interest and other static data for subscribed options via REST API.
   * 
   * @param occSymbols - Array of OCC option symbols to fetch data for
   * @returns Promise that resolves when all data is fetched
   */
  async fetchOpenInterest(occSymbols: string[]): Promise<void> {
    // For IBKR, we need to fetch market data snapshots to get open interest
    const conids: number[] = [];
    
    for (const occSymbol of occSymbols) {
      const conid = this.occToConid.get(occSymbol);
      if (conid) {
        conids.push(conid);
      } else {
        // Try to resolve the conid first
        await this.resolveOptionConid(occSymbol);
        const resolvedConid = this.occToConid.get(occSymbol);
        if (resolvedConid) {
          conids.push(resolvedConid);
        }
      }
    }

    if (conids.length === 0) return;

    // Fetch market data snapshots with open interest field
    const fields = [
      IBKR_FIELD_TAGS.BID_PRICE,
      IBKR_FIELD_TAGS.BID_SIZE,
      IBKR_FIELD_TAGS.ASK_PRICE,
      IBKR_FIELD_TAGS.ASK_SIZE,
      IBKR_FIELD_TAGS.LAST_PRICE,
      IBKR_FIELD_TAGS.VOLUME,
      IBKR_FIELD_TAGS.OPEN_INTEREST,
      IBKR_FIELD_TAGS.IMPLIED_VOLATILITY,
    ];

    // Prime and fetch in batches (IBKR has limits)
    const batchSize = 50;
    for (let i = 0; i < conids.length; i += batchSize) {
      const batch = conids.slice(i, i + batchSize);
      
      // Prime first
      await this.primeMarketDataByConids(batch, fields);
      
      // Wait a moment for data to be ready
      await this.sleep(250);
      
      // Fetch snapshots
      const snapshots = await this.fetchMarketDataSnapshots(batch, fields);
      
      // Process snapshots
      for (const snapshot of snapshots) {
        this.processOptionSnapshot(snapshot);
      }
    }
  }

  /**
   * Fetches options chain data for a given underlying.
   * 
   * @param underlying - Underlying symbol (e.g., 'QQQ')
   * @param expiration - Expiration date in YYYY-MM-DD format
   * @returns Array of option contract info
   */
  async fetchOptionsChain(
    underlying: string,
    expiration: string
  ): Promise<IBKROptionInfo[]> {
    try {
      // Step 1: Get underlying conid and available months
      const underlyingConid = await this.resolveUnderlyingConid(underlying);
      if (!underlyingConid) {
        this.log(`Could not resolve conid for ${underlying}`);
        return [];
      }

      // Convert expiration to MMMYY format (e.g., "2024-01-19" -> "JAN24")
      const expDate = new Date(expiration + 'T12:00:00');
      const monthNames = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 
                          'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
      const month = `${monthNames[expDate.getMonth()]}${expDate.getFullYear().toString().slice(-2)}`;

      // Step 2: Get valid strikes
      const strikesResponse = await this.makeRequest<{ call: number[]; put: number[] }>(
        `/iserver/secdef/strikes?conid=${underlyingConid}&sectype=OPT&month=${month}&exchange=SMART`
      );

      if (!strikesResponse || !strikesResponse.call) {
        this.log(`No strikes found for ${underlying} ${expiration}`);
        return [];
      }

      const allStrikes = Array.from(new Set([...strikesResponse.call, ...strikesResponse.put]));
      
      // Step 3: Fetch option contracts for each strike (batched)
      const allOptions: IBKROptionInfo[] = [];
      
      for (const strike of allStrikes) {
        const options = await this.makeRequest<IBKROptionInfo[]>(
          `/iserver/secdef/info?conid=${underlyingConid}&sectype=OPT&month=${month}&strike=${strike}&exchange=SMART`
        );

        if (options && Array.isArray(options)) {
          // Filter to exact expiration date
          const filteredOptions = options.filter(opt => {
            if (!opt.maturityDate) return false;
            // maturityDate format: YYYYMMDD
            const optExpDate = opt.maturityDate;
            const targetExpDate = expiration.replace(/-/g, '');
            return optExpDate === targetExpDate;
          });

          for (const opt of filteredOptions) {
            allOptions.push(opt);
            
            // Build and store OCC symbol mapping
            const occSymbol = this.ibkrOptionToOCC(opt);
            if (occSymbol) {
              this.occToConid.set(occSymbol, opt.conid);
              this.conidToOcc.set(opt.conid, occSymbol);
            }
          }
        }
      }

      return allOptions;
    } catch (error) {
      this.emit('error', error instanceof Error ? error : new Error(String(error)));
      return [];
    }
  }

  /**
   * Resolves an OCC option symbol to an IBKR conid.
   * 
   * @param occSymbol - OCC option symbol
   * @returns The IBKR conid, or null if not found
   */
  async resolveOptionConid(occSymbol: string): Promise<number | null> {
    // Check cache first
    const cached = this.occToConid.get(occSymbol);
    if (cached) return cached;

    try {
      // Parse the OCC symbol
      const parsed = parseOCCSymbol(occSymbol);
      const underlying = getUnderlyingFromOptionRoot(parsed.symbol);
      const expiration = parsed.expiration.toISOString().split('T')[0];

      // Fetch the options chain for this expiration
      await this.fetchOptionsChain(underlying, expiration);

      // Check if we found it
      return this.occToConid.get(occSymbol) ?? null;
    } catch (error) {
      this.log(`Failed to resolve conid for ${occSymbol}: ${error}`);
      return null;
    }
  }

  /**
   * Resolves an underlying symbol to an IBKR conid.
   * 
   * @param symbol - Ticker symbol
   * @returns The IBKR conid, or null if not found
   */
  async resolveUnderlyingConid(symbol: string): Promise<number | null> {
    // Check cache first
    const cached = this.symbolToConid.get(symbol);
    if (cached) return cached;

    try {
      // Search for the symbol
      const results = await this.makeRequest<IBKRSecDefSearchResult[]>(
        `/iserver/secdef/search?symbol=${encodeURIComponent(symbol)}&secType=STK`
      );

      if (!results || results.length === 0) {
        // Try as index
        const indexResults = await this.makeRequest<IBKRSecDefSearchResult[]>(
          `/iserver/secdef/search?symbol=${encodeURIComponent(symbol)}&secType=IND`
        );

        if (!indexResults || indexResults.length === 0) {
          this.log(`No results found for symbol ${symbol}`);
          return null;
        }

        // Use the first matching result
        const conid = parseInt(indexResults[0].conid, 10);
        this.symbolToConid.set(symbol, conid);
        this.conidToSymbol.set(conid, symbol);
        return conid;
      }

      // Find the US-listed version (or first result)
      const conid = parseInt(results[0].conid, 10);
      this.symbolToConid.set(symbol, conid);
      this.conidToSymbol.set(conid, symbol);
      return conid;
    } catch (error) {
      this.log(`Failed to resolve conid for ${symbol}: ${error}`);
      return null;
    }
  }

  // ==================== Private Methods ====================

  /**
   * Validates the brokerage session with IBKR.
   */
  private async validateSession(): Promise<void> {
    try {
      const response = await this.makeRequest<{ validated: boolean }>('/sso/validate');
      if (!response?.validated) {
        throw new Error('IBKR session not validated. Please ensure you are logged in.');
      }
      this.log('Session validated');
    } catch (error) {
      throw new Error(`Failed to validate IBKR session: ${error}`);
    }
  }

  /**
   * Connects to the IBKR WebSocket for streaming data.
   */
  private connectWebSocket(): Promise<void> {
    return new Promise((resolve, reject) => {
      // Derive WebSocket URL from REST API URL
      const wsUrl = this.baseUrl
        .replace('https://', 'wss://')
        .replace('http://', 'ws://')
        .replace('/v1/api', '/v1/api/ws');

      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        this.connected = true;
        this.reconnectAttempts = 0;
        this.log('WebSocket connected');
        this.emit('connected', undefined);

        // Subscribe to any queued symbols
        if (this.subscribedSymbols.size > 0) {
          this.subscribe(Array.from(this.subscribedSymbols));
        }

        resolve();
      };

      this.ws.onmessage = (event) => {
        this.handleWebSocketMessage(event.data);
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
   * Handles incoming WebSocket messages.
   */
  private handleWebSocketMessage(data: string): void {
    try {
      const message = JSON.parse(data);

      // Check message type from topic
      if (message.topic?.startsWith('smd+')) {
        this.handleMarketDataMessage(message as IBKRWSMarketDataMessage);
      } else if (message.topic === 'sts') {
        // Status message
        this.log(`Status: ${JSON.stringify(message)}`);
      } else if (message.topic === 'system') {
        // System message
        this.log(`System: ${JSON.stringify(message)}`);
      }
    } catch (error) {
      // Ignore parse errors for heartbeat/status messages
    }
  }

  /**
   * Handles streaming market data messages.
   */
  private handleMarketDataMessage(message: IBKRWSMarketDataMessage): void {
    const conid = message.conid;
    const timestamp = message._updated ?? Date.now();

    // Determine if this is an option or underlying
    const occSymbol = this.conidToOcc.get(conid);
    const tickerSymbol = this.conidToSymbol.get(conid);

    if (occSymbol) {
      this.updateOptionFromWSMessage(occSymbol, message, timestamp);
    } else if (tickerSymbol) {
      this.updateTickerFromWSMessage(tickerSymbol, message, timestamp);
    }
  }

  /**
   * Updates option data from a WebSocket message.
   */
  private updateOptionFromWSMessage(
    occSymbol: string,
    message: IBKRWSMarketDataMessage,
    timestamp: number
  ): void {
    const bid = this.toNumber(message[IBKR_FIELD_TAGS.BID_PRICE]);
    const bidSize = this.toNumber(message[IBKR_FIELD_TAGS.BID_SIZE]);
    const ask = this.toNumber(message[IBKR_FIELD_TAGS.ASK_PRICE]);
    const askSize = this.toNumber(message[IBKR_FIELD_TAGS.ASK_SIZE]);
    const last = this.toNumber(message[IBKR_FIELD_TAGS.LAST_PRICE]);
    const volume = this.toNumber(message[IBKR_FIELD_TAGS.VOLUME]);
    const openInterest = this.toNumber(message[IBKR_FIELD_TAGS.OPEN_INTEREST]);
    const iv = this.toNumber(message[IBKR_FIELD_TAGS.IMPLIED_VOLATILITY]);

    // Check if this is a trade update (has last price and last size)
    const lastSize = this.toNumber(message[IBKR_FIELD_TAGS.LAST_SIZE]);
    const isTradeUpdate = lastSize > 0 && last > 0;

    if (isTradeUpdate && bid > 0 && ask > 0) {
      // Record the trade for OI tracking
      this.recordTrade(occSymbol, last, lastSize, bid, ask, timestamp);
    }

    const existing = this.optionCache.get(occSymbol);

    let parsed: { symbol: string; expiration: Date; optionType: OptionType; strike: number };
    try {
      parsed = parseOCCSymbol(occSymbol);
    } catch {
      if (!existing) return;
      parsed = {
        symbol: existing.underlying,
        expiration: new Date(existing.expirationTimestamp),
        optionType: existing.optionType,
        strike: existing.strike,
      };
    }

    // Set base open interest if we have it and haven't set it yet
    if (openInterest > 0) {
      this.setBaseOpenInterest(occSymbol, openInterest);
    }

    const option: NormalizedOption = {
      occSymbol,
      underlying: parsed.symbol,
      strike: parsed.strike,
      expiration: parsed.expiration.toISOString().split('T')[0],
      expirationTimestamp: parsed.expiration.getTime(),
      optionType: parsed.optionType,
      bid: bid || existing?.bid || 0,
      bidSize: bidSize || existing?.bidSize || 0,
      ask: ask || existing?.ask || 0,
      askSize: askSize || existing?.askSize || 0,
      mark: (bid && ask) ? (bid + ask) / 2 : existing?.mark || 0,
      last: last || existing?.last || 0,
      volume: volume || existing?.volume || 0,
      openInterest: openInterest || existing?.openInterest || 0,
      liveOpenInterest: this.calculateLiveOpenInterest(occSymbol),
      impliedVolatility: iv || existing?.impliedVolatility || 0,
      timestamp,
    };

    this.optionCache.set(occSymbol, option);
    this.emit('optionUpdate', option);
  }

  /**
   * Updates ticker data from a WebSocket message.
   */
  private updateTickerFromWSMessage(
    symbol: string,
    message: IBKRWSMarketDataMessage,
    timestamp: number
  ): void {
    const existing = this.tickerCache.get(symbol);

    const bid = this.toNumber(message[IBKR_FIELD_TAGS.BID_PRICE]);
    const bidSize = this.toNumber(message[IBKR_FIELD_TAGS.BID_SIZE]);
    const ask = this.toNumber(message[IBKR_FIELD_TAGS.ASK_PRICE]);
    const askSize = this.toNumber(message[IBKR_FIELD_TAGS.ASK_SIZE]);
    const last = this.toNumber(message[IBKR_FIELD_TAGS.LAST_PRICE]);
    const volume = this.toNumber(message[IBKR_FIELD_TAGS.VOLUME]);

    const ticker: NormalizedTicker = {
      symbol,
      spot: (bid && ask) ? (bid + ask) / 2 : last || existing?.spot || 0,
      bid: bid || existing?.bid || 0,
      bidSize: bidSize || existing?.bidSize || 0,
      ask: ask || existing?.ask || 0,
      askSize: askSize || existing?.askSize || 0,
      last: last || existing?.last || 0,
      volume: volume || existing?.volume || 0,
      timestamp,
    };

    this.tickerCache.set(symbol, ticker);
    this.emit('tickerUpdate', ticker);
  }

  /**
   * Processes an option snapshot response.
   */
  private processOptionSnapshot(snapshot: IBKRMarketDataSnapshot): void {
    const conid = snapshot.conid;
    const occSymbol = this.conidToOcc.get(conid);
    if (!occSymbol) return;

    const timestamp = snapshot._updated ?? Date.now();

    const openInterest = this.toNumber(snapshot[IBKR_FIELD_TAGS.OPEN_INTEREST]);
    const iv = this.toNumber(snapshot[IBKR_FIELD_TAGS.IMPLIED_VOLATILITY]);
    const bid = this.toNumber(snapshot[IBKR_FIELD_TAGS.BID_PRICE]);
    const bidSize = this.toNumber(snapshot[IBKR_FIELD_TAGS.BID_SIZE]);
    const ask = this.toNumber(snapshot[IBKR_FIELD_TAGS.ASK_PRICE]);
    const askSize = this.toNumber(snapshot[IBKR_FIELD_TAGS.ASK_SIZE]);
    const last = this.toNumber(snapshot[IBKR_FIELD_TAGS.LAST_PRICE]);
    const volume = this.toNumber(snapshot[IBKR_FIELD_TAGS.VOLUME]);

    // Set base open interest for live OI tracking
    if (openInterest > 0) {
      this.setBaseOpenInterest(occSymbol, openInterest);
    }

    const existing = this.optionCache.get(occSymbol);

    let parsed: { symbol: string; expiration: Date; optionType: OptionType; strike: number };
    try {
      parsed = parseOCCSymbol(occSymbol);
    } catch {
      if (!existing) return;
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
      bid: bid || existing?.bid || 0,
      bidSize: bidSize || existing?.bidSize || 0,
      ask: ask || existing?.ask || 0,
      askSize: askSize || existing?.askSize || 0,
      mark: (bid && ask) ? (bid + ask) / 2 : existing?.mark || 0,
      last: last || existing?.last || 0,
      volume: volume || existing?.volume || 0,
      openInterest: openInterest || existing?.openInterest || 0,
      liveOpenInterest: this.calculateLiveOpenInterest(occSymbol),
      impliedVolatility: iv || existing?.impliedVolatility || 0,
      timestamp,
    };

    this.optionCache.set(occSymbol, option);
    this.emit('optionUpdate', option);
  }

  /**
   * Sends a subscription message for a conid.
   */
  private subscribeToConid(conid: number): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    const fields = [
      IBKR_FIELD_TAGS.LAST_PRICE,
      IBKR_FIELD_TAGS.BID_PRICE,
      IBKR_FIELD_TAGS.BID_SIZE,
      IBKR_FIELD_TAGS.ASK_PRICE,
      IBKR_FIELD_TAGS.ASK_SIZE,
      IBKR_FIELD_TAGS.VOLUME,
      IBKR_FIELD_TAGS.OPEN_INTEREST,
      IBKR_FIELD_TAGS.IMPLIED_VOLATILITY,
      IBKR_FIELD_TAGS.LAST_SIZE,
    ];

    const message = `smd+${conid}+${JSON.stringify({ fields })}`;
    this.ws.send(message);
    this.log(`Subscribed to conid ${conid}`);
  }

  /**
   * Sends an unsubscription message for a conid.
   */
  private unsubscribeFromConid(conid: number): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    const message = `umd+${conid}+{}`;
    this.ws.send(message);
    this.log(`Unsubscribed from conid ${conid}`);
  }

  /**
   * Primes market data for the given symbols.
   * IBKR requires a "pre-flight" snapshot request before streaming works.
   */
  private async primeMarketData(symbols: string[]): Promise<void> {
    const conids: number[] = [];

    for (const symbol of symbols) {
      const conid = this.getConidForSymbol(symbol);
      if (conid && !this.primedConids.has(conid)) {
        conids.push(conid);
      }
    }

    if (conids.length === 0) return;

    await this.primeMarketDataByConids(conids);
  }

  /**
   * Primes market data for specific conids.
   */
  private async primeMarketDataByConids(
    conids: number[],
    fields?: string[]
  ): Promise<void> {
    const fieldsToUse = fields ?? [
      IBKR_FIELD_TAGS.LAST_PRICE,
      IBKR_FIELD_TAGS.BID_PRICE,
      IBKR_FIELD_TAGS.BID_SIZE,
      IBKR_FIELD_TAGS.ASK_PRICE,
      IBKR_FIELD_TAGS.ASK_SIZE,
      IBKR_FIELD_TAGS.VOLUME,
    ];

    try {
      await this.makeRequest(
        `/iserver/marketdata/snapshot?conids=${conids.join(',')}&fields=${fieldsToUse.join(',')}`
      );

      conids.forEach(c => this.primedConids.add(c));
      this.log(`Primed market data for ${conids.length} conids`);
    } catch (error) {
      this.log(`Failed to prime market data: ${error}`);
    }
  }

  /**
   * Fetches market data snapshots for given conids.
   */
  private async fetchMarketDataSnapshots(
    conids: number[],
    fields: string[]
  ): Promise<IBKRMarketDataSnapshot[]> {
    try {
      const response = await this.makeRequest<IBKRMarketDataSnapshot[]>(
        `/iserver/marketdata/snapshot?conids=${conids.join(',')}&fields=${fields.join(',')}`
      );

      return response ?? [];
    } catch (error) {
      this.log(`Failed to fetch market data snapshots: ${error}`);
      return [];
    }
  }

  /**
   * Resolves conids for both ticker symbols and OCC option symbols.
   */
  private async resolveConids(
    tickerSymbols: string[],
    optionSymbols: string[]
  ): Promise<void> {
    // Resolve underlying conids
    for (const symbol of tickerSymbols) {
      if (!this.symbolToConid.has(symbol)) {
        await this.resolveUnderlyingConid(symbol);
      }
    }

    // Resolve option conids
    for (const occSymbol of optionSymbols) {
      if (!this.occToConid.has(occSymbol)) {
        await this.resolveOptionConid(occSymbol);
      }
    }
  }

  /**
   * Gets the conid for a symbol (either option or underlying).
   */
  private getConidForSymbol(symbol: string): number | undefined {
    if (this.isOptionSymbol(symbol)) {
      return this.occToConid.get(symbol);
    }
    return this.symbolToConid.get(symbol);
  }

  /**
   * Converts an IBKR option info to OCC symbol format.
   */
  private ibkrOptionToOCC(opt: IBKROptionInfo): string | null {
    try {
      // maturityDate format: YYYYMMDD
      if (!opt.maturityDate || opt.maturityDate.length !== 8) return null;

      const year = parseInt(opt.maturityDate.slice(0, 4), 10);
      const month = parseInt(opt.maturityDate.slice(4, 6), 10) - 1;
      const day = parseInt(opt.maturityDate.slice(6, 8), 10);
      const expiration = new Date(year, month, day, 12, 0, 0);

      const optionType: OptionType = opt.right === 'C' ? 'call' : 'put';

      return buildOCCSymbol({
        symbol: opt.symbol,
        expiration,
        optionType,
        strike: opt.strike,
      });
    } catch {
      return null;
    }
  }

  /**
   * Makes an authenticated request to the IBKR API.
   */
  private async makeRequest<T>(endpoint: string, options?: RequestInit): Promise<T | null> {
    const url = `${this.baseUrl}${endpoint}`;

    const headers: Record<string, string> = {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
    };

    if (this.accessToken) {
      headers['Authorization'] = `Bearer ${this.accessToken}`;
    }

    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          ...headers,
          ...options?.headers,
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        this.log(`API error ${response.status}: ${errorText}`);
        return null;
      }

      const data = await response.json();
      return data as T;
    } catch (error) {
      this.log(`Request failed: ${error}`);
      return null;
    }
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
    const delay = this.getReconnectDelay();

    this.log(`Reconnection attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${delay}ms`);

    await this.sleep(delay);

    try {
      await this.connect();
    } catch {
      // Reconnect attempt failed, will try again via onclose
    }
  }
}
