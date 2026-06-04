import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';

import {
  AgentMessageHandler,
  AgentOSEventHandler,
  AgentOSSDK,
  AgentOSSubscribeConnectionStatus,
  CronKitClient,
  EventType
} from '../dist/index.js';
import {
  DAEMON_DEFAULT_PREFIX,
  SchemaType
} from '../dist/opentool.js';

test('system, appkit, cronkit, modelkit, and toolkit flows work through the sdk', async () => {
  assert.equal(typeof DAEMON_DEFAULT_PREFIX, 'string');
  assert.equal(typeof SchemaType, 'function');
  const state = {
    registerCount: 0,
    lastCronCreateBody: null,
    lastToolkitHeaders: null,
    lastModelBody: null
  };
  const sdk = new AgentOSSDK({
    baseUrl: 'http://example.local:8888/base',
    fetch: createMockFetch((request) => {
      if (request.pathname === '/base/version') {
        return jsonResponse({ version: '1.2.3' });
      }
      if (request.pathname === '/base/') {
        return jsonResponse({
          name: 'AgentOS',
          version: '1.2.3',
          description: 'gateway',
          baseUrl: 'http://example.local:8888/base',
          endpoints: {}
        });
      }
      if (request.pathname === '/base/ready') {
        return jsonResponse({ ready: true, llmConfigured: true });
      }
      if (request.pathname === '/base/appkit/register') {
        state.registerCount += 1;
        return jsonResponse({
          token: `token-${state.registerCount}`,
          bundleId: 'com.demo.app',
          appGroupId: 'com.demo.group'
        });
      }
      if (request.pathname === '/base/appkit/subscribe') {
        assert.equal(request.headers.authorization, 'Bearer token-1');
        return sseResponse([
          'event: welcome\ndata: {"bundleId":"com.demo.app"}\n\n',
          'event: callApp\ndata: {"bundleId":"com.demo.app","contentList":[{"type":"text","message":"hello"}]}\n\n'
        ]);
      }
      if (request.pathname === '/base/cronkit/task/create') {
        assert.equal(request.headers.authorization, 'Bearer token-1');
        state.lastCronCreateBody = request.body;
        return jsonResponse({
          cronId: 'cron-1',
          name: 'daily',
          schedule: '0 0 * * *',
          source: 'app',
          enabled: true,
          status: 'enabled',
          concurrency: 'skipIfRunning',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
          spec: request.body.spec
        });
      }
      if (request.pathname === '/base/modelkit/models') {
        return jsonResponse([
          {
            id: 'model-1',
            name: 'Qwen',
            alias: 'qwen3-1.7b',
            task: 'chat',
            contextWindowSize: 32768
          }
        ]);
      }
      if (request.pathname === '/base/modelkit/chat/v1/chat/completions') {
        state.lastModelBody = request.body;
        return jsonResponse({
          id: 'chatcmpl-1',
          choices: [
            {
              message: {
                role: 'assistant',
                content: 'hello'
              }
            }
          ]
        });
      }
      if (request.pathname === '/base/toolkit/list') {
        return jsonResponse([{ id: 'tool-1', alias: 'demo' }]);
      }
      if (request.pathname === '/base/toolkit/tool-1/load') {
        return jsonResponse({ opentool: '1.0.0', info: { title: 'demo' } });
      }
      if (request.pathname === '/base/toolkit/events') {
        state.lastToolkitHeaders = request.headers;
        return sseResponse([
          'event: ready\ndata: {}\n\n',
          'event: updated\ndata: {"type":"updated","tool":{"id":"tool-1"}}\n\n'
        ]);
      }
      throw new Error(`Unhandled request: ${request.method} ${request.pathname}`);
    })
  });

  assert.equal((await sdk.agentos.getVersion()).version, '1.2.3');
  assert.equal((await sdk.agentos.getRoot()).name, 'AgentOS');
  assert.equal((await sdk.agentos.getReady()).ready, true);

  const registration = await sdk.agentos.registerBundle({
    bundleId: 'com.demo.app',
    appGroupId: 'com.demo.group'
  });
  assert.equal(registration.token, 'token-1');

  const seen = [];
  class DemoHandler extends AgentOSEventHandler {
    async onWelcome(welcome) {
      seen.push(['welcome', welcome.bundleId]);
    }

    async onCallApp(call) {
      seen.push(['callApp', call.contentList[0].message]);
    }

    async onDone() {
      seen.push(['done']);
    }

    async onError(error) {
      throw error;
    }
  }

  await sdk.agentos.subscribe(new DemoHandler(), { autoReconnect: false });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(seen, [
    ['welcome', 'com.demo.app'],
    ['callApp', 'hello'],
    ['done']
  ]);
  assert.equal(sdk.agentos.connectionStatus, AgentOSSubscribeConnectionStatus.disconnected);

  const cronTask = await sdk.cronkit.createTask({
    request: {
      name: 'daily',
      schedule: '0 0 * * *',
      spec: {
        systemPrompt: 'You are a scheduled agent.',
        content: [{ type: 'text', message: 'Generate the report.' }]
      }
    }
  });
  assert.equal(cronTask.spec.timeoutSeconds, 3600);
  assert.equal(state.lastCronCreateBody.concurrency, 'skipIfRunning');
  assert.equal(state.lastCronCreateBody.enabled, true);

  const models = await sdk.modelkit.listModels();
  assert.equal(models[0].task, 'chat');
  assert.equal(models[0].capabilities.vision, false);
  assert.equal(sdk.modelkit.chat.baseUrl, 'http://example.local:8888/base/modelkit/chat');

  const completion = await sdk.modelkit.chat.create({
    model: 'qwen3-1.7b',
    messages: [{ role: 'user', content: 'hello' }],
    maxTokens: 128,
    toolChoice: 'auto'
  });
  assert.equal(completion.choices[0].message.content, 'hello');
  assert.equal(state.lastModelBody.max_tokens, 128);
  assert.equal(state.lastModelBody.tool_choice, 'auto');

  const tools = await sdk.toolkit.listTool();
  assert.equal(tools[0].id, 'tool-1');
  const openTool = await sdk.toolkit.loadTool('tool-1');
  assert.equal(openTool.info.title, 'demo');
  assert.equal(typeof openTool.toJson, 'function');
  const toolEvents = [];
  for await (const event of sdk.toolkit.subscribeToolEvents({ daemonApiKey: 'daemon-key' })) {
    toolEvents.push(event.type);
  }
  assert.deepEqual(toolEvents, ['updated']);
  assert.equal(state.lastToolkitHeaders['x-tool-api-key'], 'daemon-key');

  await sdk.dispose();
});

