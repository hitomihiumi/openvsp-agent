import { useDesignStore } from '../hooks/useDesignStore';
import DesignComparisonChart from './DesignComparisonChart';
import DesignParametersTable from './DesignParametersTable';
import RequirementsChecklist from './RequirementsChecklist';
import SelectedDesignDetail from './SelectedDesignDetail';
import DesignTimeline from './DesignTimeline';
import ErrorBoundary from './ErrorBoundary';

export default function SimulationPanel() {
  const designs = useDesignStore((s) => s.designs);
  const selectedDesignId = useDesignStore((s) => s.selectedDesignId);
  const report = useDesignStore((s) => s.report);
  const designList = Object.values(designs);

  return (
    <div className="simulation-panel">
      <div className="sim-header">
        <h2>Simulation Results</h2>
        <span className="sim-count">
          {designList.length} design{designList.length !== 1 ? 's' : ''} explored
        </span>
      </div>

      {designList.length === 0 ? (
        <div className="sim-empty">
          <div className="sim-empty-icon">&#9881;</div>
          <p>No designs explored yet.</p>
          <p className="sim-empty-hint">
            The AI agent will create and analyze drone designs automatically.
            Results will appear here as they are generated.
          </p>
        </div>
      ) : (
        <div className="sim-content">
          {report && (
            <SelectedDesignDetail report={report} />
          )}

          <RequirementsChecklist designs={designList} />

          {designList.length >= 2 && (
            <ErrorBoundary>
              <DesignComparisonChart designs={designList} />
            </ErrorBoundary>
          )}

          <DesignParametersTable designs={designList} />

          <DesignTimeline designs={designList} />
        </div>
      )}
    </div>
  );
}
