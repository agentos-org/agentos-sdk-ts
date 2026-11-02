import {
  DataType,
  FunctionModel as BaseFunctionModel,
  Info,
  OpenTool as BaseOpenTool,
  Parameter as BaseParameter,
  Return as BaseReturn,
  Schema as BaseSchema,
  SchemaType as BaseSchemaType
} from 'opentool-ts/opentool-schema';

export { DataType, Info };

/** Any JSON Schema value, including boolean schemas and newer keywords. */
export type OpenToolJsonSchema = boolean | { [keyword: string]: unknown };

const schemaDocuments = new WeakMap<BaseSchema, OpenToolJsonSchema>();

/** JSON Schema type constants, including the JSON Schema `null` type. */
export class SchemaType extends BaseSchemaType {
  static readonly NULL = 'null';
}

/**
 * OpenTool schema wrapper that keeps the complete wire schema. The inherited
 * fields provide the legacy convenience accessors; use `rawSchema` or
 * `toJson()` when reading newer JSON Schema keywords.
 */
export class Schema extends BaseSchema {
  static fromJson(value: OpenToolJsonSchema): Schema {
    if (typeof value === 'boolean') {
      return preserveSchema(new Schema(''), value);
    }
    if (!isRecord(value)) {
      throw new TypeError('OpenTool schema must be an object or boolean.');
    }

    const reference = typeof value.$ref === 'string'
      ? value.$ref.match(/^#\/schemas\/([^/]+)$/)?.[1]
      : undefined;
    if (reference !== undefined) {
      const target = SchemasSingleton.getInstance()[
        reference.split('~1').join('/').split('~0').join('~')
      ];
      return preserveSchema(
        target
          ? new Schema(
              target.type,
              target.description,
              target.properties,
              target.items,
              target.enum_,
              target.required
            )
          : new Schema('object'),
        value
      );
    }

    const typeValue = value.type;
    const type = typeof typeValue === 'string'
      ? typeValue
      : Array.isArray(typeValue)
        ? typeValue.find((item): item is string => typeof item === 'string') ?? 'object'
        : 'object';
    const properties = isRecord(value.properties)
      ? Object.fromEntries(
          Object.entries(value.properties).map(([name, propertySchema]) => [
            name,
            Schema.fromJson(asSchema(propertySchema, `properties.${name}`))
          ])
        )
      : undefined;
    const items = value.items === undefined
      ? undefined
      : Schema.fromJson(asSchema(value.items, 'items'));
    const enumValues = Array.isArray(value.enum) ? value.enum : undefined;
    const required = Array.isArray(value.required) &&
      value.required.every((item): item is string => typeof item === 'string')
      ? value.required
      : undefined;

    return preserveSchema(
      new Schema(
        type,
        typeof value.description === 'string' ? value.description : undefined,
        properties,
        items,
        enumValues,
        required
      ),
      value
    );
  }

  get rawSchema(): OpenToolJsonSchema {
    return cloneSchema(schemaDocuments.get(this) ?? super.toJson());
  }

  toJson(): OpenToolJsonSchema {
    const raw = schemaDocuments.get(this);
    return raw === undefined
      ? super.toJson() as OpenToolJsonSchema
      : cloneSchema(raw);
  }
}

export class SchemasSingleton {
  private static schemas: Record<string, Schema> = {};

  static initInstance(schemasJson: Record<string, OpenToolJsonSchema>): void {
    const entries = Object.entries(schemasJson).map(([name, schema]) => [
      name,
      asSchema(schema, `schemas.${name}`)
    ] as const);
    this.schemas = {};
    // Register every definition before resolving OpenTool-local references.
    this.schemas = Object.fromEntries(
      entries.map(([name, schema]) => [name, Schema.fromJson(schema)])
    );
    this.schemas = Object.fromEntries(
      entries.map(([name, schema]) => [name, Schema.fromJson(schema)])
    );
  }

