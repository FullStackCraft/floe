const DEFAULT_HINDSIGHT_BASE_URL = 'https://hindsightapi.com/api';
const DEFAULT_DEALER_BASE_URL = 'https://vannacharm.com/api';
const DEFAULT_AMT_BASE_URL = 'https://amtjoy.com/api';
const DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface ApiContext {
  signal?: AbortSignal;
}

export type CtxEquivalent = ApiContext | AbortSignal | null | undefined;

export interface HindsightDataRequest {
  start_date: string;
  end_date: string;
  country?: string;
  min_volatility?: number;
  event?: string;
}

export interface DealerMinuteSurfacesRequest {
  symbol: string;
  trade_date: string;
}

export interface AMTRequest {
  symbol: string;
  session_id: string;
}

export interface HindsightEvent {
  id: number;
  event_id: string;
  date: string;
  time: string;
  timezone: string;
  country: string;
  country_code: string;
  event_name: string;
  volatility: number;
  actual: string | null;
  forecast: string | null;
  previous: string | null;
  created_at: Date | null;
  updated_at: Date | null;
}

export interface SurfacePoint {
  strike?: number;
  value?: number;
  x?: number;
  y?: number;
}

export interface MinuteSurface {
  gamma: SurfacePoint[];
  vanna: SurfacePoint[];
  charm: SurfacePoint[];
  iv: SurfacePoint[];
}

export interface DealerMinuteSurface {
  id: string;
  run_at: Date | null;
  symbol: string;
  trade_date: string;
  minute_ts: Date | null;
  session_minute: number;
  spot: number;
  vix: number;
  surfaces: MinuteSurface;
  metadata: Record<string, unknown>;
}

export interface AMTSessionStatsRow {
  symbol: string;
  session_id: string;
  session_data: Record<string, unknown>;
}

export interface AMTEventsRow {
  symbol: string;
  session_id: string;
  events: Array<Record<string, unknown>>;
}

const STATUS_TEXT: Record<number, string> = {
  200: 'OK',
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  408: 'Request Timeout',
  429: 'Too Many Requests',
  500: 'Internal Server Error',
  502: 'Bad Gateway',
  503: 'Service Unavailable',
  504: 'Gateway Timeout',
};

export class APIError extends Error {
  public readonly StatusCode: number;
  public readonly Message: string;
  public readonly SubscriptionEnd: string;
  public readonly RawBody: string;

  constructor(params: {
    StatusCode: number;
    Message: string;
    SubscriptionEnd?: string;
    RawBody?: string;
  }) {
    const statusCode = params.StatusCode;
    const message = params.Message ?? '';
    const statusText = statusCode > 0 ? `${statusCode} ${statusTextForCode(statusCode)}`.trim() : '';

    const errorMessage =
      statusText !== '' && message !== ''
        ? `api error: ${statusText}: ${message}`
        : message !== ''
          ? `api error: ${message}`
          : statusText !== ''
            ? `api error: ${statusText}`
            : 'api error';

    super(errorMessage);
    this.name = 'APIError';
    this.StatusCode = statusCode;
    this.Message = message;
    this.SubscriptionEnd = params.SubscriptionEnd ?? '';
    this.RawBody = params.RawBody ?? '';
  }
}

export class ApiClient {
  private readonly apiKey: string;
  private readonly httpClient: FetchLike;
  private readonly hindsightBaseURL: string;
  private readonly dealerBaseURL: string;
  private readonly amtBaseURL: string;

  constructor(apiKey: string, httpClient?: FetchLike) {
    this.apiKey = apiKey.trim();

    const resolvedClient =
      httpClient ??
      (typeof globalThis.fetch === 'function'
        ? ((input: string, init?: RequestInit) => globalThis.fetch(input, init))
        : undefined);

    if (typeof resolvedClient !== 'function') {
      throw new Error('http client is required');
    }

    this.httpClient = resolvedClient;
    this.hindsightBaseURL = DEFAULT_HINDSIGHT_BASE_URL;
    this.dealerBaseURL = DEFAULT_DEALER_BASE_URL;
    this.amtBaseURL = DEFAULT_AMT_BASE_URL;
  }

