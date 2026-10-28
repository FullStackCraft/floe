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
export type TastyTradeClientEventType = BrokerClientEventType;
export type TastyTradeEventListener<T> = BrokerEventListener<T>;

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
 * DxLink FEED_CONFIG response - confirms the feed format.
 * `eventFields` is the field order the server will actually use for COMPACT data.
 */
interface DxLinkFeedConfigMessage extends DxLinkMessage {
  type: 'FEED_CONFIG';
  aggregationPeriod?: number;
  dataFormat?: 'COMPACT' | 'FULL';
  eventFields?: Record<string, string[]>;
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
 * COMPACT format: [eventType, [event1 fields..., event2 fields..., ...], eventType, [...], ...]
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
 * One strike of a nested option chain expiration
 */
export interface TastyTradeNestedStrike {
  'strike-price': string;
  call: string;
  'call-streamer-symbol': string;
  put: string;
  'put-streamer-symbol': string;
}

/**
 * One expiration of a nested option chain
 */
export interface TastyTradeNestedExpiration {
  'expiration-type': string;
  'expiration-date': string;
  'days-to-expiration': number;
  'settlement-type': string;
  strikes: TastyTradeNestedStrike[];
}

/**
 * Item from GET /option-chains/{symbol}/nested (one per option root, e.g. SPX and SPXW).
 * Instruments only: the chain endpoints carry no quotes or open interest.
 */
export interface TastyTradeNestedOptionChain {
  'underlying-symbol': string;
  'root-symbol': string;
  'option-chain-type': string;
  'shares-per-contract': number;
  expirations: TastyTradeNestedExpiration[];
}

/**
 * TastyTrade nested option chain response
 */
interface TastyTradeNestedOptionChainResponse {
  data: {
    items: TastyTradeNestedOptionChain[];
  };
  context: string;
}

/**
 * TastyTrade error envelope: { error: { code, message, errors? } }
 */
interface TastyTradeErrorBody {
  error?: {
    code?: string;
    message?: string;
  };
}

/**
 * Error from the TastyTrade REST API or DxLink authorization.
 *
 * @remarks
 * `status` is the HTTP status. 401 means the OAuth access token is missing or
 * expired (they last 15 minutes). `code` is TastyTrade's error code when the
 * response has one, e.g. 'unauthorized' or 'quote_streamer.customer_not_found_error'
 * (the account isn't fully onboarded, so it can't get a quote token).
 */
export class TastyTradeApiError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'TastyTradeApiError';
    this.status = status;
    this.code = code;
    Object.setPrototypeOf(this, TastyTradeApiError.prototype);
  }
}

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

/** Default time to wait for DxLink AUTHORIZED before connect() rejects */
const DEFAULT_CONNECT_TIMEOUT_MS = 15000;

/**
 * TastyTrade client configuration options
 */
