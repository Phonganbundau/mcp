import React, { useState, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { UIResourceRenderer, type UIActionResult } from '@mcp-ui/client';
import type { EmbeddedResource } from '@modelcontextprotocol/sdk/types.js';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  uiResource?: EmbeddedResource;
  timestamp: Date;
}

interface ChatUIProps {
  onSendMessage: (message: string) => Promise<void>;
  messages: Message[];
  isProcessing: boolean;
  onUIAction: (action: UIActionResult) => Promise<void>;
}

export function ChatUI({ onSendMessage, messages, isProcessing, onUIAction }: ChatUIProps) {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isProcessing) return;
    
    const userMessage = input.trim();
    setInput('');
    await onSendMessage(userMessage);
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1 style={styles.title}>MCP Todo Chat (Gemini + MCP-UI)</h1>
        <p style={styles.subtitle}>Talk naturally - Gemini will call tools and render interactive UI</p>
      </div>
      
      <div style={styles.messages}>
        {messages.map((msg) => (
          <div
            key={msg.id}
            style={{
              ...styles.message,
              ...(msg.role === 'user' ? styles.userMessage : styles.assistantMessage),
            }}
          >
            <div style={styles.messageHeader}>
              <strong>{msg.role === 'user' ? 'You' : 'Assistant'}</strong>
              <span style={styles.timestamp}>
                {msg.timestamp.toLocaleTimeString()}
              </span>
            </div>
            <div style={styles.messageContent}>
              {msg.text && <p style={styles.messageText}>{msg.text}</p>}
              {msg.uiResource && (
                <div style={styles.uiContainer}>
                  <UIResourceRenderer
                    resource={msg.uiResource}
                    onUIAction={onUIAction}
                    supportedContentTypes={['rawHtml', 'externalUrl']}
                    htmlProps={{
                      style: { border: 'none', width: '100%', minHeight: 400 },
                      autoResizeIframe: { height: true },
                      sandboxPermissions: 'allow-scripts allow-forms allow-same-origin',
                    }}
                  />
                </div>
              )}
            </div>
          </div>
        ))}
        {isProcessing && (
          <div style={{ ...styles.message, ...styles.assistantMessage }}>
            <div style={styles.messageContent}>
              <p style={styles.messageText}>Thinking...</p>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <form onSubmit={handleSubmit} style={styles.inputForm}>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about your todos..."
          style={styles.input}
          disabled={isProcessing}
        />
        <button
          type="submit"
          disabled={isProcessing || !input.trim()}
          style={styles.sendButton}
        >
          Send
        </button>
      </form>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100vh',
    maxWidth: '900px',
    margin: '0 auto',
    background: '#f8fafc',
  },
  header: {
    padding: '1.5rem',
    background: 'white',
    borderBottom: '1px solid #e5e7eb',
  },
  title: {
    margin: 0,
    fontSize: '1.5rem',
    fontWeight: 600,
    color: '#111827',
  },
  subtitle: {
    margin: '0.5rem 0 0',
    fontSize: '0.875rem',
    color: '#6b7280',
  },
  messages: {
    flex: 1,
    overflowY: 'auto',
    padding: '1.5rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
  },
  message: {
    padding: '1rem',
    borderRadius: '12px',
    maxWidth: '85%',
  },
  userMessage: {
    alignSelf: 'flex-end',
    background: '#3b82f6',
    color: 'white',
  },
  assistantMessage: {
    alignSelf: 'flex-start',
    background: 'white',
    border: '1px solid #e5e7eb',
  },
  messageHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '0.5rem',
    fontSize: '0.875rem',
    opacity: 0.8,
  },
  timestamp: {
    fontSize: '0.75rem',
    marginLeft: '1rem',
  },
  messageContent: {
    wordBreak: 'break-word',
  },
  messageText: {
    margin: 0,
    lineHeight: 1.6,
    whiteSpace: 'pre-wrap',
  },
  uiContainer: {
    marginTop: '1rem',
    border: '1px solid #e5e7eb',
    borderRadius: '8px',
    overflow: 'hidden',
  },
  inputForm: {
    display: 'flex',
    gap: '0.5rem',
    padding: '1rem 1.5rem',
    background: 'white',
    borderTop: '1px solid #e5e7eb',
  },
  input: {
    flex: 1,
    padding: '0.75rem 1rem',
    border: '1px solid #d1d5db',
    borderRadius: '8px',
    fontSize: '1rem',
  },
  sendButton: {
    padding: '0.75rem 1.5rem',
    background: '#3b82f6',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    fontSize: '1rem',
    fontWeight: 600,
    cursor: 'pointer',
  },
};

export function renderChatUI(
  container: HTMLElement,
  props: ChatUIProps
): () => void {
  const root = createRoot(container);
  root.render(React.createElement(ChatUI, props));
  return () => root.unmount();
}