  async GetHindsightData(ctx: CtxEquivalent, req: HindsightDataRequest): Promise<HindsightEvent[]> {
    validateHindsightDataRequest(req);

    const query = new URLSearchParams();
    query.set('start_date', req.start_date.trim());
    query.set('end_date', req.end_date.trim());

    if (typeof req.country === 'string' && req.country.trim() !== '') {
      query.set('country', req.country.trim());
    }
    if (typeof req.min_volatility === 'number') {
      query.set('min_volatility', String(req.min_volatility));
    }
    if (typeof req.event === 'string' && req.event.trim() !== '') {
      query.set('event', req.event.trim());
    }

    const body = await this.getRaw(ctx, this.hindsightBaseURL, '/getData', query, true);
    return decodeHindsightEvents(body);
  }

  async GetHindsightSample(ctx?: CtxEquivalent): Promise<HindsightEvent[]> {
    const body = await this.getRaw(ctx, this.hindsightBaseURL, '/getSample', null, true);
    return decodeHindsightEvents(body);
  }

  async GetDealerMinuteSurfaces(
    ctx: CtxEquivalent,
    req: DealerMinuteSurfacesRequest,
  ): Promise<DealerMinuteSurface[]> {
    validateDealerMinuteSurfacesRequest(req);

    const query = new URLSearchParams();
    query.set('symbol', req.symbol.trim());
    query.set('trade_date', req.trade_date.trim());

    const body = await this.getRaw(ctx, this.dealerBaseURL, '/getMinuteSurfaces', query, true);
    return decodeDealerMinuteSurfaces(body);
  }

  async GetAMTSessionStats(ctx: CtxEquivalent, req: AMTRequest): Promise<AMTSessionStatsRow[]> {
    validateAMTRequest(req);

    const query = new URLSearchParams();
    query.set('symbol', req.symbol.trim().toUpperCase());
    query.set('session_id', req.session_id.trim());

    const body = await this.getRaw(ctx, this.amtBaseURL, '/getSessionStats', query, true);
    return decodeAMTSessionStats(body);
  }

  async GetAMTEvents(ctx: CtxEquivalent, req: AMTRequest): Promise<AMTEventsRow[]> {
    validateAMTRequest(req);

    const query = new URLSearchParams();
    query.set('symbol', req.symbol.trim().toUpperCase());
    query.set('session_id', req.session_id.trim());

    const body = await this.getRaw(ctx, this.amtBaseURL, '/getAMTEvents', query, true);
    return decodeAMTEvents(body);
  }

  private async getRaw(
    ctx: CtxEquivalent,
    baseURL: string,
    path: string,
    query: URLSearchParams | null,
    requiresAPIKey: boolean,
  ): Promise<string> {
    if (requiresAPIKey && this.apiKey.trim() === '') {
      throw new Error('api key is required');
    }

    const trimmedBaseURL = baseURL.trim();
    if (trimmedBaseURL === '') {
      throw new Error('base URL is required');
    }

    let endpoint: URL;
    try {
      endpoint = new URL(`${trimmedBaseURL.replace(/\/$/, '')}${path}`);
    } catch (error) {
      throw new Error(`failed to parse endpoint URL: ${toErrorMessage(error)}`);
    }

    if (query !== null) {
      endpoint.search = query.toString();
    }

    const headers: Record<string, string> = {
      Accept: 'application/json',
    };
    if (requiresAPIKey) {
      headers['X-API-Key'] = this.apiKey;
    }

    const signal = resolveSignal(ctx);

    let response: Response;
    try {
      response = await this.httpClient(endpoint.toString(), {
        method: 'GET',
        headers,
        signal,
      });
    } catch (error) {
      throw new Error(`request failed: ${toErrorMessage(error)}`);
    }

    let body: string;
    try {
      body = await response.text();
    } catch (error) {
      throw new Error(`failed to read response body: ${toErrorMessage(error)}`);
    }

    if (!response.ok) {
      throw decodeAPIError(response.status, body);
    }

    if (body.trim() === '') {
      throw new Error('empty response body');
    }

    return body;
  }
}

export function NewApiClient(apiKey: string, httpClient?: FetchLike): ApiClient {
  return new ApiClient(apiKey, httpClient);
}

