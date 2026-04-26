"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { COLORS } from "../lib/colors";
import { Logo, ShieldIllustration } from "./ui";
import {
  fetchModels,
  sendChatMessage,
  listConversations,
  createConversation,
  updateConversation,
  deleteConversation,
  uploadFile,
  type OWModel,
  type OWConversation,
} from "../lib/openwebui-api";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  fileRef?: { id: string; name: string };
}

interface ChatPanelProps {
  openwebuiUrl: string;
  onClose: () => void;
}

export default function ChatPanel({ openwebuiUrl, onClose }: ChatPanelProps) {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const [models, setModels] = useState<OWModel[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>("");
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(true);

  const [conversations, setConversations] = useState<OWConversation[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState("");

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isStreamingRef = useRef(false);
  // Refs for synchronous conversation tracking — avoids stale closure on activeConvId state.
  const activeConvIdRef = useRef<string | null>(null);
  const creatingConvRef = useRef(false);

  const loadModels = useCallback(async () => {
    setConnecting(true);
    setConnectionError(null);
    try {
      const data = await fetchModels(openwebuiUrl);
      setModels(data);
      const saved = localStorage.getItem("privateai_chat_model");
      const first = data[0]?.id ?? "";
      setSelectedModel(saved && data.find((m) => m.id === saved) ? saved : first);
      if (data.length === 0) setConnectionError("Connected, but no models found. The model may still be loading.");
    } catch (err) {
      setConnectionError(err instanceof Error ? err.message : "Cannot reach Open WebUI. Make sure your deployment is running.");
    } finally {
      setConnecting(false);
    }
  }, [openwebuiUrl]);

  // Load models + conversations on mount
  useEffect(() => {
    loadModels();
    listConversations(openwebuiUrl).then(setConversations).catch(() => {});
  }, [openwebuiUrl, loadModels]);

  // Auto-retry when connected but no models (deployment connecting in background)
  useEffect(() => {
    if (connecting || connectionError || models.length > 0) return;
    const t = setInterval(() => { loadModels(); }, 8000);
    return () => clearInterval(t);
  }, [connecting, connectionError, models.length, loadModels]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isStreaming]);

  const saveModel = (id: string) => {
    setSelectedModel(id);
    localStorage.setItem("privateai_chat_model", id);
  };

  const loadConversation = useCallback(async (conv: OWConversation) => {
    setActiveConvId(conv.id);
    activeConvIdRef.current = conv.id;
    const msgs = (conv.chat?.messages ?? []).map((m) => ({
      id: m.id,
      role: m.role as "user" | "assistant",
      content: m.content,
    }));
    setMessages(msgs);
  }, []);

  const startNewConversation = () => {
    setActiveConvId(null);
    activeConvIdRef.current = null;
    creatingConvRef.current = false;
    setMessages([]);
    if (textareaRef.current) {
      textareaRef.current.style.height = "44px";
    }
  };

  const handleDeleteConversation = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await deleteConversation(openwebuiUrl, id);
    setConversations((prev) => prev.filter((c) => c.id !== id));
    if (activeConvId === id) startNewConversation();
  };

  const sendMessage = useCallback(async (text?: string) => {
    const content = text ?? input.trim();
    if (!content || isStreamingRef.current) return;

    isStreamingRef.current = true;
    setInput("");
    if (textareaRef.current) textareaRef.current.style.height = "44px";

    const userMsg: Message = { id: Date.now().toString(), role: "user", content };
    const aiMsg: Message = { id: (Date.now() + 1).toString(), role: "assistant", content: "" };

    setMessages((prev) => [...prev, userMsg, aiMsg]);
    setIsStreaming(true);

    const history = [...messages, userMsg].map((m) => ({ role: m.role, content: m.content }));
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    let aiContent = "";

    try {
      await sendChatMessage(
        openwebuiUrl,
        history,
        selectedModel,
        (chunk) => {
          aiContent += chunk;
          const captured = aiContent;
          setMessages((prev) => prev.map((m) => m.id === aiMsg.id ? { ...m, content: captured } : m));
        },
        ctrl.signal,
      );
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setMessages((prev) => prev.map((m) =>
          m.id === aiMsg.id ? { ...m, content: "Sorry, something went wrong. Please try again." } : m
        ));
      }
    } finally {
      isStreamingRef.current = false;
      setIsStreaming(false);
      abortRef.current = null;
    }

    // Save/update conversation using refs (not stale state closures) to prevent
    // duplicate creation if React batches state updates or re-renders mid-stream.
    const title = content.slice(0, 60);
    const owMessages = [
      ...messages,
      userMsg,
      { ...aiMsg, content: aiContent },
    ].map((m) => ({ id: m.id, role: m.role, content: m.content, timestamp: Date.now() }));

    if (activeConvIdRef.current) {
      updateConversation(openwebuiUrl, activeConvIdRef.current, title, owMessages).catch(() => {});
    } else if (!creatingConvRef.current) {
      creatingConvRef.current = true;
      createConversation(openwebuiUrl, title, owMessages).then((conv) => {
        creatingConvRef.current = false;
        if (conv) {
          activeConvIdRef.current = conv.id;
          setActiveConvId(conv.id);
          setConversations((prev) => [conv, ...prev]);
        }
      }).catch(() => { creatingConvRef.current = false; });
    }
  }, [input, messages, selectedModel, openwebuiUrl]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  const handleTextareaInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    e.target.style.height = "44px";
    e.target.style.height = Math.min(e.target.scrollHeight, 140) + "px";
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const uploaded = await uploadFile(openwebuiUrl, file);
      const content = `[Attached file: ${file.name}]`;
      const userMsg: Message = { id: Date.now().toString(), role: "user", content, fileRef: { id: uploaded.id, name: file.name } };
      setMessages((prev) => [...prev, userMsg]);
    } catch {
      // ignore
    }
    e.target.value = "";
  };

  const filteredConversations = conversations.filter((c) =>
    c.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const suggestions = [
    "Help me write an email",
    "Summarise an article for me",
    "Plan a week of healthy meals",
    "Explain a concept simply",
  ];

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", background: COLORS.bg }}>
      {/* Sidebar */}
      <div style={{
        width: sidebarOpen ? 260 : 0, minWidth: 0, overflow: "hidden",
        borderRight: `1px solid ${COLORS.border}`, display: "flex", flexDirection: "column",
        transition: "width 0.3s ease", background: "rgba(255,255,255,0.015)", flexShrink: 0,
      }}>
        <div style={{ padding: "20px 16px 12px", borderBottom: `1px solid ${COLORS.border}` }}>
          <Logo size={22} textSize={16} />
        </div>

        <div style={{ padding: "12px 12px 4px" }}>
          <button onClick={startNewConversation} style={{
            width: "100%", background: "rgba(99,102,241,0.1)", border: `1px solid rgba(99,102,241,0.2)`,
            borderRadius: 10, padding: "9px 14px", color: COLORS.indigoLight, fontSize: 13, fontWeight: 600,
            cursor: "pointer", display: "flex", alignItems: "center", gap: 8,
            fontFamily: "var(--font-dm-sans), DM Sans, sans-serif",
          }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(99,102,241,0.18)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(99,102,241,0.1)")}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 2V12M2 7H12" stroke={COLORS.indigoLight} strokeWidth="2" strokeLinecap="round" /></svg>
            New conversation
          </button>
        </div>

        <div style={{ padding: "8px 12px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, background: "rgba(255,255,255,0.04)", border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: "7px 10px" }}>
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><circle cx="5.5" cy="5.5" r="4" stroke={COLORS.textMuted} strokeWidth="1.3" /><line x1="8.5" y1="8.5" x2="12" y2="12" stroke={COLORS.textMuted} strokeWidth="1.3" strokeLinecap="round" /></svg>
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search conversations"
              style={{ background: "none", border: "none", outline: "none", color: COLORS.textSecondary, fontSize: 12, width: "100%", fontFamily: "inherit" }}
            />
          </div>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "4px 8px" }}>
          <div style={{ fontSize: 10, color: COLORS.textMuted, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", padding: "8px 8px 4px" }}>Recent</div>
          {filteredConversations.map((conv) => (
            <div key={conv.id} onClick={() => loadConversation(conv)} style={{
              padding: "10px 10px", borderRadius: 8, cursor: "pointer", marginBottom: 2,
              background: activeConvId === conv.id ? "rgba(99,102,241,0.1)" : "transparent",
              border: `1px solid ${activeConvId === conv.id ? "rgba(99,102,241,0.2)" : "transparent"}`,
              transition: "all 0.15s", display: "flex", alignItems: "center", gap: 6,
            }}
              onMouseEnter={(e) => { if (activeConvId !== conv.id) e.currentTarget.style.background = "rgba(255,255,255,0.04)"; }}
              onMouseLeave={(e) => { if (activeConvId !== conv.id) e.currentTarget.style.background = "transparent"; }}
            >
              <div style={{ flex: 1, overflow: "hidden" }}>
                <div style={{ fontSize: 13, color: activeConvId === conv.id ? COLORS.textPrimary : COLORS.textSecondary, fontWeight: 500, marginBottom: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{conv.title}</div>
                <div style={{ fontSize: 11, color: COLORS.textMuted }}>{new Date(conv.updated_at * 1000).toLocaleDateString()}</div>
              </div>
              <button onClick={(e) => handleDeleteConversation(conv.id, e)} style={{ background: "none", border: "none", color: COLORS.textMuted, cursor: "pointer", padding: 2, borderRadius: 4, opacity: 0, flexShrink: 0 }}
                onMouseEnter={(e) => { e.currentTarget.style.opacity = "1"; e.currentTarget.style.color = "#f87171"; }}
                onMouseLeave={(e) => { e.currentTarget.style.opacity = "0"; }}
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 2L10 10M10 2L2 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
              </button>
            </div>
          ))}
        </div>

        <div style={{ padding: "12px", borderTop: `1px solid ${COLORS.border}` }}>
          <button onClick={onClose} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: 8, cursor: "pointer", color: COLORS.textSecondary, fontSize: 13, background: "none", border: "none", width: "100%", fontFamily: "inherit" }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.04)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
          >
            <svg width="15" height="15" viewBox="0 0 15 15" fill="none"><path d="M6 3L2 7.5L6 12M2 7.5H13" stroke={COLORS.textMuted} strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" /></svg>
            Back to Dashboard
          </button>
        </div>
      </div>

      {/* Main area */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {/* Topbar */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 24px", borderBottom: `1px solid ${COLORS.border}`, flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <button onClick={() => setSidebarOpen((v) => !v)} style={{ background: "none", border: "none", cursor: "pointer", padding: 4, color: COLORS.textMuted }}>
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><line x1="2" y1="5" x2="16" y2="5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /><line x1="2" y1="9" x2="16" y2="9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /><line x1="2" y1="13" x2="16" y2="13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
            </button>

            {/* Model switcher */}
            <div style={{ position: "relative" }}>
              <select
                value={selectedModel}
                onChange={(e) => saveModel(e.target.value)}
                style={{
                  appearance: "none", background: "rgba(255,255,255,0.04)", border: `1px solid ${COLORS.border}`,
                  borderRadius: 8, padding: "6px 32px 6px 12px", color: COLORS.textPrimary, fontSize: 13, fontWeight: 500,
                  cursor: "pointer", outline: "none", fontFamily: "inherit",
                }}
              >
                {models.length === 0 && <option value="">No models available</option>}
                {models.map((m) => (
                  <option key={m.id} value={m.id} style={{ background: "#0f1128" }}>{m.name ?? m.id}</option>
                ))}
              </select>
              <div style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{ width: 7, height: 7, borderRadius: "50%", background: COLORS.teal, boxShadow: `0 0 6px ${COLORS.teal}`, animation: "pulse-core 2s infinite" }} />
              </div>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {connecting && (
              <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 10px", background: "rgba(99,102,241,0.08)", border: "1px solid rgba(99,102,241,0.2)", borderRadius: 100 }}>
                <div style={{ width: 7, height: 7, borderRadius: "50%", background: COLORS.indigo, animation: "pulse-core 1.5s infinite" }} />
                <span style={{ fontSize: 11, color: COLORS.indigoLight, fontWeight: 600 }}>Connecting...</span>
              </div>
            )}
            {!connecting && !connectionError && (
              <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 10px", background: "rgba(45,212,191,0.08)", border: "1px solid rgba(45,212,191,0.2)", borderRadius: 100 }}>
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M6 1L2 3.5V6.5C2 9 3.7 11 6 11.5C8.3 11 10 9 10 6.5V3.5L6 1Z" stroke={COLORS.teal} strokeWidth="1.2" /></svg>
                <span style={{ fontSize: 11, color: COLORS.teal, fontWeight: 600 }}>Private</span>
              </div>
            )}
            {!connecting && connectionError && (
              <button onClick={loadModels} style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 10px", background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.25)", borderRadius: 100, cursor: "pointer" }}>
                <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#f87171" }} />
                <span style={{ fontSize: 11, color: "#f87171", fontWeight: 600 }}>Disconnected · Retry</span>
              </button>
            )}
          </div>
        </div>

        {/* Messages */}
        <div style={{ flex: 1, overflowY: "auto", padding: "24px", display: "flex", flexDirection: "column", gap: 20 }}>
          {messages.length === 0 ? (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", padding: "40px 0" }}>
              {connectionError && (
                <div style={{ marginBottom: 24, padding: "14px 20px", background: "rgba(248,113,113,0.07)", border: "1px solid rgba(248,113,113,0.2)", borderRadius: 12, maxWidth: 420, textAlign: "left" }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#f87171", marginBottom: 4 }}>Could not reach Open WebUI</div>
                  <div style={{ fontSize: 13, color: COLORS.textSecondary, lineHeight: 1.5 }}>{connectionError}</div>
                  <button onClick={loadModels} style={{ marginTop: 10, background: "rgba(248,113,113,0.12)", border: "1px solid rgba(248,113,113,0.25)", borderRadius: 8, padding: "7px 14px", color: "#f87171", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Retry connection</button>
                </div>
              )}
              <div style={{ marginBottom: 24, animation: "pulse-core 3s infinite" }}>
                <ShieldIllustration size={80} />
              </div>
              <h2 style={{ fontFamily: "var(--font-syne), Syne, sans-serif", fontSize: 28, fontWeight: 700, color: COLORS.textPrimary, margin: "0 0 10px", letterSpacing: "-0.02em" }}>
                {models.length === 0 && !connectionError ? "Connecting to your model..." : "What’s on your mind?"}
              </h2>
              <p style={{ color: COLORS.textSecondary, fontSize: 15, margin: "0 0 36px", maxWidth: 380, lineHeight: 1.6 }}>
                {models.length === 0 && !connectionError ? "Your AI is starting up. This takes a moment after a new deployment." : "Your conversation is completely private. Ask anything."}
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10, justifyContent: "center", maxWidth: 520 }}>
                {suggestions.map((s, i) => (
                  <button key={i} onClick={() => sendMessage(s)} style={{
                    background: COLORS.bgCard, border: `1px solid ${COLORS.border}`, borderRadius: 100,
                    padding: "9px 18px", color: COLORS.textSecondary, fontSize: 13, cursor: "pointer",
                    fontFamily: "var(--font-dm-sans), DM Sans, sans-serif", transition: "all 0.2s",
                  }}
                    onMouseEnter={(e) => { e.currentTarget.style.borderColor = COLORS.indigo; e.currentTarget.style.color = COLORS.textPrimary; }}
                    onMouseLeave={(e) => { e.currentTarget.style.borderColor = COLORS.border; e.currentTarget.style.color = COLORS.textSecondary; }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <>
              {messages.map((msg) => (
                <div key={msg.id} style={{ display: "flex", justifyContent: msg.role === "user" ? "flex-end" : "flex-start", gap: 12, alignItems: "flex-start" }}>
                  {msg.role === "assistant" && (
                    <div style={{ width: 32, height: 32, borderRadius: "50%", background: "rgba(99,102,241,0.2)", border: `1px solid rgba(99,102,241,0.3)`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 2 }}>
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 2L4 5.5V9C4 12 5.9 14 8 14.5C10.1 14 12 12 12 9V5.5L8 2Z" fill={COLORS.indigo} opacity="0.7" /><circle cx="8" cy="9" r="2" fill="white" opacity="0.8" /></svg>
                    </div>
                  )}
                  <div style={{
                    maxWidth: "70%",
                    background: msg.role === "user" ? COLORS.indigo : "rgba(255,255,255,0.05)",
                    border: `1px solid ${msg.role === "user" ? "transparent" : COLORS.border}`,
                    borderRadius: msg.role === "user" ? "18px 18px 4px 18px" : "4px 18px 18px 18px",
                    padding: "12px 16px",
                    color: COLORS.textPrimary,
                    fontSize: 14,
                    lineHeight: 1.6,
                    whiteSpace: "pre-wrap",
                  }}>
                    {msg.content}
                    {msg.fileRef && (
                      <div style={{ marginTop: 6, fontSize: 12, color: "rgba(255,255,255,0.6)", display: "flex", alignItems: "center", gap: 4 }}>
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><rect x="2" y="1" width="8" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.2" /></svg>
                        {msg.fileRef.name}
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {isStreaming && messages[messages.length - 1]?.role === "assistant" && messages[messages.length - 1]?.content === "" && (
                <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                  <div style={{ width: 32, height: 32, borderRadius: "50%", background: "rgba(99,102,241,0.2)", border: `1px solid rgba(99,102,241,0.3)`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 2L4 5.5V9C4 12 5.9 14 8 14.5C10.1 14 12 12 12 9V5.5L8 2Z" fill={COLORS.indigo} opacity="0.7" /><circle cx="8" cy="9" r="2" fill="white" opacity="0.8" /></svg>
                  </div>
                  <div style={{ background: "rgba(255,255,255,0.05)", border: `1px solid ${COLORS.border}`, borderRadius: "4px 18px 18px 18px", padding: "14px 18px", display: "flex", gap: 5, alignItems: "center" }}>
                    {[0, 1, 2].map((i) => (
                      <div key={i} style={{ width: 7, height: 7, borderRadius: "50%", background: COLORS.indigoLight, animation: `pulse-core 1.2s ease-in-out infinite ${i * 0.2}s` }} />
                    ))}
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} style={{ height: 1 }} />
            </>
          )}
        </div>

        {/* Input */}
        <div style={{ padding: "16px 24px 24px", flexShrink: 0 }}>
          <div style={{ background: "rgba(255,255,255,0.04)", border: `1px solid ${COLORS.border}`, borderRadius: 16, overflow: "hidden", transition: "border-color 0.2s" }}
            onFocusCapture={(e) => (e.currentTarget.style.borderColor = COLORS.indigo)}
            onBlurCapture={(e) => (e.currentTarget.style.borderColor = COLORS.border)}
          >
            <textarea
              ref={textareaRef}
              value={input}
              onChange={handleTextareaInput}
              onKeyDown={handleKeyDown}
              placeholder="Ask anything — your conversation is completely private"
              rows={1}
              style={{
                width: "100%", background: "none", border: "none", padding: "14px 16px",
                color: COLORS.textPrimary, fontSize: 15, resize: "none", outline: "none",
                fontFamily: "var(--font-dm-sans), DM Sans, sans-serif", lineHeight: 1.5, height: 44, minHeight: 44,
                boxSizing: "border-box",
              }}
            />
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px 12px" }}>
              <div style={{ display: "flex", gap: 6 }}>
                <input ref={fileInputRef} type="file" style={{ display: "none" }} onChange={handleFileUpload} />
                <button onClick={() => fileInputRef.current?.click()} style={{ background: "none", border: "none", cursor: "pointer", color: COLORS.textMuted, padding: 6, borderRadius: 6, display: "flex" }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = COLORS.textSecondary)}
                  onMouseLeave={(e) => (e.currentTarget.style.color = COLORS.textMuted)}
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="2" y="2" width="12" height="12" rx="3" stroke="currentColor" strokeWidth="1.3" /><path d="M5 9L7 7L9 9M7 7V13" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" opacity="0.7" /></svg>
                </button>
              </div>
              <button
                onClick={() => { if (isStreaming) abortRef.current?.abort(); else sendMessage(); }}
                style={{
                  width: 34, height: 34, borderRadius: 10,
                  background: isStreaming ? "rgba(248,113,113,0.15)" : input.trim() ? COLORS.indigo : "rgba(255,255,255,0.06)",
                  border: isStreaming ? "1px solid rgba(248,113,113,0.3)" : "none",
                  cursor: isStreaming || input.trim() ? "pointer" : "default",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  transition: "all 0.2s",
                  boxShadow: !isStreaming && input.trim() ? "0 4px 12px rgba(99,102,241,0.3)" : "none",
                }}
              >
                {isStreaming ? (
                  <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><rect x="2.5" y="2.5" width="8" height="8" rx="1.5" fill="#f87171" /></svg>
                ) : (
                  <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
                    <path d="M13 7.5L2 2L4.5 7.5L2 13L13 7.5Z" fill={input.trim() ? "white" : COLORS.textMuted} />
                  </svg>
                )}
              </button>
            </div>
          </div>
          <div style={{ textAlign: "center", marginTop: 8, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
            <svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M5.5 1.5L2.5 3.5V6C2.5 8 3.7 9.5 5.5 10C7.3 9.5 8.5 8 8.5 6V3.5L5.5 1.5Z" stroke={COLORS.textMuted} strokeWidth="1" /></svg>
            <span style={{ fontSize: 11, color: COLORS.textMuted }}>Responses stay on your server. Nothing leaves your cloud.</span>
          </div>
        </div>
      </div>
    </div>
  );
}
