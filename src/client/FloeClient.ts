import { NormalizedOption, NormalizedTicker } from "../types";
import { TradierClient } from "./brokers/TradierClient";
import { TastyTradeClient } from "./brokers/TastyTradeClient";
import { TradeStationClient } from "./brokers/TradeStationClient";
import { SchwabClient } from "./brokers/SchwabClient";

/**
 * Supported broker integrations for the FloeClient.
 * @enum {string}
 */
export enum Broker {
    /** Placeholder for no currently connected broker */
    NONE = "none",
    /** Tradier brokerage API */
    TRADIER = "tradier",
    /** TastyTrade brokerage API (uses DxLink WebSocket) */
    TASTYTRADE = "tastytrade",
    /** TradeStation brokerage API (uses HTTP streaming) */
    TRADESTATION = "tradestation",
    /** Charles Schwab brokerage API (uses WebSocket streaming) */
    SCHWAB = "schwab",
}

/**
 * Event types emitted by the FloeClient.
 * @remarks
 * Used with the {@link FloeClient.on} and {@link FloeClient.off} methods for event-driven updates.
 */
type FloeEventType = 'tickerUpdate' | 'optionUpdate' | 'error' | 'connected' | 'disconnected';

/**
 * Event payload map for type-safe event handling.
 */
interface FloeEventMap {
    tickerUpdate: NormalizedTicker;
    optionUpdate: NormalizedOption;
    error: Error;
    connected: { broker: Broker };
    disconnected: { broker: Broker; reason?: string };
}

/**
 * Listener function type for FloeClient events.
 * @template T - The event type from FloeEventType
 */
type FloeEventListener<T extends FloeEventType> = (data: FloeEventMap[T]) => void;

/**
 * FloeClient provides a unified, broker-agnostic interface for subscribing to
 * real-time market data including stock tickers and options.
 * 
 * @remarks
 * The client normalizes data from various brokers into a consistent format,
 * allowing consumers to switch brokers without changing their application code.
 * 
 * @example
 * ```typescript
 * const client = new FloeClient();
 * 
 * // Connect to a broker
 * client.connect(Broker.TRADIER, 'your-api-key');
 * 
 * // Subscribe to updates using the event emitter pattern
 * client.on('tickerUpdate', (ticker) => {
 *     console.log(`${ticker.symbol}: ${ticker.price}`);
 * });
 * 
 * // Or use the callback pattern
 * client.onTickerDataChange((ticker) => {
 *     console.log(`${ticker.symbol}: ${ticker.price}`);
 * });
 * 
 * // Subscribe to specific tickers
 * client.subscribeToTickers(['AAPL', 'GOOGL', 'MSFT']);
 * ```
 */
export class FloeClient {

    /** Currently connected broker, or null if not connected */
    private currentBroker: Broker | null = null;
    
    /** List of ticker symbols currently subscribed to */
    private currentSubscribedTickers: Array<string> = [];
    
    /** List of option symbols (OCC format) currently subscribed to */
    private currentSubscribedOptions: Array<string> = [];
    
    /** Tradier broker client instance */
    private tradierClient: TradierClient | null = null;

    /** TastyTrade broker client instance */
    private tastyTradeClient: TastyTradeClient | null = null;

    /** TradeStation broker client instance */
    private tradeStationClient: TradeStationClient | null = null;

    /** Schwab broker client instance */
    private schwabClient: SchwabClient | null = null;

    /** Event listeners registry for the EventEmitter pattern */
    private eventListeners: Map<FloeEventType, Set<FloeEventListener<any>>> = new Map();

    /** Callback for ticker data changes (legacy callback pattern) */
    private tickerDataCallback: ((data: NormalizedTicker) => void) | null = null;

    /** Callback for option data changes (legacy callback pattern) */
    private optionDataCallback: ((data: NormalizedOption) => void) | null = null;

    /** Whether to log verbose debug information */
    private readonly verbose: boolean;

