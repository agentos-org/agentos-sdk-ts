import type { Version } from '../systemkit/dto';
import type { Agent } from './agents_dto';
import {
  normalizeCapability,
  normalizeSimpleCapability,
  type SimpleCapability
} from './capability_dto';
import {
  normalizeUserTask,
  type AgentEvent,
  type EventToolReturn,
  type UserTask
} from './messages_dto';
import type { ToolReturn } from './common_dto';
import {
  ApiClient,
  normalizeAgentEventType,
  parseSse
} from '../../utils';

export class AgentKitClient {
  constructor(private readonly apiClient: ApiClient = new ApiClient()) {}

  getVersion(bearerToken: string): Promise<Version> {
    return this.apiClient.request<Version>('/agentkit/version', {
      headers: authHeaders(bearerToken)
    });
  }

  getAgent(bearerToken: string, agentId: string): Promise<Record<string, unknown>> {
    return this.apiClient.request<Record<string, unknown>>('/agentkit/agent', {
      query: { agentId },
      headers: authHeaders(bearerToken)
    });
  }

  createAgent(bearerToken: string, agent: Agent): Promise<Record<string, unknown>> {
    return this.apiClient.request<Record<string, unknown>>('/agentkit/agent/create', {
      method: 'POST',
      headers: authHeaders(bearerToken),
      data: agent
    });
  }

  updateAgent(bearerToken: string, agentId: string, agent: Agent): Promise<Record<string, unknown>> {
    return this.apiClient.request<Record<string, unknown>>('/agentkit/agent/update', {
      method: 'POST',
      query: { agentId },
      headers: authHeaders(bearerToken),
      data: agent
    });
  }

  deleteAgent(bearerToken: string, agentId: string): Promise<Record<string, unknown>> {
    return this.apiClient.request<Record<string, unknown>>('/agentkit/agent/delete', {
      query: { agentId },
      headers: authHeaders(bearerToken)
    });
  }

  initSession(bearerToken: string, options: { capability?: unknown; agentId?: string } = {}): Promise<Record<string, unknown>> {
    return this.apiClient.request<Record<string, unknown>>('/agentkit/initSession', {
      method: 'POST',
      query: options.agentId ? { agentId: options.agentId } : undefined,
      headers: authHeaders(bearerToken),
      data: options.capability ? normalizeCapability(options.capability as Parameters<typeof normalizeCapability>[0]) : undefined
    });
  }

  initSimple(bearerToken: string, simpleCapability: SimpleCapability): Promise<Record<string, unknown>> {
    return this.apiClient.request<Record<string, unknown>>('/agentkit/initSimple', {
      method: 'POST',
      headers: authHeaders(bearerToken),
      data: normalizeSimpleCapability(simpleCapability)
    });
  }

  async *chat(bearerToken: string, sessionId: string, userTask: UserTask, signal?: AbortSignal): AsyncGenerator<AgentEvent> {
    const response = await this.apiClient.requestStream('/agentkit/chat', {
      method: 'POST',
      query: { sessionId },
      headers: authHeaders(bearerToken),
      data: normalizeUserTask(userTask),
      signal
    });
    for await (const event of parseSse(response)) {
      yield {
        agentEventType: normalizeAgentEventType(event.event),
        data: event.data
      };
    }
  }

  chatSimple(bearerToken: string, sessionId: string, userTask: UserTask): Promise<Record<string, unknown>> {
    return this.apiClient.request<Record<string, unknown>>('/agentkit/chat/simple', {
      method: 'POST',
      query: { sessionId },
      headers: authHeaders(bearerToken),
      data: normalizeUserTask(userTask)
    });
  }

  history(bearerToken: string, sessionId: string): Promise<unknown[]> {
    return this.apiClient.request<unknown[]>('/agentkit/history', {
      query: { sessionId },
      headers: authHeaders(bearerToken)
    });
  }

  stop(bearerToken: string, sessionId: string, taskId?: string): Promise<Record<string, unknown>> {
    return this.apiClient.request<Record<string, unknown>>('/agentkit/stop', {
      query: { sessionId, taskId },
      headers: authHeaders(bearerToken)
    });
  }

  clear(bearerToken: string, sessionId: string): Promise<Record<string, unknown>> {
    return this.apiClient.request<Record<string, unknown>>('/agentkit/clear', {
      query: { sessionId },
      headers: authHeaders(bearerToken)
    });
  }

  callback(bearerToken: string, sessionId: string, toolReturn: ToolReturn): Promise<Record<string, unknown>> {
    return this.apiClient.request<Record<string, unknown>>('/agentkit/callback', {
      method: 'POST',
      query: { sessionId },
      headers: authHeaders(bearerToken),
      data: toolReturn
    });
  }

  streamCallback(bearerToken: string, sessionId: string, eventToolReturn: EventToolReturn): Promise<Record<string, unknown>> {
    return this.apiClient.request<Record<string, unknown>>('/agentkit/streamCallback', {
      method: 'POST',
      query: { sessionId },
      headers: authHeaders(bearerToken),
      data: eventToolReturn
    });
  }
}

function authHeaders(bearerToken: string): Record<string, string> {
  return {
    authorization: `Bearer ${bearerToken}`
  };
}
