import type { Call, Welcome } from '../../types';

export abstract class AgentOSEventHandler {
  abstract onWelcome(welcome: Welcome): Promise<void>;

  async onCallApp(_call: Call): Promise<void> {}

  abstract onDone(): Promise<void>;

  abstract onError(error: Error): Promise<void>;
}
