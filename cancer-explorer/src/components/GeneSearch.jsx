import { useState } from 'react';
import { CANCER_DRIVER_GENES, searchGenes } from '../api/cbioportal';

export default function GeneSearch({ selectedGenes, onToggleGene, onAddCustomGene }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);

  async function handleSearch() {
    if (!searchTerm.trim()) return;
    setSearching(true);
    try {
      const results = await searchGenes(searchTerm);
      setSearchResults(results.slice(0, 10));
    } catch {
      setSearchResults([]);
    }
    setSearching(false);
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter') handleSearch();
  }

  return (
    <div>
      <div className="gene-search-container">
        <input
          className="input"
          style={{ maxWidth: 300 }}
          placeholder="Search for a gene (e.g. EGFR, MYC)..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          onKeyDown={handleKeyDown}
          id="gene-search-input"
        />
        <button className="btn btn-primary btn-sm" onClick={handleSearch} disabled={searching}>
          {searching ? 'Searching...' : 'Search'}
        </button>
      </div>

      {searchResults.length > 0 && (
        <div className="card" style={{ marginBottom: 20, padding: 16 }}>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 8 }}>
            Search results — click to add
          </div>
          <div className="gene-chips">
            {searchResults.map((gene) => {
              const isSelected = selectedGenes.some(g => g.entrezGeneId === gene.entrezGeneId);
              return (
                <button
                  key={gene.entrezGeneId}
                  className={`gene-chip ${isSelected ? 'selected' : ''}`}
                  onClick={() => onAddCustomGene(gene)}
                >
                  {gene.hugoGeneSymbol}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 8 }}>
        Common cancer driver genes — click to toggle
      </div>
      <div className="gene-chips">
        {CANCER_DRIVER_GENES.map((gene) => {
          const isSelected = selectedGenes.some(g => g.entrezGeneId === gene.entrezGeneId);
          return (
            <button
              key={gene.entrezGeneId}
              className={`gene-chip ${isSelected ? 'selected' : ''}`}
              onClick={() => onToggleGene(gene)}
              title={gene.description}
            >
              {gene.hugoGeneSymbol}
            </button>
          );
        })}
      </div>
    </div>
  );
}