test('modelkit chat sends the caller-provided model identifier unchanged', async () => {
  const state = {
    lastModelBody: null
  };
  const sdk = new AgentOSSDK({
    baseUrl: 'http://example.local:8888',
    fetch: createMockFetch((request) => {
      if (request.pathname === '/appkit/register') {
        return jsonResponse({ token: 'token-1' });
      }
      if (request.pathname === '/modelkit/chat/v1/chat/completions') {
        state.lastModelBody = request.body;
        return jsonResponse({
          id: 'chatcmpl-1',
          choices: [
            {
              message: {
                role: 'assistant',
                content: 'ok'
              }
            }
          ]
        });
      }
      throw new Error(`Unhandled request: ${request.method} ${request.pathname}`);
    })
  });

  await sdk.modelkit.chat.create({
    model: 'remote-gpt',
    messages: [{ role: 'user', content: 'hello' }]
  });

  assert.equal(state.lastModelBody.model, 'remote-gpt');
});

test('agentkit routes function calls to callback and streamCallback', async () => {
  const state = {
    callbackBodies: [],
    callbackSessionIds: [],
    streamBodies: [],
    streamSessionIds: []
  };
  const fetch = createMockFetch((request) => {
    if (request.pathname === '/appkit/register') {
      return jsonResponse({ token: 'token-1' });
    }
    assert.equal(request.headers.authorization, 'Bearer token-1');
    if (request.pathname === '/agentkit/chat') {
      return sseResponse([
        'event: functionCall\ndata: {"sessionId":"child-1","functionCall":{"id":"call-1","name":"demo_tool","arguments":{"query":"ping"}}}\n\n'
      ]);
    }
    if (request.pathname === '/agentkit/callback') {
      state.callbackBodies.push(request.body);
      state.callbackSessionIds.push(request.searchParams.get('sessionId'));
      return jsonResponse({ ok: true });
    }
    if (request.pathname === '/agentkit/streamCallback') {
      state.streamBodies.push(request.body);
      state.streamSessionIds.push(request.searchParams.get('sessionId'));
      return jsonResponse({ ok: true });
    }
    throw new Error(`Unhandled request: ${request.method} ${request.pathname}`);
  });
  const sdk = new AgentOSSDK({ fetch });
  await sdk.agentos.registerBundle({ bundleId: 'com.demo.app' });

  const nonStreamDone = deferred();
  class NonStreamHandler extends AgentMessageHandler {
    async onFunctionCall(sessionId, functionCall) {
      assert.equal(sessionId, 'child-1');
      return { id: functionCall.id, result: { ok: true } };
    }

    async onMessage() {}
    async onChunk() {}
    async onDone() {
      nonStreamDone.resolve();
    }
    async onError(error) {
      nonStreamDone.reject(error);
    }
  }

  await sdk.agentkit.chat({ sessionId: 'root' }, { content: [] }, new NonStreamHandler());
  await nonStreamDone.promise;
  assert.equal(state.callbackBodies.length, 1);
  assert.equal(state.streamBodies.length, 0);
  assert.equal(state.callbackSessionIds[0], 'child-1');

  const streamFetch = createMockFetch((request) => {
    if (request.pathname === '/appkit/register') {
      return jsonResponse({ token: 'token-1' });
    }
    assert.equal(request.headers.authorization, 'Bearer token-1');
    if (request.pathname === '/agentkit/chat') {
      return sseResponse([
        'event: functionCall\ndata: {"sessionId":"child-2","stream":true,"functionCall":{"id":"call-2","name":"demo_tool","arguments":{"query":"pong"}}}\n\n'
      ]);
    }
    if (request.pathname === '/agentkit/streamCallback') {
      state.streamBodies.push(request.body);
      state.streamSessionIds.push(request.searchParams.get('sessionId'));
      return jsonResponse({ ok: true });
    }
    throw new Error(`Unhandled request: ${request.method} ${request.pathname}`);
  });
  const streamSdk = new AgentOSSDK({ fetch: streamFetch });
  await streamSdk.agentos.registerBundle({ bundleId: 'com.demo.app' });

  const streamDone = deferred();
  class StreamHandler extends AgentMessageHandler {
    async onStreamFunctionCall(sessionId, functionCall, onToolReturn) {
      assert.equal(sessionId, 'child-2');
      onToolReturn({
        event: EventType.DATA,
        toolReturn: { id: functionCall.id, result: { partial: 'x' } }
      });
      onToolReturn({
        event: EventType.DONE,
        toolReturn: { id: functionCall.id, result: { ok: true } }
      });
    }

    async onMessage() {}
    async onChunk() {}
    async onDone() {
      streamDone.resolve();
    }
    async onError(error) {
      streamDone.reject(error);
    }
  }

  await streamSdk.agentkit.chat({ sessionId: 'root' }, { content: [] }, new StreamHandler());
  await streamDone.promise;
  assert.deepEqual(
    state.streamBodies.slice(-2).map((item) => item.event),
    [EventType.DATA, EventType.DONE]
  );
  assert.deepEqual(state.streamSessionIds.slice(-2), ['child-2', 'child-2']);
});

