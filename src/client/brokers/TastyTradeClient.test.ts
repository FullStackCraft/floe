import { NormalizedOption, NormalizedTicker } from '../../types';
import { Broker, FloeClient } from '../FloeClient';
import { TastyTradeApiError, TastyTradeClient } from './TastyTradeClient';

type SentMessage = { type: string; channel: number; [key: string]: unknown };

/**
 * Minimal stand-in for the browser WebSocket. Tests drive the server side
 * with open(), receive() and serverClose().
 */
class FakeWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  static instances: FakeWebSocket[] = [];

  readyState = FakeWebSocket.CONNECTING;
  sent: SentMessage[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: ((event: { code: number; reason: string }) => void) | null = null;

  constructor(public url: string) {
    FakeWebSocket.instances.push(this);
  }

  send(data: string): void {
    this.sent.push(JSON.parse(data));
  }

  close(): void {
    this.readyState = FakeWebSocket.CLOSED;
  }

  open(): void {
    this.readyState = FakeWebSocket.OPEN;
    this.onopen?.();
  }

  receive(message: object): void {
    this.onmessage?.({ data: JSON.stringify(message) });
  }

  serverClose(code = 1006, reason = 'gone'): void {
    this.readyState = FakeWebSocket.CLOSED;
    this.onclose?.({ code, reason });
  }

  sentOfType(type: string): SentMessage[] {
    return this.sent.filter((message) => message.type === type);
  }

  /** Runs the DxLink handshake through FEED_CONFIG */
  handshake(feedConfig: object = {}): void {
    this.open();
    this.receive({ type: 'SETUP', channel: 0, version: '1.0', keepaliveTimeout: 60, acceptKeepaliveTimeout: 60 });
    this.receive({ type: 'AUTH_STATE', channel: 0, state: 'UNAUTHORIZED' });
    this.receive({ type: 'AUTH_STATE', channel: 0, state: 'AUTHORIZED', userId: 'user' });
    this.receive({ type: 'CHANNEL_OPENED', channel: 1, service: 'FEED', parameters: {} });
    this.receive({ type: 'FEED_CONFIG', channel: 1, aggregationPeriod: 0.1, dataFormat: 'COMPACT', ...feedConfig });
  }
}

const jsonResponse = (body: unknown, status = 200): Response => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json' },
});

const quoteTokenResponse = (token: string) => jsonResponse({
  data: { token, 'dxlink-url': 'wss://dxlink.example.test/realtime', level: 'api' },
  context: '/api-quote-tokens',
});

const waitFor = async (predicate: () => boolean, timeoutMs = 3000): Promise<void> => {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error('waitFor timed out');
    }
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
};

const latestSocket = (): FakeWebSocket => FakeWebSocket.instances[FakeWebSocket.instances.length - 1];

const authHeaderOf = (call: unknown[]): string | undefined => {
  const init = call[1] as RequestInit | undefined;
  return (init?.headers as Record<string, string> | undefined)?.Authorization;
};

