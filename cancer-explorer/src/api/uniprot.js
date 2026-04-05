// ── UniProt API: Fetch protein sequences by gene name ─────────────────
const UNIPROT_BASE = 'https://rest.uniprot.org/uniprotkb';

// Cache to avoid re-fetching the same gene
const sequenceCache = {};

/**
 * Fetch the canonical human protein sequence for a given gene symbol.
 * Returns { sequence, uniprotId, proteinName, length }
 */
export async function getProteinSequence(geneSymbol) {
  if (!geneSymbol || geneSymbol === 'Unknown') return null;
  
  // Check cache first
  if (sequenceCache[geneSymbol]) return sequenceCache[geneSymbol];

  try {
    // Search for reviewed human entries (Swiss-Prot) for this gene
    const query = encodeURIComponent(`gene_exact:${geneSymbol} AND organism_id:9606 AND reviewed:true`);
    const res = await fetch(
      `${UNIPROT_BASE}/search?query=${query}&format=json&size=1&fields=accession,protein_name,sequence,gene_names`
    );
    
    if (!res.ok) return null;
    const data = await res.json();
    
    if (!data.results || data.results.length === 0) return null;
    
    const entry = data.results[0];
    const result = {
      sequence: entry.sequence?.value || '',
      uniprotId: entry.primaryAccession || '',
      proteinName: entry.proteinDescription?.recommendedName?.fullName?.value || geneSymbol,
      length: entry.sequence?.length || 0,
    };
    
    sequenceCache[geneSymbol] = result;
    return result;
  } catch (err) {
    console.warn(`UniProt fetch failed for ${geneSymbol}:`, err);
    return null;
  }
}

/**
 * Parse a protein change string like "V600E" into its components.
 * Returns { refAA, position, altAA } or null if unparseable.
 */
export function parseProteinChange(proteinChange) {
  if (!proteinChange) return null;
  
  // Strip "p." prefix if present
  let clean = proteinChange.replace(/^p\./, '');

  // Match patterns like V600E, R248W, etc. (single letter AA codes)
  const singleMatch = clean.match(/^([A-Z])(\d+)([A-Z*])$/);
  if (singleMatch) {
    return {
      refAA: singleMatch[1],
      position: parseInt(singleMatch[2], 10),
      altAA: singleMatch[3] === '*' ? 'Stop' : singleMatch[3],
    };
  }
  
  // Match 3-letter codes like Val600Glu
  const THREE_TO_ONE = {
    'Ala': 'A', 'Arg': 'R', 'Asn': 'N', 'Asp': 'D', 'Cys': 'C',
    'Glu': 'E', 'Gln': 'Q', 'Gly': 'G', 'His': 'H', 'Ile': 'I',
    'Leu': 'L', 'Lys': 'K', 'Met': 'M', 'Phe': 'F', 'Pro': 'P',
    'Ser': 'S', 'Thr': 'T', 'Trp': 'W', 'Tyr': 'Y', 'Val': 'V',
    'Ter': '*',
  };

  const threeMatch = clean.match(/^([A-Z][a-z]{2})(\d+)([A-Z][a-z]{2}|Ter)$/);
  if (threeMatch) {
    const refAA = THREE_TO_ONE[threeMatch[1]] || threeMatch[1];
    const altAA = THREE_TO_ONE[threeMatch[3]] || threeMatch[3];
    return {
      refAA,
      position: parseInt(threeMatch[2], 10),
      altAA: altAA === '*' ? 'Stop' : altAA,
    };
  }
  
  return null;
}

// Amino acid one-letter to full name
const AA_NAMES = {
  'A': 'Alanine', 'R': 'Arginine', 'N': 'Asparagine', 'D': 'Aspartate',
  'C': 'Cysteine', 'E': 'Glutamate', 'Q': 'Glutamine', 'G': 'Glycine',
  'H': 'Histidine', 'I': 'Isoleucine', 'L': 'Leucine', 'K': 'Lysine',
  'M': 'Methionine', 'F': 'Phenylalanine', 'P': 'Proline', 'S': 'Serine',
  'T': 'Threonine', 'W': 'Tryptophan', 'Y': 'Tyrosine', 'V': 'Valine',
  'Stop': 'Stop codon',
};

export function getAAName(code) {
  return AA_NAMES[code] || code;
}

/**
 * Extract a peptide window around a mutation position from a protein sequence.
 * Returns { wildtype, mutant, windowStart, windowEnd, fullPosition } for vaccine design.
 */
export function extractPeptideWindow(sequence, position, refAA, altAA, windowSize = 9) {
  if (!sequence || !position) return null;
  
  const idx = position - 1; // Convert 1-based to 0-based
  if (idx < 0 || idx >= sequence.length) return null;
  
  // Verify the reference AA matches (basic sanity check)
  const actualAA = sequence[idx];
  const refMatch = actualAA === refAA;
  
  // Calculate window: center the mutation in a window of windowSize
  const halfWindow = Math.floor(windowSize / 2);
  const start = Math.max(0, idx - halfWindow);
  const end = Math.min(sequence.length, idx + halfWindow + 1);
  
  const wildtype = sequence.slice(start, end);
  
  // Build mutant peptide
  const mutIdx = idx - start;
  const mutant = altAA === 'Stop' 
    ? wildtype.slice(0, mutIdx) + '*'
    : wildtype.slice(0, mutIdx) + altAA + wildtype.slice(mutIdx + 1);
  
  return {
    wildtype,
    mutant,
    windowStart: start + 1, // Back to 1-based
    windowEnd: end,
    mutationIndex: mutIdx, // Position of mutation within the window
    refMatch,
    refAA: actualAA,
  };
}