    /**
     * Creates a new FloeClient instance.
     * 
     * @param options - Optional configuration options
     * @param options.verbose - Whether to log verbose debug information for all broker clients (default: false).
     *                         When enabled, logs critical debug info such as live open interest changes,
     *                         connection events, and reconnection attempts.
     * 
     * @remarks
     * The client is created in a disconnected state. Call {@link connect} to
     * establish a connection to a broker before subscribing to data.
     * 
     * @example
     * ```typescript
     * // Create client with default settings
     * const client = new FloeClient();
     * 
     * // Create client with verbose logging enabled
     * const verboseClient = new FloeClient({ verbose: true });
     * ```
     */
    constructor(options?: { verbose?: boolean }) {
        this.verbose = options?.verbose ?? false;
        // Initialize event listener maps for each event type
        this.eventListeners.set('tickerUpdate', new Set());
        this.eventListeners.set('optionUpdate', new Set());
        this.eventListeners.set('error', new Set());
        this.eventListeners.set('connected', new Set());
        this.eventListeners.set('disconnected', new Set());
    }

    /**
     * Establishes a connection to a broker's API.
     * 
     * @param broker - The broker to connect to (e.g., Broker.TRADIER)
     * @param authToken - The API authentication token for the broker
     * 
     * @throws {Error} Throws if the specified broker is not supported
     * 
     * @remarks
     * Must be called before subscribing to any market data. Only one broker
     * connection is active at a time; calling connect again will switch brokers.
     * 
     * @example
     * ```typescript
     * await client.connect(Broker.TRADIER, 'your-tradier-api-key');
     * ```
     */
    async connect(broker: Broker, authToken: string): Promise<void> {
        this.currentBroker = broker;

        // Connection logic to the broker's API using the authToken
        switch (broker.toLowerCase()) {
            case Broker.NONE:
                // No action needed for NONE broker; no-op
                break;
            case Broker.TRADIER:
                this.tradierClient = new TradierClient(authToken, { verbose: this.verbose });
                
                // Wire up TradierClient events to FloeClient events
                this.tradierClient.on('tickerUpdate', (ticker: NormalizedTicker) => {
                    this.emit('tickerUpdate', ticker);
                });
                this.tradierClient.on('optionUpdate', (option: NormalizedOption) => {
                    this.emit('optionUpdate', option);
                });
                this.tradierClient.on('error', (error: Error) => {
                    this.emit('error', error);
                });
                this.tradierClient.on('disconnected', () => {
                    this.emit('disconnected', { broker, reason: 'WebSocket disconnected' });
                });

                // Connect to the streaming API
                await this.tradierClient.connect();
                break;

            case Broker.TASTYTRADE:
                // For TastyTrade, authToken is the session token
                this.tastyTradeClient = new TastyTradeClient({
                    sessionToken: authToken,
                    verbose: this.verbose,
                });
                
                // Wire up TastyTradeClient events to FloeClient events
                this.tastyTradeClient.on('tickerUpdate', (ticker: NormalizedTicker) => {
                    this.emit('tickerUpdate', ticker);
                });
                this.tastyTradeClient.on('optionUpdate', (option: NormalizedOption) => {
                    this.emit('optionUpdate', option);
                });
                this.tastyTradeClient.on('error', (error: Error) => {
                    this.emit('error', error);
                });
                this.tastyTradeClient.on('disconnected', () => {
                    this.emit('disconnected', { broker, reason: 'DxLink WebSocket disconnected' });
                });

                // Connect to the streaming API
                await this.tastyTradeClient.connect();
                break;

            case Broker.TRADESTATION:
                // For TradeStation, authToken is the OAuth access token
                this.tradeStationClient = new TradeStationClient({
                    accessToken: authToken,
                    verbose: this.verbose,
                });
                
                // Wire up TradeStationClient events to FloeClient events
                this.tradeStationClient.on('tickerUpdate', (ticker: NormalizedTicker) => {
                    this.emit('tickerUpdate', ticker);
                });
                this.tradeStationClient.on('optionUpdate', (option: NormalizedOption) => {
                    this.emit('optionUpdate', option);
                });
                this.tradeStationClient.on('error', (error: Error) => {
                    this.emit('error', error);
                });
                this.tradeStationClient.on('disconnected', () => {
                    this.emit('disconnected', { broker, reason: 'HTTP stream disconnected' });
                });

                // Connect to the streaming API
                await this.tradeStationClient.connect();
                break;

            case Broker.SCHWAB:
                // For Schwab, authToken is the OAuth access token
                this.schwabClient = new SchwabClient({
                    accessToken: authToken,
                    verbose: this.verbose,
                });
                
                // Wire up SchwabClient events to FloeClient events
                this.schwabClient.on('tickerUpdate', (ticker: NormalizedTicker) => {
                    this.emit('tickerUpdate', ticker);
                });
                this.schwabClient.on('optionUpdate', (option: NormalizedOption) => {
                    this.emit('optionUpdate', option);
                });
                this.schwabClient.on('error', (error: Error) => {
                    this.emit('error', error);
                });
                this.schwabClient.on('disconnected', () => {
                    this.emit('disconnected', { broker, reason: 'Schwab WebSocket disconnected' });
                });

                // Connect to the streaming API
                await this.schwabClient.connect();
                break;

            default:
                throw new Error(`Unsupported broker: ${broker}`);
        }

        this.emit('connected', { broker });
    }

