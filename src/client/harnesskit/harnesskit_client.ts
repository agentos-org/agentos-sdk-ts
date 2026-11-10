import { ApiClient, ApiError, parseSse, type RequestOptions } from '../../utils';
import type {
  HarnessKitCommand,
  HarnessKitCommandReceipt,
  HarnessKitEngineId,
  HarnessKitEngineSwitchResult,
  HarnessKitEvent,
  HarnessKitForkThreadRequest,
  HarnessKitOperationalSnapshot,
  HarnessKitRunAccepted,
  HarnessKitRunRequest,
  HarnessKitRunResult,
  HarnessKitSkill,
  HarnessKitSkillSettings,
  HarnessKitSkillSettingsUpdate,
  HarnessKitRuntimeInfo,
  HarnessKitThreadDeleteResult,
  HarnessKitThreadRenameResult,
  HarnessKitThreadSnapshot,
  HarnessKitEventsOptions,
  HarnessKitWorkspace,
  HarnessKitWorkspaceCreate,
  HarnessKitWorkspaceUpdate,
  HarnessKitWorkspaceValidation
} from './dto';

export class HarnessKitClient {
  constructor(private readonly apiClient: ApiClient = new ApiClient()) {}

  health(bearerToken: string): Promise<{ status: string }> {
    return this.request(bearerToken, '/healthz');
  }

  getRuntime(bearerToken: string): Promise<HarnessKitRuntimeInfo> {
    return this.request(bearerToken, '/v1/runtime/harness-engine');
  }

  switchEngine(
    bearerToken: string,
    engine: HarnessKitEngineId
  ): Promise<HarnessKitEngineSwitchResult> {
    return this.request(bearerToken, '/v1/runtime/harness-engine', {
      method: 'POST',
      data: { engine }
    });
  }

  async listThreads(bearerToken: string): Promise<HarnessKitThreadSnapshot[]> {
    const response = await this.request<{ threads?: HarnessKitThreadSnapshot[] }>(
      bearerToken,
      '/v1/threads'
    );
    return Array.isArray(response.threads) ? response.threads : [];
  }

  forkThread(
    bearerToken: string,
    request: HarnessKitForkThreadRequest
  ): Promise<HarnessKitThreadSnapshot> {
    return this.request(bearerToken, '/v1/threads', { method: 'POST', data: request });
  }

  async listSkills(bearerToken: string): Promise<HarnessKitSkill[]> {
    const response = await this.request<{ skills?: HarnessKitSkill[] }>(bearerToken, '/v1/skills');
    return Array.isArray(response.skills) ? response.skills : [];
  }

  /** Host-only: inspect the device's skill library configuration. */
  getSkillSettings(bearerToken: string): Promise<HarnessKitSkillSettings> {
    return this.request(bearerToken, '/admin/api/harness/skills');
  }

  /** Host-only: replace the device's skill library configuration. */
  updateSkillSettings(
    bearerToken: string,
    settings: HarnessKitSkillSettingsUpdate
  ): Promise<HarnessKitSkillSettings> {
    return this.request(bearerToken, '/admin/api/harness/skills', { method: 'PUT', data: settings });
  }

  /** Workspace management is restricted to the built-in Harness app. */
  async listWorkspaces(bearerToken: string, includeArchived = false): Promise<HarnessKitWorkspace[]> {
    const response = await this.request<{ workspaces?: HarnessKitWorkspace[] }>(bearerToken, '/v1/workspaces', {
      query: includeArchived ? { includeArchived: true } : undefined
    });
    return Array.isArray(response.workspaces) ? response.workspaces : [];
  }

  async createWorkspace(bearerToken: string, workspace: HarnessKitWorkspaceCreate): Promise<HarnessKitWorkspace> {
    const response = await this.request<{ workspace: HarnessKitWorkspace }>(bearerToken, '/v1/workspaces', {
      method: 'POST', data: workspace
    });
    return response.workspace;
  }

  async updateWorkspace(
    bearerToken: string, workspaceId: string, changes: HarnessKitWorkspaceUpdate
  ): Promise<HarnessKitWorkspace> {
    const response = await this.request<{ workspace: HarnessKitWorkspace }>(
      bearerToken, `/v1/workspaces/${encodeURIComponent(workspaceId)}`, { method: 'PATCH', data: changes }
    );
    return response.workspace;
  }

  async relinkWorkspace(bearerToken: string, workspaceId: string, rootPath: string): Promise<HarnessKitWorkspace> {
    const response = await this.request<{ workspace: HarnessKitWorkspace }>(
      bearerToken, `/v1/workspaces/${encodeURIComponent(workspaceId)}/relink`, {
        method: 'POST', data: { rootPath }
      }
    );
    return response.workspace;
  }

  validateWorkspace(bearerToken: string, workspaceId: string): Promise<HarnessKitWorkspaceValidation> {
    return this.request(bearerToken, `/v1/workspaces/${encodeURIComponent(workspaceId)}/validate`, {
      method: 'POST'
    });
  }

  getThread(
    bearerToken: string,
    threadId: string
  ): Promise<HarnessKitThreadSnapshot> {
    return this.request(bearerToken, `/v1/threads/${encodeURIComponent(threadId)}`);
  }

