import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { getProteinSequence, parseProteinChange, extractPeptideWindow, getAAName } from '../api/uniprot';
import ProteinViewer3D from './ProteinViewer3D';

function getMutationTagClass(type) {
  if (!type) return 'tag-other';
  const t = type.toLowerCase();
  if (t.includes('missense')) return 'tag-missense';
  if (t.includes('nonsense')) return 'tag-nonsense';
  if (t.includes('frame_shift') || t.includes('frameshift')) return 'tag-frameshift';
  if (t.includes('splice')) return 'tag-splice';
  return 'tag-other';
}

function getMutationLabel(type) {
  if (!type) return 'Other';
  if (type.includes('Missense')) return 'Missense';
  if (type.includes('Nonsense')) return 'Nonsense';
  if (type.includes('Frame_Shift_Del')) return 'FS Del';
  if (type.includes('Frame_Shift_Ins')) return 'FS Ins';
  if (type.includes('Splice')) return 'Splice';
  if (type.includes('In_Frame')) return 'In-Frame';
  return type.replace(/_/g, ' ');
}

// Gene full-name lookup for tooltips
const GENE_DESCRIPTIONS = {
  'BRAF': 'Growth signal kinase — tells cells to divide',
  'TP53': 'Tumor suppressor — the "guardian of the genome"',
  'KRAS': 'Growth switch — when stuck ON → uncontrolled growth',
  'PTEN': 'Tumor suppressor — acts as a brake on cell division',
  'NRAS': 'Growth switch — similar role to KRAS',
  'EGFR': 'Growth receptor on cell surface',
  'PIK3CA': 'Enzyme in growth pathway',
  'ALK': 'Kinase involved in cell development',
  'DDR2': 'Collagen receptor kinase',
  'ERBB2': 'HER2 — growth factor receptor',
  'IDH1': 'Metabolic enzyme',
  'IDH2': 'Metabolic enzyme (mitochondrial)',
  'ARID1A': 'DNA packaging regulator',
  'BRCA1': 'DNA repair gene',
  'BRCA2': 'DNA repair gene',
  'NF1': 'Regulates growth signals (RAS pathway)',
  'VHL': 'Oxygen-sensing tumor suppressor',
  'CDH1': 'Cell adhesion — keeps cells together',
  'CDKN2A': 'Cell cycle brake (p16)',
  'APC': 'WNT pathway regulator',
};

