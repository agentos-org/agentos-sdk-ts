import type { Dictionary } from './types';

export interface ApiClientOptions {
  baseUrl?: string;
  connectTimeout?: number;
  receiveTimeout?: number;
  fetch?: typeof fetch;
}

export interface RequestOptions {
  method?: string;
  query?: Dictionary<unknown>;
  data?: unknown;
  headers?: Dictionary<string>;
  signal?: AbortSignal;
  timeout?: number;
}

export interface SseEvent {
  event: string;
  data: string;
}

export class ApiError extends Error {
  readonly status: number;
  readonly data: unknown;

  constructor(message: string, status: number, data: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

export class ApiClient {
  readonly baseUrl: string;
  readonly connectTimeout: number;
  readonly receiveTimeout: number;
  private readonly fetchImpl: typeof fetch;

  constructor(options: ApiClientOptions = {}) {
    this.baseUrl = options.baseUrl && options.baseUrl.length > 0 ? options.baseUrl : 'http://localhost:8888';
    this.connectTimeout = options.connectTimeout ?? 5000;
    this.receiveTimeout = options.receiveTimeout ?? 10000;
    const resolvedFetch = options.fetch ?? globalThis.fetch;
    if (!resolvedFetch) {
      throw new Error('Fetch API is not available. Provide options.fetch when constructing ApiClient.');
    }
    this.fetchImpl = resolvedFetch.bind(globalThis);
  }

  withOverrides(options: ApiClientOptions = {}): ApiClient {
    return new ApiClient({
      baseUrl: options.baseUrl ?? this.baseUrl,
      connectTimeout: options.connectTimeout ?? this.connectTimeout,
      receiveTimeout: options.receiveTimeout ?? this.receiveTimeout,
      fetch: options.fetch ?? this.fetchImpl
    });
  }

  async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const controller = new AbortController();
    const signal = mergeAbortSignals(options.signal, controller.signal);
    const connectTimeoutMs = this.connectTimeout;
    try {
      const response = await withTimeout(
        this.fetchImpl(this.buildUrl(path, options.query), {
          method: options.method ?? (options.data === undefined ? 'GET' : 'POST'),
          headers: normalizeHeaders(options.data, options.headers),
          body: options.data === undefined ? undefined : JSON.stringify(options.data),
          signal
        }),
        connectTimeoutMs,
        () => controller.abort(),
        `Connection timeout for ${path}`
      );
      return await parseResponse<T>(response, options.timeout ?? this.receiveTimeout, path);
    } catch (error) {
      if (options.signal?.aborted && error instanceof Error && error.name === 'AbortError') {
        throw error;
      }
      throw error;
    }
  }

  async requestStream(path: string, options: RequestOptions = {}): Promise<Response> {
    const controller = new AbortController();
    const signal = mergeAbortSignals(options.signal, controller.signal);
    const connectTimeoutMs = options.timeout ?? this.connectTimeout;
    try {
      const response = await withTimeout(
        this.fetchImpl(this.buildUrl(path, options.query), {
          method: options.method ?? (options.data === undefined ? 'GET' : 'POST'),
          headers: normalizeHeaders(options.data, options.headers),
          body: options.data === undefined ? undefined : JSON.stringify(options.data),
          signal
        }),
        connectTimeoutMs,
        () => controller.abort(),
        `Connection timeout for ${path}`
      );
      if (!response.ok) {
        const errorBody = await safeParseBody(response);
        throw new ApiError(`Request failed with status ${response.status}`, response.status, errorBody);
      }
      return response;
    } catch (error) {
      if (options.signal?.aborted && error instanceof Error && error.name === 'AbortError') {
        throw error;
      }
      throw error;
    }
  }

  buildUrl(path: string, query?: Dictionary<unknown>): string {
    const normalizedPath = path.startsWith('/') ? path.slice(1) : path;
    const base = new URL(normalizedPath, ensureTrailingSlash(this.baseUrl));
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value === undefined || value === null || value === '') {
          continue;
        }
        base.searchParams.set(key, value instanceof Date ? value.toISOString() : String(value));
      }
    }
    return base.toString();
  }
}

export class Subscription<T> {
  private readonly listeners = new Set<(value: T) => void>();
  private closed = false;

  emit(value: T): void {
    if (this.closed) {
      return;
    }
    for (const listener of this.listeners) {
      listener(value);
    }
  }