test('agentkit retries once after a 401 by re-registering the bundle', async () => {
  const state = {
    registerCount: 0,
    getAgentCalls: 0
  };
  const sdk = new AgentOSSDK({
    fetch: createMockFetch((request) => {
      if (request.pathname === '/appkit/register') {
        state.registerCount += 1;
        return jsonResponse({ token: `token-${state.registerCount}` });
      }
      if (request.pathname === '/agentkit/agent') {
        state.getAgentCalls += 1;
        if (request.headers.authorization === 'Bearer token-1') {
          return jsonResponse({ error: 'invalid app token' }, 401);
        }
        assert.equal(request.headers.authorization, 'Bearer token-2');
        return jsonResponse({ agentId: 'agent-1', name: 'demo' });
      }
      throw new Error(`Unhandled request: ${request.method} ${request.pathname}`);
    })
  });

  await sdk.agentos.registerBundle({ bundleId: 'com.demo.app', appGroupId: 'grp' });
  const agent = await sdk.agentkit.getAgent({ agentId: 'agent-1' });

  assert.equal(agent.agentId, 'agent-1');
  assert.equal(state.registerCount, 2);
  assert.equal(state.getAgentCalls, 2);
});

test('cronkit retries after invalid app token text response', async () => {
  const recovery = createAuthRecoveryFetch();
  const sdk = new AgentOSSDK({ fetch: recovery.fetch });

  await sdk.agentos.registerBundle({ bundleId: 'com.demo.app', appGroupId: 'group-a' });
  const tasks = await sdk.cronkit.listTasks({ limit: 10 });

  assert.equal(tasks.length, 1);
  assert.deepEqual(recovery.tokensUsedFor('/cronkit/task/list'), ['token-group-a-v1', 'token-group-a-v2']);
  assert.equal(recovery.registerCountFor('com.demo.app', 'group-a'), 2);
});

