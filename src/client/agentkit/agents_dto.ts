import type { Capability } from './capability_dto';

export interface OpenToolInfo {
  openToolId: string;
  description: string;
}

export interface Agent {
  name: string;
  capability: Capability;
}
