import { useState, useRef, useCallback, useEffect } from "react";
import { CATEGORIES, MODELS, ASPECT_RATIOS } from "./constants";
import { generateMedia, getHistory } from "./services/api";
import type {
  Category,
  AspectRatio,
  GenerationResult,
  GenerationStatus,
  HistoryItem,
} from "./types";
import { cn } from "./utils/cn";
import { History } from "./components/History";

const CATEGORY_ICONS: Record<Category, string> = {
  "Text to Image": "🎨",
  "Image to Image": "🖼️",
  "Text to Video": "🎬",
  "Image to Video": "🎥",
};

// Function to convert file to base64 data URL
const fileToDataUrl = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

export function App() {
  // Auth
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);

  // Form
  const [category, setCategory] = useState<Category>("Text to Image");
  const [model, setModel] = useState(MODELS["Text to Image"][0].value);
  const [prompt, setPrompt] = useState("");
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>("9:16");
  const [duration, setDuration] = useState(5);
  
  // Update duration based on model
  useEffect(() => {
    if (model.includes('veo')) {
      setDuration(8);
    } else if (duration === 8) {
      setDuration(5);
    }
  }, [model]);

  // File upload state
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [fileDataUrl, setFileDataUrl] = useState<string | null>(null);
  const [isConvertingFile, setIsConvertingFile] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // State
  const [status, setStatus] = useState<GenerationStatus>("idle");
  const [statusMessage, setStatusMessage] = useState("");
  const [requestId, setRequestId] = useState<string | null>(null);
  const [result, setResult] = useState<GenerationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pollCount, setPollCount] = useState(0);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [maxTimeout, setMaxTimeout] = useState(0);
  
  // History state
  const [history, setHistory] = useState<HistoryItem[]>(() => {
    const saved = localStorage.getItem("nexus_gen1_history");
    return saved ? JSON.parse(saved) : [];
  });
  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => {
    localStorage.setItem("nexus_gen1_history", JSON.stringify(history));
  }, [history]);

  const abortRef = useRef<AbortController | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const elapsedTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const needsImage = category === "Image to Image" || category === "Image to Video";
  const isVideo = category === "Text to Video" || category === "Image to Video";

  // Handle file selection
  const handleFileSelect = useCallback(async (file: File | null) => {
    if (!file) {
      setUploadFile(null);
      setFilePreview(null);
      setFileDataUrl(null);
      return;
    }

    // Validate file type
    if (!file.type.startsWith("image/")) {
      setError("File harus berupa gambar (JPG, PNG, GIF, WebP)");
      return;
    }

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      setError("Ukuran file maksimal 10MB");
      return;
    }

    setUploadFile(file);
    setError(null);
    
    // Create preview URL
    const previewUrl = URL.createObjectURL(file);
    setFilePreview(previewUrl);

    // Convert to data URL for API
    setIsConvertingFile(true);
    try {
      const dataUrl = await fileToDataUrl(file);
      setFileDataUrl(dataUrl);
    } catch {
      setError("Gagal memproses file gambar");
      setFileDataUrl(null);
    } finally {
      setIsConvertingFile(false);
    }
  }, []);

  // Cleanup preview URL when component unmounts or file changes
  useEffect(() => {
    return () => {
      if (filePreview) {
        URL.revokeObjectURL(filePreview);
      }
    };
  }, [filePreview]);

  const handleCategoryChange = (cat: Category) => {
    setCategory(cat);
    setModel(MODELS[cat][0].value);
    setResult(null);
    setError(null);
    setStatus("idle");
    setStatusMessage("");
    setRequestId(null);
    setPollCount(0);
  };

  const handleStatusUpdate = useCallback((s: string, reqId?: string) => {
    if (s === "submitting") {
      setStatus("submitting");
      setStatusMessage("Mengirim permintaan ke server...");
    } else if (s === "polling") {
      setStatus("polling");
      setRequestId(reqId ?? null);
      setStatusMessage("Memproses... menunggu hasil.");
      setPollCount(0);
      setElapsedTime(0);
      // Set timeout sesuai kategori (60s untuk gambar, 120s untuk video)
      setMaxTimeout(isVideo ? 240 : 60);
    }
  }, [isVideo]);

  const handleGenerate = async () => {
    if (!apiKey.trim()) {
      setError("Masukkan API Key terlebih dahulu.");
      return;
    }
    if (!prompt.trim()) {
      setError("Masukkan prompt terlebih dahulu.");
      return;
    }

    // Cancel previous
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setResult(null);
    setError(null);
    setStatus("submitting");
    setRequestId(null);
    setPollCount(0);

    // Animate poll counter
    const timer = setInterval(() => {
      setPollCount((c) => c + 1);
    }, 5000);
    pollTimerRef.current = timer;

    // Timer untuk elapsed time (setiap detik)
    const elapsedTimer = setInterval(() => {
      setElapsedTime((t) => t + 1);
    }, 1000);
    elapsedTimerRef.current = elapsedTimer;

    try {
      // Use fileDataUrl if available for image categories
      const imageUrlToUse = needsImage && fileDataUrl ? fileDataUrl : undefined;
      
      const res = await generateMedia(
        apiKey.trim(),
        category,
        prompt.trim(),
        model,
        aspectRatio,
        imageUrlToUse,
        duration,
        handleStatusUpdate,
        controller.signal
      );
      setResult(res);
      setStatus("success");
      setStatusMessage("Berhasil! Hasil telah tersedia.");

      // Add to local history
      const newItem: HistoryItem = {
        id: res.requestId,
        url: res.url,
        prompt: prompt.trim(),
        model: model,
        cost: res.cost,
        timestamp: new Date().toISOString()
      };
      setHistory(prev => [newItem, ...prev].slice(0, 50));

    } catch (err: unknown) {
      if (controller.signal.aborted) {
        setStatus("idle");
        setStatusMessage("");
        setError("Proses dibatalkan.");
      } else {
        setStatus("error");
        setError(err instanceof Error ? err.message : "Terjadi kesalahan tidak diketahui.");
      }
    } finally {
      clearInterval(timer);
      pollTimerRef.current = null;
      clearInterval(elapsedTimer);
      elapsedTimerRef.current = null;
    }
  };

  const handleCancel = () => {
    if (abortRef.current) abortRef.current.abort();
    if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    if (elapsedTimerRef.current) clearInterval(elapsedTimerRef.current);
    setStatus("idle");
    setStatusMessage("");
    setError("Proses dibatalkan oleh pengguna.");
    setElapsedTime(0);
  };

  const handleReset = () => {
    if (abortRef.current) abortRef.current.abort();
    if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    if (elapsedTimerRef.current) clearInterval(elapsedTimerRef.current);
    setStatus("idle");
    setStatusMessage("");
    setResult(null);
    setError(null);
    setRequestId(null);
    setPollCount(0);
    setElapsedTime(0);
    setMaxTimeout(0);
    setPrompt("");
    // Clear file upload
    setUploadFile(null);
    setFilePreview(null);
    setFileDataUrl(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleRemoveFile = () => {
    setUploadFile(null);
    setFilePreview(null);
    setFileDataUrl(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const syncApiHistory = async () => {
    if (!apiKey.trim()) {
      setError("Masukkan API Key untuk sinkronisasi riwayat.");
      return;
    }

    setIsSyncing(true);
    setError(null);
    try {
      const [imgRes, vidRes] = await Promise.all([
        getHistory("image", apiKey),
        getHistory("video", apiKey)
      ]);

      const apiItems: HistoryItem[] = [];

      const processHistory = (res: any) => {
        if (res.code === 200 && res.resp_data?.list) {
          res.resp_data.list.forEach((item: any) => {
            if (item.status === 'success' && (item.image_list?.[0] || item.video_list?.[0])) {
              apiItems.push({
                id: item.request_id,
                url: item.image_list?.[0] || item.video_list?.[0],
                prompt: item.prompt || 'Generated from API',
                model: item.model || 'Unknown',
                cost: item.usage?.cost || 0,
                timestamp: item.created_at || new Date().toISOString()
              });
            }
          });
        }
      };

      processHistory(imgRes);
      processHistory(vidRes);

      // Merge and sort
      setHistory(apiItems.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).slice(0, 100));
      setStatusMessage("Riwayat berhasil disinkronkan!");
      setTimeout(() => setStatusMessage(""), 3000);
      
    } catch (err: any) {
      console.error("Sync error:", err);
      setError(`Gagal sinkronisasi: ${err.message}`);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleSelectItem = (item: HistoryItem) => {
    setResult({
      url: item.url,
      type: item.url.toLowerCase().includes('.mp4') || item.model.toLowerCase().includes('video') ? 'video' : 'image',
      cost: item.cost,
      requestId: item.id
    });
    setStatus("success");
    
    // Scroll to result
    setTimeout(() => {
      const resultElement = document.getElementById('result-panel');
      if (resultElement) {
        resultElement.scrollIntoView({ behavior: 'smooth' });
      }
    }, 100);
  };

  const isLoading = status === "submitting" || status === "polling";

  // Check if generate button should be disabled
  // Image input is now OPTIONAL, so we don't require it
  const isGenerateDisabled = !apiKey.trim() || !prompt.trim() || isConvertingFile;

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white font-sans">
      {/* Animated background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -left-40 w-96 h-96 bg-purple-700/20 rounded-full blur-3xl animate-pulse" />
        <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-cyan-700/20 rounded-full blur-3xl animate-pulse" style={{ animationDelay: "1s" }} />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-indigo-900/10 rounded-full blur-3xl" />
        {/* Grid overlay */}
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)",
            backgroundSize: "40px 40px",
          }}
        />
      </div>

      <div className="relative z-10 min-h-screen flex flex-col">
        {/* Header */}
        <header className="border-b border-white/5 bg-black/30 backdrop-blur-xl sticky top-0 z-20">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              {/* Logo */}
              <div className="relative w-10 h-10">
                <div className="absolute inset-0 bg-gradient-to-br from-purple-500 to-cyan-500 rounded-xl blur-sm opacity-80" />
                <div className="relative w-10 h-10 bg-gradient-to-br from-purple-600 to-cyan-600 rounded-xl flex items-center justify-center">
                  <span className="text-white font-black text-sm tracking-tight">NX</span>
                </div>
              </div>
              <div>
                <h1 className="text-xl font-black tracking-widest bg-gradient-to-r from-purple-400 via-cyan-400 to-purple-400 bg-clip-text text-transparent">
                  NEXUS GEN1
                </h1>
                <p className="text-[10px] text-white/30 tracking-widest uppercase">AI Media Generator</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 text-xs text-white/40">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span>API aktif</span>
              </div>
            </div>
          </div>
        </header>

        {/* Main Content Area */}
        <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 py-8">
          <div className="grid grid-cols-1 lg:grid-cols-[240px_1fr_320px] gap-8">
            
            {/* LEFT COLUMN - CATEGORY LIST & GUIDANCE */}
            <aside className="space-y-4 flex flex-col">
              <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-4 backdrop-blur-sm">
                <h2 className="text-[10px] font-bold text-white/30 uppercase tracking-widest mb-4 ml-1">Kategori</h2>
                <nav className="space-y-2">
                  {CATEGORIES.map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => handleCategoryChange(cat)}
                      className={cn(
                        "w-full flex items-center gap-3 p-3 rounded-xl border text-sm font-semibold transition-all duration-200",
                        category === cat
                          ? "bg-gradient-to-r from-purple-600/30 to-transparent border-purple-500/50 text-white shadow-[0_0_20px_rgba(168,85,247,0.1)]"
                          : "bg-black/20 border-white/5 text-white/30 hover:border-white/20 hover:text-white/60"
                      )}
                    >
                      <span className="text-lg">{CATEGORY_ICONS[cat]}</span>
                      <span>{cat}</span>
                    </button>
                  ))}
                </nav>
              </div>

              {/* Guidance Box - Moved under category and made symmetrical */}
              <div className="bg-blue-500/10 border border-blue-500/20 rounded-2xl p-5 backdrop-blur-sm flex flex-col flex-grow min-h-[220px]">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-blue-400 text-sm">ℹ️</span>
                    <h3 className="text-xs font-bold text-blue-300 uppercase tracking-wider">Punya API Key?</h3>
                  </div>
                  <div className="space-y-3">
                    <p className="text-[11px] text-blue-100/60 leading-relaxed">
                      Gunakan Multymodel API Key untuk akses penuh ke semua fitur NEXUS GEN1.
                    </p>
                    <ul className="text-[10px] text-blue-100/40 space-y-1.5 list-disc list-inside ml-1">
                      <li>Buka halaman API key</li>
                      <li>Aktifkan Multymodel Key</li>
                      <li>Salin & tempel di atas</li>
                    </ul>
                  </div>
                </div>
                <a 
                  href="https://www.apifree.ai/manage/api-keys" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="w-full mt-4 py-3 bg-blue-600/20 hover:bg-blue-600/40 border border-blue-500/30 rounded-xl text-[10px] font-black uppercase tracking-[0.1em] text-blue-300 text-center transition-all shadow-lg"
                >
                  Buka Halaman API Key
                </a>
              </div>
            </aside>

            {/* MIDDLE COLUMN - API KEY, MODEL, PROMPT, ACTIONS */}
            <section className="space-y-6">
              
              {/* API KEY INPUT - Full Width & Symmetrical */}
              <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-6 backdrop-blur-sm">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-lg bg-amber-500/20 text-amber-500 flex items-center justify-center text-xs shadow-inner">🔐</div>
                    <h2 className="text-[10px] font-black text-white/40 uppercase tracking-[0.2em]">API Key Autentikasi</h2>
                  </div>
                  <div className="flex items-center gap-2 text-[10px] font-mono text-emerald-500/60">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    Enkripsi Aktif
                  </div>
                </div>
                <div className="relative">
                  <input
                    type={showKey ? "text" : "password"}
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value.trim())}
                    placeholder="Masukkan API Key Multymodel Anda..."
                    className="w-full bg-black/60 border border-white/10 rounded-2xl px-5 py-4 pr-14 text-sm text-white placeholder-white/10 focus:outline-none focus:border-purple-500/50 focus:ring-4 focus:ring-purple-500/5 transition-all shadow-xl font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setShowKey(!showKey)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center rounded-lg bg-white/5 text-white/20 hover:text-white/60 hover:bg-white/10 transition-all"
                  >
                    {showKey ? "🙈" : "👁️"}
                  </button>
                </div>
                <div className="mt-3 flex items-center justify-between text-[10px]">
                  <span className="text-white/20 italic">API Key tidak disimpan secara permanen</span>
                  <span className="text-amber-500/40 font-bold uppercase tracking-widest">Skycoding Powered</span>
                </div>
              </div>

              {/* MODEL & SETTINGS (Single line dropdown) */}
              <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-5 backdrop-blur-sm space-y-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-white/30 uppercase tracking-widest ml-1">Pilih Model AI</label>
                  <select 
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    className="w-full bg-black/60 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-cyan-500/50 appearance-none cursor-pointer hover:border-white/20 transition-all"
                  >
                    {MODELS[category].map((m) => (
                      <option key={m.value} value={m.value}>{m.label}</option>
                    ))}
                  </select>
                </div>

                {/* Nested Dropdowns (Aspect Ratio & Duration) */}
                <div className="grid grid-cols-2 gap-4 pt-2 border-t border-white/5">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-white/30 uppercase tracking-widest ml-1">Rasio Aspek</label>
                    <select 
                      value={aspectRatio}
                      onChange={(e) => setAspectRatio(e.target.value as AspectRatio)}
                      className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2 text-xs text-white focus:outline-none transition-all"
                    >
                      {ASPECT_RATIOS.map((ar) => (
                        <option key={ar} value={ar}>{ar}</option>
                      ))}
                    </select>
                  </div>
                  {isVideo && (
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-white/30 uppercase tracking-widest ml-1">Durasi</label>
                      {model.includes('veo') ? (
                        <div className="w-full bg-purple-500/10 border border-purple-500/20 rounded-xl px-4 py-2 text-xs text-purple-300 font-bold">8 Detik</div>
                      ) : (
                        <select 
                          value={duration}
                          onChange={(e) => setDuration(Number(e.target.value))}
                          className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2 text-xs text-white focus:outline-none transition-all"
                        >
                          <option value={5}>5 Detik</option>
                          <option value={10}>10 Detik</option>
                        </select>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* PROMPT & IMAGE OPTIONAL */}
              <div className="space-y-4">
                <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-5 backdrop-blur-sm">
                  <h2 className="text-[10px] font-bold text-white/30 uppercase tracking-widest mb-3 ml-1">Input Prompt</h2>
                  <textarea
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder={`Contoh: Cinematic shot of a futuristic city...`}
                    rows={4}
                    className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-white/10 focus:outline-none focus:border-purple-500/50 transition-all resize-none"
                  />
                </div>

                {needsImage && (
                  <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-4 backdrop-blur-sm">
                    <div className="flex items-center justify-between mb-3">
                      <h2 className="text-[10px] font-bold text-white/30 uppercase tracking-widest ml-1">Referensi Gambar (Opsional)</h2>
                      {uploadFile && (
                        <button onClick={handleRemoveFile} className="text-[10px] text-red-400 font-bold uppercase hover:text-red-300">Hapus</button>
                      )}
                    </div>
                    {!uploadFile ? (
                      <div 
                        onClick={() => fileInputRef.current?.click()}
                        className="border border-dashed border-white/10 rounded-xl p-4 text-center cursor-pointer hover:bg-white/5 transition-all"
                      >
                        <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => handleFileSelect(e.target.files?.[0] || null)} />
                        <span className="text-xs text-white/30 italic">Klik untuk upload gambar pendukung</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-4">
                        <img src={filePreview || ""} className="w-16 h-16 rounded-lg object-cover border border-white/20" />
                        <div className="text-[10px] text-white/40 truncate flex-1">
                          <p className="font-bold text-white/60">{uploadFile.name}</p>
                          <p>{(uploadFile.size / 1024 / 1024).toFixed(2)} MB</p>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* GENERATE ACTIONS */}
              <div className="space-y-4">
                <div className="flex gap-3">
                  {!isLoading ? (
                    <button
                      onClick={handleGenerate}
                      disabled={isGenerateDisabled}
                      className="flex-1 py-4 bg-gradient-to-r from-purple-600 to-cyan-600 rounded-2xl text-sm font-black uppercase tracking-widest disabled:opacity-30 hover:scale-[1.02] active:scale-[0.98] transition-all"
                    >
                      🚀 GENERATE {isVideo ? "VIDEO" : "GAMBAR"}
                    </button>
                  ) : (
                    <button onClick={handleCancel} className="flex-1 py-4 bg-red-500/20 border border-red-500/30 rounded-2xl text-sm font-black text-red-400 uppercase tracking-widest flex items-center justify-center gap-3">
                      <LoadingSpinner /> BATALKAN PROSES
                    </button>
                  )}
                  <button onClick={handleReset} className="px-6 py-4 bg-white/5 border border-white/10 rounded-2xl text-xs font-bold text-white/40 hover:text-white/80 transition-all">Reset</button>
                </div>

                {error && (
                  <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-[11px] text-red-400">
                    <span className="font-bold">Error:</span> {error}
                  </div>
                )}
              </div>

              {/* PROCESSING STATUS */}
              {isLoading && (
                <div className="bg-black/40 border border-white/10 rounded-2xl p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-purple-400 uppercase tracking-widest">{statusMessage}</span>
                    <span className="text-[10px] font-mono text-white/20">#{requestId}</span>
                  </div>
                  <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-gradient-to-r from-purple-500 to-cyan-500 transition-all duration-1000"
                      style={{ width: `${Math.min((elapsedTime / maxTimeout) * 100, 100)}%` }}
                    />
                  </div>
                  <div className="flex justify-between items-center text-[10px] font-mono text-white/30">
                    <span>Waktu Berjalan: {elapsedTime}s</span>
                    <span>Estimasi: {maxTimeout}s</span>
                  </div>
                </div>
              )}

              {/* RESULT DISPLAY */}
              {status === "success" && result && (
                <div id="result-panel">
                  <ResultCard result={result} />
                </div>
              )}

            </section>

            {/* RIGHT COLUMN - FULL HISTORY */}
            <aside className="lg:block">
              <History 
                history={history} 
                onSelectItem={handleSelectItem}
                onClear={() => setHistory([])}
                onSync={syncApiHistory}
                isSyncing={isSyncing}
              />
            </aside>
          </div>
        </main>

        <footer className="border-t border-white/5 py-6 text-center text-[10px] text-white/15 tracking-[0.3em] uppercase">
          Nexus Gen1 System &bull; Multymodel AI Hub
        </footer>
      </div>

      <style>{`
        @keyframes shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
        .animate-fade-in { animation: fadeIn 0.3s ease-out forwards; }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

function LoadingSpinner() {
  return (
    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

function ResultCard({ result }: { result: GenerationResult }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(result.url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="bg-gradient-to-br from-purple-500/10 to-cyan-500/10 border border-white/10 rounded-2xl overflow-hidden backdrop-blur-sm animate-fade-in">
      <div className="px-5 py-4 border-b border-white/5 flex justify-between items-center bg-black/20">
        <span className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">✅ Generasi Berhasil</span>
        <span className="text-[10px] font-mono text-white/40">ID: {result.requestId}</span>
      </div>
      <div className="p-6 space-y-5">
        <div className="space-y-2">
          <label className="text-[9px] font-black text-white/30 uppercase tracking-[0.2em] ml-1">Output URL</label>
          <div 
            onClick={handleCopy}
            className="group relative bg-black/60 border border-white/10 rounded-xl p-4 text-xs text-cyan-400 font-mono break-all cursor-pointer hover:border-cyan-500/50 transition-all"
          >
            {result.url}
            {copied && (
              <div className="absolute inset-0 bg-emerald-500 flex items-center justify-center rounded-xl transition-all">
                <span className="text-white font-black text-[10px] uppercase tracking-widest">URL Tersalin!</span>
              </div>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={handleCopy} className="flex-1 py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all">Salin URL</button>
          <a href={result.url} target="_blank" rel="noopener noreferrer" className="flex-1 py-3 bg-gradient-to-r from-purple-600 to-cyan-600 text-white text-[10px] font-black uppercase tracking-widest text-center rounded-xl transition-all">Buka Link ↗</a>
        </div>
        <div className="flex justify-center gap-4 text-[10px] font-mono text-white/30">
          <span>Cost: ${result.cost.toFixed(4)}</span>
          <span>&bull;</span>
          <span className="uppercase">{result.type} Output</span>
        </div>
      </div>
    </div>
  );
}
