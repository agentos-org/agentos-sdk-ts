export interface AgentOSBridge {
  request(request: AgentOSBridgeRequest): Promise<AgentOSBridgeResponse>;
  cancel(requestId: string): Promise<void>;
}

export interface AgentOSBridgeRequest {
  id: string;
  protocol: 'agentos.web.bridge';
  protocolVersion: '1.0';
  appId?: string;
  origin?: string;
  method: string;
  path: string;
  query?: Record<string, string>;
  headers?: Record<string, string>;
  body?: unknown;
  stream?: boolean;
}

export interface AgentOSBridgeResponse {
  id: string;
  ok: boolean;
  status: number;
  headers?: Record<string, string>;
  body?: unknown;
  error?: {
    code: string;
    message: string;
    retryable?: boolean;
  };
}

export interface AgentOSBridgeStreamEvent {
  id: string;
  type: 'open' | 'chunk' | 'message' | 'functionCall' | 'error' | 'done';
  event?: string;
  data?: string;
  error?: {
    code: string;
    message: string;
  };
}

export interface AgentOSBridgeContext {
  appId?: string;
  baseUrl: string;
  selectedModel?: AgentOSBridgeModel;
  models?: AgentOSBridgeModel[];
  [key: string]: unknown;
}

export interface AgentOSBridgeModel {
  id: string;
  name?: string;
  alias?: string;
  source?: string;
  tier?: string;
  task?: string;
  input?: string[];
  output?: string[];
  contextWindowSize?: number;
  capabilities?: {
    reasoning?: boolean;
    toolCall?: boolean;
    vision?: boolean;
    streaming?: boolean;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface AgentOSContextProvider {
  get?: () => Promise<AgentOSBridgeContext> | AgentOSBridgeContext;
  [key: string]: unknown;
}

export interface AgentOSGlobal {
  bridge?: AgentOSBridge;
  context?: AgentOSContextProvider | AgentOSBridgeContext;
}

export interface CreateAgentOSBridgeFetchOptions {
  appId?: string;
  origin?: string;
  bridge?: AgentOSBridge;
}

declare global {
  interface Window {
    agentos?: AgentOSGlobal;
  }
}
