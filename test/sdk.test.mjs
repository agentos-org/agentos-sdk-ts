import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

import {
  AgentMessageHandler,
  AppEventType,
  AgentOSEventHandler,
  AgentOSSDK,
  AgentOSSubscribeConnectionStatus,
  ApiClient,
  createAgentOSBridgeFetch,
  CronKitClient,
  EventType,
  FunctionCallLifecycleError,
  getAgentOSBridgeContext,
  HistoryTurnStatus,
  isOpenToolProvisionFailedEvent,
  isOpenToolProvisionSucceededEvent,
  isAgentOSBridgeAvailable,
  ModelSource,
  normalizeCapability,
  parseSse,
  ToolKitClient
} from '../dist/index.js';
import * as openToolExports from '../dist/opentool.js';
import * as thirdPartyExports from '../dist/third_party.js';

test('system, appkit, cronkit, modelkit, and toolkit flows work through the sdk', async () => {
  assert.equal(typeof openToolExports.SchemaType, 'function');
  for (const legacyDaemonExport of [
    'DaemonClient',
    'DAEMON_DEFAULT_PORT',
    'DAEMON_DEFAULT_PREFIX',
    'DaemonRegisterInfo',
    'DaemonRegisterResult'
  ]) {
    assert.equal(legacyDaemonExport in openToolExports, false);
    assert.equal(legacyDaemonExport in thirdPartyExports, false);
  }
  const state = {
    registerCount: 0,
    lastRegisterBody: null,
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
        state.lastRegisterBody = request.body;
        return jsonResponse({
          token: `token-${state.registerCount}`,
          bundleId: 'com.demo.app',
          appGroupId: 'com.demo.group',
          opentoolServers: [
            {
              ref: 'websearch',
              server: {
                namespace: 'native',
                name: 'opentool-server-websearch',
                version: '1.2.0'
              },
              status: 'starting'
            },
            {
              ref: 'missing',
              name: 'opentool-server-missing',
              status: 'notFound'
            },
            {
              ref: 'stock',
              server: {
                namespace: 'native',
                name: 'opentool-server-stock',
                version: '1.0.0'
              },
              status: 'starting'
            }
          ]
        });
      }
      if (request.pathname === '/base/appkit/subscribe') {
        assert.equal(request.headers.authorization, 'Bearer token-1');
        return sseResponse([
          'event: welcome\ndata: {"bundleId":"com.demo.app"}\n\n',
          'id: evt-1\nevent: appEvent\ndata: {"version":1,"id":"evt-1","type":"toolkit.provision.succeeded","source":"toolkit","time":"2026-07-15T10:30:00.000Z","subject":"websearch","data":{"ref":"websearch","name":"opentool-server-websearch","status":"running","server":{"namespace":"native","name":"opentool-server-websearch","version":"1.2.0"},"id":"tool-websearch"}}\n\n',
          'id: evt-2\nevent: appEvent\ndata: {"version":1,"id":"evt-2","type":"toolkit.provision.failed","source":"toolkit","time":"2026-07-15T10:30:01.000Z","subject":"stock","data":{"ref":"stock","name":"opentool-server-stock","status":"failed","server":{"namespace":"native","name":"opentool-server-stock","version":"1.0.0"},"error":{"code":"startFailed","message":"process exited"}}}\n\n'
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
          sessionId: request.body.sessionId,
          timezone: request.body.timezone,
          enabled: true,
          status: 'enabled',
          concurrency: 'skipIfRunning',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
          nextRunAt: '2026-01-02T01:00:00.000Z',
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
        return jsonResponse([{
          id: 'tool-1',
          alias: 'demo',
          host: '127.0.0.1',
          port: 9001,
          status: 'running',
          serverId: 'srv-1',
          server: {
            namespace: 'demo-namespace',
            name: 'demo',
            version: '1.0.0'
          },
          materializedArtifactDigest: 'sha256:demo',
          contentState: 'current'
        }]);
      }
      if (request.pathname === '/base/toolkit/tool-1/load') {
        return jsonResponse({ opentool: '1.0.0', info: { title: 'demo' } });
      }
      if (request.pathname === '/base/toolkit/events') {
        state.lastToolkitHeaders = request.headers;
        return sseResponse([
          'event: ready\ndata: {}\n\n',
          'event: updated\ndata: {"type":"updated","reason":"contentChanged","tool":{"id":"tool-1"},"occurredAt":"2026-08-13T06:00:00.000Z"}\n\n'
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
    appGroupId: 'com.demo.group',
    opentoolServers: [
      { ref: 'websearch', name: 'opentool-server-websearch' },
      { ref: 'missing', name: 'opentool-server-missing' },
      { ref: 'stock', name: 'opentool-server-stock' }
    ]
  });
  assert.equal(registration.token, 'token-1');
  assert.deepEqual(state.lastRegisterBody.opentoolServers, [
    { ref: 'websearch', name: 'opentool-server-websearch' },
    { ref: 'missing', name: 'opentool-server-missing' },
    { ref: 'stock', name: 'opentool-server-stock' }
  ]);
  assert.equal(registration.opentoolServers[0].status, 'starting');
  assert.equal(registration.opentoolServers[0].server.namespace, 'native');
  assert.equal(registration.opentoolServers[0].server.version, '1.2.0');
  assert.equal(registration.opentoolServers[0].id, undefined);
  assert.equal(registration.opentoolServers[1].status, 'notFound');

  const seen = [];
  class DemoHandler extends AgentOSEventHandler {
    async onWelcome(welcome) {
      seen.push(['welcome', welcome.bundleId]);
    }

    async onAppEvent(event) {
      if (isOpenToolProvisionSucceededEvent(event)) {
        assert.equal(event.type, AppEventType.toolkitProvisionSucceeded);
        seen.push(['appEvent', event.subject, event.data.status, event.data.id]);
      } else if (isOpenToolProvisionFailedEvent(event)) {
        assert.equal(event.type, AppEventType.toolkitProvisionFailed);
        seen.push(['appEvent', event.subject, event.data.status, event.data.error.code]);
      }
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
    ['appEvent', 'websearch', 'running', 'tool-websearch'],
    ['appEvent', 'stock', 'failed', 'startFailed'],
    ['done']
  ]);
  assert.equal(sdk.agentos.connectionStatus, AgentOSSubscribeConnectionStatus.disconnected);

  const cronTask = await sdk.cronkit.createTask({
    request: {
      name: 'daily',
      schedule: '0 0 * * *',
      sessionId: 'session-cron-1',
      timezone: 'Asia/Shanghai',
      spec: {
        systemPrompt: 'You are a scheduled agent.',
        content: [{ type: 'text', message: 'Generate the report.' }]
      }
    }
  });
  assert.equal(cronTask.spec.timeoutSeconds, 3600);
  assert.equal(state.lastCronCreateBody.concurrency, 'skipIfRunning');
  assert.equal(state.lastCronCreateBody.enabled, true);
  assert.equal(state.lastCronCreateBody.sessionId, 'session-cron-1');
  assert.equal(state.lastCronCreateBody.timezone, 'Asia/Shanghai');
  assert.equal('userId' in state.lastCronCreateBody, false);
  assert.equal(cronTask.sessionId, 'session-cron-1');
  assert.equal(cronTask.timezone, 'Asia/Shanghai');
  assert.equal(cronTask.nextRunAt, '2026-01-02T01:00:00.000Z');

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
  assert.equal(tools[0].server?.namespace, 'demo-namespace');
  assert.equal(tools[0].server?.name, 'demo');
  assert.equal(tools[0].server?.version, '1.0.0');
  assert.equal(tools[0].materializedArtifactDigest, 'sha256:demo');
  assert.equal(tools[0].contentState, 'current');
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

test('agentkit preserves large functionCall payloads across arbitrary SSE byte chunks', async (t) => {
  const cases = [
    { name: '40KB one byte LF', contentLength: 40_000, chunker: fixedChunkSize(1), lineEnding: '\n' },
    { name: '40KB seven bytes CRLF', contentLength: 40_000, chunker: fixedChunkSize(7), lineEnding: '\r\n' },
    { name: '40KB 1KB LF', contentLength: 40_000, chunker: fixedChunkSize(1024), lineEnding: '\n' },
    { name: '40KB random chunks CRLF', contentLength: 40_000, chunker: randomChunkSize(41), lineEnding: '\r\n' },
    { name: '100KB random chunks LF', contentLength: 100_000, chunker: randomChunkSize(101), lineEnding: '\n' },
    { name: '160KB one byte CRLF', contentLength: 160_000, chunker: fixedChunkSize(1), lineEnding: '\r\n' },
    { name: '160KB random chunks LF', contentLength: 160_000, chunker: randomChunkSize(161), lineEnding: '\n' }
  ];

  for (const testCase of cases) {
    await t.test(testCase.name, async () => {
      const childSessionId = '2076928786900848640';
      const callId = `call-large-${testCase.contentLength}-${testCase.name.replaceAll(' ', '-')}`;
      const content = createLargeFunctionCallContent(testCase.contentLength);
      const payload = JSON.stringify({
        sessionId: childSessionId,
        functionCall: {
          id: callId,
          name: 'write_presentation_html',
          arguments: { content }
        }
      });
      const separator = testCase.lineEnding;
      const rawSse = `event:functionCall${separator}data:${payload}${separator}${separator}`;
      const rawBytes = new TextEncoder().encode(rawSse);
      const callbackRequests = [];
      const lifecycle = [];
      let handlerCalls = 0;

      const sdk = new AgentOSSDK({
        fetch: createMockFetch((request) => {
          if (request.pathname === '/appkit/register') {
            return jsonResponse({ token: 'token-large-function-call' });
          }
          assert.equal(request.headers.authorization, 'Bearer token-large-function-call');
          if (request.pathname === '/agentkit/chat') {
            return chunkedSseByteResponse(rawBytes, testCase.chunker);
          }
          if (request.pathname === '/agentkit/callback') {
            lifecycle.push('callback');
            callbackRequests.push(request);
            return jsonResponse({ ok: true });
          }
          throw new Error(`Unhandled request: ${request.method} ${request.pathname}`);
        })
      });
      await sdk.agentos.registerBundle({ bundleId: 'com.demo.large-function-call' });

      const done = deferred();
      class Handler extends AgentMessageHandler {
        async onFunctionCall(sessionId, functionCall) {
          lifecycle.push('handler');
          handlerCalls += 1;
          assert.equal(sessionId, childSessionId);
          assert.equal(functionCall.id, callId);
          assert.equal(functionCall.name, 'write_presentation_html');
          assert.equal(functionCall.arguments.content, content);
          return { id: functionCall.id, result: { ok: true } };
        }

        async onMessage() {}
        async onChunk() {}
        async onDone() {
          lifecycle.push('done');
          done.resolve();
        }
        async onError(error) {
          done.reject(error);
        }
      }

      await sdk.agentkit.chat(
        { sessionId: '2076928786959568896' },
        { content: [] },
        new Handler()
      );
      await done.promise;

      assert.equal(handlerCalls, 1);
      assert.equal(callbackRequests.length, 1);
      assert.equal(callbackRequests[0].searchParams.get('sessionId'), childSessionId);
      assert.equal(callbackRequests[0].body.id, callId);
      assert.deepEqual(callbackRequests[0].body.result, { ok: true });
      assert.deepEqual(lifecycle, ['handler', 'callback', 'done']);
      assert.ok(rawBytes.byteLength > testCase.contentLength);
    });
  }
});

test('agentkit reports handler failures to callback and aborts the current SSE stream', async () => {
  const functionCall = {
    id: 'call-handler-failure',
    name: 'write_presentation_html',
    arguments: { content: '<main>large content omitted from errors</main>' }
  };
  const callbackRequests = [];
  let streamCancelCount = 0;
  let doneCount = 0;
  const observedError = deferred();
  const sdk = new AgentOSSDK({
    fetch: createMockFetch((request) => {
      if (request.pathname === '/appkit/register') {
        return jsonResponse({ token: 'token-handler-failure' });
      }
      if (request.pathname === '/agentkit/chat') {
        return openSseResponse(functionCallSse('child-handler-failure', functionCall), () => {
          streamCancelCount += 1;
        });
      }
      if (request.pathname === '/agentkit/callback') {
        callbackRequests.push(request);
        return jsonResponse({ ok: true });
      }
      throw new Error(`Unhandled request: ${request.method} ${request.pathname}`);
    })
  });
  await sdk.agentos.registerBundle({ bundleId: 'com.demo.handler-failure' });

  class Handler extends AgentMessageHandler {
    async onFunctionCall() {
      throw new Error('application handler failed');
    }
    async onMessage() {}
    async onChunk() {}
    async onDone() {
      doneCount += 1;
    }
    async onError(error) {
      observedError.resolve(error);
    }
  }

  await sdk.agentkit.chat({ sessionId: 'root-session' }, { content: [] }, new Handler());
  const error = await observedError.promise;

  assert.ok(error instanceof FunctionCallLifecycleError);
  assert.equal(error.stage, 'function_call_handler_failed');
  assert.equal(error.sessionId, 'child-handler-failure');
  assert.equal(error.callId, functionCall.id);
  assert.equal(error.functionName, functionCall.name);
  assert.equal(error.callbackMode, 'callback');
  assert.equal(error.message.includes(functionCall.arguments.content), false);
  assert.equal(callbackRequests.length, 1);
  assert.equal(callbackRequests[0].searchParams.get('sessionId'), 'child-handler-failure');
  assert.deepEqual(callbackRequests[0].body, {
    id: functionCall.id,
    result: {
      error: 'FunctionCallHandlerError',
      stage: 'function_call_handler_failed',
      message: 'application handler failed'
    }
  });
  assert.equal(streamCancelCount, 1);
  assert.equal(doneCount, 0);
});

test('agentkit reports stream handler failures through one terminal ERROR callback', async () => {
  const functionCall = {
    id: 'call-stream-handler-failure',
    name: 'stream_write',
    arguments: { content: 'payload' },
    stream: true
  };
  const streamCallbackRequests = [];
  let streamCancelCount = 0;
  const observedError = deferred();
  const sdk = new AgentOSSDK({
    fetch: createMockFetch((request) => {
      if (request.pathname === '/appkit/register') {
        return jsonResponse({ token: 'token-stream-handler-failure' });
      }
      if (request.pathname === '/agentkit/chat') {
        return openSseResponse(functionCallSse('child-stream-failure', functionCall), () => {
          streamCancelCount += 1;
        });
      }
      if (request.pathname === '/agentkit/streamCallback') {
        streamCallbackRequests.push(request);
        return jsonResponse({ ok: true });
      }
      throw new Error(`Unhandled request: ${request.method} ${request.pathname}`);
    })
  });
  await sdk.agentos.registerBundle({ bundleId: 'com.demo.stream-handler-failure' });

  class Handler extends AgentMessageHandler {
    async onStreamFunctionCall() {
      throw new Error('stream application handler failed');
    }
    async onMessage() {}
    async onChunk() {}
    async onDone() {}
    async onError(error) {
      observedError.resolve(error);
    }
  }

  await sdk.agentkit.chat({ sessionId: 'root-session' }, { content: [] }, new Handler());
  const error = await observedError.promise;

  assert.ok(error instanceof FunctionCallLifecycleError);
  assert.equal(error.stage, 'function_call_handler_failed');
  assert.equal(error.callbackMode, 'streamCallback');
  assert.equal(streamCallbackRequests.length, 1);
  assert.equal(streamCallbackRequests[0].searchParams.get('sessionId'), 'child-stream-failure');
  assert.deepEqual(streamCallbackRequests[0].body, {
    event: EventType.ERROR,
    toolReturn: {
      id: functionCall.id,
      result: {
        error: 'FunctionCallHandlerError',
        stage: 'function_call_handler_failed',
        message: 'stream application handler failed'
      }
    }
  });
  assert.equal(streamCancelCount, 1);
});

test('agentkit exposes callback POST failures with function-call context', async () => {
  const functionCall = {
    id: 'call-callback-failure',
    name: 'write_presentation_html',
    arguments: { content: 'payload' }
  };
  let callbackCount = 0;
  let streamCancelCount = 0;
  const observedError = deferred();
  const sdk = new AgentOSSDK({
    fetch: createMockFetch((request) => {
      if (request.pathname === '/appkit/register') {
        return jsonResponse({ token: 'token-callback-failure' });
      }
      if (request.pathname === '/agentkit/chat') {
        return openSseResponse(functionCallSse('child-callback-failure', functionCall), () => {
          streamCancelCount += 1;
        });
      }
      if (request.pathname === '/agentkit/callback') {
        callbackCount += 1;
        return jsonResponse({ error: 'callback unavailable' }, 500);
      }
      throw new Error(`Unhandled request: ${request.method} ${request.pathname}`);
    })
  });
  await sdk.agentos.registerBundle({ bundleId: 'com.demo.callback-failure' });

  class Handler extends AgentMessageHandler {
    async onFunctionCall(_sessionId, call) {
      return { id: call.id, result: { ok: true } };
    }
    async onMessage() {}
    async onChunk() {}
    async onDone() {}
    async onError(error) {
      observedError.resolve(error);
    }
  }

  await sdk.agentkit.chat({ sessionId: 'root-session' }, { content: [] }, new Handler());
  const error = await observedError.promise;

  assert.ok(error instanceof FunctionCallLifecycleError);
  assert.equal(error.stage, 'function_call_callback_failed');
  assert.equal(error.sessionId, 'child-callback-failure');
  assert.equal(error.callId, functionCall.id);
  assert.equal(error.functionName, functionCall.name);
  assert.equal(error.callbackMode, 'callback');
  assert.equal(callbackCount, 1);
  assert.equal(streamCancelCount, 1);
});

test('agentkit exposes malformed functionCall events as parse-stage failures', async () => {
  let streamCancelCount = 0;
  const observedError = deferred();
  const sdk = new AgentOSSDK({
    fetch: createMockFetch((request) => {
      if (request.pathname === '/appkit/register') {
        return jsonResponse({ token: 'token-parse-failure' });
      }
      if (request.pathname === '/agentkit/chat') {
        return openSseResponse(
          'event: functionCall\ndata: {"sessionId":"child-parse-failure"}\n\n',
          () => {
            streamCancelCount += 1;
          }
        );
      }
      throw new Error(`Unhandled request: ${request.method} ${request.pathname}`);
    })
  });
  await sdk.agentos.registerBundle({ bundleId: 'com.demo.parse-failure' });

  class Handler extends AgentMessageHandler {
    async onMessage() {}
    async onChunk() {}
    async onDone() {}
    async onError(error) {
      observedError.resolve(error);
    }
  }

  await sdk.agentkit.chat({ sessionId: 'root-session' }, { content: [] }, new Handler());
  const error = await observedError.promise;

  assert.ok(error instanceof FunctionCallLifecycleError);
  assert.equal(error.stage, 'function_call_parse_failed');
  assert.equal(error.sessionId, 'child-parse-failure');
  assert.equal(streamCancelCount, 1);
});

test('parseSse removes only the optional leading field space', async () => {
  const events = [];
  for await (const event of parseSse(sseResponse([
    'event: custom-event  \n',
    'data: value with trailing spaces  \n\n'
  ]))) {
    events.push(event);
  }

  assert.deepEqual(events, [{
    event: 'custom-event  ',
    data: 'value with trailing spaces  '
  }]);

  const eofBytes = new TextEncoder().encode('event: final\ndata: 中文');
  const eofEvents = [];
  for await (const event of parseSse(chunkedSseByteResponse(eofBytes, fixedChunkSize(1)))) {
    eofEvents.push(event);
  }
  assert.deepEqual(eofEvents, [{ event: 'final', data: '中文' }]);
});

test('agentkit initSession retries once after a 401 by re-registering the bundle', async () => {
  const state = {
    registerCount: 0,
    initSessionCalls: 0
  };
  const sdk = new AgentOSSDK({
    fetch: createMockFetch((request) => {
      if (request.pathname === '/appkit/register') {
        state.registerCount += 1;
        return jsonResponse({ token: `token-${state.registerCount}` });
      }
      if (request.pathname === '/agentkit/initSession') {
        state.initSessionCalls += 1;
        if (request.headers.authorization === 'Bearer token-1') {
          return jsonResponse({ error: 'invalid app token' }, 401);
        }
        assert.equal(request.headers.authorization, 'Bearer token-2');
        return jsonResponse({ sessionId: 'session-1' });
      }
      throw new Error(`Unhandled request: ${request.method} ${request.pathname}`);
    })
  });

  await sdk.agentos.registerBundle({ bundleId: 'com.demo.app', appGroupId: 'grp' });
  const session = await sdk.agentkit.initSession();

  assert.equal(session.sessionId, 'session-1');
  assert.equal(state.registerCount, 2);
  assert.equal(state.initSessionCalls, 2);
});

test('agentkit forwards history pagination and returns root task metadata', async () => {
  const sdk = new AgentOSSDK({
    fetch: createMockFetch((request) => {
      if (request.pathname === '/appkit/register') {
        return jsonResponse({ token: 'token-1' });
      }
      if (request.pathname === '/agentkit/history') {
        assert.equal(request.headers.authorization, 'Bearer token-1');
        assert.equal(request.searchParams.get('sessionId'), 'session-1');
        assert.equal(request.searchParams.get('page'), '2');
        assert.equal(request.searchParams.get('pageSize'), '50');
        return jsonResponse([{
          sessionId: 'session-1',
          originalTaskId: 'root-task',
          taskId: 'child-task',
          role: 'agent',
          to: 'user',
          type: 'taskStatus',
          content: {
            status: 'done',
            taskId: 'child-task'
          },
          createTime: '2026-07-10T00:00:00.000Z'
        }]);
      }
      throw new Error(`Unhandled request: ${request.method} ${request.pathname}`);
    })
  });

  await sdk.agentos.registerBundle({ bundleId: 'com.demo.app' });
  const messages = await sdk.agentkit.history({
    sessionId: 'session-1',
    page: 2,
    pageSize: 50
  });

  assert.equal(messages[0].originalTaskId, 'root-task');
  assert.equal(messages[0].content.taskId, 'child-task');
});

test('agentkit loads summary-first history and lazily loads process messages', async () => {
  const requests = [];
  const summaries = [
    {
      originalTaskId: 'task-running',
      sessionId: 'root-session',
      userMessage: {
        sessionId: 'root-session',
        originalTaskId: 'task-running',
        taskId: 'task-running',
        role: 'user',
        to: 'agent',
        type: 'contentList',
        content: [{ type: 'text', message: 'hello' }],
        createTime: '2026-07-12T00:00:00.000Z'
      },
      finalMessage: null,
      status: 'running',
      error: null,
      createdAt: '2026-07-12T00:00:00.000Z',
      completedAt: null,
      durationMs: null,
      usage: null,
      processMessageCount: 3
    },
    {
      originalTaskId: 'task-done',
      sessionId: 'root-session',
      userMessage: null,
      finalMessage: {
        sessionId: 'child-final',
        originalTaskId: 'task-done',
        taskId: 'child-task',
        role: 'agent',
        to: 'user',
        type: 'contentList',
        content: [{ type: 'text', message: 'done' }],
        createTime: '2026-07-12T00:00:02.000Z'
      },
      status: 'done',
      error: null,
      createdAt: null,
      completedAt: '2026-07-12T00:00:02.000Z',
      durationMs: 2000,
      usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
      processMessageCount: 5
    },
    {
      originalTaskId: 'task-error', sessionId: 'root-session', userMessage: null, finalMessage: null,
      status: 'error', error: 'failed', createdAt: null, completedAt: null,
      durationMs: null, usage: null, processMessageCount: 1
    },
    {
      originalTaskId: 'task-stopped', sessionId: 'root-session', userMessage: null, finalMessage: null,
      status: 'stopped', error: null, createdAt: null, completedAt: null,
      durationMs: null, usage: null, processMessageCount: 2
    }
  ];
  const processMessages = [
    {
      sessionId: 'child-reasoning', originalTaskId: 'task-done', taskId: 'child-task',
      role: 'agent', to: 'agent', type: 'reasoning', content: { text: 'thinking' },
      reasoningContent: 'thinking', createTime: '2026-07-12T00:00:01.000Z'
    },
    {
      sessionId: 'child-status', originalTaskId: 'task-done', taskId: 'child-task',
      role: 'agent', to: 'user', type: 'taskStatus', content: { status: 'done', taskId: 'child-task' },
      createTime: '2026-07-12T00:00:02.000Z'
    },
    {
      sessionId: 'child-tool', originalTaskId: 'task-done', taskId: 'child-task',
      role: 'tool', to: 'agent', type: 'toolReturn', content: { id: 'tool-1', result: { ok: true } },
      createTime: '2026-07-12T00:00:01.500Z'
    }
  ];
  const sdk = new AgentOSSDK({
    fetch: createMockFetch((request) => {
      if (request.pathname === '/appkit/register') {
        return jsonResponse({ token: 'history-token' });
      }
      requests.push(request);
      assert.equal(request.headers.authorization, 'Bearer history-token');
      if (request.pathname === '/agentkit/history/summary') {
        return jsonResponse(summaries);
      }
      if (request.pathname === '/agentkit/history/process') {
        return jsonResponse(processMessages);
      }
      throw new Error(`Unhandled request: ${request.method} ${request.pathname}`);
    })
  });
  await sdk.agentos.registerBundle({ bundleId: 'com.demo.history' });

  const defaultSummaries = await sdk.agentkit.historySummary({ sessionId: 'root-session' });
  assert.equal(requests[0].pathname, '/agentkit/history/summary');
  assert.equal(requests[0].searchParams.get('sessionId'), 'root-session');
  assert.equal(requests[0].searchParams.get('page'), '1');
  assert.equal(requests[0].searchParams.get('pageSize'), '30');
  assert.deepEqual(defaultSummaries, summaries);
  assert.deepEqual(defaultSummaries.map((item) => item.status), ['running', 'done', 'error', 'stopped']);
  assert.deepEqual(
    [HistoryTurnStatus.running, HistoryTurnStatus.done, HistoryTurnStatus.error, HistoryTurnStatus.stopped],
    ['running', 'done', 'error', 'stopped']
  );
  assert.equal(defaultSummaries[0].finalMessage, null);
  assert.equal(defaultSummaries[1].finalMessage.sessionId, 'child-final');
  assert.deepEqual(defaultSummaries[1].usage, { promptTokens: 10, completionTokens: 5, totalTokens: 15 });

  await sdk.agentkit.historySummary({ sessionId: 'root-session', page: 2, pageSize: 20 });
  assert.equal(requests[1].searchParams.get('page'), '2');
  assert.equal(requests[1].searchParams.get('pageSize'), '20');

  const messages = await sdk.agentkit.historyProcess({
    sessionId: 'root-session',
    originalTaskId: 'task-done'
  });
  assert.equal(requests[2].pathname, '/agentkit/history/process');
  assert.equal(requests[2].searchParams.get('sessionId'), 'root-session');
  assert.equal(requests[2].searchParams.get('originalTaskId'), 'task-done');
  assert.equal(requests[2].searchParams.get('page'), '1');
  assert.equal(requests[2].searchParams.get('pageSize'), '50');
  assert.deepEqual(messages, processMessages);

  await sdk.agentkit.historyProcess({
    sessionId: 'root-session', originalTaskId: 'task-done', page: 3, pageSize: 25
  });
  assert.equal(requests[3].searchParams.get('page'), '3');
  assert.equal(requests[3].searchParams.get('pageSize'), '25');

  const requestCount = requests.length;
  for (const options of [
    { sessionId: 'root-session', page: 0 },
    { sessionId: 'root-session', page: 1.5 },
    { sessionId: 'root-session', pageSize: 0 },
    { sessionId: 'root-session', pageSize: 201 }
  ]) {
    await assert.rejects(() => sdk.agentkit.historySummary(options), RangeError);
  }
  await assert.rejects(
    () => sdk.agentkit.historyProcess({ sessionId: 'root-session', originalTaskId: '  ' }),
    TypeError
  );
  await assert.rejects(
    () => sdk.agentkit.historyProcess({ sessionId: 'root-session', originalTaskId: 'task', pageSize: 201 }),
    RangeError
  );
  await assert.rejects(
    () => sdk.agentkit.historyProcess({ sessionId: 'root-session', originalTaskId: 'task', page: 0 }),
    RangeError
  );
  assert.equal(requests.length, requestCount);
});

test('agentkit history APIs retry once after a 401 with the refreshed AppKit token', async () => {
  let registerCount = 0;
  const historyTokens = [];
  const sdk = new AgentOSSDK({
    fetch: createMockFetch((request) => {
      if (request.pathname === '/appkit/register') {
        registerCount += 1;
        return jsonResponse({ token: `token-${registerCount}` });
      }
      if (request.pathname === '/agentkit/history/summary') {
        historyTokens.push(request.headers.authorization);
        if (request.headers.authorization === 'Bearer token-1') {
          return jsonResponse({ error: 'unauthorized' }, 401);
        }
        return jsonResponse([]);
      }
      if (request.pathname === '/agentkit/history/process') {
        historyTokens.push(request.headers.authorization);
        return jsonResponse([]);
      }
      throw new Error(`Unhandled request: ${request.method} ${request.pathname}`);
    })
  });
  await sdk.agentos.registerBundle({ bundleId: 'com.demo.history' });

  assert.deepEqual(await sdk.agentkit.historySummary({ sessionId: 'root' }), []);
  assert.deepEqual(await sdk.agentkit.historyProcess({ sessionId: 'root', originalTaskId: 'task' }), []);
  assert.deepEqual(historyTokens, ['Bearer token-1', 'Bearer token-2', 'Bearer token-2']);
  assert.equal(registerCount, 2);
});

test('agentkit chat propagates child session ids and falls back to the root session', async () => {
  const callbackSessionIds = [];
  const streamSessionIds = [];
  const sdk = new AgentOSSDK({
    fetch: createMockFetch((request) => {
      if (request.pathname === '/appkit/register') {
        return jsonResponse({ token: 'token-1' });
      }
      if (request.pathname === '/agentkit/chat') {
        return sseResponse([
          'event: message\ndata: {"sessionId":"child-message-session","originalTaskId":"task","taskId":"task","role":"agent","to":"user","type":"contentList","content":[],"createTime":"now"}\n\n',
          'event: chunk\ndata: {"sessionId":"child-chunk-session","taskId":"task","role":"agent","to":"user","type":"contentList","part":{},"createTime":"now"}\n\n',
          'event: message\ndata: {"sessionId":"","originalTaskId":"task","taskId":"task","role":"agent","to":"user","type":"contentList","content":[],"createTime":"now"}\n\n',
          'event: chunk\ndata: {"taskId":"task","role":"agent","to":"user","type":"contentList","part":{},"createTime":"now"}\n\n',
          'event: functionCall\ndata: {"sessionId":"child-callback-session","functionCall":{"id":"call-child","name":"tool","arguments":{}}}\n\n',
          'event: functionCall\ndata: {"sessionId":"child-stream-session","stream":true,"functionCall":{"id":"stream-child","name":"tool","arguments":{}}}\n\n',
          'event: functionCall\ndata: {"sessionId":"","functionCall":{"id":"call-root","name":"tool","arguments":{}}}\n\n',
          'event: functionCall\ndata: {"stream":true,"functionCall":{"id":"stream-root","name":"tool","arguments":{}}}\n\n'
        ]);
      }
      if (request.pathname === '/agentkit/callback') {
        callbackSessionIds.push(request.searchParams.get('sessionId'));
        return jsonResponse({ ok: true });
      }
      if (request.pathname === '/agentkit/streamCallback') {
        streamSessionIds.push(request.searchParams.get('sessionId'));
        return jsonResponse({ ok: true });
      }
      throw new Error(`Unhandled request: ${request.method} ${request.pathname}`);
    })
  });
  await sdk.agentos.registerBundle({ bundleId: 'com.demo.app' });
  const seenMessages = [];
  const seenChunks = [];
  const seenFunctionCalls = [];
  const done = deferred();
  class Handler extends AgentMessageHandler {
    async onMessage(sessionId) { seenMessages.push(sessionId); }
    async onChunk(sessionId) { seenChunks.push(sessionId); }
    async onFunctionCall(sessionId, functionCall) {
      seenFunctionCalls.push(sessionId);
      return { id: functionCall.id, result: { ok: true } };
    }
    async onStreamFunctionCall(sessionId, functionCall, onToolReturn) {
      seenFunctionCalls.push(sessionId);
      onToolReturn({ event: EventType.DONE, toolReturn: { id: functionCall.id, result: { ok: true } } });
    }
    async onDone() { done.resolve(); }
    async onError(error) { done.reject(error); }
  }

  await sdk.agentkit.chat({ sessionId: 'root-session' }, { content: [] }, new Handler());
  await done.promise;
  assert.deepEqual(seenMessages, ['child-message-session', 'root-session']);
  assert.deepEqual(seenChunks, ['child-chunk-session', 'root-session']);
  assert.deepEqual(seenFunctionCalls, [
    'child-callback-session', 'child-stream-session', 'root-session', 'root-session'
  ]);
  assert.deepEqual(callbackSessionIds, ['child-callback-session', 'root-session']);
  assert.deepEqual(streamSessionIds, ['child-stream-session', 'root-session']);
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

  await sdk.agentos.registerBundle({
    bundleId: 'com.demo.app',
    appGroupId: 'group-a',
    opentoolServers: [{ ref: 'websearch', name: 'opentool-server-websearch' }]
  });

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
  assert.deepEqual(
    recovery.registerBodiesFor('com.demo.app', 'group-a').map((body) => body.opentoolServers),
    [
      [{ ref: 'websearch', name: 'opentool-server-websearch' }],
      [{ ref: 'websearch', name: 'opentool-server-websearch' }]
    ]
  );
  assert.deepEqual(recovery.tokensUsedFor('/agentkit/initSession'), ['token-group-a-v2']);
  assert.deepEqual(recovery.tokensUsedFor('/appkit/subscribe'), ['token-group-a-v2']);
  await sdk.dispose();
});

test('agentkit normalizes capabilities, skills, recursive sub-agents, and llmConfig fields', async () => {
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
      skills: ['---\nname: helper\ndescription: Helps\n---\nFollow instructions.'],
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
        modelId: 'qwen3-8b',
        provider: 'openai',
        adapter: 'qwen'
      },
      subAgentList: [{
        name: 'researcher',
        capability: {
          systemPrompt: 'Research carefully.',
          skills: ['---\nname: research\ndescription: Researches\n---\nVerify sources.'],
          llmConfig: { supportsToolCalling: false },
          subAgentList: [{
            name: 'reader',
            capability: {
              systemPrompt: 'Read carefully.',
              llmConfig: { supportsDeepThinking: true }
            }
          }]
        }
      }]
    }
  });

  await sdk.agentkit.chatSimple({
    sessionId: 'session-1',
    userTask: {
      content: [{ type: 'text', message: 'hello' }],
      llmConfig: {
        temperature: 0.1,
        headers: { 'x-model-header': 'value' },
        providerOptions: { reasoningEffort: 'low' }
      }
    }
  });

  assert.equal(captured.initSimpleBody.llmConfig.temperature, 0.5);
  assert.equal(captured.initSimpleBody.llmConfig.maxTokens, 4096);
  assert.equal(captured.initSimpleBody.llmConfig.topP, 1);
  assert.equal(captured.initSimpleBody.llmConfig.supportsToolCall, false);
  assert.equal(captured.initSimpleBody.llmConfig.supportsReasoning, false);
  assert.equal(captured.initSimpleBody.skills.length, 1);
  assert.equal('supportsToolCalling' in captured.initSimpleBody.llmConfig, false);
  assert.equal('supportsDeepThinking' in captured.initSimpleBody.llmConfig, false);

  assert.equal(captured.initSessionBody.timeoutSeconds, 3600);
  assert.equal(captured.initSessionBody.taskPipelineStrategy, 'parallel');
  assert.equal(captured.initSessionBody.llmConfig.maxTokens, 4096);
  assert.equal(captured.initSessionBody.llmConfig.provider, 'openai');
  assert.equal(captured.initSessionBody.llmConfig.adapter, 'qwen');
  assert.equal(captured.initSessionBody.llmConfig.supportsToolCall, true);
  assert.equal(captured.initSessionBody.llmConfig.supportsReasoning, false);
  const childCapability = captured.initSessionBody.subAgentList[0].capability;
  assert.equal(childCapability.timeoutSeconds, 3600);
  assert.equal(childCapability.llmConfig.supportsToolCall, false);
  assert.equal(childCapability.llmConfig.supportsReasoning, false);
  assert.equal(childCapability.skills.length, 1);
  const grandchildCapability = childCapability.subAgentList[0].capability;
  assert.equal(grandchildCapability.timeoutSeconds, 3600);
  assert.equal(grandchildCapability.llmConfig.supportsReasoning, true);

  assert.equal(captured.chatBody.llmConfig.temperature, 0.1);
  assert.equal(captured.chatBody.llmConfig.maxTokens, 4096);
  assert.equal(captured.chatBody.llmConfig.supportsToolCall, true);
  assert.equal(captured.chatBody.llmConfig.supportsReasoning, false);
  assert.deepEqual(captured.chatBody.llmConfig.headers, { 'x-model-header': 'value' });
  assert.deepEqual(captured.chatBody.llmConfig.providerOptions, { reasoningEffort: 'low' });
});

test('agentkit passes capability execution limits through without client defaults or validation', async () => {
  const executionLimits = {
    maxLlmRequests: 32,
    maxToolRounds: 8,
    maxToolCalls: 20,
    maxConsecutiveIdenticalToolRounds: 2,
    maxTaskDurationSeconds: 120
  };
  const nonPositiveExecutionLimits = {
    maxLlmRequests: 0,
    maxToolRounds: -1,
    maxToolCalls: 0,
    maxConsecutiveIdenticalToolRounds: -2,
    maxTaskDurationSeconds: 0
  };
  const captured = {
    initSessionBodies: []
  };
  const sdk = new AgentOSSDK({
    fetch: createMockFetch((request) => {
      if (request.pathname === '/appkit/register') {
        return jsonResponse({ token: 'token-1' });
      }
      assert.equal(request.headers.authorization, 'Bearer token-1');
      if (request.pathname === '/agentkit/initSession') {
        captured.initSessionBodies.push(request.body);
        return jsonResponse({ sessionId: `session-${captured.initSessionBodies.length}` });
      }
      throw new Error(`Unhandled request: ${request.method} ${request.pathname}`);
    })
  });

  await sdk.agentos.registerBundle({ bundleId: 'com.demo.execution-limits' });
  await sdk.agentkit.initSession({
    capability: {
      systemPrompt: 'init limits',
      ...executionLimits
    }
  });
  await sdk.agentkit.initSession({
    capability: {
      systemPrompt: 'server defaults'
    }
  });
  await sdk.agentkit.initSession({
    capability: {
      systemPrompt: 'non-positive limits',
      ...nonPositiveExecutionLimits
    }
  });

  assert.deepEqual(
    Object.fromEntries(Object.keys(executionLimits).map((key) => [key, captured.initSessionBodies[0][key]])),
    executionLimits
  );
  for (const key of Object.keys(executionLimits)) {
    assert.equal(key in captured.initSessionBodies[1], false);
  }
  assert.deepEqual(
    Object.fromEntries(Object.keys(nonPositiveExecutionLimits).map((key) => [
      key,
      captured.initSessionBodies[2][key]
    ])),
    nonPositiveExecutionLimits
  );

  const normalizedWithoutLimits = normalizeCapability({ systemPrompt: 'server defaults' });
  for (const key of Object.keys(executionLimits)) {
    assert.equal(key in normalizedWithoutLimits, false);
  }
  const normalizedNonPositiveLimits = normalizeCapability({
    systemPrompt: 'non-positive limits',
    ...nonPositiveExecutionLimits
  });
  assert.deepEqual(
    Object.fromEntries(Object.keys(nonPositiveExecutionLimits).map((key) => [
      key,
      normalizedNonPositiveLimits[key]
    ])),
    nonPositiveExecutionLimits
  );
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
            capabilities: { vision: true, reasoning: true },
            contextWindowSize: 32768
          },
          {
            id: 'embed-1',
            name: 'Embedder',
            alias: 'embed-1',
            task: 'embedding',
            capabilities: { reasoning: false },
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
  assert.equal(models[0].capabilities.reasoning, false);
  assert.equal(models[0].isRemote, false);
  assert.equal(models[1].capabilities.vision, true);
  assert.equal(models[1].capabilities.reasoning, true);
  assert.deepEqual(models[1].input, ['text', 'image']);
  assert.equal(models[2].id, 'embed-1');
  assert.equal(models[2].task, 'embedding');
  assert.equal(models[2].capabilities.reasoning, false);
  assert.equal(models[2].isRemote, true);
  assert.equal(models[2].isCustom, true);

  const chatModels = await sdk.modelkit.listModelsByTask('chat');
  assert.deepEqual(chatModels.map((m) => m.id), ['qwen3-8b', 'qwen2.5-vl-7b']);
  assert.deepEqual(chatModels.map((m) => m.capabilities.reasoning), [false, true]);
});

test('modelkit listModels keeps the decisions output modality and app model flags', async () => {
  const sdk = new AgentOSSDK({
    fetch: createMockFetch((request) => {
      if (request.pathname === '/modelkit/models') {
        return jsonResponse([
          {
            id: 'sys-1',
            name: 'systemone',
            alias: 'systemone',
            task: 'decision',
            input: ['text', 'image'],
            output: ['decisions'],
            capabilities: { stream: false, tool_call: false, reasoning: false }
          },
          {
            id: 'app-1',
            name: 'app-chat',
            alias: 'app-chat',
            task: 'chat',
            isAppModel: true,
            appBundleId: 'com.demo.app'
          },
          { id: 'chat-1', name: 'plain', alias: 'plain', task: 'chat' }
        ]);
      }
      throw new Error(`Unhandled request: ${request.method} ${request.pathname}`);
    })
  });

  const models = await sdk.modelkit.listModels();

  assert.equal(models[0].task, 'decision');
  assert.deepEqual(models[0].input, ['text', 'image']);
  assert.deepEqual(models[0].output, ['decisions']);
  assert.equal(models[0].capabilities.stream, false);
  assert.equal(models[0].isAppModel, false);
  assert.equal('appBundleId' in models[0], false);
  assert.equal(models[1].isAppModel, true);
  assert.equal(models[1].appBundleId, 'com.demo.app');
  assert.equal(models[2].isAppModel, false);

  const decisionModels = await sdk.modelkit.listModelsByTask('decision');
  assert.deepEqual(decisionModels.map((m) => m.id), ['sys-1']);
});

test('modelkit ModelSource exposes the gateway wire names', () => {
  assert.deepEqual(Object.values(ModelSource), ['local', 'platform', 'custom', 'app']);
  assert.equal(Object.isFrozen(ModelSource), true);
});

test('modelkit listModels reports source and appName from the gateway', async () => {
  const sdk = new AgentOSSDK({
    fetch: createMockFetch((request) => {
      if (request.pathname === '/modelkit/models') {
        return jsonResponse([
          { id: 'a1', name: 'local-chat', task: 'chat', source: 'local' },
          { id: 'b2', name: 'platform-chat', task: 'chat', isRemote: true, source: 'platform' },
          {
            id: 'c3',
            name: 'custom-chat',
            task: 'chat',
            isRemote: true,
            isCustom: true,
            source: 'custom'
          },
          {
            id: 'chat-1@com.demo.app',
            name: 'app-chat',
            task: 'chat',
            isRemote: true,
            source: 'app',
            isAppModel: true,
            appBundleId: 'com.demo.app',
            appName: ' Demo App '
          }
        ]);
      }
      throw new Error(`Unhandled request: ${request.method} ${request.pathname}`);
    })
  });

  const models = await sdk.modelkit.listModels();

  assert.deepEqual(models.map((m) => m.source), ['local', 'platform', 'custom', 'app']);
  assert.equal(models[3].appBundleId, 'com.demo.app');
  assert.equal(models[3].appName, 'Demo App');
  for (const model of models.slice(0, 3)) {
    assert.equal('appName' in model, false);
  }
});

test('modelkit listModels derives source when the gateway does not send it', async () => {
  const sdk = new AgentOSSDK({
    fetch: createMockFetch((request) => {
      if (request.pathname === '/modelkit/models') {
        return jsonResponse([
          { id: 'a1', name: 'local', task: 'chat' },
          { id: 'b2', name: 'platform', task: 'chat', isRemote: true },
          { id: 'c3', name: 'custom', task: 'chat', isRemote: true, isCustom: true },
          // 没有 isRemote 时，即便 isCustom 为 true 也以运行位置为准。
          { id: 'd4', name: 'local-custom', task: 'chat', isCustom: true },
          {
            id: 'e5',
            name: 'app',
            task: 'chat',
            isRemote: true,
            isCustom: true,
            isAppModel: true,
            appBundleId: 'com.demo.app'
          },
          // 未知、空或大小写不同的 source：未知/空回退为推导，大小写不敏感。
          { id: 'f6', name: 'unknown', task: 'chat', isRemote: true, source: 'system' },
          { id: 'g7', name: 'empty', task: 'chat', source: '' },
          { id: 'h8', name: 'upper', task: 'chat', source: ' APP ' },
          // 空白 appName 视为没有。
          { id: 'i9', name: 'blank', task: 'chat', isAppModel: true, appName: '   ' }
        ]);
      }
      throw new Error(`Unhandled request: ${request.method} ${request.pathname}`);
    })
  });

  const models = await sdk.modelkit.listModels();

  assert.deepEqual(models.map((m) => m.source), [
    'local',
    'platform',
    'custom',
    'local',
    'app',
    'platform',
    'local',
    'app',
    'app'
  ]);
  // 网关没有给出 appName 时不臆造，调用方可回退到 appBundleId。
  assert.equal('appName' in models[4], false);
  assert.equal('appName' in models[8], false);
});

test('modelkit decision.create posts typed questions without a token and returns answers', async () => {
  const seen = [];
  const sdk = new AgentOSSDK({
    baseUrl: 'http://example.local:8888/base',
    fetch: createMockFetch((request) => {
      seen.push(request);
      if (request.pathname === '/base/modelkit/decision') {
        return jsonResponse({
          model: 'systemone',
          answers: {
            route: {
              type: 'choice',
              choice: 'chat',
              probabilities: { chat: 0.9, search: 0.1 },
              confidence: 0.9
            },
            urgency: { type: 'score', score: 3.5, probabilities: [0.1, 0.2, 0.7] },
            angry: { type: 'noul', noul: 0.12, legend: { true: 'yes' } }
          },
          usage: { input_tokens: 21, output_tokens: 4 }
        });
      }
      throw new Error(`Unhandled request: ${request.method} ${request.pathname}`);
    })
  });

  const questions = {
    route: {
      type: 'choice',
      instructions: 'route?',
      criteria: { chat: 'small talk', search: 'lookup' }
    },
    urgency: { type: 'score', instructions: 'urgency?', criteria: ['low', 'mid', 'high'] },
    angry: { type: 'noul', instructions: 'angry?' }
  };
  const response = await sdk.modelkit.decision.create({
    model: 'systemone',
    state: { text: 'hello' },
    questions,
    images: ['data:image/png;base64,AAAA']
  });

  assert.equal(seen.length, 1);
  assert.equal(seen[0].method, 'POST');
  assert.equal(seen[0].headers.authorization, undefined);
  assert.deepEqual(seen[0].body, {
    model: 'systemone',
    state: { text: 'hello' },
    questions,
    images: ['data:image/png;base64,AAAA']
  });
  assert.equal(response.model, 'systemone');
  assert.equal(response.answers.route.choice, 'chat');
  assert.equal(response.answers.route.confidence, 0.9);
  assert.deepEqual(response.answers.route.probabilities, { chat: 0.9, search: 0.1 });
  assert.equal(response.answers.urgency.score, 3.5);
  assert.equal(response.answers.angry.noul, 0.12);
  assert.deepEqual(response.answers.angry.legend, { true: 'yes' });
  assert.deepEqual(response.usage, { input_tokens: 21, output_tokens: 4 });
});

test('modelkit decision.create surfaces the server status and body', async () => {
  const sdk = new AgentOSSDK({
    fetch: createMockFetch(() => jsonResponse({ error: 'invalid questions' }, 400))
  });

  await assert.rejects(
    () => sdk.modelkit.decision.create({ state: 's', questions: {} }),
    (error) => {
      assert.equal(error.name, 'ApiError');
      assert.equal(error.status, 400);
      assert.deepEqual(error.data, { error: 'invalid questions' });
      return true;
    }
  );
});

test('modelkit listAppModels is public and normalizes every field', async () => {
  const seen = [];
  const sdk = new AgentOSSDK({
    fetch: createMockFetch((request) => {
      seen.push(request);
      if (request.pathname === '/modelkit/app-models') {
        return jsonResponse([
          {
            id: '6f78dcce6717',
            name: 'router',
            alias: 'router',
            description: 'routes requests',
            task: 'decision',
            provider: 'openai_compatible',
            input: ['text'],
            output: ['decisions'],
            capabilities: { stream: false, tool_call: false, reasoning: false },
            baseUrl: 'http://127.0.0.1:9000',
            hasApiKey: true,
            contextWindowSize: 8192,
            isDisabled: true,
            appBundleId: 'com.demo.app',
            appName: 'Demo'
          },
          { id: 'b35bf2726675', name: 'chat', task: 'chat', appBundleId: 'com.demo.app' }
        ]);
      }
      throw new Error(`Unhandled request: ${request.method} ${request.pathname}`);
    })
  });

  const models = await sdk.modelkit.listAppModels();

  assert.equal(seen.length, 1);
  assert.equal(seen[0].method, 'GET');
  assert.equal(seen[0].headers.authorization, undefined);
  assert.deepEqual(models[0], {
    id: '6f78dcce6717',
    name: 'router',
    alias: 'router',
    description: 'routes requests',
    task: 'decision',
    provider: 'openai_compatible',
    input: ['text'],
    output: ['decisions'],
    capabilities: { stream: false, tool_call: false, reasoning: false },
    baseUrl: 'http://127.0.0.1:9000',
    hasApiKey: true,
    contextWindowSize: 8192,
    isDisabled: true,
    appBundleId: 'com.demo.app',
    appName: 'Demo'
  });
  assert.equal(models[1].id, 'b35bf2726675');
  assert.equal(models[1].hasApiKey, false);
  assert.equal(models[1].isDisabled, false);
  assert.equal('baseUrl' in models[1], false);
  assert.equal('contextWindowSize' in models[1], false);
  assert.deepEqual(models[1].input, ['text']);
});

test('modelkit app model write calls send the explicit bearer token and id paths', async () => {
  const seen = [];
  const sdk = new AgentOSSDK({
    fetch: createMockFetch((request) => {
      seen.push(request);
      if (request.method === 'POST' && request.pathname === '/modelkit/app-models') {
        return jsonResponse({ success: true, id: '6f78dcce6717' });
      }
      return jsonResponse({ success: true });
    })
  });
  const client = sdk.modelKit;

  const registered = await client.registerAppModel('token-1', {
    name: 'router',
    task: 'decision',
    baseUrl: 'http://127.0.0.1:9000',
    apiKey: 'secret'
  });
  const updated = await client.updateAppModel('token-1', '6f78dcce6717', {
    name: 'renamed',
    task: 'decision',
    capabilities: { reasoning: false }
  });
  await client.toggleAppModel('token-1', '6f78dcce6717');
  await client.unregisterAppModel('token-1', '6f78dcce6717');

  assert.deepEqual(registered, { success: true, id: '6f78dcce6717' });
  assert.deepEqual(updated, { success: true });
  assert.deepEqual(
    seen.map((r) => [r.method, r.pathname]),
    [
      ['POST', '/modelkit/app-models'],
      ['PUT', '/modelkit/app-models/6f78dcce6717'],
      ['POST', '/modelkit/app-models/6f78dcce6717/toggle'],
      ['DELETE', '/modelkit/app-models/6f78dcce6717']
    ]
  );
  for (const request of seen) {
    assert.equal(request.headers.authorization, 'Bearer token-1');
  }
  assert.deepEqual(seen[0].body, {
    name: 'router',
    task: 'decision',
    baseUrl: 'http://127.0.0.1:9000',
    apiKey: 'secret'
  });
  assert.deepEqual(seen[1].body, {
    name: 'renamed',
    task: 'decision',
    capabilities: { reasoning: false }
  });
  assert.equal(seen[2].body, undefined);
  assert.equal(seen[3].body, undefined);
});

test('modelkit registerAppModel keeps the status of id conflicts', async () => {
  const sdk = new AgentOSSDK({
    fetch: createMockFetch(() => jsonResponse({ error: 'app model id is already in use' }, 409))
  });

  await assert.rejects(
    () => sdk.modelKit.registerAppModel('token-1', { name: 'x' }),
    (error) => {
      assert.equal(error.name, 'ApiError');
      assert.equal(error.status, 409);
      assert.deepEqual(error.data, { error: 'app model id is already in use' });
      return true;
    }
  );
});

test('modelkit registerAppModel keeps the status of a missing name', async () => {
  const sdk = new AgentOSSDK({
    fetch: createMockFetch(() => jsonResponse({ error: 'name is required' }, 400))
  });

  await assert.rejects(
    () => sdk.modelKit.registerAppModel('token-1', { name: '' }),
    (error) => {
      assert.equal(error.name, 'ApiError');
      assert.equal(error.status, 400);
      return true;
    }
  );
});

test('modelkit app model facade uses the registered app token and retries once on 401', async () => {
  let registerCount = 0;
  const attempts = [];
  const sdk = new AgentOSSDK({
    fetch: createMockFetch((request) => {
      if (request.pathname === '/appkit/register') {
        registerCount += 1;
        return jsonResponse({ token: `token-v${registerCount}` });
      }
      if (request.pathname === '/modelkit/app-models') {
        attempts.push(request.headers.authorization);
        if (request.headers.authorization === 'Bearer token-v1') {
          return jsonResponse({ error: 'unauthorized' }, 401);
        }
        return jsonResponse({ success: true, id: '6f78dcce6717' });
      }
      return jsonResponse({ success: true });
    })
  });
  await sdk.agentos.registerBundle({ bundleId: 'com.demo.app' });

  const result = await sdk.modelkit.registerAppModel({
    request: { name: 'router' }
  });

  assert.deepEqual(result, { success: true, id: '6f78dcce6717' });
  assert.equal(registerCount, 2);
  assert.deepEqual(attempts, ['Bearer token-v1', 'Bearer token-v2']);

  assert.deepEqual(await sdk.modelkit.updateAppModel({ modelId: '6f78dcce6717', request: { name: 'r2' } }), {
    success: true
  });
  assert.deepEqual(await sdk.modelkit.toggleAppModel({ modelId: '6f78dcce6717' }), { success: true });
  assert.deepEqual(await sdk.modelkit.unregisterAppModel({ modelId: '6f78dcce6717' }), { success: true });
});

test('modelkit app model write calls require registerBundle first', async () => {
  const seen = [];
  const sdk = new AgentOSSDK({
    fetch: createMockFetch((request) => {
      seen.push(request);
      return jsonResponse({ success: true });
    })
  });

  await assert.rejects(
    () => sdk.modelkit.toggleAppModel({ modelId: '6f78dcce6717' }),
    /Bearer token is not set/
  );
  assert.equal(seen.length, 0);
});

test('agentos bridge helpers detect injected mobile bridge and read context', async () => {
  const previousWindow = globalThis.window;
  try {
    delete globalThis.window;
    assert.equal(isAgentOSBridgeAvailable(), false);

    globalThis.window = {
      location: { origin: 'https://mini.example' },
      agentos: {
        bridge: {
          async request() {
            return { id: 'unused', ok: true, status: 200, body: null };
          },
          async cancel() {}
        },
        context: {
          async get() {
            return {
              appId: 'com.example.webapp',
              baseUrl: 'agentos://mobile',
              selectedModel: {
                id: 'qwen-local',
                name: 'Qwen Local',
                capabilities: { reasoning: true, toolCall: false, vision: false }
              }
            };
          }
        }
      }
    };

    assert.equal(isAgentOSBridgeAvailable(), true);
    const context = await getAgentOSBridgeContext();
    assert.equal(context.appId, 'com.example.webapp');
    assert.equal(context.baseUrl, 'agentos://mobile');
    assert.equal(context.selectedModel.id, 'qwen-local');
  } finally {
    restoreWindow(previousWindow);
  }
});

test('agentos bridge fetch maps non-stream requests and error responses', async () => {
  const previousWindow = globalThis.window;
  const envelopes = [];
  try {
    globalThis.window = {
      location: { origin: 'https://mini.example' },
      agentos: {
        bridge: {
          async request(envelope) {
            envelopes.push(envelope);
            if (envelope.path === '/modelkit/models') {
              return {
                id: envelope.id,
                ok: true,
                status: 200,
                headers: { 'x-native': 'ok' },
                body: [
                  {
                    id: 'qwen-local',
                    name: 'Qwen Local',
                    alias: 'qwen',
                    task: 'chat',
                    capabilities: { reasoning: true, toolCall: false, vision: false }
                  }
                ]
              };
            }
            return {
              id: envelope.id,
              ok: false,
              status: 404,
              error: { code: 'route_not_supported', message: 'Unsupported bridge route.' }
            };
          },
          async cancel() {}
        }
      }
    };

    const bridgeFetch = createAgentOSBridgeFetch({ appId: 'com.example.webapp' });
    const response = await bridgeFetch('agentos://mobile/modelkit/models?task=chat', {
      headers: { accept: 'application/json' }
    });
    assert.equal(response.ok, true);
    assert.equal(response.headers.get('x-native'), 'ok');
    assert.equal((await response.json())[0].id, 'qwen-local');

    assert.equal(envelopes[0].protocol, 'agentos.web.bridge');
    assert.equal(envelopes[0].protocolVersion, '1.0');
    assert.equal(envelopes[0].appId, 'com.example.webapp');
    assert.equal(envelopes[0].origin, 'https://mini.example');
    assert.equal(envelopes[0].method, 'GET');
    assert.equal(envelopes[0].path, '/modelkit/models');
    assert.deepEqual(envelopes[0].query, { task: 'chat' });
    assert.equal(envelopes[0].headers.accept, 'application/json');

    const errorResponse = await bridgeFetch('agentos://mobile/cronkit/task/list');
    assert.equal(errorResponse.ok, false);
    assert.equal(errorResponse.status, 404);
    assert.deepEqual(await errorResponse.json(), {
      code: 'route_not_supported',
      message: 'Unsupported bridge route.'
    });
  } finally {
    restoreWindow(previousWindow);
  }
});

test('agentos sdk uses bridge fetch without changing modelkit callers', async () => {
  const previousWindow = globalThis.window;
  try {
    globalThis.window = {
      location: { origin: 'https://mini.example' },
      agentos: {
        bridge: {
          async request(envelope) {
            assert.equal(envelope.path, '/modelkit/models');
            return {
              id: envelope.id,
              ok: true,
              status: 200,
              body: [
                {
                  id: 'mobile-model',
                  name: 'Mobile Model',
                  alias: 'mobile',
                  task: 'chat',
                  capabilities: { reasoning: false, toolCall: false, vision: true }
                }
              ]
            };
          },
          async cancel() {}
        }
      }
    };

    const sdk = new AgentOSSDK({
      baseUrl: 'agentos://mobile',
      fetch: createAgentOSBridgeFetch({ appId: 'com.example.webapp' })
    });
    const models = await sdk.modelkit.listModels();
    assert.equal(models[0].id, 'mobile-model');
    assert.equal(models[0].capabilities.vision, true);
  } finally {
    restoreWindow(previousWindow);
  }
});

test('agentos sdk auto uses injected bridge transport by default', async () => {
  const previousWindow = globalThis.window;
  const previousFetch = globalThis.fetch;
  const envelopes = [];
  try {
    globalThis.fetch = async () => {
      throw new Error('global fetch should not be used when AgentOS bridge is available');
    };
    globalThis.window = {
      location: { origin: 'https://mini.example' },
      agentos: {
        bridge: {
          async request(envelope) {
            envelopes.push(envelope);
            assert.equal(envelope.path, '/modelkit/models');
            return {
              id: envelope.id,
              ok: true,
              status: 200,
              body: [
                {
                  id: 'auto-mobile-model',
                  name: 'Auto Mobile Model',
                  task: 'chat',
                  capabilities: { vision: true }
                }
              ]
            };
          },
          async cancel() {}
        },
        context: {
          appId: 'com.example.auto',
          baseUrl: 'agentos://mobile'
        }
      }
    };

    const sdk = new AgentOSSDK();
    const models = await sdk.modelkit.listModels();

    assert.equal(models[0].id, 'auto-mobile-model');
    assert.equal(envelopes[0].protocol, 'agentos.web.bridge');
    assert.equal(envelopes[0].appId, 'com.example.auto');
    assert.equal(envelopes[0].origin, 'https://mini.example');
  } finally {
    globalThis.fetch = previousFetch;
    restoreWindow(previousWindow);
  }
});

test('agentos sdk preserves bridge errors without falling back to global fetch', async () => {
  const previousWindow = globalThis.window;
  const previousFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => {
      throw new Error('global fetch should not be used for bridge requests');
    };
    globalThis.window = {
      location: { origin: 'https://mini.example' },
      agentos: {
        bridge: {
          async request(envelope) {
            assert.equal(envelope.path, '/modelkit/asr/v1/audio/transcriptions');
            return {
              id: envelope.id,
              ok: false,
              status: 404,
              error: { code: 'route_not_supported', message: 'Unsupported bridge route.' }
            };
          },
          async cancel() {}
        },
        context: {
          baseUrl: 'agentos://mobile'
        }
      }
    };

    const sdk = new AgentOSSDK();

    await assert.rejects(
      () => sdk.modelkit.asr.transcribe({ model: 'asr-local', file: new Blob(['audio']) }),
      (error) => {
        assert.equal(error.name, 'ApiError');
        assert.equal(error.status, 404);
        assert.deepEqual(error.data, {
          code: 'route_not_supported',
          message: 'Unsupported bridge route.'
        });
        return true;
      }
    );
  } finally {
    globalThis.fetch = previousFetch;
    restoreWindow(previousWindow);
  }
});