function validateHindsightDataRequest(req: HindsightDataRequest): void {
  const startDate = (req.start_date ?? '').trim();
  const endDate = (req.end_date ?? '').trim();

  if (startDate === '') {
    throw new Error('start_date is required');
  }
  if (endDate === '') {
    throw new Error('end_date is required');
  }

  const start = parseDateOnly(startDate);
  if (start === null) {
    throw new Error('start_date must be in YYYY-MM-DD format');
  }

  const end = parseDateOnly(endDate);
  if (end === null) {
    throw new Error('end_date must be in YYYY-MM-DD format');
  }

  if (end.getTime() < start.getTime()) {
    throw new Error('end_date must be on or after start_date');
  }

  if (
    req.min_volatility !== undefined &&
    req.min_volatility !== null &&
    (!Number.isInteger(req.min_volatility) || req.min_volatility < 1 || req.min_volatility > 3)
  ) {
    throw new Error('min_volatility must be between 1 and 3 when provided');
  }
}

function validateDealerMinuteSurfacesRequest(req: DealerMinuteSurfacesRequest): void {
  const symbol = (req.symbol ?? '').trim();
  const tradeDate = (req.trade_date ?? '').trim();

  if (symbol === '') {
    throw new Error('symbol is required');
  }
  if (tradeDate === '') {
    throw new Error('trade_date is required');
  }
  if (parseDateOnly(tradeDate) === null) {
    throw new Error('trade_date must be in YYYY-MM-DD format');
  }
}

function validateAMTRequest(req: AMTRequest): void {
  const symbol = (req.symbol ?? '').trim();
  const sessionID = (req.session_id ?? '').trim();

  if (symbol === '') {
    throw new Error('symbol is required');
  }
  if (sessionID === '') {
    throw new Error('session_id is required');
  }
  if (parseDateOnly(sessionID) === null) {
    throw new Error('session_id must be in YYYY-MM-DD format');
  }
}

function decodeAPIError(statusCode: number, body: string): APIError {
  const trimmed = body.trim();
  if (trimmed === '') {
    return new APIError({
      StatusCode: statusCode,
      Message: statusTextForCode(statusCode),
    });
  }

  let message = '';
  let subscriptionEnd = '';

  const parsed = parseJSON(body);
  const obj = asRecord(parsed);
  if (obj !== null) {
    message = firstNonEmpty(
      getStringOrEmpty(obj.error),
      getStringOrEmpty(obj.message),
    );
    subscriptionEnd = firstNonEmpty(
      getStringOrEmpty(obj.subscriptionEnd),
      getStringOrEmpty(obj.subscription_end),
    );
  }

  if (message === '') {
    message = truncateForError(trimmed);
  }
  if (message === '') {
    message = statusTextForCode(statusCode);
  }

  return new APIError({
    StatusCode: statusCode,
    Message: message,
    SubscriptionEnd: subscriptionEnd,
    RawBody: body,
  });
}

function decodeHindsightEvents(body: string): HindsightEvent[] {
  const parsed = parseJSON(body);

  const envelope = asRecord(parsed);
  if (envelope !== null) {
    const hasEnvelope =
      envelope.success === true ||
      Array.isArray(envelope.data) ||
      nonEmptyString(envelope.error) ||
      nonEmptyString(envelope.message) ||
      nonEmptyString(envelope.subscriptionEnd) ||
      nonEmptyString(envelope.subscription_end);

    if (hasEnvelope) {
      if (envelope.success !== true) {
        throw new APIError({
          StatusCode: 200,
          Message: firstNonEmpty(
            getStringOrEmpty(envelope.error),
            getStringOrEmpty(envelope.message),
            'request failed',
          ),
          SubscriptionEnd: firstNonEmpty(
            getStringOrEmpty(envelope.subscriptionEnd),
            getStringOrEmpty(envelope.subscription_end),
          ),
          RawBody: body,
        });
      }

      const rows = Array.isArray(envelope.data) ? envelope.data : [];
      return rows.map(normalizeHindsightEvent);
    }
  }

  if (Array.isArray(parsed)) {
    return parsed.map(normalizeHindsightEvent);
  }

  throw new Error('failed to decode hindsight response');
}

