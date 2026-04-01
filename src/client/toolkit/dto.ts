export type { OpenTool } from '../../opentool';

export interface ToolDto {
  id: string;
  alias?: string;
  status?: string;
  [key: string]: unknown;
}

export interface ToolLifecycleEventDto {
  type: string;
  reason?: string;
  tool: ToolDto;
  [key: string]: unknown;
}