  static getInstance(): Record<string, Schema> {
    return this.schemas;
  }
}

export class Parameter extends BaseParameter {
  static fromJson(json: unknown): Parameter {
    const value = asRecord(json, 'OpenTool parameter');
    return new Parameter(
      value.name as string,
      Schema.fromJson(asSchema(value.schema, 'parameter.schema')),
      value.required as boolean,
      value.description as string | undefined
    );
  }
}

export class Return extends BaseReturn {
  static fromJson(json: unknown): Return {
    const value = asRecord(json, 'OpenTool return');
    return new Return(
      value.name as string,
      Schema.fromJson(asSchema(value.schema, 'return.schema')),
      value.description as string | undefined
    );
  }
}

export class FunctionModel extends BaseFunctionModel {
  static fromJson(json: unknown): FunctionModel {
    const value = asRecord(json, 'OpenTool function');
    const parameters = Array.isArray(value.parameters)
      ? value.parameters.map((parameter) => Parameter.fromJson(parameter))
      : [];
    const result = value.return == null ? undefined : Return.fromJson(value.return);
    const stream = isRecord(value.stream)
      ? Object.fromEntries(
          Object.entries(value.stream).map(([event, eventReturn]) => [
            event,
            Return.fromJson(eventReturn)
          ])
        )
      : undefined;

    return new FunctionModel(
      value.name as string,
      value.description as string,
      parameters,
      result,
      stream
    );
  }
}

export class OpenTool extends BaseOpenTool {
  static fromJson(json: unknown): OpenTool {
    const value = asRecord(json, 'OpenTool document');
    const schemaJson = isRecord(value.schemas)
      ? value.schemas as Record<string, OpenToolJsonSchema>
      : undefined;
    SchemasSingleton.initInstance(schemaJson ?? {});
    const schemas = schemaJson === undefined
      ? undefined
      : Object.fromEntries(
          Object.entries(schemaJson).map(([name, schema]) => [
            name,
            Schema.fromJson(asSchema(schema, `schemas.${name}`))
          ])
        );
    const functions = Array.isArray(value.functions)
      ? value.functions.map((functionJson) => FunctionModel.fromJson(functionJson))
      : [];

    return new OpenTool(
      value.opentool as string,
      Info.fromJson(value.info),
      value.server == null ? undefined : parseServer(value.server),
      functions,
      schemas
    );
  }
}

/** JSON loader paired with the schema-preserving OpenTool model above. */
export class OpenToolJsonLoader {
  async load(jsonString: string): Promise<OpenTool> {
    return OpenTool.fromJson(JSON.parse(jsonString) as unknown);
  }

  async loadFromFile(jsonPath: string): Promise<OpenTool> {
    const filesystemModule = 'node:fs/promises';
    const filesystem = await import(filesystemModule) as {
      readFile(path: string, encoding: string): Promise<string>;
    };
    return this.load(await filesystem.readFile(jsonPath, 'utf8'));
  }
}

export {
  EventType,
  FunctionNotSupportedException,
  InvalidArgumentsException,
  JsonParserException,
  ToolBreakException
} from 'opentool-ts/opentool-tool';
export { FunctionCall, ToolReturn } from 'opentool-ts/opentool-llm';

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

function preserveSchema<T extends Schema>(schema: T, raw: OpenToolJsonSchema): T {
  schemaDocuments.set(schema, cloneSchema(raw));
  return schema;
}

function cloneSchema<T extends OpenToolJsonSchema>(schema: T): T {
  return JSON.parse(JSON.stringify(schema)) as T;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new TypeError(`${label} must be an object.`);
  }
  return value;
}

function asSchema(value: unknown, label: string): OpenToolJsonSchema {
  if (typeof value === 'boolean' || isRecord(value)) {
    return value as OpenToolJsonSchema;
  }
  throw new TypeError(`${label} must be a JSON Schema object or boolean.`);
}

function parseServer(value: unknown): NonNullable<BaseOpenTool['server']> {
  const server = asRecord(value, 'OpenTool server');
  return {
    url: server.url as string,
    description: server.description as string | undefined,
    toJson: () => ({
      url: server.url,
      ...(server.description === undefined ? {} : { description: server.description })
    })
  } as NonNullable<BaseOpenTool['server']>;
}
