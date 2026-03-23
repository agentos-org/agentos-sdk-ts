import type {
  ChatCompletionRequest,
  ChatCompletionResponse,
  LlmModelInfo
} from './dto';
import { LlmModelCategory } from './dto';
import {
  ApiClient,
  asJsonList,
  asJsonMap,
  parseSse
} from '../../utils';

export class LlmKitChatClient {
  readonly baseUrl: string;

  constructor(private readonly apiClient: ApiClient) {
    this.baseUrl = buildLlmBaseUrl(this.apiClient.baseUrl);
  }

  create(request: ChatCompletionRequest): Promise<ChatCompletionResponse> {
    return this.apiClient.request<ChatCompletionResponse>('/llmkit/text/chat/completions', {
      method: 'POST',
      data: serializeChatRequest(request)
    });
  }

  async *createStream(request: ChatCompletionRequest): AsyncGenerator<ChatCompletionResponse> {
    yield* createChatCompletionStream(this.apiClient, request);
  }

  async *createRemoteFunctionStream(request: ChatCompletionRequest): AsyncGenerator<ChatCompletionResponse> {
    yield* createChatCompletionRemoteFunctionStream(this.apiClient, request);
  }
}

export class LlmKitClient {
  readonly chat: LlmKitChatClient;

  constructor(private readonly apiClient: ApiClient = new ApiClient()) {
    this.chat = new LlmKitChatClient(this.apiClient);
  }

  async listModels(): Promise<Array<LlmModelInfo & {
    rawType: string;
    category: LlmModelCategory;
    supportsTextInference: boolean;
    isVisionLanguage: boolean;
  }>> {
    const data = await this.apiClient.request<unknown[]>('/llmkit/models');
    return asJsonList<Record<string, unknown>>(data).map((item) => {
      const type = String(item.type ?? '');
      const category = resolveLlmCategory(type);
      return {
        id: String(item.id ?? ''),
        name: String(item.name ?? ''),
        alias: String(item.alias ?? ''),
        description: item.description === undefined ? undefined : String(item.description),
        type,
        contextWindowSize: item.contextWindowSize === undefined ? undefined : Number(item.contextWindowSize),
        isRemote: Boolean(item.isRemote),
        isCustom: Boolean(item.isCustom),
        rawType: type,
        category,
        supportsTextInference:
          category === LlmModelCategory.textGeneration ||
          category === LlmModelCategory.visionLanguage ||
          category === LlmModelCategory.unknown,
        isVisionLanguage: category === LlmModelCategory.visionLanguage
      };
    });
  }
}

function serializeChatRequest(request: ChatCompletionRequest): Record<string, unknown> {
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
  request: ChatCompletionRequest
): AsyncGenerator<ChatCompletionResponse> {
  const response = await apiClient.requestStream('/llmkit/text/chat/completions', {
    method: 'POST',
    data: serializeChatRequest({ ...request, stream: true })
  });
  yield* parseChatCompletionStream(response);
}

async function* createChatCompletionRemoteFunctionStream(
  apiClient: ApiClient,
  request: ChatCompletionRequest
): AsyncGenerator<ChatCompletionResponse> {
  const response = await apiClient.requestStream('/llmkit/text/chat/completions', {
    method: 'POST',
    data: serializeChatRequest({ ...request, stream: true })
  });
  yield* parseChatCompletionStream(response);
}

async function* parseChatCompletionStream(response: Response): AsyncGenerator<ChatCompletionResponse> {
  for await (const event of parseSse(response)) {
    if (event.data === '[DONE]') {
      return;
    }
    yield asJsonMap<ChatCompletionResponse>(event.data);
  }
}

function resolveLlmCategory(type: string): LlmModelCategory {
  const normalized = type.trim().toLowerCase();
  if (!normalized) {
    return LlmModelCategory.unknown;
  }
  if (normalized === 'text' || normalized === 'textgeneration') {
    return LlmModelCategory.textGeneration;
  }
  if (normalized === 'image_text_to_text' || normalized === 'imagetexttotext') {
    return LlmModelCategory.visionLanguage;
  }
  if (normalized.includes('embedding')) {
    return LlmModelCategory.embedding;
  }
  if (normalized === 'text_to_speech' || normalized === 'tts') {
    return LlmModelCategory.textToSpeech;
  }
  if (normalized === 'audio_text_to_text') {
    return LlmModelCategory.audioTextToText;
  }
  if (normalized === 'speech_to_text' || normalized === 'asr') {
    return LlmModelCategory.speechToText;
  }
  return LlmModelCategory.unknown;
}

function buildLlmBaseUrl(baseUrl: string): string {
  const url = new URL(baseUrl);
  const normalizedPath = url.pathname.endsWith('/')
    ? url.pathname.slice(0, -1)
    : url.pathname;
  url.pathname = `${normalizedPath}/llmkit/text`;
  return url.toString().replace(/\/$/, '');
}
