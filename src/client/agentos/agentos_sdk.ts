import {
  AgentEventType,
  AgentOSEventType,
  AgentOSSubscribeConnectionStatus,
  type Agent,
  type AgentEvent,
  type AgentMessage,
  type AgentMessageChunk,
  type AgentOSSubscribeConnectionEvent,
  type AgentOSSubscribeOptions,
  type AppKitError,
  type AppBundle,
  type Call,
  type Capability,
  type EventToolReturn,
  type FunctionCall,
  type Session,
  type SimpleCapability,
  type ToolReturn,
  type UserTask,
  type Welcome
} from '../../types';
import { AgentMessageHandler } from '../agentkit/agent_message_handler';
import { AgentOSEventHandler } from './agentos_event_handler';
import { AgentKitClient } from '../agentkit/agentkit_client';
import { AppKitClient } from '../appkit/appkit_client';
import { CronKitClient } from '../cronkit/cronkit_client';
import { LlmKitClient } from '../llmkit/llmkit_client';
import { SystemKitClient } from '../systemkit/systemkit_client';
import { ToolKitClient } from '../toolkit/toolkit_client';
import { ApiClient, ApiError, Subscription, asJsonMap, ensureError } from '../../utils';

export interface AgentOSSDKOptions {
  baseUrl?: string;
  connectTimeout?: number;
  receiveTimeout?: number;
  apiClient?: ApiClient;
  fetch?: typeof fetch;
}

interface AppAuthCacheKey {
  bundleId: string;
  appGroupId?: string;
}

interface AppAuthContext {
  key: AppAuthCacheKey;
  token: string;
}

interface ActiveSubscription {
  abortController: AbortController;
  task: Promise<void>;
}

export class AgentOSSDK {
  readonly apiClient: ApiClient;
  readonly agentos: AgentOSModule;
  readonly agentkit: AgentKitModule;
  readonly cronkit: CronKitModule;
  readonly llmkit: LlmKitModule;
  readonly toolkit: ToolKitModule;

  readonly systemKit: SystemKitClient;
  readonly agentKit: AgentKitClient;
  readonly appKit: AppKitClient;
  readonly cronKit: CronKitClient;
  readonly llmKit: LlmKitClient;
  readonly toolKit: ToolKitClient;
  readonly appTokens = new Map<string, string>();
  readonly tokenContexts = new Map<string, AppAuthCacheKey>();
  readonly refreshingTokens = new Map<string, Promise<string>>();
  readonly connectionEvents = new Subscription<AgentOSSubscribeConnectionEvent>();

  activeAppAuthKey?: AppAuthCacheKey;
  agentOsSubscription?: ActiveSubscription;
  agentOsReconnectTask?: Promise<void>;
  agentOsEventHandler?: AgentOSEventHandler;
  agentOsSubscribeOptions: Required<AgentOSSubscribeOptions> = {
    autoReconnect: true,
    maxReconnectAttempts: 3,
    reconnectDelay: 1000
  };
  agentOsConnectionStatus?: AgentOSSubscribeConnectionStatus;
  shouldMaintainAgentOsSubscription = false;
  disposed = false;

  constructor(options: AgentOSSDKOptions = {}) {
    this.apiClient = (options.apiClient ?? new ApiClient({
      baseUrl: options.baseUrl,
      connectTimeout: options.connectTimeout,
      receiveTimeout: options.receiveTimeout,
      fetch: options.fetch
    })).withOverrides({
      baseUrl: options.baseUrl,
      connectTimeout: options.connectTimeout,
      receiveTimeout: options.receiveTimeout,
      fetch: options.fetch
    });
    this.systemKit = new SystemKitClient(this.apiClient);
    this.agentKit = new AgentKitClient(this.apiClient);
    this.appKit = new AppKitClient(this.apiClient);
    this.cronKit = new CronKitClient(this.apiClient);
    this.llmKit = new LlmKitClient(this.apiClient);
    this.toolKit = new ToolKitClient(this.apiClient);
    this.agentos = new AgentOSModule(this);
    this.agentkit = new AgentKitModule(this);
    this.cronkit = new CronKitModule(this);
    this.llmkit = new LlmKitModule(this);
    this.toolkit = new ToolKitModule(this);
  }

