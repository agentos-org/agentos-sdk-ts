# AgentOS SDK for TypeScript

A lightweight TypeScript SDK for the AgentOS API, supporting Root, AgentKit, AppKit,
CronKit, ModelKit, and ToolKit discovery endpoints. Use the unified
`AgentOSSDK` to avoid managing tokens manually.

## Features

- Root API: version check
- AgentKit API: session init, chat stream/simple, history, stop/clear, callbacks
- AppKit API: bundle registration and SSE subscription
- AuthKit API: OAuth-like authorization flow, token exchange, user info, grant management
- CronKit API: cron task CRUD, run history, and scheduler control
- DiscoveryKit API: nearby device discovery, self info, device register/unregister, SSE peer events
- ModelKit API: task-oriented model listing and OpenAI-compatible chat /
  embedding / asr / tts clients under `/modelkit/*`
- ToolKit API: tool listing, tool definition loading, and tool lifecycle event subscription
- TransferKit API: device-to-device file transfer (send/receive/progress stream/cancel/respond), receive policy, transfer history

## Getting Started

Install the package:

```bash
npm install agentos-sdk-ts
```

Use a single public import:

```ts
import { AgentOSSDK } from 'agentos-sdk-ts';
```

The package root is browser-safe. Node-only OpenTool exports live under
explicit subpaths.

```ts
import {
  AgentOSSDK,
  EventType
} from 'agentos-sdk-ts';

import {
  FunctionCall,
  OpenTool,
  OpenToolJsonLoader,
  SchemaType,
  ToolReturn
} from 'agentos-sdk-ts/opentool';
```

## Usage

```ts
import {
  AgentOSEventHandler,
  AgentOSSDK,
  isOpenToolProvisionFailedEvent,
  isOpenToolProvisionSucceededEvent
} from 'agentos-sdk-ts';

async function main() {
  const sdk = new AgentOSSDK();

  const version = await sdk.agentos.getVersion();
  console.log('AgentOS version:', version.version);

  const registration = await sdk.agentos.registerBundle({
    bundleId: 'com.demo.app',
    appGroupId: 'com.demo.group',
    opentoolServers: [
      { ref: 'websearch', name: 'opentool-server-websearch' }
    ]
  });
  console.log('App token:', registration.token);
  console.log('OpenTool registration:', registration.opentoolServers);

  await sdk.agentos.subscribe(new DemoEventHandler());
}

class DemoEventHandler extends AgentOSEventHandler {
  async onWelcome(welcome) {
    console.log('Welcome bundleId:', welcome.bundleId);
  }

  async onAppEvent(event) {
    if (isOpenToolProvisionSucceededEvent(event)) {
      console.log(`OpenTool ${event.data.ref} is ready:`, event.data.id);
    } else if (isOpenToolProvisionFailedEvent(event)) {
      console.error(`OpenTool ${event.data.ref} failed:`, event.data.error);
    }
  }

  async onDone() {
    console.log('SSE subscription ended');
  }

  async onError(error) {
    console.log('Subscribe error:', error);
  }
}

await main();
```

### Configure Gateway Address

```ts
import { AgentOSSDK } from 'agentos-sdk-ts';

const sdk = new AgentOSSDK({ baseUrl: 'http://localhost:8888' });
```

### Configure Long-Running Stream Timeouts

```ts
import { AgentOSSDK } from 'agentos-sdk-ts';

const sdk = new AgentOSSDK({
  baseUrl: 'http://localhost:8888',
  connectTimeout: 20_000,
  receiveTimeout: 0
});
```

### Use ModelKit Chat

`agentos-sdk-ts` accepts OpenAI-compatible chat payloads directly.

```ts
import { AgentOSSDK, ModelTask } from 'agentos-sdk-ts';

const sdk = new AgentOSSDK({ baseUrl: 'http://localhost:8888' });

const models = await sdk.modelkit.listModels();
console.log(models.map((model) => model.alias));

// Optionally filter by task (chat / embedding / asr / tts).
const chatModels = await sdk.modelkit.listModelsByTask(ModelTask.chat);

const completion = await sdk.modelkit.chat.create({
  model: 'qwen3-1.7b',
  messages: [
    {
      role: 'user',
      content: 'Hello.'
    }
  ]
});

console.log(completion.choices?.[0]?.message?.content);
```

