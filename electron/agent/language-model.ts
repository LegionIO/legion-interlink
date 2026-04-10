/**
 * Language model factory stub.
 *
 * The direct LLM provider integrations (OpenAI, Anthropic, Bedrock, Azure)
 * have been removed. All inference must go through the Legion daemon.
 */

export async function createLanguageModelFromConfig(_modelConfig: unknown): Promise<never> {
  throw new Error(
    'Direct LLM provider access has been removed. All inference must go through the Legion daemon.',
  );
}
