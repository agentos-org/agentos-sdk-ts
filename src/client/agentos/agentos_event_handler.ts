import type { AppEvent, Welcome } from '../../types';

export abstract class AgentOSEventHandler {
  abstract onWelcome(welcome: Welcome): Promise<void>;

  /** Receives typed AppKit business events such as OpenTool provisioning failures. */
  async onAppEvent(_event: AppEvent): Promise<void> {}

  abstract onDone(): Promise<void>;

  abstract onError(error: Error): Promise<void>;
}
