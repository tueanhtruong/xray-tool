export const REDACTED = '[REDACTED]'

const INSPECT = Symbol.for('nodejs.util.inspect.custom')

/**
 * Wraps a sensitive string so accidental stringification, JSON serialization, template
 * literals, and console/util.inspect output all yield `[REDACTED]`. The only way to read the
 * real value is the explicit `reveal()`.
 */
export class SecretString {
  readonly #value: string

  constructor(value: string) {
    this.#value = value
  }

  reveal(): string {
    return this.#value
  }

  toString(): string {
    return REDACTED
  }

  toJSON(): string {
    return REDACTED
  }

  [Symbol.toPrimitive](): string {
    return REDACTED
  }

  [INSPECT](): string {
    return REDACTED
  }
}
