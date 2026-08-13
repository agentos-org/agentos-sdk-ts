import type {
  AgentOSSDK,
  FunctionCall,
  ToolKitCallOptions,
  ToolDto,
  ToolKitStreamCallOptions,
  ToolKitStreamEvent,
  ToolReturn
} from '../../src/index';

declare const sdk: AgentOSSDK;

const functionCall: FunctionCall = {
  id: crypto.randomUUID(),
  name: 'websearch',
  arguments: {
    query: 'OpenMAIC',
    max_results: 5,
    summary_only: false
  }
};

const callOptions: ToolKitCallOptions = {
  toolId: 'websearch',
  functionCall
};

const result: Promise<ToolReturn> = sdk.toolkit.callTool(callOptions);
void result.then((toolReturn) => console.log(toolReturn.result));

const streamOptions: ToolKitStreamCallOptions = {
  ...callOptions,
  signal: new AbortController().signal
};
const stream: AsyncGenerator<ToolKitStreamEvent> = sdk.toolkit.streamCallTool(streamOptions);
void stream;

const daemonV5Tool: ToolDto = {
  id: 'tool-websearch',
  serverId: 'server-websearch',
  server: {
    namespace: 'opentool-server',
    name: 'opentool-server-websearch',
    version: '1.0.0'
  },
  materializedArtifactDigest: 'sha256:websearch',
  contentState: 'current'
};
void daemonV5Tool;
