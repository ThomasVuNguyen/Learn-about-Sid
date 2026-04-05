const BASE_URL = 'https://www.cbioportal.org/api';

async function fetchJSON(endpoint, options = {}) {
  const url = `${BASE_URL}${endpoint}`;
  const res = await fetch(url, {
    headers: { 'Accept': 'application/json', ...options.headers },
    ...options,
  });
  if (!res.ok) throw new Error(`cBioPortal API error: ${res.status} ${res.statusText}`);
  return res.json();
}

// ── Studies ──────────────────────────────────────────────────────────
export async function getStudy(studyId) {
  return fetchJSON(`/studies/${studyId}`);
}

export async function getAllStudies() {
  return fetchJSON('/studies?pageSize=1000');
}

// ── Molecular Profiles ──────────────────────────────────────────────
export async function getMolecularProfiles(studyId) {
  return fetchJSON(`/studies/${studyId}/molecular-profiles`);
}

export async function getMutationProfile(studyId) {
  const profiles = await getMolecularProfiles(studyId);
  return profiles.find(p => p.molecularAlterationType === 'MUTATION_EXTENDED');
}

// ── Mutations ───────────────────────────────────────────────────────
export async function getMutationsByGene(molecularProfileId, sampleListId, entrezGeneId, pageSize = 10000) {
  return fetchJSON(
    `/molecular-profiles/${molecularProfileId}/mutations?sampleListId=${sampleListId}&entrezGeneId=${entrezGeneId}&pageSize=${pageSize}`
  );
}

export async function getMutationsByStudyAndGenes(studyId, geneObjects) {
  const profile = await getMutationProfile(studyId);
  if (!profile) return [];
  
  // Build lookup: entrezGeneId → hugoGeneSymbol
  const geneMap = {};
  geneObjects.forEach(g => {
    geneMap[g.entrezGeneId] = g.hugoGeneSymbol;
  });

  const sampleListId = `${studyId}_all`;
  const results = await Promise.all(
    geneObjects.map(g =>
      getMutationsByGene(profile.molecularProfileId, sampleListId, g.entrezGeneId)
        .catch(() => [])
    )
  );

  // Enrich each mutation with the gene symbol
  return results.flat().map(m => ({
    ...m,
    gene: { hugoGeneSymbol: geneMap[m.entrezGeneId] || m.gene?.hugoGeneSymbol || 'Unknown' },
  }));
}

export async function getAllMutationsForStudy(studyId, geneIds) {
  return getMutationsByStudyAndGenes(studyId, geneIds);
}

export async function fetchMutationsForPatient(studyId, patientId) {
  const profile = await getMutationProfile(studyId);
  if (!profile) return [];
  return fetchJSON(
    `/molecular-profiles/${profile.molecularProfileId}/mutations?sampleListId=${studyId}_all&pageSize=10000`
  ).then(mutations => mutations.filter(m => m.patientId === patientId));
}

// ── Genes ───────────────────────────────────────────────────────────
export async function searchGenes(keyword) {
  return fetchJSON(`/genes?keyword=${encodeURIComponent(keyword)}&pageSize=20`);
}

export async function getGene(geneId) {
  return fetchJSON(`/genes/${geneId}`);
}

// ── Sample Lists ────────────────────────────────────────────────────
export async function getSampleLists(studyId) {
  return fetchJSON(`/studies/${studyId}/sample-lists`);
}

