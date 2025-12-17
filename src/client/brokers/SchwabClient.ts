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
} from './BaseBrokerClient';

// Re-export types for backwards compatibility
export type { AggressorSide, IntradayTrade, FlowSummary };

// ==================== Schwab API Types ====================

/**
 * Schwab user preferences response containing streaming info
 */
interface SchwabUserPreferences {
  accounts: Array<{
    accountNumber: string;
    primaryAccount: boolean;
    type: string;
    nickName: string;
    displayAcctId: string;
    autoPositionEffect: boolean;
  }>;
  streamerInfo: Array<{
    schwabClientCustomerId: string;
    schwabClientCorrelId: string;
    schwabClientChannel: string;
    schwabClientFunctionId: string;
    streamerSocketUrl: string;
  }>;
  offers: unknown[];
}

/**
 * Schwab streaming request structure
 */
interface SchwabStreamRequest {
  service: string;
  requestid: string;
  command: string;
  SchwabClientCustomerId: string;
  SchwabClientCorrelId: string;
  parameters: Record<string, unknown>;
}

/**
 * Schwab streaming response structure
 */
interface SchwabStreamResponse {
  response?: Array<{
    service: string;
    requestid: string;
    command: string;
    timestamp: number;
    content: {
      code: number;
      msg: string;
    };
  }>;
  data?: Array<{
    service: string;
    timestamp: number;
    command: string;
    content: Array<Record<string, unknown>>;
  }>;
  notify?: Array<{
    heartbeat: string;
  }>;
}

/**
 * Schwab option chain response
 */
interface SchwabOptionChainResponse {
  symbol: string;
  status: string;
  underlying: {
    symbol: string;
    description: string;
    change: number;
    percentChange: number;
    close: number;
    quoteTime: number;
    tradeTime: number;
    bid: number;
    ask: number;
    last: number;
    mark: number;
    markChange: number;
    markPercentChange: number;
    bidSize: number;
    askSize: number;
    highPrice: number;
    lowPrice: number;
    openPrice: number;
    totalVolume: number;
    exchangeName: string;
    fiftyTwoWeekHigh: number;
    fiftyTwoWeekLow: number;
    delayed: boolean;
  };
  strategy: string;
  interval: number;
  isDelayed: boolean;
  isIndex: boolean;
  interestRate: number;
  underlyingPrice: number;
  volatility: number;
  daysToExpiration: number;
  numberOfContracts: number;
  assetMainType: string;
  assetSubType: string;
  isChainTruncated: boolean;
  callExpDateMap: Record<string, Record<string, SchwabOptionContract[]>>;
  putExpDateMap: Record<string, Record<string, SchwabOptionContract[]>>;
}

/**
 * Schwab option contract from chain
 */
interface SchwabOptionContract {
  putCall: 'CALL' | 'PUT';
  symbol: string;
  description: string;
  exchangeName: string;
  bid: number;
  ask: number;
  last: number;
  mark: number;
  bidSize: number;
  askSize: number;
  bidAskSize: string;
  lastSize: number;
  highPrice: number;
  lowPrice: number;
  openPrice: number;
  closePrice: number;
  totalVolume: number;
  tradeDate: number | null;
  tradeTimeInLong: number;
  quoteTimeInLong: number;
  netChange: number;
  volatility: number;
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
  rho: number;
  openInterest: number;
  timeValue: number;
  theoreticalOptionValue: number;
  theoreticalVolatility: number;
  optionDeliverablesList: unknown;
  strikePrice: number;
  expirationDate: string;
  daysToExpiration: number;
  expirationType: string;
  lastTradingDay: number;
  multiplier: number;
  settlementType: string;
  deliverableNote: string;
  percentChange: number;
  markChange: number;
  markPercentChange: number;
  intrinsicValue: number;
  extrinsicValue: number;
  optionRoot: string;
  exerciseType: string;
  high52Week: number;
  low52Week: number;
  nonStandard: boolean;
  pennyPilot: boolean;
  inTheMoney: boolean;
  mini: boolean;
}

/**
 * Schwab streaming field enums for LEVELONE_OPTIONS
 */
