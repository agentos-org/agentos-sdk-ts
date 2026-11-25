import type { PeerDevice, PeerDeviceEvent, SelfInfo } from './dto';
import { ApiClient, parseSse } from '../../utils';

export class DiscoveryKitClient {
  constructor(private readonly apiClient: ApiClient) {}

  getPeers(bearerToken: string): Promise<PeerDevice[]> {
    return this.apiClient.request<PeerDevice[]>('/discoverykit/peers', {
      headers: { authorization: `Bearer ${bearerToken}` },
    });
  }

  async streamPeers(bearerToken: string, signal?: AbortSignal): Promise<AsyncGenerator<PeerDeviceEvent>> {
    const response = await this.apiClient.requestStream('/discoverykit/peers/stream', {
      headers: { authorization: `Bearer ${bearerToken}` },
      signal,
    });
    return (async function* (): AsyncGenerator<PeerDeviceEvent> {
      for await (const event of parseSse(response)) {
        if (event.data) {
          yield JSON.parse(event.data) as PeerDeviceEvent;
        }
      }
    })();
  }

  getSelf(bearerToken: string): Promise<SelfInfo> {
    return this.apiClient.request<SelfInfo>('/discoverykit/self', {
      headers: { authorization: `Bearer ${bearerToken}` },
    });
  }
}