    /**
     * Disconnects from the current broker.
     * 
     * @remarks
     * Closes the WebSocket connection and clears all subscriptions.
     * 
     * @example
     * ```typescript
     * client.disconnect();
     * ```
     */
    disconnect(): void {
        if (this.tradierClient) {
            this.tradierClient.disconnect();
            this.tradierClient = null;
        }

        if (this.tastyTradeClient) {
            this.tastyTradeClient.disconnect();
            this.tastyTradeClient = null;
        }

        if (this.tradeStationClient) {
            this.tradeStationClient.disconnect();
            this.tradeStationClient = null;
        }

        if (this.schwabClient) {
            this.schwabClient.disconnect();
            this.schwabClient = null;
        }

        const broker = this.currentBroker;
        this.currentBroker = null;
        this.currentSubscribedTickers = [];
        this.currentSubscribedOptions = [];

        if (broker) {
            this.emit('disconnected', { broker, reason: 'Client disconnect' });
        }
    }

    /**
     * Subscribes to real-time updates for the specified stock ticker symbols.
     * 
     * @param tickers - Array of ticker symbols to subscribe to (e.g., ['AAPL', 'GOOGL'])
     * 
     * @throws {Error} Throws if no broker connection has been established
     * 
     * @remarks
     * Ticker updates will be delivered via the 'tickerUpdate' event or through
     * the callback registered with {@link onTickerDataChange}.
     * 
     * @example
     * ```typescript
     * client.subscribeToTickers(['AAPL', 'GOOGL', 'MSFT']);
     * ```
     */
    subscribeToTickers(tickers: Array<string>): void {
        this.currentSubscribedTickers.push(...tickers);
        switch (this.currentBroker) {
            case Broker.TRADIER:
                this.tradierClient?.subscribe(tickers);
                break;
            case Broker.TASTYTRADE:
                this.tastyTradeClient?.subscribe(tickers);
                break;
            case Broker.TRADESTATION:
                this.tradeStationClient?.subscribe(tickers);
                break;
            case Broker.SCHWAB:
                this.schwabClient?.subscribe(tickers);
                break;
            default:
                throw new Error(`Unsupported broker: ${this.currentBroker}`);
        }
    }

    /**
     * Subscribes to real-time updates for the specified option contracts.
     * 
     * @param symbols - Array of option symbols in OCC format
     *                  (e.g., ['AAPL230120C00150000'] for AAPL $150 Call expiring Jan 20, 2023)
     * 
     * @throws {Error} Throws if no broker connection has been established
     * 
     * @remarks
     * Option symbols must be in the standard OCC (Options Clearing Corporation) format:
     * - Root symbol (up to 6 characters, left-padded)
     * - Expiration date (YYMMDD)
     * - Option type (C for call, P for put)
     * - Strike price (8 digits, price × 1000, left-padded with zeros)
     * 
     * Option updates will be delivered via the 'optionUpdate' event or through
     * the callback registered with {@link onOptionDataChange}.
     * 
     * @example
     * ```typescript
     * // Subscribe to AAPL $150 Call expiring Jan 20, 2023
     * client.subscribeToOptions(['AAPL230120C00150000']);
     * ```
     */
    subscribeToOptions(symbols: Array<string>): void {
        this.currentSubscribedOptions.push(...symbols);
        switch (this.currentBroker) {
            case Broker.TRADIER:
                this.tradierClient?.subscribe(symbols);
                break;
            case Broker.TASTYTRADE:
                this.tastyTradeClient?.subscribe(symbols);
                break;
            case Broker.TRADESTATION:
                this.tradeStationClient?.subscribe(symbols);
                break;
            case Broker.SCHWAB:
                this.schwabClient?.subscribe(symbols);
                break;
            default:
                throw new Error(`Unsupported broker: ${this.currentBroker}`);
        }
    }

