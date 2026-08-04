import { OpenTool, ToolReturn } from '../../browser_opentool';
import type { FunctionCall } from '../../browser_opentool';
import type {
  ToolDto,
  ToolKitStreamEvent,
  ToolLifecycleEventDto
} from './dto';
import {
  ApiClient,
  asJsonMap,
  ensureError,
  parseSse
} from '../../utils';

export class ToolKitClient {
  constructor(private readonly apiClient: ApiClient = new ApiClient()) {}

  listTool(all?: string, bearerToken?: string): Promise<ToolDto[]> {
    return this.apiClient.request<ToolDto[]>('/toolkit/list', {
      query: all ? { all } : undefined,
      headers: bearerToken ? authHeaders(bearerToken) : undefined
    });
  }

  async loadTool(toolId: string, bearerToken?: string): Promise<OpenTool | null> {
    const response = await this.apiClient.request<Record<string, unknown> | null>(
      `/toolkit/${encodeURIComponent(toolId)}/load`,
      { headers: bearerToken ? authHeaders(bearerToken) : undefined }
    );
    return response ? OpenTool.fromJson(response) : null;
  }

  async callTool(
    bearerToken: string,
    toolId: string,
    functionCall: FunctionCall
  ): Promise<ToolReturn> {
    const response = await this.apiClient.request<unknown>(
      `/toolkit/${encodeURIComponent(toolId)}/call`,
      {
        method: 'POST',
        headers: authHeaders(bearerToken),
        data: functionCallBody(functionCall)
      }
    );
    return parseToolReturn(response);
  }

  streamCallTool(
    bearerToken: string,
    toolId: string,
    functionCall: FunctionCall,
    options: { signal?: AbortSignal } = {}
  ): AsyncGenerator<ToolKitStreamEvent> {
    const openStreamCallTool = this.openStreamCallTool.bind(this);
    return (async function* (): AsyncGenerator<ToolKitStreamEvent> {
      let stream: AsyncGenerator<ToolKitStreamEvent> | undefined;
      try {
        stream = await openStreamCallTool(bearerToken, toolId, functionCall, options);
        yield* stream;
      } finally {
        await stream?.return(undefined);
      }
    })();
  }

  /** @internal Opens the HTTP stream eagerly so authentication failures can be retried. */
  async openStreamCallTool(
    bearerToken: string,
    toolId: string,
    functionCall: FunctionCall,
    options: { signal?: AbortSignal } = {}
  ): Promise<AsyncGenerator<ToolKitStreamEvent>> {
    const requestController = new AbortController();
    const detachAbortSignal = forwardAbort(options.signal, requestController);
    let response: Response;
    try {
      response = await this.apiClient.requestStream(
        `/toolkit/${encodeURIComponent(toolId)}/streamCall`,
        {
          method: 'POST',
          headers: authHeaders(bearerToken),
          data: functionCallBody(functionCall),
          signal: requestController.signal
        }
      );
    } catch (error) {
      detachAbortSignal();
      requestController.abort();
      throw error;
    }

    return (async function* (): AsyncGenerator<ToolKitStreamEvent> {
      try {
        for await (const event of parseSse(response)) {
          try {
            yield {
              event: event.event,
              data: asJsonMap<Record<string, unknown>>(event.data)
            };
          } catch (error) {
            throw new TypeError(
              `Invalid ToolKit SSE event "${event.event}": ${ensureError(error).message}`
            );
          }
        }
      } finally {
        detachAbortSignal();
        requestController.abort();
      }
    })();
  }

  /** @deprecated Not exposed by the AgentOS API gateway ToolKit API. */
  async *subscribeToolEvents(daemonApiKey: string, snapshot = true, signal?: AbortSignal): AsyncGenerator<ToolLifecycleEventDto> {
    const response = await this.apiClient.requestStream('/toolkit/events', {
      query: { snapshot: snapshot ? '1' : '0' },
      headers: { 'x-tool-api-key': daemonApiKey },
      signal
    });
    for await (const event of parseSse(response)) {
      if (event.event === 'ready') {
        continue;
      }
      yield asJsonMap<ToolLifecycleEventDto>(event.data);
    }
  }
}

function authHeaders(bearerToken: string): Record<string, string> {
  return {
    authorization: `Bearer ${bearerToken}`
  };
}

function functionCallBody(functionCall: FunctionCall): FunctionCall {
  return {
    id: functionCall.id,
    name: functionCall.name,
    arguments: functionCall.arguments
  };
}

function parseToolReturn(value: unknown): ToolReturn {
  const response = asJsonMap<Record<string, unknown>>(value);
  if (typeof response.id !== 'string') {
    throw new TypeError('Invalid ToolReturn: expected "id" to be a string');
  }
  let result: Record<string, unknown>;
  try {
    result = asJsonMap<Record<string, unknown>>(response.result);
  } catch (error) {
    throw new TypeError(`Invalid ToolReturn result: ${ensureError(error).message}`);
  }
  return new ToolReturn(response.id, result);
}

function forwardAbort(
  signal: AbortSignal | undefined,
  controller: AbortController
): () => void {
  if (!signal) {
    return () => {};
  }
  const abort = (): void => controller.abort();
  if (signal.aborted) {
    abort();
    return () => {};
  }
  signal.addEventListener('abort', abort, { once: true });
  return () => signal.removeEventListener('abort', abort);
}
