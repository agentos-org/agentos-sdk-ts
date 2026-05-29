# AgentOS SDK for TypeScript

一个轻量的 TypeScript SDK，用于访问 AgentOS API，支持 Root、AgentKit、AppKit、
CronKit、ModelKit 和 ToolKit 发现接口。推荐使用统一的 `AgentOSSDK`，
无需手动管理 token。

> **弃用提示：** `LlmKit`（`sdk.llmkit`）已弃用，请改用 `ModelKit`
> （`sdk.modelkit`）。旧模块仅为向后兼容保留，底层指向同一服务，将在未来版本
> 中移除。请将 `sdk.llmkit.*` 调用迁移到 `sdk.modelkit.*`。

## 功能

- Root API：版本查询
- AgentKit API：Agent CRUD、会话初始化、chat 流式/单次、历史记录、stop/clear、回调
- AppKit API：bundle 注册与 SSE 订阅
- CronKit API：定时任务 CRUD、运行记录与调度器控制
- ModelKit API：基于任务的模型列表，以及 `/modelkit/*` 下的 OpenAI 兼容
  chat / embedding / asr / tts 客户端
- LlmKit API（**已弃用**，请改用 ModelKit）：模型列表与指向
  `/llmkit/text/chat/completions` 的 OpenAI 兼容 chat 客户端
- ToolKit API：tool 列表、tool 定义读取与 tool 生命周期事件订阅

## 快速开始

安装依赖：

```bash
npm install agentos-sdk-ts
```

统一使用一个公开入口导入：

```ts
import { AgentOSSDK } from 'agentos-sdk-ts';
```

包根入口现在是 browser-safe 的；Node 专用的 OpenTool / daemon 导出改为显式子入口。

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

## 使用示例

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

### 配置网关地址

```ts
import { AgentOSSDK } from 'agentos-sdk-ts';

const sdk = new AgentOSSDK({ baseUrl: 'http://localhost:8888' });
```

### 配置长连接流超时

```ts
import { AgentOSSDK } from 'agentos-sdk-ts';

const sdk = new AgentOSSDK({
  baseUrl: 'http://localhost:8888',
  connectTimeout: 20_000,
  receiveTimeout: 0
});
```

### 使用 ModelKit Chat

`agentos-sdk-ts` 直接接受 OpenAI 兼容的 chat 请求结构。

