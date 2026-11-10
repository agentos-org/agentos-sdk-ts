import type {
  AgentOSSDK,
  HarnessKitDecisionModelConfig,
  HarnessKitRunRequest,
  HarnessKitSkillSelection,
  HarnessKitSubagentModelSelectedEvent,
  HarnessKitThreadSnapshot,
  HarnessKitWorkspace,
} from '../../src/index';
import { isHarnessKitSkillActivatedEvent, isHarnessKitSubagentModelSelectedEvent } from '../../src/index';

declare const sdk: AgentOSSDK;
const decision: HarnessKitDecisionModelConfig = {
  modelId: 'decision', toolSelectionEnabled: false, contextWindowSize: 8192
};
const selection: HarnessKitSkillSelection = {
  required: [{ skillId: 'harness.code-review' }], autoSelect: true, maxActiveSkills: 2
};
const request: HarnessKitRunRequest = {
  requestId: 'request', goal: 'Review', llmConfig: {
    model: 'chat',
    providerOptions: { subagentModels: [{
      id: 'worker', source: 'manual', model: 'small', baseUrl: 'http://localhost:8000',
      contextWindowSize: 8192, supportsToolCall: true
    }] }
  },
  decisionModelConfig: decision, skillSelection: selection,
  skillPolicy: { allowAutomaticSelection: true }
};
void sdk.harnesskit.startRun('thread', request);
void sdk.harnesskit.submitCommand('thread', {
  type: 'submit_turn', commandId: 'turn', input: 'Review',
  decisionModelConfigOverride: decision, skillSelection: selection
});
const fork: Promise<HarnessKitThreadSnapshot> = sdk.harnesskit.forkThread({
  sourceThreadId: 'thread', threadId: 'branch', throughTurnId: 'turn', title: 'Branch'
});
void fork.then((snapshot) => {
  const runId: string | undefined = snapshot.runSummaries?.[0]?.runId;
  const replaced: string | undefined = snapshot.supersededTurnIds?.[0];
  void runId; void replaced;
});
void sdk.harnesskit.listSkills().then((skills) => skills[0]?.skillId);
void sdk.harnesskit.updateSkillSettings({ roots: [], disabledSkillIds: [], automatic: true });
const workspaces: Promise<HarnessKitWorkspace[]> = sdk.harnesskit.listWorkspaces(true);
void workspaces;
void sdk.harnesskit.createWorkspace({ folderPaths: ['/tmp/project'], name: 'Project' });
void sdk.harnesskit.updateWorkspace('workspace', { archived: true });
void sdk.harnesskit.relinkWorkspace('workspace', '/tmp/project');
void sdk.harnesskit.validateWorkspace('workspace');
void sdk.harnesskit.events('thread').then(async (events) => {
  for await (const event of events) {
    if (isHarnessKitSkillActivatedEvent(event)) {
      const skillId: string | undefined = event.data.records?.[0]?.skillId;
      void skillId;
    }
    if (isHarnessKitSubagentModelSelectedEvent(event)) {
      const selected: HarnessKitSubagentModelSelectedEvent = event;
      const reason: string | undefined = selected.data.reason;
      void reason;
    }
  }
});
// @ts-expect-error The decision model's ranking flag must be boolean.
const invalidDecision: HarnessKitDecisionModelConfig = { modelId: 'x', toolSelectionEnabled: 'yes' };
void invalidDecision;