test('agentos bridge fetch converts bridge stream events to SSE and cancels on abort', async () => {
  const previousWindow = globalThis.window;
  const cancelled = [];
  let streamRequestId;
  try {
    globalThis.window = {
      location: { origin: 'https://mini.example' },
      addEventListener(type, listener) {
        globalThis.window.listener = { type, listener };
      },
      removeEventListener(type, listener) {
        if (globalThis.window.listener?.type === type && globalThis.window.listener.listener === listener) {
          globalThis.window.listener = undefined;
        }
      },
      dispatchEvent(event) {
        globalThis.window.listener?.listener(event);
      },
      agentos: {
        bridge: {
          async request(envelope) {
            streamRequestId = envelope.id;
            assert.equal(envelope.stream, true);
            return {
              id: envelope.id,
              ok: true,
              status: 200,
              headers: { 'content-type': 'text/event-stream' },
              body: null
            };
          },
          async cancel(requestId) {
            cancelled.push(requestId);
          }
        }
      }
    };

    const controller = new AbortController();
    const response = await createAgentOSBridgeFetch()('agentos://mobile/agentkit/chat?sessionId=s1', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ content: [{ type: 'text', message: 'hello' }], isChunk: true }),
      signal: controller.signal
    });

    const events = [];
    const readerTask = (async () => {
      for await (const event of parseSse(response)) {
        events.push(event);
      }
    })();

    globalThis.window.dispatchEvent(new CustomEvent('agentos:bridge:event', {
      detail: {
        id: streamRequestId,
        type: 'chunk',
        event: 'agentmessagechunk',
        data: '{"message":"hel"}'
      }
    }));
    globalThis.window.dispatchEvent(new CustomEvent('agentos:bridge:event', {
      detail: {
        id: streamRequestId,
        type: 'done'
      }
    }));
    await readerTask;

    assert.deepEqual(events, [
      { event: 'agentmessagechunk', data: '{"message":"hel"}' }
    ]);

    const abortController = new AbortController();
    await createAgentOSBridgeFetch()('agentos://mobile/agentkit/chat', {
      method: 'POST',
      body: JSON.stringify({ content: [] }),
      signal: abortController.signal
    });
    abortController.abort();
    await sleep(0);
    assert.deepEqual(cancelled, [streamRequestId]);
  } finally {
    restoreWindow(previousWindow);
  }
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
            status: 'active',
            spec: {
              systemPrompt: 'You are a scheduled agent.',
              content: [{ type: 'text', message: 'Generate the report.' }],
              modelId: 'model-1',
              modelName: 'qwen-plus'
            }
          }
        ]);
      }
      throw new Error(`Unhandled request: ${request.method} ${request.pathname}`);
    })
  }).apiClient);

  const tasks = await client.listTasks('sk-demo', { enabled: true });

  assert.equal(tasks.length, 1);
  assert.equal(tasks[0].name, 'daily-report');
  assert.equal(tasks[0].spec.modelId, 'model-1');
  assert.equal(tasks[0].spec.modelName, 'qwen-plus');
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

