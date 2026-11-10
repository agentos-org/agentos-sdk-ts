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
  modelId?: string | null;
  runSummaries?: HarnessKitRunSummary[];
  supersededTurnIds?: string[];
  workspaceContext?: HarnessKitWorkspaceContext | null;
  workspaceBindingVersion?: number;
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

/** Public model metadata. Never put credentials in provider options. */
export interface HarnessKitSubagentModel {
  id: string;
  name?: string;
  source: 'agentos' | 'manual' | 'current-account';
  model: string;
  baseUrl: string;
  contextWindowSize: number;
  supportsToolCall: boolean;
  maxTokens?: number;
  supportsReasoning?: boolean;
  supportsStreaming?: boolean;
  enableReasoning?: boolean;
  stream?: boolean;
  temperature?: number;
  topP?: number;
}

export interface HarnessKitProviderOptions extends HarnessKitJsonObject {
  subagentModels?: HarnessKitSubagentModel[];
}

export interface HarnessKitLlmConfig {
  model: string;
  provider?: string | null;
  baseUrl?: string;
  apiKey?: string | null;
  /** Trusted-host credentials keyed by model profile ID, kept out of events. */
  auxiliaryCredentials?: Record<string, string> | null;
  adapter?: string | null;
  headers?: Record<string, string> | null;
  providerOptions?: HarnessKitProviderOptions | null;
  temperature?: number;
  maxTokens?: number;
  contextWindowSize?: number | null;
  topP?: number;
  supportsToolCall?: boolean;
  supportsReasoning?: boolean;
  [key: string]: unknown;
}

/** Decision model selected from ModelKit for a Harness request or turn. */
export interface HarnessKitDecisionModelConfig {
  /** ModelKit model ID; provider credentials and endpoints remain host-managed. */
  modelId: string;
  /** Enable decision-model ranking when the tool catalog exceeds the budget. */
  toolSelectionEnabled?: boolean;
  /** Input context window of the configured decision model. */
  contextWindowSize?: number | null;
  /** @deprecated Retained for older hosts; current Harness ignores this field. */
  directCallConfidence?: number;
}

export interface HarnessKitSkillReference {
  skillId: string;
  version?: string | null;
}

export interface HarnessKitSkillSelection {
  required?: HarnessKitSkillReference[];
  preferred?: HarnessKitSkillReference[];
  excludedSkillIds?: string[];
  autoSelect?: boolean;
  maxActiveSkills?: number | null;
  maxInstructionTokens?: number | null;
}

export interface HarnessKitSkillPolicy {
  allowedTrustLevels?: Array<'trusted' | 'verified' | 'untrusted'>;
  allowedSkillIds?: string[] | null;
  deniedSkillIds?: string[];
  allowAutomaticSelection?: boolean;
  defaultMaxActiveSkills?: number;
  defaultMaxInstructionTokens?: number;
}

export interface HarnessKitSkill {
  skillId: string;
  name: string;
  description: string;
  version: string;
  enabled?: boolean;
  source?: string | null;
  builtin?: boolean;
  requiredToolIds?: string[];
  missingToolIds?: string[] | null;
  [key: string]: unknown;
}

/** Host-only configuration; updating it replaces all three editable fields. */
export interface HarnessKitSkillSettingsUpdate {
  roots: string[];
  disabledSkillIds: string[];
  automatic: boolean;
}

export interface HarnessKitSkillSettings extends HarnessKitSkillSettingsUpdate {
  skills: HarnessKitSkill[];
  catalogError?: string | null;
  unavailableRoots?: string[];
}

export interface HarnessKitForkThreadRequest {
  sourceThreadId: string;
  threadId: string;
  throughTurnId: string;
  title: string;
}

export interface HarnessKitWorkspaceContext {
  workspaceId: string;
  workspaceRevision?: number;
  canonicalRoot?: string;
  workingDirectory?: string;
  [key: string]: unknown;
}

export interface HarnessKitWorkspace {
  workspaceId: string;
  name: string;
  rootPath?: string;
  folderPaths?: string[];
  revision: number;
  createdAt: string;
  updatedAt: string;
  archivedAt?: string | null;
  [key: string]: unknown;
}

export interface HarnessKitWorkspaceCreate {
  folderPaths: string[];
  name?: string;
}

export interface HarnessKitWorkspaceUpdate {
  name?: string;
  folderPaths?: string[];
  archived?: boolean;
}

export interface HarnessKitWorkspaceValidation {
  valid: boolean;
  workspaceId: string;
  folderPaths?: string[];
  rootPath?: string;
  instructionFiles: number;
}

