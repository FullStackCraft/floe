import { Greeks, NormalizedOption, NormalizedTicker } from '../../types';
import { parseOCCSymbol } from '../../utils/occ';
import {
  BaseBrokerClient,
  BaseBrokerClientOptions,
  OCC_OPTION_PATTERN,
} from './BaseBrokerClient';

const DEFAULT_PROXY_URL = '/.netlify/functions/webullMarketData';
const AUTH_TOKEN_PREFIX = 'floe-webull:';
const OPTION_BATCH_SIZE = 20;

export interface WebullAuthTokenConfig {
  accessToken: string;
  proxyUrl?: string;
}

export interface ParsedWebullAuthToken {
  accessToken: string;
  proxyUrl: string;
}

export function createWebullAuthToken(config: WebullAuthTokenConfig): string {
  if (!config.accessToken) {
    throw new Error('Webull access token is required');
  }

  return `${AUTH_TOKEN_PREFIX}${encodeURIComponent(JSON.stringify({
    accessToken: config.accessToken,
    proxyUrl: config.proxyUrl ?? DEFAULT_PROXY_URL,
  }))}`;
}

export function parseWebullAuthToken(authToken: string): ParsedWebullAuthToken {
  if (!authToken) {
    throw new Error('Webull auth token is required');
  }

  if (!authToken.startsWith(AUTH_TOKEN_PREFIX)) {
    return { accessToken: authToken, proxyUrl: DEFAULT_PROXY_URL };
  }

  try {
    const parsed = JSON.parse(decodeURIComponent(authToken.slice(AUTH_TOKEN_PREFIX.length))) as WebullAuthTokenConfig;
    if (!parsed.accessToken) {
      throw new Error('missing accessToken');
    }
    return {
      accessToken: parsed.accessToken,
      proxyUrl: parsed.proxyUrl || DEFAULT_PROXY_URL,
    };
  } catch (error) {
    throw new Error(`Invalid Webull auth token: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export interface WebullClientOptions extends BaseBrokerClientOptions {
  authToken: string;
  pollIntervalMs?: number;
  optionRequestIntervalMs?: number;
}

interface WebullStockSnapshot {
  symbol: string;
  price?: string;
  volume?: string;
  last_trade_time?: number | string;
  quote_time?: number | string;
  bid?: string;
  bid_size?: string;
  ask?: string;
  ask_size?: string;
}

interface WebullOptionSnapshot extends WebullStockSnapshot {
  strike_price?: string;
  gamma?: string;
  delta?: string;
  rho?: string;
  theta?: string;
  vega?: string;
  imp_vol?: string;
  open_interest?: string;
}

type WebullMarketDataOperation = 'stockSnapshot' | 'optionSnapshot';

export class WebullClient extends BaseBrokerClient {
  protected readonly brokerName = 'Webull';

  private readonly accessToken: string;
  private readonly proxyUrl: string;
  private readonly pollIntervalMs: number;
  private readonly optionRequestIntervalMs: number;
  private connected = false;
  private tickerTimer: ReturnType<typeof setInterval> | null = null;
  private optionTimer: ReturnType<typeof setInterval> | null = null;
  private tickerRequestInFlight = false;
  private optionRequestChain: Promise<void> = Promise.resolve();
  private lastOptionRequestAt = 0;
  private optionChunkIndex = 0;
  private pendingOptionRequests = 0;

  constructor(options: WebullClientOptions) {
    super(options);
    const auth = parseWebullAuthToken(options.authToken);
    this.accessToken = auth.accessToken;
    this.proxyUrl = auth.proxyUrl;
    this.pollIntervalMs = options.pollIntervalMs ?? 1_000;
    this.optionRequestIntervalMs = options.optionRequestIntervalMs ?? 1_000;
  }

  async connect(): Promise<void> {
    if (this.connected) return;
    this.connected = true;
    this.emit('connected', undefined);
    this.startPolling();
    this.log('Connected through market-data proxy');
  }

  disconnect(): void {
    if (!this.connected) return;
    this.connected = false;
    this.stopPolling();
    this.subscribedSymbols.clear();
    this.emit('disconnected', undefined);
  }

  subscribe(symbols: string[]): void {
    for (const symbol of symbols) {
      const normalized = symbol.replace(/\s+/g, '').toUpperCase();
      if (normalized) this.subscribedSymbols.add(normalized);
    }

    if (symbols.some((symbol) => !this.isWebullOptionSymbol(symbol))) {
      void this.pollTickers();
    }
  }

  unsubscribe(symbols: string[]): void {
    for (const symbol of symbols) {
      this.subscribedSymbols.delete(symbol.replace(/\s+/g, '').toUpperCase());
    }
  }

  unsubscribeFromAll(): void {
    this.subscribedSymbols.clear();
    this.optionChunkIndex = 0;
  }

  isConnected(): boolean {
    return this.connected;
  }

  async fetchOpenInterest(occSymbols: string[]): Promise<void> {
    const options = Array.from(new Set(
      occSymbols
        .map((symbol) => symbol.replace(/\s+/g, '').toUpperCase())
        .filter((symbol) => this.isWebullOptionSymbol(symbol)),
    ));

    const requests: Promise<void>[] = [];
    for (let index = 0; index < options.length; index += OPTION_BATCH_SIZE) {
      requests.push(this.enqueueOptionSnapshot(options.slice(index, index + OPTION_BATCH_SIZE)));
    }
    await Promise.all(requests);
  }

  private startPolling(): void {
    if (!this.tickerTimer) {
      this.tickerTimer = setInterval(() => void this.pollTickers(), this.pollIntervalMs);
    }
    if (!this.optionTimer) {
      this.optionTimer = setInterval(() => void this.pollNextOptionChunk(), this.pollIntervalMs);
    }
  }

  private stopPolling(): void {
    if (this.tickerTimer) clearInterval(this.tickerTimer);
    if (this.optionTimer) clearInterval(this.optionTimer);
    this.tickerTimer = null;
    this.optionTimer = null;
  }

  private getSubscribedTickers(): string[] {
    return Array.from(this.subscribedSymbols).filter((symbol) => !this.isWebullOptionSymbol(symbol));
  }

  private getSubscribedOptions(): string[] {
    return Array.from(this.subscribedSymbols).filter((symbol) => this.isWebullOptionSymbol(symbol));
  }

  private async pollTickers(): Promise<void> {
    const symbols = this.getSubscribedTickers();
    if (!this.connected || this.tickerRequestInFlight || symbols.length === 0) return;

    this.tickerRequestInFlight = true;
    try {
      for (let index = 0; index < symbols.length; index += OPTION_BATCH_SIZE) {
        const snapshots = await this.requestSnapshots<WebullStockSnapshot>('stockSnapshot', symbols.slice(index, index + OPTION_BATCH_SIZE));
        snapshots.forEach((snapshot) => this.updateTicker(snapshot));
      }
    } catch (error) {
      this.emit('error', error instanceof Error ? error : new Error(String(error)));
    } finally {
      this.tickerRequestInFlight = false;
    }
  }

  private async pollNextOptionChunk(): Promise<void> {
    const symbols = this.getSubscribedOptions();
    if (!this.connected || symbols.length === 0 || this.pendingOptionRequests > 0) return;

    const chunks = this.chunk(symbols, OPTION_BATCH_SIZE);
    const chunk = chunks[this.optionChunkIndex % chunks.length];
    this.optionChunkIndex = (this.optionChunkIndex + 1) % chunks.length;

    try {
      await this.enqueueOptionSnapshot(chunk);
    } catch (error) {
      this.emit('error', error instanceof Error ? error : new Error(String(error)));
    }
  }

  private enqueueOptionSnapshot(symbols: string[]): Promise<void> {
    this.pendingOptionRequests += 1;
    const request = this.optionRequestChain.then(async () => {
      try {
        const waitMs = Math.max(0, this.optionRequestIntervalMs - (Date.now() - this.lastOptionRequestAt));
        if (waitMs > 0) await this.sleep(waitMs);
        if (!this.connected) return;

        this.lastOptionRequestAt = Date.now();
        const snapshots = await this.requestSnapshots<WebullOptionSnapshot>('optionSnapshot', symbols);
        snapshots.forEach((snapshot) => this.updateOption(snapshot));
      } finally {
        this.pendingOptionRequests -= 1;
      }
    });

    this.optionRequestChain = request.catch(() => undefined);
    return request;
  }

  private async requestSnapshots<T>(operation: WebullMarketDataOperation, symbols: string[]): Promise<T[]> {
    const response = await fetch(this.proxyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ operation, symbols, accessToken: this.accessToken }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Webull ${operation} request failed (${response.status}): ${body || response.statusText}`);
    }

    const data = await response.json() as T[] | { data?: T[] };
    if (Array.isArray(data)) return data;
    if (Array.isArray(data.data)) return data.data;
    throw new Error(`Webull ${operation} returned an invalid response`);
  }

  private updateTicker(snapshot: WebullStockSnapshot): void {
    const symbol = snapshot.symbol?.toUpperCase();
    if (!symbol) return;

    const bid = this.toNumber(snapshot.bid);
    const ask = this.toNumber(snapshot.ask);
    const last = this.toNumber(snapshot.price);
    const ticker: NormalizedTicker = {
      symbol,
      spot: bid > 0 && ask > 0 ? (bid + ask) / 2 : last,
      bid,
      bidSize: this.toNumber(snapshot.bid_size),
      ask,
      askSize: this.toNumber(snapshot.ask_size),
      last,
      volume: this.toNumber(snapshot.volume),
      timestamp: this.toTimestamp(snapshot.quote_time ?? snapshot.last_trade_time),
    };

    this.tickerCache.set(symbol, ticker);
    this.emit('tickerUpdate', ticker);
  }

  private updateOption(snapshot: WebullOptionSnapshot): void {
    const occSymbol = snapshot.symbol?.replace(/\s+/g, '').toUpperCase();
    if (!occSymbol) return;

    let parsed;
    try {
      parsed = parseOCCSymbol(occSymbol);
    } catch {
      return;
    }

    const bid = this.toNumber(snapshot.bid);
    const ask = this.toNumber(snapshot.ask);
    const last = this.toNumber(snapshot.price);
    const openInterest = this.toNumber(snapshot.open_interest);
    this.setBaseOpenInterest(occSymbol, openInterest);

    const option: NormalizedOption = {
      occSymbol,
      underlying: parsed.symbol,
      strike: this.toNumber(snapshot.strike_price) || parsed.strike,
      expiration: parsed.expiration.toISOString().split('T')[0],
      expirationTimestamp: parsed.expiration.getTime(),
      optionType: parsed.optionType,
      bid,
      bidSize: this.toNumber(snapshot.bid_size),
      ask,
      askSize: this.toNumber(snapshot.ask_size),
      mark: bid > 0 && ask > 0 ? (bid + ask) / 2 : last,
      last,
      volume: this.toNumber(snapshot.volume),
      openInterest,
      liveOpenInterest: this.calculateLiveOpenInterest(occSymbol),
      impliedVolatility: this.toNumber(snapshot.imp_vol),
      timestamp: this.toTimestamp(snapshot.quote_time ?? snapshot.last_trade_time),
      greeks: this.buildGreeks(snapshot),
    };

    this.optionCache.set(occSymbol, option);
    this.emit('optionUpdate', option);
  }

  private buildGreeks(snapshot: WebullOptionSnapshot): Greeks {
    return {
      price: this.toNumber(snapshot.price),
      delta: this.toNumber(snapshot.delta),
      gamma: this.toNumber(snapshot.gamma),
      theta: this.toNumber(snapshot.theta),
      vega: this.toNumber(snapshot.vega),
      rho: this.toNumber(snapshot.rho),
      charm: 0,
      vanna: 0,
      volga: 0,
      speed: 0,
      zomma: 0,
      color: 0,
      ultima: 0,
    };
  }

  private toTimestamp(value: number | string | undefined): number {
    const timestamp = this.toNumber(value);
    return timestamp > 0 ? timestamp : Date.now();
  }

  private isWebullOptionSymbol(symbol: string): boolean {
    return OCC_OPTION_PATTERN.test(symbol.replace(/\s+/g, '').toUpperCase());
  }

  private chunk<T>(items: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let index = 0; index < items.length; index += size) {
      chunks.push(items.slice(index, index + size));
    }
    return chunks;
  }
}