test('deduplicates concurrent refresh for the same app auth key', async () => {
  const recovery = createAuthRecoveryFetch();
  const sdk = new AgentOSSDK({ fetch: recovery.fetch });

  await sdk.agentos.registerBundle({ bundleId: 'com.demo.app', appGroupId: 'group-a' });

  const results = await Promise.all([
    sdk.cronkit.listTasks({ limit: 10 }),
    sdk.cronkit.getTask({ cronId: 'cron-1' }),
    sdk.agentkit.initSession()
  ]);

  assert.equal(results.length, 3);
  assert.equal(recovery.registerCountFor('com.demo.app', 'group-a'), 2);
});

test('does not mix tokens across different appGroupId values', async () => {
  const recovery = createAuthRecoveryFetch();
  const sdk = new AgentOSSDK({ fetch: recovery.fetch });

  await sdk.agentos.registerBundle({ bundleId: 'com.demo.app', appGroupId: 'group-a' });
  await sdk.agentos.registerBundle({ bundleId: 'com.demo.app', appGroupId: 'group-b' });

  const tasks = await sdk.cronkit.listTasks({ limit: 10 });

  assert.equal(tasks.length, 1);
  assert.equal(recovery.registerCountFor('com.demo.app', 'group-a'), 1);
  assert.equal(recovery.registerCountFor('com.demo.app', 'group-b'), 2);
  assert.deepEqual(recovery.tokensUsedFor('/cronkit/task/list'), ['token-group-b-v1', 'token-group-b-v2']);
});

test('shares refreshed token across cronkit, agentkit, and subscribe', async () => {
  const recovery = createAuthRecoveryFetch();
  const sdk = new AgentOSSDK({ fetch: recovery.fetch });

  await sdk.agentos.registerBundle({ bundleId: 'com.demo.app', appGroupId: 'group-a' });

  const tasks = await sdk.cronkit.listTasks({ limit: 10 });
  assert.equal(tasks.length, 1);

  const session = await sdk.agentkit.initSession();
  assert.equal(session.sessionId, 'sess-recovered');

  const welcome = deferred();
  class Handler extends AgentOSEventHandler {
    async onWelcome(event) {
      welcome.resolve(event.bundleId);
    }
    async onDone() {}
    async onError(error) {
      welcome.reject(error);
    }
  }

  await sdk.agentos.subscribe(new Handler(), { autoReconnect: false });
  assert.equal(await welcome.promise, 'com.demo.app');
  assert.equal(recovery.registerCountFor('com.demo.app', 'group-a'), 2);
  assert.deepEqual(recovery.tokensUsedFor('/agentkit/initSession'), ['token-group-a-v2']);
  assert.deepEqual(recovery.tokensUsedFor('/appkit/subscribe'), ['token-group-a-v2']);
  await sdk.dispose();
});

