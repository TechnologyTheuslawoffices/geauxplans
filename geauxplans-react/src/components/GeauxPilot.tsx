import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Components } from 'react-markdown';
import { sendAssistantMessage, AssistantMessage } from '../services/aiAssistant';
import { useAuth } from '../context/AuthContext';
import '../styles/geauxpilot.css';

/**
 * GeauxPilot — the GeauxPlans AI help assistant.
 *
 * A floating launcher (bottom-right) that opens a right-edge slide-out chat
 * panel, mirroring GeauxCounsel's GeauxPilot. Claude-backed via
 * /api/ai-assistant/chat (SSE streaming). It answers estate/business-planning
 * and product questions, helps pick a plan, and guides navigation; a signed-in
 * customer can also ask about their own plans.
 *
 * Assistant messages render through react-markdown + remark-gfm inside a
 * `.gpilot-prose` container — the same rendering contract as GeauxCounsel's
 * GeauxPilot, so headings, ordered/unordered lists, tables, and emphasis all
 * display properly. Internal links (href starting "/") navigate in-app and
 * close the panel; user messages render as plain pre-wrapped text.
 */

const STARTER_PROMPTS = [
  'Which estate plan is right for me?',
  'What is the difference between a will and a trust?',
  'How do I start an LLC in Louisiana?',
  'How does the whole process work?',
];

const greeting = (firstName?: string): string =>
  `Hi${firstName ? ` ${firstName}` : ''}! I'm **GeauxPilot**, your GeauxPlans ` +
  `assistant. I can help you choose the right estate or business plan, explain ` +
  `how things work, and point you to the right place. What can I help you with?`;

/**
 * The four destinations in the mobile bottom dashboard. Two sit on each side of
 * the raised GeauxPilot launcher. `match` decides the active highlight.
 */
const MOBILE_NAV = [
  { to: '/', icon: 'fa-house', label: 'Home', match: (p: string) => p === '/' },
  { to: '/estate-planning', icon: 'fa-shield-halved', label: 'Plans', match: (p: string) => p.startsWith('/estate-planning') || p.includes('-plan') },
  { to: '/learn', icon: 'fa-book-open', label: 'Learn', match: (p: string) => p.startsWith('/learn') || p.startsWith('/category') },
  { to: '/my-account', icon: 'fa-user', label: 'Account', match: (p: string) => p.startsWith('/my-account') },
];

const MOBILE_QUERY = '(max-width: 991.98px)';

