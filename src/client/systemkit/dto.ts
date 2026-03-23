export interface Version {
  version: string;
}

export interface RootInfo {
  name: string;
  version: string;
  description: string;
  baseUrl: string;
  endpoints: Record<string, string>;
}

export interface Readiness {
  ready: boolean;
  llmConfigured?: boolean;
  llmServicesReady?: boolean;
  liteAgentReady?: boolean;
  openToolDaemonReady?: boolean;
  embeddingsReady?: boolean;
  reasons?: string[];
}