  get isSubscribed(): boolean {
    return this.agentOsSubscription !== undefined;
  }

  get agentOsConnectionEvents(): Subscription<AgentOSSubscribeConnectionEvent> {
    return this.connectionEvents;
  }

  get agentOsCurrentConnectionStatus(): AgentOSSubscribeConnectionStatus | undefined {
    return this.agentOsConnectionStatus;
  }

  async dispose(): Promise<void> {
    this.disposed = true;
    this.shouldMaintainAgentOsSubscription = false;
    await this.cancelAgentOsSubscription();
    this.agentOsEventHandler = undefined;
    await this.agentOsReconnectTask;
    this.connectionEvents.close();
  }

  async withAppAuthRetry<T>(action: (bearerToken: string) => Promise<T>): Promise<T> {
    const requestContext = await this.requireAppAuthContext();
    try {
      return await action(requestContext.token);
    } catch (error) {
      if (!this.shouldRecoverAppAuth(error)) {
        throw error;
      }
      const refreshedToken = await this.refreshAppToken(requestContext, requestContext.token);
      return action(refreshedToken);
    }
  }

  async systemGetVersion() {
    return this.systemKit.getVersion();
  }

  async systemGetRoot() {
    return this.systemKit.getRoot();
  }

  async systemGetReady() {
    return this.systemKit.getReady();
  }

  async registerBundle(bundle: AppBundle): Promise<{ token: string; bundleId?: string; appGroupId?: string }> {
    const key = bundleKey(bundle);
    const info = await this.appKit.registerBundle(bundle);
    this.cacheAppToken(key, info.token, true);
    return info;
  }

  emitAgentOsConnectionEvent(
    status: AgentOSSubscribeConnectionStatus,
    attempt = 0,
    error?: Error
  ): void {
    this.agentOsConnectionStatus = status;
    this.connectionEvents.emit({ status, attempt, error });
  }

  async openAgentOsSubscription(isReconnect: boolean): Promise<void> {
    const abortController = new AbortController();
    const stream = await this.withAppAuthRetry((bearerToken) =>
      this.appKit.subscribe(bearerToken, abortController.signal)
    );
    const task = (async () => {
      for await (const event of stream) {
        const currentHandler = this.agentOsEventHandler;
        if (!currentHandler) {
          continue;
        }
        try {
          if (event.agentosEventType === AgentOSEventType.welcome) {
            await currentHandler.onWelcome(asJsonMap<Welcome>(event.data));
          } else if (event.agentosEventType === AgentOSEventType.error) {
            const error = asJsonMap<AppKitError>(event.data);
            await currentHandler.onError(new Error(error.error));
          } else if (event.agentosEventType === AgentOSEventType.callApp) {
            await currentHandler.onCallApp(asJsonMap<Call>(event.data));
          } else {
            throw new Error(`Unknown AgentOS event: ${event.agentosEventType}`);
          }
        } catch (error) {
          await currentHandler.onError(ensureError(error));
        }
      }
    })();
    this.agentOsSubscription = { abortController, task };
    task
      .then(() => this.handleSubscriptionClosed())
      .catch((error) => this.handleSubscriptionClosed(error));
    if (isReconnect) {
      this.emitAgentOsConnectionEvent(AgentOSSubscribeConnectionStatus.reconnected);
    }
    this.emitAgentOsConnectionEvent(AgentOSSubscribeConnectionStatus.connected);
  }