const GeauxPilot: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, isAuthenticated } = useAuth();
  const firstName = isAuthenticated ? user?.firstName : undefined;

  const [isMobile, setIsMobile] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(MOBILE_QUERY).matches
  );
  const [isOpen, setIsOpen] = useState(false);
  const [hasOpened, setHasOpened] = useState(false);
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Seed the greeting the first time the panel opens (greeting adapts to login).
  useEffect(() => {
    if (isOpen && !hasOpened) {
      setMessages([{ role: 'assistant', content: greeting(firstName) }]);
      setHasOpened(true);
    }
  }, [isOpen, hasOpened, firstName]);

  // Keep the transcript scrolled to the newest content as it streams.
  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages, isStreaming]);

  // Focus the input when the panel opens.
  useEffect(() => {
    if (isOpen) {
      const t = setTimeout(() => inputRef.current?.focus(), 250);
      return () => clearTimeout(t);
    }
  }, [isOpen]);

  // Lock body scroll on mobile while the panel is open.
  useEffect(() => {
    if (isOpen) {
      document.body.classList.add('gpilot-open');
      return () => document.body.classList.remove('gpilot-open');
    }
  }, [isOpen]);

  // Track viewport size so the launcher becomes a bottom dashboard on phones.
  useEffect(() => {
    const mq = window.matchMedia(MOBILE_QUERY);
    const onChange = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    setIsMobile(mq.matches);
    // addEventListener is the modern API; older Safari needs addListener.
    if (mq.addEventListener) mq.addEventListener('change', onChange);
    else mq.addListener(onChange);
    return () => {
      if (mq.removeEventListener) mq.removeEventListener('change', onChange);
      else mq.removeListener(onChange);
    };
  }, []);

  // Reserve space at the bottom of the page for the fixed dashboard bar so it
  // never hides the last bit of content. Scoped by a body class (GeauxPilot is
  // not mounted in design mode, so this won't pad the /poa-form route).
  useEffect(() => {
    if (isMobile) {
      document.body.classList.add('gpilot-mobilebar-on');
      return () => document.body.classList.remove('gpilot-mobilebar-on');
    }
  }, [isMobile]);

  const handleNavigate = useCallback((path: string) => {
    setIsOpen(false);
    navigate(path);
  }, [navigate]);

  // react-markdown component overrides. Same contract as GeauxCounsel's
  // markdownComponents: internal links (href starting "/") navigate in-app and
  // close the panel; everything else opens in a new tab.
  const markdownComponents: Components = useMemo(() => ({
    a: ({ href, children }) => {
      const url = typeof href === 'string' ? href : '';
      if (url.startsWith('/')) {
        return (
          <a
            href={url}
            className="gpilot-link"
            onClick={(e) => { e.preventDefault(); handleNavigate(url); }}
          >
            {children}
          </a>
        );
      }
      return (
        <a href={url} className="gpilot-link" target="_blank" rel="noopener noreferrer">
          {children}
        </a>
      );
    },
  }), [handleNavigate]);

  const runTurn = useCallback(async (userText: string) => {
    const trimmed = userText.trim();
    if (!trimmed || isStreaming) return;

    setErrorMsg('');
    const history: AssistantMessage[] = [...messages, { role: 'user', content: trimmed }];
    // Add the user turn plus an empty assistant turn we'll stream into.
    setMessages([...history, { role: 'assistant', content: '' }]);
    setInput('');
    setIsStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      await sendAssistantMessage({
        // Don't send the local greeting; the backend owns the persona. Send the
        // real conversational turns only.
        messages: history.filter((m, idx) => !(idx === 0 && m.role === 'assistant')),
        signal: controller.signal,
        onToken: (chunk) => {
          setMessages((prev) => {
            const next = [...prev];
            const last = next[next.length - 1];
            if (last && last.role === 'assistant') {
              next[next.length - 1] = { ...last, content: last.content + chunk };
            }
            return next;
          });
        },
      });
    } catch (err: any) {
      if (err?.name === 'AbortError') return;
      setErrorMsg(err?.message || 'Something went wrong. Please try again.');
      // Drop the empty assistant bubble if nothing streamed in.
      setMessages((prev) => {
        const next = [...prev];
        const last = next[next.length - 1];
        if (last && last.role === 'assistant' && !last.content) next.pop();
        return next;
      });
    } finally {
      setIsStreaming(false);
      abortRef.current = null;
    }
  }, [messages, isStreaming]);

  const handleSend = () => runTurn(input);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const closePanel = () => {
    abortRef.current?.abort();
    setIsOpen(false);
  };

  const showStarters = messages.length <= 1 && !isStreaming;

  const currentPath = location.pathname;

  return (
    <>
      {/* Desktop: floating launcher, bottom-right. */}
      {!isMobile && !isOpen && (
        <button
          type="button"
          className="gpilot-fab"
          onClick={() => setIsOpen(true)}
          aria-label="Open GeauxPilot assistant"
        >
          <img src="/img/geauxpilot-favicon.png" alt="" className="gpilot-fab-icon" />
        </button>
      )}

      {/* Mobile: a bottom dashboard — 4 nav buttons with the GeauxPilot
          launcher raised above the center. Hidden while the panel is open. */}
      {isMobile && !isOpen && (
        <nav className="gpilot-mobilebar" aria-label="Quick navigation">
          {MOBILE_NAV.slice(0, 2).map((item) => (
            <button
              key={item.to}
              type="button"
              className={`gpilot-tab ${item.match(currentPath) ? 'active' : ''}`}
              onClick={() => navigate(item.to)}
            >
              <i className={`fas ${item.icon}`} aria-hidden="true" />
              <span>{item.label}</span>
            </button>
          ))}

          {/* Center raised launcher */}
          <button
            type="button"
            className="gpilot-tab-fab"
            onClick={() => setIsOpen(true)}
            aria-label="Open GeauxPilot assistant"
          >
            <img src="/img/geauxpilot-favicon.png" alt="" />
            <span>GeauxPilot</span>
          </button>

          {MOBILE_NAV.slice(2, 4).map((item) => (
            <button
              key={item.to}
              type="button"
              className={`gpilot-tab ${item.match(currentPath) ? 'active' : ''}`}
              onClick={() => navigate(item.to)}
            >
              <i className={`fas ${item.icon}`} aria-hidden="true" />
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
      )}

      {/* Mobile backdrop */}
      {isOpen && <div className="gpilot-backdrop" onClick={closePanel} />}

      {/* Slide-out panel */}
      <aside className={`gpilot-panel ${isOpen ? 'open' : ''}`} role="dialog" aria-label="GeauxPilot assistant">
        <header className="gpilot-header">
          <div className="gpilot-header-brand">
            <img src="/img/geauxpilot-favicon.png" alt="" className="gpilot-header-favicon" />
            <img src="/img/geauxpilot-logo.png" alt="GeauxPilot" className="gpilot-header-wordmark" />
          </div>
          <button type="button" className="gpilot-close" onClick={closePanel} aria-label="Close assistant">
            <i className="fas fa-times" aria-hidden="true" />
          </button>
        </header>

        <div className="gpilot-list" ref={listRef}>
          {messages.map((m, idx) => (
            <div key={idx} className={`gpilot-row ${m.role}`}>
              {m.role === 'assistant' && (
                <span className="gpilot-avatar">
                  <img src="/img/geauxpilot-favicon.png" alt="" />
                </span>
              )}
              <div className={`gpilot-bubble ${m.role}`}>
                {m.role === 'user' ? (
                  <div className="gpilot-user-text">{m.content}</div>
                ) : m.content ? (
                  <div className="gpilot-prose">
                    <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                      {m.content}
                    </ReactMarkdown>
                  </div>
                ) : (
                  <span className="gpilot-typing" aria-label="GeauxPilot is typing">
                    <span /><span /><span />
                  </span>
                )}
              </div>
            </div>
          ))}

          {showStarters && (
            <div className="gpilot-starters">
              {STARTER_PROMPTS.map((p) => (
                <button key={p} type="button" className="gpilot-starter" onClick={() => runTurn(p)}>
                  {p}
                </button>
              ))}
            </div>
          )}

          {errorMsg && <div className="gpilot-error">{errorMsg}</div>}
        </div>

        <div className="gpilot-input-area">
          <textarea
            ref={inputRef}
            className="gpilot-textarea"
            rows={1}
            placeholder="Ask GeauxPilot anything…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isStreaming}
          />
          <button
            type="button"
            className="gpilot-send"
            onClick={handleSend}
            disabled={isStreaming || !input.trim()}
            aria-label="Send message"
          >
            <i className="fas fa-paper-plane" aria-hidden="true" />
          </button>
        </div>
        <div className="gpilot-disclaimer">
          GeauxPilot gives general information, not legal advice. For help, call +1 (855) 213-6300.
        </div>
      </aside>
    </>
  );
};

export default GeauxPilot;
