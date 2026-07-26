import { Inject, Injectable } from '@nestjs/common';
import type { ImageGenerationAdapter } from '@ward-comms/domain';
import type { AppConfig } from '@ward-comms/config';
import { APP_CONFIG } from '../config/app-config.module.js';
import { OpenAiImageGenerationAdapter } from './openai-image-generation.adapter.js';
import { SimulatedImageGenerationAdapter } from './simulated-image-generation.adapter.js';

export const IMAGE_GENERATION_ADAPTER = Symbol('IMAGE_GENERATION_ADAPTER');

@Injectable()
export class ImageGenerationAdapterFactory {
  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  create(): ImageGenerationAdapter {
    const useLive = this.config.aiImageMode === 'live' && Boolean(this.config.openAiApiKey);
    if (useLive) {
      return new OpenAiImageGenerationAdapter(this.config.openAiApiKey!);
    }
    return new SimulatedImageGenerationAdapter();
  }
}