  async handleSubscriptionClosed(error?: unknown): Promise<void> {
    this.agentOsSubscription = undefined;
    const currentHandler = this.agentOsEventHandler;
    if (currentHandler) {
      if (error === undefined) {
        await currentHandler.onDone();
      } else if (!(error instanceof Error && error.name === 'AbortError')) {
        await currentHandler.onError(ensureError(error));
      }
    }
    if (!this.shouldMaintainAgentOsSubscription || this.disposed) {
      return;
    }
    if (!this.agentOsSubscribeOptions.autoReconnect) {
      this.emitAgentOsConnectionEvent(
        AgentOSSubscribeConnectionStatus.disconnected,
        0,
        error === undefined ? undefined : ensureError(error)
      );
      return;
    }
    this.startReconnectLoop(error);
  }

  startReconnectLoop(initialError?: unknown): void {
    if (this.agentOsReconnectTask) {
      return;
    }
    const options = this.agentOsSubscribeOptions;
    const firstError = initialError === undefined ? undefined : ensureError(initialError);
    this.emitAgentOsConnectionEvent(AgentOSSubscribeConnectionStatus.reconnecting, 1, firstError);
    this.agentOsReconnectTask = (async () => {
      let lastError = firstError;
      for (let attempt = 1; attempt <= options.maxReconnectAttempts; attempt += 1) {
        if (!this.shouldMaintainAgentOsSubscription || this.disposed) {
          break;
        }
        if (attempt > 1) {
          await delay(options.reconnectDelay);
        }
        try {
          await this.openAgentOsSubscription(true);
          return;
        } catch (error) {
          lastError = ensureError(error);
        }
      }
      if (this.shouldMaintainAgentOsSubscription && !this.disposed) {
        this.emitAgentOsConnectionEvent(
          AgentOSSubscribeConnectionStatus.disconnected,
          options.maxReconnectAttempts,
          lastError
        );
      }
    })().finally(() => {
      this.agentOsReconnectTask = undefined;
    });
  }

  async cancelAgentOsSubscription(): Promise<void> {
    const subscription = this.agentOsSubscription;
    this.agentOsSubscription = undefined;
    if (subscription) {
      subscription.abortController.abort();
      try {
        await subscription.task;
      } catch {
        return;
      }
    }
  }

  async requireAppAuthContext(): Promise<AppAuthContext> {
    const key = this.activeAppAuthKey;
    if (!key) {
      throw new Error('Bearer token is not set. Call agentos.registerBundle() first.');
    }
    let token = this.appTokens.get(cacheKey(key));
    const inflight = this.refreshingTokens.get(cacheKey(key));
    if ((!token || token.length === 0) && inflight) {
      token = await inflight;
    }
    if (!token || token.length === 0) {
      throw new Error('Bearer token is not set. Call agentos.registerBundle() first.');
    }
    return { key, token };
  }

  cacheAppToken(key: AppAuthCacheKey, token: string, activate: boolean): void {
    const mapKey = cacheKey(key);
    const previousToken = this.appTokens.get(mapKey);
    if (previousToken && previousToken !== token) {
      this.tokenContexts.delete(previousToken);
    }
    this.appTokens.set(mapKey, token);
    this.tokenContexts.set(token, key);
    if (activate) {
      this.activeAppAuthKey = key;
    }
  }

  clearAppToken(key: AppAuthCacheKey, expectedToken?: string): void {
    const mapKey = cacheKey(key);
    const currentToken = this.appTokens.get(mapKey);
    if (expectedToken && currentToken && currentToken !== expectedToken) {
      this.tokenContexts.delete(expectedToken);
      return;
    }
    const removedToken = this.appTokens.get(mapKey);
    this.appTokens.delete(mapKey);
    if (removedToken) {
      this.tokenContexts.delete(removedToken);
    }
    if (expectedToken) {
      this.tokenContexts.delete(expectedToken);
    }
  }

  contextForToken(token: string): AppAuthCacheKey | undefined {
    return this.tokenContexts.get(token);
  }

