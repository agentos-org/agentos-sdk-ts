export enum LlmModelCategory {
  textGeneration = 'textGeneration',
  visionLanguage = 'visionLanguage',
  embedding = 'embedding',
  textToSpeech = 'textToSpeech',
  speechToText = 'speechToText',
  audioTextToText = 'audioTextToText',
  unknown = 'unknown'
}

export interface LlmModelInfo {
  id: string;
  name: string;
  alias: string;
  description?: string;
  type: string;
  contextWindowSize?: number;
  isRemote?: boolean;
  isCustom?: boolean;
}

export interface ChatCompletionMessage {
  role: string;
  content?: unknown;
  name?: string;
  tool_call_id?: string;
  tool_calls?: unknown[];
}

export interface ChatTool {
  type?: string;
  function?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface ChatCompletionRequest {
  model: string;
  messages: ChatCompletionMessage[];
  tools?: ChatTool[];
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

export interface ChatCompletionResponse {
  id?: string;
  object?: string;
  created?: number;
  model?: string;
  choices?: Array<Record<string, unknown>>;
  usage?: Record<string, unknown>;
  [key: string]: unknown;
}
