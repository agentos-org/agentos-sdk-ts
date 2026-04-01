export interface FunctionCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  [key: string]: unknown;
}

export class ToolReturn {
  constructor(
    public readonly id: string,
    public readonly result: Record<string, unknown>
  ) {}

  toJson(): Record<string, unknown> {
    return {
      id: this.id,
      result: this.result
    };
  }
}

export class EventType {
  static readonly DATA = 'data';
  static readonly ERROR = 'error';
  static readonly DONE = 'done';
}

export class FunctionNotSupportedException extends Error {
  constructor(public readonly functionName: string) {
    super(`Function "${functionName}" is not supported.`);
    this.name = 'FunctionNotSupportedException';
  }

  toJson(): Record<string, unknown> {
    return {
      error: this.name,
      message: this.message,
      functionName: this.functionName
    };
  }
}

export class OpenTool {
  [key: string]: unknown;

  constructor(properties: Record<string, unknown>) {
    Object.assign(this, properties);
  }

  static fromJson(properties: Record<string, unknown>): OpenTool {
    return new OpenTool(properties);
  }

  toJson(): Record<string, unknown> {
    return { ...this };
  }
}

export interface Tool {
  call(name: string, args: Record<string, unknown>): Promise<Record<string, unknown>>;
  streamCall?(
    name: string,
    args: Record<string, unknown>,
    onEvent: (event: string, data: Record<string, unknown>) => void
  ): Promise<void>;
  load?(): Promise<OpenTool | null>;
  init?(args?: Record<string, unknown> | null): Promise<Record<string, unknown> | null | void>;
  dispose?(): Promise<void>;
}
