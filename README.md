# Neoantigen Predictor Bake-off 🏁

**Benchmarking MHC-I binding & immunogenicity predictors against real clinical ELISPOT data.**

Using [Sid Sijbrandij's](https://sytse.com/cancer/) open-sourced osteosarcoma dataset — one of the most comprehensive, publicly accessible cancer genomics datasets ever released (25TB of multi-omic data) — we validate which computational tools most accurately predict real-world T-cell responses to neoantigen peptides.

## Why This Matters

Personalized cancer vaccines require predicting which mutant peptides will trigger an immune response. Many computational tools exist, but **none have been validated against a single patient's full clinical ELISPOT data in an open, reproducible way**. This project creates that benchmark.

## The Dataset

| Asset | Source | Details |
|---|---|---|
| HLA Alleles | [osteosarc.com](https://osteosarc.com/data/#hla) | 5 functional Class I alleles (A\*01:01, B\*08:01, B\*27:05, C\*01:02, C\*07:01) |
| Vaccine Peptides | [Vaccine Overlap Spreadsheet](https://docs.google.com/spreadsheets/d/17RE_Yyst9LzeNW_F6XcbV_RW3nYNgTuxopSWbGL0ozA/) | 14 neoantigen peptides from DC vaccine trial |
| ELISPOT Results | Same spreadsheet | 12 positive, 1 negative (NR2F2), 1 borderline |
| Raw Sequencing | [gs://osteosarc-genomics](https://osteosarc.com/data/) | 25TB WGS, scRNA-seq, spatial transcriptomics |

## The Bake-off

We run 4 open-source prediction tools on all 14 peptides × 5 HLA alleles and grade them against the ELISPOT answer key:

| Tool | What It Predicts | GPU? |
|---|---|---|
| **BigMHC-EL** | MHC-I presentation likelihood | ✅ |
| **BigMHC-IM** | Immunogenicity score | ✅ |
| **MHCflurry 2.0** | Binding affinity + presentation | ❌ |
| **PRIME 2.0** | TCR-facing immunogenicity | ❌ |

### Scoring Criteria
- **AUROC** — Can the tool distinguish positive from negative?
- **Spearman ρ** — Does the score rank match ELISPOT strength?
- **Precision@K** — Are the top predictions all ELISPOT-positive?
- **STAG2 rank** — Does the only negative peptide rank last?

## Project Structure

```
├── data/
│   ├── raw/
│   │   ├── sid_hla_type.json           # HLA alleles from Red Cross typing
│   │   ├── sid_vaccine_peptides.json   # 14 peptide sequences + ELISPOT results
│   │   └── elispot_ground_truth.json   # Binary ground truth labels
│   └── processed/                      # Generated during pipeline run
│
├── src/
│   ├── 01_prepare_peptides.py          # Extract 8-11mer epitopes from long peptides
│   ├── 02_modal_bakeoff.py             # Run all 4 predictors on Modal (serverless GPU)
│   └── 03_analyze_results.py           # Generate scorecard + visualizations
│
├── results/                            # Output: scorecard, ROC curves, scores matrix
├── requirements.txt
└── README.md
```

## Quick Start

```bash
# Install dependencies
pip install -r requirements.txt

# Step 1: Prepare peptide windows
python src/01_prepare_peptides.py

# Step 2: Run bake-off on Modal (~$2 GPU cost)
modal run src/02_modal_bakeoff.py

# Step 3: Generate scorecard
python src/03_analyze_results.py
```

## Compute

Pipeline runs on [Modal](https://modal.com) for serverless GPU inference. Estimated cost: **~$2** for the full bake-off.

## Acknowledgments

- **Sid Sijbrandij** for open-sourcing his complete cancer genomics dataset at [osteosarc.com](https://osteosarc.com)
- **Karchin Lab** (Johns Hopkins) for [BigMHC](https://github.com/KarchinLab/bigmhc)
- **openvax** for [MHCflurry](https://github.com/openvax/mhcflurry)

## License

MIT
