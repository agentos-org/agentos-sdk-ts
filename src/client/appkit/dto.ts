import type { Content } from '../shared/dto';

export interface AppBundle {
  bundleId: string;
  appGroupId?: string;
}

export interface AccessToken {
  token: string;
  bundleId?: string;
  appGroupId?: string;
}

export class AgentOSEventType {
  static readonly welcome = 'welcome';
  static readonly error = 'error';
  static readonly callApp = 'callApp';
}

export interface AgentOSEvent {
  agentosEventType: string;
  data: string;
}

export interface Welcome {
  bundleId: string;
}

export interface Call {
  bundleId: string;
  contentList: Content[];
}

export type CallAppEvent = Call;

export interface AppKitError {
  error: string;
}
