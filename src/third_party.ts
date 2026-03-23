export type { OpenTool as OpenToolSchema } from './client/toolkit/dto';
export type {
  FunctionCall as OpenToolFunctionCall,
  ToolReturn as OpenToolToolReturn,
  Tool as OpenToolTool
} from './client/agentkit/common_dto';
export {
  EventType,
  FunctionNotSupportedError as FunctionNotSupportedException
} from './client/agentkit/common_dto';

export interface DaemonRegisterInfo extends Record<string, unknown> {}

export interface DaemonRegisterResult extends Record<string, unknown> {}
