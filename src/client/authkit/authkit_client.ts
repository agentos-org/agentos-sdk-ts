import type {
  AuthorizeRequest,
  AuthorizeResponse,
  AuthKitGrant,
  AuthKitUserInfo,
  ExchangeTokenRequest,
  ExchangeTokenResponse,
  RevokeRequest,
} from './dto';
import { ApiClient } from '../../utils';

export class AuthKitClient {
  constructor(private readonly apiClient: ApiClient) {}

  authorize(bearerToken: string, request?: AuthorizeRequest): Promise<AuthorizeResponse> {
    return this.apiClient.request<AuthorizeResponse>('/authkit/authorize', {
      method: 'POST',
      headers: { authorization: `Bearer ${bearerToken}` },
      data: request ?? {},
    });
  }

  getStatus(bearerToken: string, requestId: string): Promise<AuthorizeResponse> {
    return this.apiClient.request<AuthorizeResponse>(`/authkit/authorize/${requestId}/status`, {
      headers: { authorization: `Bearer ${bearerToken}` },
    });
  }

  exchangeToken(bearerToken: string, request: ExchangeTokenRequest): Promise<ExchangeTokenResponse> {
    return this.apiClient.request<ExchangeTokenResponse>('/authkit/token', {
      method: 'POST',
      headers: { authorization: `Bearer ${bearerToken}` },
      data: request,
    });
  }

  getUserInfo(accessToken: string): Promise<AuthKitUserInfo> {
    return this.apiClient.request<AuthKitUserInfo>('/authkit/userinfo', {
      headers: { authorization: `Bearer ${accessToken}` },
    });
  }

  revoke(bearerToken: string, request?: RevokeRequest): Promise<{ status: string }> {
    return this.apiClient.request<{ status: string }>('/authkit/revoke', {
      method: 'POST',
      headers: { authorization: `Bearer ${bearerToken}` },
      data: request ?? {},
    });
  }

  listGrants(bearerToken: string): Promise<AuthKitGrant[]> {
    return this.apiClient.request<AuthKitGrant[]>('/authkit/grants', {
      headers: { authorization: `Bearer ${bearerToken}` },
    });
  }
}