  subscribe(listener: (value: T) => void): () => void {
    if (this.closed) {
      return () => {};
    }
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  close(): void {
    this.closed = true;
    this.listeners.clear();
  }
}

export async function* parseSse(response: Response): AsyncGenerator<SseEvent> {
  if (!response.body) {
    return;
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let currentEvent = '';
  let currentData: string[] = [];

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      let lineBreakIndex = buffer.indexOf('\n');
      while (lineBreakIndex >= 0) {
        const rawLine = buffer.slice(0, lineBreakIndex);
        buffer = buffer.slice(lineBreakIndex + 1);
        const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine;
        if (line.startsWith('event:')) {
          currentEvent = line.slice(6).trim();
        } else if (line.startsWith('data:')) {
          currentData.push(line.slice(5).trim());
        } else if (line.length === 0) {
          if (currentData.length > 0) {
            yield {
              event: currentEvent || 'message',
              data: currentData.join('\n')
            };
          }
          currentEvent = '';
          currentData = [];
        }
        lineBreakIndex = buffer.indexOf('\n');
      }
    }
    if (currentData.length > 0) {
      yield {
        event: currentEvent || 'message',
        data: currentData.join('\n')
      };
    }
  } finally {
    reader.releaseLock();
  }
}

export function asJsonMap<T>(value: unknown): T {
  const decoded = decodeJson(value);
  if (decoded && typeof decoded === 'object' && !Array.isArray(decoded)) {
    return decoded as T;
  }
  throw new TypeError(`Expected JSON object but got ${describeValue(decoded)}`);
}

export function asJsonList<T>(value: unknown): T[] {
  const decoded = decodeJson(value);
  if (Array.isArray(decoded)) {
    return decoded as T[];
  }
  throw new TypeError(`Expected JSON array but got ${describeValue(decoded)}`);
}

export function decodeJson<T = unknown>(value: unknown): T {
  if (typeof value === 'string' && value.length > 0) {
    try {
      return JSON.parse(value) as T;
    } catch {
      return value as T;
    }
  }
  return value as T;
}

export function ensureError(error: unknown): Error {
  if (error instanceof Error) {
    return error;
  }
  return new Error(String(error));
}

export function normalizeAgentEventType(eventType: string): string {
  if (eventType === 'agentmessage') {
    return 'message';
  }
  if (eventType === 'agentmessagechunk') {
    return 'chunk';
  }
  return eventType;
}

function ensureTrailingSlash(baseUrl: string): string {
  return baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
}

function normalizeHeaders(data: unknown, headers?: Dictionary<string>): HeadersInit {
  return {
    ...(data === undefined ? {} : { 'content-type': 'application/json' }),
    ...(headers ?? {})
  };
}

async function parseResponse<T>(response: Response, receiveTimeoutMs: number, path: string): Promise<T> {
  const body = await withTimeout(
    safeParseBody(response),
    receiveTimeoutMs,
    undefined,
    `Receive timeout for ${path}`
  );
  if (!response.ok) {
    throw new ApiError(`Request failed with status ${response.status}`, response.status, body);
  }
  return body as T;
}

async function safeParseBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.length === 0) {
    return undefined;
  }
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function mergeAbortSignals(...signals: Array<AbortSignal | undefined>): AbortSignal | undefined {
  const validSignals = signals.filter((signal): signal is AbortSignal => signal !== undefined);
  if (validSignals.length === 0) {
    return undefined;
  }
  if (validSignals.length === 1) {
    return validSignals[0];
  }
  const controller = new AbortController();
  for (const signal of validSignals) {
    if (signal.aborted) {
      controller.abort();
      break;
    }
    signal.addEventListener('abort', () => controller.abort(), { once: true });
  }
  return controller.signal;
}

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  onTimeout: (() => void) | undefined,
  message: string
): Promise<T> {
  if (timeoutMs === 0) {
    return promise;
  }
  return new Promise<T>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      onTimeout?.();
      reject(new Error(message));
    }, timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timeoutId);
        resolve(value);
      },
      (error) => {
        clearTimeout(timeoutId);
        reject(error);
      }
    );
  });
}

function describeValue(value: unknown): string {
  if (value === null) {
    return 'null';
  }
  if (Array.isArray(value)) {
    return 'array';
  }
  return typeof value;
}