test('agentkit normalizes llmConfig defaults and legacy alias fields in outgoing payloads', async () => {
  const captured = {
    initSimpleBody: null,
    initSessionBody: null,
    chatBody: null
  };
  const sdk = new AgentOSSDK({
    fetch: createMockFetch((request) => {
      if (request.pathname === '/appkit/register') {
        return jsonResponse({ token: 'token-1' });
      }
      assert.equal(request.headers.authorization, 'Bearer token-1');
      if (request.pathname === '/agentkit/initSimple') {
        captured.initSimpleBody = request.body;
        return jsonResponse({ sessionId: 'simple-1' });
      }
      if (request.pathname === '/agentkit/initSession') {
        captured.initSessionBody = request.body;
        return jsonResponse({ sessionId: 'session-1' });
      }
      if (request.pathname === '/agentkit/chat/simple') {
        captured.chatBody = request.body;
        return jsonResponse({ ok: true });
      }
      throw new Error(`Unhandled request: ${request.method} ${request.pathname}`);
    })
  });

  await sdk.agentos.registerBundle({ bundleId: 'com.demo.app' });

  await sdk.agentkit.initSimple({
    simpleCapability: {
      systemPrompt: 'hello',
      llmConfig: {
        temperature: 0.5,
        supportsToolCalling: false,
        supportsDeepThinking: false
      }
    }
  });

  await sdk.agentkit.initSession({
    capability: {
      systemPrompt: 'hello',
      llmConfig: {
        modelId: 'qwen3-8b'
      }
    }
  });

  await sdk.agentkit.chatSimple({
    sessionId: 'session-1',
    userTask: {
      content: [{ type: 'text', message: 'hello' }],
      llmConfig: {
        temperature: 0.1
      }
    }
  });

  assert.equal(captured.initSimpleBody.llmConfig.temperature, 0.5);
  assert.equal(captured.initSimpleBody.llmConfig.maxTokens, 4096);
  assert.equal(captured.initSimpleBody.llmConfig.topP, 1);
  assert.equal(captured.initSimpleBody.llmConfig.supportsToolCall, false);
  assert.equal(captured.initSimpleBody.llmConfig.supportsReasoning, false);
  assert.equal('supportsToolCalling' in captured.initSimpleBody.llmConfig, false);
  assert.equal('supportsDeepThinking' in captured.initSimpleBody.llmConfig, false);

  assert.equal(captured.initSessionBody.timeoutSeconds, 3600);
  assert.equal(captured.initSessionBody.taskPipelineStrategy, 'parallel');
  assert.equal(captured.initSessionBody.llmConfig.maxTokens, 4096);
  assert.equal(captured.initSessionBody.llmConfig.supportsToolCall, true);
  assert.equal(captured.initSessionBody.llmConfig.supportsReasoning, true);

  assert.equal(captured.chatBody.llmConfig.temperature, 0.1);
  assert.equal(captured.chatBody.llmConfig.maxTokens, 4096);
  assert.equal(captured.chatBody.llmConfig.supportsToolCall, true);
  assert.equal(captured.chatBody.llmConfig.supportsReasoning, true);
});

test('modelkit chat stream yields parsed events until done', async () => {
  const sdk = new AgentOSSDK({
    fetch: createMockFetch((request) => {
      if (request.pathname === '/modelkit/chat/v1/chat/completions') {
        assert.equal(request.body.stream, true);
        return sseResponse([
          'data: {"id":"chunk-1","choices":[{"delta":{"content":"hel"}}]}\n\n',
          'data: {"id":"chunk-2","choices":[{"delta":{"content":"lo"}}]}\n\n',
          'data: [DONE]\n\n'
        ]);
      }
      throw new Error(`Unhandled request: ${request.method} ${request.pathname}`);
    })
  });

  const chunks = [];
  for await (const chunk of sdk.modelkit.chat.createStream({
    model: 'qwen3-1.7b',
    messages: [{ role: 'user', content: 'hello' }]
  })) {
    chunks.push(chunk.id);
  }

  assert.deepEqual(chunks, ['chunk-1', 'chunk-2']);
});

test('modelkit remote function stream yields parsed events until done', async () => {
  const sdk = new AgentOSSDK({
    fetch: createMockFetch((request) => {
      if (request.pathname === '/modelkit/chat/v1/chat/completions') {
        assert.equal(request.body.stream, true);
        return sseResponse([
          'data: {"id":"rf-1","choices":[{"delta":{"content":"tool"}}]}\n\n',
          'data: {"id":"rf-2","choices":[{"delta":{"content":"call"}}]}\n\n',
          'data: [DONE]\n\n'
        ]);
      }
      throw new Error(`Unhandled request: ${request.method} ${request.pathname}`);
    })
  });

  const chunks = [];
  for await (const chunk of sdk.modelkit.chat.createRemoteFunctionStream({
    model: 'qwen3-1.7b',
    messages: [{ role: 'user', content: 'hello' }]
  })) {
    chunks.push(chunk.id);
  }

  assert.deepEqual(chunks, ['rf-1', 'rf-2']);
});

test('modelkit chat serializes advanced request fields with OpenAI-style names', async () => {
  let capturedBody = null;
  const sdk = new AgentOSSDK({
    fetch: createMockFetch((request) => {
      if (request.pathname === '/modelkit/chat/v1/chat/completions') {
        capturedBody = request.body;
        return jsonResponse({ id: 'chatcmpl-1', choices: [] });
      }
      throw new Error(`Unhandled request: ${request.method} ${request.pathname}`);
    })
  });

  await sdk.modelkit.chat.create({
    model: 'gpt-4.1',
    messages: [{ role: 'user', content: 'hello' }],
    logitBias: { 42: 1 },
    topLogprobs: 3,
    reasoningEffort: 'medium',
    enableThinking: true
  });

  assert.deepEqual(capturedBody.logit_bias, { 42: 1 });
  assert.equal(capturedBody.top_logprobs, 3);
  assert.equal(capturedBody.reasoning_effort, 'medium');
  assert.equal(capturedBody.enable_thinking, true);
  assert.equal('logitBias' in capturedBody, false);
  assert.equal('topLogprobs' in capturedBody, false);
  assert.equal('reasoningEffort' in capturedBody, false);
  assert.equal('enableThinking' in capturedBody, false);
});