  refreshAppToken(context: AppAuthContext, failedToken: string): Promise<string> {
    const key = this.contextForToken(failedToken) ?? context.key;
    const tokenKey = cacheKey(key);
    const currentToken = this.appTokens.get(tokenKey);
    if (currentToken && currentToken.length > 0 && currentToken !== failedToken) {
      return Promise.resolve(currentToken);
    }
    const inflight = this.refreshingTokens.get(tokenKey);
    if (inflight) {
      return inflight;
    }
    this.clearAppToken(key, failedToken);
    const refresh = this.appKit
      .registerBundle({ bundleId: key.bundleId, appGroupId: key.appGroupId })
      .then((info) => {
        this.cacheAppToken(key, info.token, false);
        return info.token;
      })
      .finally(() => {
        this.refreshingTokens.delete(tokenKey);
      });
    this.refreshingTokens.set(tokenKey, refresh);
    return refresh;
  }

  shouldRecoverAppAuth(error: unknown): boolean {
    if (error instanceof ApiError) {
      if (error.status === 401 || error.status === 403) {
        return true;
      }
      const text = collectErrorText(error.data).toLowerCase();
      return includesAuthError(text);
    }
    const text = collectErrorText(error).toLowerCase();
    return includesAuthError(text);
  }
}

export class AgentOSModule {
  constructor(private readonly client: AgentOSSDK) {}

  getVersion() {
    return this.client.systemGetVersion();
  }

  getRoot() {
    return this.client.systemGetRoot();
  }

  getReady() {
    return this.client.systemGetReady();
  }

  registerBundle(bundle: AppBundle) {
    return this.client.registerBundle(bundle);
  }

  get connectionEvents(): Subscription<AgentOSSubscribeConnectionEvent> {
    return this.client.agentOsConnectionEvents;
  }

  get connectionStatus(): AgentOSSubscribeConnectionStatus | undefined {
    return this.client.agentOsCurrentConnectionStatus;
  }

  async subscribe(handler: AgentOSEventHandler, options: AgentOSSubscribeOptions = {}): Promise<void> {
    this.client.agentOsEventHandler = handler;
    this.client.agentOsSubscribeOptions = {
      autoReconnect: options.autoReconnect ?? true,
      maxReconnectAttempts: options.maxReconnectAttempts ?? 3,
      reconnectDelay: options.reconnectDelay ?? 1000
    };
    this.client.shouldMaintainAgentOsSubscription = true;
    this.client.disposed = false;
    if (this.client.isSubscribed || this.client.agentOsReconnectTask) {
      return;
    }
    try {
      await this.client.openAgentOsSubscription(false);
    } catch (error) {
      this.client.emitAgentOsConnectionEvent(
        AgentOSSubscribeConnectionStatus.disconnected,
        0,
        ensureError(error)
      );
      throw error;
    }
  }
}

export class CronKitModule {
  constructor(private readonly client: AgentOSSDK) {}

  getTask(options: { cronId: string }) {
    return this.client.withAppAuthRetry((token) => this.client.cronKit.getTask(token, options.cronId));
  }

  listTasks(options: { enabled?: boolean; offset?: number; limit?: number } = {}) {
    return this.client.withAppAuthRetry((token) => this.client.cronKit.listTasks(token, options));
  }

  createTask(options: { request: Parameters<CronKitClient['createTask']>[1] }) {
    return this.client.withAppAuthRetry((token) => this.client.cronKit.createTask(token, options.request));
  }

  updateTask(options: { request: Parameters<CronKitClient['updateTask']>[1] }) {
    return this.client.withAppAuthRetry((token) => this.client.cronKit.updateTask(token, options.request));
  }

  deleteTask(options: { cronId: string }) {
    return this.client.withAppAuthRetry((token) => this.client.cronKit.deleteTask(token, options.cronId));
  }

  enableTask(options: { cronId: string }) {
    return this.client.withAppAuthRetry((token) => this.client.cronKit.enableTask(token, options.cronId));
  }

  disableTask(options: { cronId: string }) {
    return this.client.withAppAuthRetry((token) => this.client.cronKit.disableTask(token, options.cronId));
  }

