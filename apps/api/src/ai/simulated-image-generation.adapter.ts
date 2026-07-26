import { createHash } from 'node:crypto';
import type { ImageGenerationAdapter, ImageGenerationRequest, ImageGenerationResult } from '@ward-comms/domain';

/** Deterministic placeholder URLs when OPENAI_API_KEY is absent or AI_IMAGE_MODE=simulated. */
export class SimulatedImageGenerationAdapter implements ImageGenerationAdapter {
  async generateImage(request: ImageGenerationRequest): Promise<ImageGenerationResult> {
    const hash = createHash('sha256').update(request.prompt).digest('hex').slice(0, 16);
    return {
      storageReference: `simulated://ai-images/${hash}.png`,
      contentType: 'image/png',
    };
  }
}
