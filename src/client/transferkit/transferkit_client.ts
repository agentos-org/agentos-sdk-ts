import type { TransferSendRequest, TransferSession } from './dto';
import { ApiClient, parseSse } from '../../utils';

export class TransferKitClient {
  constructor(private readonly apiClient: ApiClient) {}

  send(bearerToken: string, request: TransferSendRequest): Promise<TransferSession> {
    return this.apiClient.request<TransferSession>('/transferkit/send', {
      method: 'POST',
      headers: { authorization: `Bearer ${bearerToken}` },
      data: request,
    });
  }

  listTransfers(bearerToken: string): Promise<TransferSession[]> {
    return this.apiClient.request<TransferSession[]>('/transferkit/transfers', {
      headers: { authorization: `Bearer ${bearerToken}` },
    });
  }

  getStatus(bearerToken: string, transferId: string): Promise<TransferSession> {
    return this.apiClient.request<TransferSession>(`/transferkit/transfers/${transferId}/status`, {
      headers: { authorization: `Bearer ${bearerToken}` },
    });
  }

  async streamProgress(bearerToken: string, transferId: string, signal?: AbortSignal): Promise<AsyncGenerator<TransferSession>> {
    const response = await this.apiClient.requestStream(`/transferkit/transfers/${transferId}/stream`, {
      headers: { authorization: `Bearer ${bearerToken}` },
      signal,
    });
    return (async function* (): AsyncGenerator<TransferSession> {
      for await (const event of parseSse(response)) {
        if (event.data) {
          yield JSON.parse(event.data) as TransferSession;
        }
      }
    })();
  }

  cancel(bearerToken: string, transferId: string): Promise<{ status: string }> {
    return this.apiClient.request<{ status: string }>(`/transferkit/transfers/${transferId}/cancel`, {
      method: 'POST',
      headers: { authorization: `Bearer ${bearerToken}` },
      data: {},
    });
  }
}
