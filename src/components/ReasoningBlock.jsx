import { useState } from 'react';

export default function ReasoningBlock({ part }) {
  const [expanded, setExpanded] = useState(false);
  const isDone = part.state !== 'streaming';
  const text = part.text || part.reasoning || '';

  if (!text && isDone) return null;

  return (
      <div className="reasoning-block">
        <button
            className="reasoning-toggle"
            onClick={() => setExpanded(!expanded)}
        >
        <span className="reasoning-icon">
          {!isDone ? <span className="spinner-small" /> : '\u2713'}
        </span>
          <span className="reasoning-label">
          {isDone ? 'Reasoning' : 'Thinking...'}
        </span>
          <span className="reasoning-chevron">
          {expanded ? '\u25BC' : '\u25B6'}
        </span>
        </button>
        {expanded && text && (
            <div className="reasoning-content">
              {text}
            </div>
        )}
      </div>
  );
}