  renameThread(
    bearerToken: string,
    threadId: string,
    title: string
  ): Promise<HarnessKitThreadRenameResult> {
    return this.request(bearerToken, `/v1/threads/${encodeURIComponent(threadId)}`, {
      method: 'PATCH',
      data: { title }
    });
  }

  deleteThread(
    bearerToken: string,
    threadId: string
  ): Promise<HarnessKitThreadDeleteResult> {
    return this.request(bearerToken, `/v1/threads/${encodeURIComponent(threadId)}`, {
      method: 'DELETE'
    });
  }

  startRun(
    bearerToken: string,
    threadId: string,
    request: HarnessKitRunRequest
  ): Promise<HarnessKitRunAccepted> {
    return this.request(
      bearerToken,
      `/v1/threads/${encodeURIComponent(threadId)}/runs`,
      {
        method: 'POST',
        data: { ...request, threadId }
      }
    );
  }

  async submitCommand(
    bearerToken: string,
    threadId: string,
    command: HarnessKitCommand
  ): Promise<HarnessKitCommandReceipt> {
    const path = `/v1/threads/${encodeURIComponent(threadId)}/commands`;
    try {
      return await this.request(bearerToken, path, {
        method: 'POST',
        data: { ...command, threadId }
      });
    } catch (error) {
      // Rejected commands use HTTP 400 with a receipt body, not an error envelope.
      if (error instanceof ApiError && isCommandReceipt(error.data)) {
        return error.data;
      }
      throw error;
    }
  }

  async events(
    bearerToken: string,
    threadId: string,
    options: HarnessKitEventsOptions = {}
  ): Promise<AsyncGenerator<HarnessKitEvent>> {
    if (options.afterSequence !== undefined &&
      (!Number.isInteger(options.afterSequence) || options.afterSequence < 0)) {
      throw new RangeError('HarnessKit afterSequence must be a non-negative integer.');
    }
    const response = await this.requestStream(
      bearerToken,
      `/v1/threads/${encodeURIComponent(threadId)}/events`,
      {
        query: {
          afterSequence: options.afterSequence ?? 0,
          runId: options.runId
        },
        headers: { accept: 'text/event-stream' },
        signal: options.signal
      }
    );
    return (async function* (): AsyncGenerator<HarnessKitEvent> {
      for await (const event of parseSse(response)) {
        if (!event.data) continue;
        try {
          yield JSON.parse(event.data) as HarnessKitEvent;
        } catch (error) {
          throw new SyntaxError(
            `Invalid HarnessKit SSE event "${event.event}": ${error instanceof Error ? error.message : String(error)}`
          );
        }
      }
    })();
  }

  getRunResult(
    bearerToken: string,
    runId: string
  ): Promise<HarnessKitRunResult> {
    return this.request(bearerToken, `/v1/runs/${encodeURIComponent(runId)}/result`);
  }

  getOperationalSnapshot(
    bearerToken: string
  ): Promise<HarnessKitOperationalSnapshot> {
    return this.request(bearerToken, '/v1/ops/snapshot');
  }

  /** Calls a Harness endpoint by its path relative to the Harness API root. */
  request<T>(
    bearerToken: string,
    path: string,
    options: RequestOptions = {}
  ): Promise<T> {
    return this.apiClient.request<T>(toGatewayPath(path), {
      ...options,
      headers: authHeaders(bearerToken, options.headers)
    });
  }

  /** Opens a streaming Harness endpoint by its path relative to the Harness API root. */
  requestStream(
    bearerToken: string,
    path: string,
    options: RequestOptions = {}
  ): Promise<Response> {
    return this.apiClient.requestStream(toGatewayPath(path), {
      ...options,
      headers: authHeaders(bearerToken, options.headers)
    });
  }
}

function toGatewayPath(path: string): string {
  const trimmed = path.trim();
  if (trimmed.length === 0 || /^[a-z][a-z\d+.-]*:\/\//i.test(trimmed)) {
    throw new TypeError('HarnessKit path must be a non-empty relative API path.');
  }
  const normalized = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  const harnessRelativePath = normalized === '/harnesskit'
    ? '/'
    : normalized.startsWith('/harnesskit/')
      ? normalized.slice('/harnesskit'.length)
      : normalized;
  const pathname = harnessRelativePath.split(/[?#]/, 1)[0];
  for (const segment of pathname.split('/')) {
    let decodedSegment: string;
    try {
      decodedSegment = decodeURIComponent(segment);
    } catch {
      throw new TypeError('HarnessKit path contains invalid URL encoding.');
    }
    if (decodedSegment === '.' || decodedSegment === '..') {
      throw new TypeError('HarnessKit path cannot contain dot segments.');
    }
  }
  return `/harnesskit${harnessRelativePath}`;
}

function authHeaders(
  bearerToken: string,
  headers?: Record<string, string>
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [name, value] of Object.entries(headers ?? {})) {
    if (name.toLowerCase() !== 'authorization') {
      result[name] = value;
    }
  }
  result.authorization = `Bearer ${bearerToken}`;
  return result;
}

function isCommandReceipt(value: unknown): value is HarnessKitCommandReceipt {
  return typeof value === 'object' && value !== null &&
    typeof (value as Record<string, unknown>).commandId === 'string' &&
    typeof (value as Record<string, unknown>).status === 'string';
}
