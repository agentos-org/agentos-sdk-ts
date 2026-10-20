# AgentOS SDK for TypeScript

一个轻量的 TypeScript SDK，用于访问 AgentOS API，支持 Root、AgentKit、AppKit、
HarnessKit、CronKit、ModelKit 和 ToolKit 发现接口。推荐使用统一的 `AgentOSSDK`，
无需手动管理 token。

## 功能

- Root API：版本查询
- AgentKit API：会话初始化、chat 流式/单次、历史记录、stop/clear、回调
- AppKit API：bundle 注册与 SSE 订阅
- HarnessKit API：Harness 运行时、线程、Run、命令、结果和 SSE 事件
- AuthKit API：OAuth 授权流、token 交换、用户信息获取、授权管理
- CronKit API：定时任务 CRUD、运行记录与调度器控制
- DiscoveryKit API：附近设备发现、自身信息获取、设备注册/注销、SSE 设备事件流
- ModelKit API：基于任务的模型列表，`/modelkit/*` 下的 OpenAI 兼容
  chat / embedding / asr / tts 客户端，带类型问题的 decision 推理，以及外部
  app model 注册
- ToolKit API：tool 列表、tool 定义读取与 tool 生命周期事件订阅
- TransferKit API：设备间文件传输（发送/接收/进度流/取消/应答）、接收策略、传输历史管理

## 快速开始

安装依赖：

```bash
npm install agentos-sdk-ts
```

统一使用一个公开入口导入：

```ts
import { AgentOSSDK } from 'agentos-sdk-ts';
```

包根入口现在是 browser-safe 的；Node 专用的 OpenTool 导出位于显式子入口。

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

// 可按任务（chat / embedding / asr / tts / decision）过滤。
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

### 使用 ModelKit Decision

Decision 模型（`ModelTask.decision`，由 llama.cpp `/v1/systemone` 提供）不生成
文本，而是针对给定的 `state`，对带类型问题的选项打分。`POST /modelkit/decision`
不需要 app token。

```ts
import { AgentOSSDK, ModelTask } from 'agentos-sdk-ts';

const sdk = new AgentOSSDK({ baseUrl: 'http://localhost:8888' });

const decisionModels = await sdk.modelkit.listModelsByTask(ModelTask.decision);

const response = await sdk.modelkit.decision.create({
  model: decisionModels[0]?.name, // 可选，缺省时由网关选择默认模型
  state: { text: '我的订单迟迟不到，太让人生气了！' },
  questions: {
    // 单选（选项 -> 描述）
    route: {
      type: 'choice',
      instructions: '应该交给哪个团队处理？',
      criteria: { billing: '支付与发票', support: '商品或物流问题' }
    },
    // 有序评分，2-10 个等级描述
    urgency: { type: 'score', instructions: '这件事有多紧急？', criteria: ['低', '中', '高'] },
    // 是/否判断，`criteria`（{ true, false }）可选
    angry: { type: 'noul', instructions: '用户是否生气了？' }
  }
  // images: ['data:image/png;base64,...'], // 支持图片输入的模型可用
});

console.log(response.answers.route.choice, response.answers.route.confidence);
console.log(response.answers.urgency.score, response.answers.angry.noul);
console.log(response.usage?.input_tokens, response.usage?.output_tokens);
```

响应按服务端原样返回（使用 wire 字段名）。每个答案包含与问题 `type` 对应的字段
（`choice` + `confidence`、`score` 或 `noul`）；`probabilities` 和 `legend` 原样透传。

### 注册 App Model

App 可以把自己的模型注册到网关。注册后的模型会出现在 `listModels()` /
`listModelsByTask()` 中，并带有 `isAppModel: true` 与所属的 `appBundleId`。

注册时传入的 `id` 是 app 自己的本地 id（1-64 个字符，取自 `[A-Za-z0-9._-]`），只需
在本 app 内唯一。网关对外把模型暴露为 `<id>@<bundleId>`（`qualifiedId`），
`listModels()` 中的模型 `id` 就是这个完整 ID。请求的 `model` 传这个完整 ID，即使别的
app 注册了相同的本地 id，也能精准路由到你的模型。

