import { HistoryItem } from '../types';
import { RefreshCw, Clock, Copy, ExternalLink, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { cn } from '../utils/cn';

interface HistoryProps {
  history: HistoryItem[];
  onSelectItem: (item: HistoryItem) => void;
  onClear: () => void;
  onSync: () => void;
  isSyncing: boolean;
}

export const History: React.FC<HistoryProps> = ({ history, onSelectItem, onClear, onSync, isSyncing }) => {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopy = (e: React.MouseEvent, text: string, id: string) => {
    e.stopPropagation();
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-5 backdrop-blur-sm mt-8">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <div className="flex items-center gap-4">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <span className="p-2 bg-indigo-500/20 rounded-lg text-indigo-400">📜</span>
            Riwayat Generasi
          </h2>
          <button
            onClick={onSync}
            disabled={isSyncing}
            className={cn(
              "flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold transition-all border",
              isSyncing 
                ? "bg-white/5 border-white/10 text-white/20 cursor-not-allowed" 
                : "bg-indigo-500/10 text-indigo-400 border-indigo-500/30 hover:bg-indigo-500/20 active:scale-95"
            )}
          >
            <RefreshCw size={12} className={isSyncing ? 'animate-spin' : ''} />
            {isSyncing ? 'Sinkronisasi...' : 'Sinkron API'}
          </button>
        </div>
        {history.length > 0 && (
          <button
            onClick={onClear}
            className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-semibold hover:bg-red-500/20 transition-all active:scale-95"
          >
            <Trash2 size={12} />
            Bersihkan Lokal
          </button>
        )}
      </div>

      {history.length === 0 ? (
        <div className="py-12 flex flex-col items-center justify-center border-2 border-dashed border-white/5 rounded-2xl bg-black/20">
          <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center text-2xl mb-4 grayscale opacity-50">
            📂
          </div>
          <p className="text-sm text-white/30 font-medium">Belum ada riwayat generasi.</p>
          <p className="text-[11px] text-white/15 mt-1">Klik Sinkron API untuk mengambil riwayat dari server.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {history.map((item) => {
            const isVideo = item.url.toLowerCase().includes('.mp4') || item.model.includes('video');
            return (
              <div 
                key={item.id}
                onClick={() => onSelectItem(item)}
                className="group relative bg-black/40 border border-white/5 rounded-xl overflow-hidden hover:border-indigo-500/30 transition-all cursor-pointer hover:shadow-lg hover:shadow-indigo-500/5"
              >
                <div className="flex gap-4 p-3">
                  {/* Thumbnail */}
                  <div className="relative w-24 h-24 shrink-0 rounded-lg overflow-hidden bg-white/5 border border-white/10">
                    {isVideo ? (
                      <div className="w-full h-full flex items-center justify-center text-xl bg-indigo-900/20">
                        🎬
                      </div>
                    ) : (
                      <img src={item.url} alt="" className="w-full h-full object-cover" />
                    )}
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <ExternalLink size={16} className="text-white" />
                    </div>
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0 flex flex-col justify-between py-0.5">
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider truncate">
                          {item.model.split('/').pop()}
                        </span>
                        <span className="text-[10px] text-white/20 font-mono shrink-0">
                          {new Date(item.timestamp).toLocaleDateString()}
                        </span>
                      </div>
                      <p className="text-xs text-white/70 line-clamp-2 leading-relaxed mb-2 italic">
                        "{item.prompt}"
                      </p>
                    </div>
                    
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={(e) => handleCopy(e, item.url, item.id)}
                          className={cn(
                            "p-1.5 rounded-md transition-all",
                            copiedId === item.id ? "bg-emerald-500/20 text-emerald-400" : "bg-white/5 text-white/30 hover:text-white/60"
                          )}
                          title="Salin URL"
                        >
                          <Copy size={12} />
                        </button>
                        <span className="text-[10px] text-white/30 font-mono truncate max-w-[80px]">
                          ID: {item.id}
                        </span>
                      </div>
                      <span className="text-[10px] font-bold text-emerald-500/60 bg-emerald-500/10 px-2 py-0.5 rounded-md border border-emerald-500/10">
                        ${item.cost.toFixed(4)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

