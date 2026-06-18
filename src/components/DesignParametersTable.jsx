export default function DesignParametersTable({ designs }) {
  if (designs.length === 0) return null;

  const params = [
    { key: 'wingspan', label: 'Wingspan (m)', format: (v) => v?.toFixed(2) || '-' },
    { key: 'wingArea', label: 'Wing Area (m\u00B2)', format: (v) => v?.toFixed(3) || '-' },
    { key: 'aspectRatio', label: 'Aspect Ratio', format: (v) => v?.toFixed(1) || '-' },
    { key: 'wingAirfoil', label: 'Airfoil', format: (v) => v || '-' },
    { key: 'htailArea', label: 'H-Tail Area (m\u00B2)', format: (v) => v?.toFixed(3) || '-' },
    { key: 'vtailArea', label: 'V-Tail Area (m\u00B2)', format: (v) => v?.toFixed(3) || '-' },
    { key: 'fuselageLength', label: 'Fuselage (m)', format: (v) => v?.toFixed(2) || '-' },
    { key: 'cgPosition', label: 'CG Position (m)', format: (v) => v?.toFixed(2) || '-' },
  ];

  const aero = [
    { key: 'maxLD', label: 'Max L/D', format: (v) => v?.toFixed(1) || '-' },
    { key: 'maxLD_alpha', label: 'Optimal Alpha (deg)', format: (v) => v?.toFixed(1) || '-' },
    { key: 'maxCL', label: 'Max CL', format: (v) => v?.toFixed(3) || '-' },
    { key: 'cruiseCL', label: 'Cruise CL', format: (v) => v?.toFixed(3) || '-' },
  ];

  const stab = [
    { key: 'staticMargin', label: 'Static Margin (%)', path: 'stability.longitudinal.staticMargin', format: (v) => v?.toFixed(1) || '-' },
    { key: 'cnBeta', label: 'CN β', path: 'stability.directional.CN_beta', format: (v) => v?.toFixed(4) || '-' },
    { key: 'overallStable', label: 'Stable', path: 'stability.overallStable', format: (v) => (v ? 'Yes' : 'No') },
  ];

  const getValue = (design, path) => {
    return path.split('.').reduce((obj, key) => obj?.[key], design);
  };

  return (
    <div className="table-section">
      <h3>Design Parameters</h3>
      <div className="table-wrapper">
        <table className="design-table">
          <thead>
            <tr>
              <th>Parameter</th>
              {designs.map((d) => (
                <th key={d.designId}>{d.designId.replace('design-', 'D')}</th>
              ))}
            </tr>
          </thead>
            <tbody>
              <tr className="section-row"><td colSpan={designs.length + 1}>Geometry</td></tr>
              {params.map((p) => (
                <tr key={p.key}>
                  <td>{p.label}</td>
                  {designs.map((d) => (
                    <td key={d.designId}>{p.format(d.parameters?.[p.key])}</td>
                  ))}
                </tr>
              ))}
              <tr className="section-row"><td colSpan={designs.length + 1}>Aerodynamics</td></tr>
              {aero.map((p) => (
                <tr key={p.key}>
                  <td>{p.label}</td>
                  {designs.map((d) => (
                    <td key={d.designId}>{p.format(d.aero?.[p.key])}</td>
                  ))}
                </tr>
              ))}
              <tr className="section-row"><td colSpan={designs.length + 1}>Stability</td></tr>
              {stab.map((p) => (
                <tr key={p.key}>
                  <td>{p.label}</td>
                  {designs.map((d) => (
                    <td key={d.designId}>{p.format(getValue(d, p.path))}</td>
                  ))}
                </tr>
              ))}
            </tbody>
        </table>
      </div>
    </div>
  );
}