```ts
import { AgentOSSDK, ModelTask } from 'agentos-sdk-ts';

const sdk = new AgentOSSDK({ baseUrl: 'http://localhost:8888' });

const models = await sdk.modelkit.listModels();
console.log(models.map((model) => model.alias));

// 可按任务（chat / embedding / asr / tts）过滤。
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

> **已弃用：** `sdk.llmkit.listModels()` / `sdk.llmkit.chat.create(...)` 仍可
> 向后兼容使用，但会产生弃用警告。请替换为上述 `sdk.modelkit` 等价调用。

## API 参考

### AgentOSSDK

构造函数：

```ts
new AgentOSSDK({
  baseUrl?: string;
  connectTimeout?: number;
  receiveTimeout?: number;
  apiClient?: ApiClient;
  fetch?: typeof fetch;
})
```

可通过 `baseUrl`、`connectTimeout` 和 `receiveTimeout` 进行公开配置。
`apiClient` 和 `fetch` 可用于测试、SSR 或自定义运行时注入。

| 属性 | 类型 | 说明 |
| --- | --- | --- |
| `agentos` | `AgentOSModule` | Root/AppKit 相关接口，内部处理 token。 |
| `agentkit` | `AgentKitModule` | AgentKit 相关接口，内部处理 token。 |
| `cronkit` | `CronKitModule` | CronKit 任务管理接口，内部处理 token。 |
| `modelkit` | `ModelKitModule` | ModelKit 基于任务的模型列表与 chat / embedding / asr / tts 客户端。 |
| `llmkit` | `LlmKitModule` | **已弃用**（请改用 `modelkit`）。LlmKit 模型列表与预配置 chat 客户端。 |
| `toolkit` | `ToolKitModule` | ToolKit 发现接口与 tool 生命周期事件订阅。 |
| `dispose()` | `Promise<void>` | 释放 SDK 资源并取消当前 AppKit 订阅。 |

### AgentOSModule（`sdk.agentos`）

| 方法 | 参数 | 说明 |
| --- | --- | --- |
| `getVersion()` | 无 | 获取 AgentOS 服务版本。 |
| `getRoot()` | 无 | 获取 AgentOS 网关元信息。 |
| `getReady()` | 无 | 获取 AgentOS 就绪状态。 |
| `registerBundle(bundle)` | `AppBundle` | 注册 app bundle，在内部保存 bearer token，并返回 token 元信息。 |
| `subscribe(handler, options?)` | `AgentOSEventHandler`、`AgentOSSubscribeOptions` | 使用 handler 订阅 AppKit SSE 事件。 |
| `connectionEvents` | `Subscription<AgentOSSubscribeConnectionEvent>` | 监听 AppKit SSE 连接状态变化。 |
| `connectionStatus` | `AgentOSSubscribeConnectionStatus \| undefined` | 获取最近一次 AppKit SSE 连接状态。 |

### CronKitModule（`sdk.cronkit`）

| 方法 | 参数 | 说明 |
| --- | --- | --- |
| `getTask({ cronId })` | `cronId` | 通过 `cronId` 获取定时任务。 |
| `listTasks({ enabled, offset, limit }?)` | `enabled`、`offset`、`limit` | 获取当前 app group 可见的定时任务列表。 |
| `createTask({ request })` | `request` | 创建定时任务。 |
| `updateTask({ request })` | `request` | 更新当前 app 拥有的定时任务。 |
| `deleteTask({ cronId })` | `cronId` | 删除当前 app 拥有的定时任务。 |
| `enableTask({ cronId })` | `cronId` | 显式启用定时任务，并返回最新状态。 |
| `disableTask({ cronId })` | `cronId` | 显式禁用定时任务，并返回最新状态。 |
| `runTaskNow({ cronId, scheduledAt? })` | `cronId`、`scheduledAt` | 立即触发一次定时任务运行。 |
| `getRun({ runId })` | `runId` | 通过 `runId` 获取单条运行记录。 |
| `listRuns({ cronId, after, before, offset, limit }?)` | `cronId`、`after`、`before`、`offset`、`limit` | 获取当前 app group 可见的运行记录列表。 |
| `listRunMessages({ runId, offset, limit })` | `runId`、`offset`、`limit` | 获取某次运行持久化保存的 `AgentMessage` 记录。 |
| `deleteRun({ runId })` | `runId` | 删除某次运行及其持久化消息记录。 |

`CronTaskCreateRequest.spec` 和 `CronTask.spec` 使用 CronKit 的任务 schema：

```ts
{
  systemPrompt: 'You are a scheduled agent.',
  content: [
    { type: 'text', message: 'Generate the daily summary.' }
  ],
  modelId: 'gpt-4o'
}
```

- `modelId` 是可选请求字段，CronKit 会用它解析底层模型配置。
- `modelName` 是可选返回字段，会出现在 `CronTask.spec` 中，表示最终解析后的模型名。

### AgentKitModule（`sdk.agentkit`）

| 方法 | 参数 | 说明 |
| --- | --- | --- |
| `getAgent({ agentId })` | `agentId` | 通过 `agentId` 获取 agent。 |
| `createAgent({ agent })` | `agent` | 使用给定负载创建 agent。 |
| `updateAgent({ agentId, agent })` | `agentId`、`agent` | 按 `agentId` 更新 agent。 |
| `deleteAgent({ agentId })` | `agentId` | 按 `agentId` 删除 agent。 |
| `initSession({ agentId, capability }?)` | `agentId`、`capability` | 初始化 SessionAgent 会话。 |
| `initSimple({ simpleCapability })` | `simpleCapability` | 初始化 SimpleAgent 会话。 |
| `chat(session, userTask, handler)` | `session`、`userTask`、`handler` | 启动 SessionAgent 任务，并通过回调处理 SSE 事件。 |
| `chatSimple({ sessionId, userTask })` | `sessionId`、`userTask` | 执行 SimpleAgent 请求并返回一次性响应。 |
| `history({ sessionId })` | `sessionId` | 获取会话历史消息。 |
| `stop({ sessionId, taskId? })` | `sessionId`、`taskId` | 停止会话或任务。 |
| `clear({ sessionId })` | `sessionId` | 清除会话数据。 |
| `callback({ sessionId, toolReturn })` | `sessionId`、`toolReturn` | 发送工具回调结果。 |
| `streamCallback({ sessionId, eventToolReturn })` | `sessionId`、`eventToolReturn` | 发送流式工具回调结果。 |

### ModelKitModule（`sdk.modelkit`）

| 方法/属性 | 类型 | 说明 |
| --- | --- | --- |
| `listModels()` | `Promise<ModelInfo[]>` | 从 `/modelkit/models` 获取可用模型列表。 |
| `listModelsByTask(task)` | `Promise<ModelInfo[]>` | 按 `ModelTask`（`chat` / `embedding` / `asr` / `tts`）过滤模型。 |
| `chat` | `ModelKitChatClient` | OpenAI 兼容 chat 客户端，使用 `{baseUrl}/modelkit/chat`。 |
| `embedding` | `ModelKitEmbeddingClient` | `/modelkit/embedding` 下的 OpenAI 兼容 embeddings 客户端。 |
| `asr` | `ModelKitAsrClient` | `/modelkit/asr` 下的语音转文字客户端。 |
| `tts` | `ModelKitTtsClient` | `/modelkit/tts` 下的文字转语音客户端。 |

### LlmKitModule（`sdk.llmkit`）—— 已弃用

> **已弃用：** 请改用 [`ModelKitModule`](#modelkitmodulesdkmodelkit)。仅为向后兼容保留。

| 方法/属性 | 类型 | 说明 |
| --- | --- | --- |
| `listModels()` | `Promise<LlmModelInfo[]>` | 从 `/llmkit/models` 获取可用模型列表。 |
| `chat` | `LlmKitChatClient` | 预配置的 OpenAI 兼容 chat 客户端，默认使用 `{baseUrl}/llmkit/text/chat/completions`。 |

### ToolKitModule（`sdk.toolkit`）

| 方法 | 参数 | 说明 |
| --- | --- | --- |
| `listTool(all?)` | `all` | 从 `/toolkit/list` 获取当前可用 tools 列表。 |
| `loadTool(toolId)` | `toolId` | 从 `/toolkit/{toolId}/load` 读取 `OpenTool` 定义，并返回 `OpenTool` 实例。 |
| `subscribeToolEvents({ daemonApiKey, snapshot, signal })` | `daemonApiKey`、`snapshot`、`signal` | 订阅 `/toolkit/events`，持续接收 `ToolLifecycleEventDto` 生命周期事件。 |

### OpenTool 导出

包根入口保持 browser-safe；完整的 `opentool-ts` 转导出请走显式 Node 子入口：

- `agentos-sdk-ts/opentool`
- `agentos-sdk-ts/third_party`

### AgentOSEventHandler

| 方法 | 参数 | 说明 |
| --- | --- | --- |
| `onWelcome(welcome)` | `welcome` | 接收 `welcome` 事件。 |
| `onCallApp(call)` | `call` | 接收 `callApp` 事件。 |
| `onDone()` | 无 | SSE 流结束时触发。 |
| `onError(error)` | `error` | SSE 流异常时触发。 |

### 订阅生命周期

```ts
import { AgentOSSDK } from 'agentos-sdk-ts';