```ts
await sdk.agentos.registerBundle({ bundleId: 'com.example.app' });

// 注册（或替换）模型，只有 `id` 和 `name` 必填。
const result = await sdk.modelkit.registerAppModel({
  request: {
    id: 'my-router',
    name: 'my-router',
    task: ModelTask.decision,
    baseUrl: 'http://127.0.0.1:9000',
    apiKey: 'upstream-secret' // 由服务端保存，不会再返回
  }
});
console.log(result.qualifiedId); // 'my-router@com.example.app'：请求的 `model` 传它
console.log(result.updated); // 替换了该 app 已有的同 id 模型时为 true

// 局部更新：未设置的字段保持不变。
await sdk.modelkit.updateAppModel({
  modelId: 'my-router',
  request: { description: '分流客服工单' }
});

// 启用/停用，无需删除。
await sdk.modelkit.toggleAppModel({ modelId: 'my-router' });

// 列出所有 app 注册的模型（公开接口，无需 token）。
const appModels = await sdk.modelkit.listAppModels();
console.log(appModels.map((m) => `${m.qualifiedId} disabled=${m.isDisabled}`));

await sdk.modelkit.unregisterAppModel({ modelId: 'my-router' });
```

写操作会自动附带 app token，并在 `401` 时刷新一次。失败时 reject 带服务端状态码的
`ApiError`：`401` token 无效，`403` `appBundleId` 不匹配，`404` id 不存在
（`modelId` 是你自己的本地 id，只在本 app 的模型中查找），`409` `name` 与本 app 的
另一个模型重名，`400` 请求体非法、`task` 未知，或 `id` / bundleId 的字符或长度不合法。

Decision 模型会被服务端规范化：输入为 `text`（可选 `image`），输出为
`decisions`，`stream` / `tool_call` / `reasoning` 均为 `false`。

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
| `authkit` | `AuthKitModule` | AuthKit OAuth 授权接口，内部处理 token。 |
| `cronkit` | `CronKitModule` | CronKit 任务管理接口，内部处理 token。 |
| `discoverykit` | `DiscoveryKitModule` | DiscoveryKit 附近设备发现接口，内部处理 token。 |
| `harnesskit` | `HarnessKitModule` | Harness 运行时与会话接口，内部处理 AppKit token。 |
| `modelkit` | `ModelKitModule` | ModelKit 基于任务的模型列表、chat / embedding / asr / tts / decision 客户端与 app model 注册。 |
| `toolkit` | `ToolKitModule` | ToolKit 发现接口与 tool 生命周期事件订阅。 |
| `transferkit` | `TransferKitModule` | TransferKit 文件传输接口，内部处理 token。 |
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

Cron 任务可以复用已有 LiteAgent session，并按 IANA 时区计算调度时间：

```ts
import { CronTaskConcurrency } from 'agentos-sdk-ts';

await sdk.cronkit.createTask({
  request: {
    name: '每日摘要',
    schedule: '0 9 * * *',
    sessionId: 'existing-liteagent-session',
    timezone: 'Asia/Shanghai',
    concurrency: CronTaskConcurrency.skipIfRunning,
    spec: {
      systemPrompt: 'You are a scheduled agent.',
      content: [
        { type: 'text', message: 'Generate the daily summary.' }
      ],
      modelId: 'gpt-4o'
    }
  }
});
```

- `sessionId` 为可选字段；提供后定时执行会复用该 session，否则 kernel 会在任务执行时初始化 LiteAgent session。
- `timezone` 接受 `Asia/Shanghai` 等 IANA 时区；Cron 按该时区计算，`lastRunAt`、`nextRunAt` 和 run 时间均以 UTC 序列化。
- `CronTaskConcurrency` 支持 `allow`、`skipIfRunning` 和 `replace`。
- `modelId` 是可选请求字段，CronKit 会用它解析底层模型配置。
- `modelName` 是可选返回字段，会出现在 `CronTask.spec` 中，表示最终解析后的模型名。

### AgentKitModule（`sdk.agentkit`）