  runTaskNow(options: { cronId: string; scheduledAt?: Date }) {
    return this.client.withAppAuthRetry((token) =>
      this.client.cronKit.runTaskNow(token, options.cronId, options.scheduledAt)
    );
  }

  getRun(options: { runId: string }) {
    return this.client.withAppAuthRetry((token) => this.client.cronKit.getRun(token, options.runId));
  }

  listRuns(options: { cronId?: string; after?: Date; before?: Date; offset?: number; limit?: number } = {}) {
    return this.client.withAppAuthRetry((token) => this.client.cronKit.listRuns(token, options));
  }

  listRunMessages(options: { runId: string; offset?: number; limit?: number }) {
    return this.client.withAppAuthRetry((token) =>
      this.client.cronKit.listRunMessages(token, options.runId, options)
    );
  }

  deleteRun(options: { runId: string }) {
    return this.client.withAppAuthRetry((token) => this.client.cronKit.deleteRun(token, options.runId));
  }
}

export class AgentKitModule {
  constructor(private readonly client: AgentOSSDK) {}

  getAgent(options: { agentId: string }) {
    return this.client.withAppAuthRetry((token) => this.client.agentKit.getAgent(token, options.agentId));
  }

  createAgent(options: { agent: Agent }) {
    return this.client.withAppAuthRetry((token) => this.client.agentKit.createAgent(token, options.agent));
  }

  updateAgent(options: { agentId: string; agent: Agent }) {
    return this.client.withAppAuthRetry((token) =>
      this.client.agentKit.updateAgent(token, options.agentId, options.agent)
    );
  }

  deleteAgent(options: { agentId: string }) {
    return this.client.withAppAuthRetry((token) => this.client.agentKit.deleteAgent(token, options.agentId));
  }

  initSession(options: { agentId?: string; capability?: Capability } = {}) {
    return this.client.withAppAuthRetry((token) =>
      this.client.agentKit.initSession(token, {
        agentId: options.agentId,
        capability: options.capability
      })
    );
  }

  initSimple(options: { simpleCapability: SimpleCapability }) {
    return this.client.withAppAuthRetry((token) => this.client.agentKit.initSimple(token, options.simpleCapability));
  }

  async chat(session: Session, userTask: UserTask, agentMessageHandler: AgentMessageHandler): Promise<void> {
    const stream = await this.client.withAppAuthRetry((token) =>
      Promise.resolve(this.client.agentKit.chat(token, session.sessionId, userTask))
    );
    void (async () => {
      try {
        for await (const event of stream) {
          if (event.agentEventType === AgentEventType.message) {
            await agentMessageHandler.onMessage(session.sessionId, asJsonMap<AgentMessage>(event.data));
          } else if (event.agentEventType === AgentEventType.chunk) {
            await agentMessageHandler.onChunk(session.sessionId, asJsonMap<AgentMessageChunk>(event.data));
          } else if (event.agentEventType === AgentEventType.functionCall) {
            await this.handleFunctionCallEvent(session, event, agentMessageHandler);
          }
        }
        await agentMessageHandler.onDone();
      } catch (error) {
        await agentMessageHandler.onError(ensureError(error));
      }
    })();
  }

  chatSimple(options: { sessionId: string; userTask: UserTask }) {
    return this.client.withAppAuthRetry((token) =>
      this.client.agentKit.chatSimple(token, options.sessionId, options.userTask)
    );
  }

  history(options: { sessionId: string }) {
    return this.client.withAppAuthRetry((token) => this.client.agentKit.history(token, options.sessionId));
  }

  stop(options: { sessionId: string; taskId?: string }) {
    return this.client.withAppAuthRetry((token) => this.client.agentKit.stop(token, options.sessionId, options.taskId));
  }

  clear(options: { sessionId: string }) {
    return this.client.withAppAuthRetry((token) => this.client.agentKit.clear(token, options.sessionId));
  }

