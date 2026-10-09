/** JSON object exchanged with the Harness HTTP API. */
export type HarnessKitJsonObject = Record<string, unknown>;

/** Known Harness engines plus host-provided engine identifiers. */
export type HarnessKitEngineId = 'agentos' | 'codex' | 'deepseek' | (string & {});

export interface HarnessKitRuntimeInfo {
  status: string;
  engine: HarnessKitEngineId;
  activeEngine?: HarnessKitEngineId;
  availableEngines: HarnessKitEngineId[];
  switching: boolean;
  [key: string]: unknown;
}

export interface HarnessKitEngineSwitchResult {
  status: string;
  engine: HarnessKitEngineId;
  activeEngine?: HarnessKitEngineId;
  previousEngine?: HarnessKitEngineId;
  requestedEngine?: HarnessKitEngineId;
  message?: string;
  [key: string]: unknown;
}

export interface HarnessKitThreadMessage {
  role: string;
  content?: string;
  contentParts?: unknown[];
  metadata?: HarnessKitJsonObject;
  [key: string]: unknown;
}

export interface HarnessKitThreadSnapshot {
  schemaVersion?: number;
  threadId: string;
  title?: string;
  updatedAt: string;
  activeRunId?: string | null;
  queuedCommandCount?: number;
  runCount?: number;
  hasPausedRun?: boolean;
  messages: HarnessKitThreadMessage[];
  [key: string]: unknown;
}

export interface HarnessKitThreadRenameResult {
  threadId: string;
  title: string;
}

export interface HarnessKitThreadDeleteResult {
  deleted: boolean;
  threadId: string;
}

export interface HarnessKitLlmConfig {
  model: string;
  provider?: string | null;
  baseUrl?: string;
  apiKey?: string | null;
  adapter?: string | null;
  headers?: Record<string, string> | null;
  providerOptions?: HarnessKitJsonObject | null;
  temperature?: number;
  maxTokens?: number;
  contextWindowSize?: number | null;
  topP?: number;
  supportsToolCall?: boolean;
  supportsReasoning?: boolean;
  [key: string]: unknown;
}

/** Request payload accepted by POST /v1/threads/{threadId}/runs. */
export interface HarnessKitRunRequest {
  requestId: string;
  goal: string;
  llmConfig: HarnessKitLlmConfig;
  actorId?: string;
  messages?: HarnessKitThreadMessage[];
  context?: HarnessKitJsonObject;
  [key: string]: unknown;
}

export interface HarnessKitRunAccepted {
  status: string;
  threadId: string;
  runId: string;
  events?: string;
}

/** Command payload; extra fields vary by command type and remain forward-compatible. */
export interface HarnessKitCommand {
  type: string;
  commandId: string;
  threadId?: string;
  [key: string]: unknown;
}

export interface HarnessKitCommandReceipt {
  commandId: string;
  status: string;
  threadId?: string | null;
  turnId?: string | null;
  runId?: string | null;
  reason?: string | null;
}

export interface HarnessKitEvent {
  eventId: string;
  threadId: string;
  turnId?: string | null;
  runId?: string | null;
  stepId?: string | null;
  callId?: string | null;
  sequence: number;
  timestamp: string;
  type: string;
  lifecycle: string;
  data: HarnessKitJsonObject;
}

export interface HarnessKitRunError {
  code?: string;
  message?: string;
  source?: string;
  retryable?: boolean;
  details?: HarnessKitJsonObject;
}

export interface HarnessKitRunResult {
  runId: string;
  status: string;
  output?: string | null;
  error?: HarnessKitRunError | null;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
  } | null;
  steps?: unknown[];
  toolCalls?: unknown[];
  [key: string]: unknown;
}

export interface HarnessKitOperationalSnapshot {
  schemaVersion: number;
  capturedAt: string;
  lifecycle: string;
  threadCount: number;
  activeRunCount: number;
  pausedRunCount: number;
  waitingForAdmissionCount: number;
  waitingForApprovalCount: number;
  waitingForHumanInputCount: number;
  pendingCommandCount: number;
  unresolvedToolReceiptCount: number;
  unresolvedModelReceiptCount: number;
  threads: unknown[];
  [key: string]: unknown;
}

export interface HarnessKitEventsOptions {
  afterSequence?: number;
  runId?: string;
  signal?: AbortSignal;
}