describe('TastyTradeClient', () => {
  const originalFetch = global.fetch;
  const originalWebSocket = (global as { WebSocket?: unknown }).WebSocket;
  let fetchMock: jest.Mock;
  let clients: Array<{ disconnect: () => void }>;

  const connectClient = async (
    options: Partial<ConstructorParameters<typeof TastyTradeClient>[0]> = {},
    feedConfig: object = {}
  ): Promise<{ client: TastyTradeClient; ws: FakeWebSocket }> => {
    const client = new TastyTradeClient({ sessionToken: 'access-1', baseReconnectDelay: 1, ...options });
    clients.push(client);
    const connecting = client.connect();
    await waitFor(() => FakeWebSocket.instances.length > 0);
    const ws = latestSocket();
    ws.handshake(feedConfig);
    await connecting;
    return { client, ws };
  };

  beforeEach(() => {
    FakeWebSocket.instances = [];
    clients = [];
    (global as { WebSocket?: unknown }).WebSocket = FakeWebSocket;
    fetchMock = jest.fn(async () => quoteTokenResponse('quote-1'));
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    clients.forEach((client) => client.disconnect());
    global.fetch = originalFetch;
    (global as { WebSocket?: unknown }).WebSocket = originalWebSocket;
  });

  it('authenticates with the quote token and sends the access token as a Bearer header', async () => {
    const { ws } = await connectClient();

    expect(authHeaderOf(fetchMock.mock.calls[0])).toBe('Bearer access-1');
    expect(ws.url).toBe('wss://dxlink.example.test/realtime');
    expect(ws.sentOfType('AUTH')).toEqual([{ type: 'AUTH', channel: 0, token: 'quote-1' }]);
    expect(ws.sentOfType('FEED_SETUP')[0]).toMatchObject({ acceptDataFormat: 'COMPACT' });
  });

  it('decodes every event in a COMPACT batch, not just the first', async () => {
    const { client, ws } = await connectClient();
    const updates: NormalizedOption[] = [];
    client.on('optionUpdate', (option: NormalizedOption) => updates.push(option));

    client.subscribe(['SPY261120C00500000', 'SPY261120C00505000', 'SPY261120P00495000']);
    ws.receive({
      type: 'FEED_DATA',
      channel: 1,
      data: [
        'Quote',
        [
          'Quote', '.SPY261120C500', 4.1, 4.3, 10, 12,
          'Quote', '.SPY261120C505', 2.0, 2.2, 5, 6,
          'Quote', '.SPY261120P495', 3.5, 3.7, 7, 8,
        ],
      ],
    });

    expect(updates.map((option) => option.occSymbol)).toEqual([
      'SPY261120C00500000',
      'SPY261120C00505000',
      'SPY261120P00495000',
    ]);
    expect(client.getOption('SPY261120C00505000')).toMatchObject({ bid: 2.0, ask: 2.2, mark: 2.1 });
  });

  it('decodes with the field order FEED_CONFIG returns', async () => {
    const { client, ws } = await connectClient({}, {
      eventFields: { Quote: ['eventType', 'eventSymbol', 'askPrice', 'bidPrice', 'askSize', 'bidSize'] },
    });

    client.subscribe(['SPY261120C00500000']);
    ws.receive({
      type: 'FEED_DATA',
      channel: 1,
      data: ['Quote', ['Quote', '.SPY261120C500', 4.3, 4.1, 12, 10]],
    });

    expect(client.getOption('SPY261120C00500000')).toMatchObject({ bid: 4.1, ask: 4.3, bidSize: 10, askSize: 12 });
  });

  it('keeps open interest from a Summary that arrives before any Quote', async () => {
    const { client, ws } = await connectClient();
    client.subscribe(['SPY261120C00500000']);

    ws.receive({
      type: 'FEED_DATA',
      channel: 1,
      data: ['Summary', ['Summary', '.SPY261120C500', 1234, 'NaN', 'NaN', 'NaN', 4.0]],
    });
    expect(client.getOption('SPY261120C00500000')).toMatchObject({
      openInterest: 1234,
      liveOpenInterest: 1234,
      strike: 500,
      optionType: 'call',
    });

    ws.receive({
      type: 'FEED_DATA',
      channel: 1,
      data: ['Quote', ['Quote', '.SPY261120C500', 4.1, 4.3, 10, 12]],
    });
    expect(client.getOption('SPY261120C00500000')).toMatchObject({ openInterest: 1234, bid: 4.1 });
  });

  it('ignores NaN open interest but accepts zero', async () => {
    const { client, ws } = await connectClient();
    client.subscribe(['SPY261120C00500000', 'SPY261120C00505000']);

    ws.receive({
      type: 'FEED_DATA',
      channel: 1,
      data: [
        'Summary',
        [
          'Summary', '.SPY261120C500', 'NaN', 'NaN', 'NaN', 'NaN', 'NaN',
          'Summary', '.SPY261120C505', 0, 'NaN', 'NaN', 'NaN', 'NaN',
        ],
      ],
    });

    expect(client.getOption('SPY261120C00500000')).toBeUndefined();
    expect(client.getOption('SPY261120C00505000')).toMatchObject({ openInterest: 0 });
  });

  it('records IV from Greeks that arrive before any Quote', async () => {
    const { client, ws } = await connectClient();
    client.subscribe(['SPY261120C00500000']);

    ws.receive({
      type: 'FEED_DATA',
      channel: 1,
      data: ['Greeks', ['Greeks', '.SPY261120C500', 0.21, 0.5, 0.02, -0.1, 0.01, 0.3]],
    });

    expect(client.getOption('SPY261120C00500000')).toMatchObject({ impliedVolatility: 0.21 });
  });

  it('formats streamer symbols the way dxFeed does', async () => {
    const { client, ws } = await connectClient();
    client.subscribe(['SPY261120C00472500', 'SPXW261120P05800000']);

    const symbols = ws.sentOfType('FEED_SUBSCRIPTION')
      .flatMap((message) => (message.add as Array<{ symbol: string }> | undefined) ?? [])
      .map((entry) => entry.symbol);
    expect(new Set(symbols)).toEqual(new Set(['.SPY261120C472.5', '.SPXW261120P5800']));

    ws.receive({
      type: 'FEED_DATA',
      channel: 1,
      data: ['Quote', ['Quote', '.SPY261120C472.5', 1.0, 1.2, 1, 1]],
    });
    expect(client.getOption('SPY261120C00472500')).toMatchObject({ strike: 472.5 });
  });

  it('takes index spot from trades when there is no two-sided quote', async () => {
    const { client, ws } = await connectClient();
    const spots: number[] = [];
    client.on('tickerUpdate', (ticker: NormalizedTicker) => {
      if (ticker.symbol === 'SPX') spots.push(ticker.spot);
    });
    client.subscribe(['SPX', 'SPY']);

    ws.receive({
      type: 'FEED_DATA',
      channel: 1,
      data: [
        'Quote', ['Quote', 'SPX', 'NaN', 'NaN', 'NaN', 'NaN', 'Quote', 'SPY', 580.1, 580.3, 100, 100],
        'Trade', ['Trade', 'SPX', 5800.5, 'NaN', 'NaN', 'Trade', 'SPY', 580.25, 1000000, 100],
      ],
    });
    ws.receive({
      type: 'FEED_DATA',
      channel: 1,
      data: ['Trade', ['Trade', 'SPX', 5810.25, 'NaN', 'NaN']],
    });

    expect(spots).toEqual([0, 5800.5, 5810.25]);
    // Equities keep using the quote mid
    expect(client.getTicker('SPY')?.spot).toBeCloseTo(580.2);
  });

  it('subscribes queued symbols once, when FEED_CONFIG arrives', async () => {
    const client = new TastyTradeClient({ sessionToken: 'access-1' });
    clients.push(client);
    client.subscribe(['SPY']);

    const connecting = client.connect();
    await waitFor(() => FakeWebSocket.instances.length > 0);
    const ws = latestSocket();
    ws.handshake();
    await connecting;
    ws.receive({ type: 'FEED_CONFIG', channel: 1, aggregationPeriod: 0.1, dataFormat: 'COMPACT' });

    expect(ws.sentOfType('FEED_SUBSCRIPTION')).toHaveLength(1);
  });

  it('re-authorizes with a new quote token and resubscribes after the socket drops', async () => {
    const { client, ws: first } = await connectClient();
    client.subscribe(['SPY', 'SPY261120C00500000']);
    client.updateAuthToken('access-2');
    fetchMock.mockImplementation(async () => quoteTokenResponse('quote-2'));

    let connectedEvents = 0;
    client.on('connected', () => { connectedEvents++; });

    first.serverClose(1006, 'network');
    await waitFor(() => FakeWebSocket.instances.length === 2);
    const second = latestSocket();
    second.handshake();

    expect(authHeaderOf(fetchMock.mock.calls[1])).toBe('Bearer access-2');
    expect(second.sentOfType('AUTH')).toEqual([{ type: 'AUTH', channel: 0, token: 'quote-2' }]);
    const resubscribed = second.sentOfType('FEED_SUBSCRIPTION')
      .flatMap((message) => (message.add as Array<{ symbol: string }> | undefined) ?? [])
      .map((entry) => entry.symbol);
    expect(resubscribed).toEqual(expect.arrayContaining(['SPY', '.SPY261120C500']));
    expect(connectedEvents).toBe(1);
    expect(client.isConnected()).toBe(true);
  });

  it('stops reconnecting and emits a 401 TastyTradeApiError when the access token is stale', async () => {
    const { client, ws } = await connectClient();
    const errors: Error[] = [];
    client.on('error', (error: Error) => errors.push(error));
    fetchMock.mockImplementation(async () => jsonResponse({
      error: { code: 'unauthorized', message: 'No valid access token was provided' },
    }, 401));

    ws.serverClose(1006, 'network');
    await waitFor(() => errors.length > 0);

    expect(errors[0]).toBeInstanceOf(TastyTradeApiError);
    expect(errors[0]).toMatchObject({ status: 401, code: 'unauthorized' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(FakeWebSocket.instances).toHaveLength(1);
  });

  it('rejects connect() with the API error code instead of emitting it', async () => {
    fetchMock.mockImplementation(async () => jsonResponse({
      error: { code: 'quote_streamer.customer_not_found_error', message: 'Customer not found' },
    }, 404));
    const client = new TastyTradeClient({ sessionToken: 'access-1' });
    clients.push(client);
    const errors: Error[] = [];
    client.on('error', (error: Error) => errors.push(error));

    await expect(client.connect()).rejects.toMatchObject({
      name: 'TastyTradeApiError',
      status: 404,
      code: 'quote_streamer.customer_not_found_error',
    });
    expect(errors).toHaveLength(0);
  });

  it('rejects connect() when DxLink refuses the quote token', async () => {
    const client = new TastyTradeClient({ sessionToken: 'access-1' });
    clients.push(client);
    const connecting = client.connect();
    await waitFor(() => FakeWebSocket.instances.length > 0);
    const ws = latestSocket();

    ws.open();
    ws.receive({ type: 'AUTH_STATE', channel: 0, state: 'UNAUTHORIZED' });
    ws.receive({ type: 'AUTH_STATE', channel: 0, state: 'UNAUTHORIZED' });

    await expect(connecting).rejects.toMatchObject({ status: 401, code: 'dxlink_unauthorized' });
  });

  it('times out when DxLink never authorizes', async () => {
    const client = new TastyTradeClient({ sessionToken: 'access-1', connectTimeoutMs: 20 });
    clients.push(client);
    const connecting = client.connect();
    await waitFor(() => FakeWebSocket.instances.length > 0);
    latestSocket().open();

    await expect(connecting).rejects.toThrow(/Timed out/);
  });

  it('does not reconnect after disconnect()', async () => {
    const { client, ws } = await connectClient();
    client.disconnect();
    ws.serverClose(1000, 'bye');

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(FakeWebSocket.instances).toHaveLength(1);
  });
});

describe('FloeClient with TastyTrade', () => {
  const originalFetch = global.fetch;
  const originalWebSocket = (global as { WebSocket?: unknown }).WebSocket;

  afterEach(() => {
    global.fetch = originalFetch;
    (global as { WebSocket?: unknown }).WebSocket = originalWebSocket;
  });

  it('passes updated tokens through and announces reconnects', async () => {
    FakeWebSocket.instances = [];
    (global as { WebSocket?: unknown }).WebSocket = FakeWebSocket;
    const fetchMock = jest.fn(async () => quoteTokenResponse('quote-1'));
    global.fetch = fetchMock as unknown as typeof fetch;

    const client = new FloeClient();
    let connectedEvents = 0;
    client.on('connected', () => { connectedEvents++; });

    try {
      const connecting = client.connect(Broker.TASTYTRADE, 'access-1');
      await waitFor(() => FakeWebSocket.instances.length > 0);
      latestSocket().handshake();
      await connecting;
      expect(connectedEvents).toBe(1);

      client.updateAuthToken('access-2');
      latestSocket().serverClose(1006, 'network');

      // First reconnect attempt waits the default 1s backoff
      await waitFor(() => FakeWebSocket.instances.length === 2, 4000);
      latestSocket().handshake();

      expect(authHeaderOf(fetchMock.mock.calls[1] as unknown[])).toBe('Bearer access-2');
      expect(connectedEvents).toBe(2);
    } finally {
      client.disconnect();
    }
  });
});