  callback(options: { sessionId: string; toolReturn: ToolReturn }) {
    return this.client.withAppAuthRetry((token) =>
      this.client.agentKit.callback(token, options.sessionId, options.toolReturn)
    );
  }

  streamCallback(options: { sessionId: string; eventToolReturn: EventToolReturn }) {
    return this.client.withAppAuthRetry((token) =>
      this.client.agentKit.streamCallback(token, options.sessionId, options.eventToolReturn)
    );
  }

  private async handleFunctionCallEvent(
    session: Session,
    event: AgentEvent,
    agentMessageHandler: AgentMessageHandler
  ): Promise<void> {
    const payload = asJsonMap<Record<string, unknown>>(event.data);
    const functionCallJson = payload.functionCall;
    if (!functionCallJson || typeof functionCallJson !== 'object' || Array.isArray(functionCallJson)) {
      throw new TypeError('Invalid functionCall event payload: missing functionCall object.');
    }
    const functionCall = functionCallJson as FunctionCall;
    const payloadSessionId = typeof payload.sessionId === 'string' && payload.sessionId.length > 0
      ? payload.sessionId
      : session.sessionId;
    if (this.isStreamFunctionCall(payload, functionCall)) {
      const pendingCallbacks: Array<Promise<unknown>> = [];
      await agentMessageHandler.onStreamFunctionCall(payloadSessionId, functionCall, (eventToolReturn) => {
        pendingCallbacks.push(this.streamCallback({ sessionId: payloadSessionId, eventToolReturn }));
      });
      await Promise.all(pendingCallbacks);
      return;
    }
    const toolReturn = await agentMessageHandler.onFunctionCall(payloadSessionId, functionCall);
    await this.callback({ sessionId: payloadSessionId, toolReturn });
  }

  private isStreamFunctionCall(payload: Record<string, unknown>, functionCall: FunctionCall): boolean {
    return this.readBoolFlag(payload, 'stream') ||
      this.readBoolFlag(functionCall as unknown as Record<string, unknown>, 'stream') ||
      this.readBoolFlag(payload, 'isStream') ||
      this.readBoolFlag(functionCall as unknown as Record<string, unknown>, 'isStream');
  }

  private readBoolFlag(json: Record<string, unknown>, key: string): boolean {
    return json[key] === true;
  }
}

export class LlmKitModule {
  constructor(private readonly client: AgentOSSDK) {}

  get chat() {
    return this.client.llmKit.chat;
  }

  listModels() {
    return this.client.llmKit.listModels();
  }
}

export class ToolKitModule {
  constructor(private readonly client: AgentOSSDK) {}

  listTool(all?: string) {
    return this.client.toolKit.listTool(all);
  }

  loadTool(toolId: string) {
    return this.client.toolKit.loadTool(toolId);
  }

  subscribeToolEvents(options: { daemonApiKey: string; snapshot?: boolean; signal?: AbortSignal }) {
    return this.client.toolKit.subscribeToolEvents(options.daemonApiKey, options.snapshot ?? true, options.signal);
  }
}

function bundleKey(bundle: AppBundle): AppAuthCacheKey {
  return {
    bundleId: bundle.bundleId,
    appGroupId: bundle.appGroupId
  };
}

function cacheKey(key: AppAuthCacheKey): string {
  return `${key.bundleId}::${key.appGroupId ?? ''}`;
}

function includesAuthError(text: string): boolean {
  return text.includes('invalid app token') ||
    text.includes('token expired') ||
    text.includes('unauthorized') ||
    text.includes('forbidden') ||
    text.includes('auth');
}

function collectErrorText(value: unknown): string {
  if (value === undefined || value === null) {
    return '';
  }
  if (value instanceof Error) {
    return [value.message].filter(Boolean).join(' ');
  }
  if (typeof value === 'string') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => collectErrorText(item)).filter(Boolean).join(' ');
  }
  if (typeof value === 'object') {
    return Object.values(value as Record<string, unknown>).map((item) => collectErrorText(item)).filter(Boolean).join(' ');
  }
  return String(value);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
