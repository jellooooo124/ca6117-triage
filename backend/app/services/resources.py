
from pathlib import Path

from app.services.rag import (
    HybridGuidelineRetriever
)


ASSET_ROOT = Path(str(Path(__file__).resolve().parents[3] / "assets"))


hf_retriever = None
gly_retriever = None


def load_retrievers():

    global hf_retriever
    global gly_retriever

    if hf_retriever is None:

        hf_retriever = (
            HybridGuidelineRetriever(
                chunks_path=(
                    ASSET_ROOT
                    / "hf_chunks_clean.json"
                ),
                embeddings_path=(
                    ASSET_ROOT
                    / "hf_embeddings_clean.npy"
                ),
                index_path=(
                    ASSET_ROOT
                    / "hf_index_clean.faiss"
                )
            )
        )

    if gly_retriever is None:

        gly_retriever = (
            HybridGuidelineRetriever(
                chunks_path=(
                    ASSET_ROOT
                    / "gly_chunks_clean.json"
                ),
                embeddings_path=(
                    ASSET_ROOT
                    / "gly_embeddings_clean.npy"
                ),
                index_path=(
                    ASSET_ROOT
                    / "gly_index_clean.faiss"
                )
            )
        )

    return (
        hf_retriever,
        gly_retriever
    )
