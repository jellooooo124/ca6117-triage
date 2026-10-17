from __future__ import annotations

from pathlib import Path
import csv
import json
import sys

PROJECT_ROOT = Path(__file__).resolve().parents[2]
BACKEND_ROOT = PROJECT_ROOT / "backend"
sys.path.insert(0, str(BACKEND_ROOT))
from app.services.resources import load_retrievers

HERE = Path(__file__).resolve().parent
GOLD_PATH = HERE / "retrieval_gold_v1.json"
RESULTS_DIR = HERE / "results"
RESULTS_DIR.mkdir(parents=True, exist_ok=True)

def mean(values):
    return sum(values) / len(values) if values else 0.0

gold = json.loads(GOLD_PATH.read_text(encoding="utf-8"))
top_k = int(gold["top_k"])
queries = gold["queries"]
query_ids = [item["query_id"] for item in queries]
if len(query_ids) != len(set(query_ids)):
    raise RuntimeError("Duplicate query IDs in gold set.")

hf_retriever, gly_retriever = load_retrievers()
hf_ids = {str(item.get("chunk_id")) for item in hf_retriever.chunks}
gly_ids = {str(item.get("chunk_id")) for item in gly_retriever.chunks}
for case in queries:
    corpus_ids = hf_ids if case["domain"] == "HF" else gly_ids
    missing = set(case["gold_chunk_ids"]) - corpus_ids
    if missing:
        raise RuntimeError(f"{case['query_id']} gold chunks missing from corpus: {sorted(missing)}")

print("=" * 96)
print("CA6117 RAG RETRIEVAL EVALUATION")
print("=" * 96)
print("Gold version:", gold["version"])
print("Gold status:", gold["status"])
print("Queries:", len(queries))
print("Top-k:", top_k)
print("Gemini API calls: 0")
print()

results = []
for case in queries:
    retriever = hf_retriever if case["domain"] == "HF" else gly_retriever
    retrieved = retriever.hybrid_search(query=case["query"], top_k=top_k)
    retrieved_ids = [str(item.get("chunk_id")) for item in retrieved]
    gold_ids = set(case["gold_chunk_ids"])
    relevant_flags = [chunk_id in gold_ids for chunk_id in retrieved_ids]
    relevant_count = sum(relevant_flags)
    precision_at_3 = relevant_count / top_k
    recall_at_3 = relevant_count / len(gold_ids)
    hit_at_3 = 1.0 if relevant_count > 0 else 0.0
    reciprocal_rank = 0.0
    for rank, is_relevant in enumerate(relevant_flags, start=1):
        if is_relevant:
            reciprocal_rank = 1.0 / rank
            break
    row = {
        "query_id": case["query_id"], "domain": case["domain"], "concept": case["concept"], "query": case["query"],
        "gold_chunk_ids": case["gold_chunk_ids"], "retrieved_chunk_ids": retrieved_ids, "relevant_at_3": relevant_count,
        "precision_at_3": round(precision_at_3,4), "recall_at_3": round(recall_at_3,4), "hit_at_3": hit_at_3, "mrr_at_3": round(reciprocal_rank,4)
    }
    results.append(row)
    print(f"{case['query_id']:<7} P@3={precision_at_3:.3f}  R@3={recall_at_3:.3f}  Hit@3={int(hit_at_3)}  MRR@3={reciprocal_rank:.3f}")
    print("  gold:     ", case["gold_chunk_ids"])
    print("  retrieved:", retrieved_ids)

def summarize(subset):
    return {
        "queries": len(subset),
        "precision_at_3": round(mean([x["precision_at_3"] for x in subset]),4),
        "recall_at_3": round(mean([x["recall_at_3"] for x in subset]),4),
        "hit_rate_at_3": round(mean([x["hit_at_3"] for x in subset]),4),
        "mrr_at_3": round(mean([x["mrr_at_3"] for x in subset]),4),
    }

hf_results=[x for x in results if x["domain"]=="HF"]
gly_results=[x for x in results if x["domain"]=="GLY"]
summary={"gold_version":gold["version"],"gold_status":gold["status"],"top_k":top_k,"gemini_api_calls":0,"overall":summarize(results),"heart_failure":summarize(hf_results),"glycemic":summarize(gly_results),"results":results}
json_path=RESULTS_DIR/"retrieval_summary.json"
json_path.write_text(json.dumps(summary,indent=2,ensure_ascii=False)+'\n',encoding='utf-8')
csv_path=RESULTS_DIR/"retrieval_results.csv"
fieldnames=["query_id","domain","concept","query","gold_chunk_ids","retrieved_chunk_ids","relevant_at_3","precision_at_3","recall_at_3","hit_at_3","mrr_at_3"]
with csv_path.open('w',encoding='utf-8',newline='') as h:
    w=csv.DictWriter(h,fieldnames=fieldnames); w.writeheader()
    for item in results:
        row=dict(item); row['gold_chunk_ids']=';'.join(row['gold_chunk_ids']); row['retrieved_chunk_ids']=';'.join(row['retrieved_chunk_ids']); w.writerow(row)
md_path=RESULTS_DIR/"retrieval_summary.md"
o=summary['overall']
lines=["# CA6117 RAG Retrieval Evaluation","", "**Method:** 10 source-verified queries with manually frozen relevant chunk labels; hybrid retrieval evaluated at k=3.","",f"**Macro Precision@3:** {o['precision_at_3']:.3f}",f"**Macro Recall@3:** {o['recall_at_3']:.3f}",f"**Hit Rate@3:** {o['hit_rate_at_3']:.3f}",f"**MRR@3:** {o['mrr_at_3']:.3f}","","These metrics measure retrieval behaviour against the frozen prototype corpus. They do not measure clinical accuracy or safety.","","| Query | Domain | P@3 | R@3 | Hit@3 | MRR@3 | Retrieved chunks |","|---|---|---:|---:|---:|---:|---|"]
for item in results:
    lines.append(f"| {item['query_id']} | {item['domain']} | {item['precision_at_3']:.3f} | {item['recall_at_3']:.3f} | {int(item['hit_at_3'])} | {item['mrr_at_3']:.3f} | {', '.join(item['retrieved_chunk_ids'])} |")
md_path.write_text('\n'.join(lines)+'\n',encoding='utf-8')
print()
print("="*96)
print("RETRIEVAL EVALUATION SUMMARY")
print("="*96)
print("Overall:")
print("  Macro Precision@3:",o['precision_at_3'])
print("  Macro Recall@3:",o['recall_at_3'])
print("  Hit Rate@3:",o['hit_rate_at_3'])
print("  MRR@3:",o['mrr_at_3'])
print("Heart Failure:",summary['heart_failure'])
print("Glycemic:",summary['glycemic'])
print("Gemini calls: 0")
