import {
  AMTRequest,
  APIError,
  ApiClient,
  DealerMinuteSurfacesRequest,
  FetchLike,
  HindsightDataRequest,
  NewApiClient,
} from './index';

function createResponse(status: number, body: string): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: '',
    text: async () => body,
  } as Response;
}

function getHeader(headers: RequestInit['headers'] | undefined, name: string): string {
  if (!headers) {
    return '';
  }

  if (headers instanceof Headers) {
    return headers.get(name) ?? '';
  }

  if (Array.isArray(headers)) {
    const match = headers.find(([key]) => key.toLowerCase() === name.toLowerCase());
    return match?.[1] ?? '';
  }

  const map = headers as Record<string, string>;
  return map[name] ?? map[name.toLowerCase()] ?? '';
}

describe('apiclient', () => {
  it('constructs client with factory', () => {
    const client = NewApiClient('abc');
    expect(client).toBeInstanceOf(ApiClient);
  });

  it('GetHindsightData builds request and decodes envelope response', async () => {
    const fetchMock: jest.Mock<Promise<Response>, [string, RequestInit?]> = jest.fn(async (url, init) => {
      const endpoint = new URL(url);
      expect(endpoint.pathname).toBe('/api/getData');
      expect(endpoint.searchParams.get('start_date')).toBe('2025-01-01');
      expect(endpoint.searchParams.get('end_date')).toBe('2025-01-02');
      expect(endpoint.searchParams.get('country')).toBe('US');
      expect(endpoint.searchParams.get('min_volatility')).toBe('2');
      expect(endpoint.searchParams.get('event')).toBe('FOMC');

      expect(init?.method).toBe('GET');
      expect(getHeader(init?.headers, 'Accept')).toBe('application/json');
      expect(getHeader(init?.headers, 'X-API-Key')).toBe('hindsight-key');

      return createResponse(
        200,
        JSON.stringify({
          success: true,
          data: [
            {
              id: 1,
              event_id: 'evt_1',
              date: '2025-01-01',
              time: '08:30',
              timezone: 'America/New_York',
              country: 'US',
              country_code: 'US',
              event_name: 'FOMC Meeting Minutes',
              volatility: 2,
              actual: '2.1%',
              forecast: '2.0%',
              previous: '1.9%',
              created_at: '2025-01-01T00:00:00Z',
              updated_at: '2025-01-01T01:00:00Z',
            },
          ],
        }),
      );
    });

    const client = NewApiClient('hindsight-key', fetchMock as unknown as FetchLike);

    const rows = await client.GetHindsightData(undefined, {
      start_date: '2025-01-01',
      end_date: '2025-01-02',
      country: 'US',
      min_volatility: 2,
      event: 'FOMC',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(rows).toHaveLength(1);
    expect(rows[0].event_name).toBe('FOMC Meeting Minutes');
    expect(rows[0].created_at).toBeInstanceOf(Date);
    expect(rows[0].updated_at).toBeInstanceOf(Date);
  });

  it('GetHindsightData supports raw-array fallback', async () => {
    const fetchMock: jest.Mock<Promise<Response>, [string, RequestInit?]> = jest.fn(async (_url, _init) =>
      createResponse(
        200,
        JSON.stringify([
          {
            id: 2,
            event_id: 'evt_2',
            date: '2025-01-02',
            time: '09:00',
            timezone: 'America/New_York',
            country: 'US',
            country_code: 'US',
            event_name: 'CPI',
            volatility: 3,
            actual: '3.1%',
            forecast: '3.0%',
            previous: '2.9%',
          },
        ]),
      ),
    );

    const client = NewApiClient('hindsight-key', fetchMock as unknown as FetchLike);

    const rows = await client.GetHindsightData(undefined, {
      start_date: '2025-01-01',
      end_date: '2025-01-03',
    });

    expect(rows).toHaveLength(1);
    expect(rows[0].event_id).toBe('evt_2');
  });

  it('GetHindsightSample sends API key and decodes envelope', async () => {
    const fetchMock: jest.Mock<Promise<Response>, [string, RequestInit?]> = jest.fn(async (url, init) => {
      const endpoint = new URL(url);
      expect(endpoint.pathname).toBe('/api/getSample');
      expect(getHeader(init?.headers, 'X-API-Key')).toBe('sample-key');
      expect(getHeader(init?.headers, 'Accept')).toBe('application/json');

      return createResponse(
        200,
        JSON.stringify({
          success: true,
          data: [
            {
              id: 3,
              event_id: 'sample_1',
              date: '2023-08-01',
              time: '08:30',
              timezone: 'America/New_York',
              country: 'US',
              country_code: 'US',
              event_name: 'Sample Event',
              volatility: 2,
              actual: null,
              forecast: null,
              previous: null,
            },
          ],
        }),
      );
    });

    const client = NewApiClient('sample-key', fetchMock as unknown as FetchLike);
    const rows = await client.GetHindsightSample(undefined);

    expect(rows).toHaveLength(1);
    expect(rows[0].event_id).toBe('sample_1');
  });

  it('GetDealerMinuteSurfaces builds request and decodes envelope response', async () => {
    const fetchMock: jest.Mock<Promise<Response>, [string, RequestInit?]> = jest.fn(async (url, init) => {
      const endpoint = new URL(url);
      expect(endpoint.pathname).toBe('/api/getMinuteSurfaces');
      expect(endpoint.searchParams.get('symbol')).toBe('SPY');
      expect(endpoint.searchParams.get('trade_date')).toBe('2026-03-10');
      expect(getHeader(init?.headers, 'X-API-Key')).toBe('dealer-key');
      expect(getHeader(init?.headers, 'Accept')).toBe('application/json');

      return createResponse(
        200,
        JSON.stringify({
          success: true,
          data: [
            {
              id: 'a04fe5f8-27d4-4f8d-b433-22a9c9d4b30d',
              run_at: '2026-03-10T14:31:00Z',
              symbol: 'SPY',
              trade_date: '2026-03-10',
              minute_ts: '2026-03-10T14:30:00Z',
              session_minute: 61,
              spot: 512.25,
              vix: 19.3,
              surfaces: {
                gamma: [{ strike: 510, value: 1200000 }],
                vanna: [{ strike: 510, value: -80000 }],
                charm: [{ strike: 510, value: 35000 }],
                iv: [{ strike: 510, value: 0.24 }],
              },
              metadata: {
                source: 'calc-engine',
                version: 'v1',
              },
            },
          ],
        }),
      );
    });

    const client = NewApiClient('dealer-key', fetchMock as unknown as FetchLike);

    const rows = await client.GetDealerMinuteSurfaces(undefined, {
      symbol: 'SPY',
      trade_date: '2026-03-10',
    });

    expect(rows).toHaveLength(1);
    expect(rows[0].symbol).toBe('SPY');
    expect(rows[0].session_minute).toBe(61);
    expect(rows[0].metadata.source).toBe('calc-engine');
    expect(rows[0].surfaces.gamma).toHaveLength(1);
    expect(rows[0].run_at).toBeInstanceOf(Date);
    expect(rows[0].minute_ts).toBeInstanceOf(Date);
  });

  it('GetDealerMinuteSurfaces supports raw-array fallback', async () => {
    const fetchMock: jest.Mock<Promise<Response>, [string, RequestInit?]> = jest.fn(async (_url, _init) =>
      createResponse(
        200,
        JSON.stringify([
          {
            id: 'row_1',
            symbol: 'SPX',
            trade_date: '2026-03-10',
            session_minute: 5,
            spot: 5021.5,
            vix: 17.6,
            surfaces: {
              gamma: [],
              vanna: [],
              charm: [],
              iv: [],
            },
            metadata: {},
          },
        ]),
      ),
    );

    const client = NewApiClient('dealer-key', fetchMock as unknown as FetchLike);
    const rows = await client.GetDealerMinuteSurfaces(undefined, {
      symbol: 'SPX',
      trade_date: '2026-03-10',
    });

    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe('row_1');
  });

  it('GetAMTSessionStats builds request and decodes envelope response', async () => {
    const fetchMock: jest.Mock<Promise<Response>, [string, RequestInit?]> = jest.fn(async (url, init) => {
      const endpoint = new URL(url);
      expect(endpoint.pathname).toBe('/api/getSessionStats');
      expect(endpoint.searchParams.get('symbol')).toBe('MNQ');
      expect(endpoint.searchParams.get('session_id')).toBe('2026-03-10');
      expect(getHeader(init?.headers, 'X-API-Key')).toBe('amt-key');
      expect(getHeader(init?.headers, 'Accept')).toBe('application/json');

      return createResponse(
        200,
        JSON.stringify({
          success: true,
          data: [
            {
              symbol: 'MNQ',
              session_id: '2026-03-10',
              session_data: {
                sessionType: 'Trend Up',
                tpos: 245,
              },
            },
          ],
        }),
      );
    });

    const client = NewApiClient('amt-key', fetchMock as unknown as FetchLike);
    const rows = await client.GetAMTSessionStats(undefined, {
      symbol: 'mnq',
      session_id: '2026-03-10',
    });

    expect(rows).toHaveLength(1);
    expect(rows[0].symbol).toBe('MNQ');
    expect(rows[0].session_data['sessionType']).toBe('Trend Up');
  });

  it('GetAMTEvents builds request and supports raw-array fallback', async () => {
    const fetchMock: jest.Mock<Promise<Response>, [string, RequestInit?]> = jest.fn(async (url, init) => {
      const endpoint = new URL(url);
      expect(endpoint.pathname).toBe('/api/getAMTEvents');
      expect(endpoint.searchParams.get('symbol')).toBe('NQ');
      expect(endpoint.searchParams.get('session_id')).toBe('2026-03-10');
      expect(getHeader(init?.headers, 'X-API-Key')).toBe('amt-key');
      expect(getHeader(init?.headers, 'Accept')).toBe('application/json');

      return createResponse(
        200,
        JSON.stringify([
          {
            symbol: 'NQ',
            session_id: '2026-03-10',
            events: [
              {
                timestamp: 1710077400000,
                event_messages: ['Poor high'],
              },
            ],
          },
        ]),
      );
    });

    const client = NewApiClient('amt-key', fetchMock as unknown as FetchLike);
    const rows = await client.GetAMTEvents(undefined, {
      symbol: 'NQ',
      session_id: '2026-03-10',
    });

    expect(rows).toHaveLength(1);
    expect(rows[0].symbol).toBe('NQ');
    expect(rows[0].events).toHaveLength(1);
  });

  it('returns APIError for 403 invalid key', async () => {
    const fetchMock: jest.Mock<Promise<Response>, [string, RequestInit?]> = jest.fn(async (_url, _init) =>
      createResponse(403, JSON.stringify({ success: false, error: 'Invalid API key' })),
    );

    const client = NewApiClient('bad-key', fetchMock as unknown as FetchLike);

    await expect(
      client.GetHindsightData(undefined, {
        start_date: '2025-01-01',
        end_date: '2025-01-02',
      }),
    ).rejects.toMatchObject({
      StatusCode: 403,
      Message: 'Invalid API key',
    });
  });

  it('returns APIError subscription end on 403 limit response', async () => {
    const fetchMock: jest.Mock<Promise<Response>, [string, RequestInit?]> = jest.fn(async (_url, _init) =>
      createResponse(
        403,
        JSON.stringify({
          success: false,
          error: 'Requested end_date exceeds your subscription limit',
          subscriptionEnd: '2022-03-11',
        }),
      ),
    );

    const client = NewApiClient('sub-key', fetchMock as unknown as FetchLike);

    try {
      await client.GetHindsightData(undefined, {
        start_date: '2025-01-01',
        end_date: '2025-01-02',
      });
      throw new Error('expected APIError');
    } catch (error) {
      expect(error).toBeInstanceOf(APIError);
      const apiError = error as APIError;
      expect(apiError.StatusCode).toBe(403);
      expect(apiError.SubscriptionEnd).toBe('2022-03-11');
    }
  });

  it('decodes APIError status coverage for 400/401/500', async () => {
    const cases: Array<{ status: number; body: string; expected: string }> = [
      { status: 400, body: JSON.stringify({ success: false, message: 'bad request params' }), expected: 'bad request params' },
      { status: 401, body: JSON.stringify({ success: false, error: 'Unauthorized' }), expected: 'Unauthorized' },
      { status: 500, body: 'internal server error', expected: 'internal server error' },
    ];

    for (const testCase of cases) {
      const fetchMock: jest.Mock<Promise<Response>, [string, RequestInit?]> = jest.fn(async (_url, _init) =>
        createResponse(testCase.status, testCase.body),
      );
      const client = NewApiClient('x', fetchMock as unknown as FetchLike);

      await expect(
        client.GetHindsightData(undefined, {
          start_date: '2025-01-01',
          end_date: '2025-01-02',
        }),
      ).rejects.toMatchObject({
        StatusCode: testCase.status,
        Message: testCase.expected,
      });
    }
  });

  it('returns APIError with StatusCode=200 for success=false envelopes', async () => {
    const fetchMock: jest.Mock<Promise<Response>, [string, RequestInit?]> = jest.fn(async (_url, _init) =>
      createResponse(200, JSON.stringify({ success: false, error: 'not allowed' })),
    );

    const client = NewApiClient('x', fetchMock as unknown as FetchLike);

    await expect(
      client.GetDealerMinuteSurfaces(undefined, {
        symbol: 'SPY',
        trade_date: '2026-03-10',
      }),
    ).rejects.toMatchObject({
      StatusCode: 200,
      Message: 'not allowed',
    });
  });

  it('uses raw-body fallback message truncation when non-json error body is long', async () => {
    const longBody = 'x'.repeat(350);
    const fetchMock: jest.Mock<Promise<Response>, [string, RequestInit?]> = jest.fn(async (_url, _init) =>
      createResponse(500, longBody),
    );

    const client = NewApiClient('x', fetchMock as unknown as FetchLike);

    try {
      await client.GetHindsightData(undefined, {
        start_date: '2025-01-01',
        end_date: '2025-01-02',
      });
      throw new Error('expected APIError');
    } catch (error) {
      expect(error).toBeInstanceOf(APIError);
      const apiError = error as APIError;
      expect(apiError.Message.length).toBe(303);
      expect(apiError.Message.endsWith('...')).toBe(true);
      expect(apiError.RawBody).toBe(longBody);
    }
  });

  describe('validation', () => {
    const noopFetch: FetchLike = async () => createResponse(200, '[]');

    it('requires api key on authenticated endpoints', async () => {
      const client = NewApiClient('', noopFetch);

      await expect(
        client.GetDealerMinuteSurfaces(undefined, {
          symbol: 'SPY',
          trade_date: '2026-03-10',
        }),
      ).rejects.toThrow('api key is required');

      await expect(client.GetHindsightSample(undefined)).rejects.toThrow('api key is required');
    });

    it('validates hindsight dates and min volatility', async () => {
      const client = NewApiClient('k', noopFetch);

      const missingStart: HindsightDataRequest = { start_date: '', end_date: '2025-01-01' };
      await expect(client.GetHindsightData(undefined, missingStart)).rejects.toThrow('start_date is required');

      const invalidStart: HindsightDataRequest = { start_date: '2025-02-30', end_date: '2025-03-01' };
      await expect(client.GetHindsightData(undefined, invalidStart)).rejects.toThrow('start_date must be in YYYY-MM-DD format');

      const invalidEndOrder: HindsightDataRequest = { start_date: '2025-03-02', end_date: '2025-03-01' };
      await expect(client.GetHindsightData(undefined, invalidEndOrder)).rejects.toThrow('end_date must be on or after start_date');

      const invalidVol: HindsightDataRequest = {
        start_date: '2025-01-01',
        end_date: '2025-01-02',
        min_volatility: 4,
      };
      await expect(client.GetHindsightData(undefined, invalidVol)).rejects.toThrow(
        'min_volatility must be between 1 and 3 when provided',
      );
    });

    it('validates dealer required fields and trade_date format', async () => {
      const client = NewApiClient('k', noopFetch);

      const missingSymbol: DealerMinuteSurfacesRequest = { symbol: '', trade_date: '2026-03-10' };
      await expect(client.GetDealerMinuteSurfaces(undefined, missingSymbol)).rejects.toThrow('symbol is required');

      const missingDate: DealerMinuteSurfacesRequest = { symbol: 'SPY', trade_date: '' };
      await expect(client.GetDealerMinuteSurfaces(undefined, missingDate)).rejects.toThrow('trade_date is required');

      const invalidDate: DealerMinuteSurfacesRequest = { symbol: 'SPY', trade_date: '03-10-2026' };
      await expect(client.GetDealerMinuteSurfaces(undefined, invalidDate)).rejects.toThrow(
        'trade_date must be in YYYY-MM-DD format',
      );
    });

    it('validates AMT required fields and session_id format', async () => {
      const client = NewApiClient('k', noopFetch);

      const missingSymbol: AMTRequest = { symbol: '', session_id: '2026-03-10' };
      await expect(client.GetAMTSessionStats(undefined, missingSymbol)).rejects.toThrow('symbol is required');

      const missingSessionID: AMTRequest = { symbol: 'NQ', session_id: '' };
      await expect(client.GetAMTEvents(undefined, missingSessionID)).rejects.toThrow('session_id is required');

      const invalidSessionID: AMTRequest = { symbol: 'NQ', session_id: '03-10-2026' };
      await expect(client.GetAMTSessionStats(undefined, invalidSessionID)).rejects.toThrow(
        'session_id must be in YYYY-MM-DD format',
      );
    });
  });
});