export interface HarnessKitRunSummary {
  runId: string;
  threadId?: string | null;
  turnId?: string | null;
  status: string;
  createdAt?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  lastActivityAt?: string | null;
  executionDurationMs?: number | null;
  executionActiveSince?: string | null;
  modelCalls?: number;
  modelInputTokens?: number | null;
  modelOutputTokens?: number | null;
  modelTotalTokens?: number | null;
  toolCalls?: number;
  toolCompleted?: number;
  toolFailed?: number;
  toolCancelled?: number;
  autoResumePending?: boolean;
  segmentIndex?: number;
  continuationReason?: string | null;
  pendingApproval?: HarnessKitJsonObject | null;
  pendingHumanInput?: HarnessKitJsonObject | null;
  [key: string]: unknown;
}

export type HarnessKitToolApprovalMode =
  | 'ask'
  | 'onRisk'
  | 'fullAccess'
  | 'systemOne'
  | (string & {});

/** Tool visibility and approval rules for one run or turn. */
export interface HarnessKitToolPolicy {
  /** `null` leaves the tool set unrestricted; an empty list allows no tools. */
  allowedToolIds?: string[] | null;
  /** Denied tools remain unavailable even when they appear in `allowedToolIds`. */
  deniedToolIds?: string[];
  approvalMode?: HarnessKitToolApprovalMode;
  /** Legacy compatibility field; `approvalMode` takes precedence when both are set. */
  requireApprovalForSideEffects?: boolean;
}

/** Request payload accepted by POST /v1/threads/{threadId}/runs. */
export interface HarnessKitRunRequest {
  requestId: string;
  goal: string;
  llmConfig: HarnessKitLlmConfig;
  decisionModelConfig?: HarnessKitDecisionModelConfig | null;
  toolPolicy?: HarnessKitToolPolicy | null;
  skillSelection?: HarnessKitSkillSelection | null;
  skillPolicy?: HarnessKitSkillPolicy | null;
  workspaceId?: string | null;
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
  actorId?: string | null;
  input?: string;
  inputContentParts?: unknown[];
  llmConfigOverride?: HarnessKitLlmConfig | null;
  expectedRevision?: number;
  expectedBindingVersion?: number | null;
  queueMode?: 'append' | 'insertNext' | 'steer' | 'draft' | (string & {});
  runId?: string;
  turnId?: string;
  targetRunId?: string;
  targetTurnId?: string;
  /** Supported by submit_turn and edit_and_resend commands. */
  decisionModelConfigOverride?: HarnessKitDecisionModelConfig | null;
  /** Per-turn tool policy supported by submit_turn and edit/resend commands. */
  toolPolicy?: HarnessKitToolPolicy | null;
  skillSelection?: HarnessKitSkillSelection | null;
  skillPolicy?: HarnessKitSkillPolicy | null;
  workspaceId?: string | null;
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

export interface HarnessKitSubagentModelSelection extends HarnessKitJsonObject {
  subagent: true;
  modelId?: string;
  modelName?: string;
  profileId?: string;
  reason?: string;
  task?: string;
  selectionSource?: string;
}

export interface HarnessKitSubagentModelSelectedEvent extends HarnessKitEvent {
  type: 'model.selected';
  data: HarnessKitSubagentModelSelection;
}

export interface HarnessKitSkillActivationRecord {
  skillId: string;
  version: string;
  source?: string | null;
  contentHash?: string | null;
  estimatedInstructionTokens?: number;
  loadedResourceIds?: string[];
}

export interface HarnessKitSkillActivatedEvent extends HarnessKitEvent {
  type: 'skill.activated';
  data: HarnessKitJsonObject & {
    records?: HarnessKitSkillActivationRecord[];
    routing?: HarnessKitJsonObject | null;
  };
}

export function isHarnessKitSkillActivatedEvent(
  event: HarnessKitEvent
): event is HarnessKitSkillActivatedEvent {
  if (event.type !== 'skill.activated' || !event.data || typeof event.data !== 'object') return false;
  const records = event.data.records;
  const routing = event.data.routing;
  return (records === undefined || (Array.isArray(records) && records.every((record) =>
    record !== null && typeof record === 'object' &&
    typeof record.skillId === 'string' && typeof record.version === 'string'
  ))) && (routing === undefined || routing === null || (typeof routing === 'object' && !Array.isArray(routing)));
}

export function isHarnessKitSubagentModelSelectedEvent(
  event: HarnessKitEvent
): event is HarnessKitSubagentModelSelectedEvent {
  return event.type === 'model.selected' && event.data?.subagent === true &&
    ['modelId', 'modelName', 'profileId', 'reason', 'task', 'selectionSource'].every((key) =>
      event.data[key] === undefined || typeof event.data[key] === 'string'
    );
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
  skillActivation?: HarnessKitJsonObject | null;
  modelSelections?: Record<string, HarnessKitJsonObject>;
  summary?: HarnessKitRunSummary | null;
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
