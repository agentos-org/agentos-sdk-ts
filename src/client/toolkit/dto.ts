export interface ToolDto {
  id: string;
  alias?: string;
  status?: string;
  [key: string]: unknown;
}

export interface OpenTool {
  opentool?: string;
  info?: {
    title?: string;
    description?: string;
    [key: string]: unknown;
  };
  server?: {
    url?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface ToolLifecycleEventDto {
  type: string;
  reason?: string;
  tool: ToolDto;
  [key: string]: unknown;
}