enum LevelOneOptionFields {
  SYMBOL = 0,
  DESCRIPTION = 1,
  BID_PRICE = 2,
  ASK_PRICE = 3,
  LAST_PRICE = 4,
  HIGH_PRICE = 5,
  LOW_PRICE = 6,
  CLOSE_PRICE = 7,
  TOTAL_VOLUME = 8,
  OPEN_INTEREST = 9,
  VOLATILITY = 10,
  INTRINSIC_VALUE = 11,
  EXTRINSIC_VALUE = 12,
  OPTION_ROOT = 13,
  STRIKE_TYPE = 14,
  CONTRACT_TYPE = 15,
  UNDERLYING = 16,
  EXPIRATION_MONTH = 17,
  DELIVERABLES = 18,
  TIME_VALUE = 19,
  EXPIRATION_DAY = 20,
  DAYS_TO_EXPIRATION = 21,
  DELTA = 22,
  GAMMA = 23,
  THETA = 24,
  VEGA = 25,
  RHO = 26,
  SECURITY_STATUS = 27,
  THEORETICAL_OPTION_VALUE = 28,
  UNDERLYING_PRICE = 29,
  UV_EXPIRATION_TYPE = 30,
  MARK = 31,
  QUOTE_TIME_MILLIS = 32,
  TRADE_TIME_MILLIS = 33,
  EXCHANGE_ID = 34,
  EXCHANGE_NAME = 35,
  LAST_TRADING_DAY = 36,
  SETTLEMENT_TYPE = 37,
  NET_CHANGE = 38,
  NET_PERCENT_CHANGE = 39,
  MARK_CHANGE = 40,
  MARK_PERCENT_CHANGE = 41,
  IMPLIED_YIELD = 42,
  IS_PENNY_PILOT = 43,
  OPTION_TYPE = 44,
  STRIKE_PRICE = 45,
  BID_SIZE = 46,
  ASK_SIZE = 47,
  LAST_SIZE = 48,
  NET_CHANGE_DIR = 49,
  OPEN_PRICE = 50,
  TICK = 51,
  TICK_AMOUNT = 52,
  FUTURE_MULTIPLIER = 53,
  FUTURE_SETTLEMENT_PRICE = 54,
  EXCHANGE_CHARACTER = 55,
}

/**
 * Schwab streaming field enums for OPTIONS_BOOK
 */
enum OptionsBookFields {
  SYMBOL = 0,
  BOOK_TIME = 1,
  BIDS = 2,
  ASKS = 3,
}

/**
 * Regex pattern to identify OCC option symbols
 * Schwab uses space-padded format: "AAPL  240517C00170000"
 */
const SCHWAB_OCC_OPTION_PATTERN = /^.{1,6}\s*\d{6}[CP]\d{8}$/;

/**
 * Schwab client configuration options
 */
export interface SchwabClientOptions extends BaseBrokerClientOptions {
  /** Schwab OAuth access token (required) */
  accessToken: string;
}

/**
 * SchwabClient handles real-time streaming connections to the Charles Schwab API
 * via WebSockets.
 * 
 * @remarks
 * This client manages WebSocket connections to Schwab's streaming API,
 * normalizes incoming quote and book data, and emits events for upstream
 * consumption by the FloeClient.
 * 
 * Authentication flow:
 * 1. Use OAuth access token to call get_user_preferences endpoint
 * 2. Extract streaming credentials (customerId, correlId, channel, functionId, socketUrl)
 * 3. Connect to WebSocket and send ADMIN/LOGIN request with access token
 * 4. Subscribe to LEVELONE_OPTIONS for quotes and OPTIONS_BOOK for order book
 * 
 * @example
 * ```typescript
 * const client = new SchwabClient({
 *   accessToken: 'your-oauth-access-token'
 * });
 * 
 * client.on('tickerUpdate', (ticker) => {
 *   console.log(`${ticker.symbol}: ${ticker.spot}`);
 * });
 * 
 * await client.connect();
 * client.subscribe(['SPY', 'SPY   240517C00500000']); // Equity and option
 * ```
 */
export class SchwabClient extends BaseBrokerClient {
  protected readonly brokerName = 'Schwab';

  /** Schwab OAuth access token */
  private accessToken: string;

  /** WebSocket connection */
  private ws: WebSocket | null = null;

  /** Connection state */
  private connected: boolean = false;

  /** Logged in state */
  private loggedIn: boolean = false;

  /** Streaming credentials */
  private streamCustomerId: string | null = null;
  private streamCorrelId: string | null = null;
  private streamChannel: string | null = null;
  private streamFunctionId: string | null = null;
  private streamSocketUrl: string | null = null;

  /** Request ID counter */
  private requestId: number = 0;

  /** Map from Schwab symbol to OCC symbol */
  private schwabToOccMap: Map<string, string> = new Map();

