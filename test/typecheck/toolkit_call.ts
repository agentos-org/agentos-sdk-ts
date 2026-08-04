import type {
  AgentOSSDK,
  FunctionCall,
  ToolKitCallOptions,
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
