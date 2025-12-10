import { NormalizedOption, NormalizedTicker, OptionType } from '../../types';
import { parseOCCSymbol } from '../../utils/occ';

// ==================== DxLink Protocol Types ====================

/**
 * DxLink WebSocket message types
 */
type DxLinkMessageType = 
  | 'SETUP' 
  | 'AUTH' 
  | 'AUTH_STATE' 
  | 'KEEPALIVE' 
  | 'CHANNEL_REQUEST' 
  | 'CHANNEL_OPENED' 
  | 'CHANNEL_CLOSED'
  | 'FEED_SETUP' 
  | 'FEED_CONFIG' 
  | 'FEED_SUBSCRIPTION' 
  | 'FEED_DATA'
  | 'ERROR';

/**
 * Base DxLink message structure
 */
interface DxLinkMessage {
  type: DxLinkMessageType;
  channel: number;
}

/**
 * DxLink SETUP message - initiates connection
 */
interface DxLinkSetupMessage extends DxLinkMessage {
  type: 'SETUP';
  version: string;
  keepaliveTimeout: number;
  acceptKeepaliveTimeout: number;
}

/**
 * DxLink AUTH message - authenticates with API token
 */
interface DxLinkAuthMessage extends DxLinkMessage {
  type: 'AUTH';
  token: string;
}

/**
 * DxLink AUTH_STATE response
 */
interface DxLinkAuthStateMessage extends DxLinkMessage {
  type: 'AUTH_STATE';
  state: 'AUTHORIZED' | 'UNAUTHORIZED';
  userId?: string;
}

/**
 * DxLink CHANNEL_REQUEST message - opens a feed channel
 */
interface DxLinkChannelRequestMessage extends DxLinkMessage {
  type: 'CHANNEL_REQUEST';
  service: string;
  parameters: {
    contract: string;
  };
}

/**
 * DxLink CHANNEL_OPENED response
 */
interface DxLinkChannelOpenedMessage extends DxLinkMessage {
  type: 'CHANNEL_OPENED';
  service: string;
  parameters: Record<string, unknown>;
}

/**
 * DxLink FEED_SETUP message - configures what fields to receive
 */
interface DxLinkFeedSetupMessage extends DxLinkMessage {
  type: 'FEED_SETUP';
  acceptAggregationPeriod: number;
  acceptDataFormat: 'COMPACT' | 'FULL';
  acceptEventFields: {
    Quote?: string[];
    Trade?: string[];
    TradeETH?: string[];
    Greeks?: string[];
    Profile?: string[];
    Summary?: string[];
  };
}

/**
 * DxLink FEED_SUBSCRIPTION message - subscribes to symbols
 */
interface DxLinkFeedSubscriptionMessage extends DxLinkMessage {
  type: 'FEED_SUBSCRIPTION';
  reset?: boolean;
  add?: Array<{ type: string; symbol: string }>;
  remove?: Array<{ type: string; symbol: string }>;
}

/**
 * DxLink FEED_DATA message - contains market data
 * Data format is COMPACT: [eventType, [field1, field2, ...], ...]
 */
interface DxLinkFeedDataMessage extends DxLinkMessage {
  type: 'FEED_DATA';
  data: (string | (string | number | null)[])[];
}

/**
 * DxLink KEEPALIVE message
 */
interface DxLinkKeepaliveMessage extends DxLinkMessage {
  type: 'KEEPALIVE';
}

/**
 * DxLink ERROR message
 */
interface DxLinkErrorMessage extends DxLinkMessage {
  type: 'ERROR';
  error: string;
  message: string;
}

// ==================== TastyTrade API Types ====================

/**
 * TastyTrade API quote token response
 */
interface TastyTradeQuoteTokenResponse {
  data: {
    token: string;
    'dxlink-url': string;
    level: string;
  };
  context: string;
}

/**
 * TastyTrade session response from login
 */
interface TastyTradeSessionResponse {
  data: {
    user: {
      email: string;
      username: string;
      'external-id': string;
    };
    'session-token': string;
    'session-expiration': string;
  };
  context: string;
}

/**
 * TastyTrade option chain item
 */
interface TastyTradeOptionChainItem {
  symbol: string;
  'instrument-type': string;
  underlying: string;
  strike: number;
  'expiration-date': string;
  'expiration-type': string;
  'option-type': 'C' | 'P';
  'root-symbol': string;
  'streamer-symbol': string;
  bid?: number;
  ask?: number;
  'bid-size'?: number;
  'ask-size'?: number;
  last?: number;
  volume?: number;
  'open-interest'?: number;
  delta?: number;
  gamma?: number;
  theta?: number;
  vega?: number;
  'implied-volatility'?: number;
}

/**
 * TastyTrade option chain response
 */
interface TastyTradeOptionChainResponse {
  data: {
    items: TastyTradeOptionChainItem[];
  };
  context: string;
}

/**
 * Aggressor side of a trade
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
  /** Estimated OI change */
  estimatedOIChange: number;
}

/**
 * Event types emitted by TastyTradeClient
 */
type TastyTradeClientEventType = 'tickerUpdate' | 'optionUpdate' | 'optionTrade' | 'connected' | 'disconnected' | 'error';

