export {
  DataType,
  FunctionModel,
  Info,
  OpenTool,
  OpenToolJsonLoader,
  Parameter,
  Return,
  Schema,
  SchemaType,
  SchemasSingleton
} from 'opentool-ts/opentool-schema';
export { FunctionCall, ToolReturn } from 'opentool-ts/opentool-llm';
export {
  EventType,
  FunctionNotSupportedException,
  InvalidArgumentsException,
  JsonParserException,
  ToolBreakException
} from 'opentool-ts/opentool-tool';
export {
  DAEMON_DEFAULT_PORT,
  DAEMON_DEFAULT_PREFIX,
  DaemonClient
} from 'opentool-ts/opentool-daemon';
export type {
  RegisterInfo as DaemonRegisterInfo,
  RegisterResult as DaemonRegisterResult
} from 'opentool-ts/opentool-daemon';

export interface Tool {
  call(name: string, args: Record<string, unknown>): Promise<Record<string, unknown>>;
  streamCall?(
    name: string,
    args: Record<string, unknown>,
    onEvent: (event: string, data: Record<string, unknown>) => void
  ): Promise<void>;
  load?(): Promise<import('opentool-ts/opentool-schema').OpenTool | null>;
  init?(args?: Record<string, unknown> | null): Promise<Record<string, unknown> | null | void>;
  dispose?(): Promise<void>;
}
