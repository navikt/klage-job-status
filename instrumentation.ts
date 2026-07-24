/**
 * Next.js compiles this file for both the Node.js and Edge runtime, and calls `register()`
 * once per server process at startup. The Node.js-only work (opening the long-lived Valkey
 * connection) lives in `./instrumentation-node`, imported only from inside this `if` block.
 *
 * This nesting matters: webpack's `DefinePlugin` replaces `process.env.NEXT_RUNTIME` with a
 * literal for each runtime's build, so it can statically drop a whole dead `if` block - along
 * with any import lexically inside it - from the Edge bundle. Guarding with an early `return`
 * instead does *not* work, since webpack doesn't do that dead-code elimination across control
 * flow; it would still try to bundle `@valkey/valkey-glide` (a Node native addon) for the Edge
 * runtime and fail.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // Must be imported first so the SDK can instrument `http`/`dns`/`net`/`undici` before
    // anything else (e.g. the Valkey client below) uses them.
    await import('./instrumentation.otel');
    await import('./instrumentation-node');
  }
}
