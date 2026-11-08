// Platform adapters translate their own responses into these shared failure kinds.
export class CaptureError extends Error {
  constructor(kind, message, retryAfter = 0) {
    super(message);
    this.kind = kind;
    this.retryAfter = retryAfter;
  }
}
