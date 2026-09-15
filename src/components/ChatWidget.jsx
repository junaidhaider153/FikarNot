import { useEffect, useRef, useState } from "react";
import { sendChatMessage } from "../api/chatApi";
import { Ic } from "./icons";

const STORAGE_KEY = "fikarnot-chat-history";
const WELCOME = { role: "assistant", text: "Hi! I'm the FikarNot assistant — ask me about products, categories, shipping, or returns." };

function loadHistory() {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (Array.isArray(parsed) && parsed.length) return parsed;
  } catch {
    // Corrupt/unavailable sessionStorage — fall back to a fresh conversation.
  }
  return [WELCOME];
}

export function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState(loadHistory);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const listRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    try {
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-30)));
    } catch {
      // Ignore storage failures — the conversation still works for this page view.
    }
  }, [messages]);

  useEffect(() => {
    if (open) listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, open, sending]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const send = async () => {
    const text = input.trim();
    if (!text || sending) return;
    setError("");
    setInput("");
    const nextMessages = [...messages, { role: "user", text }];
    setMessages(nextMessages);
    setSending(true);
    try {
      const history = nextMessages.slice(-11, -1).map((m) => ({ role: m.role, text: m.text }));
      const { reply } = await sendChatMessage(text, history);
      setMessages((current) => [...current, { role: "assistant", text: reply }]);
    } catch (err) {
      setError(err.message || "Something went wrong. Please try again.");
    } finally {
      setSending(false);
    }
  };

  const onKeyDown = (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      send();
    }
  };

  return (
    <div className="chat-widget">
      {open && (
        <div className="chat-panel" role="dialog" aria-label="FikarNot assistant chat">
          <div className="chat-panel-head">
            <div className="chat-panel-title">
              <span className="chat-panel-dot" aria-hidden="true" />
              FikarNot Assistant
            </div>
            <button type="button" className="chat-panel-close" onClick={() => setOpen(false)} aria-label="Close chat">
              <Ic n="x" s={16} />
            </button>
          </div>

          <div className="chat-messages" ref={listRef} aria-live="polite">
            {messages.map((m, i) => (
              <div key={i} className={`chat-bubble ${m.role}`}>
                {m.text}
              </div>
            ))}
            {sending && (
              <div className="chat-bubble assistant chat-typing" aria-label="Assistant is typing">
                <span />
                <span />
                <span />
              </div>
            )}
            {error && <div className="chat-bubble error">{error}</div>}
          </div>

          <div className="chat-input-row">
            <textarea
              ref={inputRef}
              className="chat-input"
              rows={1}
              placeholder="Ask about products, shipping, returns…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              maxLength={1200}
            />
            <button type="button" className="chat-send" onClick={send} disabled={!input.trim() || sending} aria-label="Send message">
              <Ic n="arrow" s={16} />
            </button>
          </div>
        </div>
      )}

      <button
        type="button"
        className={`chat-bubble-toggle${open ? " open" : ""}`}
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Close chat" : "Chat with FikarNot assistant"}
      >
        <Ic n={open ? "x" : "chat"} s={22} />
      </button>
    </div>
  );
}
