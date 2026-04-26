"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { IconX, IconExternalLink, IconLoader } from "./icons";
import { getWebSocketBaseUrl } from "@/app/lib/api";

interface TerminalPanelProps {
  deploymentId: string;
  onClose: () => void;
}

/**
 * Embedded SSH terminal using xterm.js connected to the backend
 * WebSocket terminal proxy at /api/v1/deployments/{id}/terminal.
 *
 * The backend bridges keystrokes to the VM via Paramiko.
 */
export default function TerminalPanel({
  deploymentId,
  onClose,
}: TerminalPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<import("xterm").Terminal | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const fitRef = useRef<import("@xterm/addon-fit").FitAddon | null>(null);
  const [status, setStatus] = useState<"connecting" | "connected" | "error">(
    "connecting"
  );
  const [errorMsg, setErrorMsg] = useState<string>("");

  // Dynamic imports because xterm requires browser APIs
  const initTerminal = useCallback(async () => {
    if (!containerRef.current) return;

    const { Terminal } = await import("xterm");
    const { FitAddon } = await import("@xterm/addon-fit");
    const { WebLinksAddon } = await import("@xterm/addon-web-links");

    // Import CSS
    await import("xterm/css/xterm.css");

    const fitAddon = new FitAddon();
    fitRef.current = fitAddon;

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: "var(--font-geist-mono), 'Cascadia Code', 'Fira Code', monospace",
      theme: {
        background: "#0d1117",
        foreground: "#c9d1d9",
        cursor: "#58a6ff",
        cursorAccent: "#0d1117",
        selectionBackground: "#264f78",
        selectionForeground: "#ffffff",
        black: "#0d1117",
        red: "#f85149",
        green: "#3fb950",
        yellow: "#d29922",
        blue: "#58a6ff",
        magenta: "#bc8cff",
        cyan: "#39c5cf",
        white: "#c9d1d9",
        brightBlack: "#484f58",
        brightRed: "#ff7b72",
        brightGreen: "#56d364",
        brightYellow: "#e3b341",
        brightBlue: "#79c0ff",
        brightMagenta: "#d2a8ff",
        brightCyan: "#56d4dd",
        brightWhite: "#f0f6fc",
      },
      allowTransparency: false,
      scrollback: 5000,
    });

    term.loadAddon(fitAddon);
    term.loadAddon(new WebLinksAddon());
    term.open(containerRef.current);
    fitAddon.fit();
    termRef.current = term;

    // Connect WebSocket
    const wsUrl = `${getWebSocketBaseUrl()}/api/v1/deployments/${deploymentId}/terminal`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setStatus("connected");
      term.focus();
    };

    ws.onmessage = (event) => {
      term.write(event.data);
    };

    ws.onerror = () => {
      setStatus("error");
      setErrorMsg("Failed to connect to terminal");
    };

    ws.onclose = (event) => {
      if (status !== "error") {
        if (event.code === 4004) {
          setStatus("error");
          setErrorMsg(event.reason || "Deployment not found or no IP");
        } else {
          term.write("\r\n\x1b[33mSession ended.\x1b[0m\r\n");
        }
      }
    };

    // Send keystrokes to the backend
    term.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(data);
      }
    });

    // Handle resize
    const resizeObserver = new ResizeObserver(() => {
      fitAddon.fit();
    });
    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      ws.close();
      term.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deploymentId]);

  useEffect(() => {
    let cleanup: (() => void) | undefined;

    initTerminal().then((c) => {
      cleanup = c;
    });

    return () => {
      cleanup?.();
    };
  }, [initTerminal]);

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-[#0d1117]"
      style={{ animation: "slide-up 0.2s ease-out both" }}
    >
      {/* Toolbar */}
      <div className="flex h-10 shrink-0 items-center justify-between border-b border-[var(--border-color)] bg-[#161b22] px-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-[var(--fg-secondary)]">
            SSH Terminal
          </span>
          {status === "connecting" && (
            <span className="flex items-center gap-1 text-xs text-[var(--accent)]">
              <IconLoader size={12} />
              Connecting...
            </span>
          )}
          {status === "connected" && (
            <span className="h-2 w-2 rounded-full bg-[var(--success)]" />
          )}
          {status === "error" && (
            <span className="text-xs text-[var(--error)]">{errorMsg}</span>
          )}
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onClose}
            className="btn btn-ghost btn-icon btn-sm"
            aria-label="Close terminal"
          >
            <IconX size={16} />
          </button>
        </div>
      </div>

      {/* Terminal container */}
      <div ref={containerRef} className="flex-1 overflow-hidden p-1" />
    </div>
  );
}
