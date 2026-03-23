import type { Capability } from './capability_dto';

export interface OpenToolInfo {
  openToolId: string;
  description: string;
}

export interface AgentId {
  agentId: string;
}

export interface Agent {
  name: string;
  capability: Capability;
}

export interface AgentInfo extends AgentId {
  name: string;
  capability: Capability;
}