### Use AgentOS Mobile WebView Bridge

Web apps opened inside AgentOS Mobile can keep using the same `AgentOSSDK`
calls. When constructed with default options, the SDK detects
`window.agentos.bridge.request` and routes requests through the mobile bridge
transport. Normal browsers, or callers that explicitly pass `baseUrl`, `fetch`,
or `apiClient`, keep using the existing HTTP gateway configuration.

```ts
import { AgentOSSDK } from 'agentos-sdk-ts';

const sdk = new AgentOSSDK();

const models = await sdk.modelkit.listModels();
console.log(models);
```

Note: consistent SDK calls do not mean the mobile bridge covers every HTTP
gateway route yet. The V1 bridge is intended for context, model list, AgentKit
session/chat, stop, and clear routes. Unsupported routes should return a
structured native bridge error such as
`{ code: 'route_not_supported', message: '...' }`; the SDK surfaces it through
the existing `ApiError` path.

- `isAgentOSBridgeAvailable()` only checks that `window.agentos.bridge.request`
  exists. It does not prove the current origin is authorized.
- `getAgentOSBridgeContext()` is the authorization probe. AgentOS Mobile should
  return a clear bridge error when the current web app is not registered or not
  allowed to use agent mode.
- To force a specific environment, keep passing explicit
  `new AgentOSSDK({ baseUrl, fetch })` options.
- `appId` and `origin` in bridge requests are debug hints from JavaScript. Native
  code must authorize with its trusted mini app definition and current main
  frame URL.
- Streaming bridge events are converted into SSE `Response` bodies, so existing
  AgentKit and OpenAI-compatible ModelKit stream parsers can keep using
  `parseSse()`.

## API Reference

### AgentOSSDK

Constructor:

```ts
new AgentOSSDK({
  baseUrl?: string;
  connectTimeout?: number;
  receiveTimeout?: number;
  apiClient?: ApiClient;
  fetch?: typeof fetch;
})
```

Use `baseUrl`, `connectTimeout`, and `receiveTimeout` for public configuration.
`apiClient` and `fetch` can be injected for tests, SSR, or custom runtimes.

| Property | Type | Description |
| --- | --- | --- |
| `agentos` | `AgentOSModule` | Root/AppKit endpoints with internal token handling. |
| `agentkit` | `AgentKitModule` | AgentKit endpoints with internal token handling. |
| `authkit` | `AuthKitModule` | AuthKit OAuth authorization endpoints with internal token handling. |
| `cronkit` | `CronKitModule` | CronKit task management endpoints with internal token handling. |
| `discoverykit` | `DiscoveryKitModule` | DiscoveryKit nearby device discovery with internal token handling. |
| `modelkit` | `ModelKitModule` | ModelKit task-oriented model listing and chat / embedding / asr / tts clients. |
| `toolkit` | `ToolKitModule` | ToolKit discovery endpoints and tool lifecycle event subscription. |
| `transferkit` | `TransferKitModule` | TransferKit file transfer endpoints with internal token handling. |
| `dispose()` | `Promise<void>` | Releases SDK resources and cancels active AppKit subscription. |

### AgentOSModule (`sdk.agentos`)

| Method | Parameters | Description |
| --- | --- | --- |
| `getVersion()` | none | Fetches AgentOS service version. |
| `getRoot()` | none | Fetches AgentOS gateway metadata. |
| `getReady()` | none | Fetches AgentOS readiness status. |
| `registerBundle(bundle)` | `AppBundle` | Registers an app bundle with optional `opentoolServers`, stores the bearer token internally, and returns token plus synchronous OpenTool status. |
| `subscribe(handler, options?)` | `AgentOSEventHandler`, `AgentOSSubscribeOptions` | Subscribes to AppKit SSE events using a handler implementation. |
| `connectionEvents` | `Subscription<AgentOSSubscribeConnectionEvent>` | Emits AppKit SSE connection status changes. |
| `connectionStatus` | `AgentOSSubscribeConnectionStatus \| undefined` | Returns the latest known AppKit SSE connection status. |

