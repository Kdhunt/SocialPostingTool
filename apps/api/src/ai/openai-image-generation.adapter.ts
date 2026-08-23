import type { ImageGenerationAdapter, ImageGenerationRequest, ImageGenerationResult } from '@ward-comms/domain';

interface OpenAiImagesResponse {
  data?: { url?: string }[];
  error?: { message?: string };
}

/** Live OpenAI images API via fetch — no provider SDK in domain or here beyond HTTP. */
export class OpenAiImageGenerationAdapter implements ImageGenerationAdapter {
  constructor(
    private readonly apiKey: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async generateImage(request: ImageGenerationRequest): Promise<ImageGenerationResult> {
    const response = await this.fetchImpl('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'dall-e-3',
        prompt: request.prompt,
        n: 1,
        size: '1024x1024',
      }),
    });

    const body = (await response.json()) as OpenAiImagesResponse;

    if (!response.ok) {
      throw new Error(body.error?.message ?? `OpenAI image generation failed (${response.status}).`);
    }

    const url = body.data?.[0]?.url;
    if (!url) {
      throw new Error('OpenAI returned no image URL.');
    }

    return {
      storageReference: url,
      contentType: 'image/png',
    };
  }
}
