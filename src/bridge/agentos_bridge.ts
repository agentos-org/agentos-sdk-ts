import type {
  AgentOSBridge,
  AgentOSBridgeContext,
  AgentOSBridgeRequest,
  AgentOSBridgeResponse,
  AgentOSBridgeStreamEvent,
  CreateAgentOSBridgeFetchOptions
} from './types';

const BRIDGE_PROTOCOL = 'agentos.web.bridge' as const;
const BRIDGE_PROTOCOL_VERSION = '1.0' as const;
const DEFAULT_BRIDGE_BASE_URL = 'agentos://mobile';
const STREAM_EVENT_NAME = 'agentos:bridge:event';

let requestCounter = 0;

export function isAgentOSBridgeAvailable(): boolean {
  const agentos = getAgentOSGlobal();
  return typeof agentos?.bridge === 'object' && typeof agentos.bridge.request === 'function';
}

export function getAgentOSBridge(): AgentOSBridge {
  const bridge = getAgentOSGlobal()?.bridge;
  if (!bridge || typeof bridge.request !== 'function') {
    throw new Error('AgentOS bridge is not available. Open this web app inside AgentOS Mobile.');
  }
  return bridge;
}

export async function getAgentOSBridgeContext(): Promise<AgentOSBridgeContext> {
  getAgentOSBridge();
  const contextProvider = getAgentOSGlobal()?.context;
  if (!contextProvider || typeof contextProvider !== 'object') {
    throw new Error('AgentOS bridge context is not available for this web app.');
  }

  const rawContext = typeof contextProvider.get === 'function'
    ? await contextProvider.get()
    : contextProvider;
  if (!rawContext || typeof rawContext !== 'object') {
    throw new Error('AgentOS bridge context returned an invalid value.');
  }

  return {
    ...rawContext,
    baseUrl: typeof rawContext.baseUrl === 'string' && rawContext.baseUrl.length > 0
      ? rawContext.baseUrl
      : DEFAULT_BRIDGE_BASE_URL
  };
}

export function getAgentOSBridgeTransportDefaults(): Pick<CreateAgentOSBridgeFetchOptions, 'appId'> & { baseUrl: string; fetch: typeof fetch } | undefined {
  if (!isAgentOSBridgeAvailable()) {
    return undefined;
  }
  const context = getSynchronousAgentOSBridgeContext();
  return {
    baseUrl: context?.baseUrl ?? DEFAULT_BRIDGE_BASE_URL,
    fetch: createAgentOSBridgeFetch({ appId: context?.appId }),
    appId: context?.appId
  };
}

