export interface AppBundle {
  bundleId: string;
  appGroupId?: string;
  opentoolServers?: OpenToolServerDeclaration[];
}

export interface OpenToolServerDeclaration {
  /** Stable app-local reference used to correlate register results and events. */
  ref: string;
  /** OpenTool server package name known to the local daemon. */
  name: string;
}

export interface OpenToolResolvedServer {
  namespace: string;
  name: string;
  version: string;
}

interface OpenToolRegistrationBase {
  ref: string;
}

export interface RunningOpenToolRegistration extends OpenToolRegistrationBase {
  status: 'running';
  server: OpenToolResolvedServer;
  id: string;
}

export interface StartingOpenToolRegistration extends OpenToolRegistrationBase {
  status: 'starting';
  name?: string;
  server?: OpenToolResolvedServer;
  id?: never;
}

export interface MissingOpenToolRegistration extends OpenToolRegistrationBase {
  status: 'notFound';
  name: string;
  server?: never;
  id?: never;
}

export type OpenToolRegistration =
  | RunningOpenToolRegistration
  | StartingOpenToolRegistration
  | MissingOpenToolRegistration;

export type OpenToolRegistrationStatus = OpenToolRegistration['status'];

export interface AccessToken {
  token: string;
  bundleId?: string;
  appGroupId?: string;
  opentoolServers?: OpenToolRegistration[];
}

export class AgentOSEventType {
  static readonly welcome = 'welcome';
  static readonly error = 'error';
  static readonly appEvent = 'appEvent';
}

export interface AgentOSEvent {
  agentosEventType: string;
  data: string;
}

export interface Welcome {
  bundleId: string;
  appGroupId?: string;
}

export class AppEventType {
  static readonly toolkitProvisionSucceeded = 'toolkit.provision.succeeded';
  static readonly toolkitProvisionFailed = 'toolkit.provision.failed';
  static readonly toolkitToolAvailable = 'toolkit.tool.available';
  static readonly toolkitToolUnavailable = 'toolkit.tool.unavailable';
  static readonly appCommandRequested = 'app.command.requested';
  static readonly notificationActivated = 'notification.activated';
}

export interface AppEvent<TData = unknown> {
  version: number;
  id: string;
  type: string;
  source: string;
  time: string;
  subject: string;
  data: TData;
}

export interface ToolLifecycleEventData {
  id: string;
  status: 'available' | 'unavailable';
  reason: string;
  [key: string]: unknown;
}

export interface NotificationActivatedEventData {
  notificationId: string;
  eventType: string;
  subjectId?: string;
}

export type NotificationActivatedEvent = AppEvent<NotificationActivatedEventData> & {
  type: typeof AppEventType.notificationActivated;
  source: 'notifykit';
};

export function isNotificationActivatedEvent(
  event: AppEvent
): event is NotificationActivatedEvent {
  return event.type === AppEventType.notificationActivated && event.source === 'notifykit';
}

export type ToolAvailableEvent = AppEvent<ToolLifecycleEventData> & {
  type: typeof AppEventType.toolkitToolAvailable;
  source: 'toolkit';
};

export type ToolUnavailableEvent = AppEvent<ToolLifecycleEventData> & {
  type: typeof AppEventType.toolkitToolUnavailable;
  source: 'toolkit';
};

export function isToolLifecycleEvent(
  event: AppEvent
): event is ToolAvailableEvent | ToolUnavailableEvent {
  return event.type === AppEventType.toolkitToolAvailable ||
    event.type === AppEventType.toolkitToolUnavailable;
}

export interface OpenToolProvisionFailure {
  ref: string;
  name: string;
  status: 'failed';
  server?: OpenToolResolvedServer;
  error: {
    code: string;
    message: string;
  };
}

export interface OpenToolProvisionSuccess {
  ref: string;
  name: string;
  status: 'running';
  server: OpenToolResolvedServer;
  id: string;
}

export type OpenToolProvisionSucceededEvent = AppEvent<OpenToolProvisionSuccess> & {
  type: typeof AppEventType.toolkitProvisionSucceeded;
  source: 'toolkit';
};

export function isOpenToolProvisionSucceededEvent(
  event: AppEvent
): event is OpenToolProvisionSucceededEvent {
  return event.type === AppEventType.toolkitProvisionSucceeded;
}

export type OpenToolProvisionFailedEvent = AppEvent<OpenToolProvisionFailure> & {
  type: typeof AppEventType.toolkitProvisionFailed;
  source: 'toolkit';
};

export function isOpenToolProvisionFailedEvent(
  event: AppEvent
): event is OpenToolProvisionFailedEvent {
  return event.type === AppEventType.toolkitProvisionFailed;
}

export interface AppKitError {
  error: string;
}
