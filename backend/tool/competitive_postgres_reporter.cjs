// Keep Node's complete spec output and add progress timestamps for timeout diagnosis.
const { spec } = require('node:test/reporters');
const reporter = new spec();
const transform = reporter._transform;
reporter._transform = function (event, encoding, callback) {
  if (['test:dequeue', 'test:pass', 'test:fail'].includes(event.type)) {
    this.push(
      `${JSON.stringify({
        phase: event.type,
        at: new Date().toISOString(),
        name: event.data.name,
        file: event.data.file,
        durationMs: event.data.details?.duration_ms,
        error:
          event.type === 'test:fail'
            ? {
                message: event.data.details?.error?.message,
                cause: event.data.details?.error?.cause?.message,
                stack:
                  event.data.details?.error?.cause?.stack ??
                  event.data.details?.error?.stack,
              }
            : undefined,
      })}\n`,
    );
  }
  transform.call(this, event, encoding, callback);
};
module.exports = reporter;