function decodeDealerMinuteSurfaces(body: string): DealerMinuteSurface[] {
  const parsed = parseJSON(body);

  const envelope = asRecord(parsed);
  if (envelope !== null) {
    const hasEnvelope =
      envelope.success === true ||
      Array.isArray(envelope.data) ||
      nonEmptyString(envelope.error) ||
      nonEmptyString(envelope.message) ||
      nonEmptyString(envelope.subscriptionEnd) ||
      nonEmptyString(envelope.subscription_end);

    if (hasEnvelope) {
      if (envelope.success !== true) {
        throw new APIError({
          StatusCode: 200,
          Message: firstNonEmpty(
            getStringOrEmpty(envelope.error),
            getStringOrEmpty(envelope.message),
            'request failed',
          ),
          SubscriptionEnd: firstNonEmpty(
            getStringOrEmpty(envelope.subscriptionEnd),
            getStringOrEmpty(envelope.subscription_end),
          ),
          RawBody: body,
        });
      }

      const rows = Array.isArray(envelope.data) ? envelope.data : [];
      return rows.map(normalizeDealerMinuteSurface);
    }
  }

  if (Array.isArray(parsed)) {
    return parsed.map(normalizeDealerMinuteSurface);
  }

  throw new Error('failed to decode dealer minute surfaces response');
}

function decodeAMTSessionStats(body: string): AMTSessionStatsRow[] {
  const parsed = parseJSON(body);

  const envelope = asRecord(parsed);
  if (envelope !== null) {
    const hasEnvelope =
      envelope.success === true ||
      Array.isArray(envelope.data) ||
      nonEmptyString(envelope.error) ||
      nonEmptyString(envelope.message) ||
      nonEmptyString(envelope.subscriptionEnd) ||
      nonEmptyString(envelope.subscription_end);

    if (hasEnvelope) {
      if (envelope.success !== true) {
        throw new APIError({
          StatusCode: 200,
          Message: firstNonEmpty(
            getStringOrEmpty(envelope.error),
            getStringOrEmpty(envelope.message),
            'request failed',
          ),
          SubscriptionEnd: firstNonEmpty(
            getStringOrEmpty(envelope.subscriptionEnd),
            getStringOrEmpty(envelope.subscription_end),
          ),
          RawBody: body,
        });
      }

      const rows = Array.isArray(envelope.data) ? envelope.data : [];
      return rows.map(normalizeAMTSessionStatsRow);
    }
  }

  if (Array.isArray(parsed)) {
    return parsed.map(normalizeAMTSessionStatsRow);
  }

  throw new Error('failed to decode amt session stats response');
}

function decodeAMTEvents(body: string): AMTEventsRow[] {
  const parsed = parseJSON(body);

  const envelope = asRecord(parsed);
  if (envelope !== null) {
    const hasEnvelope =
      envelope.success === true ||
      Array.isArray(envelope.data) ||
      nonEmptyString(envelope.error) ||
      nonEmptyString(envelope.message) ||
      nonEmptyString(envelope.subscriptionEnd) ||
      nonEmptyString(envelope.subscription_end);

    if (hasEnvelope) {
      if (envelope.success !== true) {
        throw new APIError({
          StatusCode: 200,
          Message: firstNonEmpty(
            getStringOrEmpty(envelope.error),
            getStringOrEmpty(envelope.message),
            'request failed',
          ),
          SubscriptionEnd: firstNonEmpty(
            getStringOrEmpty(envelope.subscriptionEnd),
            getStringOrEmpty(envelope.subscription_end),
          ),
          RawBody: body,
        });
      }

      const rows = Array.isArray(envelope.data) ? envelope.data : [];
      return rows.map(normalizeAMTEventsRow);
    }
  }

  if (Array.isArray(parsed)) {
    return parsed.map(normalizeAMTEventsRow);
  }

  throw new Error('failed to decode amt events response');
}

function normalizeHindsightEvent(value: unknown): HindsightEvent {
  const row = asRecord(value) ?? {};

  return {
    id: toInteger(row.id),
    event_id: getStringOrEmpty(row.event_id),
    date: getStringOrEmpty(row.date),
    time: getStringOrEmpty(row.time),
    timezone: getStringOrEmpty(row.timezone),
    country: getStringOrEmpty(row.country),
    country_code: getStringOrEmpty(row.country_code),
    event_name: getStringOrEmpty(row.event_name),
    volatility: toInteger(row.volatility),
    actual: toNullableString(row.actual),
    forecast: toNullableString(row.forecast),
    previous: toNullableString(row.previous),
    created_at: toDateOrNull(row.created_at),
    updated_at: toDateOrNull(row.updated_at),
  };
}

