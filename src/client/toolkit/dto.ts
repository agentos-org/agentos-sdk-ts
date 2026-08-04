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
  repo: string;
  name: string;
  tag: string;
  [key: string]: unknown;
}

export interface ToolDto {
  id: string;
  alias?: string;
  host?: string;
  port?: number;
  status?: string;
  serverId?: string;
  server?: ToolServerDto;
  [key: string]: unknown;
}

export interface ToolLifecycleEventDto {
  type: string;
  reason?: string;
  tool: ToolDto;
  [key: string]: unknown;
}