/**
 * Event listener callback type
 */
type TastyTradeEventListener<T> = (data: T) => void;

/**
 * Regex pattern to identify OCC option symbols
 */
const OCC_OPTION_PATTERN = /^.{1,6}\d{6}[CP]\d{8}$/;

/**
 * Event field configurations for different event types
 */
const FEED_EVENT_FIELDS = {
  Quote: ['eventType', 'eventSymbol', 'bidPrice', 'askPrice', 'bidSize', 'askSize'],
  Trade: ['eventType', 'eventSymbol', 'price', 'dayVolume', 'size'],
  TradeETH: ['eventType', 'eventSymbol', 'price', 'dayVolume', 'size'],
  Greeks: ['eventType', 'eventSymbol', 'volatility', 'delta', 'gamma', 'theta', 'rho', 'vega'],
  Profile: ['eventType', 'eventSymbol', 'description', 'shortSaleRestriction', 'tradingStatus', 'statusReason', 'haltStartTime', 'haltEndTime', 'highLimitPrice', 'lowLimitPrice', 'high52WeekPrice', 'low52WeekPrice'],
  Summary: ['eventType', 'eventSymbol', 'openInterest', 'dayOpenPrice', 'dayHighPrice', 'dayLowPrice', 'prevDayClosePrice'],
};

/**
 * TastyTradeClient handles real-time streaming connections to the TastyTrade API
 * via DxLink WebSockets.
 * 
 * @remarks
 * This client manages WebSocket connections to TastyTrade's DxLink streaming API,
 * normalizes incoming quote and trade data, and emits events for upstream
 * consumption by the FloeClient.
 * 
 * Authentication flow:
 * 1. Login to TastyTrade API to get session token (optional, can pass directly)
 * 2. Use session token to get API quote token from /api-quote-tokens
 * 3. Connect to DxLink WebSocket using the quote token
 * 
 * @example
 * ```typescript
 * const client = new TastyTradeClient({
 *   sessionToken: 'your-session-token'
 * });
 * 
 * client.on('tickerUpdate', (ticker) => {
 *   console.log(`${ticker.symbol}: ${ticker.spot}`);
 * });
 * 
 * await client.connect();
 * client.subscribe(['SPY', '.SPXW231215C4500']); // Equity and option
 * ```
 */
export class TastyTradeClient {
  /** TastyTrade session token */
  private sessionToken: string;

  /** DxLink API quote token */
  private quoteToken: string | null = null;

  /** DxLink WebSocket URL */
  private dxLinkUrl: string | null = null;

  /** WebSocket connection */
  private ws: WebSocket | null = null;

  /** Connection state */
  private connected: boolean = false;

  /** Authorization state */
  private authorized: boolean = false;

  /** Feed channel ID */
  private feedChannelId: number = 1;

  /** Feed channel opened */
  private feedChannelOpened: boolean = false;

  /** Currently subscribed symbols */
  private subscribedSymbols: Set<string> = new Set();

  /** Map from streamer symbol to OCC symbol */
  private streamerToOccMap: Map<string, string> = new Map();

  /** Map from OCC symbol to streamer symbol */
  private occToStreamerMap: Map<string, string> = new Map();

  /** Cached ticker data */
  private tickerCache: Map<string, NormalizedTicker> = new Map();

  /** Cached option data */
  private optionCache: Map<string, NormalizedOption> = new Map();

  /** Base open interest from REST API */
  private baseOpenInterest: Map<string, number> = new Map();

  /** Cumulative estimated OI change from intraday trades */
  private cumulativeOIChange: Map<string, number> = new Map();

  /** History of intraday trades */
  private intradayTrades: Map<string, IntradayTrade[]> = new Map();

  /** Event listeners */
  private eventListeners: Map<TastyTradeClientEventType, Set<TastyTradeEventListener<any>>> = new Map();

  /** Reconnection attempt counter */
  private reconnectAttempts: number = 0;

  /** Maximum reconnection attempts */
  private readonly maxReconnectAttempts: number = 5;

  /** Reconnection delay in ms */
  private readonly baseReconnectDelay: number = 1000;

  /** Keepalive interval handle */
  private keepaliveInterval: ReturnType<typeof setInterval> | null = null;

  /** Keepalive timeout in seconds */
  private readonly keepaliveTimeoutSeconds: number = 60;

  /** TastyTrade API base URL */
  private readonly apiBaseUrl: string;

  /** Whether to use sandbox environment */
  private readonly sandbox: boolean;

  /** Whether to log verbose debug information */
  private readonly verbose: boolean;

  /**
   * Creates a new TastyTradeClient instance.
   * 
   * @param options - Client configuration options
   * @param options.sessionToken - TastyTrade session token (required)
   * @param options.sandbox - Whether to use sandbox environment (default: false)
   * @param options.verbose - Whether to log verbose debug information (default: false)
   */
  constructor(options: {
    sessionToken: string;
    sandbox?: boolean;
    verbose?: boolean;
  }) {
    this.sessionToken = options.sessionToken;
    this.sandbox = options.sandbox ?? false;
    this.verbose = options.verbose ?? false;
    this.apiBaseUrl = this.sandbox 
      ? 'https://api.cert.tastyworks.com'
      : 'https://api.tastyworks.com';

    // Initialize event listener maps
    this.eventListeners.set('tickerUpdate', new Set());
    this.eventListeners.set('optionUpdate', new Set());
    this.eventListeners.set('optionTrade', new Set());
    this.eventListeners.set('connected', new Set());
    this.eventListeners.set('disconnected', new Set());
    this.eventListeners.set('error', new Set());
  }

