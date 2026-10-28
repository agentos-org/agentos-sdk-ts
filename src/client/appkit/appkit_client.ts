import type { AccessToken, AgentOSEvent, AppBundle } from '../../types';
import { ApiClient, parseSse } from '../../utils';

export class AppKitClient {
  constructor(private readonly apiClient: ApiClient = new ApiClient()) {}

  registerBundle(bundle: AppBundle): Promise<AccessToken> {
    return this.apiClient.request<AccessToken>('/appkit/register', {
      method: 'POST',
      data: bundle
    });
  }

  async subscribe(
    bearerToken: string,
    signal?: AbortSignal,
    toolEvents?: { scope: 'all' } | { scope: 'selected'; toolIds: string[] }
  ): Promise<AsyncGenerator<AgentOSEvent>> {
    const response = await this.apiClient.requestStream('/appkit/subscribe', {
      query: toolEvents
        ? {
            toolEvents: toolEvents.scope,
            ...(toolEvents.scope === 'selected'
              ? { toolIds: toolEvents.toolIds.join(',') }
              : {})
          }
        : undefined,
      headers: {
        authorization: `Bearer ${bearerToken}`
      },
      signal
    });
    return (async function* (): AsyncGenerator<AgentOSEvent> {
      for await (const event of parseSse(response)) {
        yield {
          agentosEventType: event.event,
          data: event.data
        };
      }
    })();
  }
}
