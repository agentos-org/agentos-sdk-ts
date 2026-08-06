import type {
  HistoryQuery,
  IncomingTransferEvent,
  PolicyResponse,
  SetPolicyRequest,
  TransferHistoryRecord,
  TransferRespondRequest,
  TransferSendRequest,
  TransferSession,
} from './dto';
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

  respond(bearerToken: string, transferId: string, request: TransferRespondRequest): Promise<{ status: string }> {
    return this.apiClient.request<{ status: string }>(`/transferkit/transfers/${transferId}/respond`, {
      method: 'POST',
      headers: { authorization: `Bearer ${bearerToken}` },
      data: request,
    });
  }

  async receiveStream(bearerToken: string, signal?: AbortSignal): Promise<AsyncGenerator<IncomingTransferEvent>> {
    const response = await this.apiClient.requestStream('/transferkit/receive/stream', {
      headers: { authorization: `Bearer ${bearerToken}` },
      signal,
    });
    return (async function* (): AsyncGenerator<IncomingTransferEvent> {
      for await (const event of parseSse(response)) {
        if (event.data) {
          yield JSON.parse(event.data) as IncomingTransferEvent;
        }
      }
    })();
  }

  setPolicy(bearerToken: string, request: SetPolicyRequest): Promise<PolicyResponse> {
    return this.apiClient.request<PolicyResponse>('/transferkit/receive/policy', {
      method: 'PUT',
      headers: { authorization: `Bearer ${bearerToken}` },
      data: request,
    });
  }

  getPolicy(bearerToken: string): Promise<PolicyResponse> {
    return this.apiClient.request<PolicyResponse>('/transferkit/receive/policy', {
      headers: { authorization: `Bearer ${bearerToken}` },
    });
  }

  getHistory(bearerToken: string, query?: HistoryQuery): Promise<TransferHistoryRecord[]> {
    const params = new URLSearchParams();
    if (query?.deviceId) params.set('deviceId', query.deviceId);
    if (query?.userId) params.set('userId', query.userId);
    const qs = params.toString();
    const path = qs ? `/transferkit/history?${qs}` : '/transferkit/history';
    return this.apiClient.request<TransferHistoryRecord[]>(path, {
      headers: { authorization: `Bearer ${bearerToken}` },
    });
  }

  deleteHistory(bearerToken: string, recordId: string, query?: HistoryQuery): Promise<{ status: string }> {
    const params = new URLSearchParams();
    if (query?.deviceId) params.set('deviceId', query.deviceId);
    if (query?.userId) params.set('userId', query.userId);
    const qs = params.toString();
    const path = qs ? `/transferkit/history/${recordId}?${qs}` : `/transferkit/history/${recordId}`;
    return this.apiClient.request<{ status: string }>(path, {
      method: 'DELETE',
      headers: { authorization: `Bearer ${bearerToken}` },
    });
  }

  clearHistory(bearerToken: string, query?: HistoryQuery): Promise<{ status: string }> {
    const params = new URLSearchParams();
    if (query?.deviceId) params.set('deviceId', query.deviceId);
    if (query?.userId) params.set('userId', query.userId);
    const qs = params.toString();
    const path = qs ? `/transferkit/history?${qs}` : '/transferkit/history';
    return this.apiClient.request<{ status: string }>(path, {
      method: 'DELETE',
      headers: { authorization: `Bearer ${bearerToken}` },
    });
  }
}