test('generated declarations expose the LiteAgent 0.4 capability contract', () => {
  const declaration = readFileSync(
    new URL('../dist/client/agentkit/capability_dto.d.ts', import.meta.url),
    'utf8'
  );
  for (const field of [
    'skills',
    'subAgentList',
    'maxLlmRequests',
    'maxToolRounds',
    'maxToolCalls',
    'maxConsecutiveIdenticalToolRounds',
    'maxTaskDurationSeconds'
  ]) {
    const type = field === 'skills'
      ? 'string\\[\\]'
      : field === 'subAgentList'
        ? 'Agent\\[\\]'
        : 'number';
    assert.match(declaration, new RegExp(`${field}\\?: ${type};`));
  }
  assert.doesNotMatch(declaration, /sessionList|reflectPromptList|ReflectPrompt/);

  const moduleDeclaration = readFileSync(
    new URL('../dist/client/agentos/agentos_sdk.d.ts', import.meta.url),
    'utf8'
  );
  assert.doesNotMatch(moduleDeclaration, /\n\s+(?:getAgent|createAgent|updateAgent|deleteAgent)\(/);
  assert.doesNotMatch(moduleDeclaration, /initSession\([^)]*agentId/);
});

test('OpenTool subpaths do not expose the legacy daemon client', () => {
  for (const entrypoint of ['opentool', 'third_party']) {
    const declaration = readFileSync(
      new URL(`../dist/${entrypoint}.d.ts`, import.meta.url),
      'utf8'
    );
    assert.doesNotMatch(
      declaration,
      /DaemonClient|DAEMON_DEFAULT_PORT|DAEMON_DEFAULT_PREFIX|DaemonRegisterInfo|DaemonRegisterResult|opentool-daemon/
    );
  }
});

test('toolkit callTool uses the AgentOS gateway with encoded tool id and AppKit auth', async () => {
  const requests = [];
  const client = new ToolKitClient(new ApiClient({
    baseUrl: 'http://example.local',
    fetch: createMockFetch((request) => {
      requests.push(request);
      return jsonResponse({ id: 'call-1', result: { ok: true } });
    })
  }));

  const result = await client.callTool('app-token', 'web/search #1', {
    id: 'call-1',
    name: 'websearch',
    arguments: { query: 'OpenMAIC', max_results: 5 },
    ignored: 'must not be serialized'
  });

  assert.equal(requests.length, 1);
  assert.equal(requests[0].method, 'POST');
  assert.equal(requests[0].pathname, '/toolkit/web%2Fsearch%20%231/call');
  assert.equal(requests[0].headers.authorization, 'Bearer app-token');
  assert.equal(requests[0].headers['x-tool-api-key'], undefined);
  assert.deepEqual(requests[0].body, {
    id: 'call-1',
    name: 'websearch',
    arguments: { query: 'OpenMAIC', max_results: 5 }
  });
  assert.equal(result.id, 'call-1');
  assert.deepEqual(result.result, { ok: true });
  assert.equal(requests.some((request) => request.pathname === '/opentool/call'), false);
});

test('toolkit module refreshes the AppKit token and retries callTool after 401', async () => {
  let registerCount = 0;
  const callTokens = [];
  const sdk = new AgentOSSDK({
    fetch: createMockFetch((request) => {
      if (request.pathname === '/appkit/register') {
        registerCount += 1;
        return jsonResponse({ token: `token-${registerCount}` });
      }
      if (request.pathname === '/toolkit/tool-1/call') {
        callTokens.push(request.headers.authorization);
        if (request.headers.authorization === 'Bearer token-1') {
          return jsonResponse({ error: 'unauthorized' }, 401);
        }
        return jsonResponse({ id: 'call-1', result: { retried: true } });
      }
      throw new Error(`Unhandled request: ${request.method} ${request.pathname}`);
    })
  });
  await sdk.agentos.registerBundle({ bundleId: 'com.demo.toolkit-call' });

  const result = await sdk.toolkit.callTool({
    toolId: 'tool-1',
    functionCall: { id: 'call-1', name: 'status', arguments: {} }
  });

  assert.deepEqual(result.result, { retried: true });
  assert.equal(registerCount, 2);
  assert.deepEqual(callTokens, ['Bearer token-1', 'Bearer token-2']);
});

test('toolkit streamCallTool parses typed AgentOS SSE events', async () => {
  const requests = [];
  const client = new ToolKitClient(new ApiClient({
    baseUrl: 'http://example.local',
    fetch: createMockFetch((request) => {
      requests.push(request);
      return sseResponse([
        'event: START\ndata: {"started":true}\n\n',
        'event: DATA\ndata: {"value":1}\n\n',
        'event: ERROR\ndata: {"message":"recoverable"}\n\n',
        'event: DONE\ndata: {"done":true}\n\n'
      ]);
    })
  }));

  const events = [];
  for await (const event of client.streamCallTool('app-token', 'tool/stream', {
    id: 'call-stream',
    name: 'status',
    arguments: { depth: 2 }
  })) {
    events.push(event);
  }

  assert.equal(requests[0].method, 'POST');
  assert.equal(requests[0].pathname, '/toolkit/tool%2Fstream/streamCall');
  assert.equal(requests[0].headers.authorization, 'Bearer app-token');
  assert.deepEqual(requests[0].body, {
    id: 'call-stream',
    name: 'status',
    arguments: { depth: 2 }
  });
  assert.deepEqual(events, [
    { event: 'START', data: { started: true } },
    { event: 'DATA', data: { value: 1 } },
    { event: 'ERROR', data: { message: 'recoverable' } },
    { event: 'DONE', data: { done: true } }
  ]);
});

test('toolkit module retries stream setup after a 401', async () => {
  let registerCount = 0;
  const streamTokens = [];
  const sdk = new AgentOSSDK({
    fetch: createMockFetch((request) => {
      if (request.pathname === '/appkit/register') {
        registerCount += 1;
        return jsonResponse({ token: `stream-token-${registerCount}` });
      }
      if (request.pathname === '/toolkit/tool-1/streamCall') {
        streamTokens.push(request.headers.authorization);
        if (request.headers.authorization === 'Bearer stream-token-1') {
          return jsonResponse({ error: 'forbidden' }, 403);
        }
        return sseResponse(['event: DONE\ndata: {"ok":true}\n\n']);
      }
      throw new Error(`Unhandled request: ${request.method} ${request.pathname}`);
    })
  });
  await sdk.agentos.registerBundle({ bundleId: 'com.demo.toolkit-stream' });

  const events = [];
  for await (const event of sdk.toolkit.streamCallTool({
    toolId: 'tool-1',
    functionCall: { id: 'call-1', name: 'status', arguments: {} }
  })) {
    events.push(event);
  }

  assert.deepEqual(events, [{ event: 'DONE', data: { ok: true } }]);
  assert.equal(registerCount, 2);
  assert.deepEqual(streamTokens, ['Bearer stream-token-1', 'Bearer stream-token-2']);
});

test('toolkit streamCallTool propagates AbortSignal cancellation', async () => {
  let responseController;
  let requestAborted = false;
  const client = new ToolKitClient(new ApiClient({
    baseUrl: 'http://example.local',
    fetch: async (_input, init = {}) => {
      const body = new ReadableStream({
        start(controller) {
          responseController = controller;
          controller.enqueue(new TextEncoder().encode('event: DATA\ndata: {"value":1}\n\n'));
        }
      });
      init.signal.addEventListener('abort', () => {
        requestAborted = true;
        try {
          responseController.error(new DOMException('Aborted', 'AbortError'));
        } catch {
          // The reader may already be closed by the generator.
        }
      }, { once: true });
      return new Response(body, { headers: { 'content-type': 'text/event-stream' } });
    }
  }));
  const abortController = new AbortController();
  const stream = client.streamCallTool(
    'app-token',
    'tool-1',
    { id: 'call-1', name: 'status', arguments: {} },
    { signal: abortController.signal }
  );

  assert.deepEqual(await stream.next(), {
    done: false,
    value: { event: 'DATA', data: { value: 1 } }
  });
  abortController.abort();
  await assert.rejects(stream.next(), (error) => error?.name === 'AbortError');
  assert.equal(requestAborted, true);
});

test('toolkit streamCallTool cancels the reader and aborts the request when closed early', async () => {
  let readerCancelCount = 0;
  let requestAborted = false;
  const client = new ToolKitClient(new ApiClient({
    baseUrl: 'http://example.local',
    fetch: async (_input, init = {}) => {
      init.signal.addEventListener('abort', () => {
        requestAborted = true;
      }, { once: true });
      return new Response(new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('event: DATA\ndata: {"value":1}\n\n'));
        },
        cancel() {
          readerCancelCount += 1;
        }
      }), { headers: { 'content-type': 'text/event-stream' } });
    }
  }));
  const stream = client.streamCallTool(
    'app-token',
    'tool-1',
    { id: 'call-1', name: 'status', arguments: {} }
  );

  assert.equal((await stream.next()).value.event, 'DATA');
  await stream.return(undefined);

  assert.equal(readerCancelCount, 1);
  assert.equal(requestAborted, true);
});

