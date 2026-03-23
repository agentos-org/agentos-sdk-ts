import type {
  CronDeleteRunResult,
  CronRun,
  CronRunListItem,
  CronRunMessage,
  CronTask,
  CronTaskCreateRequest,
  CronTaskDeleteResult,
  CronTaskListItem,
  CronTaskUpdateRequest
} from '../../types';
import { ApiClient } from '../../utils';

export class CronKitClient {
  constructor(private readonly apiClient: ApiClient = new ApiClient()) {}

  getTask(bearerToken: string, cronId: string): Promise<CronTask> {
    return this.apiClient.request<CronTask>('/cronkit/task', {
      query: { cronId },
      headers: authHeaders(bearerToken)
    });
  }

  listTasks(bearerToken: string, options: { enabled?: boolean; offset?: number; limit?: number } = {}): Promise<CronTaskListItem[]> {
    return this.apiClient.request<CronTaskListItem[]>('/cronkit/task/list', {
      query: options,
      headers: authHeaders(bearerToken)
    });
  }

  createTask(bearerToken: string, request: CronTaskCreateRequest): Promise<CronTask> {
    return this.apiClient.request<CronTask>('/cronkit/task/create', {
      method: 'POST',
      headers: authHeaders(bearerToken),
      data: {
        concurrency: 'skipIfRunning',
        enabled: true,
        ...request,
        spec: {
          timeoutSeconds: 3600,
          ...request.spec
        }
      }
    });
  }

  updateTask(bearerToken: string, request: CronTaskUpdateRequest): Promise<CronTask> {
    return this.apiClient.request<CronTask>('/cronkit/task/update', {
      method: 'POST',
      headers: authHeaders(bearerToken),
      data: request
    });
  }

  deleteTask(bearerToken: string, cronId: string): Promise<CronTaskDeleteResult> {
    return this.apiClient.request<CronTaskDeleteResult>('/cronkit/task/delete', {
      method: 'POST',
      headers: authHeaders(bearerToken),
      data: { cronId }
    });
  }

  enableTask(bearerToken: string, cronId: string): Promise<CronTask> {
    return this.setTaskEnabled(bearerToken, cronId, true);
  }

  disableTask(bearerToken: string, cronId: string): Promise<CronTask> {
    return this.setTaskEnabled(bearerToken, cronId, false);
  }

  runTaskNow(bearerToken: string, cronId: string, scheduledAt?: Date): Promise<CronRun> {
    return this.apiClient.request<CronRun>('/cronkit/task/runNow', {
      method: 'POST',
      headers: authHeaders(bearerToken),
      data: {
        cronId,
        ...(scheduledAt ? { scheduledAt: scheduledAt.toISOString() } : {})
      }
    });
  }

  getRun(bearerToken: string, runId: string): Promise<CronRun> {
    return this.apiClient.request<CronRun>('/cronkit/run', {
      query: { runId },
      headers: authHeaders(bearerToken)
    });
  }

  listRuns(
    bearerToken: string,
    options: { cronId?: string; after?: Date; before?: Date; offset?: number; limit?: number } = {}
  ): Promise<CronRunListItem[]> {
    return this.apiClient.request<CronRunListItem[]>('/cronkit/run/list', {
      query: {
        ...options,
        after: options.after?.toISOString(),
        before: options.before?.toISOString()
      },
      headers: authHeaders(bearerToken)
    });
  }

  listRunMessages(
    bearerToken: string,
    runId: string,
    options: { offset?: number; limit?: number } = {}
  ): Promise<CronRunMessage[]> {
    return this.apiClient.request<CronRunMessage[]>('/cronkit/run/messages', {
      query: {
        runId,
        ...options
      },
      headers: authHeaders(bearerToken)
    });
  }

  deleteRun(bearerToken: string, runId: string): Promise<CronDeleteRunResult> {
    return this.apiClient.request<CronDeleteRunResult>('/cronkit/run/delete', {
      method: 'POST',
      headers: authHeaders(bearerToken),
      data: { runId }
    });
  }

  private setTaskEnabled(bearerToken: string, cronId: string, enabled: boolean): Promise<CronTask> {
    return this.apiClient.request<CronTask>('/cronkit/task/setEnabled', {
      method: 'POST',
      headers: authHeaders(bearerToken),
      data: { cronId, enabled }
    });
  }
}

function authHeaders(bearerToken: string): Record<string, string> {
  return {
    authorization: `Bearer ${bearerToken}`
  };
}
