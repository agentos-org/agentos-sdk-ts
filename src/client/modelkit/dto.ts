/**
 * Task-oriented model classifier shared with the agentos-api ModelKit
 * controller.
 *
 * Declared as a string union (instead of a TypeScript enum) so callers can
 * pass string literals without importing an extra symbol.
 */
export type ModelTask = 'chat' | 'embedding' | 'asr' | 'tts' | 'decision';

/**
 * Frozen lookup table for callers that want to access the value by key.
 *
 * `decision` models (llama.cpp `/v1/systemone`) answer typed questions by
 * scoring caller-provided options; they never generate text.
 */
export const ModelTask = Object.freeze({
  chat: 'chat',
  embedding: 'embedding',
  asr: 'asr',
  tts: 'tts',
  decision: 'decision'
} as const);

/** `decisions` is the output modality of `decision` models. */
export type Modality = 'text' | 'image' | 'audio' | 'video' | 'decisions';

export const Modality = Object.freeze({
  text: 'text',
  image: 'image',
  audio: 'audio',
  video: 'video',
  decisions: 'decisions'
} as const);

/**
 * Mutually exclusive origin of a model, as reported by the gateway's `source`
 * field of `/modelkit/models`.
 *
 * Group and label models by it instead of combining `isRemote`, `isCustom` and
 * `isAppModel`. Run location (on-device vs. cloud) is secondary information and
 * is not part of the group name.
 *
 * - `local`: runs on this device.
 * - `platform`: a remote model provided by the AgentOS platform.
 * - `custom`: a remote model the user configured.
 * - `app`: registered by a third-party app through `registerAppModel`.
 */
export type ModelSource = 'local' | 'platform' | 'custom' | 'app';

/** Frozen lookup table for callers that want to access the value by key. */
export const ModelSource = Object.freeze({
  local: 'local',
  platform: 'platform',
  custom: 'custom',
  app: 'app'
} as const);

