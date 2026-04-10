/**
 * Mastra instance stub.
 *
 * The Mastra runtime has been removed.
 * All inference must go through the Legion daemon.
 */

export function getMastraInstance(): never {
  throw new Error('The Mastra runtime has been removed. All inference must go through the Legion daemon.');
}

export function registerSkillWorkflow(_workflow: unknown): void {
  // no-op: Mastra workflows are not supported without the Mastra runtime
}
