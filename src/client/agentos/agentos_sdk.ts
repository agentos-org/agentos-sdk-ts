import {
  AgentEventType,
  AgentOSEventType,
  AgentOSSubscribeConnectionStatus,
  EventType,
  FunctionCallLifecycleError,
  type AgentEvent,
  type AgentHistoryOptions,
  type AgentHistoryProcessOptions,
  type AgentHistorySummaryOptions,
  type AgentMessage,
  type AgentMessageChunk,
  type AgentOSSubscribeConnectionEvent,
  type AgentOSSubscribeOptions,
  type AccessToken,
  type AppEvent,
  type AppKitError,
  type AppBundle,
  type Capability,
  type EventToolReturn,
  type FunctionCall,
  type HistoryTurnSummary,
  type Session,
  type SimpleCapability,
  type UserTask,
  type Welcome
} from '../../types';
import { ToolReturn } from '../../browser_opentool';
import { AgentMessageHandler } from '../agentkit/agent_message_handler';
import { AgentOSEventHandler } from './agentos_event_handler';
import { AgentKitClient } from '../agentkit/agentkit_client';
import { AppKitClient } from '../appkit/appkit_client';
import { AuthKitClient } from '../authkit/authkit_client';
import { CronKitClient } from '../cronkit/cronkit_client';
import { DiscoveryKitClient } from '../discoverykit/discoverykit_client';
import { HarnessKitClient } from '../harnesskit/harnesskit_client';
import { ModelKitClient } from '../modelkit/modelkit_client';
import { ModelTask } from '../modelkit/dto';
import { SystemKitClient } from '../systemkit/systemkit_client';
import { ToolKitClient } from '../toolkit/toolkit_client';
import { TransferKitClient } from '../transferkit/transferkit_client';
import type {
  ToolKitCallOptions,
  ToolKitStreamCallOptions,
  ToolKitStreamEvent
} from '../toolkit/dto';
import type {
  AuthorizeRequest,
  AuthorizeResponse,
  AuthKitUserInfo,
  ExchangeTokenRequest,
  ExchangeTokenResponse,
  RevokeRequest,
} from '../authkit/dto';
import type {
  DiscoveryRegisterRequest,
  DiscoveryRegisterResponse,
  DiscoveryUnregisterResponse,
  PeerDevice,
  PeerDeviceEvent,
  SelfInfo,
} from '../discoverykit/dto';
import type {
  HarnessKitCommand,
  HarnessKitCommandReceipt,
  HarnessKitEngineId,
  HarnessKitEngineSwitchResult,
  HarnessKitEvent,
  HarnessKitOperationalSnapshot,
  HarnessKitEventsOptions,
  HarnessKitRunAccepted,
  HarnessKitRunRequest,
  HarnessKitRunResult,
  HarnessKitRuntimeInfo,
  HarnessKitThreadDeleteResult,
  HarnessKitThreadRenameResult,
  HarnessKitThreadSnapshot
} from '../harnesskit/dto';
import type {
  HistoryQuery,
  IncomingTransferEvent,
  PolicyResponse,
  SetPolicyRequest,
  TransferHistoryRecord,
  TransferRespondRequest,
  TransferSendRequest,
  TransferSession,
} from '../transferkit/dto';
import {
  ApiClient,
  ApiError,
  Subscription,
  asJsonMap,
  ensureError,
  type RequestOptions
} from '../../utils';
import { getAgentOSBridgeTransportDefaults } from '../../bridge';

export interface AgentOSSDKOptions {
  /**
   * Explicit transport options always win. When no apiClient/baseUrl/fetch is
   * provided and AgentOS Mobile injects window.agentos.bridge.request, the SDK
   * automatically uses the bridge transport; unsupported bridge routes still
   * surface as normal ApiError failures from the native bridge response.
   */
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
  readonly authkit: AuthKitModule;
  readonly cronkit: CronKitModule;
  readonly discoverykit: DiscoveryKitModule;
  readonly harnesskit: HarnessKitModule;
  readonly modelkit: ModelKitModule;
  readonly toolkit: ToolKitModule;
  readonly transferkit: TransferKitModule;

