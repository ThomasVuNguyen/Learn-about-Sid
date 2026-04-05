import { useState, useEffect } from 'react';
import { fetchMutationsForPatient } from '../api/cbioportal';

export default function PatientProfile({ patientId, studyId, onClose }) {
  const [mutations, setMutations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!patientId || !studyId) return;
    setLoading(true);
    setError(null);
    fetchMutationsForPatient(studyId, patientId)
      .then(data => setMutations(data))
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [patientId, studyId]);

  const geneSet = [...new Set(mutations.map(m => m.gene?.hugoGeneSymbol).filter(Boolean))];
  const typeCount = {};
  mutations.forEach(m => {
    const t = m.mutationType || 'Other';
    typeCount[t] = (typeCount[t] || 0) + 1;
  });

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Patient: {patientId}</h2>
          <button className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Close">&times;</button>
        </div>

        {loading && <div className="loading-container"><div className="spinner" /><p>Loading patient mutations...</p></div>}
        {error && <div className="error-msg">{error}</div>}

        {!loading && !error && (
          <>
            <div className="patient-stats">
              <div className="stat-card">
                <div className="stat-value">{mutations.length}</div>
                <div className="stat-label">Total Mutations</div>
              </div>
              <div className="stat-card">
                <div className="stat-value">{geneSet.length}</div>
                <div className="stat-label">Genes Affected</div>
              </div>
              <div className="stat-card">
                <div className="stat-value">{Object.keys(typeCount).length}</div>
                <div className="stat-label">Mutation Types</div>
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <h3 style={{ fontSize: '0.9rem', marginBottom: 8 }}>Affected Genes</h3>
              <div className="gene-chips">
                {geneSet.map(gene => (
                  <span key={gene} className="gene-chip selected">{gene}</span>
                ))}
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <h3 style={{ fontSize: '0.9rem', marginBottom: 8 }}>Type Breakdown</h3>
              <div className="type-bars">
                {Object.entries(typeCount).sort((a, b) => b[1] - a[1]).map(([type, count]) => (
                  <div key={type} className="type-bar-row">
                    <span className="type-bar-label">{type.replace(/_/g, ' ')}</span>
                    <div className="type-bar-track">
                      <div className="type-bar-fill" style={{ width: `${(count / mutations.length) * 100}%` }} />
                    </div>
                    <span className="type-bar-count">{count}</span>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <h3 style={{ fontSize: '0.9rem', marginBottom: 8 }}>All Mutations</h3>
              <div className="data-table-container" style={{ maxHeight: 300, overflowY: 'auto' }}>
                <table className="data-table data-table-sm">
                  <thead>
                    <tr><th>Gene</th><th>Protein</th><th>Type</th><th>Chr</th><th>Ref/Alt</th></tr>
                  </thead>
                  <tbody>
                    {mutations.map((m, i) => (
                      <tr key={i}>
                        <td style={{ fontWeight: 600 }}>{m.gene?.hugoGeneSymbol}</td>
                        <td className="protein-change">{m.proteinChange || '\u2014'}</td>
                        <td><span className="tag tag-sm">{(m.mutationType || '').replace(/_/g, ' ')}</span></td>
                        <td className="mono">{m.chr}</td>
                        <td className="mono" style={{ fontSize: '0.78rem' }}>
                          <span style={{ color: 'var(--accent-red)' }}>{m.referenceAllele}</span>
                          {'\u2192'}
                          <span style={{ color: 'var(--accent-green)' }}>{m.variantAllele}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