    /**
     * Unsubscribes from real-time updates for the specified stock ticker symbols.
     * 
     * @param tickers - Array of ticker symbols to unsubscribe from
     * 
     * @throws {Error} Throws if no broker connection has been established
     * 
     * @remarks
     * After unsubscribing, no further updates will be received for these tickers.
     * Has no effect if the specified tickers were not previously subscribed.
     * 
     * @example
     * ```typescript
     * client.unsubscribeFromTickers(['AAPL', 'GOOGL']);
     * ```
     */
    unsubscribeFromTickers(tickers: Array<string>): void {
        this.currentSubscribedTickers = this.currentSubscribedTickers.filter(ticker => !tickers.includes(ticker));
        switch (this.currentBroker) {
            case Broker.TRADIER:
                this.tradierClient?.unsubscribe(tickers);
                break;
            case Broker.TASTYTRADE:
                this.tastyTradeClient?.unsubscribe(tickers);
                break;
            case Broker.TRADESTATION:
                this.tradeStationClient?.unsubscribe(tickers);
                break;
            case Broker.SCHWAB:
                this.schwabClient?.unsubscribe(tickers);
                break;
            default:
                throw new Error(`Unsupported broker: ${this.currentBroker}`);
        }
    }

    /**
     * Unsubscribes from real-time updates for the specified option contracts.
     * 
     * @param symbols - Array of option symbols in OCC format to unsubscribe from
     * 
     * @throws {Error} Throws if no broker connection has been established
     * 
     * @remarks
     * After unsubscribing, no further updates will be received for these options.
     * Has no effect if the specified options were not previously subscribed.
     * 
     * @example
     * ```typescript
     * client.unsubscribeFromOptions(['AAPL230120C00150000']);
     * ```
     */
    unsubscribeFromOptions(symbols: Array<string>): void {
        this.currentSubscribedOptions = this.currentSubscribedOptions.filter(symbol => !symbols.includes(symbol));
        switch (this.currentBroker) {
            case Broker.TRADIER:
                this.tradierClient?.unsubscribe(symbols);
                break;
            case Broker.TASTYTRADE:
                this.tastyTradeClient?.unsubscribe(symbols);
                break;
            case Broker.TRADESTATION:
                this.tradeStationClient?.unsubscribe(symbols);
                break;
            case Broker.SCHWAB:
                this.schwabClient?.unsubscribe(symbols);
                break;
            default:
                throw new Error(`Unsupported broker: ${this.currentBroker}`);
        }
    }

    /**
     * Unsubscribes from all currently subscribed tickers and options.
     * 
     * @throws {Error} Throws if no broker connection has been established
     * 
     * @remarks
     * After calling this method, no further updates will be received for any
     * previously subscribed tickers or options.
     * 
     * @example
     * ```typescript
     * client.unsubscribeFromAll();
     * ```
     */
    unsubscribeFromAll(): void {
        this.currentSubscribedTickers = [];
        this.currentSubscribedOptions = [];
        switch (this.currentBroker) {
            case Broker.TRADIER:
                this.tradierClient?.unsubscribeFromAll();
                break;
            case Broker.TASTYTRADE:
                this.tastyTradeClient?.unsubscribeFromAll();
                break;
            case Broker.TRADESTATION:
                this.tradeStationClient?.unsubscribeFromAll();
                break;
            case Broker.SCHWAB:
                this.schwabClient?.unsubscribeFromAll();
                break;
            default:
                throw new Error(`Unsupported broker: ${this.currentBroker}`);
        }
    }

    /**
     * Fetches open interest and initial option data via REST API.
     * 
     * @param symbols - Array of option symbols in OCC format to fetch data for.
     *                  If not provided, fetches data for all currently subscribed options.
     * @returns Promise that resolves when all data has been fetched
     * 
     * @throws {Error} Throws if no broker connection has been established
     * 
     * @remarks
     * Open interest is not available via streaming and must be fetched via REST API.
     * This method should be called after subscribing to options to populate
     * open interest, volume, and initial bid/ask values.
     * 
     * The fetched data is automatically merged into the option cache and
     * emitted via 'optionUpdate' events.
     * 
     * @example
     * ```typescript
     * // Subscribe to options
     * client.subscribeToOptions(optionSymbols);
     * 
     * // Fetch open interest data
     * await client.fetchOpenInterest();
     * 
     * // Options now have open interest populated
     * client.on('optionUpdate', (option) => {
     *     console.log(`${option.occSymbol}: OI=${option.openInterest}`);
     * });
     * ```
     */
    async fetchOpenInterest(symbols?: string[]): Promise<void> {
        const symbolsToFetch = symbols ?? this.currentSubscribedOptions;
        
        if (symbolsToFetch.length === 0) {
            return;
        }

        switch (this.currentBroker) {
            case Broker.TRADIER:
                await this.tradierClient?.fetchOpenInterest(symbolsToFetch);
                break;
            case Broker.TASTYTRADE:
                await this.tastyTradeClient?.fetchOpenInterest(symbolsToFetch);
                break;
            case Broker.TRADESTATION:
                // TradeStation provides open interest via stream, no separate fetch needed
                // OI is automatically populated when streaming option chains
                break;
            case Broker.SCHWAB:
                await this.schwabClient?.fetchOpenInterest(symbolsToFetch);
                break;
            default:
                throw new Error(`Unsupported broker: ${this.currentBroker}`);
        }
    }

