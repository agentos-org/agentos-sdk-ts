export type { OpenTool } from '../../browser_opentool';
import type { FunctionCall } from '../../browser_opentool';

export type ToolKitKnownStreamEvent =
  | 'START'
  | 'DATA'
  | 'ERROR'
  | 'DONE'
  | 'start'
  | 'data'
  | 'error'
  | 'done';

export type ToolKitStreamEventType = ToolKitKnownStreamEvent | (string & {});

export interface ToolKitStreamEvent {
  event: ToolKitStreamEventType;
  data: Record<string, unknown>;
}

export interface ToolKitCallOptions {
  toolId: string;
  functionCall: FunctionCall;
}

export interface ToolKitStreamCallOptions extends ToolKitCallOptions {
  signal?: AbortSignal;
}

export interface ToolServerDto {
  namespace: string;
  name: string;
  version: string;
  [key: string]: unknown;
}

export type ToolContentState =
  | 'unknown'
  | 'current'
  | 'updatePending'
  | 'broken'
  | (string & {});

export interface ToolDto {
  id: string;
  alias?: string;
  host?: string;
  port?: number;
  status?: string;
  serverId?: string;
  server?: ToolServerDto;
  materializedArtifactDigest?: string;
  contentState?: ToolContentState;
  [key: string]: unknown;
}

export interface ToolLifecycleEventDto {
  type: string;
  reason: string;
  tool: ToolDto;
  occurredAt: string;
  [key: string]: unknown;
}
