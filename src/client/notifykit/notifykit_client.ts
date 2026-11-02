import type { NotifyKitPublishRequest, NotifyKitPublishResponse } from './dto';
import { ApiClient } from '../../utils';

export class NotifyKitClient {
  constructor(private readonly apiClient: ApiClient) {}

  publish(
    bearerToken: string,
    request: NotifyKitPublishRequest
  ): Promise<NotifyKitPublishResponse> {
    return this.apiClient.request<NotifyKitPublishResponse>('/notifykit/notifications', {
      method: 'POST',
      headers: { authorization: `Bearer ${bearerToken}` },
      data: request,
    });
  }
}
