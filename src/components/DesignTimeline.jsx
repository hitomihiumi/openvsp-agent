export default function DesignTimeline({ designs }) {
  if (designs.length === 0) return null;

  const steps = designs.flatMap((d, di) => {
    const items = [];
    items.push({
      designId: d.designId,
      step: 'geometry',
      label: `Create ${d.designId.replace('design-', 'Design ')}`,
      description: d.description || d.parameters?.description || '',
      done: !!d.parameters,
    });

    if (d.aero) {
      items.push({
        designId: d.designId,
        step: 'aero',
        label: `Aero analysis: L/D=${d.aero.maxLD?.toFixed(1) || '?'}`,
        description: d.aero.message || '',
        done: true,
      });
    }

    if (d.stability) {
      items.push({
        designId: d.designId,
        step: 'stability',
        label: `Stability: ${d.stability.overallStable ? 'STABLE' : 'UNSTABLE'}`,
        description: d.stability.message || '',
        done: true,
      });
    }

    return items;
  });

  return (
      <div className="timeline-section">
        <h3>Exploration Timeline</h3>
        <div className="timeline">
          {steps.map((step, i) => (
              <div
                  key={`${step.designId}-${step.step}`}
                  className={`timeline-item ${step.done ? 'done' : 'pending'}`}
              >
                <div className="timeline-marker">
                  {step.done ? '\u2713' : '\u25CB'}
                </div>
                <div className="timeline-content">
                  <div className="timeline-label">{step.label}</div>
                  {step.description && (
                      <div className="timeline-desc">{step.description}</div>
                  )}
                </div>
              </div>
          ))}
        </div>
      </div>
  );
}