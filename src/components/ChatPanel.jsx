import { useState, useRef, useEffect, useCallback } from 'react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { useDesignStore } from '../hooks/useDesignStore';
import MessageBubble from './MessageBubble';
import StatusPanel from './StatusPanel';

export default function ChatPanel({ serverPort }) {
  const [input, setInput] = useState('');
  const textareaRef = useRef(null);
  const messagesEndRef = useRef(null);
  const addDesign = useDesignStore((s) => s.addDesign);
  const updateDesign = useDesignStore((s) => s.updateDesign);

  const { messages, sendMessage, status, error } = useChat({
    transport: new DefaultChatTransport({
      api: `http://127.0.0.1:${serverPort}/api/chat`,
    }),
  });

  const isLoading = status === 'streaming' || status === 'submitted';

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    const processedInThisCycle = new Set();

    for (const msg of messages) {
      const tools = [];
      if (msg.toolInvocations) tools.push(...msg.toolInvocations);
      if (msg.parts) {
        for (const p of msg.parts) {
          if (p.type === 'tool-invocation') tools.push(p.toolInvocation);
          else if (p.type?.startsWith('tool-')) tools.push(p);
        }
      }

      for (const t of tools) {
        if (!t) continue;

        const toolCallId = t.toolCallId;
        if (processedInThisCycle.has(toolCallId)) continue;

        const toolName = t.toolName || (t.type?.replace('tool-', ''));
        const state = t.state;
        const result = t.result || t.output;

        if (state !== 'result' && state !== 'output-available') continue;
        if (!result) continue;

        processedInThisCycle.add(toolCallId);

        switch (toolName) {
          case 'createGeometry':
            if (result.designId) {
              addDesign(result.designId, { ...result, source: 'createGeometry' });
            }
            break;
          case 'runAeroAnalysis':
            if (result.designId) {
              updateDesign(result.designId, { aero: result, source: 'runAeroAnalysis' });
            }
            break;
          case 'checkStability':
            if (result.designId) {
              updateDesign(result.designId, { stability: result, source: 'checkStability' });
            }
            break;
          case 'delegateExploration':
            if (result.agentReports && Array.isArray(result.agentReports)) {
              result.agentReports.forEach(r => {
                if (r.designId && r.parameters) {
                  addDesign(r.designId, {
                    designId: r.designId,
                    parameters: r.parameters,
                    description: r.description || r.agentSummary || '',
                    aero: r.aero || undefined,
                    stability: r.stability || undefined,
                    source: 'delegateExploration',
                  });
                }
              });
            }
            break;
          case 'compareDesigns':
            if (result.designs && Array.isArray(result.designs)) {
              result.designs.forEach(d => {
                if (!d.designId) return;
                const existing = useDesignStore.getState().designs[d.designId];
                const payload = {
                  designId: d.designId,
                  description: d.description,
                  parameters: d.parameters,
                  requirements: d.requirements,
                  score: d.score,
                  rank: d.rank,
                  aero: d.performance ? {
                    maxLD: d.performance.maxLD,
                    maxLD_alpha: d.performance.maxLD_alpha,
                    cruiseCL: d.performance.cruiseCL,
                    maxCL: d.performance.maxCL
                  } : undefined,
                  // Preserve the full stability object from checkStability; only fall
                  // back to the compare result's summary if it was missing.
                  stability: existing?.stability || d.stability || undefined,
                };
                if (existing) {
                  updateDesign(d.designId, payload);
                } else {
                  addDesign(d.designId, payload);
                }
              });
            }
            break;
          case 'generateReport':
            useDesignStore.getState().setReport(result);
            break;
          default:
            continue;
        }
      }
    }
  }, [messages, addDesign, updateDesign]);

  const handleTextareaChange = useCallback((e) => {
    setInput(e.target.value);
    const ta = e.target;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 150) + 'px';
  }, []);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (input.trim() && !isLoading) {
      sendMessage({ text: input });
      setInput('');
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
      <div className="chat-panel">
        <div className="chat-messages">
          {messages.length === 0 && (
              <div className="chat-empty">
                <div className="chat-empty-icon">&#9992;</div>
                <h3>OpenVSP AI Agent</h3>
                <p>I can create aircraft geometry, run aerodynamic analyses, check stability, and compare designs automatically.</p>
                <p className="chat-hint">Describe your design mission to begin.</p>
              </div>
          )}

          {messages.map((m) => (
              <MessageBubble key={m.id} message={m} />
          ))}

          {isLoading && (
              <div className="typing-indicator">
                <span /><span /><span />
              </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <StatusPanel messages={messages} status={status} />

        {error && (
            <div className="chat-error">Error: {error.message || 'Failed to get response'}</div>
        )}

        <form className="chat-input-form" onSubmit={handleSubmit}>
        <textarea
            ref={textareaRef}
            rows={1}
            value={input}
            onChange={handleTextareaChange}
            onKeyDown={handleKeyDown}
            placeholder="Describe your design mission..."
            disabled={isLoading}
        />
          <button type="submit" disabled={isLoading || !input.trim()}>
            {isLoading ? '...' : 'Send'}
          </button>
        </form>
      </div>
  );
}