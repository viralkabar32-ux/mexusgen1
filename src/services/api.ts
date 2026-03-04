import { BASE_URL, POLL_INTERVAL_MS } from "../constants";
import type {
  Category,
  AspectRatio,
  EndpointType,
  SubmitPayload,
  SubmitResponse,
  ResultResponse,
  GenerationResult,
} from "../types";

// Waktu tunggu maksimal (dalam detik)
const TIMEOUT_IMAGE = 60; // 1 menit untuk gambar
const TIMEOUT_VIDEO = 240; // 4 menit untuk video (240 detik)

function getEndpointType(category: Category): EndpointType {
  if (category === "Text to Image" || category === "Image to Image") return "image";
  return "video";
}

function getTimeoutSeconds(category: Category): number {
  // Gambar: 1 menit, Video: 4 menit
  return (category === "Text to Image" || category === "Image to Image") 
    ? TIMEOUT_IMAGE 
    : TIMEOUT_VIDEO;
}

function buildPayload(
  category: Category,
  prompt: string,
  model: string,
  aspectRatio: AspectRatio,
  imageUrl?: string,
  duration?: number
): SubmitPayload {
  const base: SubmitPayload = {
    prompt,
    model,
    aspect_ratio: aspectRatio,
  };

  // Untuk kategori image, tambahkan num_images dan resolution
  if (category === "Text to Image" || category === "Image to Image") {
    base.num_images = 1;
    base.resolution = "1k";
  }

  if (category === "Image to Image") {
    // Hanya kirim image_urls jika ada
    if (imageUrl) {
      return { ...base, image_urls: [imageUrl] };
    }
    return base;
  }

  if (category === "Text to Video") {
    return { ...base, duration: duration || 5 };
  }

  if (category === "Image to Video") {
    // Hanya kirim image_urls jika ada
    if (imageUrl) {
      return { ...base, duration: duration || 5, image_urls: [imageUrl] };
    }
    return { ...base, duration: duration || 5 };
  }

  // Text to Image - no extra fields
  return base;
}

async function submitRequest(
  apiKey: string,
  type: EndpointType,
  payload: SubmitPayload
): Promise<string> {
  const response = await fetch(`${BASE_URL}/v1/${type}/submit`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey.trim()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    if (response.status === 403) {
      throw new Error("HTTP 403: API Key tidak valid atau tidak memiliki izin akses.");
    }
    if (response.status === 401) {
      throw new Error("HTTP 401: API Key tidak terotorisasi.");
    }
    throw new Error(`Kesalahan Server: HTTP ${response.status}`);
  }

  const data: SubmitResponse = await response.json();

  if (data.code !== 200) {
    throw new Error(data.code_msg || `Submit gagal (${data.code})`);
  }

  const requestId = data.resp_data?.request_id;

  if (!requestId) {
    throw new Error("Tidak ada request_id dalam respons submit.");
  }

  return requestId;
}

// Langsung poll ke endpoint result - berisi info status
async function fetchResult(
  apiKey: string,
  type: EndpointType,
  requestId: string
): Promise<ResultResponse> {
  const response = await fetch(`${BASE_URL}/v1/${type}/${requestId}/result`, {
    headers: {
      Authorization: `Bearer ${apiKey.trim()}`,
    },
  });

  if (!response.ok) {
    if (response.status === 403) {
      throw new Error("HTTP 403: Akses dilarang. API Key mungkin tidak memiliki izin.");
    }
    throw new Error(`Ambil hasil gagal: HTTP ${response.status}`);
  }

  const data: ResultResponse = await response.json();

  if (data.code !== 200) {
    throw new Error(data.code_msg || `Ambil hasil gagal (${data.code})`);
  }

  return data;
}

export async function getHistory(type: EndpointType, apiKey: string) {
  const response = await fetch(`${BASE_URL}/v1/${type}/history?page=1&size=20`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${apiKey.trim()}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    if (response.status === 403) {
      throw new Error("HTTP 403: API Key tidak valid atau tidak memiliki izin akses.");
    }
    throw new Error(`Gagal mengambil riwayat: HTTP ${response.status}`);
  }

  return response.json();
}

export async function generateMedia(
  apiKey: string,
  category: Category,
  prompt: string,
  model: string,
  aspectRatio: AspectRatio,
  imageUrl: string | undefined,
  duration: number | undefined,
  onStatusUpdate: (status: string, requestId?: string) => void,
  signal: AbortSignal
): Promise<GenerationResult> {
  const type = getEndpointType(category);
  const payload = buildPayload(category, prompt, model, aspectRatio, imageUrl, duration);

  // Submit
  onStatusUpdate("submitting");
  const requestId = await submitRequest(apiKey, type, payload);
  onStatusUpdate("polling", requestId);

  // Hitung waktu timeout berdasarkan kategori
  const timeoutSeconds = getTimeoutSeconds(category);

  // Poll result endpoint sampai status success
  const resultData = await new Promise<ResultResponse>((resolve, reject) => {
    let stopped = false;
    const startTime = Date.now();

    const poll = async () => {
      if (stopped || signal.aborted) {
        reject(new Error("Dibatalkan oleh pengguna."));
        return;
      }

      // Cek apakah sudah melebihi waktu timeout
      const elapsedSeconds = (Date.now() - startTime) / 1000;
      if (elapsedSeconds >= timeoutSeconds) {
        stopped = true;
        const isVideo = category === "Text to Video" || category === "Image to Video";
        reject(new Error(
          `Waktu tunggu habis. Pemrosesan ${isVideo ? "video" : "gambar"} memerlukan waktu lebih dari ${timeoutSeconds} detik. ` +
          `Silakan coba lagi nanti atau hubungi support.`
        ));
        return;
      }

      try {
        const data = await fetchResult(apiKey, type, requestId);
        const status = data.resp_data?.status;

        if (signal.aborted) {
          reject(new Error("Dibatalkan oleh pengguna."));
          stopped = true;
          return;
        }

        if (status === "success") {
          stopped = true;
          resolve(data);
        } else if (status === "failed" || status === "error") {
          stopped = true;
          const errorMsg = data.resp_data?.error || `Pemrosesan gagal dengan status: ${status}`;
          reject(new Error(errorMsg));
        } else {
          // Status masih processing/queuing, lanjut polling
          setTimeout(() => {
            if (!stopped && !signal.aborted) poll();
          }, POLL_INTERVAL_MS);
        }
      } catch (err) {
        stopped = true;
        reject(err);
      }
    };

    signal.addEventListener("abort", () => {
      if (!stopped) {
        stopped = true;
        reject(new Error("Dibatalkan oleh pengguna."));
      }
    });

    poll();
  });

  // Parse result
  const rd = resultData.resp_data;

  const resultUrl =
    rd.video_list?.[0] ??
    rd.image_list?.[0] ??
    null;

  if (!resultUrl) {
    throw new Error("Tidak ada URL hasil dalam respons.");
  }

  const cost = rd.usage?.cost || 0;
  const outputType = rd.video_list?.[0] ? "video" : "image";

  return { url: resultUrl, type: outputType, cost, requestId };
}