    /**
     * Returns cached option data for a specific symbol.
     * 
     * @param occSymbol - OCC option symbol
     * @returns Cached option data, or undefined if not found
     * 
     * @example
     * ```typescript
     * const option = client.getOption('QQQ250117C00530000');
     * console.log(`Open Interest: ${option?.openInterest}`);
     * ```
     */
    getOption(occSymbol: string): NormalizedOption | undefined {
        switch (this.currentBroker) {
            case Broker.TRADIER:
                return this.tradierClient?.getOption(occSymbol);
            case Broker.TASTYTRADE:
                return this.tastyTradeClient?.getOption(occSymbol);
            case Broker.TRADESTATION:
                return this.tradeStationClient?.getOption(occSymbol);
            case Broker.SCHWAB:
                return this.schwabClient?.getOption(occSymbol);
            default:
                return undefined;
        }
    }

    /**
     * Returns all cached options.
     * 
     * @returns Map of OCC symbols to option data
     * 
     * @example
     * ```typescript
     * const allOptions = client.getAllOptions();
     * for (const [symbol, option] of allOptions) {
     *     console.log(`${symbol}: OI=${option.openInterest}`);
     * }
     * ```
     */
    getAllOptions(): Map<string, NormalizedOption> {
        switch (this.currentBroker) {
            case Broker.TRADIER:
                return this.tradierClient?.getAllOptions() ?? new Map();
            case Broker.TASTYTRADE:
                return this.tastyTradeClient?.getAllOptions() ?? new Map();
            case Broker.TRADESTATION:
                return this.tradeStationClient?.getAllOptions() ?? new Map();
            case Broker.SCHWAB:
                return this.schwabClient?.getAllOptions() ?? new Map();
            default:
                return new Map();
        }
    }

    // ==================== Event Emitter Pattern ====================

    /**
     * Registers an event listener for the specified event type.
     * 
     * @template T - The event type
     * @param event - The event type to listen for
     * @param listener - The callback function to invoke when the event occurs
     * @returns The FloeClient instance for method chaining
     * 
     * @remarks
     * Multiple listeners can be registered for the same event type.
     * Use {@link off} to remove a listener when it's no longer needed.
     * 
     * @example
     * ```typescript
     * client
     *     .on('tickerUpdate', (ticker) => console.log(ticker))
     *     .on('error', (error) => console.error(error));
     * ```
     */
    on<T extends FloeEventType>(event: T, listener: FloeEventListener<T>): this {
        const listeners = this.eventListeners.get(event);
        if (listeners) {
            listeners.add(listener);
        }
        return this;
    }

    /**
     * Removes an event listener for the specified event type.
     * 
     * @template T - The event type
     * @param event - The event type to stop listening for
     * @param listener - The callback function to remove
     * @returns The FloeClient instance for method chaining
     * 
     * @remarks
     * The listener must be the exact same function reference that was passed to {@link on}.
     * 
     * @example
     * ```typescript
     * const handler = (ticker) => console.log(ticker);
     * client.on('tickerUpdate', handler);
     * // Later...
     * client.off('tickerUpdate', handler);
     * ```
     */
    off<T extends FloeEventType>(event: T, listener: FloeEventListener<T>): this {
        const listeners = this.eventListeners.get(event);
        if (listeners) {
            listeners.delete(listener);
        }
        return this;
    }

