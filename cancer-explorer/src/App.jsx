import { useState, useCallback, useMemo } from 'react';
import StudySelector from './components/StudySelector';
import MutationTable from './components/MutationTable';
import MutationChart from './components/MutationChart';
import PatientProfile from './components/PatientProfile';
import { CANCER_DRIVER_GENES, getMutationsByStudyAndGenes } from './api/cbioportal';

function App() {
  // ── App State ──────────────────────────────────────────────────────
  const [view, setView] = useState('studies'); // 'studies' | 'explorer'
  const [selectedStudy, setSelectedStudy] = useState(null);
  const [mutations, setMutations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('table');
  const [patientModal, setPatientModal] = useState(null);

  // ── Handlers ───────────────────────────────────────────────────────
  // When a study is selected, AUTOMATICALLY fetch ALL driver gene mutations
  const handleSelectStudy = useCallback(async (study) => {
    setSelectedStudy(study);
    setView('explorer');
    setLoading(true);
    setError(null);
    try {
      // Fetch mutations for ALL 20 common cancer driver genes automatically
      const data = await getMutationsByStudyAndGenes(study.studyId, CANCER_DRIVER_GENES);
      setMutations(data);
    } catch (err) {
      setError(err.message);
      setMutations([]);
    }
    setLoading(false);
  }, []);

  const handleBackToStudies = useCallback(() => {
    setView('studies');
    setMutations([]);
    setSelectedStudy(null);
    setError(null);
  }, []);

  const handleSelectPatient = useCallback((patientId, studyId) => {
    setPatientModal({ patientId, studyId: studyId || selectedStudy?.studyId });
  }, [selectedStudy]);

  // ── Stats ──────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const uniquePatients = new Set(mutations.map(m => m.patientId)).size;
    const uniqueGenes = new Set(mutations.map(m => m.gene?.hugoGeneSymbol).filter(Boolean)).size;
    const missenseCount = mutations.filter(m => m.mutationType?.includes('Missense')).length;
    return { total: mutations.length, patients: uniquePatients, genes: uniqueGenes, missense: missenseCount };
  }, [mutations]);

  // ── Render ─────────────────────────────────────────────────────────
  return (
    <div className="app-container">
      {/* Header */}
      <header className="app-header">
        <div className="app-logo">
          <div className="app-logo-icon">🧬</div>
          <div>
            <h1>Mutation Explorer</h1>
            <span>cBioPortal · TCGA Somatic Mutations</span>
          </div>
        </div>
        {view === 'explorer' && (
          <div className="nav-tabs">
            {[
              ['table', 'Table'],
              ['charts', 'Charts'],
            ].map(([key, label]) => (
              <button
                key={key}
                className={`nav-tab ${activeTab === key ? 'active' : ''}`}
                onClick={() => setActiveTab(key)}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </header>

      {/* Study Selection View */}
      {view === 'studies' && (
        <StudySelector onSelectStudy={handleSelectStudy} />
      )}

      {/* Explorer View */}
      {view === 'explorer' && selectedStudy && (
        <>
          {/* Breadcrumb */}
          <div className="breadcrumb">
            <button className="breadcrumb-link" onClick={handleBackToStudies}>Studies</button>
            <span className="breadcrumb-sep">/</span>
            <span>{selectedStudy.name}</span>
          </div>

          {/* Error */}
          {error && <div className="error-msg">⚠️ {error}</div>}

          {/* Loading */}
          {loading && (
            <div className="loading-container">
              <div className="loading-spinner" />
              <div className="loading-text">Scanning {CANCER_DRIVER_GENES.length} cancer driver genes across {selectedStudy.sequencedSampleCount || '?'} samples...</div>
              <div className="loading-subtext">This may take a moment — fetching real patient data from cBioPortal</div>
            </div>
          )}

          {/* Results */}
          {!loading && mutations.length > 0 && (
            <>
              {/* Summary Stats */}
              <div className="stat-grid">
                <div className="stat-card">
                  <div className="stat-value">{stats.total.toLocaleString()}</div>
                  <div className="stat-label">Total Mutations</div>
                </div>
                <div className="stat-card">
                  <div className="stat-value">{stats.patients}</div>
                  <div className="stat-label">Unique Patients</div>
                </div>
                <div className="stat-card">
                  <div className="stat-value">{stats.genes}</div>
                  <div className="stat-label">Genes Mutated</div>
                </div>
                <div className="stat-card">
                  <div className="stat-value">{stats.missense.toLocaleString()}</div>
                  <div className="stat-label">Missense Mutations</div>
                </div>
              </div>

              {/* Tab Content */}
              <div className="tab-panel" key={activeTab}>
                {activeTab === 'table' && (
                  <div className="card" style={{ padding: 20 }}>
                    <MutationTable mutations={mutations} onSelectPatient={handleSelectPatient} />
                  </div>
                )}
                {activeTab === 'charts' && (
                  <MutationChart mutations={mutations} />
                )}
              </div>
            </>
          )}

          {/* Empty state */}
          {!loading && !error && mutations.length === 0 && (
            <div className="empty-state">
              <div className="empty-state-icon">🔬</div>
              <h3>No mutations found</h3>
              <p style={{ marginTop: 8 }}>No mutations were found for the common driver genes in this study.</p>
            </div>
          )}
        </>
      )}

      {/* Patient Modal */}
      {patientModal && (
        <PatientProfile
          patientId={patientModal.patientId}
          studyId={patientModal.studyId}
          onClose={() => setPatientModal(null)}
        />
      )}
    </div>
  );
}

export default App;
