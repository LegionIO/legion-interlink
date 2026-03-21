import { Mastra } from '@mastra/core';
import type { AnyWorkflow } from '@mastra/core/workflows';

let instance: InstanceType<typeof Mastra> | null = null;

/**
 * Get or create the singleton Mastra instance.
 * Used for workflow execution (pubsub, storage context).
 * Minimal config — no agents, no server, in-memory only.
 */
export function getMastraInstance(): InstanceType<typeof Mastra> {
  if (!instance) {
    instance = new Mastra({
      // Workflows are registered dynamically via registerSkillWorkflow
    });
  }
  return instance;
}

/**
 * Register a workflow with the Mastra singleton so it can use
 * pubsub, storage, and other Mastra primitives during execution.
 */
export function registerSkillWorkflow(workflow: AnyWorkflow): void {
  workflow.__registerMastra(getMastraInstance());
}