test('toolkit call and stream reject malformed JSON responses with clear errors', async () => {
  const callClient = new ToolKitClient(new ApiClient({
    baseUrl: 'http://example.local',
    fetch: async () => new Response('not-json', { status: 200 })
  }));
  await assert.rejects(
    callClient.callTool('token', 'tool-1', { id: 'call-1', name: 'status', arguments: {} }),
    /Expected JSON object but got string/
  );

  const invalidResultClient = new ToolKitClient(new ApiClient({
    baseUrl: 'http://example.local',
    fetch: async () => jsonResponse({ id: 'call-1', result: [] })
  }));
  await assert.rejects(
    invalidResultClient.callTool('token', 'tool-1', { id: 'call-1', name: 'status', arguments: {} }),
    /Invalid ToolReturn result/
  );

  const streamClient = new ToolKitClient(new ApiClient({
    baseUrl: 'http://example.local',
    fetch: async () => sseResponse(['event: DATA\ndata: not-json\n\n'])
  }));
  const stream = streamClient.streamCallTool(
    'token',
    'tool-1',
    { id: 'call-1', name: 'status', arguments: {} }
  );
  await assert.rejects(stream.next(), /Invalid ToolKit SSE event "DATA"/);
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

function functionCallSse(sessionId, functionCall) {
  return `event: functionCall\ndata: ${JSON.stringify({ sessionId, functionCall })}\n\n`;
}

function openSseResponse(chunk, onCancel) {
  const bytes = new TextEncoder().encode(chunk);
  return new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(bytes);
      },
      cancel() {
        onCancel();
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

function chunkedSseByteResponse(bytes, nextChunkSize) {
  let offset = 0;
  let chunkIndex = 0;
  return new Response(
    new ReadableStream({
      pull(controller) {
        if (offset >= bytes.byteLength) {
          controller.close();
          return;
        }
        const size = Math.max(1, nextChunkSize(chunkIndex, offset, bytes.byteLength));
        const end = Math.min(bytes.byteLength, offset + size);
        controller.enqueue(bytes.subarray(offset, end));
        offset = end;
        chunkIndex += 1;
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

function fixedChunkSize(size) {
  return () => size;
}

function randomChunkSize(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return 1 + (state % 4096);
  };
}

function createLargeFunctionCallContent(length) {
  const sample = '<section data-title="中文">\nconst quote = "\\\\quoted\\\\";\n</script>\n</section>\n';
  return sample.repeat(Math.ceil(length / sample.length)).slice(0, length);
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
  const registerBodies = new Map();
  const tokensByPath = new Map();

  const fetch = createMockFetch((request) => {
    if (request.pathname === '/appkit/register') {
      const bundleId = request.body.bundleId;
      const appGroupId = request.body.appGroupId ?? '';
      const key = `${bundleId}::${appGroupId}`;
      const count = (registerCounts.get(key) ?? 0) + 1;
      registerCounts.set(key, count);
      const bodies = registerBodies.get(key) ?? [];
      bodies.push(request.body);
      registerBodies.set(key, bodies);
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
    registerBodiesFor(bundleId, appGroupId) {
      return registerBodies.get(`${bundleId}::${appGroupId}`) ?? [];
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

function restoreWindow(previousWindow) {
  if (previousWindow === undefined) {
    delete globalThis.window;
  } else {
    globalThis.window = previousWindow;
  }
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
