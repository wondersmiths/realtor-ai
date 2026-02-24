import Anthropic from '@anthropic-ai/sdk';

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

export interface AIProviderResponse {
  content: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export interface AIProvider {
  chat(
    system: string,
    user: string,
    options?: { maxTokens?: number; temperature?: number }
  ): Promise<AIProviderResponse>;
}

// ──────────────────────────────────────────────
// Anthropic implementation
// ──────────────────────────────────────────────

export class AnthropicProvider implements AIProvider {
  private client: Anthropic;
  private model: string;

  constructor(apiKey?: string, model?: string) {
    this.client = new Anthropic({
      apiKey: apiKey || process.env.ANTHROPIC_API_KEY,
    });
    this.model = model || 'claude-sonnet-4-20250514';
  }

  async chat(
    system: string,
    user: string,
    options?: { maxTokens?: number; temperature?: number }
  ): Promise<AIProviderResponse> {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: options?.maxTokens || 4096,
      temperature: options?.temperature ?? 0.1,
      system,
      messages: [{ role: 'user', content: user }],
    });

    // Extract text content from the response blocks
    const textContent = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('');

    return {
      content: textContent,
      model: this.model,
      inputTokens: response.usage?.input_tokens ?? 0,
      outputTokens: response.usage?.output_tokens ?? 0,
      totalTokens:
        (response.usage?.input_tokens ?? 0) + (response.usage?.output_tokens ?? 0),
    };
  }
}

// ──────────────────────────────────────────────
// Singleton
// ──────────────────────────────────────────────

let provider: AnthropicProvider | null = null;

/**
 * Returns a singleton AI provider instance.
 * Returns null when ANTHROPIC_API_KEY is not configured, letting callers
 * fall back gracefully.
 */
export function getAIProvider(): AIProvider | null {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (!provider) {
    provider = new AnthropicProvider();
  }
  return provider;
}
