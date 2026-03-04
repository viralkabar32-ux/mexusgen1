import type { Category, ModelOption, AspectRatio } from "../types";

export const BASE_URL = "https://api.skycoding.ai";

export const CATEGORIES: Category[] = [
  "Text to Image",
  "Image to Image",
  "Text to Video",
  "Image to Video",
];

export const MODELS: Record<Category, ModelOption[]> = {
  "Text to Image": [
    { value: "google/nano-banana-pro", label: "Google Nano Banana Pro" },
    { value: "bytedance/seedream-4.5", label: "ByteDance Seedream 4.5" },
    { value: "google/imagen-4-ultra", label: "Google Imagen 4 Ultra" },
  ],
  "Image to Image": [
    { value: "google/nano-banana-pro", label: "Google Nano Banana Pro" },
    { value: "bytedance/seedream-4.5/edit", label: "ByteDance Seedream 4.5 Edit" },
    { value: "black-forest-labs/flux-1-kontext-dev", label: "Black Forest Labs FLUX 1 Kontext Dev" },
    { value: "openai/gpt-image-1/edit", label: "OpenAI GPT Image 1 Edit" },
  ],
  "Text to Video": [
    { value: "google/veo-3.1/text-to-video/with-audio", label: "Google Veo 3.1 (With Audio)" },
    { value: "klingai/kling-v2.5-turbo/standard/text-to-video", label: "KlingAI Kling v2.5 Turbo Standard" },
    { value: "xai/grok-imagine-video/text-to-video", label: "xAI Grok Imagine Video" },
  ],
  "Image to Video": [
    { value: "google/veo-3.1-fast/image-to-video", label: "Google Veo 3.1 Fast" },
    { value: "klingai/kling-v2.5-turbo/pro/image-to-video", label: "KlingAI Kling v2.5 Turbo Pro" },
    { value: "bytedance/omnihuman-1.5", label: "ByteDance OmniHuman 1.5" },
    { value: "luma-ai/ray-2-flash/image-to-video", label: "Luma AI Ray 2 Flash" },
  ],
};

export const ASPECT_RATIOS: AspectRatio[] = ["1:1", "9:16", "16:9", "4:3", "3:4"];

export const POLL_INTERVAL_MS = 5000;