    /**
     * Registers a one-time event listener that automatically removes itself after firing.
     * 
     * @template T - The event type
     * @param event - The event type to listen for
     * @param listener - The callback function to invoke once when the event occurs
     * @returns The FloeClient instance for method chaining
     * 
     * @example
     * ```typescript
     * client.once('connected', ({ broker }) => {
     *     console.log(`Connected to ${broker}`);
     * });
     * ```
     */
    once<T extends FloeEventType>(event: T, listener: FloeEventListener<T>): this {
        const onceWrapper = ((data: FloeEventMap[T]) => {
            this.off(event, onceWrapper);
            listener(data);
        }) as FloeEventListener<T>;
        return this.on(event, onceWrapper);
    }

    /**
     * Emits an event to all registered listeners.
     * 
     * @template T - The event type
     * @param event - The event type to emit
     * @param data - The event payload
     * 
     * @internal
     * @remarks
     * This method is used internally to dispatch events. It also triggers
     * legacy callback handlers for backwards compatibility.
     */
    private emit<T extends FloeEventType>(event: T, data: FloeEventMap[T]): void {
        const listeners = this.eventListeners.get(event);
        if (listeners) {
            listeners.forEach(listener => {
                try {
                    listener(data);
                } catch (error) {
                    // Emit error event if a listener throws (but avoid infinite loops)
                    if (event !== 'error') {
                        this.emit('error', error instanceof Error ? error : new Error(String(error)));
                    }
                }
            });
        }

        // Also trigger legacy callbacks for backwards compatibility
        if (event === 'tickerUpdate' && this.tickerDataCallback) {
            this.tickerDataCallback(data as NormalizedTicker);
        }
        if (event === 'optionUpdate' && this.optionDataCallback) {
            this.optionDataCallback(data as NormalizedOption);
        }
    }

    // ==================== Callback Pattern (Legacy) ====================

    /**
     * Registers a callback to be invoked whenever ticker data is updated.
     * 
     * @param callback - Function to call with the updated ticker data
     * 
     * @deprecated Prefer using {@link on}('tickerUpdate', callback) for new code.
     *             The event emitter pattern supports multiple listeners and provides
     *             better lifecycle management.
     * 
     * @remarks
     * Only one callback can be registered at a time. Calling this method again
     * will replace the previous callback. For multiple listeners, use {@link on}.
     * 
     * @example
     * ```typescript
     * client.onTickerDataChange((ticker) => {
     *     console.log(`${ticker.symbol} updated: ${ticker.price}`);
     * });
     * ```
     */
    onTickerDataChange(callback: (data: NormalizedTicker) => void): void {
        this.tickerDataCallback = callback;
    }

    /**
     * Registers a callback to be invoked whenever option data is updated.
     * 
     * @param callback - Function to call with the updated option data
     * 
     * @deprecated Prefer using {@link on}('optionUpdate', callback) for new code.
     *             The event emitter pattern supports multiple listeners and provides
     *             better lifecycle management.
     * 
     * @remarks
     * Only one callback can be registered at a time. Calling this method again
     * will replace the previous callback. For multiple listeners, use {@link on}.
     * 
     * @example
     * ```typescript
     * client.onOptionDataChange((option) => {
     *     console.log(`${option.symbol} bid: ${option.bid}, ask: ${option.ask}`);
     * });
     * ```
     */
    onOptionDataChange(callback: (data: NormalizedOption) => void): void {
        this.optionDataCallback = callback;
    }

    // ==================== Utility Methods ====================

    /**
     * Returns the list of currently subscribed ticker symbols.
     * 
     * @returns Array of ticker symbols currently subscribed to
     * 
     * @example
     * ```typescript
     * const tickers = client.getSubscribedTickers();
     * console.log(`Subscribed to: ${tickers.join(', ')}`);
     * ```
     */
    getSubscribedTickers(): ReadonlyArray<string> {
        return [...this.currentSubscribedTickers];
    }

    /**
     * Returns the list of currently subscribed option symbols.
     * 
     * @returns Array of option symbols (OCC format) currently subscribed to
     * 
     * @example
     * ```typescript
     * const options = client.getSubscribedOptions();
     * console.log(`Subscribed to ${options.length} options`);
     * ```
     */
    getSubscribedOptions(): ReadonlyArray<string> {
        return [...this.currentSubscribedOptions];
    }

    /**
     * Returns whether the client is currently connected to a broker.
     * 
     * @returns True if connected to a broker, false otherwise
     * 
     * @example
     * ```typescript
     * if (client.isConnected()) {
     *     client.subscribeToTickers(['AAPL']);
     * }
     * ```
     */
    isConnected(): boolean {
        return this.currentBroker !== null;
    }
}