  /** Map from OCC symbol to Schwab symbol */
  private occToSchwabMap: Map<string, string> = new Map();

  /** Keepalive interval handle */
  private keepaliveInterval: ReturnType<typeof setInterval> | null = null;

  /** Schwab API base URL */
  private readonly apiBaseUrl: string = 'https://api.schwabapi.com';

  /**
   * Creates a new SchwabClient instance.
   * 
   * @param options - Client configuration options
   * @param options.accessToken - Schwab OAuth access token (required)
   * @param options.verbose - Whether to log verbose debug information (default: false)
   */
  constructor(options: SchwabClientOptions) {
    super(options);
    this.accessToken = options.accessToken;
  }

  // ==================== Public API ====================

  /**
   * Establishes a streaming connection to Schwab.
   * 
   * @returns Promise that resolves when connected and logged in
   * @throws {Error} If credentials retrieval or WebSocket connection fails
   */
  async connect(): Promise<void> {
    // Get streaming credentials from user preferences
    const preferences = await this.getUserPreferences();
    if (!preferences || !preferences.streamerInfo?.[0]) {
      throw new Error('Failed to get Schwab streaming credentials');
    }

    const streamInfo = preferences.streamerInfo[0];
    this.streamCustomerId = streamInfo.schwabClientCustomerId;
    this.streamCorrelId = streamInfo.schwabClientCorrelId;
    this.streamChannel = streamInfo.schwabClientChannel;
    this.streamFunctionId = streamInfo.schwabClientFunctionId;
    this.streamSocketUrl = streamInfo.streamerSocketUrl;

    // Connect to WebSocket
    await this.connectWebSocket();
  }

  /**
   * Disconnects from the Schwab streaming API.
   */
  disconnect(): void {
    if (this.keepaliveInterval) {
      clearInterval(this.keepaliveInterval);
      this.keepaliveInterval = null;
    }

    if (this.ws && this.loggedIn) {
      // Send logout request
      this.sendLogout();
    }

    if (this.ws) {
      this.ws.close(1000, 'Client disconnect');
      this.ws = null;
    }

    this.connected = false;
    this.loggedIn = false;
    this.subscribedSymbols.clear();
    this.schwabToOccMap.clear();
    this.occToSchwabMap.clear();
  }

  /**
   * Subscribes to real-time updates for the specified symbols.
   * 
   * @param symbols - Array of ticker symbols and/or OCC option symbols
   * 
   * @remarks
   * For options, you can pass OCC format symbols (e.g., 'SPY240119C00500000')
   * or Schwab format with spaces (e.g., 'SPY   240119C00500000').
   * The client will handle conversion automatically.
   */
  subscribe(symbols: string[]): void {
    // Add to tracked symbols
    symbols.forEach(s => this.subscribedSymbols.add(s));

    if (!this.connected || !this.loggedIn) {
      // Will subscribe when logged in
      return;
    }

    const tickers: string[] = [];
    const options: string[] = [];

    for (const symbol of symbols) {
      if (this.isSchwabOptionSymbol(symbol)) {
        options.push(this.toSchwabOptionSymbol(symbol));
      } else {
        tickers.push(symbol);
      }
    }

    if (tickers.length > 0) {
      this.subscribeLevelOneEquity(tickers);
    }

    if (options.length > 0) {
      this.subscribeLevelOneOptions(options);
      this.subscribeOptionsBook(options);
    }
  }

  /**
   * Unsubscribes from real-time updates for the specified symbols.
   * 
   * @param symbols - Array of symbols to unsubscribe from
   */
  unsubscribe(symbols: string[]): void {
    symbols.forEach(s => this.subscribedSymbols.delete(s));

    if (!this.connected || !this.loggedIn) {
      return;
    }

    const tickers: string[] = [];
    const options: string[] = [];

    for (const symbol of symbols) {
      if (this.isSchwabOptionSymbol(symbol)) {
        options.push(this.toSchwabOptionSymbol(symbol));
      } else {
        tickers.push(symbol);
      }
    }

    if (tickers.length > 0) {
      this.unsubscribeLevelOneEquity(tickers);
    }

    if (options.length > 0) {
      this.unsubscribeLevelOneOptions(options);
      this.unsubscribeOptionsBook(options);
    }
  }

