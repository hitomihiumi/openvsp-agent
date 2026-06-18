import { useState } from 'react';

function extractVspFile(result) {
  if (!result) return null;
  if (typeof result === 'string') return null;
  return result.parameters?.vspFile || result.vspFile || null;
}

const TOOL_LABELS = {
  'delegateExploration': 'Delegate Exploration',
  'createGeometry': 'Create Geometry',
  'runAeroAnalysis': 'Aero Analysis',
  'checkStability': 'Stability Check',
  'compareDesigns': 'Compare Designs',
  'generateReport': 'Generate Report',
};

const SUB_STEP_ORDER = ['createGeometry', 'runAeroAnalysis', 'checkStability'];
const SUB_STEP_LABELS = {
  'createGeometry': 'Create Geometry',
  'runAeroAnalysis': 'Aero Analysis',
  'checkStability': 'Stability Check',
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

function OpenVspButton({ vspFile }) {
  const [state, setState] = useState({ loading: false, message: null });

  const handleOpen = async () => {
    if (!vspFile || state.loading) return;
    setState({ loading: true, message: null });
    try {
      const res = await window.api.openInVSP(vspFile);
      setState({ loading: false, message: res.message });
    } catch (err) {
      setState({ loading: false, message: err?.message || 'Failed to open OpenVSP' });
    }
  };

  return (
    <div className="tool-card-open-vsp">
      <button onClick={handleOpen} disabled={state.loading}>
        {state.loading ? (
          <><span className="spinner-small" /> Opening OpenVSP…</>
        ) : (
          'Open in OpenVSP GUI'
        )}
      </button>
      {state.message && <span className="tool-card-open-message">{state.message}</span>}
    </div>
  );
}

function DelegateSubSteps({ args, result, isRunning, isComplete }) {
  const strategies = args?.strategies || [];
  const reports = result?.agentReports || [];

  if (!isRunning && !isComplete) return null;

  return (
    <div className="tool-card-section">
      <div className="tool-card-section-label">Sub-agent steps</div>
      <div className="delegate-sub-steps">
        {strategies.map((strategy, idx) => {
          const report = reports.find((r) => r.designId === strategy.designId);
          const vspFile = extractVspFile(report);
          const status = report
            ? report.status === 'completed'
              ? 'complete'
              : 'error'
            : 'pending';

          return (
            <div key={strategy.designId} className={`delegate-design ${status}`}>
              <div className="delegate-design-header">
                <span className="delegate-design-id">{strategy.designId}</span>
                <span className="delegate-design-status">
                  {status === 'complete' && '\u2713'}
                  {status === 'error' && '\u2717'}
                  {status === 'pending' && '\u2026'}
                </span>
              </div>
              <div className="delegate-design-summary">{strategy.description}</div>
              <div className="delegate-design-steps">
                {SUB_STEP_ORDER.map((step) => {
                  const stepResult = report?.[step === 'createGeometry' ? 'parameters' : step === 'runAeroAnalysis' ? 'aero' : 'stability'];
                  const stepStatus = isRunning
                    ? 'running'
                    : stepResult
                    ? 'complete'
                    : 'pending';
                  const stepLabel = SUB_STEP_LABELS[step];
                  let stepDetail = '';
                  if (step === 'runAeroAnalysis' && stepResult?.maxLD !== undefined) {
                    stepDetail = `L/D=${stepResult.maxLD.toFixed(1)}`;
                  } else if (step === 'checkStability' && stepResult?.overallStable !== undefined) {
                    stepDetail = stepResult.overallStable ? 'STABLE' : 'UNSTABLE';
                  }

                  return (
                    <div key={step} className={`delegate-step ${stepStatus}`}>
                      <span className="delegate-step-status">
                        {stepStatus === 'running' && <span className="spinner-small" />}
                        {stepStatus === 'complete' && '\u2713'}
                        {stepStatus === 'pending' && '\u2026'}
                      </span>
                      <span className="delegate-step-label">{stepLabel}</span>
                      {stepDetail && <span className="delegate-step-detail">{stepDetail}</span>}
                    </div>
                  );
                })}
              </div>
              {isComplete && vspFile && (
                <div className="delegate-design-vsp">
                  <OpenVspButton vspFile={vspFile} />
                </div>
              )}
              {isComplete && report?.error && (
                <div className="delegate-design-error">{report.error}</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
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
              {args && rawToolName !== 'delegateExploration' && (
                  <div className="tool-card-section">
                    <div className="tool-card-section-label">Parameters</div>
                    <pre className="tool-card-code">
                {JSON.stringify(args, null, 2)}
              </pre>
                  </div>
              )}
              {rawToolName === 'delegateExploration' && (
                <DelegateSubSteps
                  args={args}
                  result={result}
                  isRunning={isRunning}
                  isComplete={isComplete}
                />
              )}
              {isComplete && rawToolName !== 'delegateExploration' && result && (
                  <div className="tool-card-section">
                    <div className="tool-card-section-label">Result</div>
                    <pre className="tool-card-code">
                {typeof result === 'string' ? result : JSON.stringify(result, null, 2)}
              </pre>
                  </div>
              )}
              {isComplete && rawToolName === 'createGeometry' && extractVspFile(result) && (
                  <div className="tool-card-section">
                    <OpenVspButton vspFile={extractVspFile(result)} />
                  </div>
              )}
              {isRunning && rawToolName !== 'delegateExploration' && (
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
