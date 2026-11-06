'use client';

import { useState, useEffect } from 'react';
import { Camera, ZoomIn, X, RefreshCw, AlertCircle, Image as ImageIcon } from 'lucide-react';

interface EvidenceImagePreviewProps {
  src?: string | null;
  alt?: string;
  caption?: string;
  className?: string;
  maxHeightClass?: string;
}

export function normalizeEvidenceUrl(rawUrl?: string | null): string {
  if (!rawUrl || typeof rawUrl !== 'string') return '';
  const trimmed = rawUrl.trim();
  if (!trimmed) return '';

  // Already an upload view proxy URL
  if (trimmed.startsWith('/api/upload/view')) {
    return trimmed;
  }

  // Relative upload URL
  if (trimmed.startsWith('/uploads/')) {
    return `/api/upload/view?url=${encodeURIComponent(trimmed)}`;
  }

  // Known mock storage URL or absolute URL with filename
  if (trimmed.includes('storage.junkitout.in') || trimmed.includes('/disputes/')) {
    return `/api/upload/view?url=${encodeURIComponent(trimmed)}`;
  }

  // Standard absolute URL
  return trimmed;
}

export default function EvidenceImagePreview({
  src,
  alt = 'Dispute evidence photo',
  caption = 'Photographic Evidence Attached',
  className = '',
  maxHeightClass = 'max-h-48 sm:max-h-60',
}: EvidenceImagePreviewProps) {
  const [status, setStatus] = useState<'loading' | 'loaded' | 'error' | 'empty'>(
    src ? 'loading' : 'empty'
  );
  const [isZoomed, setIsZoomed] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  const normalizedSrc = normalizeEvidenceUrl(src);

  useEffect(() => {
    if (!src) {
      setStatus('empty');
    } else {
      setStatus('loading');
    }
  }, [src, retryCount]);

  if (!src || status === 'empty') {
    return null;
  }

  const filename = (() => {
    try {
      const parts = src.split(/[/\\]/);
      return parts[parts.length - 1] || 'photo.jpg';
    } catch {
      return 'photo.jpg';
    }
  })();

  const handleRetry = () => {
    setStatus('loading');
    setRetryCount((c) => c + 1);
  };

  return (
    <div className={`space-y-2 ${className}`}>
      {/* Evidence Header */}
      <div className="flex items-center justify-between text-xs font-bold text-slate-700">
        <span className="inline-flex items-center gap-1.5 text-blue-900 font-bold">
          <Camera className="w-3.5 h-3.5 text-blue-600" />
          <span>{caption}</span>
        </span>
        {status === 'loaded' && (
          <button
            type="button"
            onClick={() => setIsZoomed(true)}
            className="text-[11px] text-blue-700 hover:text-blue-800 font-bold flex items-center gap-1 cursor-pointer transition-colors"
          >
            <ZoomIn className="w-3.5 h-3.5" />
            <span>Inspect Full Size</span>
          </button>
        )}
      </div>

      {/* Main Image Container */}
      <div className="relative rounded-2xl overflow-hidden border border-blue-200 bg-white flex items-center justify-center min-h-[140px]">
        {/* Loading State */}
        {status === 'loading' && (
          <div className="py-8 px-4 flex flex-col items-center justify-center space-y-2 text-slate-400">
            <RefreshCw className="w-5 h-5 animate-spin text-blue-600" />
            <span className="text-[11px] font-semibold">Loading photo evidence...</span>
          </div>
        )}

        {/* Error / Unavailable State */}
        {status === 'error' && (
          <div className="p-4 w-full flex flex-col items-center text-center space-y-2 bg-amber-50/70 text-slate-700">
            <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center">
              <ImageIcon className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-bold text-slate-800">Photo Evidence Attached</p>
              <p className="text-[11px] text-slate-500 font-mono truncate max-w-xs">{filename}</p>
              <p className="text-[10px] text-slate-400 mt-0.5">Preview offline or link expired</p>
            </div>
            <button
              type="button"
              onClick={handleRetry}
              className="mt-1 px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-100 flex items-center gap-1 cursor-pointer shadow-xs"
            >
              <RefreshCw className="w-3 h-3" />
              <span>Retry</span>
            </button>
          </div>
        )}

        {/* Loaded Image */}
        <div className={`w-full ${status === 'loaded' ? 'block' : 'hidden'}`}>
          <img
            src={normalizedSrc ? `${normalizedSrc}${normalizedSrc.includes('?') ? '&' : '?'}retry=${retryCount}` : ''}
            alt={alt}
            onLoad={() => setStatus('loaded')}
            onError={() => setStatus('error')}
            onClick={() => setIsZoomed(true)}
            className={`w-full ${maxHeightClass} object-contain cursor-zoom-in bg-slate-900/5 transition-opacity duration-200`}
            loading="lazy"
          />
        </div>
      </div>

      {/* Lightbox / Expanded Modal */}
      {isZoomed && status === 'loaded' && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-[70] bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-6"
          onClick={() => setIsZoomed(false)}
        >
          <div
            className="relative max-w-3xl w-full max-h-[92vh] flex flex-col bg-white rounded-3xl overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Lightbox Header */}
            <div className="flex items-center justify-between p-4 border-b border-slate-100 bg-white">
              <div className="flex items-center gap-2">
                <Camera className="w-4 h-4 text-blue-600" />
                <span className="text-xs font-bold text-slate-800 truncate">{filename}</span>
              </div>
              <button
                type="button"
                onClick={() => setIsZoomed(false)}
                className="p-1.5 rounded-xl hover:bg-slate-100 text-slate-500 hover:text-slate-800 cursor-pointer"
                aria-label="Close enlarged preview"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Lightbox Image */}
            <div className="flex-1 overflow-auto p-2 bg-slate-900 flex items-center justify-center">
              <img
                src={normalizedSrc}
                alt={alt}
                className="max-h-[75vh] w-auto max-w-full object-contain rounded-xl"
              />
            </div>

            {/* Lightbox Footer */}
            <div className="p-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-xs">
              <span className="text-slate-500 text-[11px]">Inspection View (Full Resolution)</span>
              <button
                type="button"
                onClick={() => setIsZoomed(false)}
                className="px-4 py-1.5 rounded-xl bg-slate-900 text-white font-bold text-xs hover:bg-slate-800 cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

