import { Broker, FloeClient } from '../FloeClient';
import { TradierClient } from './TradierClient';

/**
 * Minimal stand-in for the browser WebSocket. Like a browser, closing a socket
 * that is still connecting fires `error` and then `close` with code 1006, both
 * dispatched later to whatever handlers are attached at that point.
 */
class FakeWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  static instances: FakeWebSocket[] = [];

  readyState = FakeWebSocket.CONNECTING;
  sent: unknown[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  onclose: ((event: { code: number; reason: string }) => void) | null = null;

  constructor(public url: string) {
    FakeWebSocket.instances.push(this);
  }

  send(data: string): void {
    this.sent.push(JSON.parse(data));
  }

  close(code = 1000, reason = ''): void {
    const wasConnecting = this.readyState === FakeWebSocket.CONNECTING;
    this.readyState = FakeWebSocket.CLOSED;
    setTimeout(() => {
      if (wasConnecting) {
        this.onerror?.({ type: 'error' });
        this.onclose?.({ code: 1006, reason: '' });
      } else {
        this.onclose?.({ code, reason });
      }
    }, 0);
  }

  open(): void {
    this.readyState = FakeWebSocket.OPEN;
    this.onopen?.();
  }

  serverClose(code = 1006, reason = 'gone'): void {
    this.readyState = FakeWebSocket.CLOSED;
    this.onclose?.({ code, reason });
  }
}

const sessionResponse = (sessionid = 'session-1'): Response => new Response(
  JSON.stringify({ stream: { url: 'https://stream.tradier.com/v1/markets/events', sessionid } }),
  { status: 200, headers: { 'Content-Type': 'application/json' } },
);

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const waitFor = async (predicate: () => boolean, timeoutMs = 3000): Promise<void> => {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error('waitFor timed out');
    }
    await sleep(1);
  }
};

const trackEvents = (client: TradierClient) => {
  const events = { errors: [] as Error[], connected: 0, disconnected: 0 };
  client.on('error', (error: Error) => events.errors.push(error));
  client.on('connected', () => { events.connected++; });
  client.on('disconnected', () => { events.disconnected++; });
  return events;
};

describe('TradierClient connection lifecycle', () => {
  const originalFetch = global.fetch;
  const originalWebSocket = (global as { WebSocket?: unknown }).WebSocket;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    FakeWebSocket.instances = [];
    (global as { WebSocket?: unknown }).WebSocket = FakeWebSocket;
    fetchMock = jest.fn(async () => sessionResponse());
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    (global as { WebSocket?: unknown }).WebSocket = originalWebSocket;
  });

  it('disconnect() while the socket is connecting rejects connect() without an error or a reconnect', async () => {
    const client = new TradierClient({ authToken: 'token', baseReconnectDelay: 1 });
    const events = trackEvents(client);

    const connecting = client.connect();
    await waitFor(() => FakeWebSocket.instances.length === 1);
    client.disconnect();

    await expect(connecting).rejects.toThrow('closed before it was established');
    await sleep(20); // past the socket's error/close dispatch and any 1ms reconnect

    expect(events.errors).toEqual([]);
    expect(events.connected).toBe(0);
    expect(events.disconnected).toBe(1);
    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(FakeWebSocket.instances[0].readyState).toBe(FakeWebSocket.CLOSED);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('disconnect() while the session request is in flight opens no socket', async () => {
    let resolveSession!: (response: Response) => void;
    fetchMock.mockImplementationOnce(() => new Promise<Response>((resolve) => { resolveSession = resolve; }));
    const client = new TradierClient({ authToken: 'token' });
    const events = trackEvents(client);

    const connecting = client.connect();
    client.disconnect();
    resolveSession(sessionResponse());

    await expect(connecting).rejects.toThrow('closed before it was established');
    expect(FakeWebSocket.instances).toHaveLength(0);
    expect(events.errors).toEqual([]);
    expect(events.connected).toBe(0);
  });

  it('disconnect() while the session request is in flight swallows its failure', async () => {
    let rejectSession!: (error: Error) => void;
    fetchMock.mockImplementationOnce(() => new Promise<Response>((_, reject) => { rejectSession = reject; }));
    const client = new TradierClient({ authToken: 'token' });
    const events = trackEvents(client);

    const connecting = client.connect();
    client.disconnect();
    rejectSession(new TypeError('Failed to fetch'));

    await expect(connecting).rejects.toThrow('closed before it was established');
    expect(events.errors).toEqual([]);
  });

  it('disconnect() during the reconnect backoff cancels the reconnect', async () => {
    const client = new TradierClient({ authToken: 'token', baseReconnectDelay: 30 });
    const events = trackEvents(client);

    const connecting = client.connect();
    await waitFor(() => FakeWebSocket.instances.length === 1);
    FakeWebSocket.instances[0].open();
    await connecting;

    FakeWebSocket.instances[0].serverClose(1006);
    client.disconnect();
    await sleep(60);

    expect(events.disconnected).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(events.errors).toEqual([]);
  });

  it('reconnects a dropped stream and resubscribes its symbols', async () => {
    fetchMock
      .mockImplementationOnce(async () => sessionResponse('session-1'))
      .mockImplementationOnce(async () => sessionResponse('session-2'));
    const client = new TradierClient({ authToken: 'token', baseReconnectDelay: 1 });
    const events = trackEvents(client);

    const connecting = client.connect();
    await waitFor(() => FakeWebSocket.instances.length === 1);
    FakeWebSocket.instances[0].open();
    await connecting;
    client.subscribe(['SPY']);

    FakeWebSocket.instances[0].serverClose(1006);
    await waitFor(() => FakeWebSocket.instances.length === 2);
    FakeWebSocket.instances[1].open();

    expect(FakeWebSocket.instances[1].sent).toEqual([{ sessionid: 'session-2', symbols: ['SPY'] }]);
    expect(events.connected).toBe(2);
    expect(events.errors).toEqual([]);

    client.disconnect();
  });

  it('FloeClient.disconnect() mid-connect emits neither connected nor error', async () => {
    const client = new FloeClient();
    const errors: Error[] = [];
    let connectedEvents = 0;
    client.on('error', (error: Error) => errors.push(error));
    client.on('connected', () => { connectedEvents++; });

    const connecting = client.connect(Broker.TRADIER, 'token');
    await waitFor(() => FakeWebSocket.instances.length === 1);
    client.disconnect();

    await expect(connecting).rejects.toThrow('closed before it was established');
    await sleep(20);

    expect(errors).toEqual([]);
    expect(connectedEvents).toBe(0);
    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
