# CA6117 Retrieval Evaluation and Ablation Summary

## Evaluation setup

A manually source-verified 10-query benchmark was frozen before metric computation. Five queries covered Heart Failure guideline retrieval and five covered Type 2 Diabetes guideline retrieval. Retrieval was evaluated at k=3.

The production prototype uses dense retrieval with normalized sentence embeddings and FAISS inner-product search, BM25 lexical retrieval, Reciprocal Rank Fusion (RRF), candidate_k=15, rrf_k=60, and equal dense/BM25 contribution. The gold relevance set was not modified after observing retrieval scores.

## Baseline retrieval performance

| Metric | Overall | Heart Failure | Glycemic |
|---|---:|---:|---:|
| Macro Precision@3 | 0.367 | 0.333 | 0.400 |
| Macro Recall@3 | 0.650 | 0.600 | 0.700 |
| Hit Rate@3 | 0.900 | 0.800 | 1.000 |
| MRR@3 | 0.733 | 0.567 | 0.900 |

Nine of ten queries retrieved at least one manually labelled relevant chunk within the top three results. The principal failure case was HF-Q2, a worsening-heart-failure query. Relevant chunks were strongly ranked by BM25 but did not receive sufficient combined RRF support to enter the final top three.

## Candidate-depth sensitivity analysis

Increasing candidate_k from 15 to 25, 35, 50, or 80 did not recover HF-Q2. Larger candidate pools reduced overall performance. candidate_k=15 was retained.

| candidate_k | Precision@3 | Recall@3 | Hit Rate@3 | MRR@3 |
|---:|---:|---:|---:|---:|
| 15 | 0.367 | 0.650 | 0.900 | 0.733 |
| 25 | 0.333 | 0.550 | 0.800 | 0.700 |
| 35 | 0.333 | 0.550 | 0.800 | 0.700 |
| 50 | 0.333 | 0.550 | 0.800 | 0.700 |
| 80 | 0.333 | 0.550 | 0.800 | 0.700 |

## Weighted-RRF exploratory ablation

| Dense weight | BM25 weight | Precision@3 | Recall@3 | Hit Rate@3 | MRR@3 |
|---:|---:|---:|---:|---:|---:|
| 1.00 | 0.00 | 0.267 | 0.417 | 0.700 | 0.583 |
| 0.50 | 0.50 | 0.367 | 0.650 | 0.900 | 0.733 |
| 0.35 | 0.65 | 0.367 | 0.650 | 0.900 | 0.733 |
| 0.10 | 0.90 | 0.367 | 0.650 | 0.900 | 0.783 |
| 0.00 | 1.00 | 0.367 | 0.667 | 0.800 | 0.800 |

A BM25-heavy setting recovered HF-Q2 but introduced regressions elsewhere. The production equal-weight RRF configuration was retained to avoid tuning directly to the same small benchmark.

## Interpretation and limitations

This evaluation measures retrieval behaviour against a manually labelled, prototype-specific corpus. It does not establish clinical accuracy, clinical efficacy, guideline completeness, or real-world safety. Precision@3 should be interpreted together with Recall@3 and Hit Rate@3 because several queries contain only one gold-relevant chunk, making 1/3 the maximum possible Precision@3 when that sole relevant chunk is retrieved.