  /**
   * Unsubscribes from all real-time updates.
   */
  unsubscribeFromAll(): void {
    const allSymbols = Array.from(this.subscribedSymbols);
    const allOptionSymbols = allSymbols.filter(s => this.isSchwabOptionSymbol(s)).map(s => this.toSchwabOptionSymbol(s));
    this.subscribedSymbols.clear();
    // unsub from all equities
    if (allSymbols.length > 0) {
      const request = this.makeRequest('LEVELONE_EQUITIES', 'UNSUBS', {
        keys: allSymbols.join(','),
      });
      this.sendMessage({ requests: [request] });
    }
    // unsub from all options (quotes and book)
    if (allOptionSymbols.length > 0) {
      const requestOptions = this.makeRequest('LEVELONE_OPTIONS', 'UNSUBS', {
        keys: allOptionSymbols.join(','),
      });
      const requestBook = this.makeRequest('OPTIONS_BOOK', 'UNSUBS', {
        keys: allOptionSymbols.join(','),
      });
      this.sendMessage({ requests: [requestOptions, requestBook] });
    }
  }

  /**
   * Returns whether the client is currently connected.
   */
  isConnected(): boolean {
    return this.connected && this.loggedIn;
  }

  /**
   * Fetches option chain from Schwab REST API.
   * This provides the base open interest data.
   * 
   * @param symbol - Underlying symbol (e.g., 'SPY')
   * @param options - Optional parameters for filtering the chain
   * @returns Promise resolving to the option chain response
   */
  async fetchOptionChain(
    symbol: string,
    options?: {
      contractType?: 'CALL' | 'PUT' | 'ALL';
      strikeCount?: number;
      includeUnderlyingQuote?: boolean;
      fromDate?: string;
      toDate?: string;
    }
  ): Promise<SchwabOptionChainResponse | null> {
    try {
      const params = new URLSearchParams({ symbol });

      if (options?.contractType) {
        params.append('contractType', options.contractType);
      }
      if (options?.strikeCount) {
        params.append('strikeCount', options.strikeCount.toString());
      }
      if (options?.includeUnderlyingQuote) {
        params.append('includeUnderlyingQuote', 'true');
      }
      if (options?.fromDate) {
        params.append('fromDate', options.fromDate);
      }
      if (options?.toDate) {
        params.append('toDate', options.toDate);
      }

      const response = await fetch(
        `${this.apiBaseUrl}/marketdata/v1/chains?${params.toString()}`,
        {
          method: 'GET',
          headers: this.getAuthHeaders(),
        }
      );

      if (!response.ok) {
        this.emit('error', new Error(`Failed to fetch option chain: ${response.statusText}`));
        return null;
      }

      return await response.json() as SchwabOptionChainResponse;
    } catch (error) {
      this.emit('error', error instanceof Error ? error : new Error(String(error)));
      return null;
    }
  }

  /**
   * Fetches open interest and other static data for subscribed options.
   * 
   * @param occSymbols - Array of OCC option symbols to fetch data for
   */
  async fetchOpenInterest(occSymbols: string[]): Promise<void> {
    // Group by underlying
    const groups = new Map<string, Set<string>>();

    for (const occSymbol of occSymbols) {
      try {
        const parsed = parseOCCSymbol(this.normalizeOccSymbol(occSymbol));
        if (!groups.has(parsed.symbol)) {
          groups.set(parsed.symbol, new Set());
        }
        groups.get(parsed.symbol)!.add(this.normalizeOccSymbol(occSymbol));
      } catch {
        continue;
      }
    }

    // Fetch chains for each underlying
    const fetchPromises = Array.from(groups.entries()).map(async ([underlying, targetSymbols]) => {
      const chain = await this.fetchOptionChain(underlying, {
        contractType: 'ALL',
        includeUnderlyingQuote: true,
      });

      if (!chain) return;

      // Process calls
      for (const [_expDate, strikes] of Object.entries(chain.callExpDateMap || {})) {
        for (const [_strike, contracts] of Object.entries(strikes)) {
          for (const contract of contracts) {
            this.processChainContract(contract, targetSymbols);
          }
        }
      }

      // Process puts
      for (const [_expDate, strikes] of Object.entries(chain.putExpDateMap || {})) {
        for (const [_strike, contracts] of Object.entries(strikes)) {
          for (const contract of contracts) {
            this.processChainContract(contract, targetSymbols);
          }
        }
      }
    });

    await Promise.all(fetchPromises);
  }

  // ==================== Private Methods ====================