// ── Common cancer gene IDs ──────────────────────────────────────────
// Top cancer driver genes with their Entrez IDs
export const CANCER_DRIVER_GENES = [
  { entrezGeneId: 673, hugoGeneSymbol: 'BRAF', description: 'Serine/threonine kinase' },
  { entrezGeneId: 7157, hugoGeneSymbol: 'TP53', description: 'Tumor suppressor' },
  { entrezGeneId: 3845, hugoGeneSymbol: 'KRAS', description: 'GTPase signaling' },
  { entrezGeneId: 5728, hugoGeneSymbol: 'PTEN', description: 'Tumor suppressor phosphatase' },
  { entrezGeneId: 4893, hugoGeneSymbol: 'NRAS', description: 'GTPase signaling' },
  { entrezGeneId: 1956, hugoGeneSymbol: 'EGFR', description: 'Receptor tyrosine kinase' },
  { entrezGeneId: 5290, hugoGeneSymbol: 'PIK3CA', description: 'PI3-kinase catalytic subunit' },
  { entrezGeneId: 238, hugoGeneSymbol: 'ALK', description: 'Anaplastic lymphoma kinase' },
  { entrezGeneId: 4921, hugoGeneSymbol: 'DDR2', description: 'Discoidin domain receptor' },
  { entrezGeneId: 2064, hugoGeneSymbol: 'ERBB2', description: 'HER2 receptor' },
  { entrezGeneId: 3417, hugoGeneSymbol: 'IDH1', description: 'Isocitrate dehydrogenase' },
  { entrezGeneId: 3418, hugoGeneSymbol: 'IDH2', description: 'Isocitrate dehydrogenase 2' },
  { entrezGeneId: 25960, hugoGeneSymbol: 'ARID1A', description: 'Chromatin remodeling' },
  { entrezGeneId: 672, hugoGeneSymbol: 'BRCA1', description: 'DNA repair' },
  { entrezGeneId: 675, hugoGeneSymbol: 'BRCA2', description: 'DNA repair' },
  { entrezGeneId: 4763, hugoGeneSymbol: 'NF1', description: 'Neurofibromin, RAS regulation' },
  { entrezGeneId: 7428, hugoGeneSymbol: 'VHL', description: 'Von Hippel-Lindau suppressor' },
  { entrezGeneId: 999, hugoGeneSymbol: 'CDH1', description: 'E-cadherin, cell adhesion' },
  { entrezGeneId: 1029, hugoGeneSymbol: 'CDKN2A', description: 'Cell cycle regulator p16' },
  { entrezGeneId: 324, hugoGeneSymbol: 'APC', description: 'WNT pathway regulator' },
];

// ── Curated major TCGA studies ──────────────────────────────────────
export const MAJOR_STUDIES = [
  { studyId: 'skcm_tcga', name: 'Melanoma', cancerType: 'Skin', icon: '🔬', color: '#1a1a2e' },
  { studyId: 'luad_tcga', name: 'Lung Adenocarcinoma', cancerType: 'Lung', icon: '🫁', color: '#16213e' },
  { studyId: 'brca_tcga', name: 'Breast Cancer', cancerType: 'Breast', icon: '🎗️', color: '#1a1a2e' },
  { studyId: 'coadread_tcga', name: 'Colorectal Cancer', cancerType: 'Bowel', icon: '🧬', color: '#0f3460' },
  { studyId: 'ucec_tcga', name: 'Uterine Cancer', cancerType: 'Uterine', icon: '🔬', color: '#1a1a2e' },
  { studyId: 'lusc_tcga', name: 'Lung Squamous Cell', cancerType: 'Lung', icon: '🫁', color: '#16213e' },
  { studyId: 'hnsc_tcga', name: 'Head & Neck Cancer', cancerType: 'Head/Neck', icon: '🧠', color: '#0f3460' },
  { studyId: 'blca_tcga', name: 'Bladder Cancer', cancerType: 'Bladder', icon: '🔬', color: '#1a1a2e' },
  { studyId: 'stad_tcga', name: 'Stomach Cancer', cancerType: 'Stomach', icon: '🔬', color: '#16213e' },
  { studyId: 'lgg_tcga', name: 'Brain Lower Grade Glioma', cancerType: 'Brain', icon: '🧠', color: '#0f3460' },
  { studyId: 'prad_tcga', name: 'Prostate Cancer', cancerType: 'Prostate', icon: '🔬', color: '#1a1a2e' },
  { studyId: 'kirc_tcga', name: 'Kidney Clear Cell', cancerType: 'Kidney', icon: '🔬', color: '#16213e' },
  { studyId: 'ov_tcga', name: 'Ovarian Cancer', cancerType: 'Ovarian', icon: '🔬', color: '#0f3460' },
  { studyId: 'paad_tcga', name: 'Pancreatic Cancer', cancerType: 'Pancreas', icon: '🔬', color: '#1a1a2e' },
  { studyId: 'gbm_tcga', name: 'Glioblastoma', cancerType: 'Brain', icon: '🧠', color: '#16213e' },
];
