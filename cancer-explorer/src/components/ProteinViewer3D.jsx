import React, { useState, useEffect, useRef, useCallback } from 'react';

// ── AlphaFold DB: get pre-computed wild-type structure ──────────────────
// Try multiple versions since AlphaFold DB updates version numbers
async function fetchAlphaFoldPDB(uniprotId) {
  const versions = ['v4', 'v3', 'v2'];
  for (const ver of versions) {
    const url = `https://alphafold.ebi.ac.uk/files/AF-${uniprotId}-F1-model_${ver}.pdb`;
    try {
      // Use HEAD first to avoid noisy 404 body downloads in the console
      const head = await fetch(url, { method: 'HEAD' });
      if (!head.ok) continue;
      const res = await fetch(url);
      if (res.ok) return { pdb: await res.text(), source: 'alphafold' };
    } catch { /* try next version */ }
  }
  return null; // Not found in any version
}

// ── ESMFold: predict structure from a sequence ──────────────────────────
// ESMFold API does NOT support CORS, so we route through a proxy
const ESMFOLD_URL = 'https://api.esmatlas.com/foldSequence/v1/pdb/';
const CORS_PROXIES = [
  (url) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
  (url) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
];

async function foldWithESMFold(sequence) {
  // Try direct first (in case CORS is enabled in future / server environment)
  try {
    const directRes = await fetch(ESMFOLD_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: sequence,
    });
    if (directRes.ok) return await directRes.text();
  } catch { /* CORS blocked — expected, try proxies */ }

  // Try each CORS proxy
  for (const makeProxyUrl of CORS_PROXIES) {
    try {
      const proxyUrl = makeProxyUrl(ESMFOLD_URL);
      const res = await fetch(proxyUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: sequence,
      });
      if (res.ok) {
        const text = await res.text();
        // Validate it looks like PDB data
        if (text.includes('ATOM') || text.includes('MODEL')) return text;
      }
    } catch { /* try next proxy */ }
  }

  throw new Error('ESMFold folding unavailable — CORS proxies exhausted. Try again later.');
}

// ── Extract a region from PDB around the mutation site ──────────────────
function extractRegionFromPDB(pdbText, centerResidue, windowSize = 30) {
  const halfWin = Math.floor(windowSize / 2);
  const start = Math.max(1, centerResidue - halfWin);
  const end = centerResidue + halfWin;
  
  const lines = pdbText.split('\n');
  const kept = lines.filter(line => {
    if (!line.startsWith('ATOM') && !line.startsWith('HETATM') && !line.startsWith('END')) return false;
    if (line.startsWith('END')) return true;
    const resSeq = parseInt(line.substring(22, 26).trim(), 10);
    return resSeq >= start && resSeq <= end;
  });
  
  return kept.join('\n') + '\nEND';
}

// ── Create mutant sequence from wild-type ───────────────────────────────
function createMutantSequence(sequence, position, altAA) {
  if (!sequence || position < 1 || position > sequence.length) return sequence;
  const idx = position - 1;
  return sequence.substring(0, idx) + altAA + sequence.substring(idx + 1);
}

// ── Initialize 3Dmol viewer ─────────────────────────────────────────────
function initViewer(container, pdbData, mutationResidue, isMutant, highlightColor) {
  if (!window.$3Dmol || !container || !pdbData) return null;
  
  const viewer = window.$3Dmol.createViewer(container, {
    backgroundColor: '#0c0e1a',
    antialias: true,
  });
  
  viewer.addModel(pdbData, 'pdb');
  
  // Cartoon style for the whole structure
  viewer.setStyle({}, {
    cartoon: {
      color: 'spectrum',
      opacity: 0.85,
    }
  });
  
  // Highlight mutation site
  if (mutationResidue) {
    viewer.setStyle(
      { resi: mutationResidue },
      {
        cartoon: { color: highlightColor || (isMutant ? '#ff4444' : '#44aaff'), opacity: 1.0 },
        stick: { color: highlightColor || (isMutant ? '#ff4444' : '#44aaff'), radius: 0.25 },
      }
    );
    
    // Add label at mutation site
    viewer.addLabel(
      isMutant ? 'MUTANT' : 'WILD-TYPE',
      {
        position: { resi: mutationResidue },
        fontSize: 11,
        fontColor: 'white',
        backgroundColor: isMutant ? '#ff4444' : '#44aaff',
        backgroundOpacity: 0.75,
        borderThickness: 0,
      },
      { resi: mutationResidue }
    );
  }
  
  viewer.zoomTo();
  viewer.render();
  viewer.spin('y', 0.5); // Slow spin for visual effect
  
  return viewer;
}