  /**
   * Gets user preferences containing streaming info from Schwab.
   */
  private async getUserPreferences(): Promise<SchwabUserPreferences | null> {
    try {
      const url = `${this.apiBaseUrl}/trader/v1/userPreference`;
      const headers = this.getAuthHeaders();
      const authHeader = (headers['Authorization'] ?? headers['authorization'] ?? '') as string;
      const maskedAuth = typeof authHeader === 'string' && authHeader.length > 12 ? `${authHeader.slice(0,12)}...` : authHeader;

      if (this.verbose) {
        console.debug('[Schwab] GET userPreference', url, { maskedAuthorization: maskedAuth, headerKeys: Object.keys(headers) });
      }

      const response = await fetch(url, {
        method: 'GET',
        headers,
      });

      const text = await response.text();
      if (!response.ok) {
        if (this.verbose) {
          console.error('[Schwab] userPreference failed', response.status, response.statusText, text);
        }

        let parsed: unknown = text;
        try { parsed = JSON.parse(text); } catch {}

        this.emit('error', new Error(`Failed to get user preferences: ${response.status} ${response.statusText} - ${typeof parsed === 'string' ? parsed : JSON.stringify(parsed)}`));
        return null;
      }

      const json = JSON.parse(text) as SchwabUserPreferences;
      if (this.verbose) {
        console.debug('[Schwab] userPreference success', json);
      }
      return json;
    } catch (error) {
      this.emit('error', error instanceof Error ? error : new Error(String(error)));
      return null;
    }
  }

  /**
   * Returns authorization headers for API calls.
   */
  private getAuthHeaders(): Record<string, string> {
    return {
      'Authorization': `Bearer ${this.accessToken}`,
      'Accept': 'application/json',
      'Content-Type': 'application/json',
    };
  }

  /**
   * Connects to Schwab WebSocket.
   */
  private connectWebSocket(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.streamSocketUrl) {
        reject(new Error('Stream socket URL not available'));
        return;
      }

      this.ws = new WebSocket(this.streamSocketUrl);

      this.ws.onopen = () => {
        this.connected = true;
        this.reconnectAttempts = 0;

        // Send login request
        this.sendLogin();
      };

      this.ws.onmessage = (event) => {
        this.handleMessage(event.data, resolve);
      };

      this.ws.onclose = (event) => {
        this.connected = false;
        this.loggedIn = false;
        this.emit('disconnected', { reason: event.reason });

        if (event.code !== 1000) {
          this.attemptReconnect();
        }
      };

