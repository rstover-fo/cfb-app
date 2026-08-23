import { defineInstrumentation } from 'eve/instrumentation'

// Presence of this export enables eve telemetry: per-tool ai.toolCall spans
// (tool name, duration, error status) and turn/step traces, surfaced in
// Vercel Agent Runs in production. recordInputs/recordOutputs stay at their
// false defaults -- span content is metadata only; the dependable per-call
// record with args is our own {evt:'tool'} log line in
// src/lib/mcp/telemetry.ts.
export default defineInstrumentation({})
