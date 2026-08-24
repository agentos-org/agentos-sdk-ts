import type { Version } from '../systemkit/dto';
import {
  normalizeCapability,
  normalizeSimpleCapability,
  type SimpleCapability
} from './capability_dto';
import {
  normalizeUserTask,
  type AgentMessage,
  type AgentEvent,
  type EventToolReturn,
  type HistoryTurnSummary,
  type UserTask
} from './messages_dto';
import type { AgentHistoryPagination } from './sessions_dto';
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

  initSession(bearerToken: string, capability?: Parameters<typeof normalizeCapability>[0]): Promise<Record<string, unknown>> {
    return this.apiClient.request<Record<string, unknown>>('/agentkit/initSession', {
      method: 'POST',
      headers: authHeaders(bearerToken),
      data: capability ? normalizeCapability(capability) : undefined
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

  history(
    bearerToken: string,
    sessionId: string,
    pagination: AgentHistoryPagination = {}
  ): Promise<AgentMessage[]> {
    return this.apiClient.request<AgentMessage[]>('/agentkit/history', {
      query: { sessionId, ...pagination },
      headers: authHeaders(bearerToken)
    });
  }

  historySummary(
    bearerToken: string,
    sessionId: string,
    options: { page?: number; pageSize?: number } = {}
  ): Promise<HistoryTurnSummary[]> {
    const pagination = historyPagination(options, 30);
    return this.apiClient.request<HistoryTurnSummary[]>('/agentkit/history/summary', {
      query: { sessionId, ...pagination },
      headers: authHeaders(bearerToken)
    });
  }

  historyProcess(
    bearerToken: string,
    sessionId: string,
    originalTaskId: string,
    options: { page?: number; pageSize?: number } = {}
  ): Promise<AgentMessage[]> {
    if (originalTaskId.trim().length === 0) {
      throw new TypeError('originalTaskId must not be empty.');
    }
    const pagination = historyPagination(options, 50);
    return this.apiClient.request<AgentMessage[]>('/agentkit/history/process', {
      query: { sessionId, originalTaskId, ...pagination },
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

function historyPagination(
  options: { page?: number; pageSize?: number },
  defaultPageSize: number
): { page: number; pageSize: number } {
  const page = options.page ?? 1;
  const pageSize = options.pageSize ?? defaultPageSize;
  if (!Number.isInteger(page) || page <= 0) {
    throw new RangeError('page must be a positive integer.');
  }
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 200) {
    throw new RangeError('pageSize must be an integer between 1 and 200.');
  }
  return { page, pageSize };
}
