export type Category = "Text to Image" | "Image to Image" | "Text to Video" | "Image to Video";

export type AspectRatio = "1:1" | "9:16" | "16:9" | "4:3" | "3:4";

export type EndpointType = "image" | "video";

export interface ModelOption {
  value: string;
  label: string;
}

export interface SubmitPayload {
  prompt: string;
  model: string;
  aspect_ratio: AspectRatio;
  negative_prompt?: string;
  duration?: number;
  image_urls?: string[];
  num_images?: number;
  resolution?: string;
}

export interface SubmitResponse {
  code: number;
  code_msg?: string;
  resp_data: {
    request_id: string;
    time?: number | null;
  };
}

export interface ResultResponse {
  code: number;
  code_msg?: string;
  trace_id?: string;
  resp_data: {
    request_id: string;
    status: string;
    video_list?: string[];
    image_list?: string[];
    usage?: {
      cost: number;
    };
    error?: string;
  };
}

export interface GenerationResult {
  url: string;
  type: "image" | "video";
  cost: number;
  requestId: string;
}

export interface HistoryItem {
  id: string;
  url: string;
  prompt: string;
  model: string;
  cost: number;
  timestamp: string;
}

export type GenerationStatus =
  | "idle"
  | "submitting"
  | "polling"
  | "success"
  | "error";

export interface FileUploadState {
  file: File | null;
  preview: string | null;
  dataUrl: string | null;
}