test('modelkit listModels normalizes task, capabilities, and remote flags', async () => {
  const sdk = new AgentOSSDK({
    fetch: createMockFetch((request) => {
      if (request.pathname === '/modelkit/models') {
        return jsonResponse([
          {
            id: 'qwen3-8b',
            name: 'Qwen3 8B',
            alias: 'qwen3-8b',
            task: 'chat',
            contextWindowSize: 8192,
            isRemote: false,
            isCustom: false
          },
          {
            id: 'qwen2.5-vl-7b',
            name: 'Qwen2.5 VL 7B',
            alias: 'qwen2.5-vl-7b',
            task: 'chat',
            input: ['text', 'image'],
            capabilities: { vision: true },
            contextWindowSize: 32768
          },
          {
            id: 'embed-1',
            name: 'Embedder',
            alias: 'embed-1',
            task: 'embedding',
            isRemote: true,
            isCustom: true
          }
        ]);
      }
      throw new Error(`Unhandled request: ${request.method} ${request.pathname}`);
    })
  });

  const models = await sdk.modelkit.listModels();

  assert.equal(models.length, 3);
  assert.equal(models[0].id, 'qwen3-8b');
  assert.equal(models[0].task, 'chat');
  assert.equal(models[0].capabilities.vision, false);
  assert.equal(models[0].isRemote, false);
  assert.equal(models[1].capabilities.vision, true);
  assert.deepEqual(models[1].input, ['text', 'image']);
  assert.equal(models[2].id, 'embed-1');
  assert.equal(models[2].task, 'embedding');
  assert.equal(models[2].isRemote, true);
  assert.equal(models[2].isCustom, true);

  const chatModels = await sdk.modelkit.listModelsByTask('chat');
  assert.deepEqual(chatModels.map((m) => m.id), ['qwen3-8b', 'qwen2.5-vl-7b']);
});

test('supports direct cronkit client usage', async () => {
  const client = new CronKitClient(new AgentOSSDK({
    fetch: createMockFetch((request) => {
      if (request.pathname === '/cronkit/task/list') {
        assert.equal(request.headers.authorization, 'Bearer sk-demo');
        assert.equal(request.searchParams.get('enabled'), 'true');
        return jsonResponse([
          {
            cronId: 'cron-1',
            name: 'daily-report',
            schedule: '0 9 * * *',
            enabled: true,
            status: 'active'
          }
        ]);
      }
      throw new Error(`Unhandled request: ${request.method} ${request.pathname}`);
    })
  }).apiClient);

  const tasks = await client.listTasks('sk-demo', { enabled: true });

  assert.equal(tasks.length, 1);
  assert.equal(tasks[0].name, 'daily-report');
});

test('api client enforces separate connect and receive timeouts', async () => {
  const connectTimeoutSdk = new AgentOSSDK({
    connectTimeout: 10,
    receiveTimeout: 100,
    fetch: async () => {
      await sleep(50);
      return jsonResponse({ version: '1.2.3' });
    }
  });

  await assert.rejects(
    connectTimeoutSdk.agentos.getVersion(),
    /Connection timeout for \/version/
  );

  const receiveTimeoutSdk = new AgentOSSDK({
    connectTimeout: 100,
    receiveTimeout: 10,
    fetch: async () => delayedJsonResponse({ version: '1.2.3' }, 50)
  });

  await assert.rejects(
    receiveTimeoutSdk.agentos.getVersion(),
    /Receive timeout for \/version/
  );
});