// ── Chain Detail Panel (expanded view) ─────────────────────────────────
function ChainDetail({ gene, proteinChange, mutation }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [windowSize, setWindowSize] = useState(9);
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const parsed = parseProteinChange(proteinChange);
        if (!parsed) {
          setError('Could not parse protein change notation');
          setLoading(false);
          return;
        }
        const seq = await getProteinSequence(gene);
        if (!seq) {
          setError('Sequence not found in UniProt');
          setLoading(false);
          return;
        }
        if (!cancelled) {
          setData({ parsed, seq });
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message);
          setLoading(false);
        }
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  const vaf = (mutation.tumorAltCount != null && mutation.tumorRefCount != null && (mutation.tumorAltCount + mutation.tumorRefCount) > 0)
    ? (mutation.tumorAltCount / (mutation.tumorAltCount + mutation.tumorRefCount) * 100).toFixed(1)
    : null;

  if (loading) {
    return (
      <div className="chain-detail">
        <div className="peptide-loading">
          <div className="loading-spinner" style={{ width: 20, height: 20, borderWidth: 2 }} />
          <span>Fetching sequence from UniProt...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="chain-detail">
        <div className="peptide-error">⚠️ {error}</div>
      </div>
    );
  }

  if (!data) return null;

  const { parsed, seq } = data;
  const peptide = extractPeptideWindow(seq.sequence, parsed.position, parsed.refAA, parsed.altAA, windowSize);

  if (!peptide) {
    return (
      <div className="chain-detail">
        <div className="peptide-error">Could not extract peptide window (position {parsed.position} out of range for {seq.length}aa protein)</div>
      </div>
    );
  }

  return (
    <div className="chain-detail">
      {/* ═══ HERO: 3 glanceable cards ═══ */}
      <div className="hero-strip">

        {/* ── Card 1: Amino Acid Swap ── */}
        <div className="hero-card hero-card-aa">
          <div className="hero-card-label">Amino Acid Change</div>
          <div className="hero-aa-swap">
            <div className="hero-aa-box hero-aa-ref">
              <span className="hero-aa-letter">{parsed.refAA}</span>
              <span className="hero-aa-name">{getAAName(parsed.refAA)}</span>
            </div>
            <div className="hero-aa-arrow">→</div>
            <div className="hero-aa-box hero-aa-alt">
              <span className="hero-aa-letter">{parsed.altAA}</span>
              <span className="hero-aa-name">{getAAName(parsed.altAA)}</span>
            </div>
          </div>
          <div className="hero-aa-position">Position {parsed.position} of {seq.length}</div>
        </div>

        {/* ── Card 2: 3D Shape (auto-loads) ── */}
        <div className="hero-card hero-card-3d">
          <ProteinViewer3D
            gene={gene}
            uniprotId={seq.uniprotId}
            sequence={seq.sequence}
            position={parsed.position}
            refAA={parsed.refAA}
            altAA={parsed.altAA}
            autoLoad={true}
            compact={true}
          />
        </div>

        {/* ── Card 3: Cancer Impact ── */}
        <div className="hero-card hero-card-cancer">
          <div className="hero-card-label">Cancer Impact</div>
          <div className="hero-cancer-gene">
            <span className="hero-cancer-gene-name">{gene}</span>
            <span className={`tag tag-sm ${getMutationTagClass(mutation.mutationType)}`}>{getMutationLabel(mutation.mutationType)}</span>
          </div>
          <div className="hero-cancer-role">{GENE_DESCRIPTIONS[gene] || 'Unknown role'}</div>
          <div className="hero-cancer-stats">
            <div className="hero-cancer-stat">
              <span className="hero-cancer-stat-value">{mutation.studyId?.replace('_tcga', '').toUpperCase() || '—'}</span>
              <span className="hero-cancer-stat-label">Study</span>
            </div>
            {vaf && (
              <div className="hero-cancer-stat">
                <span className="hero-cancer-stat-value">{vaf}%</span>
                <span className="hero-cancer-stat-label">Allele Freq</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ═══ COLLAPSIBLE DETAILS ═══ */}
      <div className="details-drawer">
        <button className="details-toggle" onClick={() => setShowDetails(!showDetails)}>
          <span>{showDetails ? '▾' : '▸'} More Details</span>
          <span className="details-hint">{showDetails ? 'Hide' : 'DNA · Peptide Sequence · Patient Info'}</span>
        </button>

        {showDetails && (
          <div className="details-content">
            {/* DNA info */}
            <div className="details-section">
              <div className="details-section-title">🧬 DNA</div>
              <div className="details-grid">
                <div className="details-item">
                  <span className="details-item-label">Gene</span>
                  <span className="details-item-value">{gene}</span>
                </div>
                <div className="details-item">
                  <span className="details-item-label">Chromosome</span>
                  <span className="details-item-value mono">{mutation.chr || '—'}</span>
                </div>
                <div className="details-item">
                  <span className="details-item-label">Genomic Position</span>
                  <span className="details-item-value mono">{mutation.startPosition?.toLocaleString() || '—'}</span>
                </div>
                <div className="details-item">
                  <span className="details-item-label">Protein Notation</span>
                  <span className="details-item-value mono">{proteinChange}</span>
                </div>
              </div>
            </div>

            {/* Peptide window */}
            <div className="details-section">
              <div className="details-section-title">🔬 Peptide Window</div>
              <div className="window-selector" style={{ marginBottom: 8 }}>
                <span className="window-label">Size:</span>
                {[8, 9, 10, 11, 15].map(size => (
                  <button
                    key={size}
                    className={`window-btn ${windowSize === size ? 'active' : ''}`}
                    onClick={() => setWindowSize(size)}
                  >
                    {size}mer
                  </button>
                ))}
              </div>
              <div className="seq-comparison chain-seq">
                <div className="seq-row">
                  <span className="seq-label">REF</span>
                  <span className="seq-content">
                    {peptide.wildtype.split('').map((aa, i) => (
                      <span key={i} className={`seq-aa ${i === peptide.mutationIndex ? 'seq-aa-ref' : ''}`}>{aa}</span>
                    ))}
                  </span>
                </div>
                <div className="seq-row">
                  <span className="seq-label seq-label-mut">MUT</span>
                  <span className="seq-content">
                    {peptide.mutant.split('').map((aa, i) => (
                      <span key={i} className={`seq-aa ${i === peptide.mutationIndex ? 'seq-aa-mut' : ''}`}>{aa}</span>
                    ))}
                  </span>
                </div>
              </div>
              {!peptide.refMatch && (
                <div style={{ color: 'var(--accent-amber)', fontSize: '0.72rem', marginTop: 6 }}>
                  ⚠️ UniProt ref AA ({peptide.refAA}) ≠ expected ({parsed.refAA}) — may be an isoform difference
                </div>
              )}
              <a href={`https://www.uniprot.org/uniprot/${seq.uniprotId}`} target="_blank" rel="noopener noreferrer" className="uniprot-link" style={{ fontSize: '0.72rem', marginTop: 6, display: 'inline-block' }}>
                UniProt: {seq.uniprotId} · {seq.proteinName}
              </a>
            </div>

            {/* Patient info */}
            <div className="details-section">
              <div className="details-section-title">🏥 Patient</div>
              <div className="details-grid">
                <div className="details-item">
                  <span className="details-item-label">Patient ID</span>
                  <span className="details-item-value mono" style={{ color: 'var(--accent-cyan)' }}>{mutation.patientId}</span>
                </div>
                <div className="details-item">
                  <span className="details-item-label">Sample</span>
                  <span className="details-item-value mono">{mutation.sampleId || '—'}</span>
                </div>
                <div className="details-item">
                  <span className="details-item-label">Study</span>
                  <span className="details-item-value">{mutation.studyId || '—'}</span>
                </div>
                {vaf && (
                  <div className="details-item">
                    <span className="details-item-label">Variant Allele Freq</span>
                    <span className="details-item-value">{vaf}%</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Table with 3-section column groups ───────────────────────────
export default function MutationTable({ mutations, onSelectPatient }) {
  const [sortField, setSortField] = useState('recurrence');
  const [sortDir, setSortDir] = useState('desc');
  const [filter, setFilter] = useState('');
  const [page, setPage] = useState(0);
  const [expandedRow, setExpandedRow] = useState(null);
  const pageSize = 50;

  const recurrenceMap = useMemo(() => {
    const map = {};
    mutations.forEach(m => {
      const key = `${m.gene?.hugoGeneSymbol || ''}:${m.proteinChange || ''}`;
      if (!map[key]) map[key] = new Set();
      map[key].add(m.patientId);
    });
    const counts = {};
    for (const [key, patients] of Object.entries(map)) {
      counts[key] = patients.size;
    }
    return counts;
  }, [mutations]);

  function getRecurrence(m) {
    const key = `${m.gene?.hugoGeneSymbol || ''}:${m.proteinChange || ''}`;
    return recurrenceMap[key] || 1;
  }

  function handleSort(field) {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir(field === 'recurrence' ? 'desc' : 'asc');
    }
  }

  const handleRowClick = useCallback((rowKey, gene, proteinChange) => {
    if (!gene || !proteinChange) return;
    setExpandedRow(prev => prev === rowKey ? null : rowKey);
  }, []);

  const filtered = useMemo(() => {
    if (!filter) return mutations;
    const f = filter.toLowerCase();
    return mutations.filter(m => {
      const gene = m.gene?.hugoGeneSymbol || '';
      const parsed = parseProteinChange(m.proteinChange);
      const refName = parsed ? getAAName(parsed.refAA).toLowerCase() : '';
      const altName = parsed ? getAAName(parsed.altAA).toLowerCase() : '';
      return gene.toLowerCase().includes(f) ||
        (m.proteinChange || '').toLowerCase().includes(f) ||
        (m.patientId || '').toLowerCase().includes(f) ||
        (m.mutationType || '').toLowerCase().includes(f) ||
        refName.includes(f) ||
        altName.includes(f) ||
        (m.chr || '').toLowerCase().includes(f);
    });
  }, [mutations, filter]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      let va, vb;
      switch (sortField) {
        case 'gene': va = a.gene?.hugoGeneSymbol || ''; vb = b.gene?.hugoGeneSymbol || ''; break;
        case 'chr': va = a.chr || ''; vb = b.chr || ''; break;
        case 'proteinChange': va = a.proteinChange || ''; vb = b.proteinChange || ''; break;
        case 'mutationType': va = a.mutationType || ''; vb = b.mutationType || ''; break;
        case 'recurrence': va = getRecurrence(a); vb = getRecurrence(b); break;
        case 'position': {
          const pa = parseProteinChange(a.proteinChange);
          const pb = parseProteinChange(b.proteinChange);
          va = pa ? pa.position : 0;
          vb = pb ? pb.position : 0;
          break;
        }
        case 'patientId': va = a.patientId || ''; vb = b.patientId || ''; break;
        default: va = ''; vb = '';
      }
      if (typeof va === 'string') return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
      return sortDir === 'asc' ? va - vb : vb - va;
    });
  }, [filtered, sortField, sortDir, recurrenceMap]);

  const paged = sorted.slice(page * pageSize, (page + 1) * pageSize);
  const totalPages = Math.ceil(sorted.length / pageSize);

  function SortIcon({ field }) {
    if (sortField !== field) return null;
    return <span style={{ marginLeft: 4 }}>{sortDir === 'asc' ? '\u2191' : '\u2193'}</span>;
  }

  return (
    <div>
      {/* Chain legend */}
      <div className="chain-legend">
        <div className="chain-legend-item chain-legend-dna">
          <span className="chain-legend-dot"></span>
          <span>DNA</span>
        </div>
        <div className="chain-legend-arrow">→</div>
        <div className="chain-legend-item chain-legend-protein">
          <span className="chain-legend-dot"></span>
          <span>Amino Acid Change</span>
        </div>
        <div className="chain-legend-arrow">→</div>
        <div className="chain-legend-item chain-legend-cancer">
          <span className="chain-legend-dot"></span>
          <span>Cancer</span>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 12, flexWrap: 'wrap' }}>
        <input
          className="input"
          style={{ maxWidth: 360 }}
          placeholder="Filter by gene, amino acid, patient, chromosome..."
          value={filter}
          onChange={(e) => { setFilter(e.target.value); setPage(0); }}
          id="mutation-filter-input"
        />
        <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
          {sorted.length} mutations
        </div>
      </div>

      <div className="data-table-container">
        <table className="data-table chain-table">
          <thead>
            {/* Section header row */}
            <tr className="chain-section-row">
              <th colSpan={2} className="chain-section-header chain-section-dna">
                <span className="chain-section-icon">🧬</span> DNA
              </th>
              <th colSpan={3} className="chain-section-header chain-section-protein">
                <span className="chain-section-icon">🔬</span> Amino Acid Change
              </th>
              <th colSpan={2} className="chain-section-header chain-section-cancer">
                <span className="chain-section-icon">🏥</span> Cancer
              </th>
            </tr>
            {/* Column header row */}
            <tr>
              {/* DNA columns */}
              <th className={`chain-col-dna ${sortField === 'gene' ? 'sorted' : ''}`} onClick={() => handleSort('gene')}>
                Gene<SortIcon field="gene" />
              </th>
              <th className={`chain-col-dna ${sortField === 'chr' ? 'sorted' : ''}`} onClick={() => handleSort('chr')}>
                Chr<SortIcon field="chr" />
              </th>
              {/* Amino Acid columns */}
              <th className={`chain-col-protein ${sortField === 'position' ? 'sorted' : ''}`} onClick={() => handleSort('position')}>
                Position<SortIcon field="position" />
              </th>
              <th className="chain-col-protein">
                Original → Mutant
              </th>
              <th className={`chain-col-protein ${sortField === 'mutationType' ? 'sorted' : ''}`} onClick={() => handleSort('mutationType')}>
                Type<SortIcon field="mutationType" />
              </th>
              {/* Cancer columns */}
              <th className={`chain-col-cancer ${sortField === 'recurrence' ? 'sorted' : ''}`} onClick={() => handleSort('recurrence')}>
                Recurrence<SortIcon field="recurrence" />
              </th>
              <th className={`chain-col-cancer ${sortField === 'patientId' ? 'sorted' : ''}`} onClick={() => handleSort('patientId')}>
                Patient<SortIcon field="patientId" />
              </th>
            </tr>
          </thead>
          <tbody>
            {paged.map((m, i) => {
              const recurrence = getRecurrence(m);
              const rowKey = `${m.sampleId}-${m.entrezGeneId}-${m.proteinChange}-${i}`;
              const isExpanded = expandedRow === rowKey;
              const geneName = m.gene?.hugoGeneSymbol || '';
              const hasSequenceData = geneName && m.proteinChange && m.mutationType?.includes('Missense');

              // Parse protein change for display
              const parsed = parseProteinChange(m.proteinChange);
              const refFull = parsed ? getAAName(parsed.refAA) : '—';
              const altFull = parsed ? getAAName(parsed.altAA) : '—';
              const position = parsed ? parsed.position : '—';
              const geneDescription = GENE_DESCRIPTIONS[geneName] || '';

              return (
                <React.Fragment key={rowKey}>
                  <tr
                    className={`${hasSequenceData ? 'row-expandable' : ''} ${isExpanded ? 'row-expanded' : ''}`}
                    onClick={() => hasSequenceData && handleRowClick(rowKey, geneName, m.proteinChange)}
                    title={hasSequenceData ? 'Click to view the full DNA → Protein → Cancer chain' : ''}
                  >
                    {/* DNA columns */}
                    <td className="chain-col-dna" style={{ fontWeight: 600 }}>
                      {hasSequenceData && <span className="expand-icon">{isExpanded ? '▼' : '▶'}</span>}
                      <span title={geneDescription}>{geneName || '—'}</span>
                    </td>
                    <td className="chain-col-dna mono" style={{ textAlign: 'center', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                      {m.chr || '—'}
                    </td>
                    {/* Amino Acid columns */}
                    <td className="chain-col-protein mono" style={{ textAlign: 'center' }}>
                      {position}
                    </td>
                    <td className="chain-col-protein">
                      {parsed ? (
                        <span className="aa-swap">
                          <span className="aa-ref" title={`${parsed.refAA} — ${refFull}`}>{refFull}</span>
                          <span className="aa-arrow">→</span>
                          <span className="aa-mut" title={`${parsed.altAA} — ${altFull}`}>{altFull}</span>
                        </span>
                      ) : (
                        <span className="protein-change">{m.proteinChange || '—'}</span>
                      )}
                    </td>
                    <td className="chain-col-protein">
                      <span className={`tag ${getMutationTagClass(m.mutationType)}`}>{getMutationLabel(m.mutationType)}</span>
                    </td>
                    {/* Cancer columns */}
                    <td className="chain-col-cancer mono" style={{ textAlign: 'center', fontWeight: recurrence > 5 ? 700 : 400 }}>
                      {recurrence}
                    </td>
                    <td className="chain-col-cancer">
                      <button className="patient-link" onClick={(e) => { e.stopPropagation(); onSelectPatient && onSelectPatient(m.patientId, m.studyId); }}>
                        {m.patientId}
                      </button>
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr key={`${rowKey}-detail`} className="detail-row">
                      <td colSpan={7} style={{ padding: 0 }}>
                        <ChainDetail gene={geneName} proteinChange={m.proteinChange} mutation={m} />
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
            {paged.length === 0 && (
              <tr><td colSpan={7} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>No mutations found</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12, marginTop: 16 }}>
          <button className="btn btn-ghost btn-sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>Previous</button>
          <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
            Page {page + 1} of {totalPages}
          </span>
          <button className="btn btn-ghost btn-sm" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>Next</button>
        </div>
      )}
    </div>
  );
}