/** Capability flags that are orthogonal to input/output modalities. */
export interface ModelCapabilities {
  vision: boolean;
  tool_call: boolean;
  stream: boolean;
  reasoning: boolean;
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
  /**
   * Mutually exclusive origin of the model. Group and label models by it.
   *
   * Always set: when the gateway predates `source` or reports an unknown value,
   * it is derived from `isRemote` / `isCustom` / `isAppModel` with the gateway's
   * rules (an app model is `app`; otherwise a non-remote model is `local`, a
   * remote custom model is `custom` and any other remote model is `platform`).
   */
  source: ModelSource;
  /** `true` when a third-party app registered this model (see `registerAppModel`). */
  isAppModel?: boolean;
  /** Bundle ID of the app that registered the model. Only set for app models. */
  appBundleId?: string;
  /**
   * Human-readable name of the app that registered the model, for group titles
   * in model pickers (for example `App · ${appName}`). Only set for app models,
   * and only when the gateway reports a non-blank one; fall back to
   * `appBundleId` otherwise.
   */
  appName?: string;
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

/** Question primitive accepted by decision models. */
export type DecisionQuestionType = 'choice' | 'score' | 'noul';

export const DecisionQuestionType = Object.freeze({
  choice: 'choice',
  score: 'score',
  noul: 'noul'
} as const);

/** Pick exactly one option. `criteria` maps every option to its description. */
export interface DecisionChoiceQuestion {
  type: 'choice';
  instructions: string;
  criteria: Record<string, string>;
}

/** Ordinal scale. `criteria` lists the 2-10 level descriptions in order. */
export interface DecisionScoreQuestion {
  type: 'score';
  instructions: string;
  criteria: string[];
}

/** Yes/no judgement. `criteria` optionally describes `true` and `false`. */
export interface DecisionNoulQuestion {
  type: 'noul';
  instructions: string;
  criteria?: { true?: string; false?: string };
}

export type DecisionQuestion = DecisionChoiceQuestion | DecisionScoreQuestion | DecisionNoulQuestion;

/** Request body of `POST /modelkit/decision`. */
export interface DecisionRequest {
  /** Decision model id; the gateway picks a default when omitted. */
  model?: string;
  /** A string, JSON object or JSON array describing the situation. */
  state: string | Record<string, unknown> | unknown[];
  /** Question id -> question. Answers come back under the same ids. */
  questions: Record<string, DecisionQuestion>;
  /** Optional data URLs, for models that accept `image` input. */
  images?: string[];
  [key: string]: unknown;
}

/**
 * Answer to one question. Only the field matching `type` is populated:
 * `choice` (with `confidence`) for choice, `score` for score, `noul` for noul.
 * `probabilities` and `legend` are passed through exactly as the server
 * returns them.
 */
export interface DecisionAnswer {
  type?: DecisionQuestionType;
  choice?: string;
  score?: number;
  noul?: number;
  probabilities?: unknown;
  confidence?: number;
  legend?: unknown;
  [key: string]: unknown;
}

export interface DecisionUsage {
  input_tokens: number;
  output_tokens: number;
  [key: string]: unknown;
}

/** Response of `POST /modelkit/decision`. */
export interface DecisionResponse {
  model?: string;
  /** Answers keyed by the question ids of the request. */
  answers: Record<string, DecisionAnswer>;
  usage?: DecisionUsage;
  [key: string]: unknown;
}

/** Capability flags of app models (no `vision`; image input is an input modality). */
export interface AppModelCapabilities {
  stream: boolean;
  tool_call: boolean;
  reasoning: boolean;
}

/**
 * A model registered by a third-party app (`GET /modelkit/app-models`).
 * The API key is never returned; `hasApiKey` only tells whether one is stored.
 */
export interface AppModel {
  /**
   * The model ID: a 12-character hashid the gateway generated from
   * `appBundleId + name` when the app registered the model. Identical to the
   * model's `id` in `listModels()`. Use it to maintain the model
   * (`updateAppModel` / `unregisterAppModel` / `toggleAppModel`) and as the
   * `model` of chat / embedding / ASR / TTS / decision requests to route to
   * exactly this model.
   */
  id: string;
  name: string;
  alias: string;
  description: string;
  task: ModelTask;
  provider: string;
  input: Modality[];
  output: Modality[];
  capabilities: AppModelCapabilities;
  baseUrl?: string;
  hasApiKey: boolean;
  contextWindowSize?: number;
  /** Disabled models stay registered but are hidden from model lists. */
  isDisabled: boolean;
  /** Bundle ID of the app that owns this model. */
  appBundleId: string;
  appName: string;
}

/**
 * Request body of `registerAppModel`. Only `name` is required; unset fields are
 * omitted so the server applies its own defaults. The model id is not part of
 * the request: the gateway generates it and returns it in
 * `AppModelWriteResult.id`.
 *
 * Decision models (`task: 'decision'`) are normalized by the server to input
 * `text` (+ optional `image`), output `decisions` and no capabilities.
 */
export interface AppModelRegistration {
  /**
   * The model name, unique among the models of this app. The gateway derives
   * the model id from `appBundleId + name`, so registering the same name again
   * replaces the model and returns the same id.
   */
  name: string;
  alias?: string;
  description?: string;
  task?: ModelTask;
  provider?: string;
  input?: Modality[];
  output?: Modality[];
  capabilities?: Partial<AppModelCapabilities>;
  /** Upstream endpoint the gateway forwards to (decision default path: `/v1/systemone`). */
  baseUrl?: string;
  /** Upstream credential. Stored by the server and never returned. */
  apiKey?: string;
  contextWindowSize?: number;
  /** Must match the bundle ID of the bearer token when provided. */
  appBundleId?: string;
  appName?: string;
}

/**
 * Request body of `updateAppModel` (partial update). Unset fields are left
 * unchanged. `apiKey` is overwritten only when non-empty. When `task` changes,
 * input/output/capabilities that are not provided are reset to the new task's
 * defaults. The owning `appBundleId` cannot be changed.
 */
export type AppModelUpdate = Partial<Omit<AppModelRegistration, 'appBundleId'>>;

/** Result of an app-model write call (register / update / unregister / toggle). */
export interface AppModelWriteResult {
  success: boolean;
  /**
   * The model id generated by the gateway; returned by register only. Store it:
   * it maintains the model (`updateAppModel` / `unregisterAppModel` /
   * `toggleAppModel`) and is the `model` of requests that route to exactly this
   * model.
   */
  id?: string;
  /** `true` when register replaced an existing model of the same app. */
  updated?: boolean;
}
