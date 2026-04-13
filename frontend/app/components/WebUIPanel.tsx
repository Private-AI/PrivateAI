"use client";

import { useCallback, useState } from "react";
import { IconX, IconExternalLink, IconRefresh, IconLoader, IconChat } from "./icons";

interface WebUIPanelProps {
  url: string;
  onClose: () => void;
}

/**
 * Embedded Open WebUI in a sandboxed iframe.
 *
 * Provides a toolbar with reload, open-in-browser, and close buttons.
 * Shows a loading state while the iframe content loads.
 */
export default function WebUIPanel({ url, onClose }: WebUIPanelProps) {
  const [loading, setLoading] = useState(true);
  const [iframeKey, setIframeKey] = useState(0);

  const handleReload = useCallback(() => {
    setLoading(true);
    setIframeKey((k) => k + 1);
  }, []);

  const handleLoad = useCallback(() => {
    setLoading(false);
  }, []);

  const handleOpenExternal = useCallback(() => {
    window.open(url, "_blank", "noopener,noreferrer");
  }, [url]);

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-[var(--bg)]"
      style={{ animation: "slide-up 0.2s ease-out both" }}
    >
      {/* Toolbar */}
      <div className="flex h-10 shrink-0 items-center justify-between border-b border-[var(--border-color)] bg-[var(--surface)] px-3">
        <div className="flex items-center gap-2">
          <IconChat size={14} className="text-[var(--accent)]" />
          <span className="text-xs font-medium text-[var(--fg-secondary)]">
            Open WebUI
          </span>
          {loading && (
            <span className="flex items-center gap-1 text-xs text-[var(--accent)]">
              <IconLoader size={12} />
              Loading...
            </span>
          )}
        </div>

        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={handleReload}
            className="btn btn-ghost btn-icon btn-sm"
            aria-label="Reload"
            title="Reload"
          >
            <IconRefresh size={14} />
          </button>
          <button
            type="button"
            onClick={handleOpenExternal}
            className="btn btn-ghost btn-icon btn-sm"
            aria-label="Open in browser"
            title="Open in browser"
          >
            <IconExternalLink size={14} />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="btn btn-ghost btn-icon btn-sm"
            aria-label="Close"
          >
            <IconX size={16} />
          </button>
        </div>
      </div>

      {/* Loading overlay */}
      {loading && (
        <div className="absolute inset-0 top-10 z-10 flex items-center justify-center bg-[var(--bg)]">
          <div className="flex flex-col items-center gap-3">
            <IconLoader size={32} className="text-[var(--accent)]" />
            <p className="text-sm text-[var(--muted)]">
              Loading Open WebUI...
            </p>
          </div>
        </div>
      )}

      {/* Iframe */}
      <iframe
        key={iframeKey}
        src={url}
        onLoad={handleLoad}
        className="flex-1 border-0"
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-downloads"
        allow="clipboard-read; clipboard-write"
        title="Open WebUI"
      />
    </div>
  );
}
