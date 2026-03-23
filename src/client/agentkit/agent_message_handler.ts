import {
  EventType,
  FunctionNotSupportedError,
  type AgentMessage,
  type AgentMessageChunk,
  type EventToolReturn,
  type FunctionCall,
  type Tool,
  type ToolReturn
} from '../../types';

export abstract class AgentMessageHandler {
  tool?: Tool;

  constructor(options: { tool?: Tool } = {}) {
    this.tool = options.tool;
  }

  async onFunctionCall(_sessionId: string, functionCall: FunctionCall): Promise<ToolReturn> {
    if (this.tool) {
      return {
        id: functionCall.id,
        result: await this.tool.call(functionCall.name, functionCall.arguments)
      };
    }
    return {
      id: functionCall.id,
      result: toToolErrorPayload(new FunctionNotSupportedError(functionCall.name))
    };
  }

  async onStreamFunctionCall(
    _sessionId: string,
    functionCall: FunctionCall,
    onToolReturn: (eventToolReturn: EventToolReturn) => void
  ): Promise<void> {
    if (this.tool?.streamCall) {
      try {
        await this.tool.streamCall(functionCall.name, functionCall.arguments, (event, data) => {
          onToolReturn({
            event,
            toolReturn: {
              id: functionCall.id,
              result: data
            }
          });
        });
        return;
      } catch (error) {
        onToolReturn({
          event: EventType.ERROR,
          toolReturn: {
            id: functionCall.id,
            result: {
              error: String(error)
            }
          }
        });
        return;
      }
    }
    onToolReturn({
      event: EventType.ERROR,
      toolReturn: {
        id: functionCall.id,
        result: toToolErrorPayload(new FunctionNotSupportedError(functionCall.name))
      }
    });
  }

  abstract onMessage(sessionId: string, agentMessage: AgentMessage): Promise<void>;

  abstract onChunk(sessionId: string, agentMessageChunk: AgentMessageChunk): Promise<void>;

  abstract onDone(): Promise<void>;

  abstract onError(error: Error): Promise<void>;
}

function toToolErrorPayload(error: { toJson?: () => Record<string, unknown>; toJSON?: () => Record<string, unknown> }): Record<string, unknown> {
  if (typeof error.toJson === 'function') {
    return error.toJson();
  }
  if (typeof error.toJSON === 'function') {
    return error.toJSON();
  }
  return {
    error: 'FunctionNotSupportedError',
    message: String(error)
  };
}
