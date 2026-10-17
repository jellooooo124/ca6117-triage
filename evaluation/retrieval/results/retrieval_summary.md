# CA6117 RAG Retrieval Evaluation

**Method:** 10 source-verified queries with manually frozen relevant chunk labels; hybrid retrieval evaluated at k=3.

**Macro Precision@3:** 0.367
**Macro Recall@3:** 0.650
**Hit Rate@3:** 0.900
**MRR@3:** 0.733

These metrics measure retrieval behaviour against the frozen prototype corpus. They do not measure clinical accuracy or safety.

| Query | Domain | P@3 | R@3 | Hit@3 | MRR@3 | Retrieved chunks |
|---|---|---:|---:|---:|---:|---|
| HF-Q1 | HF | 0.667 | 0.667 | 1 | 0.500 | hf_p44_c1, hf_p22_c3, hf_p43_c1 |
| HF-Q2 | HF | 0.000 | 0.000 | 0 | 0.000 | hf_p15_c1, hf_p42_c6, hf_p16_c5 |
| HF-Q3 | HF | 0.333 | 1.000 | 1 | 1.000 | hf_p71_c1, hf_p72_c2, hf_p71_c3 |
| HF-Q4 | HF | 0.333 | 1.000 | 1 | 0.333 | hf_p21_c4, hf_p9_c1, hf_p72_c3 |
| HF-Q5 | HF | 0.333 | 0.333 | 1 | 1.000 | hf_p71_c3, hf_p69_c2, hf_p6_c3 |
| GLY-Q1 | GLY | 0.333 | 1.000 | 1 | 1.000 | gly_p27_c1, gly_p17_c1, gly_p14_c1 |
| GLY-Q2 | GLY | 0.667 | 0.667 | 1 | 1.000 | gly_p19_c2, gly_p12_c1, gly_p20_c1 |
| GLY-Q3 | GLY | 0.333 | 1.000 | 1 | 1.000 | gly_p18_c1, gly_p12_c1, gly_p12_c2 |
| GLY-Q4 | GLY | 0.333 | 0.500 | 1 | 1.000 | gly_p14_c1, gly_p16_c1, gly_p9_c2 |
| GLY-Q5 | GLY | 0.333 | 0.333 | 1 | 0.500 | gly_p8_c1, gly_p27_c1, gly_p29_c1 |
