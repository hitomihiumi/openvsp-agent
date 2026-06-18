import { useState } from 'react';

const TOOL_LABELS = {
  'delegateExploration': 'Delegate Exploration',
  'createGeometry': 'Create Geometry',
  'runAeroAnalysis': 'Aero Analysis',
  'checkStability': 'Stability Check',
  'compareDesigns': 'Compare Designs',
  'generateReport': 'Generate Report',
};

function getSummary(invocation) {
  const state = invocation.state;
  if (state === 'call') return 'Running...';
  if (state === 'error') {
    const err = invocation.error || invocation;
    return typeof err === 'string' ? err : err?.message || 'Failed';
  }
  if (state === 'result' || state === 'output-available') {
    const out = invocation.result || invocation.output;
    if (!out) return 'Done';
    if (typeof out === 'string') return out.slice(0, 100);
    if (out.message) return out.message.slice(0, 100);
    if (out.success === false && out.error) return out.error.slice(0, 100);
    return 'Done';
  }
  return 'Pending';
}

export default function ToolCallCard({ part }) {
  const invocation = part.type === 'tool-invocation' ? part.toolInvocation : part;
  const [expanded, setExpanded] = useState(false);

  const state = invocation.state;
  const isRunning = state === 'call';
  const isComplete = state === 'result' || state === 'output-available';
  const isError = state === 'error';

  const rawToolName = invocation.toolName || (invocation.type?.startsWith('tool-') ? invocation.type.replace('tool-', '') : 'Tool');
  const toolName = TOOL_LABELS[rawToolName] || rawToolName;
  const summary = getSummary(invocation);

  const args = invocation.args || invocation.input;
  const result = invocation.result || invocation.output;

  return (
      <div className={`tool-card ${isRunning ? 'running' : ''} ${isComplete ? 'complete' : ''} ${isError ? 'error' : ''}`}>
        <div className="tool-card-summary" onClick={() => setExpanded(!expanded)}>
        <span className="tool-card-status-icon">
          {isRunning && <span className="spinner-small" />}
          {isComplete && <span>{'\u2713'}</span>} {/* Галочка */}
          {isError && <span>{'\u2717'}</span>}   {/* Крестик */}
          {!isRunning && !isComplete && !isError && <span>{'\u2026'}</span>} {/* Троеточие */}
        </span>
          <span className="tool-card-label">{toolName}</span>
          <span className="tool-card-dash"> &mdash; </span>
          <span className="tool-card-summary-text">{summary}</span>
          <span className="tool-card-chevron">{expanded ? '\u25BC' : '\u25B6'}</span> {/* Стрелочки Вниз/Вправо */}
        </div>

        {expanded && (
            <div className="tool-card-body">
              {args && (
                  <div className="tool-card-section">
                    <div className="tool-card-label">Parameters</div>
                    <pre className="tool-card-code">
                {JSON.stringify(args, null, 2)}
              </pre>
                  </div>
              )}
              {isComplete && result && (
                  <div className="tool-card-section">
                    <div className="tool-card-label">Result</div>
                    <pre className="tool-card-code">
                {typeof result === 'string' ? result : JSON.stringify(result, null, 2)}
              </pre>
                  </div>
              )}
              {isRunning && (
                  <div className="tool-card-section tool-card-loading">
                    <span className="spinner-small" />
                    <span>Executing...</span>
                  </div>
              )}
            </div>
        )}
      </div>
  );
}