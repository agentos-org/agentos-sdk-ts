import type { AgentMessage } from './messages_dto';

export interface Session {
  sessionId: string;
}

export interface SessionName extends Session {
  name?: string;
  description?: string;
}

export interface SessionTask {
  sessionId: string;
  taskId?: string;
}

export type AgentHistoryPagination =
  | { page?: never; pageSize?: never }
  | { page: number; pageSize: number };

export type AgentHistoryOptions = Session & AgentHistoryPagination;

export interface AgentHistorySummaryOptions extends Session {
  page?: number;
  pageSize?: number;
}

export interface AgentHistoryProcessOptions extends Session {
  originalTaskId: string;
  page?: number;
  pageSize?: number;
}

export interface SessionAgentMessage {
  sessionId: string;
  agentMessage: AgentMessage;
}
