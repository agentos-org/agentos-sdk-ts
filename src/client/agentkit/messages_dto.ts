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

export class HistoryTurnStatus {
  static readonly running = 'running';
  static readonly done = 'done';
  static readonly error = 'error';
  static readonly stopped = 'stopped';
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

export interface HistoryTurnSummary {
  originalTaskId: string;
  sessionId: string;
  userMessage: AgentMessage | null;
  finalMessage: AgentMessage | null;
  status: string;
  error: string | null;
  createdAt: string | null;
  completedAt: string | null;
  durationMs: number | null;
  usage: TokenUsage | null;
  processMessageCount: number;
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

export type FunctionCallFailureStage =
  | 'function_call_parse_failed'
  | 'function_call_handler_failed'
  | 'function_call_callback_failed';

export interface FunctionCallFailureContext {
  sessionId: string;
  callId?: string;
  functionName?: string;
  callbackMode?: 'callback' | 'streamCallback';
}

/**
 * Identifies the lifecycle stage that failed without copying function-call
 * arguments into the error message.
 */
export class FunctionCallLifecycleError extends Error {
  readonly stage: FunctionCallFailureStage;
  readonly sessionId: string;
  readonly callId?: string;
  readonly functionName?: string;
  readonly callbackMode?: 'callback' | 'streamCallback';
  readonly cause: unknown;

  constructor(
    stage: FunctionCallFailureStage,
    context: FunctionCallFailureContext,
    cause: unknown
  ) {
    const functionLabel = context.functionName ? ` function=${context.functionName}` : '';
    const callLabel = context.callId ? ` callId=${context.callId}` : '';
    const causeMessage = cause instanceof Error ? cause.message : String(cause);
    super(`${stage}: sessionId=${context.sessionId}${callLabel}${functionLabel}: ${causeMessage}`);
    this.name = 'FunctionCallLifecycleError';
    this.stage = stage;
    this.sessionId = context.sessionId;
    this.callId = context.callId;
    this.functionName = context.functionName;
    this.callbackMode = context.callbackMode;
    this.cause = cause;
  }
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