  readonly systemKit: SystemKitClient;
  readonly agentKit: AgentKitClient;
  readonly appKit: AppKitClient;
  readonly authKit: AuthKitClient;
  readonly cronKit: CronKitClient;
  readonly discoveryKit: DiscoveryKitClient;
  readonly harnessKit: HarnessKitClient;
  readonly modelKit: ModelKitClient;
  readonly toolKit: ToolKitClient;
  readonly transferKit: TransferKitClient;
  readonly appTokens = new Map<string, string>();
  readonly appBundles = new Map<string, AppBundle>();
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
    const transportDefaults = shouldAutoUseBridgeTransport(options)
      ? getAgentOSBridgeTransportDefaults()
      : undefined;
    this.apiClient = (options.apiClient ?? new ApiClient({
      baseUrl: options.baseUrl ?? transportDefaults?.baseUrl,
      connectTimeout: options.connectTimeout,
      receiveTimeout: options.receiveTimeout,
      fetch: options.fetch ?? transportDefaults?.fetch
    })).withOverrides({
      baseUrl: options.baseUrl ?? transportDefaults?.baseUrl,
      connectTimeout: options.connectTimeout,
      receiveTimeout: options.receiveTimeout,
      fetch: options.fetch ?? transportDefaults?.fetch
    });
    this.systemKit = new SystemKitClient(this.apiClient);
    this.agentKit = new AgentKitClient(this.apiClient);
    this.appKit = new AppKitClient(this.apiClient);
    this.authKit = new AuthKitClient(this.apiClient);
    this.cronKit = new CronKitClient(this.apiClient);
    this.discoveryKit = new DiscoveryKitClient(this.apiClient);
    this.harnessKit = new HarnessKitClient(this.apiClient);
    this.modelKit = new ModelKitClient(this.apiClient);
    this.toolKit = new ToolKitClient(this.apiClient);
    this.transferKit = new TransferKitClient(this.apiClient);
    this.agentos = new AgentOSModule(this);
    this.agentkit = new AgentKitModule(this);
    this.authkit = new AuthKitModule(this);
    this.cronkit = new CronKitModule(this);
    this.discoverykit = new DiscoveryKitModule(this);
    this.harnesskit = new HarnessKitModule(this);
    this.modelkit = new ModelKitModule(this);
    this.toolkit = new ToolKitModule(this);
    this.transferkit = new TransferKitModule(this);
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

