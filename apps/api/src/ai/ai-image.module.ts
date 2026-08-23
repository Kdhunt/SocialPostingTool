import { Module } from '@nestjs/common';
import { AppConfigModule } from '../config/app-config.module.js';
import { IMAGE_GENERATION_ADAPTER, ImageGenerationAdapterFactory } from './image-generation.module.js';

@Module({
  imports: [AppConfigModule],
  providers: [
    ImageGenerationAdapterFactory,
    {
      provide: IMAGE_GENERATION_ADAPTER,
      useFactory: (factory: ImageGenerationAdapterFactory) => factory.create(),
      inject: [ImageGenerationAdapterFactory],
    },
  ],
  exports: [IMAGE_GENERATION_ADAPTER],
})
export class AiImageModule {}