test('agentos subscribe emits reconnect events after passive close', async () => {
  let subscribeCount = 0;
  const statuses = [];
  const handlerSignals = deferred();
  const sdk = new AgentOSSDK({
    fetch: createMockFetch((request) => {
      if (request.pathname === '/appkit/register') {
        return jsonResponse({ token: 'token-1' });
      }
      if (request.pathname === '/appkit/subscribe') {
        subscribeCount += 1;
        return sseResponse([
          'event: welcome\ndata: {"bundleId":"com.demo.app"}\n\n'
        ]);
      }
      throw new Error(`Unhandled request: ${request.method} ${request.pathname}`);
    })
  });
  await sdk.agentos.registerBundle({ bundleId: 'com.demo.app' });
  sdk.agentos.connectionEvents.subscribe((event) => {
    statuses.push(event.status);
  });

  class ReconnectHandler extends AgentOSEventHandler {
    async onWelcome() {
      if (subscribeCount >= 2) {
        handlerSignals.resolve();
      }
    }

    async onDone() {}

    async onError(error) {
      handlerSignals.reject(error);
    }
  }

  await sdk.agentos.subscribe(new ReconnectHandler(), {
    autoReconnect: true,
    maxReconnectAttempts: 1,
    reconnectDelay: 0
  });

  await handlerSignals.promise;
  assert.deepEqual(statuses, [
    AgentOSSubscribeConnectionStatus.connected,
    AgentOSSubscribeConnectionStatus.reconnecting,
    AgentOSSubscribeConnectionStatus.reconnected,
    AgentOSSubscribeConnectionStatus.connected
  ]);

  await sdk.dispose();
});

test('agentos subscribe does not emit connected when subscription setup fails before stream opens', async () => {
  const statuses = [];
  const sdk = new AgentOSSDK({
    fetch: createMockFetch((request) => {
      if (request.pathname === '/appkit/register') {
        return jsonResponse({ token: 'token-1' });
      }
      if (request.pathname === '/appkit/subscribe') {
        return jsonResponse({ error: 'boom' }, 500);
      }
      throw new Error(`Unhandled request: ${request.method} ${request.pathname}`);
    })
  });

  await sdk.agentos.registerBundle({ bundleId: 'com.demo.app' });
  sdk.agentos.connectionEvents.subscribe((event) => {
    statuses.push(event.status);
  });

  class Handler extends AgentOSEventHandler {
    async onWelcome() {}
    async onDone() {}
    async onError() {}
  }

  await assert.rejects(
    sdk.agentos.subscribe(new Handler(), {
      autoReconnect: true,
      maxReconnectAttempts: 1,
      reconnectDelay: 0
    }),
    /Request failed with status 500/
  );

  assert.deepEqual(statuses, [AgentOSSubscribeConnectionStatus.disconnected]);
});

test('dispose closes connection event subscriptions', async () => {
  const sdk = new AgentOSSDK({
    fetch: createMockFetch(() => {
      throw new Error('No network calls expected');
    })
  });
  let count = 0;
  sdk.agentos.connectionEvents.subscribe(() => {
    count += 1;
  });

  await sdk.dispose();
  sdk.emitAgentOsConnectionEvent(AgentOSSubscribeConnectionStatus.connected);

  assert.equal(count, 0);
});

test('default stream function call handling emits ERROR when tool is missing', async () => {
  const handler = new class extends AgentMessageHandler {
    async onMessage() {}
    async onChunk() {}
    async onDone() {}
    async onError(error) {
      throw error;
    }
  }();
  const events = [];

  await handler.onStreamFunctionCall(
    'sess-1',
    {
      id: 'call-1',
      name: 'missing_tool',
      arguments: {}
    },
    (event) => {
      events.push(event);
    }
  );

  assert.equal(events.length, 1);
  assert.equal(events[0].event, EventType.ERROR);
  assert.equal(events[0].toolReturn.id, 'call-1');
});

test('dart-like structured source layout exists in the TypeScript project', () => {
  const expectedFiles = [
    '../src/client/agentos/agentos_sdk.ts',
    '../src/client/agentos/agentos_event_handler.ts',
    '../src/client/agentos/agentos_connection_event.ts',
    '../src/client/agentkit/agentkit_client.ts',
    '../src/client/agentkit/agent_message_handler.ts',
    '../src/client/agentkit/agents_dto.ts',
    '../src/client/agentkit/capability_dto.ts',
    '../src/client/agentkit/common_dto.ts',
    '../src/client/agentkit/messages_dto.ts',
    '../src/client/agentkit/planning_dto.ts',
    '../src/client/agentkit/sessions_dto.ts',
    '../src/client/appkit/appkit_client.ts',
    '../src/client/appkit/dto.ts',
    '../src/client/cronkit/cronkit_client.ts',
    '../src/client/cronkit/dto.ts',
    '../src/client/modelkit/modelkit_client.ts',
    '../src/client/toolkit/toolkit_client.ts',
    '../src/client/systemkit/systemkit_client.ts',
    '../src/client/systemkit/dto.ts',
    '../src/client/shared/dto.ts'
  ];

  for (const file of expectedFiles) {
    assert.equal(existsSync(new URL(file, import.meta.url)), true, `${file} should exist`);
  }
});

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function jsonResponse(body, status = 200) {
  return new Response(body === undefined ? undefined : JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json'
    }
  });
}

