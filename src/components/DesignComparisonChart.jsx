import { useMemo } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  LineChart,
  Line,
  ReferenceLine,
  Cell,
} from 'recharts';

const COLORS = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6'];

export default function DesignComparisonChart({ designs }) {
  // Memoize data transformations to prevent unnecessary recalculations
  const ldData = useMemo(() =>
    designs
      .filter((d) => d.aero)
      .map((d, i) => ({
        name: d.designId.replace('design-', 'D'),
        'L/D': d.aero.maxLD || 0,
        fill: COLORS[i % COLORS.length],
      }))
  , [designs]);

  const stabilityData = useMemo(() =>
    designs
      .filter((d) => d.stability)
      .map((d, i) => ({
        name: d.designId.replace('design-', 'D'),
        'Static Margin (%)': d.stability.longitudinal?.staticMargin || 0,
        fill: COLORS[i % COLORS.length],
      }))
  , [designs]);

  const mergedAlphaData = useMemo(() => {
    const alphaData = designs
      .filter((d) => d.aero?.alphaSweep)
      .flatMap((d) =>
        (d.aero.alphaSweep || []).map((point) => ({
          alpha: point.alpha,
          [d.designId.replace('design-', 'D')]: point.LD,
        }))
      );

    const alphaGroups = [...new Set(alphaData.map((d) => d.alpha))].sort((a, b) => a - b);

    return alphaGroups.map((alpha) => {
      const row = { alpha };
      const matching = alphaData.filter((d) => d.alpha === alpha);
      for (const m of matching) {
        Object.keys(m).forEach((k) => {
          if (k !== 'alpha') row[k] = m[k];
        });
      }
      return row;
    });
  }, [designs]);

  return (
    <div className="chart-section">
      <h3>Design Comparison</h3>

      {ldData.length > 0 && (
        <div className="chart-container">
          <h4>Maximum L/D Ratio</h4>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={ldData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#333" />
              <XAxis dataKey="name" stroke="#aaa" />
              <YAxis stroke="#aaa" />
              <Tooltip
                contentStyle={{ background: '#1e1e2e', border: '1px solid #444' }}
                itemStyle={{ color: '#fff' }}
              />
              <Bar dataKey="L/D" radius={[4, 4, 0, 0]} isAnimationActive={false}>
                {ldData.map((entry, i) => (
                  <Cell key={`cell-${i}`} fill={COLORS[i % COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {stabilityData.length > 0 && (
        <div className="chart-container">
          <h4>Longitudinal Static Margin</h4>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={stabilityData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#333" />
              <XAxis dataKey="name" stroke="#aaa" />
              <YAxis stroke="#aaa" />
              <Tooltip
                contentStyle={{ background: '#1e1e2e', border: '1px solid #444' }}
                itemStyle={{ color: '#fff' }}
              />
              <ReferenceLine y={5} stroke="#22c55e" strokeDasharray="3 3" label="Min Stable" />
              <ReferenceLine y={25} stroke="#ef4444" strokeDasharray="3 3" label="Max Stable" />
              <Bar dataKey="Static Margin (%)" radius={[4, 4, 0, 0]} isAnimationActive={false}>
                {stabilityData.map((entry, i) => (
                  <Cell key={`cell-${i}`} fill={COLORS[i % COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {mergedAlphaData.length > 0 && (
        <div className="chart-container">
          <h4>L/D vs Angle of Attack</h4>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={mergedAlphaData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#333" />
              <XAxis dataKey="alpha" stroke="#aaa" label={{ value: 'Alpha (deg)', position: 'bottom', fill: '#aaa' }} />
              <YAxis stroke="#aaa" label={{ value: 'L/D', angle: -90, position: 'insideLeft', fill: '#aaa' }} />
              <Tooltip
                contentStyle={{ background: '#1e1e2e', border: '1px solid #444' }}
                itemStyle={{ color: '#fff' }}
              />
              <Legend />
               {designs
                 .filter((d) => d.aero)
                 .map((d, i) => (
                   <Line
                     key={d.designId}
                     type="monotone"
                     dataKey={d.designId.replace('design-', 'D')}
                     stroke={COLORS[i % COLORS.length]}
                     strokeWidth={2}
                     dot={false}
                     isAnimationActive={false}
                   />
                 ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