### CronKitModule (`sdk.cronkit`)

| Method | Parameters | Description |
| --- | --- | --- |
| `getTask({ cronId })` | `cronId` | Fetches a cron task by ID. |
| `listTasks({ enabled, offset, limit }?)` | `enabled`, `offset`, `limit` | Lists visible cron tasks for the current app group. |
| `createTask({ request })` | `request` | Creates a cron task. |
| `updateTask({ request })` | `request` | Updates a cron task owned by the current app. |
| `deleteTask({ cronId })` | `cronId` | Deletes a cron task owned by the current app. |
| `enableTask({ cronId })` | `cronId` | Explicitly enables a cron task and returns its updated status. |
| `disableTask({ cronId })` | `cronId` | Explicitly disables a cron task and returns its updated status. |
| `runTaskNow({ cronId, scheduledAt? })` | `cronId`, `scheduledAt` | Triggers an immediate run for a cron task. |
| `getRun({ runId })` | `runId` | Fetches one cron run record by ID. |
| `listRuns({ cronId, after, before, offset, limit }?)` | `cronId`, `after`, `before`, `offset`, `limit` | Lists cron task runs visible to the current app group. |
| `listRunMessages({ runId, offset, limit })` | `runId`, `offset`, `limit` | Lists persisted `AgentMessage` records for a cron run. |
| `deleteRun({ runId })` | `runId` | Deletes one cron run and its persisted messages. |

`CronTaskCreateRequest.spec` and `CronTask.spec` use the CronKit schema:

```ts
{
  systemPrompt: 'You are a scheduled agent.',
  content: [
    { type: 'text', message: 'Generate the daily summary.' }
  ],
  modelId: 'gpt-4o'
}
```

- `modelId` is an optional request field used by CronKit to resolve the backing model.
- `modelName` is an optional response field returned in `CronTask.spec` after resolution.

### AgentKitModule (`sdk.agentkit`)

| Method | Parameters | Description |
| --- | --- | --- |
| `initSession({ capability }?)` | `capability` | Initializes a SessionAgent session. Nested agents are declared inline with `capability.subAgentList`. |
| `initSimple({ simpleCapability })` | `simpleCapability` | Initializes a SimpleAgent session. |
| `chat(session, userTask, handler)` | `session`, `userTask`, `handler` | Starts a SessionAgent task and delivers SSE events to the handler callbacks. |
| `chatSimple({ sessionId, userTask })` | `sessionId`, `userTask` | Executes a SimpleAgent request and returns a one-time response. |
| `history({ sessionId, page?, pageSize? })` | `sessionId`, `page`, `pageSize` | Retrieves message history for a session. `page` and `pageSize` must be supplied together as positive integers; omit both to retrieve the complete persisted history. |
| `historySummary({ sessionId, page?, pageSize? })` | `sessionId`, `page`, `pageSize` | Loads lightweight turn summaries first. Defaults to `page=1`, `pageSize=30`; `pageSize` is limited to 200. |
| `historyProcess({ sessionId, originalTaskId, page?, pageSize? })` | `sessionId`, `originalTaskId`, `page`, `pageSize` | Lazily loads process messages for one turn by `originalTaskId`. Defaults to `page=1`, `pageSize=50`; `pageSize` is limited to 200. |
| `stop({ sessionId, taskId? })` | `sessionId`, `taskId` | Stops a session or task. |
| `clear({ sessionId })` | `sessionId` | Clears session data. |
| `callback({ sessionId, toolReturn })` | `sessionId`, `toolReturn` | Sends tool callback results. |
| `streamCallback({ sessionId, eventToolReturn })` | `sessionId`, `eventToolReturn` | Sends streaming tool callback results. |

For AgentKit SSE events, the event's child `sessionId` is forwarded to message,
chunk, function-call, and callback handlers. If it is absent or empty, the root
chat session ID is used as a fallback.