export function createAgentOSBridgeFetch(options: CreateAgentOSBridgeFetchOptions = {}): typeof fetch {
  return async (input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> => {
    const bridge = options.bridge ?? getAgentOSBridge();
    const requestId = createRequestId();
    const requestParts = await readRequestParts(input, init);
    const url = new URL(requestParts.url);
    const body = await parseBody(requestParts.body, requestParts.headers);
    const stream = shouldStream(url.pathname, body, requestParts.headers);
    const envelope: AgentOSBridgeRequest = {
      id: requestId,
      protocol: BRIDGE_PROTOCOL,
      protocolVersion: BRIDGE_PROTOCOL_VERSION,
      appId: options.appId,
      origin: options.origin ?? getWindowOrigin(),
      method: requestParts.method.toUpperCase(),
      path: url.pathname || '/',
      query: queryToRecord(url.searchParams),
      headers: headersToRecord(requestParts.headers),
      body,
      stream
    };

    omitUndefinedFields(envelope);

    const signal = init.signal ?? requestParts.signal;
    const abortHandler = () => {
      void bridge.cancel(requestId);
    };
    if (signal?.aborted) {
      abortHandler();
      throw createAbortError();
    }
    signal?.addEventListener('abort', abortHandler, { once: true });

    let bridgeResponse: AgentOSBridgeResponse;
    try {
      bridgeResponse = await bridge.request(envelope);
    } catch (error) {
      signal?.removeEventListener('abort', abortHandler);
      throw error;
    }

    if (!stream) {
      signal?.removeEventListener('abort', abortHandler);
      return toResponse(bridgeResponse);
    }

    return toStreamResponse(bridgeResponse, bridge, requestId, signal, abortHandler);
  };
}

function getAgentOSGlobal() {
  return typeof window === 'undefined' ? undefined : window.agentos;
}

function getSynchronousAgentOSBridgeContext(): AgentOSBridgeContext | undefined {
  const contextProvider = getAgentOSGlobal()?.context;
  if (!contextProvider || typeof contextProvider !== 'object' || typeof contextProvider.get === 'function') {
    return undefined;
  }
  const rawContext = contextProvider as AgentOSBridgeContext;
  return {
    ...rawContext,
    baseUrl: typeof rawContext.baseUrl === 'string' && rawContext.baseUrl.length > 0
      ? rawContext.baseUrl
      : DEFAULT_BRIDGE_BASE_URL
  };
}

async function readRequestParts(input: RequestInfo | URL, init: RequestInit) {
  if (isRequest(input)) {
    const headers = new Headers(input.headers);
    appendHeaders(headers, init.headers);
    const body = init.body ?? await input.clone().text();
    return {
      url: init.headers === undefined ? input.url : input.url,
      method: init.method ?? input.method,
      headers,
      body,
      signal: input.signal
    };
  }

  return {
    url: input instanceof URL ? input.toString() : String(input),
    method: init.method ?? 'GET',
    headers: new Headers(init.headers),
    body: init.body,
    signal: undefined
  };
}

function isRequest(value: unknown): value is Request {
  return typeof Request !== 'undefined' && value instanceof Request;
}

function appendHeaders(target: Headers, source?: HeadersInit): void {
  if (!source) {
    return;
  }
  new Headers(source).forEach((value, key) => {
    target.set(key, value);
  });
}

async function parseBody(body: BodyInit | null | undefined, headers: Headers): Promise<unknown> {
  if (body === undefined || body === null) {
    return undefined;
  }
  if (typeof body === 'string') {
    return parseTextBody(body, headers);
  }
  if (body instanceof URLSearchParams) {
    return Object.fromEntries(body.entries());
  }
  if (typeof FormData !== 'undefined' && body instanceof FormData) {
    return Object.fromEntries(body.entries());
  }
  if (body instanceof Blob) {
    return parseTextBody(await body.text(), headers);
  }
  if (body instanceof ArrayBuffer) {
    return new TextDecoder().decode(body);
  }
  if (ArrayBuffer.isView(body)) {
    return new TextDecoder().decode(body);
  }
  throw new TypeError('AgentOS bridge fetch only supports string, JSON, URLSearchParams, FormData, Blob, or ArrayBuffer request bodies.');
}

function parseTextBody(text: string, headers: Headers): unknown {
  if (text.length === 0) {
    return undefined;
  }
  const contentType = headers.get('content-type') ?? '';
  if (contentType.includes('application/json') || looksLikeJson(text)) {
    try {
      return JSON.parse(text);
    } catch {
      if (contentType.includes('application/json')) {
        throw new SyntaxError('AgentOS bridge fetch received invalid JSON request body.');
      }
    }
  }
  return text;
}

function looksLikeJson(text: string): boolean {
  const trimmed = text.trim();
  return trimmed.startsWith('{') || trimmed.startsWith('[');
}

function shouldStream(pathname: string, body: unknown, headers: Headers): boolean {
  if (pathname === '/agentkit/chat') {
    return true;
  }
  if (headers.get('accept')?.includes('text/event-stream')) {
    return true;
  }
  return Boolean(body && typeof body === 'object' && 'stream' in body && (body as { stream?: unknown }).stream === true);
}

function queryToRecord(searchParams: URLSearchParams): Record<string, string> | undefined {
  const query: Record<string, string> = {};
  searchParams.forEach((value, key) => {
    query[key] = value;
  });
  return Object.keys(query).length > 0 ? query : undefined;
}

function headersToRecord(headers: Headers): Record<string, string> | undefined {
  const record: Record<string, string> = {};
  headers.forEach((value, key) => {
    record[key] = value;
  });
  return Object.keys(record).length > 0 ? record : undefined;
}

function toResponse(response: AgentOSBridgeResponse): Response {
  const headers = new Headers(response.headers);
  if (!headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }
  // Native should return structured bridge errors, for example
  // { code: 'route_not_supported', message: '...' }. Keeping the body shape
  // unchanged lets ApiClient surface unsupported bridge routes through the
  // existing ApiError path instead of inventing a bridge-specific exception.
  return new Response(JSON.stringify(response.error ?? response.body ?? null), {
    status: response.status,
    headers
  });
}

function toStreamResponse(
  response: AgentOSBridgeResponse,
  bridge: AgentOSBridge,
  requestId: string,
  signal: AbortSignal | undefined,
  abortHandler: () => void
): Response {
  if (!response.ok) {
    signal?.removeEventListener('abort', abortHandler);
    return toResponse(response);
  }

  const headers = new Headers(response.headers);
  headers.set('content-type', 'text/event-stream');

  const encoder = new TextEncoder();
  let removeStreamListener: (() => void) | undefined;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const onEvent = (event: Event) => {
        const detail = (event as CustomEvent<AgentOSBridgeStreamEvent>).detail;
        if (!detail || detail.id !== requestId) {
          return;
        }
        if (detail.type === 'open') {
          return;
        }
        if (detail.type === 'done') {
          cleanup();
          controller.close();
          return;
        }
        if (detail.type === 'error') {
          controller.enqueue(encoder.encode(formatSse('error', JSON.stringify(detail.error ?? detail.data ?? null))));
          cleanup();
          controller.close();
          return;
        }
        controller.enqueue(encoder.encode(formatSse(detail.event ?? detail.type, detail.data ?? '')));
      };

      const cleanup = () => {
        removeStreamListener?.();
        signal?.removeEventListener('abort', abortHandler);
      };

      removeStreamListener = addStreamEventListener(onEvent);
      if (signal) {
        signal.addEventListener('abort', () => {
          cleanup();
          controller.error(createAbortError());
        }, { once: true });
      }
    },
    cancel() {
      removeStreamListener?.();
      signal?.removeEventListener('abort', abortHandler);
      void bridge.cancel(requestId);
    }
  });

  return new Response(stream, {
    status: response.status,
    headers
  });
}

function addStreamEventListener(listener: EventListener): () => void {
  if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') {
    throw new Error('AgentOS bridge streaming requires window.addEventListener.');
  }
  window.addEventListener(STREAM_EVENT_NAME, listener);
  return () => window.removeEventListener(STREAM_EVENT_NAME, listener);
}

function formatSse(event: string, data: string): string {
  const lines = data.length === 0 ? [''] : data.split(/\r?\n/);
  return `event: ${event}\n${lines.map((line) => `data: ${line}`).join('\n')}\n\n`;
}

function getWindowOrigin(): string | undefined {
  return typeof window === 'undefined' ? undefined : window.location?.origin;
}

function createRequestId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  requestCounter += 1;
  return `agentos-bridge-${Date.now()}-${requestCounter}`;
}

function createAbortError(): Error {
  if (typeof DOMException !== 'undefined') {
    return new DOMException('The operation was aborted.', 'AbortError');
  }
  const error = new Error('The operation was aborted.');
  error.name = 'AbortError';
  return error;
}

function omitUndefinedFields<T extends object>(value: T): void {
  for (const key of Object.keys(value) as Array<keyof T>) {
    if (value[key] === undefined) {
      delete value[key];
    }
  }
}