| 方法 | 参数 | 说明 |
| --- | --- | --- |
| `initSession({ capability }?)` | `capability` | 初始化 SessionAgent 会话；嵌套 Agent 通过 `capability.subAgentList` 内联声明。 |
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
| `listModelsByTask(task)` | `Promise<ModelInfo[]>` | 按 `ModelTask`（`chat` / `embedding` / `asr` / `tts` / `decision`）过滤模型。 |
| `chat` | `ModelKitChatClient` | OpenAI 兼容 chat 客户端，使用 `{baseUrl}/modelkit/chat`。 |
| `embedding` | `ModelKitEmbeddingClient` | `/modelkit/embedding` 下的 OpenAI 兼容 embeddings 客户端。 |
| `asr` | `ModelKitAsrClient` | `/modelkit/asr` 下的语音转文字客户端。 |
| `tts` | `ModelKitTtsClient` | `/modelkit/tts` 下的文字转语音客户端。 |
| `decision` | `ModelKitDecisionClient` | `decision.create({ model?, state, questions, images? })` → `POST /modelkit/decision`，返回 `DecisionResponse`。 |
| `listAppModels()` | `Promise<AppModel[]>` | 通过 `GET /modelkit/app-models` 列出 app 注册的模型（公开接口）。 |
| `registerAppModel({ request })` | `Promise<AppModelWriteResult>` | 注册或替换 app model（`POST /modelkit/app-models`，需 app token）。 |
| `updateAppModel({ modelId, request })` | `Promise<AppModelWriteResult>` | 局部更新自己的 app model（`PUT /modelkit/app-models/<id>`）。 |
| `unregisterAppModel({ modelId })` | `Promise<AppModelWriteResult>` | 删除自己的 app model（`DELETE /modelkit/app-models/<id>`）。 |
| `toggleAppModel({ modelId })` | `Promise<AppModelWriteResult>` | 启用/停用自己的 app model（`POST /modelkit/app-models/<id>/toggle`）。 |

App 注册的模型在 `ModelInfo` 中带有 `isAppModel` 与 `appBundleId`。底层
`ModelKitClient`（`sdk.modelKit`）提供同样的 app model 方法，只是 bearer token
作为第一个参数显式传入，例如 `sdk.modelKit.registerAppModel(token, request)`。

### ToolKitModule（`sdk.toolkit`）

| 方法 | 参数 | 说明 |
| --- | --- | --- |
| `listTool(all?)` | `all` | 从 `/toolkit/list` 获取当前可用 tools 列表，包括 daemon 0.5 server 标识与物化元数据。 |
| `loadTool(toolId)` | `toolId` | 从 `/toolkit/{toolId}/load` 读取 `OpenTool` 定义，并返回 `OpenTool` 实例。 |
| `callTool({ toolId, functionCall })` | `toolId`、`functionCall` | 通过 AgentOS 网关调用工具函数并返回 `ToolReturn`。自动使用 AppKit token，401/403 时刷新并重试。 |
| `streamCallTool({ toolId, functionCall, signal? })` | `toolId`、`functionCall`、`signal` | 通过 AgentOS 网关流式调用工具函数，返回 `AsyncGenerator<ToolKitStreamEvent>` 并支持取消。 |
| `subscribeToolEvents({ daemonApiKey, snapshot, signal })` | `daemonApiKey`、`snapshot`、`signal` | 已弃用的 daemon 生命周期接口；AgentOS API 网关不公开该端点。 |

`listTool()` 返回兼容 daemon 0.5 的 `ToolDto`。可选 `server` 标识使用
`namespace`、`name` 和 `version`；`materializedArtifactDigest` 在可用时标识
已安装内容，`contentState` 表示内容状态：`unknown`、`current`、
`updatePending` 或 `broken`。

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

### AuthKitModule（`sdk.authkit`）

AuthKit 为第三方 App 提供类 OAuth 授权流程。App 发起授权请求后，AgentOS Desktop
弹出用户确认对话框；用户同意后 App 可用 authCode 换取 accessToken，进而获取用户信息。

**授权状态枚举（`AuthRequestStatus`）：**

| 值 | 说明 |
| --- | --- |
| `pending` | 等待用户确认 |
| `granted` | 用户已授权 |
| `denied` | 用户拒绝授权 |
| `timeout` | 请求超时（3 分钟） |

**Token 验证结果枚举（`TokenValidationResult`）：**

| 值 | 说明 |
| --- | --- |
| `valid` | token 有效且 AgentOS 已登录 |
| `invalidToken` | token 不识别 |
| `authExpired` | AgentOS 用户已登出 |
| `tokenRevoked` | 授权已被撤销 |