  // ==================== Static Factory Methods ====================

  /**
   * Creates a TastyTradeClient by logging in with username/password.
   * 
   * @param username - TastyTrade username
   * @param password - TastyTrade password
   * @param options - Additional options
   * @returns Promise resolving to configured TastyTradeClient
   * 
   * @example
   * ```typescript
   * const client = await TastyTradeClient.fromCredentials(
   *   'your-username',
   *   'your-password'
   * );
   * await client.connect();
   * ```
   */
  static async fromCredentials(
    username: string,
    password: string,
    options?: { sandbox?: boolean; rememberMe?: boolean }
  ): Promise<TastyTradeClient> {
    const sandbox = options?.sandbox ?? false;
    const baseUrl = sandbox 
      ? 'https://api.cert.tastyworks.com'
      : 'https://api.tastyworks.com';

    const response = await fetch(`${baseUrl}/sessions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        login: username,
        password: password,
        'remember-me': options?.rememberMe ?? false,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`TastyTrade login failed: ${response.statusText} - ${errorText}`);
    }

    const data = await response.json() as TastyTradeSessionResponse;
    
    return new TastyTradeClient({
      sessionToken: data.data['session-token'],
      sandbox,
    });
  }

  // ==================== Public API ====================

  /**
   * Establishes a streaming connection to TastyTrade via DxLink.
   * 
   * @returns Promise that resolves when connected and authorized
   * @throws {Error} If token retrieval or WebSocket connection fails
   */
  async connect(): Promise<void> {
    // Get API quote token
    const quoteTokenData = await this.getQuoteToken();
    if (!quoteTokenData) {
      throw new Error('Failed to get TastyTrade quote token');
    }

    this.quoteToken = quoteTokenData.token;
    this.dxLinkUrl = quoteTokenData.url;

    // Connect to DxLink WebSocket
    await this.connectWebSocket();
  }

  /**
   * Disconnects from the TastyTrade streaming API.
   */
  disconnect(): void {
    if (this.keepaliveInterval) {
      clearInterval(this.keepaliveInterval);
      this.keepaliveInterval = null;
    }

    if (this.ws) {
      this.ws.close(1000, 'Client disconnect');
      this.ws = null;
    }

    this.connected = false;
    this.authorized = false;
    this.feedChannelOpened = false;
    this.subscribedSymbols.clear();
    this.streamerToOccMap.clear();
    this.occToStreamerMap.clear();
  }

  /**
   * Subscribes to real-time updates for the specified symbols.
   * 
   * @param symbols - Array of ticker symbols and/or OCC option symbols
   * 
   * @remarks
   * For options, you can pass either:
   * - OCC format symbols (e.g., 'SPY240119C00500000')
   * - TastyTrade streamer symbols (e.g., '.SPXW240119C4500')
   * 
   * The client will convert OCC symbols to streamer symbols automatically.
   */
  subscribe(symbols: string[]): void {
    // Add to tracked symbols
    symbols.forEach(s => this.subscribedSymbols.add(s));

    if (!this.connected || !this.feedChannelOpened) {
      // Will subscribe when channel opens
      return;
    }

    this.sendFeedSubscription(symbols, 'add');
  }

  /**
   * Unsubscribes from real-time updates for the specified symbols.
   * 
   * @param symbols - Array of symbols to unsubscribe from
   */
  unsubscribe(symbols: string[]): void {
    symbols.forEach(s => this.subscribedSymbols.delete(s));

    if (!this.connected || !this.feedChannelOpened) {
      return;
    }

    this.sendFeedSubscription(symbols, 'remove');
  }

  /**
   * Returns whether the client is currently connected.
   */
  isConnected(): boolean {
    return this.connected && this.authorized;
  }

  /**
   * Fetches options chain data from TastyTrade REST API.
   * 
   * @param symbol - Underlying symbol (e.g., 'SPY')
   * @returns Array of option chain items
   */
  async fetchOptionsChain(symbol: string): Promise<TastyTradeOptionChainItem[]> {
    try {
      const response = await fetch(
        `${this.apiBaseUrl}/option-chains/${symbol}/nested`,
        {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${this.sessionToken}`,
            'Accept': 'application/json',
            'User-Agent': 'floe/1.0',
          },
        }
      );

      if (!response.ok) {
        this.emit('error', new Error(`Failed to fetch options chain: ${response.statusText}`));
        return [];
      }

      const data = await response.json() as TastyTradeOptionChainResponse;
      return data.data?.items ?? [];
    } catch (error) {
      this.emit('error', error instanceof Error ? error : new Error(String(error)));
      return [];
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
        const parsed = parseOCCSymbol(occSymbol);
        if (!groups.has(parsed.symbol)) {
          groups.set(parsed.symbol, new Set());
        }
        groups.get(parsed.symbol)!.add(occSymbol);
      } catch {
        continue;
      }
    }

    // Fetch chains for each underlying
    const fetchPromises = Array.from(groups.entries()).map(async ([underlying, targetSymbols]) => {
      const chain = await this.fetchOptionsChain(underlying);

      for (const item of chain) {
        // Map streamer symbol to OCC
        const occSymbol = this.streamerSymbolToOCC(item['streamer-symbol'], item);
        
        if (targetSymbols.has(occSymbol)) {
          // Store mapping
          this.streamerToOccMap.set(item['streamer-symbol'], occSymbol);
          this.occToStreamerMap.set(occSymbol, item['streamer-symbol']);

          // Store base OI
          if (item['open-interest'] !== undefined) {
            this.baseOpenInterest.set(occSymbol, item['open-interest']);
            
            if (this.verbose) {
              console.log(`[TastyTrade:OI] Base OI set for ${occSymbol}: ${item['open-interest']}`);
            }
          }

          if (!this.cumulativeOIChange.has(occSymbol)) {
            this.cumulativeOIChange.set(occSymbol, 0);
          }

          // Create or update option in cache
          const existing = this.optionCache.get(occSymbol);
          const option: NormalizedOption = {
            occSymbol,
            underlying: item.underlying || item['root-symbol'],
            strike: item.strike,
            expiration: item['expiration-date'],
            expirationTimestamp: new Date(item['expiration-date']).getTime(),
            optionType: item['option-type'] === 'C' ? 'call' : 'put',
            bid: item.bid ?? existing?.bid ?? 0,
            bidSize: item['bid-size'] ?? existing?.bidSize ?? 0,
            ask: item.ask ?? existing?.ask ?? 0,
            askSize: item['ask-size'] ?? existing?.askSize ?? 0,
            mark: ((item.bid ?? 0) + (item.ask ?? 0)) / 2,
            last: item.last ?? existing?.last ?? 0,
            volume: item.volume ?? existing?.volume ?? 0,
            openInterest: item['open-interest'] ?? existing?.openInterest ?? 0,
            liveOpenInterest: this.calculateLiveOpenInterest(occSymbol),
            impliedVolatility: item['implied-volatility'] ?? existing?.impliedVolatility ?? 0,
            timestamp: Date.now(),
          };

          this.optionCache.set(occSymbol, option);
          this.emit('optionUpdate', option);
        }
      }
    });

    await Promise.all(fetchPromises);
  }

  /**
   * Returns cached option data for a symbol.
   */
  getOption(occSymbol: string): NormalizedOption | undefined {
    return this.optionCache.get(occSymbol);
  }

  /**
   * Returns all cached options.
   */
  getAllOptions(): Map<string, NormalizedOption> {
    return new Map(this.optionCache);
  }

  /**
   * Registers an event listener.
   */
  on<T>(event: TastyTradeClientEventType, listener: TastyTradeEventListener<T>): this {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      listeners.add(listener);
    }
    return this;
  }

  /**
   * Removes an event listener.
   */
  off<T>(event: TastyTradeClientEventType, listener: TastyTradeEventListener<T>): this {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      listeners.delete(listener);
    }
    return this;
  }

  /**
   * Returns intraday trades for an option.
   */
  getIntradayTrades(occSymbol: string): IntradayTrade[] {
    return this.intradayTrades.get(occSymbol) ?? [];
  }

  /**
   * Returns flow summary for an option.
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
   * Resets intraday tracking data.
   */
  resetIntradayData(occSymbols?: string[]): void {
    const symbolsToReset = occSymbols ?? Array.from(this.intradayTrades.keys());
    
    for (const symbol of symbolsToReset) {
      this.intradayTrades.delete(symbol);
      this.cumulativeOIChange.set(symbol, 0);
    }
  }

  // ==================== Private Methods ====================

  /**
   * Gets API quote token from TastyTrade.
   */
  private async getQuoteToken(): Promise<{ token: string; url: string } | null> {
    try {
      const response = await fetch(`${this.apiBaseUrl}/api-quote-tokens`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.sessionToken}`,
          'Accept': 'application/json',
          'User-Agent': 'floe/1.0',
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        this.emit('error', new Error(`Failed to get quote token: ${response.statusText} - ${errorText}`));
        return null;
      }

      const data = await response.json() as TastyTradeQuoteTokenResponse;
      return {
        token: data.data.token,
        url: data.data['dxlink-url'],
      };
    } catch (error) {
      this.emit('error', error instanceof Error ? error : new Error(String(error)));
      return null;
    }
  }

  /**
   * Connects to DxLink WebSocket.
   */
  private connectWebSocket(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.dxLinkUrl) {
        reject(new Error('DxLink URL not available'));
        return;
      }

      this.ws = new WebSocket(this.dxLinkUrl);

      this.ws.onopen = () => {
        this.connected = true;
        this.reconnectAttempts = 0;

        // Send SETUP message
        this.sendSetup();
      };

      this.ws.onmessage = (event) => {
        this.handleMessage(event.data, resolve);
      };

      this.ws.onclose = (event) => {
        this.connected = false;
        this.authorized = false;
        this.feedChannelOpened = false;
        this.emit('disconnected', { reason: event.reason });

        if (event.code !== 1000) {
          this.attemptReconnect();
        }
      };

      this.ws.onerror = (error) => {
        this.emit('error', new Error('DxLink WebSocket error'));
        reject(error);
      };
    });
  }

  /**
   * Sends SETUP message to DxLink.
   */
  private sendSetup(): void {
    const setupMessage: DxLinkSetupMessage = {
      type: 'SETUP',
      channel: 0,
      version: '0.1-DXF-JS/1.0.0',
      keepaliveTimeout: this.keepaliveTimeoutSeconds,
      acceptKeepaliveTimeout: this.keepaliveTimeoutSeconds,
    };

    this.sendMessage(setupMessage);
  }

  /**
   * Sends AUTH message to DxLink.
   */
  private sendAuth(): void {
    if (!this.quoteToken) {
      this.emit('error', new Error('No quote token available for auth'));
      return;
    }

    const authMessage: DxLinkAuthMessage = {
      type: 'AUTH',
      channel: 0,
      token: this.quoteToken,
    };

    this.sendMessage(authMessage);
  }

  /**
   * Opens a FEED channel.
   */
  private openFeedChannel(): void {
    const channelRequest: DxLinkChannelRequestMessage = {
      type: 'CHANNEL_REQUEST',
      channel: this.feedChannelId,
      service: 'FEED',
      parameters: {
        contract: 'AUTO',
      },
    };

    this.sendMessage(channelRequest);
  }

  /**
   * Configures the feed channel with desired event fields.
   */
  private setupFeed(): void {
    const feedSetup: DxLinkFeedSetupMessage = {
      type: 'FEED_SETUP',
      channel: this.feedChannelId,
      acceptAggregationPeriod: 0.1,
      acceptDataFormat: 'COMPACT',
      acceptEventFields: FEED_EVENT_FIELDS,
    };

    this.sendMessage(feedSetup);

    // Subscribe to any queued symbols
    if (this.subscribedSymbols.size > 0) {
      this.sendFeedSubscription(Array.from(this.subscribedSymbols), 'add');
    }
  }

  /**
   * Sends feed subscription message.
   */
  private sendFeedSubscription(symbols: string[], action: 'add' | 'remove'): void {
    // Build subscription entries for each symbol with relevant event types
    const entries: Array<{ type: string; symbol: string }> = [];

    for (const symbol of symbols) {
      const streamerSymbol = this.getStreamerSymbol(symbol);
      const isOption = this.isOptionSymbol(symbol) || streamerSymbol.startsWith('.');

      if (isOption) {
        // Subscribe to option-relevant events
        entries.push({ type: 'Quote', symbol: streamerSymbol });
        entries.push({ type: 'Trade', symbol: streamerSymbol });
        entries.push({ type: 'Greeks', symbol: streamerSymbol });
        entries.push({ type: 'Summary', symbol: streamerSymbol });
      } else {
        // Subscribe to equity events
        entries.push({ type: 'Quote', symbol: streamerSymbol });
        entries.push({ type: 'Trade', symbol: streamerSymbol });
        entries.push({ type: 'TradeETH', symbol: streamerSymbol });
        entries.push({ type: 'Summary', symbol: streamerSymbol });
        entries.push({ type: 'Profile', symbol: streamerSymbol });
      }
    }

    const subscriptionMessage: DxLinkFeedSubscriptionMessage = {
      type: 'FEED_SUBSCRIPTION',
      channel: this.feedChannelId,
      [action]: entries,
    };

    if (action === 'add') {
      subscriptionMessage.reset = false;
    }

    this.sendMessage(subscriptionMessage);
  }

  /**
   * Gets streamer symbol from OCC or ticker symbol.
   */
  private getStreamerSymbol(symbol: string): string {
    // Check if we already have a mapping
    const cached = this.occToStreamerMap.get(symbol);
    if (cached) {
      return cached;
    }

    // If it's already a streamer symbol (starts with .), return as-is
    if (symbol.startsWith('.')) {
      return symbol;
    }

    // If it's an OCC option symbol, try to convert
    if (this.isOptionSymbol(symbol)) {
      try {
        const parsed = parseOCCSymbol(symbol);
        // TastyTrade streamer format: .UNDERLYING + YYMMDD + C/P + STRIKE
        // e.g., .SPXW231215C4500
        const expDate = parsed.expiration;
        const yy = expDate.getFullYear().toString().slice(-2);
        const mm = (expDate.getMonth() + 1).toString().padStart(2, '0');
        const dd = expDate.getDate().toString().padStart(2, '0');
        const optType = parsed.optionType === 'call' ? 'C' : 'P';
        const strike = parsed.strike;

        // Format strike - remove trailing zeros and decimal if whole number
        const strikeStr = strike % 1 === 0 ? strike.toString() : strike.toFixed(2);

        return `.${parsed.symbol}${yy}${mm}${dd}${optType}${strikeStr}`;
      } catch {
        // Fall through to return as-is
      }
    }

    // Return as-is for equities or unrecognized symbols
    return symbol;
  }

  /**
   * Converts streamer symbol back to OCC format.
   */
  private streamerSymbolToOCC(streamerSymbol: string, item?: TastyTradeOptionChainItem): string {
    // Check cache first
    const cached = this.streamerToOccMap.get(streamerSymbol);
    if (cached) {
      return cached;
    }

    // If we have chain item data, build OCC from it
    if (item) {
      // Build OCC symbol from item data
      const underlying = item['root-symbol'] || item.underlying;
      const expDate = new Date(item['expiration-date']);
      const yy = expDate.getFullYear().toString().slice(-2);
      const mm = (expDate.getMonth() + 1).toString().padStart(2, '0');
      const dd = expDate.getDate().toString().padStart(2, '0');
      const optType = item['option-type'];
      const strike = Math.round(item.strike * 1000).toString().padStart(8, '0');

      return `${underlying}${yy}${mm}${dd}${optType}${strike}`;
    }

    // Parse streamer symbol format: .SYMBOL + YYMMDD + C/P + STRIKE
    if (streamerSymbol.startsWith('.')) {
      const match = streamerSymbol.match(/^\.([A-Z]+)(\d{6})([CP])(.+)$/);
      if (match) {
        const [, underlying, dateStr, optType, strikeStr] = match;
        const strike = parseFloat(strikeStr);
        const strikeFormatted = Math.round(strike * 1000).toString().padStart(8, '0');
        return `${underlying}${dateStr}${optType}${strikeFormatted}`;
      }
    }

    // Return as-is if not an option
    return streamerSymbol;
  }

  /**
   * Starts keepalive interval.
   */
  private startKeepalive(): void {
    if (this.keepaliveInterval) {
      clearInterval(this.keepaliveInterval);
    }

    // Send keepalive every 30 seconds (half of timeout)
    this.keepaliveInterval = setInterval(() => {
      if (this.connected && this.ws) {
        const keepalive: DxLinkKeepaliveMessage = {
          type: 'KEEPALIVE',
          channel: 0,
        };
        this.sendMessage(keepalive);
      }
    }, 30000);
  }

  /**
   * Handles incoming WebSocket messages.
   */
  private handleMessage(data: string, connectResolve?: (value: void) => void): void {
    try {
      const message = JSON.parse(data) as DxLinkMessage;

      switch (message.type) {
        case 'SETUP':
          // Server acknowledged setup, send auth
          this.sendAuth();
          break;

        case 'AUTH_STATE':
          this.handleAuthState(message as DxLinkAuthStateMessage, connectResolve);
          break;

        case 'CHANNEL_OPENED':
          this.handleChannelOpened(message as DxLinkChannelOpenedMessage);
          break;

        case 'FEED_CONFIG':
          // Feed is configured, ready for subscriptions
          this.feedChannelOpened = true;
          
          // Subscribe to queued symbols
          if (this.subscribedSymbols.size > 0) {
            this.sendFeedSubscription(Array.from(this.subscribedSymbols), 'add');
          }
          break;

        case 'FEED_DATA':
          this.handleFeedData(message as DxLinkFeedDataMessage);
          break;

        case 'ERROR':
          this.handleError(message as DxLinkErrorMessage);
          break;

        case 'KEEPALIVE':
          // Server keepalive, no action needed
          break;
      }
    } catch (error) {
      // Ignore parse errors
    }
  }

  /**
   * Handles AUTH_STATE message.
   */
  private handleAuthState(message: DxLinkAuthStateMessage, connectResolve?: (value: void) => void): void {
    if (message.state === 'AUTHORIZED') {
      this.authorized = true;
      this.startKeepalive();
      this.openFeedChannel();
      if (this.verbose) {
        console.log('[TastyTrade:DxLink] Authorized and connected');
      }
      this.emit('connected', undefined);
      connectResolve?.();
    } else {
      this.emit('error', new Error('DxLink authorization failed'));
    }
  }

  /**
   * Handles CHANNEL_OPENED message.
   */
  private handleChannelOpened(message: DxLinkChannelOpenedMessage): void {
    if (message.channel === this.feedChannelId && message.service === 'FEED') {
      // Configure the feed
      this.setupFeed();
    }
  }

  /**
   * Handles FEED_DATA message.
   */
  private handleFeedData(message: DxLinkFeedDataMessage): void {
    const { data } = message;
    
    // COMPACT format: [eventType, [values...], eventType, [values...], ...]
    let i = 0;
    while (i < data.length) {
      const eventType = data[i] as string;
      i++;
      
      if (i >= data.length) break;
      const values = data[i] as (string | number | null)[];
      i++;

      this.processEventData(eventType, values);
    }
  }

  /**
   * Processes a single event from FEED_DATA.
   */
  private processEventData(eventType: string, values: (string | number | null)[]): void {
    // Values are in order of acceptEventFields
    const fields = FEED_EVENT_FIELDS[eventType as keyof typeof FEED_EVENT_FIELDS];
    if (!fields) return;

    // Parse into object
    const event: Record<string, string | number | null> = {};
    for (let i = 0; i < fields.length && i < values.length; i++) {
      event[fields[i]] = values[i];
    }

    const streamerSymbol = event.eventSymbol as string;
    if (!streamerSymbol) return;

    // Determine if this is an option
    const isOption = streamerSymbol.startsWith('.');
    const occSymbol = isOption ? this.streamerSymbolToOCC(streamerSymbol) : streamerSymbol;
    const timestamp = Date.now();

    switch (eventType) {
      case 'Quote':
        this.handleQuoteEvent(occSymbol, event, timestamp, isOption);
        break;
      case 'Trade':
      case 'TradeETH':
        this.handleTradeEvent(occSymbol, event, timestamp, isOption);
        break;
      case 'Greeks':
        this.handleGreeksEvent(occSymbol, event, timestamp);
        break;
      case 'Summary':
        this.handleSummaryEvent(occSymbol, event, timestamp, isOption);
        break;
    }
  }

  /**
   * Handles Quote events.
   */
  private handleQuoteEvent(
    symbol: string, 
    event: Record<string, string | number | null>, 
    timestamp: number,
    isOption: boolean
  ): void {
    const bidPrice = this.toNumber(event.bidPrice);
    const askPrice = this.toNumber(event.askPrice);
    const bidSize = this.toNumber(event.bidSize);
    const askSize = this.toNumber(event.askSize);

    if (isOption) {
      this.updateOptionFromQuote(symbol, bidPrice, askPrice, bidSize, askSize, timestamp);
    } else {
      this.updateTickerFromQuote(symbol, bidPrice, askPrice, bidSize, askSize, timestamp);
    }
  }

  /**
   * Handles Trade events.
   */
  private handleTradeEvent(
    symbol: string,
    event: Record<string, string | number | null>,
    timestamp: number,
    isOption: boolean
  ): void {
    const price = this.toNumber(event.price);
    const size = this.toNumber(event.size);
    const dayVolume = this.toNumber(event.dayVolume);

    if (isOption) {
      this.updateOptionFromTrade(symbol, price, size, dayVolume, timestamp);
    } else {
      this.updateTickerFromTrade(symbol, price, size, dayVolume, timestamp);
    }
  }

  /**
   * Handles Greeks events.
   */
  private handleGreeksEvent(
    occSymbol: string,
    event: Record<string, string | number | null>,
    timestamp: number
  ): void {
    const existing = this.optionCache.get(occSymbol);
    if (!existing) return;

    const volatility = this.toNumber(event.volatility);
    
    if (volatility > 0) {
      existing.impliedVolatility = volatility;
      existing.timestamp = timestamp;
      this.optionCache.set(occSymbol, existing);
      this.emit('optionUpdate', existing);
    }
  }

  /**
   * Handles Summary events (includes open interest).
   */
  private handleSummaryEvent(
    symbol: string,
    event: Record<string, string | number | null>,
    timestamp: number,
    isOption: boolean
  ): void {
    if (!isOption) return;

    const openInterest = this.toNumber(event.openInterest);
    const existing = this.optionCache.get(symbol);
    
    if (existing && openInterest > 0) {
      existing.openInterest = openInterest;
      existing.liveOpenInterest = this.calculateLiveOpenInterest(symbol);
      existing.timestamp = timestamp;
      this.optionCache.set(symbol, existing);
      this.emit('optionUpdate', existing);

      // Update base OI if not set
      if (!this.baseOpenInterest.has(symbol)) {
        this.baseOpenInterest.set(symbol, openInterest);
        if (this.verbose) {
          console.log(`[TastyTrade:OI] Base OI set from stream for ${symbol}: ${openInterest}`);
        }
      }
    }
  }

  /**
   * Updates ticker from Quote event.
   */
  private updateTickerFromQuote(
    symbol: string,
    bidPrice: number,
    askPrice: number,
    bidSize: number,
    askSize: number,
    timestamp: number
  ): void {
    const existing = this.tickerCache.get(symbol);

    const ticker: NormalizedTicker = {
      symbol,
      spot: bidPrice > 0 && askPrice > 0 ? (bidPrice + askPrice) / 2 : existing?.spot ?? 0,
      bid: bidPrice,
      bidSize,
      ask: askPrice,
      askSize,
      last: existing?.last ?? 0,
      volume: existing?.volume ?? 0,
      timestamp,
    };

    this.tickerCache.set(symbol, ticker);
    this.emit('tickerUpdate', ticker);
  }

  /**
   * Updates ticker from Trade event.
   */
  private updateTickerFromTrade(
    symbol: string,
    price: number,
    size: number,
    dayVolume: number,
    timestamp: number
  ): void {
    const existing = this.tickerCache.get(symbol);

    const ticker: NormalizedTicker = {
      symbol,
      spot: existing?.spot ?? price,
      bid: existing?.bid ?? 0,
      bidSize: existing?.bidSize ?? 0,
      ask: existing?.ask ?? 0,
      askSize: existing?.askSize ?? 0,
      last: price,
      volume: dayVolume > 0 ? dayVolume : (existing?.volume ?? 0) + size,
      timestamp,
    };

    this.tickerCache.set(symbol, ticker);
    this.emit('tickerUpdate', ticker);
  }

  /**
   * Updates option from Quote event.
   */
  private updateOptionFromQuote(
    occSymbol: string,
    bidPrice: number,
    askPrice: number,
    bidSize: number,
    askSize: number,
    timestamp: number
  ): void {
    const existing = this.optionCache.get(occSymbol);

    // Parse OCC symbol if we don't have existing data
    let parsed: { symbol: string; expiration: Date; optionType: OptionType; strike: number };
    try {
      parsed = parseOCCSymbol(occSymbol);
    } catch {
      // Try to use existing data or skip
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
      bid: bidPrice,
      bidSize,
      ask: askPrice,
      askSize,
      mark: bidPrice > 0 && askPrice > 0 ? (bidPrice + askPrice) / 2 : existing?.mark ?? 0,
      last: existing?.last ?? 0,
      volume: existing?.volume ?? 0,
      openInterest: existing?.openInterest ?? 0,
      liveOpenInterest: this.calculateLiveOpenInterest(occSymbol),
      impliedVolatility: existing?.impliedVolatility ?? 0,
      timestamp,
    };

    this.optionCache.set(occSymbol, option);
    this.emit('optionUpdate', option);
  }

  /**
   * Updates option from Trade event.
   */
  private updateOptionFromTrade(
    occSymbol: string,
    price: number,
    size: number,
    dayVolume: number,
    timestamp: number
  ): void {
    const existing = this.optionCache.get(occSymbol);

    // Parse OCC symbol
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

    // Determine aggressor side
    const bid = existing?.bid ?? 0;
    const ask = existing?.ask ?? 0;
    const aggressorSide = this.determineAggressorSide(price, bid, ask);

    // Calculate OI change
    const estimatedOIChange = this.calculateOIChangeFromTrade(aggressorSide, size, parsed.optionType);
    const currentChange = this.cumulativeOIChange.get(occSymbol) ?? 0;
    this.cumulativeOIChange.set(occSymbol, currentChange + estimatedOIChange);
    
    if (this.verbose && estimatedOIChange !== 0) {
      const baseOI = this.baseOpenInterest.get(occSymbol) ?? 0;
      const newLiveOI = Math.max(0, baseOI + currentChange + estimatedOIChange);
      console.log(`[TastyTrade:OI] ${occSymbol} trade: price=${price.toFixed(2)}, size=${size}, aggressor=${aggressorSide}, OI change=${estimatedOIChange > 0 ? '+' : ''}${estimatedOIChange}, liveOI=${newLiveOI} (base=${baseOI}, cumulative=${currentChange + estimatedOIChange})`);
    }

    // Record trade
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
      volume: dayVolume > 0 ? dayVolume : (existing?.volume ?? 0) + size,
      openInterest: existing?.openInterest ?? 0,
      liveOpenInterest: this.calculateLiveOpenInterest(occSymbol),
      impliedVolatility: existing?.impliedVolatility ?? 0,
      timestamp,
    };

    this.optionCache.set(occSymbol, option);
    this.emit('optionUpdate', option);
  }

  /**
   * Determines aggressor side from trade price vs NBBO.
   */
  private determineAggressorSide(tradePrice: number, bid: number, ask: number): AggressorSide {
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
   * Calculates estimated OI change from trade.
   */
  private calculateOIChangeFromTrade(
    aggressorSide: AggressorSide,
    size: number,
    _optionType: OptionType
  ): number {
    if (aggressorSide === 'unknown') return 0;
    return aggressorSide === 'buy' ? size : -size;
  }

  /**
   * Calculates live open interest.
   */
  private calculateLiveOpenInterest(occSymbol: string): number {
    const baseOI = this.baseOpenInterest.get(occSymbol) ?? 0;
    const cumulativeChange = this.cumulativeOIChange.get(occSymbol) ?? 0;
    return Math.max(0, baseOI + cumulativeChange);
  }

  /**
   * Handles DxLink error messages.
   */
  private handleError(message: DxLinkErrorMessage): void {
    this.emit('error', new Error(`DxLink error: ${message.error} - ${message.message}`));
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
      console.log(`[TastyTrade:DxLink] Reconnection attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${delay}ms`);
    }

    await this.sleep(delay);

    try {
      await this.connect();
    } catch {
      // Will try again via onclose
    }
  }

  /**
   * Checks if symbol is an OCC option symbol.
   */
  private isOptionSymbol(symbol: string): boolean {
    return OCC_OPTION_PATTERN.test(symbol);
  }

  /**
   * Sends a message to the WebSocket.
   */
  private sendMessage(message: DxLinkMessage): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  /**
   * Emits an event to all listeners.
   */
  private emit<T>(event: TastyTradeClientEventType, data: T): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      listeners.forEach(listener => {
        try {
          listener(data);
        } catch (error) {
          console.error('Event listener error:', error);
        }
      });
    }
  }

  /**
   * Converts value to number, handling NaN and null.
   */
  private toNumber(value: string | number | null | undefined): number {
    if (value === null || value === undefined) return 0;
    if (typeof value === 'number') return isNaN(value) ? 0 : value;
    const num = parseFloat(value);
    return isNaN(num) ? 0 : num;
  }

  /**
   * Sleep utility.
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}