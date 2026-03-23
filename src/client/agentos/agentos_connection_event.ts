export interface AgentOSSubscribeOptions {
  autoReconnect?: boolean;
  maxReconnectAttempts?: number;
  reconnectDelay?: number;
}

export enum AgentOSSubscribeConnectionStatus {
  connected = 'connected',
  reconnecting = 'reconnecting',
  disconnected = 'disconnected',
  reconnected = 'reconnected'
}

export interface AgentOSSubscribeConnectionEvent {
  status: AgentOSSubscribeConnectionStatus;
  attempt: number;
  error?: Error;
}