| 方法 | 参数 | 说明 |
| --- | --- | --- |
| `authorize(request?)` | `{ scopes?: string[]; appName?: string }` | 发起授权请求。已授权的 App 直接返回 `granted` + `authCode`；首次授权返回 `pending`（HTTP 202）。 |
| `getStatus(requestId)` | `requestId` | 轮询授权请求状态。 |
| `exchangeToken(request)` | `{ authCode: string }` | 使用 authCode 换取 accessToken 和 userInfo。 |
| `getUserInfo(accessToken)` | `accessToken` | 使用 accessToken 获取当前用户信息。 |
| `revoke(request?)` | `{ bundleId?: string }` | 撤销指定 bundleId 的授权。 |
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

**AuthKitGrant 结构：**

```ts
interface AuthKitGrant {
  bundleId: string;
  appName?: string;
  userId?: string;
  scopes: string[];
  grantedAt: string; // ISO 8601
}
```

### DiscoveryKitModule（`sdk.discoverykit`）

DiscoveryKit 用于发现附近的 AgentOS 设备，支持设备级和 App 级扫描。

**设备事件类型枚举（`PeerDeviceEventType`）：**

| 值 | 说明 |
| --- | --- |
| `joined` | 新设备上线 |
| `left` | 设备离线 |
| `updated` | 设备信息更新 |

**文件接收策略枚举（`FileReceivePolicy`）：**

| 值 | 说明 |
| --- | --- |
| `autoAccept` | 自动接收文件 |
| `requireConfirm` | 需要用户确认 |

| 方法 | 参数 | 说明 |
| --- | --- | --- |
| `getPeers()` | 无 | 获取附近设备列表。App 级扫描只返回同 bundleId 注册的设备。 |
| `streamPeers(signal?)` | `AbortSignal` | SSE 订阅设备变化事件（`peer.joined` / `peer.left` / `peer.updated`）。 |
| `getSelf()` | 无 | 获取自身设备信息及 nearbyTransfer 状态。 |
| `register(request?)` | `{ receivePolicy?: FileReceivePolicy }` | 将当前 App 注册到设备发现广播中。 |
| `unregister()` | 无 | 从设备发现广播中注销当前 App。 |

```ts
await sdk.discoverykit.register({ receivePolicy: 'autoAccept' });

const peers = await sdk.discoverykit.getPeers();
console.log('Nearby devices:', peers.length);

const self = await sdk.discoverykit.getSelf();
console.log('Transfer enabled:', self.nearbyTransferEnabled);
```

**PeerDevice 结构：**

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

**PeerApp 结构：**

```ts
interface PeerApp {
  bundleId?: string;
  userId?: string;
  username?: string;
  appName?: string;
  avatarUrl?: string;
}
```

### TransferKitModule（`sdk.transferkit`）

TransferKit 提供 AgentOS 设备之间的文件传输能力，包括发送、接收、进度追踪、
取消和传输历史管理。

**传输状态枚举（`TransferState`）：**

| 值 | 说明 |
| --- | --- |
| `pending` | 等待开始 |
| `preparing` | 准备中 |
| `transferring` | 传输中 |
| `completed` | 传输完成 |
| `failed` | 传输失败 |
| `cancelled` | 已取消 |

**传输方向枚举（`TransferDirection`）：**

| 值 | 说明 |
| --- | --- |
| `send` | 发送 |
| `receive` | 接收 |

**单文件传输状态枚举（`FileTransferState`）：**

| 值 | 说明 |
| --- | --- |
| `pending` | 等待 |
| `transferring` | 传输中 |
| `completed` | 完成 |
| `failed` | 失败 |

| 方法 | 参数 | 说明 |
| --- | --- | --- |
| `send(request)` | `TransferSendRequest` | 向目标设备发送文件，返回 `TransferSession`。 |
| `listTransfers()` | 无 | 列出当前 App 的所有传输会话。 |
| `getStatus(transferId)` | `transferId` | 获取传输会话状态。 |
| `streamProgress(transferId, signal?)` | `transferId`、`AbortSignal` | SSE 订阅传输进度，完成或失败后自动结束。 |
| `cancel(transferId)` | `transferId` | 取消一个进行中的传输。 |
| `respond(transferId, request)` | `transferId`、`{ accept: boolean }` | 对收到的传输请求进行接受/拒绝应答。 |
| `receiveStream(signal?)` | `AbortSignal` | SSE 订阅入站文件传输事件（`file.received`）。 |
| `setPolicy(request)` | `{ policy: string }` | 设置文件接收策略（`autoAccept` / `requireConfirm`）。 |
| `getPolicy()` | 无 | 获取当前文件接收策略。 |
| `getHistory(query?)` | `{ deviceId?: string; userId?: string }` | 获取传输历史记录列表（最新在前）。 |
| `deleteHistory(recordId, query?)` | `recordId`、`HistoryQuery` | 删除单条传输历史记录。 |
| `clearHistory(query?)` | `HistoryQuery` | 清空传输历史。 |

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

