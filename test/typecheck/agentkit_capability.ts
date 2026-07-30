import type {
  AgentOSSDK,
  Capability,
  SimpleCapability,
  UserTask
} from '../../src/index';

const capability: Capability = {
  systemPrompt: 'You are an assistant.',
  maxLlmRequests: 32,
  maxToolRounds: 8,
  maxToolCalls: 20,
  maxConsecutiveIdenticalToolRounds: 2,
  maxTaskDurationSeconds: 120
};

declare const sdk: AgentOSSDK;
void sdk.agentkit.initSession({ capability });

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
