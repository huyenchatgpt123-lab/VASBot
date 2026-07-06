import os
import re
import json
import math
import logging
import numpy as np
import faiss
from collections import Counter
from openai import OpenAI, AuthenticationError, APIConnectionError
from typing import List, Dict, Any, Optional

from app.config import settings

logger = logging.getLogger(__name__)

EMBEDDING_COST_PER_1M = 0.13  # text-embedding-3-large
CHAT_INPUT_COST_PER_1M = 2.00  # gpt-4.1
CHAT_OUTPUT_COST_PER_1M = 8.00  # gpt-4.1


class BM25:
    """Simple BM25 implementation for keyword search."""

    def __init__(self, k1: float = 1.5, b: float = 0.75):
        self.k1 = k1
        self.b = b
        self.doc_lengths: List[int] = []
        self.avg_dl: float = 0
        self.doc_freqs: Dict[str, int] = {}
        self.term_freqs: List[Dict[str, int]] = []
        self.n_docs: int = 0

    def _tokenize(self, text: str) -> List[str]:
        return re.findall(r'\w+', text.lower())

    def fit(self, documents: List[str]):
        self.n_docs = len(documents)
        self.doc_lengths = []
        self.term_freqs = []
        self.doc_freqs = {}

        for doc in documents:
            tokens = self._tokenize(doc)
            self.doc_lengths.append(len(tokens))
            tf = Counter(tokens)
            self.term_freqs.append(tf)
            for token in set(tokens):
                self.doc_freqs[token] = self.doc_freqs.get(token, 0) + 1

        self.avg_dl = sum(self.doc_lengths) / self.n_docs if self.n_docs > 0 else 1

    def score(self, query: str) -> List[float]:
        query_tokens = self._tokenize(query)
        scores = [0.0] * self.n_docs

        for token in query_tokens:
            if token not in self.doc_freqs:
                continue
            df = self.doc_freqs[token]
            idf = math.log((self.n_docs - df + 0.5) / (df + 0.5) + 1)

            for i in range(self.n_docs):
                tf = self.term_freqs[i].get(token, 0)
                dl = self.doc_lengths[i]
                numerator = tf * (self.k1 + 1)
                denominator = tf + self.k1 * (1 - self.b + self.b * dl / self.avg_dl)
                scores[i] += idf * numerator / denominator

        return scores


