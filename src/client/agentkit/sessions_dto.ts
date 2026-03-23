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

export interface SessionAgentMessage {
  sessionId: string;
  agentMessage: AgentMessage;
}