const sdk = new AgentOSSDK({ baseUrl: 'http://localhost:8888' });

await sdk.agentos.registerBundle({
  bundleId: 'com.demo.app',
  appGroupId: 'com.demo.group'
});
await sdk.agentos.subscribe(myHandler); // app 启动

// app 停止/释放
await sdk.dispose();
```

### AgentKit Schema 说明

- `UserTask` 支持透传字段：
  - `extraSystemPrompt`
  - `llmConfig`
- `LLMConfig` 支持：
  - `contextWindowSize`
  - `supportsToolCall`（可读/可写）
  - `supportsReasoning`（可读/可写）
  - 读取兼容 `supportsToolCalling` 和 `supportsDeepThinking`
- `Capability` 支持：
  - `llmConfigList`
  - `toolReturnPackMinLength`
- `AgentMessage.completions` 支持 `limits`：
  - `maxTokens`
  - `contextWindowSize`

### AgentMessageHandler（工具回调）

- 实现 `onFunctionCall(...)` 处理非流式工具调用。SDK 会将返回值发送到 `/agentkit/callback`。
- 实现 `onStreamFunctionCall(...)` 处理流式工具调用。SDK 会将每个事件发送到 `/agentkit/streamCallback`。

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

## Token 处理

- `agentos.registerBundle(...)` 会在 SDK 内部保存 bearer token。
- `agentkit`、`agentos` 和 `cronkit` 请求会自动使用已保存 token。
- 当 app token 过期时，SDK 会按相同 `bundleId` 和 `appGroupId` 自动重新注册一次后重试请求。

## 说明

- 调用受 token 保护的 API 前，先执行 `agentos.registerBundle(...)`。
- `sdk.modelkit.chat.createStream(...)` 会持续产出解析后的 SSE JSON，直到收到 `[DONE]`（已弃用的 `sdk.llmkit.chat.createStream(...)` 行为相同）。
- `sdk.toolkit.subscribeToolEvents(...)` 需要 daemon API key。
- 外部集成应只从 `agentos-sdk-ts` 导入。

## 开发

```bash
npm run typecheck
npm test
```
