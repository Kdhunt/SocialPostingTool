// Image generation adapter contract (no provider SDK in domain).
//
// Implementations live in apps/api (simulated or OpenAI via fetch).
// Generated images are stored as CampaignAsset rows with Pending status
// until explicitly confirmed — AGENTS.md #13.

export interface ImageGenerationRequest {
  prompt: string;
}

export interface ImageGenerationResult {
  storageReference: string;
  contentType: string;
}

/** Adapter injected by the API layer; never imported from a provider SDK here. */
export interface ImageGenerationAdapter {
  generateImage(request: ImageGenerationRequest): Promise<ImageGenerationResult>;
}