// ── Protein Viewer 3D Component ─────────────────────────────────────────
export default function ProteinViewer3D({ gene, uniprotId, sequence, position, refAA, altAA, autoLoad = false, compact = false }) {
  const [status, setStatus] = useState('idle'); // idle | loading | ready | error
  const [progress, setProgress] = useState('');
  const [error, setError] = useState(null);
  const [wildTypePDB, setWildTypePDB] = useState(null);
  const [mutantPDB, setMutantPDB] = useState(null);
  const [structureSource, setStructureSource] = useState(''); // 'alphafold' or 'esmfold'
  const [lib3DmolLoaded, setLib3DmolLoaded] = useState(!!window.$3Dmol);
  const [mode, setMode] = useState('region'); // 'region' = zoomed to mutation, 'full' = full protein
  
  const wildTypeRef = useRef(null);
  const mutantRef = useRef(null);
  const wildViewerRef = useRef(null);
  const mutViewerRef = useRef(null);
  const autoLoadFired = useRef(false);

  // Load 3Dmol.js dynamically (only once)
  useEffect(() => {
    if (window.$3Dmol) { setLib3DmolLoaded(true); return; }
    
    const script = document.createElement('script');
    script.src = 'https://3Dmol.org/build/3Dmol-min.js';
    script.async = true;
    script.onload = () => setLib3DmolLoaded(true);
    script.onerror = () => setError('Failed to load 3Dmol.js visualization library');
    document.head.appendChild(script);
    
    return () => { /* script stays loaded */ };
  }, []);

  // Fetch structures
  const loadStructures = useCallback(async () => {
    if (!uniprotId || !sequence || !position || !altAA) return;
    
    setStatus('loading');
    setError(null);
    
    try {
      // Step 1: Try AlphaFold DB for the wild-type full-length structure
      setProgress('Checking AlphaFold DB for wild-type structure...');
      const alphafoldResult = await fetchAlphaFoldPDB(uniprotId);
      
      if (alphafoldResult) {
        setWildTypePDB(alphafoldResult.pdb);
        setStructureSource('alphafold');
      } else {
        // AlphaFold doesn't have it — generate with ESMFold instead
        // Cap at ~400aa for ESMFold performance (full proteins > 400aa are very slow)
        const maxLen = 400;
        const wtSeq = sequence.length > maxLen
          ? sequence.substring(
              Math.max(0, position - 1 - maxLen / 2),
              Math.min(sequence.length, position - 1 + maxLen / 2)
            )
          : sequence;
        setProgress(`AlphaFold unavailable — folding wild-type (${wtSeq.length}aa) with ESMFold...`);
        const wtPDB = await foldWithESMFold(wtSeq);
        setWildTypePDB(wtPDB);
        setStructureSource('esmfold');
      }
      
      // Step 2: Create mutant sequence and fold a ~60aa region with ESMFold
      const regionSize = 60;
      const halfRegion = Math.floor(regionSize / 2);
      const regionStart = Math.max(0, position - 1 - halfRegion);
      const regionEnd = Math.min(sequence.length, position - 1 + halfRegion);
      
      const wildTypeRegion = sequence.substring(regionStart, regionEnd);
      const mutantRegion = createMutantSequence(sequence, position, altAA)
        .substring(regionStart, regionEnd);
      
      setProgress(`Folding mutant peptide (${mutantRegion.length}aa) with ESMFold...`);
      
      // Fold both the wild-type region and mutant region for comparison
      const [wildRegionPDB, mutRegionPDB] = await Promise.all([
        foldWithESMFold(wildTypeRegion),
        foldWithESMFold(mutantRegion),
      ]);
      
      setMutantPDB({ wild: wildRegionPDB, mutant: mutRegionPDB, regionStart, position });
      setStatus('ready');
      setProgress('');
      
    } catch (err) {
      setError(err.message);
      setStatus('error');
    }
  }, [uniprotId, sequence, position, altAA]);

  // Auto-load when autoLoad prop is true
  useEffect(() => {
    if (autoLoad && lib3DmolLoaded && status === 'idle' && !autoLoadFired.current) {
      autoLoadFired.current = true;
      loadStructures();
    }
  }, [autoLoad, lib3DmolLoaded, status, loadStructures]);

  // Render 3D viewers when data is ready
  useEffect(() => {
    if (status !== 'ready' || !lib3DmolLoaded || !window.$3Dmol) return;
    
    // Clean up previous viewers
    if (wildViewerRef.current) { wildViewerRef.current.clear(); wildViewerRef.current = null; }
    if (mutViewerRef.current) { mutViewerRef.current.clear(); mutViewerRef.current = null; }
    
    // Small delay to ensure DOM is ready
    const timer = setTimeout(() => {
      if (compact) {
        // Compact mode: only show region comparison stacked
        if (mutantPDB && wildTypeRef.current && mutantRef.current) {
          const regionMutPos = position - mutantPDB.regionStart;
          wildViewerRef.current = initViewer(wildTypeRef.current, mutantPDB.wild, regionMutPos, false, '#44aaff');
          mutViewerRef.current = initViewer(mutantRef.current, mutantPDB.mutant, regionMutPos, true, '#ff4444');
        }
      } else if (mode === 'full' && wildTypePDB && wildTypeRef.current) {
        wildViewerRef.current = initViewer(wildTypeRef.current, wildTypePDB, position, false);
      } else if (mode === 'region' && mutantPDB && wildTypeRef.current && mutantRef.current) {
        const regionMutPos = position - mutantPDB.regionStart;
        wildViewerRef.current = initViewer(wildTypeRef.current, mutantPDB.wild, regionMutPos, false, '#44aaff');
        mutViewerRef.current = initViewer(mutantRef.current, mutantPDB.mutant, regionMutPos, true, '#ff4444');
      }
    }, 100);
    
    return () => clearTimeout(timer);
  }, [status, lib3DmolLoaded, mode, wildTypePDB, mutantPDB, position, compact]);

  // Clean up viewers on unmount
  useEffect(() => {
    return () => {
      if (wildViewerRef.current) { wildViewerRef.current.clear(); }
      if (mutViewerRef.current) { mutViewerRef.current.clear(); }
    };
  }, []);

  // ── COMPACT RENDER (for hero card) ──
  if (compact) {
    return (
      <div className="pv3d-compact">
        <div className="pv3d-compact-label">🧊 3D Shape Comparison</div>
        
        {status === 'idle' && (
          <div className="pv3d-compact-idle">
            <div className="loading-spinner" style={{ width: 16, height: 16, borderWidth: 2 }} />
            <span>Preparing 3D engine...</span>
          </div>
        )}

        {status === 'loading' && (
          <div className="pv3d-compact-loading">
            <div className="loading-spinner" style={{ width: 20, height: 20, borderWidth: 2 }} />
            <div className="pv3d-compact-progress">{progress}</div>
          </div>
        )}

        {status === 'error' && (
          <div className="pv3d-compact-error">
            <span>⚠️ Error loading</span>
            <button className="btn btn-sm btn-ghost" onClick={() => { setStatus('idle'); setError(null); autoLoadFired.current = false; }} style={{ fontSize: '0.7rem', padding: '3px 8px' }}>
              Retry
            </button>
          </div>
        )}

        {status === 'ready' && (
          <div className="pv3d-compact-viewers">
            <div className="pv3d-compact-panel">
              <div className="pv3d-compact-panel-label wt">
                <span className="pv3d-label-dot wt"></span> Healthy
              </div>
              <div className="pv3d-compact-canvas" ref={wildTypeRef} />
            </div>
            <div className="pv3d-compact-panel">
              <div className="pv3d-compact-panel-label mut">
                <span className="pv3d-label-dot mut"></span> Mutant
              </div>
              <div className="pv3d-compact-canvas" ref={mutantRef} />
            </div>
          </div>
        )}

        {status === 'ready' && (
          <div className="pv3d-compact-caption">
            Shape difference at pos {position}
          </div>
        )}
      </div>
    );
  }

  // ── FULL RENDER (standalone viewer) ──
  return (
    <div className="protein-viewer-3d">
      {/* Header */}
      <div className="pv3d-header">
        <div className="pv3d-title">
          <span className="pv3d-icon">🧊</span>
          <span>3D Protein Structure</span>
        </div>
        
        {status === 'idle' && (
          <button className="btn btn-sm pv3d-load-btn" onClick={loadStructures} disabled={!lib3DmolLoaded}>
            {!lib3DmolLoaded ? 'Loading 3D engine...' : `View ${gene} 3D Structure`}
          </button>
        )}
        
        {status === 'ready' && (
          <div className="pv3d-mode-toggle">
            <button 
              className={`pv3d-mode-btn ${mode === 'region' ? 'active' : ''}`}
              onClick={() => setMode('region')}
            >
              Side-by-Side Comparison
            </button>
            <button 
              className={`pv3d-mode-btn ${mode === 'full' ? 'active' : ''}`}
              onClick={() => setMode('full')}
            >
              Full Protein
            </button>
          </div>
        )}
      </div>

      {/* Loading state */}
      {status === 'loading' && (
        <div className="pv3d-loading">
          <div className="loading-spinner" style={{ width: 28, height: 28, borderWidth: 2 }} />
          <div className="pv3d-loading-text">{progress}</div>
          <div className="pv3d-loading-subtext">
            AlphaFold provides the healthy shape · ESMFold predicts the mutant shape
          </div>
        </div>
      )}

      {/* Error state */}
      {status === 'error' && (
        <div className="pv3d-error">
          <span>⚠️ {error}</span>
          <button className="btn btn-sm btn-ghost" onClick={() => { setStatus('idle'); setError(null); }}>
            Retry
          </button>
        </div>
      )}

      {/* 3D Viewers */}
      {status === 'ready' && (
        <div className={`pv3d-viewers ${mode}`}>
          {/* Wild-type viewer */}
          <div className="pv3d-viewer-panel">
            <div className="pv3d-viewer-label pv3d-label-wt">
              <span className="pv3d-label-dot wt"></span>
              {mode === 'full' ? `${gene} — Full Protein (${structureSource === 'alphafold' ? 'AlphaFold' : 'ESMFold'})` : `Wild-Type — ${refAA}${position}`}
            </div>
            <div className="pv3d-canvas" ref={wildTypeRef} />
          </div>
          
          {/* Mutant viewer (only in region mode) */}
          {mode === 'region' && (
            <>
              <div className="pv3d-vs">
                <span>VS</span>
              </div>
              <div className="pv3d-viewer-panel">
                <div className="pv3d-viewer-label pv3d-label-mut">
                  <span className="pv3d-label-dot mut"></span>
                  Mutant — {altAA}{position}
                </div>
                <div className="pv3d-canvas" ref={mutantRef} />
              </div>
            </>
          )}
        </div>
      )}
      
      {/* Caption */}
      {status === 'ready' && (
        <div className="pv3d-caption">
          {mode === 'region' 
            ? `Showing ~60aa region around position ${position}. Wild-type (blue) vs Mutant (red) — both folded with ESMFold. Shape differences reveal how the mutation disrupts protein folding.`
            : `Full-length ${gene} protein ${structureSource === 'alphafold' ? 'from AlphaFold DB' : 'predicted by ESMFold'}. Mutation site at position ${position} highlighted in blue.`
          }
        </div>
      )}
    </div>
  );
}
