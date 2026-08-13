"""
Zoe Embedding Engine — Lazy Singleton for paraphrase-multilingual-MiniLM-L12-v2
Runs on CPU intentionally (384-dim is too small for MPS overhead to help).
Memory: ~470MB, loaded on first call, persists for process lifetime.
"""
import threading
import time

_model = None
_lock = threading.Lock()

def get_embedder():
    """Thread-safe lazy singleton loader for the embedding model."""
    global _model
    if _model is None:
        with _lock:
            if _model is None:
                from sentence_transformers import SentenceTransformer
                start = time.perf_counter()
                _model = SentenceTransformer(
                    'sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2',
                    device='cpu'
                )
                elapsed = (time.perf_counter() - start) * 1000
                print(f"[Zoe Embedder] Model loaded in {elapsed:.0f}ms")
    return _model


def embed(text: str) -> list[float]:
    """Generate a 384-dim normalized embedding for a given text string."""
    if not text or not text.strip():
        return [0.0] * 384
    model = get_embedder()
    return model.encode(text.strip(), normalize_embeddings=True).tolist()


def embed_batch(texts: list[str]) -> list[list[float]]:
    """Batch embed multiple texts. Used for one-time ingestion."""
    model = get_embedder()
    clean = [t.strip() if t else "" for t in texts]
    return model.encode(clean, normalize_embeddings=True, batch_size=32, show_progress_bar=True).tolist()
