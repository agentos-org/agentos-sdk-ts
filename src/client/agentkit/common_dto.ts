import type { FunctionCall, Tool } from '../../browser_opentool';
import {
  EventType,
  FunctionNotSupportedException,
  ToolReturn
} from '../../browser_opentool';

export enum ApiKeyType {
  basic = 'basic',
  bearer = 'bearer',
  original = 'original'
}

export interface ApiKey {
  type: ApiKeyType;
  apiKey: string;
}

export enum Protocol {
  openapi = 'openapi',
  openmodbus = 'openmodbus',
  jsonrpcHttp = 'jsonrpcHttp',
  opentool = 'opentool',
  mcpStdio = 'mcpStdio',
  mcpHttp = 'mcpHttp',
  serialport = 'serialport'
}

export enum PipelineStrategyType {
  parallel = 'parallel',
  serial = 'serial',
  reject = 'reject'
}

export interface OpenSpec {
  openSpec: string;
  apiKey?: ApiKey;
  protocol: Protocol;
  serverUrl?: string;
  openToolId?: string;
}

export interface CallbackOpenTool {
  opentool: string;
  timeout?: number;
}

export class AgentRoleType {
  static readonly system = 'developer';
  static readonly user = 'user';
  static readonly agent = 'agent';
  static readonly llm = 'assistant';
  static readonly tool = 'tool';
  static readonly client = 'client';
}

export class AgentMessageType {
  static readonly text = 'text';
  static readonly imageUrl = 'imageUrl';
  static readonly dispatch = 'dispatch';
  static readonly toolCalls = 'toolCalls';
  static readonly toolReturn = 'toolReturn';
  static readonly contentList = 'contentList';
  static readonly reflection = 'reflection';
  static readonly taskStatus = 'taskStatus';
  static readonly functionCall = 'functionCall';
  static readonly reasoning = 'reasoning';
  static readonly reasoningContent = 'reasoningContent';
  static readonly planning = 'planning';
}

export class TaskStatusType {
  static readonly start = 'start';
  static readonly stop = 'stop';
  static readonly done = 'done';
  static readonly exception = 'exception';
  static readonly toolsStart = 'toolsStart';
  static readonly toolsDone = 'toolsDone';
  static readonly subAgentStart = 'subAgentStart';
  static readonly subAgentDone = 'subAgentDone';
}

export class AgentEventType {
  static readonly message = 'message';
  static readonly chunk = 'chunk';
  static readonly agentMessage = 'agentmessage';
  static readonly agentMessageChunk = 'agentmessagechunk';
  static readonly functionCall = 'functionCall';
}

export type { FunctionCall, Tool, ToolReturn };
export {
  EventType,
  FunctionNotSupportedException
};
