// @ts-check
// Two error types, because the CLI owes them different exit codes: a usage
// mistake is the caller's to fix (2), a runtime failure is the world's (1).

/** A runtime failure with the reason attached, so callers do not parse strings. */
export class BridgeError extends Error {
  /**
   * @param {string} message
   * @param {'offline' | 'no-plugin' | 'timeout' | 'plugin' | 'protocol' | 'bad'} kind
   */
  constructor(message, kind) {
    super(message);
    this.name = 'BridgeError';
    this.kind = kind;
  }
}

/** Unknown command, unknown flag, missing argument — anything `--help` would have prevented. */
export class UsageError extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message);
    this.name = 'UsageError';
  }
}
