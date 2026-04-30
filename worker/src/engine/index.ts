/**
 * Engine selector.
 *
 * Returns the appropriate engine runner for the given run mode.
 * All runners share the same EngineRunner signature:
 *   (opts: EngineOpts) => AsyncGenerator<EngineEvent>
 */
import type { EngineRunner } from './types.js';
import { runSiteMode } from './site-bot.js';
import { runAgentMode } from './agent-bot.js';
import { runApiMode } from './api-bot.js';
import { runStackMode } from './stack-bot.js';

const ENGINES: Record<string, EngineRunner> = {
  site: runSiteMode,
  agent: runAgentMode,
  api: runApiMode,
  stack: runStackMode,
};

export function selectEngine(mode: string): EngineRunner {
  const engine = ENGINES[mode];
  if (!engine) {
    throw new Error(`Unknown run mode "${mode}". Expected one of: ${Object.keys(ENGINES).join(', ')}`);
  }
  return engine;
}

export { provisionSandbox } from './sandbox.js';
export { computeReadinessScore } from './scoring.js';
export { isBotTick } from './types.js';
export type { RawFinding, BotTick, EngineEvent, SandboxHandle } from './types.js';
