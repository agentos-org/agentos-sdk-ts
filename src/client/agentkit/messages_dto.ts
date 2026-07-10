import type { Content } from '../shared/dto';
import { normalizeLLMConfig, type LLMConfig } from './capability_dto';
import type {
  ToolReturn
} from './common_dto';

export interface AgentEvent {
  agentEventType: string;
  data: string;
}

export interface CompletionsLimits {
  maxTokens: number;
  contextWindowSize?: number;
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  contextUsageRatio?: number;
}

export interface Completions {
  usage?: TokenUsage;
  id: string;
  model: string;
  limits?: CompletionsLimits;
}

export interface AgentMessage {
  sessionId: string;
  agentId?: string;
  originalTaskId: string;
  parentTaskId?: string;
  taskId: string;
  role: string;
  to: string;
  type: string;
  content: unknown;
  reasoningContent?: string;
  completions?: Completions;
  createTime: string;
}

export interface AgentMessageChunk {
  sessionId: string;
  agentId?: string;
  parentTaskId?: string;
  taskId: string;
  role: string;
  to: string;
  type: string;
  part: unknown;
  createTime: string;
}

export interface UserTask {
  content: Content[];
  isChunk?: boolean;
  extraSystemPrompt?: string;
  llmConfig?: LLMConfig;
}

export function normalizeUserTask(userTask: UserTask): UserTask {
  return {
    ...userTask,
    llmConfig: normalizeLLMConfig(userTask.llmConfig)
  };
}

export interface EventToolReturn {
  event: string;
  toolReturn: ToolReturn;
}

export interface Dispatch {
  dispatchId: string;
  agentId: string;
  name: string;
  content: Content[];
}

export interface TaskStatus {
  status: string;
  taskId?: string;
  description?: Record<string, unknown>;
}

export interface ReflectScore {
  score: number;
  description?: string;
}

export interface MessageScore {
  content: Content[];
  messageType: string;
  message: string;
  reflectScoreList: ReflectScore[];
}

export interface Reflection {
  isPass: boolean;
  messageScore: MessageScore;
  passScore: number;
  count: number;
  maxCount: number;
}

export type { ToolReturn };