  async registerBundle(bundle: AppBundle): Promise<AccessToken> {
    const registrationBundle = cloneAppBundle(bundle);
    const key = bundleKey(registrationBundle);
    const info = await this.appKit.registerBundle(registrationBundle);
    this.appBundles.set(cacheKey(key), registrationBundle);
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
          } else if (event.agentosEventType === AgentOSEventType.appEvent) {
            await currentHandler.onAppEvent(asJsonMap<AppEvent>(event.data));
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
    const bundle = this.appBundles.get(tokenKey) ?? {
      bundleId: key.bundleId,
      appGroupId: key.appGroupId
    };
    const refresh = this.appKit
      .registerBundle(bundle)
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

  initSession(options: { capability?: Capability } = {}) {
    return this.client.withAppAuthRetry((token) =>
      this.client.agentKit.initSession(token, options.capability)
    );
  }

  initSimple(options: { simpleCapability: SimpleCapability }) {
    return this.client.withAppAuthRetry((token) => this.client.agentKit.initSimple(token, options.simpleCapability));
  }

  async chat(session: Session, userTask: UserTask, agentMessageHandler: AgentMessageHandler): Promise<void> {
    const abortController = new AbortController();
    const stream = await this.client.withAppAuthRetry((token) =>
      Promise.resolve(this.client.agentKit.chat(token, session.sessionId, userTask, abortController.signal))
    );
    void (async () => {
      try {
        for await (const event of stream) {
          if (event.agentEventType === AgentEventType.message) {
            const message = asJsonMap<AgentMessage>(event.data);
            await agentMessageHandler.onMessage(eventSessionId(message, session.sessionId), message);
          } else if (event.agentEventType === AgentEventType.chunk) {
            const chunk = asJsonMap<AgentMessageChunk>(event.data);
            await agentMessageHandler.onChunk(eventSessionId(chunk, session.sessionId), chunk);
          } else if (event.agentEventType === AgentEventType.functionCall) {
            await this.handleFunctionCallEvent(session, event, agentMessageHandler);
          }
        }
        await agentMessageHandler.onDone();
      } catch (error) {
        abortController.abort();
        try {
          await agentMessageHandler.onError(ensureError(error));
        } catch {
          // onError is the final application callback. Avoid an unhandled
          // rejection if the application's own error handler fails.
        }
      }
    })();
  }

  chatSimple(options: { sessionId: string; userTask: UserTask }) {
    return this.client.withAppAuthRetry((token) =>
      this.client.agentKit.chatSimple(token, options.sessionId, options.userTask)
    );
  }

  history(options: AgentHistoryOptions) {
    return this.client.withAppAuthRetry((token) =>
      this.client.agentKit.history(token, options.sessionId, options)
    );
  }

  historySummary(options: AgentHistorySummaryOptions): Promise<HistoryTurnSummary[]> {
    return this.client.withAppAuthRetry((token) =>
      this.client.agentKit.historySummary(token, options.sessionId, options)
    );
  }

  historyProcess(options: AgentHistoryProcessOptions): Promise<AgentMessage[]> {
    return this.client.withAppAuthRetry((token) =>
      this.client.agentKit.historyProcess(token, options.sessionId, options.originalTaskId, options)
    );
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
    let payload: Record<string, unknown>;
    let payloadSessionId = session.sessionId;
    try {
      payload = asJsonMap<Record<string, unknown>>(event.data);
      payloadSessionId = typeof payload.sessionId === 'string' && payload.sessionId.length > 0
        ? payload.sessionId
        : session.sessionId;
      const functionCallJson = payload.functionCall;
      if (!functionCallJson || typeof functionCallJson !== 'object' || Array.isArray(functionCallJson)) {
        throw new TypeError('Invalid functionCall event payload: missing functionCall object.');
      }
    } catch (error) {
      throw new FunctionCallLifecycleError(
        'function_call_parse_failed',
        { sessionId: payloadSessionId },
        error
      );
    }
    const functionCall = payload.functionCall as FunctionCall;
    const context = {
      sessionId: payloadSessionId,
      callId: typeof functionCall.id === 'string' ? functionCall.id : undefined,
      functionName: typeof functionCall.name === 'string' ? functionCall.name : undefined
    };
    if (this.isStreamFunctionCall(payload, functionCall)) {
      const pendingCallbacks: Array<Promise<void>> = [];
      const callbackErrors: unknown[] = [];
      const queueStreamCallback = (eventToolReturn: EventToolReturn): void => {
        pendingCallbacks.push(
          this.streamCallback({ sessionId: payloadSessionId, eventToolReturn }).then(
            () => undefined,
            (error) => {
              callbackErrors.push(error);
            }
          )
        );
      };
      let terminalCallbackScheduled = false;
      let handlerError: FunctionCallLifecycleError | undefined;
      try {
        await agentMessageHandler.onStreamFunctionCall(payloadSessionId, functionCall, (eventToolReturn) => {
          if (eventToolReturn.event === EventType.DONE || eventToolReturn.event === EventType.ERROR) {
            terminalCallbackScheduled = true;
          }
          queueStreamCallback(eventToolReturn);
        });
      } catch (error) {
        handlerError = new FunctionCallLifecycleError(
          'function_call_handler_failed',
          { ...context, callbackMode: 'streamCallback' },
          error
        );
        if (!terminalCallbackScheduled) {
          queueStreamCallback({
            event: EventType.ERROR,
            toolReturn: new ToolReturn(functionCall.id, this.functionCallErrorResult(handlerError))
          });
        }
      }
      await Promise.all(pendingCallbacks);
      if (callbackErrors.length > 0) {
        throw new FunctionCallLifecycleError(
          'function_call_callback_failed',
          { ...context, callbackMode: 'streamCallback' },
          callbackErrors[0]
        );
      }
      if (handlerError) {
        throw handlerError;
      }
      return;
    }

    let toolReturn: ToolReturn;
    try {
      toolReturn = await agentMessageHandler.onFunctionCall(payloadSessionId, functionCall);
    } catch (error) {
      const handlerError = new FunctionCallLifecycleError(
        'function_call_handler_failed',
        { ...context, callbackMode: 'callback' },
        error
      );
      try {
        await this.callback({
          sessionId: payloadSessionId,
          toolReturn: new ToolReturn(functionCall.id, this.functionCallErrorResult(handlerError))
        });
      } catch (callbackError) {
        throw new FunctionCallLifecycleError(
          'function_call_callback_failed',
          { ...context, callbackMode: 'callback' },
          callbackError
        );
      }
      throw handlerError;
    }
    try {
      await this.callback({ sessionId: payloadSessionId, toolReturn });
    } catch (error) {
      throw new FunctionCallLifecycleError(
        'function_call_callback_failed',
        { ...context, callbackMode: 'callback' },
        error
      );
    }
  }

  private functionCallErrorResult(error: FunctionCallLifecycleError): Record<string, unknown> {
    const causeMessage = error.cause instanceof Error ? error.cause.message : String(error.cause);
    return {
      error: 'FunctionCallHandlerError',
      stage: error.stage,
      message: causeMessage
    };
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

/**
 * Entry point for the task-oriented ModelKit API (chat / embedding / asr / tts).
 */
export class ModelKitModule {
  constructor(private readonly client: AgentOSSDK) {}

  get chat() {
    return this.client.modelKit.chat;
  }

  get embedding() {
    return this.client.modelKit.embedding;
  }

  get asr() {
    return this.client.modelKit.asr;
  }

  get tts() {
    return this.client.modelKit.tts;
  }

  listModels() {
    return this.client.modelKit.listModels();
  }

  listModelsByTask(task: ModelTask) {
    return this.client.modelKit.listModelsByTask(task);
  }
}

export class ToolKitModule {
  constructor(private readonly client: AgentOSSDK) {}

  listTool(all?: string) {
    return this.client.withAppAuthRetry((token) => this.client.toolKit.listTool(all, token));
  }

  loadTool(toolId: string) {
    return this.client.withAppAuthRetry((token) => this.client.toolKit.loadTool(toolId, token));
  }

  callTool(options: ToolKitCallOptions): Promise<ToolReturn> {
    return this.client.withAppAuthRetry((token) =>
      this.client.toolKit.callTool(token, options.toolId, options.functionCall)
    );
  }

  streamCallTool(options: ToolKitStreamCallOptions): AsyncGenerator<ToolKitStreamEvent> {
    const client = this.client;
    return (async function* (): AsyncGenerator<ToolKitStreamEvent> {
      const stream = await client.withAppAuthRetry((token) =>
        client.toolKit.openStreamCallTool(
          token,
          options.toolId,
          options.functionCall,
          { signal: options.signal }
        )
      );
      try {
        yield* stream;
      } finally {
        await stream.return(undefined);
      }
    })();
  }

  /** @deprecated Not exposed by the AgentOS API gateway ToolKit API. */
  subscribeToolEvents(options: { daemonApiKey: string; snapshot?: boolean; signal?: AbortSignal }) {
    return this.client.toolKit.subscribeToolEvents(options.daemonApiKey, options.snapshot ?? true, options.signal);
  }
}

export class AuthKitModule {
  constructor(private readonly client: AgentOSSDK) {}

  authorize(request?: AuthorizeRequest): Promise<AuthorizeResponse> {
    return this.client.withAppAuthRetry((token) => this.client.authKit.authorize(token, request));
  }

  getStatus(requestId: string): Promise<AuthorizeResponse> {
    return this.client.withAppAuthRetry((token) => this.client.authKit.getStatus(token, requestId));
  }

  exchangeToken(request: ExchangeTokenRequest): Promise<ExchangeTokenResponse> {
    return this.client.withAppAuthRetry((token) => this.client.authKit.exchangeToken(token, request));
  }

  getUserInfo(accessToken: string): Promise<AuthKitUserInfo> {
    return this.client.authKit.getUserInfo(accessToken);
  }

  revoke(request?: RevokeRequest): Promise<{ status: string }> {
    return this.client.withAppAuthRetry((token) => this.client.authKit.revoke(token, request));
  }
}

export class DiscoveryKitModule {
  constructor(private readonly client: AgentOSSDK) {}

  getPeers(): Promise<PeerDevice[]> {
    return this.client.withAppAuthRetry((token) => this.client.discoveryKit.getPeers(token));
  }

  streamPeers(signal?: AbortSignal): Promise<AsyncGenerator<PeerDeviceEvent>> {
    return this.client.withAppAuthRetry((token) => this.client.discoveryKit.streamPeers(token, signal));
  }

  getSelf(): Promise<SelfInfo> {
    return this.client.withAppAuthRetry((token) => this.client.discoveryKit.getSelf(token));
  }

  register(request?: DiscoveryRegisterRequest): Promise<DiscoveryRegisterResponse> {
    return this.client.withAppAuthRetry((token) => this.client.discoveryKit.register(token, request));
  }

  unregister(): Promise<DiscoveryUnregisterResponse> {
    return this.client.withAppAuthRetry((token) => this.client.discoveryKit.unregister(token));
  }
}

export class HarnessKitModule {
  constructor(private readonly client: AgentOSSDK) {}

  health(): Promise<{ status: string }> {
    return this.client.withAppAuthRetry((token) => this.client.harnessKit.health(token));
  }

  getRuntime(): Promise<HarnessKitRuntimeInfo> {
    return this.client.withAppAuthRetry((token) => this.client.harnessKit.getRuntime(token));
  }

  switchEngine(engine: HarnessKitEngineId): Promise<HarnessKitEngineSwitchResult> {
    return this.client.withAppAuthRetry((token) => this.client.harnessKit.switchEngine(token, engine));
  }

  listThreads(): Promise<HarnessKitThreadSnapshot[]> {
    return this.client.withAppAuthRetry((token) => this.client.harnessKit.listThreads(token));
  }

  getThread(threadId: string): Promise<HarnessKitThreadSnapshot> {
    return this.client.withAppAuthRetry((token) => this.client.harnessKit.getThread(token, threadId));
  }

  renameThread(threadId: string, title: string): Promise<HarnessKitThreadRenameResult> {
    return this.client.withAppAuthRetry((token) => this.client.harnessKit.renameThread(token, threadId, title));
  }

  deleteThread(threadId: string): Promise<HarnessKitThreadDeleteResult> {
    return this.client.withAppAuthRetry((token) => this.client.harnessKit.deleteThread(token, threadId));
  }

  startRun(threadId: string, request: HarnessKitRunRequest): Promise<HarnessKitRunAccepted> {
    return this.client.withAppAuthRetry((token) => this.client.harnessKit.startRun(token, threadId, request));
  }

  submitCommand(threadId: string, command: HarnessKitCommand): Promise<HarnessKitCommandReceipt> {
    return this.client.withAppAuthRetry((token) => this.client.harnessKit.submitCommand(token, threadId, command));
  }

  events(
    threadId: string,
    options: HarnessKitEventsOptions = {}
  ): Promise<AsyncGenerator<HarnessKitEvent>> {
    return this.client.withAppAuthRetry((token) => this.client.harnessKit.events(token, threadId, options));
  }

  getRunResult(runId: string): Promise<HarnessKitRunResult> {
    return this.client.withAppAuthRetry((token) => this.client.harnessKit.getRunResult(token, runId));
  }

  getOperationalSnapshot(): Promise<HarnessKitOperationalSnapshot> {
    return this.client.withAppAuthRetry((token) => this.client.harnessKit.getOperationalSnapshot(token));
  }

  request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    return this.client.withAppAuthRetry((token) => this.client.harnessKit.request<T>(token, path, options));
  }

  requestStream(path: string, options: RequestOptions = {}): Promise<Response> {
    return this.client.withAppAuthRetry((token) => this.client.harnessKit.requestStream(token, path, options));
  }
}

export class TransferKitModule {
  constructor(private readonly client: AgentOSSDK) {}

  send(request: TransferSendRequest): Promise<TransferSession> {
    return this.client.withAppAuthRetry((token) => this.client.transferKit.send(token, request));
  }

  listTransfers(): Promise<TransferSession[]> {
    return this.client.withAppAuthRetry((token) => this.client.transferKit.listTransfers(token));
  }

  getStatus(transferId: string): Promise<TransferSession> {
    return this.client.withAppAuthRetry((token) => this.client.transferKit.getStatus(token, transferId));
  }

  streamProgress(transferId: string, signal?: AbortSignal): Promise<AsyncGenerator<TransferSession>> {
    return this.client.withAppAuthRetry((token) => this.client.transferKit.streamProgress(token, transferId, signal));
  }

  cancel(transferId: string): Promise<{ status: string }> {
    return this.client.withAppAuthRetry((token) => this.client.transferKit.cancel(token, transferId));
  }

  respond(transferId: string, request: TransferRespondRequest): Promise<{ status: string }> {
    return this.client.withAppAuthRetry((token) => this.client.transferKit.respond(token, transferId, request));
  }

  receiveStream(signal?: AbortSignal): Promise<AsyncGenerator<IncomingTransferEvent>> {
    return this.client.withAppAuthRetry((token) => this.client.transferKit.receiveStream(token, signal));
  }

  setPolicy(request: SetPolicyRequest): Promise<PolicyResponse> {
    return this.client.withAppAuthRetry((token) => this.client.transferKit.setPolicy(token, request));
  }

  getPolicy(): Promise<PolicyResponse> {
    return this.client.withAppAuthRetry((token) => this.client.transferKit.getPolicy(token));
  }

  getHistory(query?: HistoryQuery): Promise<TransferHistoryRecord[]> {
    return this.client.withAppAuthRetry((token) => this.client.transferKit.getHistory(token, query));
  }

  deleteHistory(recordId: string, query?: HistoryQuery): Promise<{ status: string }> {
    return this.client.withAppAuthRetry((token) => this.client.transferKit.deleteHistory(token, recordId, query));
  }

  clearHistory(query?: HistoryQuery): Promise<{ status: string }> {
    return this.client.withAppAuthRetry((token) => this.client.transferKit.clearHistory(token, query));
  }
}

function shouldAutoUseBridgeTransport(options: AgentOSSDKOptions): boolean {
  return options.apiClient === undefined && options.baseUrl === undefined && options.fetch === undefined;
}

function eventSessionId(event: { sessionId?: unknown }, rootSessionId: string): string {
  return typeof event.sessionId === 'string' && event.sessionId.length > 0
    ? event.sessionId
    : rootSessionId;
}

function bundleKey(bundle: AppBundle): AppAuthCacheKey {
  return {
    bundleId: bundle.bundleId,
    appGroupId: bundle.appGroupId
  };
}

function cloneAppBundle(bundle: AppBundle): AppBundle {
  return {
    bundleId: bundle.bundleId,
    appGroupId: bundle.appGroupId,
    opentoolServers: bundle.opentoolServers?.map((server) => ({ ...server }))
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
