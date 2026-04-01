import { OpenTool } from '../../opentool';
import type { ToolDto, ToolLifecycleEventDto } from './dto';
import {
  ApiClient,
  asJsonMap,
  parseSse
} from '../../utils';

export class ToolKitClient {
  constructor(private readonly apiClient: ApiClient = new ApiClient()) {}

  listTool(all?: string): Promise<ToolDto[]> {
    return this.apiClient.request<ToolDto[]>('/toolkit/list', {
      query: all ? { all } : undefined
    });
  }

  async loadTool(toolId: string): Promise<OpenTool | null> {
    const response = await this.apiClient.request<Record<string, unknown> | null>(`/toolkit/${toolId}/load`);
    return response ? OpenTool.fromJson(response) : null;
  }

  async *subscribeToolEvents(daemonApiKey: string, snapshot = true, signal?: AbortSignal): AsyncGenerator<ToolLifecycleEventDto> {
    const response = await this.apiClient.requestStream('/toolkit/events', {
      query: { snapshot: snapshot ? '1' : '0' },
      headers: { 'x-tool-api-key': daemonApiKey },
      signal
    });
    for await (const event of parseSse(response)) {
      if (event.event === 'ready') {
        continue;
      }
      yield asJsonMap<ToolLifecycleEventDto>(event.data);
    }
  }
}
