import type {
  AppModel,
  AppModelRegistration,
  AppModelUpdate,
  AppModelWriteResult,
  DecisionRequest,
  DecisionResponse,
  ModelAsrRequest,
  ModelAsrResponse,
  ModelChatCompletionRequest,
  ModelChatCompletionResponse,
  ModelEmbeddingRequest,
  ModelEmbeddingResponse,
  ModelInfo,
  ModelTtsRequest
} from './dto';
import { Modality, ModelTask } from './dto';
import {
  ApiClient,
  asJsonList,
  asJsonMap,
  parseSse
} from '../../utils';

/**
 * Forwards chat (text + vision) traffic to `/modelkit/chat/...` using the
 * OpenAI Chat Completions wire protocol.
 */
export class ModelKitChatClient {
  readonly baseUrl: string;

  constructor(private readonly apiClient: ApiClient) {
    this.baseUrl = buildChatBaseUrl(this.apiClient.baseUrl);
  }

  create(request: ModelChatCompletionRequest): Promise<ModelChatCompletionResponse> {
    return this.apiClient.request<ModelChatCompletionResponse>('/modelkit/chat/v1/chat/completions', {
      method: 'POST',
      data: serializeChatRequest(request)
    });
  }

  async *createStream(request: ModelChatCompletionRequest): AsyncGenerator<ModelChatCompletionResponse> {
    yield* createChatCompletionStream(this.apiClient, request);
  }

  async *createRemoteFunctionStream(request: ModelChatCompletionRequest): AsyncGenerator<ModelChatCompletionResponse> {
    yield* createChatCompletionStream(this.apiClient, request);
  }
}

/** Forwards embedding requests to `/modelkit/embedding/v1/embeddings`. */
export class ModelKitEmbeddingClient {
  constructor(private readonly apiClient: ApiClient) {}

  create(request: ModelEmbeddingRequest): Promise<ModelEmbeddingResponse> {
    return this.apiClient.request<ModelEmbeddingResponse>('/modelkit/embedding/v1/embeddings', {
      method: 'POST',
      data: request
    });
  }
}

/** Forwards text-to-speech requests to `/modelkit/tts/v1/audio/speech`. */
export class ModelKitTtsClient {
  constructor(private readonly apiClient: ApiClient) {}

  async synthesize(request: ModelTtsRequest): Promise<Uint8Array> {
    const response = await this.apiClient.requestStream('/modelkit/tts/v1/audio/speech', {
      method: 'POST',
      data: request,
      headers: { accept: 'audio/*' }
    });
    const buffer = await response.arrayBuffer();
    return new Uint8Array(buffer);
  }

  async listVoices(): Promise<Record<string, unknown>> {
    const data = await this.apiClient.request<unknown>('/modelkit/tts/v1/audio/voices');
    return asJsonMap<Record<string, unknown>>(data);
  }
}

/** Forwards speech-to-text requests to `/modelkit/asr/v1/audio/transcriptions`. */
export class ModelKitAsrClient {
  constructor(private readonly apiClient: ApiClient) {}

  async transcribe(request: ModelAsrRequest): Promise<ModelAsrResponse> {
    const form = buildAsrFormData(request);
    const response = await this.apiClient.requestStream('/modelkit/asr/v1/audio/transcriptions', {
      method: 'POST',
      data: undefined,
      headers: {}
    }).catch(async (error) => {
      if (!isHttpBaseUrl(this.apiClient.baseUrl)) {
        throw error;
      }
      // Fall back to native fetch so that FormData is sent verbatim instead of
      // being JSON-serialized by requestStream's default path.
      const url = this.apiClient.buildUrl('/modelkit/asr/v1/audio/transcriptions');
      const native = await fetch(url, { method: 'POST', body: form });
      if (!native.ok) {
        throw new Error(`ASR request failed with status ${native.status}`);
      }
      return native;
    });
    const text = await response.text();
    if (text.length === 0) {
      return {};
    }
    try {
      return JSON.parse(text) as ModelAsrResponse;
    } catch {
      return { text };
    }
  }
}

/**
 * Forwards typed-question decisions to `/modelkit/decision`.
 *
 * Decision models (`task: 'decision'`, llama.cpp `/v1/systemone`) score
 * caller-provided options instead of generating text. No app token needed.
 */
export class ModelKitDecisionClient {
  constructor(private readonly apiClient: ApiClient) {}

  create(request: DecisionRequest): Promise<DecisionResponse> {
    return this.apiClient.request<DecisionResponse>('/modelkit/decision', {
      method: 'POST',
      data: request
    });
  }
}

/**
 * Task-oriented ModelKit client.
 *
 * Splits requests by task (chat / embedding / asr / tts / decision) to match
 * the agentos-api gateway routes, and encodes vision support via
 * `capabilities.vision` rather than a separate task.
 *
 * App-model write methods take the AppKit `bearerToken` explicitly; use
 * `AgentOSSDK.modelkit` to have it attached and refreshed automatically.
 */
