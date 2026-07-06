export type { OpenTool } from '../../browser_opentool';

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