// 流式追踪进度
const progress = await sdk.transferkit.streamProgress(session.transferId);
for await (const update of progress) {
  console.log(`Progress: ${(update.progress * 100).toFixed(1)}%`);
  if (update.state === 'completed' || update.state === 'failed') break;
}
```

**TransferSession 结构：**

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

**IncomingTransferEvent 结构：**

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

**TransferHistoryRecord 结构：**

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

### HarnessKitModule（`sdk.harnesskit`）

HarnessKit 会通过 Gateway 将请求转发到当前 AppKit bundle 对应的 Harness
运行时。先调用 `sdk.agentos.registerBundle()` 注册应用。可安装的进程 App
需要在应用配置中声明 Harness runtime；内置 Harness 使用主机默认运行时。
以下方法会自动使用当前 AppKit token，并在鉴权失败后刷新 token 重试一次。

| 方法 | 参数 | 说明 |
| --- | --- | --- |
| `health()` | 无 | 通过需要鉴权的 Gateway 路由检查 Harness 运行时健康状态。 |
| `getRuntime()` / `switchEngine(engine)` | `engine` | 读取运行时引擎信息或请求切换引擎。 |
| `listThreads()` / `getThread(threadId)` | `threadId` | 列出持久化线程或读取单个线程快照。 |
| `renameThread(threadId, title)` / `deleteThread(threadId)` | `threadId`、`title` | 修改线程标题或删除空闲线程。 |
| `startRun(threadId, request)` | `threadId`、`HarnessKitRunRequest` | 启动 Harness Run 并返回 `runId`。 |
| `submitCommand(threadId, command)` | `threadId`、`HarnessKitCommand` | 提交工作或控制命令；被拒绝的命令仍返回 receipt。 |
| `events(threadId, options?)` | `threadId`、`afterSequence`、`runId`、`signal` | 订阅可恢复的 SSE 流，返回类型化 `HarnessKitEvent`。 |
| `getRunResult(runId)` | `runId` | 获取当前或最终 Run 结果。 |
| `getOperationalSnapshot()` | 无 | 在运行时支持时读取运行状态快照。 |
| `request<T>(path, options?)` | Harness 相对路径、`RequestOptions` | 通过 `/harnesskit/*` 调用其他 JSON Harness 接口。 |
| `requestStream(path, options?)` | Harness 相对路径、`RequestOptions` | 为其他 Harness 接口打开原始流式响应。 |

```ts
import { AgentOSSDK } from 'agentos-sdk-ts';

const sdk = new AgentOSSDK();
await sdk.agentos.registerBundle({ bundleId: 'com.demo.harness-app' });

const runtime = await sdk.harnesskit.getRuntime();
console.log('Harness 引擎：', runtime.activeEngine ?? runtime.engine);
const accepted = await sdk.harnesskit.startRun('research-thread', {
  requestId: crypto.randomUUID(),
  goal: '总结项目最新状态',
  llmConfig: {
    provider: 'openai-compatible',
    baseUrl: 'http://127.0.0.1:1234/v1',
    model: 'local-model'
  }
});

const events = await sdk.harnesskit.events('research-thread', {
  runId: accepted.runId,
  afterSequence: 0
});
for await (const event of events) {
  console.log(event.type, event.data);
}
```

`HarnessKitCommand` 和 `HarnessKitRunRequest` 保留开放的 JSON 字段，方便透传
后续 Harness 新增字段。如果当前引擎未实现可选的 operational reader，
`getOperationalSnapshot()` 可能返回 HTTP `501`。
在 AgentOS Mobile WebView 中，Native bridge 也需要支持 `/harnesskit/*`；
未支持的 bridge 路由会以 `ApiError` 暴露。

### 为 Harness 指定 System One 决策模型

Harness 可以使用 ModelKit 的 `decision` 模型进行复杂度判断和工具选择。
使用 ModelKit 模型的 `id` 指定；模型凭据和服务端点由宿主管理。启动 Run 时，
在请求中设置 `decisionModelConfig`；提交 `submit_turn` 或 `edit_and_resend`
命令时，设置 `decisionModelConfigOverride`。直接调用置信度阈值默认为 `0.75`。

```ts
const decisionModels = await sdk.modelkit.listModelsByTask('decision');
const decisionModel = decisionModels[0];

if (decisionModel) {
  await sdk.harnesskit.submitCommand('research-thread', {
    type: 'submit_turn',
    commandId: crypto.randomUUID(),
    input: '继续研究并选择合适的工具。',
    decisionModelConfigOverride: {
      modelId: decisionModel.id,
      directCallConfidence: 0.75
    }
  });
}
```

通过 `startRun` 启动时，在 `HarnessKitRunRequest` 中使用相同配置字段
`decisionModelConfig`。省略字段时，Harness 会按默认行为选择决策方式。

### OpenTool 导出

包根入口保持 browser-safe；完整的 `opentool-ts` 转导出请走显式 Node 子入口：

- `agentos-sdk-ts/opentool`
- `agentos-sdk-ts/third_party`

这些子入口只导出 OpenTool 协议模型和辅助能力。daemon 管理不属于
OpenTool 语言 SDK；工具列表、定义加载和调用请使用 AgentOS ToolKit 网关 API。

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
  - `provider`、`adapter`、`headers` 和 `providerOptions`
  - `contextWindowSize`
  - `supportsToolCall`（可读/可写）
  - `supportsReasoning`（可读/可写）
  - 读取兼容 `supportsToolCalling` 和 `supportsDeepThinking`
- `Capability` 支持：
  - `skills`：完整的 Agent Skills Markdown 文档
  - `subAgentList`：可递归嵌套的内联 Agent；运行时 session ID 由服务端生成
  - `llmConfigList`
  - `toolReturnPackMinLength`
  - `maxLlmRequests`：单个工具型任务的大模型请求次数上限（服务端默认值：`64`）
  - `maxToolRounds`：单个任务的工具调用轮数上限（服务端默认值：`16`）
  - `maxToolCalls`：单个任务的工具调用总数上限（服务端默认值：`64`）
  - `maxConsecutiveIdenticalToolRounds`：连续相同工具调用轮数上限（服务端默认值：`3`）
  - `maxTaskDurationSeconds`：单个工具型任务最长执行秒数（服务端默认值：`300`）

以上五个执行限制字段均为可选字段，并由 SDK 原样透传。SDK 不会注入服务端
默认值，也不会改写 `0` 或负数；默认值和校验均由服务端处理。

```ts
import type { Capability } from 'agentos-sdk-ts';

const capability: Capability = {
  systemPrompt: '你是一个助手',
  subAgentList: [{
    name: 'researcher',
    capability: { systemPrompt: '你负责查找支持证据' }
  }],
  maxLlmRequests: 32,
  maxToolRounds: 8,
  maxToolCalls: 20,
  maxConsecutiveIdenticalToolRounds: 2,
  maxTaskDurationSeconds: 120
};

await sdk.agentkit.initSession({ capability });
```

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
- `agentkit`、`agentos`、`authkit`、`cronkit`、`discoverykit`、`toolkit` 和 `transferkit` 请求会自动使用已保存 token。
- 当 app token 过期时，SDK 会按相同 `bundleId` 和 `appGroupId` 自动重新注册一次后重试请求。

## 说明

- 调用受 token 保护的 API 前，先执行 `agentos.registerBundle(...)`。
- `sdk.modelkit.chat.createStream(...)` 会持续产出解析后的 SSE JSON，直到收到 `[DONE]`。
- `sdk.modelkit.decision` 请求 `/modelkit/decision`；app model 管理请求
  `/modelkit/app-models`。只有 app model 的写操作需要先调用
  `agentos.registerBundle(...)`。
- `sdk.toolkit.subscribeToolEvents(...)` 需要 daemon API key。
- 外部集成应只从 `agentos-sdk-ts` 导入。

## 开发

```bash
npm run typecheck
npm test
```
