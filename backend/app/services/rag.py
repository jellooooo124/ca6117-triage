
import json
import re
from pathlib import Path

import faiss
import numpy as np

from rank_bm25 import BM25Okapi
from sentence_transformers import SentenceTransformer


DEFAULT_EMBEDDING_MODEL = (
    "sentence-transformers/all-MiniLM-L6-v2"
)


class HybridGuidelineRetriever:

    def __init__(
        self,
        chunks_path,
        embeddings_path,
        index_path,
        model_name=DEFAULT_EMBEDDING_MODEL
    ):
        self.chunks_path = Path(chunks_path)
        self.embeddings_path = Path(embeddings_path)
        self.index_path = Path(index_path)

        self.model_name = model_name

        # -----------------------------
        # Load chunks
        # -----------------------------

        with open(
            self.chunks_path,
            "r",
            encoding="utf-8"
        ) as f:
            self.chunks = json.load(f)

        # -----------------------------
        # Load embedding model
        # -----------------------------

        self.embedding_model = (
            SentenceTransformer(
                self.model_name
            )
        )

        # -----------------------------
        # Load saved vectors + FAISS
        # -----------------------------

        self.embeddings = np.load(
            self.embeddings_path
        ).astype("float32")

        self.index = faiss.read_index(
            str(self.index_path)
        )

        # -----------------------------
        # Rebuild BM25 locally
        # -----------------------------

        tokenized_corpus = [
            self._tokenize(
                chunk["text"]
            )
            for chunk in self.chunks
        ]

        self.bm25 = BM25Okapi(
            tokenized_corpus
        )

    @staticmethod
    def _tokenize(text):
        return re.findall(
            r"[a-z0-9]+",
            text.lower()
        )

    def dense_search(
        self,
        query,
        top_k=10
    ):
        query_vector = (
            self.embedding_model.encode(
                [query],
                convert_to_numpy=True,
                normalize_embeddings=True
            )
            .astype("float32")
        )

        scores, indices = (
            self.index.search(
                query_vector,
                min(
                    top_k,
                    len(self.chunks)
                )
            )
        )

        results = []

        for rank, (idx, score) in enumerate(
            zip(
                indices[0],
                scores[0]
            ),
            start=1
        ):
            if idx < 0:
                continue

            results.append({
                **self.chunks[int(idx)],
                "dense_rank": rank,
                "dense_score": float(score)
            })

        return results

    def bm25_search(
        self,
        query,
        top_k=10
    ):
        tokens = self._tokenize(
            query
        )

        scores = self.bm25.get_scores(
            tokens
        )

        indices = np.argsort(
            scores
        )[::-1][:top_k]

        results = []

        for rank, idx in enumerate(
            indices,
            start=1
        ):
            results.append({
                **self.chunks[int(idx)],
                "bm25_rank": rank,
                "bm25_score":
                    float(scores[idx])
            })

        return results

    def hybrid_search(
        self,
        query,
        top_k=3,
        candidate_k=15,
        rrf_k=60
    ):
        dense_results = self.dense_search(
            query,
            top_k=candidate_k
        )

        bm25_results = self.bm25_search(
            query,
            top_k=candidate_k
        )

        fused = {}

        # -----------------------------
        # Dense contribution
        # -----------------------------

        for item in dense_results:
            chunk_id = item["chunk_id"]

            fused.setdefault(
                chunk_id,
                {
                    **item,
                    "rrf_score": 0.0
                }
            )

            fused[
                chunk_id
            ]["dense_rank"] = (
                item["dense_rank"]
            )

            fused[
                chunk_id
            ]["rrf_score"] += (
                1.0
                / (
                    rrf_k
                    + item["dense_rank"]
                )
            )

        # -----------------------------
        # BM25 contribution
        # -----------------------------

        for item in bm25_results:
            chunk_id = item["chunk_id"]

            fused.setdefault(
                chunk_id,
                {
                    **item,
                    "rrf_score": 0.0
                }
            )

            fused[
                chunk_id
            ]["bm25_rank"] = (
                item["bm25_rank"]
            )

            fused[
                chunk_id
            ]["bm25_score"] = (
                item["bm25_score"]
            )

            fused[
                chunk_id
            ]["rrf_score"] += (
                1.0
                / (
                    rrf_k
                    + item["bm25_rank"]
                )
            )

        ranked = sorted(
            fused.values(),
            key=lambda x:
                x["rrf_score"],
            reverse=True
        )

        return ranked[:top_k]
