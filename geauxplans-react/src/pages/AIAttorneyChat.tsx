import React, { useEffect, useRef, useState } from 'react';
import { sendAttorneyMessage, AttorneyMessage } from '../services/aiAttorney';

interface AIAttorneyChatProps {
  formType: string;
  formData: any;
  onApplyPatch: (patch: any) => void;
  onSwitchToForm: () => void;
}

const GREETING =
  "Hi, I'm your GeauxPlans estate-planning attorney. I'll walk you through your " +
  "plan one step at a time and fill out your form as we talk — no legal jargon, " +
  "and we'll go at your pace. Whenever you're ready, let's start with the basics: " +
  "what's your full legal name?";

/**
 * Conversational intake panel. Shares the same formData as the manual form in
 * POAForm.tsx: each attorney turn may return a partial-FormData `patch`, which
 * we hand to onApplyPatch (a deepMerge into shared state). Switching back to the
 * guided form shows every field the attorney populated.
 */
const AIAttorneyChat: React.FC<AIAttorneyChatProps> = ({
  formType,
  formData,
  onApplyPatch,
  onSwitchToForm,
}) => {
  const [messages, setMessages] = useState<AttorneyMessage[]>([
    { role: 'assistant', content: GREETING },
  ]);
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [patchApplied, setPatchApplied] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  // Keep the transcript scrolled to the newest message.
  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages, isSending]);

  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed || isSending) return;

    setErrorMsg('');
    setPatchApplied(false);

    const userMsg: AttorneyMessage = { role: 'user', content: trimmed };
    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setInput('');
    setIsSending(true);

    try {
      const res = await sendAttorneyMessage({
        formType,
        formData,
        // The greeting is a static local intro; the backend rebuilds the persona,
        // so sending the running transcript (including it) is fine.
        messages: nextMessages,
      });

      if (res.success && res.data) {
        const { reply, patch } = res.data;
        if (patch && Object.keys(patch).length > 0) {
          onApplyPatch(patch);
          setPatchApplied(true);
        }
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: reply || '…' },
        ]);
      } else {
        setErrorMsg(res.error || 'The attorney could not respond. Please try again.');
      }
    } catch (err) {
      setErrorMsg('Something went wrong reaching the attorney. Please try again.');
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="ai-attorney-chat d-flex flex-column" style={{ minHeight: '520px' }}>
      <div className="d-flex justify-content-between align-items-center mb-3">
        <div>
          <h5 className="mb-0">Talk to an Attorney (AI)</h5>
          <small className="text-muted">
            Answer naturally — your form fills in as you go.
          </small>
        </div>
        <button
          type="button"
          className="btn btn-sm btn-outline-secondary"
          onClick={onSwitchToForm}
        >
          <i className="fas fa-list me-1"></i> Switch to form
        </button>
      </div>

      {patchApplied && (
        <div className="alert alert-success py-1 px-2 mb-2 small" role="status">
          <i className="fas fa-check me-1"></i> Fields updated
        </div>
      )}

      <div
        ref={listRef}
        className="flex-grow-1 border rounded p-3 mb-3"
        style={{ overflowY: 'auto', maxHeight: '420px', background: '#f8f9fa' }}
      >
        {messages.map((m, idx) => (
          <div
            key={idx}
            className={`d-flex mb-2 ${m.role === 'user' ? 'justify-content-end' : 'justify-content-start'}`}
          >
            <div
              className={`p-2 px-3 rounded ${
                m.role === 'user' ? 'bg-primary text-white' : 'bg-white border'
              }`}
              style={{ maxWidth: '80%', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
            >
              {m.content}
            </div>
          </div>
        ))}
        {isSending && (
          <div className="d-flex justify-content-start mb-2">
            <div className="p-2 px-3 rounded bg-white border text-muted">
              <span className="spinner-border spinner-border-sm me-2"></span>
              The attorney is thinking…
            </div>
          </div>
        )}
      </div>

      {errorMsg && (
        <div className="alert alert-danger py-1 px-2 mb-2 small">{errorMsg}</div>
      )}

      <div className="d-flex gap-2 align-items-end">
        <textarea
          className="form-control"
          rows={2}
          placeholder="Type your answer…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isSending}
        />
        <button
          type="button"
          className="btn btn-primary"
          onClick={handleSend}
          disabled={isSending || !input.trim()}
        >
          <i className="fas fa-paper-plane"></i>
        </button>
      </div>
    </div>
  );
};

export default AIAttorneyChat;
