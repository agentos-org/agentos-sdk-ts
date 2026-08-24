import type {
  AgentOSSDK,
  Capability,
  SimpleCapability,
  UserTask
} from '../../src/index';

const capability: Capability = {
  systemPrompt: 'You are an assistant.',
  skills: ['---\nname: helper\ndescription: Helps\n---\nFollow instructions.'],
  subAgentList: [{
    name: 'researcher',
    capability: {
      systemPrompt: 'Research carefully.',
      subAgentList: [{
        name: 'reader',
        capability: { systemPrompt: 'Read carefully.' }
      }]
    }
  }],
  maxLlmRequests: 32,
  maxToolRounds: 8,
  maxToolCalls: 20,
  maxConsecutiveIdenticalToolRounds: 2,
  maxTaskDurationSeconds: 120
};

declare const sdk: AgentOSSDK;
void sdk.agentkit.initSession({ capability });
// @ts-expect-error Agent IDs are no longer accepted when initializing sessions.
void sdk.agentkit.initSession({ agentId: 'agent-1' });
// @ts-expect-error Persistent Agent CRUD was removed from AgentKit.
void sdk.agentkit.getAgent({ agentId: 'agent-1' });

const simpleCapability: SimpleCapability = {
  systemPrompt: 'You are an assistant.',
  // @ts-expect-error Execution limits are only available on Capability.
  maxLlmRequests: 32
};

const userTask: UserTask = {
  content: [],
  // @ts-expect-error Execution limits are only available on Capability.
  maxToolRounds: 8
};

void simpleCapability;
void userTask;
