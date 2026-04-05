import { useState, useEffect } from 'react';
import { MAJOR_STUDIES, getStudy } from '../api/cbioportal';

export default function StudySelector({ onSelectStudy }) {
  const [studies, setStudies] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const details = await Promise.all(
        MAJOR_STUDIES.map(async (s) => {
          try {
            const detail = await getStudy(s.studyId);
            return {
              ...s,
              sequencedSampleCount: detail.sequencedSampleCount,
              description: detail.description,
            };
          } catch {
            return { ...s, sequencedSampleCount: '?' };
          }
        })
      );
      setStudies(details);
      setLoading(false);
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner" />
        <div className="loading-text">Loading cancer studies from cBioPortal...</div>
      </div>
    );
  }

  return (
    <div>
      <div className="section-header">
        <div>
          <h2>🏥 Cancer Studies</h2>
          <div className="section-subtitle">
            Select a TCGA cancer study to explore its mutation landscape
          </div>
        </div>
        <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
          {studies.length} studies available
        </div>
      </div>

      <div className="study-grid">
        {studies.map((study) => (
          <div
            key={study.studyId}
            className="study-card"
            onClick={() => onSelectStudy(study)}
            id={`study-${study.studyId}`}
          >
            <div className="study-card-icon">{study.icon}</div>
            <h3>{study.name}</h3>
            <div className="cancer-type">{study.cancerType}</div>
            <div className="sample-count">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                <circle cx="9" cy="7" r="4"/>
                <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
              </svg>
              {study.sequencedSampleCount || '?'} sequenced samples
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
