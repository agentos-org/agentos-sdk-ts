export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonArray;

export interface JsonObject {
  [key: string]: JsonValue | undefined;
}

export interface JsonArray extends Array<JsonValue> {}

export type Dictionary<T = unknown> = Record<string, T>;

export class ContentType {
  static readonly text = 'text';
  static readonly imageUrl = 'imageUrl';
}

export interface Content {
  type: string;
  message: string;
}
