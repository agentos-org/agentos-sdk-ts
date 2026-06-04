# AgentOS SDK for TypeScript

A lightweight TypeScript SDK for the AgentOS API, supporting Root, AgentKit, AppKit,
CronKit, ModelKit, and ToolKit discovery endpoints. Use the unified
`AgentOSSDK` to avoid managing tokens manually.

## Features

- Root API: version check
- AgentKit API: agent CRUD, session init, chat stream/simple, history, stop/clear, callbacks
- AppKit API: bundle registration and SSE subscription
- CronKit API: cron task CRUD, run history, and scheduler control
- ModelKit API: task-oriented model listing and OpenAI-compatible chat /
  embedding / asr / tts clients under `/modelkit/*`
- ToolKit API: tool listing, tool definition loading, and tool lifecycle event subscription

## Getting Started

Install the package:

```bash
npm install agentos-sdk-ts
```

Use a single public import:

```ts
import { AgentOSSDK } from 'agentos-sdk-ts';
```

The package root is browser-safe. Node-only OpenTool and daemon exports now live
under explicit subpaths.

```ts
import {
  AgentOSSDK,
  EventType
} from 'agentos-sdk-ts';

import {
  DAEMON_DEFAULT_PREFIX,
  DaemonClient,
  FunctionCall,
  OpenTool,
  OpenToolJsonLoader,
  SchemaType,
  ToolReturn
} from 'agentos-sdk-ts/opentool';
```

## Usage

```ts
import { AgentOSEventHandler, AgentOSSDK } from 'agentos-sdk-ts';

async function main() {
  const sdk = new AgentOSSDK();

  const version = await sdk.agentos.getVersion();
  console.log('AgentOS version:', version.version);

  const registration = await sdk.agentos.registerBundle({
    bundleId: 'com.demo.app',
    appGroupId: 'com.demo.group'
  });
  console.log('App token:', registration.token);

  await sdk.agentos.subscribe(new DemoEventHandler());
}

class DemoEventHandler extends AgentOSEventHandler {
  async onWelcome(welcome) {
    console.log('Welcome bundleId:', welcome.bundleId);
  }

  async onCallApp(call) {
    console.log('CallApp bundleId:', call.bundleId);
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
| `cronkit` | `CronKitModule` | CronKit task management endpoints with internal token handling. |
| `modelkit` | `ModelKitModule` | ModelKit task-oriented model listing and chat / embedding / asr / tts clients. |
| `toolkit` | `ToolKitModule` | ToolKit discovery endpoints and tool lifecycle event subscription. |
| `dispose()` | `Promise<void>` | Releases SDK resources and cancels active AppKit subscription. |

### AgentOSModule (`sdk.agentos`)

| Method | Parameters | Description |
| --- | --- | --- |
| `getVersion()` | none | Fetches AgentOS service version. |
| `getRoot()` | none | Fetches AgentOS gateway metadata. |
| `getReady()` | none | Fetches AgentOS readiness status. |
| `registerBundle(bundle)` | `AppBundle` | Registers an app bundle, stores the bearer token internally, and returns token metadata. |
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
| `getAgent({ agentId })` | `agentId` | Retrieves an agent by `agentId`. |
| `createAgent({ agent })` | `agent` | Creates an agent with the provided payload. |
| `updateAgent({ agentId, agent })` | `agentId`, `agent` | Updates an agent by `agentId`. |
| `deleteAgent({ agentId })` | `agentId` | Deletes an agent by `agentId`. |
| `initSession({ agentId, capability }?)` | `agentId`, `capability` | Initializes a SessionAgent session. |
| `initSimple({ simpleCapability })` | `simpleCapability` | Initializes a SimpleAgent session. |
| `chat(session, userTask, handler)` | `session`, `userTask`, `handler` | Starts a SessionAgent task and delivers SSE events to the handler callbacks. |
| `chatSimple({ sessionId, userTask })` | `sessionId`, `userTask` | Executes a SimpleAgent request and returns a one-time response. |
| `history({ sessionId })` | `sessionId` | Retrieves message history for a session. |
| `stop({ sessionId, taskId? })` | `sessionId`, `taskId` | Stops a session or task. |
| `clear({ sessionId })` | `sessionId` | Clears session data. |
| `callback({ sessionId, toolReturn })` | `sessionId`, `toolReturn` | Sends tool callback results. |
| `streamCallback({ sessionId, eventToolReturn })` | `sessionId`, `eventToolReturn` | Sends streaming tool callback results. |

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
| `listTool(all?)` | `all` | Lists available tools from `/toolkit/list`. |
| `loadTool(toolId)` | `toolId` | Loads an `OpenTool` definition from `/toolkit/{toolId}/load` and returns an `OpenTool` instance. |
| `subscribeToolEvents({ daemonApiKey, snapshot, signal })` | `daemonApiKey`, `snapshot`, `signal` | Subscribes to `/toolkit/events` and streams `ToolLifecycleEventDto` updates. |

### OpenTool Exports

The package root stays browser-safe. Import full `opentool-ts` re-exports from
explicit Node-only subpaths:

- `agentos-sdk-ts/opentool`
- `agentos-sdk-ts/third_party`

### AgentOSEventHandler

| Method | Parameters | Description |
| --- | --- | --- |
| `onWelcome(welcome)` | `welcome` | Receives `welcome` events. |
| `onCallApp(call)` | `call` | Receives `callApp` events. |
| `onDone()` | none | Called when the SSE stream ends. |
| `onError(error)` | `error` | Called when the SSE stream errors. |

### Subscription Lifecycle

```ts
import { AgentOSSDK } from 'agentos-sdk-ts';

const sdk = new AgentOSSDK({ baseUrl: 'http://localhost:8888' });

await sdk.agentos.registerBundle({
  bundleId: 'com.demo.app',
  appGroupId: 'com.demo.group'
});
await sdk.agentos.subscribe(myHandler); // app start

// app stop/dispose
await sdk.dispose();
```

### AgentKit Schema Notes

- `UserTask` supports passthrough fields:
  - `extraSystemPrompt`
  - `llmConfig`
- `LLMConfig` supports:
  - `contextWindowSize`
  - `supportsToolCall` (read/write)
  - `supportsReasoning` (read/write)
  - read compatibility for `supportsToolCalling` and `supportsDeepThinking`
- `Capability` supports:
  - `llmConfigList`
  - `toolReturnPackMinLength`
- `AgentMessage.completions` supports `limits`:
  - `maxTokens`
  - `contextWindowSize`

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
- `agentkit`, `agentos`, and `cronkit` requests use the stored token automatically.
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