### ModelKitModule (`sdk.modelkit`)

| Method/Property | Type | Description |
| --- | --- | --- |
| `listModels()` | `Promise<ModelInfo[]>` | Fetches available models from `/modelkit/models`. |
| `listModelsByTask(task)` | `Promise<ModelInfo[]>` | Filters models by `ModelTask` (`chat` / `embedding` / `asr` / `tts`). |
| `chat` | `ModelKitChatClient` | OpenAI-compatible chat client using `{baseUrl}/modelkit/chat`. |
| `embedding` | `ModelKitEmbeddingClient` | OpenAI-compatible embeddings client under `/modelkit/embedding`. |
| `asr` | `ModelKitAsrClient` | Speech-to-text client under `/modelkit/asr`. |
| `tts` | `ModelKitTtsClient` | Text-to-speech client under `/modelkit/tts`. |

### ToolKitModule (`sdk.toolkit`)

| Method | Parameters | Description |
| --- | --- | --- |
| `listTool(all?)` | `all` | Lists available tools from `/toolkit/list`, including daemon 0.5 server identity and materialization metadata. |
| `loadTool(toolId)` | `toolId` | Loads an `OpenTool` definition from `/toolkit/{toolId}/load` and returns an `OpenTool` instance. |
| `callTool({ toolId, functionCall })` | `toolId`, `functionCall` | Calls a tool through the AgentOS gateway and returns `ToolReturn`. AppKit token refresh and retry are automatic. |
| `streamCallTool({ toolId, functionCall, signal? })` | `toolId`, `functionCall`, `signal` | Streams typed `ToolKitStreamEvent` values through the AgentOS gateway and supports cancellation. |
| `subscribeToolEvents({ daemonApiKey, snapshot, signal })` | `daemonApiKey`, `snapshot`, `signal` | Deprecated daemon lifecycle API; this endpoint is not exposed by the AgentOS API gateway. |

`listTool()` returns daemon 0.5-compatible `ToolDto` values. The optional
`server` identity uses `namespace`, `name`, and `version`.
`materializedArtifactDigest` identifies installed content when available, and
`contentState` reports whether it is `unknown`, `current`, `updatePending`, or
`broken`.

```ts
const result = await sdk.toolkit.callTool({
  toolId: 'websearch',
  functionCall: {
    id: crypto.randomUUID(),
    name: 'websearch',
    arguments: { query: 'OpenMAIC', max_results: 5, summary_only: false },
  },
});

console.log(result.result);
```

### AuthKitModule (`sdk.authkit`)

AuthKit provides OAuth-like authorization for third-party apps. The app initiates
an authorization request; AgentOS Desktop shows a user confirmation dialog; once
approved, the app exchanges the authCode for an accessToken to retrieve user info.

**Authorization Status Enum (`AuthRequestStatus`):**

| Value | Description |
| --- | --- |
| `pending` | Awaiting user confirmation |
| `granted` | User approved |
| `denied` | User denied |
| `timeout` | Request timed out (3 minutes) |

**Token Validation Result Enum (`TokenValidationResult`):**

| Value | Description |
| --- | --- |
| `valid` | Token is valid and AgentOS is logged in |
| `invalidToken` | Token not recognized |
| `authExpired` | AgentOS user logged out |
| `tokenRevoked` | Authorization revoked |

| Method | Parameters | Description |
| --- | --- | --- |
| `authorize(request?)` | `{ scopes?: string[]; appName?: string }` | Initiates an authorization request. Already-authorized apps get `granted` + `authCode` immediately; first-time returns `pending` (HTTP 202). |
| `getStatus(requestId)` | `requestId` | Polls authorization request status. |
| `exchangeToken(request)` | `{ authCode: string }` | Exchanges authCode for accessToken and userInfo. |
| `getUserInfo(accessToken)` | `accessToken` | Fetches current user info with an accessToken. |
| `revoke(request?)` | `{ bundleId?: string }` | Revokes authorization for a given bundleId. |
```ts
const authResponse = await sdk.authkit.authorize({
  scopes: ['profile'],
  appName: 'My Third-Party App'
});

if (authResponse.status === 'granted') {
  const tokenInfo = await sdk.authkit.exchangeToken({
    authCode: authResponse.authCode!
  });
  console.log('Access Token:', tokenInfo.accessToken);
  console.log('User:', tokenInfo.userInfo.name);
}
```