      this.ws.onerror = () => {
        this.emit('error', new Error('Schwab WebSocket error'));
        reject(new Error('WebSocket connection failed'));
      };
    });
  }

  /**
   * Sends login request to Schwab streaming.
   */
  private sendLogin(): void {
    const request = this.makeRequest('ADMIN', 'LOGIN', {
      'Authorization': this.accessToken,
      'SchwabClientChannel': this.streamChannel,
      'SchwabClientFunctionId': this.streamFunctionId,
    });

    this.sendMessage({ requests: [request] });
  }

  /**
   * Sends logout request to Schwab streaming.
   */
  private sendLogout(): void {
    const request = this.makeRequest('ADMIN', 'LOGOUT', {});
    this.sendMessage({ requests: [request] });
  }

  /**
   * Subscribes to LEVELONE_EQUITIES service.
   */
  private subscribeLevelOneEquity(symbols: string[]): void {
    const fields = '0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,' +
      '20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40,41,42,43,44,45,46,47,48,49';

    const request = this.makeRequest('LEVELONE_EQUITIES', 'SUBS', {
      keys: symbols.join(','),
      fields,
    });

    this.sendMessage({ requests: [request] });
  }

  /**
   * Unsubscribes from LEVELONE_EQUITIES service.
   */
  private unsubscribeLevelOneEquity(symbols: string[]): void {
    const request = this.makeRequest('LEVELONE_EQUITIES', 'UNSUBS', {
      keys: symbols.join(','),
    });

    this.sendMessage({ requests: [request] });
  }

  /**
   * Subscribes to LEVELONE_OPTIONS service for level 1 option quotes.
   */
  private subscribeLevelOneOptions(schwabSymbols: string[]): void {
    // Request all available fields (0-55)
    const fields = Array.from({ length: 56 }, (_, i) => i).join(',');

    const request = this.makeRequest('LEVELONE_OPTIONS', 'SUBS', {
      keys: schwabSymbols.join(','),
      fields,
    });

    this.sendMessage({ requests: [request] });
  }

  /**
   * Unsubscribes from LEVELONE_OPTIONS service.
   */
  private unsubscribeLevelOneOptions(schwabSymbols: string[]): void {
    const request = this.makeRequest('LEVELONE_OPTIONS', 'UNSUBS', {
      keys: schwabSymbols.join(','),
    });

    this.sendMessage({ requests: [request] });
  }

  /**
   * Subscribes to OPTIONS_BOOK service for level 2 order book.
   * This provides "live" open interest intraday.
   */
  private subscribeOptionsBook(schwabSymbols: string[]): void {
    const request = this.makeRequest('OPTIONS_BOOK', 'SUBS', {
      keys: schwabSymbols.join(','),
      fields: '0,1,2,3',
    });

    this.sendMessage({ requests: [request] });
  }

  /**
   * Unsubscribes from OPTIONS_BOOK service.
   */
  private unsubscribeOptionsBook(schwabSymbols: string[]): void {
    const request = this.makeRequest('OPTIONS_BOOK', 'UNSUBS', {
      keys: schwabSymbols.join(','),
    });

    this.sendMessage({ requests: [request] });
  }

  /**
   * Makes a streaming request object.
   */
  private makeRequest(service: string, command: string, parameters: Record<string, unknown>): SchwabStreamRequest {
    const requestId = this.requestId++;

    return {
      service,
      requestid: requestId.toString(),
      command,
      SchwabClientCustomerId: this.streamCustomerId || '',
      SchwabClientCorrelId: this.streamCorrelId || '',
      parameters,
    };
  }

  /**
   * Handles incoming WebSocket messages.
   */
  private handleMessage(data: string, connectResolve?: (value: void) => void): void {
    try {
      const message = JSON.parse(data) as SchwabStreamResponse;

      // Handle response messages (to commands)
      if (message.response) {
        for (const response of message.response) {
          this.handleResponse(response, connectResolve);
        }
      }

      // Handle data messages (streaming data)
      if (message.data) {
        for (const dataItem of message.data) {
          this.handleDataMessage(dataItem);
        }
      }

      // Handle heartbeat/notify messages
      if (message.notify) {
        // Heartbeat received, connection is alive
      }
    } catch {
      // Ignore parse errors
    }
  }

  /**
   * Handles a response message (command acknowledgment).
   */
  private handleResponse(
    response: NonNullable<SchwabStreamResponse['response']>[0],
    connectResolve?: (value: void) => void
  ): void {
    if (response.service === 'ADMIN' && response.command === 'LOGIN') {
      if (response.content.code === 0) {
        this.loggedIn = true;
        this.startKeepalive();
        if (this.verbose) {
          console.log('[Schwab:WS] Logged in and connected to streaming API');
        }
        this.emit('connected', undefined);
        connectResolve?.();

        // Subscribe to queued symbols
        if (this.subscribedSymbols.size > 0) {
          this.subscribe(Array.from(this.subscribedSymbols));
        }
      } else {
        this.emit('error', new Error(`Schwab login failed: ${response.content.msg}`));
      }
    } else if (response.content.code !== 0) {
      this.emit('error', new Error(`Schwab ${response.service}/${response.command} failed: ${response.content.msg}`));
    }
  }

  /**
   * Handles streaming data messages.
   */
  private handleDataMessage(dataItem: NonNullable<SchwabStreamResponse['data']>[0]): void {
    const { service, content, timestamp } = dataItem;

    for (const item of content) {
      switch (service) {
        case 'LEVELONE_EQUITIES':
          this.handleLevelOneEquity(item, timestamp);
          break;
        case 'LEVELONE_OPTIONS':
          this.handleLevelOneOption(item, timestamp);
          break;
        case 'OPTIONS_BOOK':
          this.handleOptionsBook(item, timestamp);
          break;
      }
    }
  }

  /**
   * Handles LEVELONE_EQUITIES data.
   */
  private handleLevelOneEquity(data: Record<string, unknown>, timestamp: number): void {
    const symbol = data.key as string;
    if (!symbol) return;

    const existing = this.tickerCache.get(symbol);

    const ticker: NormalizedTicker = {
      symbol,
      spot: this.toNumber(data['3']) || this.toNumber(data['2']) || existing?.spot || 0, // Last or Bid
      bid: this.toNumber(data['2']) || existing?.bid || 0,
      bidSize: this.toNumber(data['46']) || existing?.bidSize || 0,
      ask: this.toNumber(data['4']) || existing?.ask || 0,
      askSize: this.toNumber(data['47']) || existing?.askSize || 0,
      last: this.toNumber(data['3']) || existing?.last || 0,
      volume: this.toNumber(data['8']) || existing?.volume || 0,
      timestamp,
    };

    this.tickerCache.set(symbol, ticker);
    this.emit('tickerUpdate', ticker);
  }

  /**
   * Handles LEVELONE_OPTIONS data.
   */
  private handleLevelOneOption(data: Record<string, unknown>, timestamp: number): void {
    const schwabSymbol = data.key as string;
    if (!schwabSymbol) return;

    const occSymbol = this.schwabToOcc(schwabSymbol);
    const existing = this.optionCache.get(occSymbol);

    // Parse symbol for underlying info if not cached
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

    const bidPrice = this.toNumber(data[LevelOneOptionFields.BID_PRICE.toString()]) || existing?.bid || 0;
    const askPrice = this.toNumber(data[LevelOneOptionFields.ASK_PRICE.toString()]) || existing?.ask || 0;
    const lastPrice = this.toNumber(data[LevelOneOptionFields.LAST_PRICE.toString()]) || existing?.last || 0;
    const volume = this.toNumber(data[LevelOneOptionFields.TOTAL_VOLUME.toString()]) || existing?.volume || 0;
    const openInterest = this.toNumber(data[LevelOneOptionFields.OPEN_INTEREST.toString()]) || existing?.openInterest || 0;
    const volatility = this.toNumber(data[LevelOneOptionFields.VOLATILITY.toString()]) || existing?.impliedVolatility || 0;
    const mark = this.toNumber(data[LevelOneOptionFields.MARK.toString()]) || 
      (bidPrice > 0 && askPrice > 0 ? (bidPrice + askPrice) / 2 : existing?.mark || 0);

    // Update base OI if not set
    if (openInterest > 0 && !this.baseOpenInterest.has(occSymbol)) {
      this.baseOpenInterest.set(occSymbol, openInterest);
      this.cumulativeOIChange.set(occSymbol, 0);
      
      if (this.verbose) {
        console.log(`[Schwab:OI] Base OI set from stream for ${occSymbol}: ${openInterest}`);
      }
    }

    // Detect trade by comparing last price and volume changes
    if (existing && lastPrice > 0 && lastPrice !== existing.last) {
      const volumeChange = volume - (existing.volume || 0);
      if (volumeChange > 0) {
        this.recordTrade(occSymbol, lastPrice, volumeChange, existing.bid, existing.ask, timestamp);
      }
    }

    const option: NormalizedOption = {
      occSymbol,
      underlying: parsed.symbol,
      strike: this.toNumber(data[LevelOneOptionFields.STRIKE_PRICE.toString()]) || parsed.strike,
      expiration: parsed.expiration.toISOString().split('T')[0],
      expirationTimestamp: parsed.expiration.getTime(),
      optionType: parsed.optionType,
      bid: bidPrice,
      bidSize: this.toNumber(data[LevelOneOptionFields.BID_SIZE.toString()]) || existing?.bidSize || 0,
      ask: askPrice,
      askSize: this.toNumber(data[LevelOneOptionFields.ASK_SIZE.toString()]) || existing?.askSize || 0,
      mark,
      last: lastPrice,
      volume,
      openInterest,
      liveOpenInterest: this.calculateLiveOpenInterest(occSymbol),
      impliedVolatility: volatility,
      timestamp,
    };

    this.optionCache.set(occSymbol, option);
    this.emit('optionUpdate', option);
  }

  /**
   * Handles OPTIONS_BOOK data (level 2 order book).
   * This provides depth of market which can indicate intraday activity.
   */
  private handleOptionsBook(data: Record<string, unknown>, _timestamp: number): void {
    const schwabSymbol = data.key as string;
    if (!schwabSymbol) return;

    // OPTIONS_BOOK provides bid/ask book depth
    // We can use changes in the book to infer trade activity
    // For now, we'll update the best bid/ask from the book

    const occSymbol = this.schwabToOcc(schwabSymbol);
    const existing = this.optionCache.get(occSymbol);
    if (!existing) return;

    const bids = data[OptionsBookFields.BIDS.toString()] as Array<{
      '0': number; // price
      '1': number; // total volume
      '2': number; // num orders
    }> | undefined;

    const asks = data[OptionsBookFields.ASKS.toString()] as Array<{
      '0': number;
      '1': number;
      '2': number;
    }> | undefined;

    if (bids && bids.length > 0) {
      const bestBid = bids[0];
      existing.bid = bestBid['0'] || existing.bid;
      existing.bidSize = bestBid['1'] || existing.bidSize;
    }

    if (asks && asks.length > 0) {
      const bestAsk = asks[0];
      existing.ask = bestAsk['0'] || existing.ask;
      existing.askSize = bestAsk['1'] || existing.askSize;
    }

    existing.mark = (existing.bid + existing.ask) / 2;
    existing.timestamp = Date.now();

    this.optionCache.set(occSymbol, existing);
    this.emit('optionUpdate', existing);
  }

  /**
   * Processes a contract from the option chain response.
   */
  private processChainContract(contract: SchwabOptionContract, targetSymbols: Set<string>): void {
    const occSymbol = this.schwabToOcc(contract.symbol);
    
    if (!targetSymbols.has(occSymbol)) return;

    // Store mapping
    this.schwabToOccMap.set(contract.symbol, occSymbol);
    this.occToSchwabMap.set(occSymbol, contract.symbol);

    // Store base OI
    if (contract.openInterest > 0) {
      this.baseOpenInterest.set(occSymbol, contract.openInterest);
      
      if (this.verbose) {
        console.log(`[Schwab:OI] Base OI set from chain for ${occSymbol}: ${contract.openInterest}`);
      }
    }

    if (!this.cumulativeOIChange.has(occSymbol)) {
      this.cumulativeOIChange.set(occSymbol, 0);
    }

    // Create option in cache
    const option: NormalizedOption = {
      occSymbol,
      underlying: contract.optionRoot,
      strike: contract.strikePrice,
      expiration: contract.expirationDate.split('T')[0],
      expirationTimestamp: new Date(contract.expirationDate).getTime(),
      optionType: contract.putCall === 'CALL' ? 'call' : 'put',
      bid: contract.bid,
      bidSize: contract.bidSize,
      ask: contract.ask,
      askSize: contract.askSize,
      mark: contract.mark,
      last: contract.last,
      volume: contract.totalVolume,
      openInterest: contract.openInterest,
      liveOpenInterest: this.calculateLiveOpenInterest(occSymbol),
      impliedVolatility: contract.volatility,
      timestamp: Date.now(),
    };

    this.optionCache.set(occSymbol, option);
    this.emit('optionUpdate', option);
  }

  /**
   * Starts keepalive interval.
   */
  private startKeepalive(): void {
    if (this.keepaliveInterval) {
      clearInterval(this.keepaliveInterval);
    }

    // Schwab streaming uses implicit keepalive via activity
    // Send a QOS request periodically to keep connection alive
    this.keepaliveInterval = setInterval(() => {
      if (this.connected && this.loggedIn && this.ws) {
        // QOS request to keep connection alive
        const request = this.makeRequest('ADMIN', 'QOS', {
          qoslevel: '0', // Express (fastest)
        });
        this.sendMessage({ requests: [request] });
      }
    }, 60000); // Every 60 seconds
  }

  /**
   * Converts Schwab option symbol to OCC format.
   * Schwab format: "AAPL  240517C00170000" (6-char padded underlying)
   */
  private schwabToOcc(schwabSymbol: string): string {
    // Check cache
    const cached = this.schwabToOccMap.get(schwabSymbol);
    if (cached) return cached;

    // Schwab symbols are already close to OCC format
    // Just normalize by removing extra spaces and ensuring proper padding
    return this.normalizeOccSymbol(schwabSymbol);
  }

  /**
   * Converts OCC symbol to Schwab format (space-padded).
   */
  private toSchwabOptionSymbol(occSymbol: string): string {
    // Check cache
    const cached = this.occToSchwabMap.get(occSymbol);
    if (cached) return cached;

    const normalized = this.normalizeOccSymbol(occSymbol);
    
    // Parse and rebuild with space padding
    const match = normalized.match(/^([A-Z]+)(\d{6})([CP])(\d{8})$/);
    if (match) {
      const [, root, date, type, strike] = match;
      // Schwab uses 6-character padded root
      const paddedRoot = root.padEnd(6, ' ');
      return `${paddedRoot}${date}${type}${strike}`;
    }
    
    return occSymbol;
  }

  /**
   * Checks if symbol is an option symbol (Schwab format allows spaces).
   */
  private isSchwabOptionSymbol(symbol: string): boolean {
    return SCHWAB_OCC_OPTION_PATTERN.test(symbol) || /\d{6}[CP]\d{8}/.test(symbol.replace(/\s+/g, ''));
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
      // Will try again via onclose
    }
  }

  /**
   * Sends a message to the WebSocket.
   */
  private sendMessage(message: { requests: SchwabStreamRequest[] }): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }
}
