import React from 'react';
import { useDesignStore } from '../hooks/useDesignStore';

export default function SelectedDesignDetail({ report }) {
  if (!report || !report.selectedDesignSummary) return null;

  const sel = report.selectedDesignSummary;
  const selectedVspFile = useDesignStore((s) => s.designs[sel.designId]?.vspFile);
  const [openMessage, setOpenMessage] = React.useState(null);
  const [opening, setOpening] = React.useState(false);

  const handleOpenVsp = async () => {
    if (!selectedVspFile) return;
    setOpening(true);
    setOpenMessage(null);
    try {
      const res = await window.api.openInVSP(selectedVspFile);
      setOpenMessage(res.message);
    } catch (err) {
      setOpenMessage(err?.message || 'Failed to open OpenVSP');
    } finally {
      setOpening(false);
    }
  };

  return (
    <div className="selected-design">
      <div className="selected-header">
        <span className="selected-badge">SELECTED</span>
        <h3>{sel.designId?.replace('design-', 'Design ')}</h3>
      </div>

      <p className="selected-description">{sel.description}</p>

      <div className="selected-reasoning">
        <h4>Why this design was selected</h4>
        <p>{report.reasoning}</p>
      </div>

      <div className="selected-metrics">
        <div className="metric">
          <span className="metric-value">{sel.maxLD?.toFixed(1)}</span>
          <span className="metric-label">Max L/D</span>
        </div>
        <div className="metric">
          <span className="metric-value">{sel.wingspan?.toFixed(2)} m</span>
          <span className="metric-label">Wingspan</span>
        </div>
        <div className="metric">
          <span className="metric-value">{sel.cruiseCL?.toFixed(3)}</span>
          <span className="metric-label">Cruise CL</span>
        </div>
        <div className={`metric ${sel.passedAllRequirements ? 'metric-pass' : 'metric-fail'}`}>
          <span className="metric-value">{sel.passedAllRequirements ? 'YES' : 'NO'}</span>
          <span className="metric-label">All Requirements</span>
        </div>
      </div>

      {selectedVspFile && (
        <div className="selected-open-vsp">
          <button onClick={handleOpenVsp} disabled={opening}>
            {opening ? 'Opening…' : 'Open selected design in OpenVSP GUI'}
          </button>
          {openMessage && <span className="open-vsp-message">{openMessage}</span>}
        </div>
      )}

      {report.allDesignsSummary && report.allDesignsSummary.length > 1 && (
        <div className="selected-comparison">
          <h4>Why better than alternatives</h4>
          <table className="mini-table">
            <thead>
              <tr>
                <th>Design</th>
                <th>L/D</th>
                <th>Wingspan</th>
                <th>Stable</th>
                <th>All Pass</th>
              </tr>
            </thead>
            <tbody>
              {report.allDesignsSummary.map((d) => (
                <tr
                  key={d.designId}
                  className={d.designId === report.selectedDesignId ? 'row-selected' : ''}
                >
                  <td>{d.designId.replace('design-', 'D')}</td>
                  <td>{d.maxLD?.toFixed(1)}</td>
                  <td>{d.wingspan?.toFixed(2)} m</td>
                  <td>{d.longitudinalStable ? 'Yes' : 'No'}</td>
                  <td>{d.passedAllRequirements ? 'Yes' : 'No'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