**AuthKitGrant structure:**

```ts
interface AuthKitGrant {
  bundleId: string;
  appName?: string;
  userId?: string;
  scopes: string[];
  grantedAt: string; // ISO 8601
}
```

### DiscoveryKitModule (`sdk.discoverykit`)

DiscoveryKit discovers nearby AgentOS devices, supporting device-level and
app-level scans.

**Peer Device Event Type Enum (`PeerDeviceEventType`):**

| Value | Description |
| --- | --- |
| `joined` | New device came online |
| `left` | Device went offline |
| `updated` | Device info updated |

**File Receive Policy Enum (`FileReceivePolicy`):**

| Value | Description |
| --- | --- |
| `autoAccept` | Automatically accept incoming files |
| `requireConfirm` | Require user confirmation |

| Method | Parameters | Description |
| --- | --- | --- |
| `getPeers()` | none | Lists nearby peer devices. App-level scans only return devices with the same bundleId registered. |
| `streamPeers(signal?)` | `AbortSignal` | SSE subscription for device change events (`peer.joined` / `peer.left` / `peer.updated`). |
| `getSelf()` | none | Gets self device info and nearbyTransfer status. |
| `register(request?)` | `{ receivePolicy?: FileReceivePolicy }` | Registers the current app into discovery broadcast. |
| `unregister()` | none | Unregisters the current app from discovery broadcast. |

```ts
await sdk.discoverykit.register({ receivePolicy: 'autoAccept' });

const peers = await sdk.discoverykit.getPeers();
console.log('Nearby devices:', peers.length);

const self = await sdk.discoverykit.getSelf();
console.log('Transfer enabled:', self.nearbyTransferEnabled);
```

**PeerDevice structure:**

```ts
interface PeerDevice {
  deviceId: string;
  name: string;
  avatarUrl?: string;
  deviceName: string;
  deviceType: string;
  host: string;
  port: number;
  online: boolean;
  apps: PeerApp[];
}
```

**PeerApp structure:**

```ts
interface PeerApp {
  bundleId?: string;
  userId?: string;
  username?: string;
  appName?: string;
  avatarUrl?: string;
}
```

### TransferKitModule (`sdk.transferkit`)

TransferKit provides file transfer between AgentOS devices, including send,
receive, progress tracking, cancellation, and transfer history management.

**Transfer State Enum (`TransferState`):**

| Value | Description |
| --- | --- |
| `pending` | Waiting to start |
| `preparing` | Preparing |
| `transferring` | Transferring |
| `completed` | Transfer completed |
| `failed` | Transfer failed |
| `cancelled` | Cancelled |

**Transfer Direction Enum (`TransferDirection`):**

| Value | Description |
| --- | --- |
| `send` | Sending |
| `receive` | Receiving |

**File Transfer State Enum (`FileTransferState`):**

| Value | Description |
| --- | --- |
| `pending` | Waiting |
| `transferring` | Transferring |
| `completed` | Completed |
| `failed` | Failed |

| Method | Parameters | Description |
| --- | --- | --- |
| `send(request)` | `TransferSendRequest` | Sends files to a target device, returns `TransferSession`. |
| `listTransfers()` | none | Lists all transfer sessions for the current app. |
| `getStatus(transferId)` | `transferId` | Gets a transfer session status. |
| `streamProgress(transferId, signal?)` | `transferId`, `AbortSignal` | SSE subscription for transfer progress; closes automatically on completion/failure. |
| `cancel(transferId)` | `transferId` | Cancels an in-progress transfer. |
| `respond(transferId, request)` | `transferId`, `{ accept: boolean }` | Accepts or declines an incoming transfer request. |
| `receiveStream(signal?)` | `AbortSignal` | SSE subscription for incoming file transfer events (`file.received`). |
| `setPolicy(request)` | `{ policy: string }` | Sets file receive policy (`autoAccept` / `requireConfirm`). |
| `getPolicy()` | none | Gets current file receive policy. |
| `getHistory(query?)` | `{ deviceId?: string; userId?: string }` | Gets transfer history records (newest first). |
| `deleteHistory(recordId, query?)` | `recordId`, `HistoryQuery` | Deletes a single transfer history record. |
| `clearHistory(query?)` | `HistoryQuery` | Clears all transfer history. |