export interface TastyTradeClientOptions extends BaseBrokerClientOptions {
  /**
   * TastyTrade OAuth access token (required). The name predates OAuth: the
   * legacy session tokens from POST /sessions were retired on 2026-02-11.
   */
  sessionToken: string;
  /** Whether to use sandbox environment (default: false) */
  sandbox?: boolean;
  /** How long connect() waits for DxLink authorization, in ms (default: 15000) */
  connectTimeoutMs?: number;
}

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
 * 1. Get an OAuth access token (POST /oauth/token); they last 15 minutes
 * 2. Use it to get an API quote token from /api-quote-tokens (lasts 24 hours)
 * 3. Connect to DxLink WebSocket using the quote token
 *
 * An open stream only needs the quote token, so it keeps running after the
 * access token expires. Reconnects fetch a new quote token, so keep the access
 * token current with {@link updateAuthToken}.
 *
 * @example
 * ```typescript
 * const client = new TastyTradeClient({
 *   sessionToken: 'your-oauth-access-token'
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
export class TastyTradeClient extends BaseBrokerClient {
  protected readonly brokerName = 'TastyTrade';

  /** TastyTrade OAuth access token, used for REST calls */
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

  /** Map from streamer symbol to OCC symbol */
  private streamerToOccMap: Map<string, string> = new Map();

  /** Map from OCC symbol to streamer symbol */
  private occToStreamerMap: Map<string, string> = new Map();

  /** Keepalive interval handle */
  private keepaliveInterval: ReturnType<typeof setInterval> | null = null;

  /**
   * Whether AUTH has been sent on the current socket. The server's first
   * AUTH_STATE after SETUP is always UNAUTHORIZED; that is the cue to send AUTH.
   */
  private authSent: boolean = false;

  /** Field order per event type for COMPACT decoding (FEED_CONFIG can override) */
  private eventFields: Record<string, string[]> = { ...FEED_EVENT_FIELDS };

  /** Settles the promise returned by connectWebSocket() */
  private pendingConnect: {
    resolve: () => void;
    reject: (error: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  } | null = null;

  /** Set by disconnect() so a closing socket doesn't trigger a reconnect */
  private intentionalDisconnect: boolean = false;

  /** Whether a reconnect loop is running */
  private reconnecting: boolean = false;

  /** Keepalive timeout in seconds */
  private readonly keepaliveTimeoutSeconds: number = 60;

  /** How long to wait for DxLink authorization */
  private readonly connectTimeoutMs: number;

  /** TastyTrade API base URL */
  private readonly apiBaseUrl: string;

  /** Whether to use sandbox environment */
  private readonly sandbox: boolean;

  /**
   * Creates a new TastyTradeClient instance.
   *
   * @param options - Client configuration options
   * @param options.sessionToken - TastyTrade OAuth access token (required)
   * @param options.sandbox - Whether to use sandbox environment (default: false)
   * @param options.verbose - Whether to log verbose debug information (default: false)
   */
  constructor(options: TastyTradeClientOptions) {
    super(options);
    this.sessionToken = options.sessionToken;
    this.sandbox = options.sandbox ?? false;
    this.connectTimeoutMs = options.connectTimeoutMs ?? DEFAULT_CONNECT_TIMEOUT_MS;
    this.apiBaseUrl = this.sandbox
      ? 'https://api.cert.tastyworks.com'
      : 'https://api.tastyworks.com';
  }

  // ==================== Static Factory Methods ====================

  /**
   * Creates a TastyTradeClient by logging in with username/password.
   *
   * @deprecated TastyTrade retired POST /sessions on 2026-02-11, so this always
   * fails now. Get an OAuth access token from POST /oauth/token and pass it as
   * `sessionToken` instead.
   *
   * @param username - TastyTrade username
   * @param password - TastyTrade password
   * @param options - Additional options
   * @returns Promise resolving to configured TastyTradeClient
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
   * @throws {TastyTradeApiError} If the quote token request fails (401 = expired access token)
   * @throws {Error} If the WebSocket fails or DxLink doesn't authorize within the timeout
   */
  async connect(): Promise<void> {
    this.intentionalDisconnect = false;
    await this.openStream();
  }

  /**
   * Disconnects from the TastyTrade streaming API.
   */
  disconnect(): void {
    this.intentionalDisconnect = true;
    const hadSocket = this.ws !== null;

    this.failPendingConnect(new Error('Client disconnect'));
    this.teardownSocket('Client disconnect');

    this.subscribedSymbols.clear();
    this.streamerToOccMap.clear();
    this.occToStreamerMap.clear();

    if (hadSocket) {
      this.emit('disconnected', { reason: 'Client disconnect' });
    }
  }

  /**
   * Replaces the OAuth access token used for REST calls.
   *
   * @param accessToken - A current TastyTrade OAuth access token
   *
   * @remarks
   * The open DxLink stream is untouched; the new token is used the next time
   * the client needs a quote token (on reconnect) or calls the REST API.
   */
  updateAuthToken(accessToken: string): void {
    this.sessionToken = accessToken;
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
   * Subscriptions survive reconnects.
   */
  subscribe(symbols: string[]): void {
    // Add to tracked symbols
    symbols.forEach(s => this.subscribedSymbols.add(s));

    if (!this.connected || !this.feedChannelOpened) {
      // Will subscribe when the feed is configured
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
   * Unsubscribes from all real-time updates.
   */
  unsubscribeFromAll(): void {
    const symbols = Array.from(this.subscribedSymbols);
    this.subscribedSymbols.clear();
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
   * Fetches the nested option chain (instruments only) from TastyTrade REST API.
   *
   * @param symbol - Underlying symbol (e.g., 'SPY')
   * @returns One item per option root, each with expirations and strikes
   */
  async fetchOptionsChain(symbol: string): Promise<TastyTradeNestedOptionChain[]> {
    try {
      const response = await fetch(
        `${this.apiBaseUrl}/option-chains/${encodeURIComponent(symbol)}/nested`,
        {
          method: 'GET',
          headers: this.apiHeaders(),
        }
      );

      if (!response.ok) {
        this.emit('error', await this.toApiError(response, 'Failed to fetch options chain'));
        return [];
      }

      const data = await response.json() as TastyTradeNestedOptionChainResponse;
      return data.data?.items ?? [];
    } catch (error) {
      this.emit('error', error instanceof Error ? error : new Error(String(error)));
      return [];
    }
  }

  /**
   * Open interest for subscribed options.
   *
   * @param _occSymbols - OCC option symbols (unused, see remarks)
   *
   * @remarks
   * TastyTrade has no REST source for per-contract open interest: the option
   * chain endpoints return instruments only, and /market-data/by-type has no OI
   * field. OI arrives on the DxLink `Summary` event, which is part of every option
   * subscription, so this resolves immediately.
   */
  async fetchOpenInterest(_occSymbols: string[]): Promise<void> {
    return;
  }

  // ==================== Private Methods ====================

  /**
   * Fetches a quote token and opens an authorized DxLink socket.
   */
  private async openStream(): Promise<void> {
    const quoteTokenData = await this.getQuoteToken();
    this.quoteToken = quoteTokenData.token;
    this.dxLinkUrl = quoteTokenData.url;

    await this.connectWebSocket();
  }

  /**
   * Headers for TastyTrade REST calls.
   */
  private apiHeaders(): Record<string, string> {
    return {
      'Authorization': `Bearer ${this.sessionToken}`,
      'Accept': 'application/json',
      'User-Agent': 'floe/1.0',
    };
  }

  /**
   * Builds a TastyTradeApiError from a failed response, reading TastyTrade's
   * { error: { code, message } } envelope when present.
   */
  private async toApiError(response: Response, prefix: string): Promise<TastyTradeApiError> {
    let code: string | undefined;
    let detail = response.statusText;

    try {
      const text = await response.text();
      try {
        const body = JSON.parse(text) as TastyTradeErrorBody;
        code = body.error?.code;
        detail = body.error?.message || detail;
      } catch {
        if (text) detail = text.slice(0, 200);
      }
    } catch {
      // Body unreadable; keep statusText
    }

    return new TastyTradeApiError(
      `${prefix}: ${response.status}${code ? ` ${code}` : ''} - ${detail}`,
      response.status,
      code
    );
  }

  /**
   * Gets API quote token from TastyTrade.
   */
  private async getQuoteToken(): Promise<{ token: string; url: string }> {
    const response = await fetch(`${this.apiBaseUrl}/api-quote-tokens`, {
      method: 'GET',
      headers: this.apiHeaders(),
    });

    if (!response.ok) {
      throw await this.toApiError(response, 'Failed to get TastyTrade quote token');
    }

    const data = await response.json() as TastyTradeQuoteTokenResponse;
    const token = data?.data?.token;
    const url = data?.data?.['dxlink-url'];
    if (!token || !url) {
      throw new TastyTradeApiError('TastyTrade quote token response is missing token or dxlink-url', response.status);
    }

    return { token, url };
  }

  /**
   * Connects to DxLink WebSocket. Resolves once DxLink reports AUTHORIZED.
   */
  private connectWebSocket(): Promise<void> {
    const url = this.dxLinkUrl;
    if (!url) {
      return Promise.reject(new Error('DxLink URL not available'));
    }

    // Drop any previous socket quietly; its handlers are detached
    this.failPendingConnect(new Error('Superseded by a new connection'));
    this.teardownSocket('Reconnecting');
    this.authSent = false;
    this.eventFields = { ...FEED_EVENT_FIELDS };

    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.failPendingConnect(new Error(`Timed out after ${this.connectTimeoutMs}ms waiting for DxLink authorization`));
        this.teardownSocket('Connect timeout');
      }, this.connectTimeoutMs);
      this.pendingConnect = { resolve, reject, timer };

      const ws = new WebSocket(url);
      this.ws = ws;

      ws.onopen = () => {
        if (this.ws !== ws) return;
        this.connected = true;

        // Send SETUP message
        this.sendSetup();
      };

      ws.onmessage = (event) => {
        if (this.ws !== ws) return;
        this.handleMessage(String(event.data));
      };

      ws.onerror = () => {
        if (this.ws !== ws) return;
        // A close event always follows; it handles reconnects
        this.failPendingConnect(new Error('DxLink WebSocket error'));
      };

      ws.onclose = (event) => {
        if (this.ws !== ws) return;
        this.handleSocketClose(event);
      };
    });
  }

  /**
   * Handles the current socket closing (not one we tore down ourselves).
   */
  private handleSocketClose(event: { code: number; reason: string }): void {
    const wasAuthorized = this.authorized;

    this.stopKeepalive();
    this.ws = null;
    this.connected = false;
    this.authorized = false;
    this.feedChannelOpened = false;

    this.failPendingConnect(new Error(`DxLink connection closed before authorization (code ${event.code})`));
    this.emit('disconnected', { reason: event.reason });

    // Only an established stream reconnects on its own. A failed connect is
    // reported to whoever is awaiting it (the caller or the reconnect loop).
    if (wasAuthorized && !this.intentionalDisconnect) {
      this.attemptReconnect();
    }
  }

  /**
   * Closes the current socket without firing its handlers.
   */
  private teardownSocket(reason: string): void {
    this.stopKeepalive();

    const ws = this.ws;
    this.ws = null;
    this.connected = false;
    this.authorized = false;
    this.feedChannelOpened = false;

    if (!ws) return;

    ws.onopen = null;
    ws.onmessage = null;
    ws.onerror = null;
    ws.onclose = null;

    if (ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.OPEN) {
      try {
        ws.close(1000, reason);
      } catch {
        // Already closing
      }
    }
  }

  /**
   * Resolves the pending connect, if any.
   */
  private resolvePendingConnect(): void {
    const pending = this.pendingConnect;
    if (!pending) return;
    this.pendingConnect = null;
    clearTimeout(pending.timer);
    pending.resolve();
  }

  /**
   * Rejects the pending connect, if any.
   */
  private failPendingConnect(error: Error): void {
    const pending = this.pendingConnect;
    if (!pending) return;
    this.pendingConnect = null;
    clearTimeout(pending.timer);
    pending.reject(error);
  }

  /**
   * Sends an error to whoever is awaiting connect(), or emits it once the
   * stream is up. Keeps one failure from being reported twice.
   */
  private reportError(error: Error): void {
    if (this.pendingConnect) {
      this.failPendingConnect(error);
      return;
    }
    this.emit('error', error);
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
      this.reportError(new Error('No quote token available for auth'));
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
   * Queued symbols are subscribed once FEED_CONFIG confirms the setup.
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
  }

  /**
   * Sends feed subscription message.
   */
  private sendFeedSubscription(symbols: string[], action: 'add' | 'remove'): void {
    // Build subscription entries for each symbol with relevant event types
    const entries: Array<{ type: string; symbol: string }> = [];

    for (const symbol of symbols) {
      const streamerSymbol = this.getStreamerSymbol(symbol);
      const isOption = this.isTastyTradeOptionSymbol(symbol) || streamerSymbol.startsWith('.');

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
    if (this.isTastyTradeOptionSymbol(symbol)) {
      try {
        const parsed = parseOCCSymbol(symbol);
        // TastyTrade streamer format: .UNDERLYING + YYMMDD + C/P + STRIKE
        // e.g., .SPXW231215C4500
        const expDate = parsed.expiration;
        const yy = expDate.getFullYear().toString().slice(-2);
        const mm = (expDate.getMonth() + 1).toString().padStart(2, '0');
        const dd = expDate.getDate().toString().padStart(2, '0');
        const optType = parsed.optionType === 'call' ? 'C' : 'P';

        // dxFeed writes strikes without trailing zeros: 4500, 472.5, 12.25
        const strikeStr = String(parsed.strike);

        const streamerSymbol = `.${parsed.symbol}${yy}${mm}${dd}${optType}${strikeStr}`;
        this.occToStreamerMap.set(symbol, streamerSymbol);
        this.streamerToOccMap.set(streamerSymbol, symbol);
        return streamerSymbol;
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
  private streamerSymbolToOCC(streamerSymbol: string): string {
    // Check cache first
    const cached = this.streamerToOccMap.get(streamerSymbol);
    if (cached) {
      return cached;
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
    this.stopKeepalive();

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
   * Stops keepalive interval.
   */
  private stopKeepalive(): void {
    if (this.keepaliveInterval) {
      clearInterval(this.keepaliveInterval);
      this.keepaliveInterval = null;
    }
  }

  /**
   * Handles incoming WebSocket messages.
   */
  private handleMessage(data: string): void {
    let message: DxLinkMessage;
    try {
      message = JSON.parse(data) as DxLinkMessage;
    } catch {
      this.log('Ignoring non-JSON DxLink message');
      return;
    }

    try {
      switch (message.type) {
        case 'SETUP':
          // no op; the server will send it's own first AUTH_STATE UNAUTHORIZED message right after
          break;

        case 'AUTH_STATE':
          this.handleAuthState(message as DxLinkAuthStateMessage);
          break;

        case 'CHANNEL_OPENED':
          this.handleChannelOpened(message as DxLinkChannelOpenedMessage);
          break;

        case 'FEED_CONFIG':
          this.handleFeedConfig(message as DxLinkFeedConfigMessage);
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
      this.log(`Failed to handle DxLink ${message.type} message: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Handles AUTH_STATE message.
   */
  private handleAuthState(message: DxLinkAuthStateMessage): void {
    if (message.state === 'AUTHORIZED') {
      this.authorized = true;
      this.reconnectAttempts = 0;
      this.startKeepalive();
      this.openFeedChannel();
      this.log('DxLink authorized');
      this.emit('connected', undefined);
      this.resolvePendingConnect();
      return;
    }

    // UNAUTHORIZED.
    // The first one after SETUP is an expected part of the flow (though unintuitive)
    // see https://developer.tastytrade.com/streaming-market-data/#dxlink-streamer
    if (!this.authSent) {
      this.sendAuth();
      this.authSent = true;
      return;
    }

    if (this.authorized) {
      // Authorization lost on a live stream (e.g. the quote token expired).
      // Reconnect with a fresh quote token; subscriptions are kept.
      this.log('DxLink authorization lost, reconnecting');
      this.teardownSocket('Authorization lost');
      this.emit('disconnected', { reason: 'DxLink authorization lost' });
      if (!this.intentionalDisconnect) {
        this.attemptReconnect();
      }
      return;
    }

    // AUTH was sent and rejected before the stream was ever authorized
    this.reportError(new TastyTradeApiError('DxLink rejected the quote token', 401, 'dxlink_unauthorized'));
    this.teardownSocket('Unauthorized');
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
   * Handles FEED_CONFIG message: the feed is ready for subscriptions.
   */
  private handleFeedConfig(message: DxLinkFeedConfigMessage): void {
    if (message.eventFields) {
      this.eventFields = { ...this.eventFields, ...message.eventFields };
    }

    if (this.feedChannelOpened) return;
    this.feedChannelOpened = true;

    // Subscribe to queued symbols (including everything from before a reconnect)
    if (this.subscribedSymbols.size > 0) {
      this.sendFeedSubscription(Array.from(this.subscribedSymbols), 'add');
    }
  }

  /**
   * Handles FEED_DATA message.
   */
  private handleFeedData(message: DxLinkFeedDataMessage): void {
    const { data } = message;

    // COMPACT format: [eventType, [values...], eventType, [values...], ...]
    // Each values array holds every event of that type back to back,
    // fields.length values per event.
    for (let i = 0; i + 1 < data.length; i += 2) {
      const eventType = data[i];
      const values = data[i + 1];
      if (typeof eventType !== 'string' || !Array.isArray(values)) continue;

      const fields = this.eventFields[eventType];
      if (!fields || fields.length === 0) continue;

      for (let offset = 0; offset + fields.length <= values.length; offset += fields.length) {
        const event: Record<string, string | number | null> = {};
        for (let f = 0; f < fields.length; f++) {
          event[fields[f]] = values[offset + f];
        }
        this.processEvent(eventType, event);
      }
    }
  }

  /**
   * Processes a single decoded event from FEED_DATA.
   */
  private processEvent(eventType: string, event: Record<string, string | number | null>): void {
    // for debugging summary events (if verbose)
    if (eventType === 'Summary' && this.verbose) {
      console.log(`[TastyTrade:DEBUG] Summary event:`, event);
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
    const volatility = this.toNumber(event.volatility);
    if (volatility <= 0) return;

    // Greeks can arrive before the first Quote or Trade for a contract
    const option = this.optionCache.get(occSymbol) ?? this.createEmptyOption(occSymbol, timestamp);
    if (!option) return;

    option.impliedVolatility = volatility;
    option.timestamp = timestamp;
    this.optionCache.set(occSymbol, option);
    this.emit('optionUpdate', option);
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

    // NaN or missing means unknown; 0 is a real value for a fresh strike
    const openInterest = this.toFiniteNumber(event.openInterest);
    if (openInterest === null || openInterest < 0) return;

    // Summary usually arrives once at subscribe time, often before any Quote
    const option = this.optionCache.get(symbol) ?? this.createEmptyOption(symbol, timestamp);
    if (!option) return;

    // Update base OI if not set
    if (!this.baseOpenInterest.has(symbol)) {
      this.baseOpenInterest.set(symbol, openInterest);
      if (!this.cumulativeOIChange.has(symbol)) {
        this.cumulativeOIChange.set(symbol, 0);
      }
      if (this.verbose) {
        console.log(`[TastyTrade:OI] Base OI set from stream for ${symbol}: ${openInterest}`);
      }
    }

    option.openInterest = openInterest;
    option.liveOpenInterest = this.calculateLiveOpenInterest(symbol);
    option.timestamp = timestamp;
    this.optionCache.set(symbol, option);
    this.emit('optionUpdate', option);
  }

  /**
   * Builds a blank cache entry for an option that has no quote or trade yet.
   */
  private createEmptyOption(occSymbol: string, timestamp: number): NormalizedOption | null {
    let parsed: { symbol: string; expiration: Date; optionType: OptionType; strike: number };
    try {
      parsed = parseOCCSymbol(occSymbol);
    } catch {
      return null;
    }

    return {
      occSymbol,
      underlying: parsed.symbol,
      strike: parsed.strike,
      expiration: parsed.expiration.toISOString().split('T')[0],
      expirationTimestamp: parsed.expiration.getTime(),
      optionType: parsed.optionType,
      bid: 0,
      bidSize: 0,
      ask: 0,
      askSize: 0,
      mark: 0,
      last: 0,
      volume: 0,
      openInterest: 0,
      liveOpenInterest: this.calculateLiveOpenInterest(occSymbol),
      impliedVolatility: 0,
      timestamp,
    };
  }

  /**
   * Converts a feed value to a number, or null when it is missing or NaN.
   */
  private toFiniteNumber(value: unknown): number | null {
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    if (typeof value === 'string' && value.trim() !== '') {
      const num = Number(value);
      return Number.isFinite(num) ? num : null;
    }
    return null;
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
    this.updateTickerFromQuoteData(symbol, bidPrice, bidSize, askPrice, askSize, timestamp);
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
    this.updateTickerFromTradeData(symbol, price, size, dayVolume > 0 ? dayVolume : null, timestamp);
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
    this.updateOptionFromQuoteData(occSymbol, bidPrice, bidSize, askPrice, askSize, timestamp, parseOCCSymbol);
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
    this.updateOptionFromTradeData(occSymbol, price, size, dayVolume > 0 ? dayVolume : null, timestamp, parseOCCSymbol);
  }

  /**
   * Handles DxLink error messages.
   */
  private handleError(message: DxLinkErrorMessage): void {
    this.reportError(new Error(`DxLink error: ${message.error} - ${message.message}`));
  }

  /**
   * Reconnects with exponential backoff after an established stream drops.
   *
   * @remarks
   * Each attempt fetches a new quote token with the current access token.
   * Stops early on 401/403 (emitted as an error so the owner can refresh the
   * access token) and after maxReconnectAttempts.
   */
  private async attemptReconnect(): Promise<void> {
    if (this.reconnecting) return;
    this.reconnecting = true;

    try {
      while (!this.intentionalDisconnect) {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
          this.emit('error', new Error('Max reconnection attempts reached'));
          return;
        }

        this.reconnectAttempts++;
        const delay = this.getReconnectDelay();

        this.log(`Reconnection attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${delay}ms`);

        await this.sleep(delay);
        if (this.intentionalDisconnect) return;

        try {
          await this.openStream();
          return;
        } catch (error) {
          const err = error instanceof Error ? error : new Error(String(error));
          if (err instanceof TastyTradeApiError && (err.status === 401 || err.status === 403)) {
            this.emit('error', err);
            return;
          }
          this.log(`Reconnection attempt failed: ${err.message}`);
        }
      }
    } finally {
      this.reconnecting = false;
    }
  }

  /**
   * Checks if symbol is a TastyTrade option symbol.
   */
  private isTastyTradeOptionSymbol(symbol: string): boolean {
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
}
