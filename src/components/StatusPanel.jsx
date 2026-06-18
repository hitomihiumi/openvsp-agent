import { useMemo } from 'react';

const TOOL_DISPLAY = {
  'delegateExploration': 'Delegating to Sub-Agents',
  'createGeometry': 'Creating geometry',
  'runAeroAnalysis': 'Running aero analysis',
  'checkStability': 'Checking stability',
  'compareDesigns': 'Comparing designs',
  'generateReport': 'Generating report',
};

export default function StatusPanel({ messages, status }) {
  const stats = useMemo(() => {
    let toolCount = 0;
    let reasoningCount = 0;
    let activeTool = null;
    let completedTools = 0;
    let lastText = '';

    for (const msg of messages) {
      if (msg.role !== 'assistant') continue;

      if (msg.content) lastText = msg.content.slice(0, 80);

      const tools = [];
      if (msg.toolInvocations) tools.push(...msg.toolInvocations);

      if (msg.parts) {
        for (const part of msg.parts) {
          if (part.type === 'text' && part.text) lastText = part.text.slice(0, 80);
          if (part.type === 'reasoning') reasoningCount++;
          if (part.type === 'tool-invocation') tools.push(part.toolInvocation);
          else if (part.type?.startsWith('tool-')) tools.push(part);
        }
      }

      for (const t of tools) {
        if (!t) continue;
        toolCount++;
        const tName = t.toolName || (t.type?.replace('tool-', ''));
        if (t.state === 'call') {
          activeTool = TOOL_DISPLAY[tName] || tName;
        }
        if (t.state === 'result' || t.state === 'output-available' || t.state === 'error') {
          completedTools++;
        }
      }
    }

    return { toolCount, reasoningCount, activeTool, completedTools, lastText };
  }, [messages]);

  const isStreaming = status === 'streaming' || status === 'submitted';

  if (!isStreaming && stats.toolCount === 0) return null;

  return (
      <div className={`status-panel ${isStreaming ? 'active' : 'idle'}`}>
        <div className="status-row">
          {stats.activeTool ? (
              <span className="status-item status-active-tool">
            <span className="spinner-small" />
                {stats.activeTool}...
          </span>
          ) : isStreaming ? (
              <span className="status-item status-streaming">
            <span className="spinner-small" />
                {stats.lastText ? stats.lastText + '...' : 'Thinking...'}
          </span>
          ) : null}
        </div>
        <div className="status-row status-meta">
          {stats.toolCount > 0 && (
              <span className="status-item">
            {stats.completedTools}/{stats.toolCount} tools
          </span>
          )}
          {stats.reasoningCount > 0 && (
              <span className="status-item">
            {stats.reasoningCount} reasoning
          </span>
          )}
        </div>
      </div>
  );
}