function normalizeDealerMinuteSurface(value: unknown): DealerMinuteSurface {
  const row = asRecord(value) ?? {};

  const rawSurfaces = asRecord(row.surfaces) ?? asRecord(row.surfaces_jsonb) ?? {};
  const rawMetadata = asRecord(row.metadata) ?? asRecord(row.metadata_jsonb) ?? {};

  return {
    id: getStringOrEmpty(row.id),
    run_at: toDateOrNull(row.run_at),
    symbol: getStringOrEmpty(row.symbol),
    trade_date: getStringOrEmpty(row.trade_date),
    minute_ts: toDateOrNull(row.minute_ts),
    session_minute: toInteger(row.session_minute),
    spot: toNumber(row.spot),
    vix: toNumber(row.vix),
    surfaces: normalizeMinuteSurface(rawSurfaces),
    metadata: rawMetadata,
  };
}

function normalizeAMTSessionStatsRow(value: unknown): AMTSessionStatsRow {
  const row = asRecord(value) ?? {};
  return {
    symbol: getStringOrEmpty(row.symbol),
    session_id: getStringOrEmpty(row.session_id),
    session_data: asRecord(row.session_data) ?? {},
  };
}

function normalizeAMTEventsRow(value: unknown): AMTEventsRow {
  const row = asRecord(value) ?? {};
  const events = Array.isArray(row.events)
    ? row.events.map((event) => asRecord(event) ?? {}).filter((event) => Object.keys(event).length > 0)
    : [];

  return {
    symbol: getStringOrEmpty(row.symbol),
    session_id: getStringOrEmpty(row.session_id),
    events,
  };
}

function normalizeMinuteSurface(value: Record<string, unknown>): MinuteSurface {
  return {
    gamma: normalizeSurfacePoints(value.gamma),
    vanna: normalizeSurfacePoints(value.vanna),
    charm: normalizeSurfacePoints(value.charm),
    iv: normalizeSurfacePoints(value.iv),
  };
}

function normalizeSurfacePoints(value: unknown): SurfacePoint[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((point) => {
    const rawPoint = asRecord(point) ?? {};
    return {
      strike: rawPoint.strike !== undefined ? toNumber(rawPoint.strike) : undefined,
      value: rawPoint.value !== undefined ? toNumber(rawPoint.value) : undefined,
      x: rawPoint.x !== undefined ? toNumber(rawPoint.x) : undefined,
      y: rawPoint.y !== undefined ? toNumber(rawPoint.y) : undefined,
    };
  });
}

function resolveSignal(ctx: CtxEquivalent): AbortSignal | undefined {
  if (ctx === null || ctx === undefined) {
    return undefined;
  }

  if (isAbortSignal(ctx)) {
    return ctx;
  }

  return ctx.signal;
}

function isAbortSignal(value: unknown): value is AbortSignal {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as AbortSignal).aborted === 'boolean' &&
    typeof (value as AbortSignal).addEventListener === 'function'
  );
}

function parseJSON(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function parseDateOnly(value: string): Date | null {
  if (!DATE_ONLY_REGEX.test(value)) {
    return null;
  }

  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  const [year, month, day] = value.split('-').map((part) => Number(part));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() + 1 !== month ||
    parsed.getUTCDate() !== day
  ) {
    return null;
  }

  return parsed;
}

function toDateOrNull(value: unknown): Date | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  return null;
}

function toInteger(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.trunc(value);
  }

  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}

function toNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return null;
}

function getStringOrEmpty(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function toNullableString(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === 'string') {
    return value;
  }

  return String(value);
}

function nonEmptyString(value: unknown): boolean {
  return typeof value === 'string' && value.trim() !== '';
}

function firstNonEmpty(...values: string[]): string {
  for (const value of values) {
    if (value.trim() !== '') {
      return value.trim();
    }
  }
  return '';
}

function truncateForError(value: string): string {
  const maxLength = 300;
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, maxLength)}...`;
}

function statusTextForCode(statusCode: number): string {
  return STATUS_TEXT[statusCode] ?? '';
}

function toErrorMessage(value: unknown): string {
  if (value instanceof Error) {
    return value.message;
  }
  return String(value);
}
