import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);

test('published declarations resolve from NodeNext ESM and CommonJS consumers', () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'agentos-sdk-types-'));
  try {
    const modules = path.join(directory, 'node_modules');
    mkdirSync(modules);
    symlinkSync(process.cwd(), path.join(modules, 'agentos-sdk-ts'), 'dir');
    writeFileSync(path.join(directory, 'package.json'), '{"private":true,"type":"module"}');
    writeFileSync(path.join(directory, 'consumer.mts'), `
      import { AgentOSSDK, type HarnessKitDecisionModelConfig, type HarnessKitSkillSelection } from 'agentos-sdk-ts';
      const config: HarnessKitDecisionModelConfig = { modelId: 'decision', toolSelectionEnabled: true, contextWindowSize: 8192 };
      const skill: HarnessKitSkillSelection = { required: [{ skillId: 'review' }] };
      const sdk = new AgentOSSDK();
      void sdk.harnesskit.submitCommand('thread', { type: 'submit_turn', commandId: '1', decisionModelConfigOverride: config, skillSelection: skill });
    `);
    writeFileSync(path.join(directory, 'consumer.cts'), `
      import sdk = require('agentos-sdk-ts');
      const config: sdk.HarnessKitDecisionModelConfig = { modelId: 'decision', toolSelectionEnabled: true };
      const client = new sdk.AgentOSSDK();
      void config; void client.harnesskit.listSkills();
    `);
    const tsc = require.resolve('typescript/bin/tsc');
    for (const file of ['consumer.mts', 'consumer.cts']) {
      assert.doesNotThrow(() => execFileSync(process.execPath, [tsc, '--noEmit', '--strict', '--target', 'es2020', '--module', 'nodenext', '--moduleResolution', 'nodenext', file], { cwd: directory, stdio: 'pipe' }));
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
