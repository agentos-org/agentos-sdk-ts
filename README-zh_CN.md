# AgentOS SDK for TypeScript

一个轻量的 TypeScript SDK，用于访问 AgentOS API，支持 Root、AgentKit、AppKit、
CronKit、ModelKit 和 ToolKit 发现接口。推荐使用统一的 `AgentOSSDK`，
无需手动管理 token。

## 功能

- Root API：版本查询
- AgentKit API：Agent CRUD、会话初始化、chat 流式/单次、历史记录、stop/clear、回调
- AppKit API：bundle 注册与 SSE 订阅
- AuthKit API：OAuth 授权流、token 交换、用户信息获取、授权管理
- CronKit API：定时任务 CRUD、运行记录与调度器控制
- DiscoveryKit API：附近设备发现、自身信息获取、设备注册/注销、SSE 设备事件流
- ModelKit API：基于任务的模型列表，以及 `/modelkit/*` 下的 OpenAI 兼容
  chat / embedding / asr / tts 客户端
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
| `authkit` | `AuthKitModule` | AuthKit OAuth 授权接口，内部处理 token。 |
| `cronkit` | `CronKitModule` | CronKit 任务管理接口，内部处理 token。 |
| `discoverykit` | `DiscoveryKitModule` | DiscoveryKit 附近设备发现接口，内部处理 token。 |
| `modelkit` | `ModelKitModule` | ModelKit 基于任务的模型列表与 chat / embedding / asr / tts 客户端。 |
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
  - `contextWindowSize`
  - `supportsToolCall`（可读/可写）
  - `supportsReasoning`（可读/可写）
  - 读取兼容 `supportsToolCalling` 和 `supportsDeepThinking`
- `Capability` 支持：
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
- `sdk.toolkit.subscribeToolEvents(...)` 需要 daemon API key。
- 外部集成应只从 `agentos-sdk-ts` 导入。

## 开发

```bash
npm run typecheck
npm test
```
