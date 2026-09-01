import type { AgentMessage } from '../agentkit/messages_dto';
import type { Content } from '../shared/dto';

export enum CronTaskConcurrency {
  allow = 'allow',
  skipIfRunning = 'skipIfRunning',
  replace = 'replace'
}

export interface CronSpec {
  systemPrompt: string;
  content: Content[];
  timeoutSeconds?: number;
  modelId?: string;
  modelName?: string;
}

export interface CronTaskCreateRequest {
  name: string;
  schedule: string;
  spec: CronSpec;
  sessionId?: string;
  timezone?: string;
  concurrency?: CronTaskConcurrency;
  enabled?: boolean;
}

export interface CronTaskUpdateRequest {
  cronId: string;
  name?: string;
  schedule?: string;
  spec?: CronSpec;
  timezone?: string;
  concurrency?: CronTaskConcurrency;
  enabled?: boolean;
}

export interface CronTaskActionRequest {
  cronId: string;
}

export interface CronTaskSetEnabledRequest {
  cronId: string;
  enabled: boolean;
}

export interface CronTaskRunNowRequest {
  cronId: string;
  scheduledAt?: string;
}

export interface CronRunQuery {
  runId: string;
}

export interface CronTask {
  cronId: string;
  name: string;
  schedule: string;
  source: string;
  sessionId?: string;
  timezone?: string;
  enabled: boolean;
  status: string;
  concurrency: string;
  createdAt: string;
  updatedAt: string;
  lastRunAt?: string;
  nextRunAt?: string;
  spec: CronSpec;
}

export interface CronTaskListItem {
  cronId: string;
  name: string;
  schedule: string;
  enabled: boolean;
  status: string;
  spec?: CronSpec;
  lastRunAt?: string;
  nextRunAt?: string;
}

export interface CronTaskDeleteResult {
  deleted: boolean;
  cronId: string;
}

export interface CronRun {
  runId: string;
  cronId: string;
  trigger: string;
  status: string;
  scheduledAt: string;
  startedAt: string;
  hasDisplayableResult: boolean;
  finishedAt?: string;
  modelId?: string;
  liteAgentSessionId?: string;
  error?: string;
  result?: Record<string, unknown>;
  displayMessageId?: string;
  displayText?: string;
}

export interface CronRunListItem {
  runId: string;
  cronId: string;
  trigger: string;
  status: string;
  scheduledAt: string;
  startedAt: string;
  hasDisplayableResult: boolean;
  finishedAt?: string;
  modelId?: string;
  displayText?: string;
}

export interface CronRunMessage {
  messageId: string;
  runId: string;
  cronId: string;
  timestamp: string;
  message: AgentMessage;
}

export interface CronDeleteRunResult {
  deleted: boolean;
  runId: string;
}

export interface CronSchedulerSnapshot {
  running: boolean;
  activeTaskCount: number;
  runningTaskCount: number;
  lastTickAt?: string;
}

export interface CronSchedulerStatus {
  status: string;
}
