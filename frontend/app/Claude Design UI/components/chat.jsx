
// Screen 7: Chat UI

function ChatScreen({ onBack }) {
  const [input, setInput] = React.useState('');
  const [messages, setMessages] = React.useState([]);
  const [isTyping, setIsTyping] = React.useState(false);
  const [sidebarOpen, setSidebarOpen] = React.useState(true);
  const [activeConv, setActiveConv] = React.useState(0);
  const messagesEndRef = React.useRef(null);
  const textareaRef = React.useRef(null);

  const conversations = [
    { id: 0, title: 'Getting started', time: 'Just now', active: true },
    { id: 1, title: 'Trip to Tokyo ideas', time: '2 hours ago' },
    { id: 2, title: 'Cover letter draft', time: 'Yesterday' },
    { id: 3, title: 'Recipe suggestions', time: 'Yesterday' },
    { id: 4, title: 'Investment questions', time: '3 days ago' },
    { id: 5, title: 'Home renovation plan', time: '1 week ago' },
  ];

  const suggestions = [
    'Help me write an email to my landlord',
    'Summarise this article for me',
    'Plan a week of healthy meals',
    'Explain quantum computing simply',
  ];

  const aiResponses = [
    "Of course! I'm here to help. Your conversations are completely private — no one else can see what we discuss, not even the team at PrivateAI. What would you like to talk about?",
    "That's a great question. Let me think through this carefully for you...\n\nGiven what you've shared, I'd suggest starting with the most straightforward approach first. Breaking it down into smaller steps makes it much more manageable.",
    "Happy to help with that! Here's what I'd recommend:\n\n1. Start by gathering all the relevant information\n2. Identify the key priorities\n3. Work through them one by one\n\nDoes that sound like a good approach?",
  ];

  const [aiResponseIdx, setAiResponseIdx] = React.useState(0);

  const sendMessage = (text) => {
    const msg = text || input.trim();
    if (!msg) return;
    setInput('');
    setMessages(prev => [...prev, { role: 'user', text: msg, id: Date.now() }]);
    setIsTyping(true);
    if (textareaRef.current) { textareaRef.current.style.height = '44px'; }
    const delay = 1200 + msg.length * 8;
    setTimeout(() => {
      setIsTyping(false);
      setMessages(prev => [...prev, { role: 'ai', text: aiResponses[aiResponseIdx % aiResponses.length], id: Date.now() + 1 }]);
      setAiResponseIdx(i => i + 1);
    }, Math.min(delay, 3000));
  };

  React.useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.parentElement.scrollTop = messagesEndRef.current.offsetTop;
    }
  }, [messages, isTyping]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  const handleInput = (e) => {
    setInput(e.target.value);
    e.target.style.height = '44px';
    e.target.style.height = Math.min(e.target.scrollHeight, 140) + 'px';
  };

  return (
    <div style={{ height: '100vh', background: COLORS.bg, display: 'flex', overflow: 'hidden' }}>
      {/* Sidebar */}
      <div style={{
        width: sidebarOpen ? 260 : 0, minWidth: 0, overflow: 'hidden',
        borderRight: `1px solid ${COLORS.border}`, display: 'flex', flexDirection: 'column',
        transition: 'width 0.3s ease', background: 'rgba(255,255,255,0.015)',
      }}>
        <div style={{ padding: '20px 16px 12px', borderBottom: `1px solid ${COLORS.border}` }}>
          <Logo size={22} textSize={16} />
        </div>
        {/* New chat */}
        <div style={{ padding: '12px 12px 4px' }}>
          <button style={{
            width: '100%', background: 'rgba(99,102,241,0.1)', border: `1px solid rgba(99,102,241,0.2)`,
            borderRadius: 10, padding: '9px 14px', color: COLORS.indigoLight, fontSize: 13, fontWeight: 600,
            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, fontFamily: 'DM Sans, sans-serif',
          }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(99,102,241,0.18)'}
            onMouseLeave={e => e.currentTarget.style.background = 'rgba(99,102,241,0.1)'}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 2V12M2 7H12" stroke={COLORS.indigoLight} strokeWidth="2" strokeLinecap="round"/></svg>
            New conversation
          </button>
        </div>
        {/* Search */}
        <div style={{ padding: '8px 12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(255,255,255,0.04)', border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: '7px 10px' }}>
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><circle cx="5.5" cy="5.5" r="4" stroke={COLORS.textMuted} strokeWidth="1.3"/><line x1="8.5" y1="8.5" x2="12" y2="12" stroke={COLORS.textMuted} strokeWidth="1.3" strokeLinecap="round"/></svg>
            <span style={{ color: COLORS.textMuted, fontSize: 12 }}>Search conversations</span>
          </div>
        </div>
        {/* Conversations */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '4px 8px' }}>
          <div style={{ fontSize: 10, color: COLORS.textMuted, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', padding: '8px 8px 4px' }}>Recent</div>
          {conversations.map(conv => (
            <div key={conv.id} onClick={() => setActiveConv(conv.id)}
              style={{
                padding: '10px 10px', borderRadius: 8, cursor: 'pointer', marginBottom: 2,
                background: activeConv === conv.id ? 'rgba(99,102,241,0.1)' : 'transparent',
                border: `1px solid ${activeConv === conv.id ? 'rgba(99,102,241,0.2)' : 'transparent'}`,
                transition: 'all 0.15s',
              }}
              onMouseEnter={e => { if (activeConv !== conv.id) e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}
              onMouseLeave={e => { if (activeConv !== conv.id) e.currentTarget.style.background = 'transparent'; }}
            >
              <div style={{ fontSize: 13, color: activeConv === conv.id ? COLORS.textPrimary : COLORS.textSecondary, fontWeight: 500, marginBottom: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{conv.title}</div>
              <div style={{ fontSize: 11, color: COLORS.textMuted }}>{conv.time}</div>
            </div>
          ))}
        </div>
        {/* Settings */}
        <div style={{ padding: '12px', borderTop: `1px solid ${COLORS.border}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 8, cursor: 'pointer', color: COLORS.textSecondary, fontSize: 13 }}>
            <svg width="15" height="15" viewBox="0 0 15 15" fill="none"><circle cx="7.5" cy="7.5" r="2.5" stroke={COLORS.textMuted} strokeWidth="1.3"/><path d="M7.5 1.5V3M7.5 12V13.5M13.5 7.5H12M3 7.5H1.5M11.7 3.3L10.6 4.4M4.4 10.6L3.3 11.7M11.7 11.7L10.6 10.6M4.4 4.4L3.3 3.3" stroke={COLORS.textMuted} strokeWidth="1.3" strokeLinecap="round"/></svg>
            Settings
          </div>
        </div>
      </div>

      {/* Main chat area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Topbar */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 24px', borderBottom: `1px solid ${COLORS.border}`, flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button onClick={() => setSidebarOpen(v => !v)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: COLORS.textMuted }}>
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><line x1="2" y1="5" x2="16" y2="5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><line x1="2" y1="9" x2="16" y2="9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><line x1="2" y1="13" x2="16" y2="13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
            </button>
            {/* Model switcher */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', background: 'rgba(255,255,255,0.04)', border: `1px solid ${COLORS.border}`, borderRadius: 8, cursor: 'pointer' }}>
              <div style={{ width: 7, height: 7, borderRadius: '50%', background: COLORS.teal, boxShadow: `0 0 6px ${COLORS.teal}`, animation: 'pulse-core 2s infinite' }}/>
              <span style={{ fontSize: 13, color: COLORS.textPrimary, fontWeight: 500 }}>TinyLlama 1.1B</span>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M3 5L6 8L9 5" stroke={COLORS.textMuted} strokeWidth="1.3" strokeLinecap="round"/></svg>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {/* Token usage */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: COLORS.textMuted }}>
              <div style={{ width: 48, height: 3, background: 'rgba(255,255,255,0.08)', borderRadius: 2 }}>
                <div style={{ width: `${(messages.length / 20) * 100}%`, height: '100%', background: COLORS.teal, borderRadius: 2 }}/>
              </div>
              <span>{messages.filter(m => m.role === 'user').length * 80}/4096 tokens</span>
            </div>
            {/* Privacy badge */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px', background: 'rgba(45,212,191,0.08)', border: '1px solid rgba(45,212,191,0.2)', borderRadius: 100 }}>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M6 1L2 3.5V6.5C2 9 3.7 11 6 11.5C8.3 11 10 9 10 6.5V3.5L6 1Z" stroke={COLORS.teal} strokeWidth="1.2"/></svg>
              <span style={{ fontSize: 11, color: COLORS.teal, fontWeight: 600 }}>Private</span>
            </div>
          </div>
        </div>

        {/* Messages */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px', display: 'flex', flexDirection: 'column', gap: 20 }}>
          {messages.length === 0 ? (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '40px 0' }}>
              <div style={{ marginBottom: 24, animation: 'pulse-core 3s infinite' }}>
                <ShieldIllustration size={80} />
              </div>
              <h2 style={{ fontFamily: 'Syne, sans-serif', fontSize: 28, fontWeight: 700, color: COLORS.textPrimary, margin: '0 0 10px', letterSpacing: '-0.02em' }}>
                What's on your mind?
              </h2>
              <p style={{ color: COLORS.textSecondary, fontSize: 15, margin: '0 0 36px', maxWidth: 380, lineHeight: 1.6 }}>
                Your conversation is completely private. Ask anything.
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'center', maxWidth: 520 }}>
                {suggestions.map((s, i) => (
                  <button key={i} onClick={() => sendMessage(s)}
                    style={{
                      background: COLORS.bgCard, border: `1px solid ${COLORS.border}`, borderRadius: 100,
                      padding: '9px 18px', color: COLORS.textSecondary, fontSize: 13, cursor: 'pointer',
                      fontFamily: 'DM Sans, sans-serif', transition: 'all 0.2s',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = COLORS.indigo; e.currentTarget.style.color = COLORS.textPrimary; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = COLORS.border; e.currentTarget.style.color = COLORS.textSecondary; }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <>
              {messages.map(msg => (
                <div key={msg.id} style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start', gap: 12, alignItems: 'flex-start' }}>
                  {msg.role === 'ai' && (
                    <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(99,102,241,0.2)', border: `1px solid rgba(99,102,241,0.3)`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 }}>
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 2L4 5.5V9C4 12 5.9 14 8 14.5C10.1 14 12 12 12 9V5.5L8 2Z" fill={COLORS.indigo} opacity="0.7"/><circle cx="8" cy="9" r="2" fill="white" opacity="0.8"/></svg>
                    </div>
                  )}
                  <div style={{
                    maxWidth: '70%',
                    background: msg.role === 'user' ? COLORS.indigo : 'rgba(255,255,255,0.05)',
                    border: `1px solid ${msg.role === 'user' ? 'transparent' : COLORS.border}`,
                    borderRadius: msg.role === 'user' ? '18px 18px 4px 18px' : '4px 18px 18px 18px',
                    padding: '12px 16px',
                    color: COLORS.textPrimary,
                    fontSize: 14,
                    lineHeight: 1.6,
                    whiteSpace: 'pre-wrap',
                  }}>
                    {msg.text}
                  </div>
                </div>
              ))}
              {isTyping && (
                <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                  <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(99,102,241,0.2)', border: `1px solid rgba(99,102,241,0.3)`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 2L4 5.5V9C4 12 5.9 14 8 14.5C10.1 14 12 12 12 9V5.5L8 2Z" fill={COLORS.indigo} opacity="0.7"/><circle cx="8" cy="9" r="2" fill="white" opacity="0.8"/></svg>
                  </div>
                  <div style={{ background: 'rgba(255,255,255,0.05)', border: `1px solid ${COLORS.border}`, borderRadius: '4px 18px 18px 18px', padding: '14px 18px', display: 'flex', gap: 5, alignItems: 'center' }}>
                    {[0, 1, 2].map(i => (
                      <div key={i} style={{ width: 7, height: 7, borderRadius: '50%', background: COLORS.indigoLight, animation: `pulse-core 1.2s ease-in-out infinite ${i * 0.2}s` }}/>
                    ))}
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} style={{ height: 1 }}/>
            </>
          )}
        </div>

        {/* Input */}
        <div style={{ padding: '16px 24px 24px', flexShrink: 0 }}>
          <div style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${COLORS.border}`, borderRadius: 16, overflow: 'hidden', transition: 'border-color 0.2s' }}
            onFocusCapture={e => e.currentTarget.style.borderColor = COLORS.indigo}
            onBlurCapture={e => e.currentTarget.style.borderColor = COLORS.border}
          >
            <textarea
              ref={textareaRef}
              value={input}
              onChange={handleInput}
              onKeyDown={handleKeyDown}
              placeholder="Ask anything — your conversation is completely private"
              rows={1}
              style={{
                width: '100%', background: 'none', border: 'none', padding: '14px 16px',
                color: COLORS.textPrimary, fontSize: 15, resize: 'none', outline: 'none',
                fontFamily: 'DM Sans, sans-serif', lineHeight: 1.5, height: 44, minHeight: 44,
                boxSizing: 'border-box',
              }}
            />
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px 12px' }}>
              <div style={{ display: 'flex', gap: 6 }}>
                <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: COLORS.textMuted, padding: 6, borderRadius: 6, display: 'flex' }}
                  onMouseEnter={e => e.currentTarget.style.color = COLORS.textSecondary}
                  onMouseLeave={e => e.currentTarget.style.color = COLORS.textMuted}
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="2" y="2" width="12" height="12" rx="3" stroke="currentColor" strokeWidth="1.3"/><path d="M5 9L7 11L11 7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" opacity="0.5"/></svg>
                </button>
              </div>
              <button
                onClick={() => sendMessage()}
                disabled={!input.trim()}
                style={{
                  width: 34, height: 34, borderRadius: 10, background: input.trim() ? COLORS.indigo : 'rgba(255,255,255,0.06)',
                  border: 'none', cursor: input.trim() ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'all 0.2s', boxShadow: input.trim() ? '0 4px 12px rgba(99,102,241,0.3)' : 'none',
                }}
              >
                <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
                  <path d="M13 7.5L2 2L4.5 7.5L2 13L13 7.5Z" fill={input.trim() ? 'white' : COLORS.textMuted}/>
                </svg>
              </button>
            </div>
          </div>
          <div style={{ textAlign: 'center', marginTop: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            <svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M5.5 1.5L2.5 3.5V6C2.5 8 3.7 9.5 5.5 10C7.3 9.5 8.5 8 8.5 6V3.5L5.5 1.5Z" stroke={COLORS.textMuted} strokeWidth="1"/></svg>
            <span style={{ fontSize: 11, color: COLORS.textMuted }}>Responses stay on your server. Nothing leaves your cloud.</span>
          </div>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { ChatScreen });