export class ModelKitClient {
  readonly chat: ModelKitChatClient;
  readonly embedding: ModelKitEmbeddingClient;
  readonly asr: ModelKitAsrClient;
  readonly tts: ModelKitTtsClient;
  readonly decision: ModelKitDecisionClient;

  constructor(private readonly apiClient: ApiClient = new ApiClient()) {
    this.chat = new ModelKitChatClient(this.apiClient);
    this.embedding = new ModelKitEmbeddingClient(this.apiClient);
    this.asr = new ModelKitAsrClient(this.apiClient);
    this.tts = new ModelKitTtsClient(this.apiClient);
    this.decision = new ModelKitDecisionClient(this.apiClient);
  }

  async listModels(): Promise<ModelInfo[]> {
    const data = await this.apiClient.request<unknown[]>('/modelkit/models');
    return asJsonList<Record<string, unknown>>(data).map((item) => normalizeModelInfo(item));
  }

  async listModelsByTask(task: ModelTask): Promise<ModelInfo[]> {
    const all = await this.listModels();
    return all.filter((m) => m.task === task);
  }

  /**
   * Lists models registered by apps (`GET /modelkit/app-models`).
   * Public endpoint, no token required. Disabled models are included; check
   * `isDisabled`.
   */
  async listAppModels(): Promise<AppModel[]> {
    const data = await this.apiClient.request<unknown[]>('/modelkit/app-models');
    return asJsonList<Record<string, unknown>>(data).map((item) => normalizeAppModel(item));
  }

  /**
   * Registers (or replaces) an app model (`POST /modelkit/app-models`).
   *
   * Re-registering an id owned by the same app replaces it (`updated: true`).
   * Rejects with `ApiError` status 401 (missing/invalid token), 403
   * (`appBundleId` mismatch), 409 (id owned by another app) or 400 (invalid
   * body, unknown `task`).
   */
  registerAppModel(bearerToken: string, request: AppModelRegistration): Promise<AppModelWriteResult> {
    return this.apiClient.request<AppModelWriteResult>('/modelkit/app-models', {
      method: 'POST',
      headers: authHeaders(bearerToken),
      data: request
    });
  }

  /** Partially updates an app model owned by the token's app (`PUT /modelkit/app-models/<id>`). */
  updateAppModel(bearerToken: string, modelId: string, request: AppModelUpdate): Promise<AppModelWriteResult> {
    return this.apiClient.request<AppModelWriteResult>(appModelPath(modelId), {
      method: 'PUT',
      headers: authHeaders(bearerToken),
      data: request
    });
  }

  /** Removes an app model owned by the token's app (`DELETE /modelkit/app-models/<id>`). */
  unregisterAppModel(bearerToken: string, modelId: string): Promise<AppModelWriteResult> {
    return this.apiClient.request<AppModelWriteResult>(appModelPath(modelId), {
      method: 'DELETE',
      headers: authHeaders(bearerToken)
    });
  }

  /** Flips the enabled/disabled state of an owned app model (`POST /modelkit/app-models/<id>/toggle`). */
  toggleAppModel(bearerToken: string, modelId: string): Promise<AppModelWriteResult> {
    return this.apiClient.request<AppModelWriteResult>(`${appModelPath(modelId)}/toggle`, {
      method: 'POST',
      headers: authHeaders(bearerToken)
    });
  }
}

function appModelPath(modelId: string): string {
  return `/modelkit/app-models/${encodeURIComponent(modelId)}`;
}

function authHeaders(bearerToken: string): Record<string, string> {
  return {
    authorization: `Bearer ${bearerToken}`
  };
}

function serializeChatRequest(request: ModelChatCompletionRequest): Record<string, unknown> {
  const {
    toolChoice,
    maxTokens,
    topP,
    presencePenalty,
    frequencyPenalty,
    logitBias,
    responseFormat,
    streamOptions,
    topLogprobs,
    reasoningEffort,
    enableThinking,
    ...rest
  } = request;
  return {
    ...rest,
    ...(toolChoice === undefined ? {} : { tool_choice: toolChoice }),
    ...(maxTokens === undefined ? {} : { max_tokens: maxTokens }),
    ...(topP === undefined ? {} : { top_p: topP }),
    ...(presencePenalty === undefined ? {} : { presence_penalty: presencePenalty }),
    ...(frequencyPenalty === undefined ? {} : { frequency_penalty: frequencyPenalty }),
    ...(logitBias === undefined ? {} : { logit_bias: logitBias }),
    ...(responseFormat === undefined ? {} : { response_format: responseFormat }),
    ...(streamOptions === undefined ? {} : { stream_options: streamOptions }),
    ...(topLogprobs === undefined ? {} : { top_logprobs: topLogprobs }),
    ...(reasoningEffort === undefined ? {} : { reasoning_effort: reasoningEffort }),
    ...(enableThinking === undefined ? {} : { enable_thinking: enableThinking })
  };
}

