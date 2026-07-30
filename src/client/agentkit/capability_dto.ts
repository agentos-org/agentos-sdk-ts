import type { SessionName } from './sessions_dto';
import type {
  CallbackOpenTool,
  OpenSpec,
  PipelineStrategyType
} from './common_dto';
import { PipelineStrategyType as PipelineStrategyTypeValue } from './common_dto';

export interface LegacyLLMConfigFields {
  supportsToolCalling?: boolean;
  supportsDeepThinking?: boolean;
}

export interface LLMConfig extends LegacyLLMConfigFields {
  modelId?: string;
  baseUrl?: string;
  apiKey?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  contextWindowSize?: number;
  topP?: number;
  supportsToolCall?: boolean;
  supportsReasoning?: boolean;
}

export interface ReflectPrompt {
  llmConfig: LLMConfig;
  prompt: string;
}

export interface SimpleCapability {
  llmConfig?: LLMConfig;
  systemPrompt: string;
}

export interface Capability extends SimpleCapability {
  openSpecList?: OpenSpec[];
  callbackOpenTool?: CallbackOpenTool;
  sessionList?: SessionName[];
  reflectPromptList?: ReflectPrompt[];
  timeoutSeconds?: number;
  taskPipelineStrategy?: PipelineStrategyType;
  toolPipelineStrategy?: PipelineStrategyType;
  auto?: boolean;
  llmConfigList?: LLMConfig[];
  enableThinking?: boolean;
  toolReturnPackMinLength?: number;
  /** Maximum LLM requests per tool-enabled task. Server default: 64. */
  maxLlmRequests?: number;
  /** Maximum tool-call rounds per task. Server default: 16. */
  maxToolRounds?: number;
  /** Maximum total tool calls per task. Server default: 64. */
  maxToolCalls?: number;
  /** Maximum consecutive rounds with identical tool calls. Server default: 3. */
  maxConsecutiveIdenticalToolRounds?: number;
  /** Maximum duration in seconds for a tool-enabled task. Server default: 300. */
  maxTaskDurationSeconds?: number;
}

export function normalizeLLMConfig(config?: LLMConfig): LLMConfig | undefined {
  if (!config) {
    return undefined;
  }
  return {
    modelId: config.modelId,
    baseUrl: config.baseUrl,
    apiKey: config.apiKey,
    model: config.model,
    temperature: config.temperature ?? 0,
    maxTokens: config.maxTokens ?? 4096,
    contextWindowSize: config.contextWindowSize,
    topP: config.topP ?? 1,
    supportsToolCall: config.supportsToolCall ?? config.supportsToolCalling ?? true,
    supportsReasoning: config.supportsReasoning ?? config.supportsDeepThinking ?? true
  };
}

export function normalizeSimpleCapability(capability: SimpleCapability): SimpleCapability {
  return {
    ...capability,
    llmConfig: normalizeLLMConfig(capability.llmConfig)
  };
}

export function normalizeCapability(capability: Capability): Capability {
  return {
    ...capability,
    llmConfig: normalizeLLMConfig(capability.llmConfig),
    reflectPromptList: capability.reflectPromptList?.map((item) => ({
      ...item,
      llmConfig: normalizeLLMConfig(item.llmConfig) as LLMConfig
    })),
    timeoutSeconds: capability.timeoutSeconds ?? 3600,
    taskPipelineStrategy: capability.taskPipelineStrategy ?? PipelineStrategyTypeValue.parallel,
    llmConfigList: capability.llmConfigList?.map((item) => normalizeLLMConfig(item) as LLMConfig)
  };
}
