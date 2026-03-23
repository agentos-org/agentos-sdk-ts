import type { Readiness, RootInfo, Version } from '../../types';
import { ApiClient } from '../../utils';

export class SystemKitClient {
  constructor(private readonly apiClient: ApiClient = new ApiClient()) {}

  getVersion(): Promise<Version> {
    return this.apiClient.request<Version>('/version');
  }

  getRoot(): Promise<RootInfo> {
    return this.apiClient.request<RootInfo>('/');
  }

  getReady(): Promise<Readiness> {
    return this.apiClient.request<Readiness>('/ready');
  }
}
