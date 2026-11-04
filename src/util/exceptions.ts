type JsonValue =
  | boolean
  | null
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

export class InvalidQuery extends Error {
  readonly details?: JsonValue;

  constructor(message: string, details?: JsonValue) {
    super(message);
    this.name = 'InvalidQuery';
    this.details = details;
  }
}
