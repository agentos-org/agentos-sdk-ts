/**
 * Task-oriented model classifier shared with the agentos-api ModelKit
 * controller.
 *
 * Declared as a string union (instead of a TypeScript enum) so callers can
 * pass string literals without importing an extra symbol.
 */
export type ModelTask = 'chat' | 'embedding' | 'asr' | 'tts';

/** Frozen lookup table for callers that want to access the value by key. */
export const ModelTask = Object.freeze({
  chat: 'chat',
  embedding: 'embedding',
  asr: 'asr',
  tts: 'tts'
} as const);

export type Modality = 'text' | 'image' | 'audio' | 'video';

export const Modality = Object.freeze({
  text: 'text',
  image: 'image',
  audio: 'audio',
  video: 'video'
} as const);

/** Capability flags that are orthogonal to input/output modalities. */
export interface ModelCapabilities {
  vision: boolean;
  tool_call: boolean;
  stream: boolean;
}

/** Model descriptor returned by `/modelkit/models`. */
export interface ModelInfo {
  id: string;
  name: string;
  alias: string;
  description?: string;
  task: ModelTask;
  contextWindowSize?: number;
  input: Modality[];
  output: Modality[];
  capabilities: ModelCapabilities;
  isRemote?: boolean;
  isCustom?: boolean;
}

export interface ModelChatMessage {
  role: string;
  content?: unknown;
  name?: string;
  tool_call_id?: string;
  tool_calls?: unknown[];
}

export interface ModelChatTool {
  type?: string;
  function?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface ModelChatCompletionRequest {
  model: string;
  messages: ModelChatMessage[];
  tools?: ModelChatTool[];
  toolChoice?: unknown;
  temperature?: number;
  topP?: number;
  n?: number;
  stop?: unknown;
  maxTokens?: number;
  presencePenalty?: number;
  frequencyPenalty?: number;
  logitBias?: Record<string, number>;
  user?: string;
  responseFormat?: unknown;
  seed?: number;
  logprobs?: boolean;
  topLogprobs?: number;
  stream?: boolean;
  streamOptions?: Record<string, unknown>;
  reasoningEffort?: string;
  enableThinking?: boolean;
}

export interface ModelChatCompletionResponse {
  id?: string;
  object?: string;
  created?: number;
  model?: string;
  choices?: Array<Record<string, unknown>>;
  usage?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface ModelEmbeddingRequest {
  model: string;
  /** A string, an array of strings, or an array of token ids. */
  input: string | string[] | number[] | number[][];
  encoding_format?: 'float' | 'base64';
  dimensions?: number;
  user?: string;
  [key: string]: unknown;
}

export interface ModelEmbeddingResponse {
  object?: string;
  data?: Array<{
    object?: string;
    index?: number;
    embedding?: number[] | string;
    [key: string]: unknown;
  }>;
  model?: string;
  usage?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface ModelTtsRequest {
  model: string;
  input: string;
  voice?: string;
  response_format?: 'mp3' | 'opus' | 'aac' | 'flac' | 'wav' | 'pcm' | string;
  speed?: number;
  [key: string]: unknown;
}

/** ASR upload request (multipart/form-data). */
export interface ModelAsrRequest {
  model: string;
  /** Audio payload; typically `File` in browsers and `Blob` in Node. */
  file: Blob | File;
  /** Required when [file] is a raw `Blob`. */
  fileName?: string;
  language?: string;
  prompt?: string;
  response_format?: 'json' | 'text' | 'srt' | 'verbose_json' | 'vtt' | string;
  temperature?: number;
  [key: string]: unknown;
}

export interface ModelAsrResponse {
  text?: string;
  language?: string;
  duration?: number;
  segments?: Array<Record<string, unknown>>;
  [key: string]: unknown;
}