async function* createChatCompletionStream(
  apiClient: ApiClient,
  request: ModelChatCompletionRequest
): AsyncGenerator<ModelChatCompletionResponse> {
  const response = await apiClient.requestStream('/modelkit/chat/v1/chat/completions', {
    method: 'POST',
    data: serializeChatRequest({ ...request, stream: true })
  });
  for await (const event of parseSse(response)) {
    if (event.data === '[DONE]') {
      return;
    }
    yield asJsonMap<ModelChatCompletionResponse>(event.data);
  }
}

function buildChatBaseUrl(baseUrl: string): string {
  const url = new URL(baseUrl);
  const normalizedPath = url.pathname.endsWith('/')
    ? url.pathname.slice(0, -1)
    : url.pathname;
  url.pathname = `${normalizedPath}/modelkit/chat`;
  return url.toString().replace(/\/$/, '');
}

function buildAsrFormData(request: ModelAsrRequest): FormData {
  const form = new FormData();
  form.set('model', request.model);
  if (request.file instanceof File) {
    form.set('file', request.file);
  } else {
    form.set('file', request.file, request.fileName ?? 'audio.bin');
  }
  if (request.language !== undefined) form.set('language', request.language);
  if (request.prompt !== undefined) form.set('prompt', request.prompt);
  if (request.response_format !== undefined) form.set('response_format', request.response_format);
  if (request.temperature !== undefined) form.set('temperature', String(request.temperature));
  for (const [key, value] of Object.entries(request)) {
    if (['model', 'file', 'fileName', 'language', 'prompt', 'response_format', 'temperature'].includes(key)) {
      continue;
    }
    if (value === undefined || value === null) continue;
    form.set(key, typeof value === 'string' ? value : JSON.stringify(value));
  }
  return form;
}

function isHttpBaseUrl(baseUrl: string): boolean {
  try {
    const protocol = new URL(baseUrl).protocol;
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}

function normalizeTask(value: unknown): ModelTask {
  const taskValue = String(value ?? '').toLowerCase();
  return (Object.values(ModelTask) as string[]).includes(taskValue)
    ? (taskValue as ModelTask)
    : ModelTask.chat;
}

function normalizeModelInfo(item: Record<string, unknown>): ModelInfo {
  const task = normalizeTask(item.task ?? item.type);
  const input = normalizeModalities(item.input);
  const output = normalizeModalities(item.output);
  const rawCaps = (item.capabilities as Record<string, unknown> | undefined) ?? {};
  return {
    id: String(item.id ?? ''),
    name: String(item.name ?? ''),
    alias: String(item.alias ?? ''),
    description: item.description === undefined ? undefined : String(item.description),
    task,
    contextWindowSize: item.contextWindowSize === undefined ? undefined : Number(item.contextWindowSize),
    input,
    output,
    capabilities: {
      vision: Boolean(rawCaps.vision),
      tool_call: Boolean(rawCaps.tool_call),
      stream: rawCaps.stream === undefined ? true : Boolean(rawCaps.stream),
      reasoning: Boolean(rawCaps.reasoning)
    },
    isRemote: Boolean(item.isRemote),
    isCustom: Boolean(item.isCustom),
    isAppModel: Boolean(item.isAppModel),
    ...(item.appBundleId === undefined || item.appBundleId === null
      ? {}
      : { appBundleId: String(item.appBundleId) })
  };
}

function normalizeAppModel(item: Record<string, unknown>): AppModel {
  const rawCaps = (item.capabilities as Record<string, unknown> | undefined) ?? {};
  return {
    id: String(item.id ?? ''),
    name: String(item.name ?? ''),
    alias: String(item.alias ?? ''),
    description: String(item.description ?? ''),
    task: normalizeTask(item.task),
    provider: String(item.provider ?? ''),
    input: normalizeModalities(item.input),
    output: normalizeModalities(item.output),
    capabilities: {
      stream: rawCaps.stream === undefined ? true : Boolean(rawCaps.stream),
      tool_call: Boolean(rawCaps.tool_call),
      reasoning: Boolean(rawCaps.reasoning)
    },
    ...(item.baseUrl === undefined || item.baseUrl === null ? {} : { baseUrl: String(item.baseUrl) }),
    hasApiKey: Boolean(item.hasApiKey),
    ...(item.contextWindowSize === undefined || item.contextWindowSize === null
      ? {}
      : { contextWindowSize: Number(item.contextWindowSize) }),
    isDisabled: Boolean(item.isDisabled),
    appBundleId: String(item.appBundleId ?? ''),
    appName: String(item.appName ?? '')
  };
}

function normalizeModalities(value: unknown): Modality[] {
  if (!Array.isArray(value) || value.length === 0) {
    return [Modality.text];
  }
  const result: Modality[] = [];
  for (const raw of value) {
    const normalized = String(raw ?? '').toLowerCase();
    if ((Object.values(Modality) as string[]).includes(normalized)) {
      result.push(normalized as Modality);
    }
  }
  return result.length === 0 ? [Modality.text] : result;
}
