import React, { useEffect, useRef, useState, useCallback, Fragment } from 'react';
import { useNavigate } from 'react-router-dom';
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
 * Dependency-free: local state (no store) and a tiny built-in Markdown renderer
 * so bold text, links, and bullet lists display without adding react-markdown.
 * Internal links (starting with "/") navigate in-app and close the panel.
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

// ---------------------------------------------------------------------------
// Tiny Markdown renderer (bold, links, bullet lists, paragraphs).
// ---------------------------------------------------------------------------

/** Render inline Markdown: **bold** and [text](url). */
function renderInline(text: string, onNavigate: (path: string) => void, keyBase: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  // Tokenize on **bold** and [text](url), left to right.
  const regex = /(\*\*([^*]+)\*\*)|(\[([^\]]+)\]\(([^)]+)\))/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let i = 0;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(<Fragment key={`${keyBase}-t${i}`}>{text.slice(lastIndex, match.index)}</Fragment>);
      i++;
    }
    if (match[2] !== undefined) {
      // bold
      nodes.push(<strong key={`${keyBase}-b${i}`}>{match[2]}</strong>);
      i++;
    } else if (match[4] !== undefined && match[5] !== undefined) {
      const label = match[4];
      const href = match[5];
      const isInternal = href.startsWith('/');
      if (isInternal) {
        nodes.push(
          <a
            key={`${keyBase}-l${i}`}
            href={href}
            className="gpilot-link"
            onClick={(e) => {
              e.preventDefault();
              onNavigate(href);
            }}
          >
            {label}
          </a>
        );
      } else {
        nodes.push(
          <a key={`${keyBase}-l${i}`} href={href} className="gpilot-link" target="_blank" rel="noopener noreferrer">
            {label}
          </a>
        );
      }
      i++;
    }
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < text.length) {
    nodes.push(<Fragment key={`${keyBase}-t${i}`}>{text.slice(lastIndex)}</Fragment>);
  }
  return nodes;
}

/** Render a full Markdown message (blocks separated by blank lines). */
function renderMarkdown(content: string, onNavigate: (path: string) => void): React.ReactNode {
  const blocks = content.split(/\n{2,}/);
  return blocks.map((block, bi) => {
    const lines = block.split('\n');
    const isList = lines.length > 0 && lines.every((l) => /^\s*[-*]\s+/.test(l) || l.trim() === '');
    if (isList) {
      const items = lines.filter((l) => /^\s*[-*]\s+/.test(l));
      return (
        <ul key={`blk${bi}`} className="gpilot-ul">
          {items.map((item, li) => (
            <li key={`blk${bi}-li${li}`}>{renderInline(item.replace(/^\s*[-*]\s+/, ''), onNavigate, `blk${bi}-li${li}`)}</li>
          ))}
        </ul>
      );
    }
    // Paragraph: single newlines become <br/>.
    return (
      <p key={`blk${bi}`} className="gpilot-p">
        {lines.map((line, li) => (
          <Fragment key={`blk${bi}-ln${li}`}>
            {li > 0 && <br />}
            {renderInline(line, onNavigate, `blk${bi}-ln${li}`)}
          </Fragment>
        ))}
      </p>
    );
  });
}

// ---------------------------------------------------------------------------

const GeauxPilot: React.FC = () => {
  const navigate = useNavigate();
  const { user, isAuthenticated } = useAuth();
  const firstName = isAuthenticated ? user?.firstName : undefined;

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

  const handleNavigate = useCallback((path: string) => {
    setIsOpen(false);
    navigate(path);
  }, [navigate]);

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

  return (
    <>
      {/* Floating launcher */}
      {!isOpen && (
        <button
          type="button"
          className="gpilot-fab"
          onClick={() => setIsOpen(true)}
          aria-label="Open GeauxPilot assistant"
        >
          <img src="/img/geauxpilot-favicon.png" alt="" className="gpilot-fab-icon" />
        </button>
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
                {m.content
                  ? renderMarkdown(m.content, handleNavigate)
                  : (
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