```ts
const peers = await sdk.discoverykit.getPeers();
const target = peers[0];

const session = await sdk.transferkit.send({
  targetDeviceId: target.deviceId,
  files: [
    { fileName: 'doc.pdf', size: 1024000, filePath: '/data/doc.pdf' }
  ]
});
console.log('Transfer ID:', session.transferId);
console.log('State:', session.state);

// Stream progress
const progress = await sdk.transferkit.streamProgress(session.transferId);
for await (const update of progress) {
  console.log(`Progress: ${(update.progress * 100).toFixed(1)}%`);
  if (update.state === 'completed' || update.state === 'failed') break;
}
```

**TransferSession structure:**

```ts
interface TransferSession {
  transferId: string;
  state: TransferState;
  progress: number;      // 0.0 ~ 1.0
  targetDeviceId: string;
  bundleId: string;
  userId?: string;
  targetBundleId?: string;
  files: TransferFileInfo[];
  errorMessage?: string;
}
```

**IncomingTransferEvent structure:**

```ts
interface IncomingTransferEvent {
  transferId: string;
  fromDeviceId: string;
  fromName: string;
  sourceBundleId: string;
  targetBundleId?: string;
  autoAccepted: boolean;
  files: ReceivedFileInfo[];
}
```

**TransferHistoryRecord structure:**

```ts
interface TransferHistoryRecord {
  id: string;
  direction: TransferDirection; // 'send' | 'receive'
  peerDeviceId: string;
  peerName: string;
  peerAvatarUrl?: string;
  files: TransferHistoryFile[];
  totalSize: number;
  state: TransferState;
  timestamp: string; // ISO 8601
  savedDir?: string;
}
```

### OpenTool Exports

The package root stays browser-safe. Import full `opentool-ts` re-exports from
explicit Node-only subpaths:

- `agentos-sdk-ts/opentool`
- `agentos-sdk-ts/third_party`

These subpaths expose OpenTool protocol models and helpers only. Daemon
management is outside the OpenTool language SDK; use the AgentOS ToolKit
gateway APIs for tool listing, loading, and calls.

### AgentOSEventHandler

| Method | Parameters | Description |
| --- | --- | --- |
| `onWelcome(welcome)` | `welcome` | Receives `welcome` events. |
| `onAppEvent(event)` | `AppEvent` | Receives asynchronous `toolkit.provision.succeeded` and `toolkit.provision.failed` notifications. |
| `onDone()` | none | Called when the SSE stream ends. |
| `onError(error)` | `error` | Called when the SSE stream errors. |

### Subscription Lifecycle

```ts
import { AgentOSSDK } from 'agentos-sdk-ts';

const sdk = new AgentOSSDK({ baseUrl: 'http://localhost:8888' });

await sdk.agentos.registerBundle({
  bundleId: 'com.demo.app',
  appGroupId: 'com.demo.group',
  opentoolServers: [
    { ref: 'websearch', name: 'opentool-server-websearch' }
  ]
});
await sdk.agentos.subscribe(myHandler); // app start

// app stop/dispose
await sdk.dispose();
```

Each OpenTool declaration has an app-stable `ref` and a daemon server `name`.
The register result status is `running`, `starting`, or `notFound`; only
`running` includes a callable tool `id`. A `starting` server continues in the
background. Its eventual success or failure arrives through `onAppEvent`.
Treat `toolkit.provision.succeeded` and its returned `id` as the point when the
tool becomes callable. Automatic token refresh re-registers the same OpenTool
declarations.

