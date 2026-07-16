# AgentOS SDK for TypeScript

一个轻量的 TypeScript SDK，用于访问 AgentOS API，支持 Root、AgentKit、AppKit、
CronKit、ModelKit 和 ToolKit 发现接口。推荐使用统一的 `AgentOSSDK`，
无需手动管理 token。

## 功能

- Root API：版本查询
- AgentKit API：Agent CRUD、会话初始化、chat 流式/单次、历史记录、stop/clear、回调
- AppKit API：bundle 注册与 SSE 订阅
- CronKit API：定时任务 CRUD、运行记录与调度器控制
- ModelKit API：基于任务的模型列表，以及 `/modelkit/*` 下的 OpenAI 兼容
  chat / embedding / asr / tts 客户端
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
  console.log('OpenTool 注册状态:', registration.opentoolServers);

  await sdk.agentos.subscribe(new DemoEventHandler());
}

class DemoEventHandler extends AgentOSEventHandler {
  async onWelcome(welcome) {
    console.log('Welcome bundleId:', welcome.bundleId);
  }

  async onAppEvent(event) {
    if (isOpenToolProvisionSucceededEvent(event)) {
      console.log(`OpenTool ${event.data.ref} 已就绪:`, event.data.id);
    } else if (isOpenToolProvisionFailedEvent(event)) {
      console.error(`OpenTool ${event.data.ref} 拉起失败:`, event.data.error);
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

### 使用 AgentOS Mobile WebView Bridge

在 AgentOS Mobile 内打开的 Web App 可以继续使用相同的 `AgentOSSDK`
调用方式。SDK 会在默认构造时自动检测 `window.agentos.bridge.request`，
并把请求切换到 mobile bridge transport；普通浏览器或显式传入 `baseUrl` /
`fetch` / `apiClient` 时仍使用原来的 HTTP gateway 配置。

```ts
import { AgentOSSDK } from 'agentos-sdk-ts';

const sdk = new AgentOSSDK();

const models = await sdk.modelkit.listModels();
console.log(models);
```

注意：调用方式一致不代表 mobile bridge 已经覆盖全部 HTTP gateway route。
当前 V1 bridge 主要支持 context、model list、AgentKit session/chat、stop、
clear 路由。不支持的 route 应由 Native 返回结构化 bridge error，例如
`{ code: 'route_not_supported', message: '...' }`；SDK 会沿用现有
`ApiError` 路径暴露给业务方。

- `isAgentOSBridgeAvailable()` 只检查 `window.agentos.bridge.request` 是否存在，
  不代表当前 origin 已授权。
- `getAgentOSBridgeContext()` 是授权探测点。当前 Web App 未注册或未启用 agent
  mode 时，AgentOS Mobile 应返回明确的 bridge error。
- 如需强制指定环境，可以继续通过 `new AgentOSSDK({ baseUrl, fetch })`
  显式覆盖自动选择。
- bridge request 中的 `appId` 和 `origin` 只是 JavaScript 提供的调试 hint。
  Native 必须用可信的 mini app 定义和当前 main frame URL 做授权。
- 流式 bridge event 会转换成 SSE `Response`，因此现有 AgentKit 和 OpenAI 兼容
  ModelKit 流式解析可以继续复用 `parseSse()`。

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
| `toolkit` | `ToolKitModule` | ToolKit 发现接口与 tool 生命周期事件订阅。 |
| `dispose()` | `Promise<void>` | 释放 SDK 资源并取消当前 AppKit 订阅。 |

### AgentOSModule（`sdk.agentos`）

| 方法 | 参数 | 说明 |
| --- | --- | --- |
| `getVersion()` | 无 | 获取 AgentOS 服务版本。 |
| `getRoot()` | 无 | 获取 AgentOS 网关元信息。 |
| `getReady()` | 无 | 获取 AgentOS 就绪状态。 |
| `registerBundle(bundle)` | `AppBundle` | 注册 app bundle，可声明 `opentoolServers`；内部保存 bearer token，并返回 token 与 OpenTool 同步状态。 |
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
| `history({ sessionId, page?, pageSize? })` | `sessionId`、`page`、`pageSize` | 获取会话历史消息。`page` 和 `pageSize` 必须成对提供，且均为正整数；两者均省略时返回完整持久化历史。 |
| `historySummary({ sessionId, page?, pageSize? })` | `sessionId`、`page`、`pageSize` | 优先加载轻量历史摘要。默认 `page=1`、`pageSize=30`，`pageSize` 最大为 200。 |
| `historyProcess({ sessionId, originalTaskId, page?, pageSize? })` | `sessionId`、`originalTaskId`、`page`、`pageSize` | 按 `originalTaskId` 懒加载单轮任务的过程消息。默认 `page=1`、`pageSize=50`，`pageSize` 最大为 200。 |
| `stop({ sessionId, taskId? })` | `sessionId`、`taskId` | 停止会话或任务。 |
| `clear({ sessionId })` | `sessionId` | 清除会话数据。 |
| `callback({ sessionId, toolReturn })` | `sessionId`、`toolReturn` | 发送工具回调结果。 |
| `streamCallback({ sessionId, eventToolReturn })` | `sessionId`、`eventToolReturn` | 发送流式工具回调结果。 |

AgentKit SSE 事件携带的 child `sessionId` 会透传给 message、chunk、
function-call 及 callback handler；缺失或为空时回退到外层 root chat session ID。

### ModelKitModule（`sdk.modelkit`）

| 方法/属性 | 类型 | 说明 |
| --- | --- | --- |
| `listModels()` | `Promise<ModelInfo[]>` | 从 `/modelkit/models` 获取可用模型列表。 |
| `listModelsByTask(task)` | `Promise<ModelInfo[]>` | 按 `ModelTask`（`chat` / `embedding` / `asr` / `tts`）过滤模型。 |
| `chat` | `ModelKitChatClient` | OpenAI 兼容 chat 客户端，使用 `{baseUrl}/modelkit/chat`。 |
| `embedding` | `ModelKitEmbeddingClient` | `/modelkit/embedding` 下的 OpenAI 兼容 embeddings 客户端。 |
| `asr` | `ModelKitAsrClient` | `/modelkit/asr` 下的语音转文字客户端。 |
| `tts` | `ModelKitTtsClient` | `/modelkit/tts` 下的文字转语音客户端。 |

### ToolKitModule（`sdk.toolkit`）

| 方法 | 参数 | 说明 |
| --- | --- | --- |
| `listTool(all?)` | `all` | 从 `/toolkit/list` 获取当前可用 tools 列表；当网关返回时，结果会包含 `server.repo`、`server.name`、`server.tag` 等 server 元数据。 |
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
| `onAppEvent(event)` | `AppEvent` | 接收异步的 `toolkit.provision.succeeded` 和 `toolkit.provision.failed` 通知。 |
| `onDone()` | 无 | SSE 流结束时触发。 |
| `onError(error)` | `error` | SSE 流异常时触发。 |

### 订阅生命周期

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
await sdk.agentos.subscribe(myHandler); // app 启动

// app 停止/释放
await sdk.dispose();
```

每个 OpenTool 声明包含 App 内稳定的 `ref` 和 daemon 中的 server `name`。
register 返回状态为 `running`、`starting` 或 `notFound`，只有 `running`
带可调用的 tool `id`。`starting` 会继续在后台拉起，最终成功或失败都通过
`onAppEvent` 返回。应以 `toolkit.provision.succeeded` 及其中的 `id` 作为工具
正式可调用的时点。自动刷新 token 时，SDK 也会重新提交同一组 OpenTool 声明。

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
- `AgentMessage.originalTaskId` 标识根任务。旧版 AgentOS 服务生成该字段时可能回退使用 `taskId`。
- 当 `AgentMessage.type` 为 `taskStatus` 时，其 `content` 可由 `TaskStatus` 表示，包含 `status`、可选 `taskId` 和可选 `description`。

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
- `sdk.modelkit.chat.createStream(...)` 会持续产出解析后的 SSE JSON，直到收到 `[DONE]`。
- `sdk.toolkit.subscribeToolEvents(...)` 需要 daemon API key。
- 外部集成应只从 `agentos-sdk-ts` 导入。

## 开发

```bash
npm run typecheck
npm test
```