function sseResponse(chunks) {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream({
      start(controller) {
        for (const chunk of chunks) {
          controller.enqueue(encoder.encode(chunk));
        }
        controller.close();
      }
    }),
    {
      status: 200,
      headers: {
        'content-type': 'text/event-stream'
      }
    }
  );
}

function delayedJsonResponse(body, delayMs) {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream({
      start(controller) {
        setTimeout(() => {
          controller.enqueue(encoder.encode(JSON.stringify(body)));
          controller.close();
        }, delayMs);
      }
    }),
    {
      status: 200,
      headers: {
        'content-type': 'application/json'
      }
    }
  );
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function createMockFetch(handler) {
  return async (input, init = {}) => {
    const requestUrl = typeof input === 'string' ? input : input.url;
    const method = init.method ?? (typeof input === 'string' ? 'GET' : input.method);
    const headers = normalizeHeaders(init.headers ?? (typeof input === 'string' ? undefined : input.headers));
    const bodyText = typeof init.body === 'string'
      ? init.body
      : init.body instanceof Uint8Array
        ? new TextDecoder().decode(init.body)
        : undefined;
    return handler({
      url: requestUrl,
      method,
      pathname: new URL(requestUrl).pathname,
      searchParams: new URL(requestUrl).searchParams,
      headers,
      body: bodyText === undefined || bodyText.length === 0 ? undefined : JSON.parse(bodyText)
    });
  };
}

function createAuthRecoveryFetch() {
  const registerCounts = new Map();
  const tokensByPath = new Map();

  const fetch = createMockFetch((request) => {
    if (request.pathname === '/appkit/register') {
      const bundleId = request.body.bundleId;
      const appGroupId = request.body.appGroupId ?? '';
      const key = `${bundleId}::${appGroupId}`;
      const count = (registerCounts.get(key) ?? 0) + 1;
      registerCounts.set(key, count);
      return jsonResponse({
        token: `token-${appGroupId || 'default'}-v${count}`,
        bundleId,
        appGroupId: appGroupId || undefined
      });
    }

    const token = String(request.headers.authorization ?? '').replace(/^Bearer\s+/, '');
    recordToken(tokensByPath, request.pathname, token);

    if (request.pathname === '/cronkit/task/list') {
      if (token === 'token-group-a-v1' || token === 'token-group-b-v1') {
        return jsonResponse({ error: 'invalid app token' }, 400);
      }
      return jsonResponse([{ cronId: 'cron-1', name: 'daily-report', schedule: '* * * * *', enabled: true, status: 'active' }]);
    }

    if (request.pathname === '/cronkit/task') {
      if (token === 'token-group-a-v1') {
        return jsonResponse({ error: 'unauthorized' }, 401);
      }
      return jsonResponse({
        cronId: 'cron-1',
        name: 'daily-report',
        schedule: '* * * * *',
        source: 'app',
        enabled: true,
        status: 'active',
        concurrency: 'skipIfRunning',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        spec: { systemPrompt: 'system', content: [] }
      });
    }

    if (request.pathname === '/agentkit/initSession') {
      if (token === 'token-group-a-v1') {
        return jsonResponse({ error: 'forbidden' }, 403);
      }
      return jsonResponse({ sessionId: 'sess-recovered' });
    }

    if (request.pathname === '/appkit/subscribe') {
      return sseResponse([
        'event: welcome\ndata: {"bundleId":"com.demo.app"}\n\n'
      ]);
    }

    throw new Error(`Unhandled request: ${request.method} ${request.pathname}`);
  });

  return {
    fetch,
    registerCountFor(bundleId, appGroupId) {
      return registerCounts.get(`${bundleId}::${appGroupId}`) ?? 0;
    },
    tokensUsedFor(pathname) {
      return tokensByPath.get(pathname) ?? [];
    }
  };
}

function recordToken(store, pathname, token) {
  const items = store.get(pathname) ?? [];
  items.push(token);
  store.set(pathname, items);
}

function normalizeHeaders(headers) {
  if (!headers) {
    return {};
  }
  if (headers instanceof Headers) {
    return Object.fromEntries(headers.entries());
  }
  if (Array.isArray(headers)) {
    return Object.fromEntries(headers);
  }
  return { ...headers };
}
