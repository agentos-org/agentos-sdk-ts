import assert from 'node:assert/strict';
import test from 'node:test';
import { AgentOSSDK, ApiClient, HarnessKitClient, isHarnessKitSkillActivatedEvent, isHarnessKitSubagentModelSelectedEvent } from '../dist/index.js';

const json = (value, status = 200) => new Response(JSON.stringify(value), {
  status, headers: { 'content-type': 'application/json' }
});

test('HarnessKit sends typed skill, decision, fork and workspace requests with bearer authentication', async () => {
  const calls = [];
  const client = new HarnessKitClient(new ApiClient({
    baseUrl: 'http://example.test/base',
    fetch: async (url, init) => {
      const parsed = new URL(url);
      const body = init.body ? JSON.parse(init.body) : undefined;
      calls.push({ path: parsed.pathname, query: parsed.search, method: init.method, headers: init.headers, body });
      if (parsed.pathname.endsWith('/v1/skills')) return json({ skills: [{ skillId: 'review', name: 'Review', description: 'Review code', version: '1' }] });
      if (parsed.pathname.endsWith('/v1/workspaces') && init.method === 'GET') return json({ workspaces: [{ workspaceId: 'w' }] });
      if (parsed.pathname.includes('/v1/workspaces')) return json({ workspace: { workspaceId: 'w' } });
      if (parsed.pathname.endsWith('/admin/api/harness/skills')) return json({ roots: [], disabledSkillIds: [], automatic: true, skills: [] });
      return json({ threadId: 'fork', messages: [] });
    }
  }));
  const decision = { modelId: 'decision', toolSelectionEnabled: false, contextWindowSize: 8192 };
  const skillSelection = { required: [{ skillId: 'review' }], autoSelect: true };
  await client.startRun('token', 'thread/a', { requestId: 'request', goal: 'review', llmConfig: { model: 'chat' }, decisionModelConfig: decision, skillSelection });
  assert.equal(calls[0].path, '/base/harnesskit/v1/threads/thread%2Fa/runs');
  assert.equal(calls[0].headers.authorization, 'Bearer token');
  assert.deepEqual(calls[0].body.decisionModelConfig, decision);
  assert.deepEqual(calls[0].body.skillSelection, skillSelection);
  await client.forkThread('token', { sourceThreadId: 'thread', threadId: 'fork', throughTurnId: 'turn', title: 'Fork' });
  assert.equal(calls[1].path, '/base/harnesskit/v1/threads');
  assert.equal(calls[1].body.sourceThreadId, 'thread');
  assert.equal((await client.listSkills('token'))[0].skillId, 'review');
  await client.getSkillSettings('token');
  await client.updateSkillSettings('token', { roots: [], disabledSkillIds: [], automatic: true });
  assert.equal(calls[4].method, 'PUT');
  assert.deepEqual(calls[4].body, { roots: [], disabledSkillIds: [], automatic: true });
  assert.equal((await client.listWorkspaces('token', true))[0].workspaceId, 'w');
  assert.equal(calls[5].query, '?includeArchived=true');
  await client.updateWorkspace('token', 'w/1', { archived: true });
  assert.equal(calls[6].path, '/base/harnesskit/v1/workspaces/w%2F1');
  assert.equal(calls[6].method, 'PATCH');
});

test('host-only denial does not refresh AppKit credentials', async () => {
  let registrations = 0;
  const sdk = new AgentOSSDK({ baseUrl: 'http://example.test', fetch: async (url) => {
    const path = new URL(url).pathname;
    if (path === '/appkit/register') { registrations++; return json({ token: 'token', bundleId: 'com.test.app' }); }
    if (path === '/harnesskit/v1/workspaces') return json({ error: { code: 'harness_host_access_forbidden', message: 'host only' } }, 403);
    throw new Error(`unexpected ${path}`);
  }});
  await sdk.agentos.registerBundle({ bundleId: 'com.test.app' });
  await assert.rejects(() => sdk.harnesskit.listWorkspaces(), (error) => error.status === 403);
  assert.equal(registrations, 1);
  await sdk.dispose();
});

test('subagent event guard recognizes model selections without matching ordinary events', () => {
  assert.equal(isHarnessKitSubagentModelSelectedEvent({ type: 'model.selected', data: { subagent: true, modelId: 'm', reason: 'fit' } }), true);
  assert.equal(isHarnessKitSubagentModelSelectedEvent({ type: 'model.selected', data: {} }), false);
  assert.equal(isHarnessKitSubagentModelSelectedEvent({ type: 'run.started', data: { subagent: true } }), false);
  assert.equal(isHarnessKitSkillActivatedEvent({ type: 'skill.activated', data: { records: [] } }), true);
  assert.equal(isHarnessKitSkillActivatedEvent({ type: 'skill.selected', data: {} }), false);
  assert.equal(isHarnessKitSkillActivatedEvent({ type: 'skill.activated', data: { records: [{ skillId: 5 }] } }), false);
  assert.equal(isHarnessKitSubagentModelSelectedEvent({ type: 'model.selected', data: { subagent: true, reason: 42 } }), false);
});

test('HarnessKit streams skill activation and delegated model events', async () => {
  const client = new HarnessKitClient(new ApiClient({
    baseUrl: 'http://example.test',
    fetch: async (url, init) => {
      const parsed = new URL(url);
      assert.equal(parsed.searchParams.get('runId'), 'run-1');
      assert.equal(parsed.searchParams.get('afterSequence'), '4');
      assert.equal(init.headers.authorization, 'Bearer token');
      const events = [
        { type: 'skill.activated', data: { records: [{ skillId: 'review', version: '1.0.0' }] } },
        { type: 'model.selected', data: { subagent: true, modelName: 'small', reason: 'suitable' } }
      ];
      return new Response(events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(''), {
        headers: { 'content-type': 'text/event-stream' }
      });
    }
  }));
  const events = [];
  for await (const event of await client.events('token', 'thread', { runId: 'run-1', afterSequence: 4 })) events.push(event);
  assert.equal(isHarnessKitSkillActivatedEvent(events[0]), true);
  assert.equal(events[0].data.records[0].skillId, 'review');
  assert.equal(isHarnessKitSubagentModelSelectedEvent(events[1]), true);
  assert.equal(events[1].data.reason, 'suitable');
});
