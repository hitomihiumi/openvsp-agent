export default function RequirementsChecklist({ designs }) {
  const checks = [
    {
      id: 'wingspan',
      label: 'Wingspan constraint met',
      check: (d) => {
        const ws = d.parameters?.wingspan;
        return ws != null && ws > 0 && ws < 10;
      },
    },
    {
      id: 'stability',
      label: 'All-axis stability',
      check: (d) => {
        // Check both possible locations for overallStable
        return d.stability?.overallStable === true;
      },
    },
    {
      id: 'hasAero',
      label: 'Aerodynamic analysis complete',
      check: (d) => {
        // Aero object should exist and have valid maxLD
        const aero = d.aero;
        return aero != null && typeof aero === 'object' && aero.maxLD > 0;
      },
    },
    {
      id: 'positiveLD',
      label: 'Positive L/D ratio',
      check: (d) => {
        // Aero should exist with maxLD > 0
        const maxLD = d.aero?.maxLD;
        return typeof maxLD === 'number' && maxLD > 0;
      },
    },
  ];

  return (
    <div className="checklist-section">
      <h3>Design Quality</h3>
      <div className="checklist-grid">
        <div className="checklist-header">
          <div className="checklist-cell">Criterion</div>
          {designs.map((d) => (
            <div key={d.designId} className="checklist-cell">
              {d.designId.replace('design-', 'D')}
            </div>
          ))}
        </div>

        {checks.map((req) => (
          <div key={req.id} className="checklist-row">
            <div className="checklist-cell checklist-label">{req.label}</div>
            {designs.map((d) => {
              const passed = req.check(d);
              return (
                <div
                  key={d.designId}
                  className={`checklist-cell badge ${passed ? 'badge-pass' : 'badge-fail'}`}
                >
                  {passed ? 'PASS' : 'FAIL'}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