class FAISSService:
    def __init__(self):
        self.faiss_dir = settings.FAISS_DIR
        self.index_path = os.path.join(self.faiss_dir, "index.faiss")
        self.chunks_path = os.path.join(self.faiss_dir, "chunks.json")
        self.dimension = settings.EMBEDDING_DIMENSION

        if not settings.OPENAI_API_KEY or settings.OPENAI_API_KEY.startswith("sk-your"):
            logger.warning("OPENAI_API_KEY chưa được cấu hình!")
            self.client = None
        else:
            self.client = OpenAI(api_key=settings.OPENAI_API_KEY)

        self._index: Optional[faiss.IndexFlatIP] = None
        self._chunks: List[Dict[str, Any]] = []
        self._bm25: Optional[BM25] = None
        self._load()

    def _load(self):
        os.makedirs(self.faiss_dir, exist_ok=True)
        if os.path.exists(self.index_path) and os.path.exists(self.chunks_path):
            self._index = faiss.read_index(self.index_path)
            with open(self.chunks_path, "r", encoding="utf-8") as f:
                self._chunks = json.load(f)
            self._build_bm25()
        else:
            self._index = faiss.IndexFlatIP(self.dimension)
            self._chunks = []

    def _build_bm25(self):
        if self._chunks:
            documents = [c["content"] for c in self._chunks]
            self._bm25 = BM25()
            self._bm25.fit(documents)
        else:
            self._bm25 = None

    def _save(self):
        os.makedirs(self.faiss_dir, exist_ok=True)
        faiss.write_index(self._index, self.index_path)
        with open(self.chunks_path, "w", encoding="utf-8") as f:
            json.dump(self._chunks, f, ensure_ascii=False, indent=2)

    def _get_embeddings(self, texts: List[str]) -> np.ndarray:
        if self.client is None:
            raise RuntimeError(
                "OPENAI_API_KEY chưa được cấu hình. "
                "Vui lòng thêm key vào file .env và restart backend."
            )

        response = self.client.embeddings.create(
            model=settings.EMBEDDING_MODEL,
            input=texts,
        )
        embeddings = [item.embedding for item in response.data]
        vectors = np.array(embeddings, dtype=np.float32)
        faiss.normalize_L2(vectors)
        return vectors

    def add_chunks(self, chunks: List[Dict[str, Any]], document_names: Dict[int, str]) -> dict:
        if not chunks:
            return {"tokens": 0, "cost": 0.0}

        texts = [c["content"] for c in chunks]
        vectors = self._get_embeddings(texts)
        tokens = sum(len(t.split()) * 1.3 for t in texts)
        cost = (tokens / 1_000_000) * EMBEDDING_COST_PER_1M

        for chunk in chunks:
            chunk_entry = {
                "document_id": chunk["document_id"],
                "content": chunk["content"],
                "page_number": chunk["page_number"],
                "document_name": document_names.get(chunk["document_id"], "Unknown"),
            }
            self._chunks.append(chunk_entry)

        self._index.add(vectors)
        self._build_bm25()
        self._save()
        return {"tokens": int(tokens), "cost": cost}

    def search(self, query: str, top_k: int = 5) -> List[Dict[str, Any]]:
        """Semantic search only (FAISS)."""
        if self._index.ntotal == 0:
            return []

        fetch_k = min(top_k * 3, self._index.ntotal)
        query_vector = self._get_embeddings([query])
        scores, indices = self._index.search(query_vector, fetch_k)

        results = []
        MIN_SCORE = 0.30

        for score, idx in zip(scores[0], indices[0]):
            if idx == -1 or idx >= len(self._chunks):
                continue
            if float(score) < MIN_SCORE:
                continue

            chunk = self._chunks[idx]
            results.append({
                "document_name": chunk["document_name"],
                "page_number": chunk["page_number"],
                "content": chunk["content"],
                "document_id": chunk["document_id"],
                "score": float(score),
            })

            if len(results) >= top_k:
                break

        return results

    def hybrid_search(self, query: str, top_k: int = 10) -> List[Dict[str, Any]]:
        """Hybrid search: combines FAISS semantic + BM25 keyword results."""
        if self._index.ntotal == 0:
            return []

        # Semantic search (FAISS)
        fetch_k = min(top_k * 3, self._index.ntotal)
        query_vector = self._get_embeddings([query])
        scores, indices = self._index.search(query_vector, fetch_k)

        semantic_results: Dict[int, float] = {}
        for score, idx in zip(scores[0], indices[0]):
            if idx == -1 or idx >= len(self._chunks):
                continue
            if float(score) >= 0.25:
                semantic_results[int(idx)] = float(score)

        # BM25 keyword search
        bm25_results: Dict[int, float] = {}
        if self._bm25:
            bm25_scores = self._bm25.score(query)
            max_bm25 = max(bm25_scores) if bm25_scores and max(bm25_scores) > 0 else 1
            for i, s in enumerate(bm25_scores):
                if s > 0:
                    bm25_results[i] = s / max_bm25  # normalize to 0-1

        # Merge: weighted combination (semantic 0.6 + bm25 0.4)
        all_indices = set(semantic_results.keys()) | set(bm25_results.keys())
        merged = []
        for idx in all_indices:
            sem_score = semantic_results.get(idx, 0)
            bm25_score = bm25_results.get(idx, 0)
            combined = sem_score * 0.6 + bm25_score * 0.4
            merged.append((idx, combined))

        merged.sort(key=lambda x: x[1], reverse=True)

        # Diversify: max 2 results per page
        results = []
        seen_pages: Dict[str, int] = {}
        MAX_PER_PAGE = 2

        for idx, combined_score in merged:
            chunk = self._chunks[idx]
            page_key = f"{chunk['document_id']}_{chunk['page_number']}"

            if seen_pages.get(page_key, 0) >= MAX_PER_PAGE:
                continue
            seen_pages[page_key] = seen_pages.get(page_key, 0) + 1

            results.append({
                "document_name": chunk["document_name"],
                "page_number": chunk["page_number"],
                "content": chunk["content"],
                "document_id": chunk["document_id"],
                "score": combined_score,
            })

            if len(results) >= top_k:
                break

        return results

    def multi_query_search(self, queries: List[str], top_k: int = 10) -> List[Dict[str, Any]]:
        """Search with multiple query variants and merge results."""
        all_results: Dict[str, Dict[str, Any]] = {}

        for query in queries:
            results = self.hybrid_search(query, top_k=top_k)
            for r in results:
                key = f"{r['document_id']}_{r['page_number']}_{r['content'][:50]}"
                if key in all_results:
                    all_results[key]["score"] = max(all_results[key]["score"], r["score"])
                else:
                    all_results[key] = r.copy()

        sorted_results = sorted(all_results.values(), key=lambda x: x["score"], reverse=True)
        return sorted_results[:top_k]

    def remove_document_chunks(self, document_id: int):
        indices_to_remove = [
            i for i, c in enumerate(self._chunks) if c["document_id"] == document_id
        ]
        if not indices_to_remove:
            return

        remaining_chunks = [c for i, c in enumerate(self._chunks) if i not in indices_to_remove]
        self._chunks = remaining_chunks

        if remaining_chunks:
            texts = [c["content"] for c in remaining_chunks]
            vectors = self._get_embeddings(texts)
            self._index = faiss.IndexFlatIP(self.dimension)
            self._index.add(vectors)
        else:
            self._index = faiss.IndexFlatIP(self.dimension)

        self._build_bm25()
        self._save()

    def rebuild_from_chunks(self, chunks: List[Dict[str, Any]]):
        self._chunks = chunks
        if chunks:
            texts = [c["content"] for c in chunks]
            vectors = self._get_embeddings(texts)
            self._index = faiss.IndexFlatIP(self.dimension)
            self._index.add(vectors)
        else:
            self._index = faiss.IndexFlatIP(self.dimension)
        self._build_bm25()
        self._save()


faiss_service = FAISSService()
