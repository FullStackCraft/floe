import { Broker, FloeClient } from '../FloeClient';
import {
  createWebullAuthToken,
  parseWebullAuthToken,
  WebullClient,
} from './WebullClient';

const jsonResponse = (body: unknown): Response => new Response(JSON.stringify(body), {
  status: 200,
  headers: { 'Content-Type': 'application/json' },
});

describe('WebullClient', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.useRealTimers();
  });

  it('round-trips the structured auth token and supports raw access tokens', () => {
    const encoded = createWebullAuthToken({
      accessToken: 'access-token',
      proxyUrl: 'https://example.com/webull',
    });

    expect(parseWebullAuthToken(encoded)).toEqual({
      accessToken: 'access-token',
      proxyUrl: 'https://example.com/webull',
    });
    expect(parseWebullAuthToken('raw-token')).toEqual({
      accessToken: 'raw-token',
      proxyUrl: '/.netlify/functions/webullMarketData',
    });
  });

  it('normalizes stock and option snapshots from the proxy', async () => {
    const fetchMock = jest.fn()
      .mockResolvedValueOnce(jsonResponse([{
        symbol: 'AAPL',
        price: '200.25',
        bid: '200.20',
        ask: '200.30',
        bid_size: '10',
        ask_size: '12',
        volume: '12345',
        quote_time: 1_750_000_000_000,
      }]))
      .mockResolvedValueOnce(jsonResponse([{
        symbol: 'AAPL260619C00200000',
        price: '12.50',
        strike_price: '200',
        bid: '12.40',
        ask: '12.60',
        bid_size: '4',
        ask_size: '6',
        volume: '321',
        open_interest: '4567',
        imp_vol: '0.31',
        delta: '0.52',
        gamma: '0.04',
        theta: '-0.08',
        vega: '0.12',
        rho: '0.03',
        quote_time: 1_750_000_000_100,
      }])) as jest.MockedFunction<typeof fetch>;
    global.fetch = fetchMock;

    const client = new WebullClient({
      authToken: createWebullAuthToken({ accessToken: 'token', proxyUrl: '/proxy' }),
      optionRequestIntervalMs: 0,
    });
    const tickers: unknown[] = [];
    const options: unknown[] = [];
    client.on('tickerUpdate', (ticker) => tickers.push(ticker));
    client.on('optionUpdate', (option) => options.push(option));

    await client.connect();
    client.subscribe(['AAPL']);
    await new Promise((resolve) => setTimeout(resolve, 0));
    await client.fetchOpenInterest(['AAPL260619C00200000']);

    expect(tickers).toContainEqual(expect.objectContaining({
      symbol: 'AAPL',
      spot: 200.25,
      bidSize: 10,
      askSize: 12,
    }));
    expect(options).toContainEqual(expect.objectContaining({
      occSymbol: 'AAPL260619C00200000',
      underlying: 'AAPL',
      strike: 200,
      optionType: 'call',
      mark: 12.5,
      openInterest: 4567,
      liveOpenInterest: 4567,
      impliedVolatility: 0.31,
      greeks: expect.objectContaining({ delta: 0.52, gamma: 0.04 }),
    }));
    expect(fetchMock).toHaveBeenCalledWith('/proxy', expect.objectContaining({ method: 'POST' }));
    client.disconnect();
  });

  it('chunks option snapshots and enforces the one-request-per-second limit', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(10_000);
    const fetchMock = jest.fn().mockImplementation(async () => jsonResponse([])) as jest.MockedFunction<typeof fetch>;
    global.fetch = fetchMock;

    const client = new WebullClient({
      authToken: 'token',
      pollIntervalMs: 1_000,
      optionRequestIntervalMs: 1_000,
    });
    await client.connect();

    const symbols = Array.from({ length: 21 }, (_, index) =>
      `AAPL260619C${String((200 + index) * 1000).padStart(8, '0')}`,
    );
    client.subscribe(symbols);
    const request = client.fetchOpenInterest(symbols);
    await Promise.resolve();
    await Promise.resolve();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await jest.advanceTimersByTimeAsync(1_000);
    await request;
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const requestBodies = fetchMock.mock.calls.map((call) => JSON.parse(String(call[1]?.body)));
    expect(requestBodies.map((body) => body.symbols.length)).toEqual([20, 1]);
    client.disconnect();
  });

  it('routes Broker.WEBULL through the unchanged FloeClient interface', async () => {
    const fetchMock = jest.fn().mockResolvedValue(jsonResponse([{
      symbol: 'SPY',
      price: '600',
      bid: '599.9',
      ask: '600.1',
      quote_time: 1_750_000_000_000,
    }])) as jest.MockedFunction<typeof fetch>;
    global.fetch = fetchMock;

    const client = new FloeClient();
    await client.connect(Broker.WEBULL, createWebullAuthToken({
      accessToken: 'token',
      proxyUrl: '/proxy',
    }));
    client.subscribeToTickers(['SPY']);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(client.isConnected()).toBe(true);
    expect(client.getSubscribedTickers()).toEqual(['SPY']);
    client.disconnect();
    expect(client.isConnected()).toBe(false);
  });
});
