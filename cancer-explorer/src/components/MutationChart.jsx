import { useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from 'recharts';

const TYPE_COLORS = {
  Missense: '#6366f1',
  Nonsense: '#ef4444',
  'Frame Shift Del': '#f59e0b',
  'Frame Shift Ins': '#f97316',
  Splice: '#06b6d4',
  'In Frame Del': '#8b5cf6',
  'In Frame Ins': '#a78bfa',
  Other: '#64748b',
};

function normalizeMutationType(type) {
  if (!type) return 'Other';
  return type.replace(/_/g, ' ').replace(/Mutation$/, '').trim() || 'Other';
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tooltip">
      <div style={{ fontWeight: 600, marginBottom: 4 }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color, fontSize: '0.85rem' }}>
          {p.name}: {p.value}
        </div>
      ))}
    </div>
  );
};

export default function MutationChart({ mutations }) {
  const geneFrequency = useMemo(() => {
    const counts = {};
    mutations.forEach(m => {
      const gene = m.gene?.hugoGeneSymbol || 'Unknown';
      counts[gene] = (counts[gene] || 0) + 1;
    });
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([gene, count]) => ({ gene, count }));
  }, [mutations]);

  const typeDistribution = useMemo(() => {
    const counts = {};
    mutations.forEach(m => {
      const type = normalizeMutationType(m.mutationType);
      counts[type] = (counts[type] || 0) + 1;
    });
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([name, value]) => ({ name, value }));
  }, [mutations]);

  const hotspots = useMemo(() => {
    const counts = {};
    mutations.forEach(m => {
      if (!m.proteinChange || !m.gene?.hugoGeneSymbol) return;
      const key = `${m.gene.hugoGeneSymbol} ${m.proteinChange}`;
      counts[key] = (counts[key] || 0) + 1;
    });
    return Object.entries(counts)
      .filter(([, c]) => c >= 2)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map(([mutation, count]) => ({ mutation, count }));
  }, [mutations]);

  if (!mutations.length) {
    return <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>No mutation data to chart</div>;
  }

  return (
    <div className="chart-grid">
      {/* Gene Frequency Bar Chart */}
      <div className="card chart-card">
        <h3 className="chart-title">Top Mutated Genes</h3>
        <ResponsiveContainer width="100%" height={350}>
          <BarChart data={geneFrequency} margin={{ top: 10, right: 20, left: 0, bottom: 50 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
            <XAxis dataKey="gene" tick={{ fill: '#94a3b8', fontSize: 11 }} angle={-45} textAnchor="end" interval={0} />
            <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey="count" name="Mutations" fill="url(#barGradient)" radius={[4, 4, 0, 0]} />
            <defs>
              <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#818cf8" />
                <stop offset="100%" stopColor="#6366f1" />
              </linearGradient>
            </defs>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Mutation Type Pie Chart */}
      <div className="card chart-card">
        <h3 className="chart-title">Mutation Type Distribution</h3>
        <ResponsiveContainer width="100%" height={350}>
          <PieChart>
            <Pie
              data={typeDistribution}
              cx="50%"
              cy="50%"
              innerRadius={60}
              outerRadius={110}
              paddingAngle={3}
              dataKey="value"
              nameKey="name"
              label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
              labelLine={{ stroke: '#475569' }}
            >
              {typeDistribution.map((entry, index) => (
                <Cell 
                  key={`cell-${index}`}
                  fill={TYPE_COLORS[entry.name] || TYPE_COLORS.Other}
                />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
            <Legend wrapperStyle={{ fontSize: '0.78rem', color: '#94a3b8' }} />
          </PieChart>
        </ResponsiveContainer>
      </div>

      {/* Hotspot Mutations */}
      {hotspots.length > 0 && (
        <div className="card chart-card chart-card-wide">
          <h3 className="chart-title">
            Recurrent Mutation Hotspots
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 400, marginLeft: 8 }}>
              (appearing in 2+ patients)
            </span>
          </h3>
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={hotspots} layout="vertical" margin={{ top: 10, right: 20, left: 100, bottom: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis type="number" tick={{ fill: '#94a3b8', fontSize: 11 }} />
              <YAxis dataKey="mutation" type="category" tick={{ fill: '#e2e8f0', fontSize: 11 }} width={90} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="count" name="Recurrences" fill="url(#hotspotGradient)" radius={[0, 4, 4, 0]} />
              <defs>
                <linearGradient id="hotspotGradient" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#ef4444" />
                  <stop offset="100%" stopColor="#f97316" />
                </linearGradient>
              </defs>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