### AgentKit Schema Notes

- `UserTask` supports passthrough fields:
  - `extraSystemPrompt`
  - `llmConfig`
- `LLMConfig` supports:
  - `provider`, `adapter`, `headers`, and `providerOptions`
  - `contextWindowSize`
  - `supportsToolCall` (read/write)
  - `supportsReasoning` (read/write)
  - read compatibility for `supportsToolCalling` and `supportsDeepThinking`
- `Capability` supports:
  - `skills`: complete Agent Skills markdown documents
  - `subAgentList`: recursively nested inline agents; runtime session IDs are generated by the server
  - `llmConfigList`
  - `toolReturnPackMinLength`
  - `maxLlmRequests`: maximum LLM requests per tool-enabled task (server default: `64`)
  - `maxToolRounds`: maximum tool-call rounds per task (server default: `16`)
  - `maxToolCalls`: maximum total tool calls per task (server default: `64`)
  - `maxConsecutiveIdenticalToolRounds`: maximum consecutive rounds with identical tool calls (server default: `3`)
  - `maxTaskDurationSeconds`: maximum duration in seconds for a tool-enabled task (server default: `300`)

The five execution-limit fields are optional and passed through unchanged. The
SDK does not inject their server defaults or rewrite zero or negative values;
the server handles defaults and validation.

```ts
import type { Capability } from 'agentos-sdk-ts';

const capability: Capability = {
  systemPrompt: 'You are an assistant.',
  subAgentList: [{
    name: 'researcher',
    capability: { systemPrompt: 'You research supporting evidence.' }
  }],
  maxLlmRequests: 32,
  maxToolRounds: 8,
  maxToolCalls: 20,
  maxConsecutiveIdenticalToolRounds: 2,
  maxTaskDurationSeconds: 120
};

await sdk.agentkit.initSession({ capability });
```

- `AgentMessage.completions` supports `limits`:
  - `maxTokens`
  - `contextWindowSize`
- `AgentMessage.originalTaskId` identifies the root task. Older AgentOS servers may fall back to `taskId` when producing it.
- When `AgentMessage.type` is `taskStatus`, its `content` can be represented by `TaskStatus`, including `status`, optional `taskId`, and optional `description`.

### AgentMessageHandler (Tool Callback)

- Implement `onFunctionCall(...)` for non-stream tool calls. The SDK sends the returned value via `/agentkit/callback`.
- Implement `onStreamFunctionCall(...)` for stream tool calls. The SDK sends each event via `/agentkit/streamCallback`.

```ts
import {
  AgentMessageHandler,
  EventType
} from 'agentos-sdk-ts';

class MyHandler extends AgentMessageHandler {
  async onStreamFunctionCall(sessionId, functionCall, onToolReturn) {
    onToolReturn({
      event: EventType.DATA,
      toolReturn: {
        id: functionCall.id,
        result: { partial: '...' }
      }
    });

    onToolReturn({
      event: EventType.DONE,
      toolReturn: {
        id: functionCall.id,
        result: { ok: true }
      }
    });
  }

  async onMessage(sessionId, agentMessage) {}
  async onChunk(sessionId, agentMessageChunk) {}
  async onDone() {}
  async onError(error) {}
}
```

## Token Handling

- `agentos.registerBundle(...)` stores the bearer token internally.
- `agentkit`, `agentos`, `authkit`, `cronkit`, `discoverykit`, `toolkit`, and `transferkit` requests use the stored token automatically.
- When an app token expires, the SDK retries once after re-registering the bundle for the same `bundleId` and `appGroupId`.

## Notes

- Call `agentos.registerBundle(...)` before using token-protected APIs.
- `sdk.modelkit.chat.createStream(...)` yields parsed SSE JSON frames until `[DONE]`.
- `sdk.toolkit.subscribeToolEvents(...)` requires a daemon API key.
- External integrations should only import from `agentos-sdk-ts`.

## Development

```bash
npm run typecheck
npm test
```
