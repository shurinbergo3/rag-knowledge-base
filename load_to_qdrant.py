"""
load_to_qdrant.py
=================
1. Loads chunks from chunks.json (or re-parses Excel if file is missing)
2. Creates embeddings via OpenAI API
3. Upserts vectors + metadata into Qdrant

Settings: config.yaml
Secrets:  .env  (OPENAI_API_KEY, QDRANT_URL, QDRANT_API_KEY)

Usage:
    python load_to_qdrant.py
"""

import json
import os
import random
import time
import uuid
from pathlib import Path

import yaml
from dotenv import load_dotenv
from openai import OpenAI, APIError, APIConnectionError, RateLimitError
from qdrant_client import QdrantClient
from qdrant_client.models import Distance, PointStruct, VectorParams
from tqdm import tqdm

load_dotenv()


# ─────────────────────────────────────────────────────────────
# Config
# ─────────────────────────────────────────────────────────────

def load_config(path: str = "config.yaml") -> dict:
    with open(path, encoding="utf-8") as f:
        return yaml.safe_load(f)


cfg = load_config()

OPENAI_API_KEY  = os.getenv("OPENAI_API_KEY", "")
QDRANT_URL      = os.getenv("QDRANT_URL", "http://localhost:6333")
QDRANT_API_KEY  = os.getenv("QDRANT_API_KEY") or None

EMBEDDING_MODEL = cfg["embeddings"]["model"]
EMBEDDING_DIM   = cfg["embeddings"]["dimension"]
BATCH_SIZE      = cfg["embeddings"]["batch_size"]
COLLECTION      = cfg["qdrant"]["collection_name"]
DISTANCE        = cfg["qdrant"]["distance"]
CHUNKS_FILE     = cfg["output"]["chunks_file"]
EXCEL_PATH      = cfg["excel"]["path"]

# text-embedding-3-* limit is 8191 tokens; ~4 chars/token is a safe heuristic.
MAX_CHARS_PER_INPUT = 24_000
MAX_RETRIES = 4
BASE_BACKOFF_S = 0.5

DISTANCE_MAP = {
    "Cosine": Distance.COSINE,
    "Dot":    Distance.DOT,
    "Euclid": Distance.EUCLID,
}

# ─────────────────────────────────────────────────────────────
# Clients (lazy, cached)
# ─────────────────────────────────────────────────────────────

_openai: OpenAI | None = None
_qdrant: QdrantClient | None = None


def openai_client() -> OpenAI:
    global _openai
    if _openai is None:
        if not OPENAI_API_KEY or OPENAI_API_KEY == "sk-...":
            raise ValueError("OPENAI_API_KEY is not set. Check your .env file.")
        _openai = OpenAI(api_key=OPENAI_API_KEY)
    return _openai


def qdrant_client() -> QdrantClient:
    global _qdrant
    if _qdrant is None:
        _qdrant = QdrantClient(url=QDRANT_URL, api_key=QDRANT_API_KEY, timeout=60)
    return _qdrant


# ─────────────────────────────────────────────────────────────
# Step 1 — Get chunks
# ─────────────────────────────────────────────────────────────

def get_chunks() -> list[dict]:
    if Path(CHUNKS_FILE).exists():
        print(f"📂 Loading chunks from {CHUNKS_FILE}")
        with open(CHUNKS_FILE, encoding="utf-8") as f:
            chunks = json.load(f)
    else:
        print(f"📖 Parsing Excel: {EXCEL_PATH}")
        from excel_to_chunks import extract_chunks, load_config as lc
        chunks = extract_chunks(lc())
        with open(CHUNKS_FILE, "w", encoding="utf-8") as f:
            json.dump(chunks, f, ensure_ascii=False, indent=2)

    print(f"✅ Chunks loaded: {len(chunks)}")
    return chunks


# ─────────────────────────────────────────────────────────────
# Step 2 — Embeddings (with retries + truncation)
# ─────────────────────────────────────────────────────────────

def _truncate(text: str) -> str:
    return text if len(text) <= MAX_CHARS_PER_INPUT else text[:MAX_CHARS_PER_INPUT]


def embed_texts(texts: list[str]) -> list[list[float]]:
    if not texts:
        return []
    safe = [_truncate(t or " ") for t in texts]

    attempt = 0
    while True:
        try:
            response = openai_client().embeddings.create(model=EMBEDDING_MODEL, input=safe)
            return [item.embedding for item in response.data]
        except (RateLimitError, APIConnectionError) as e:
            attempt += 1
            if attempt > MAX_RETRIES:
                raise
            delay = BASE_BACKOFF_S * (2 ** (attempt - 1)) + random.uniform(0, 0.2)
            print(f"  ⏳ {type(e).__name__}, retry {attempt}/{MAX_RETRIES} in {delay:.1f}s")
            time.sleep(delay)
        except APIError as e:
            status = getattr(e, "status_code", None)
            if status is not None and status >= 500 and attempt < MAX_RETRIES:
                attempt += 1
                delay = BASE_BACKOFF_S * (2 ** (attempt - 1)) + random.uniform(0, 0.2)
                print(f"  ⏳ APIError {status}, retry {attempt}/{MAX_RETRIES} in {delay:.1f}s")
                time.sleep(delay)
                continue
            raise


def embed_chunks(chunks: list[dict]) -> list[dict]:
    print(f"\n🔢 Creating embeddings (model: {EMBEDDING_MODEL})")
    enriched = []
    batches = [chunks[i : i + BATCH_SIZE] for i in range(0, len(chunks), BATCH_SIZE)]

    for batch in tqdm(batches, desc="Embeddings"):
        vectors = embed_texts([ch["text"] for ch in batch])
        for ch, vec in zip(batch, vectors):
            enriched.append({**ch, "vector": vec})

    print(f"✅ Done: {len(enriched)} vectors")
    return enriched


# ─────────────────────────────────────────────────────────────
# Step 3 — Qdrant collection
# ─────────────────────────────────────────────────────────────

def _vector_size(info) -> int | None:
    vectors = info.config.params.vectors
    size = getattr(vectors, "size", None)
    if isinstance(size, int):
        return size
    if isinstance(vectors, dict):
        for v in vectors.values():
            inner = getattr(v, "size", None)
            if isinstance(inner, int):
                return inner
    return None


def ensure_collection() -> None:
    client = qdrant_client()
    existing = [c.name for c in client.get_collections().collections]

    if COLLECTION in existing:
        info = client.get_collection(COLLECTION)
        actual_dim = _vector_size(info)
        if actual_dim is not None and actual_dim != EMBEDDING_DIM:
            print(f"⚠️  Collection exists with dim={actual_dim}, recreating...")
            client.delete_collection(COLLECTION)
        else:
            print(f"📌 Collection '{COLLECTION}' exists (dim={actual_dim}), upserting.")
            return

    client.create_collection(
        collection_name=COLLECTION,
        vectors_config=VectorParams(
            size=EMBEDDING_DIM,
            distance=DISTANCE_MAP.get(DISTANCE, Distance.COSINE),
        ),
    )
    print(f"✅ Collection '{COLLECTION}' created (dim={EMBEDDING_DIM})")


# ─────────────────────────────────────────────────────────────
# Step 4 — Upload
# ─────────────────────────────────────────────────────────────

def upload(enriched: list[dict]) -> None:
    print(f"\n📤 Uploading to {QDRANT_URL} / {COLLECTION}")
    client = qdrant_client()
    batches = [enriched[i : i + BATCH_SIZE] for i in range(0, len(enriched), BATCH_SIZE)]

    for batch in tqdm(batches, desc="Upload"):
        points = [
            PointStruct(
                id=str(uuid.uuid4()),
                vector=ch["vector"],
                payload={
                    "text":     ch["text"],
                    "sheet":    ch["metadata"].get("sheet"),
                    "category": ch["metadata"].get("category", ""),
                    "row":      ch["metadata"].get("row", 0),
                },
            )
            for ch in batch
        ]
        client.upsert(collection_name=COLLECTION, points=points, wait=True)

    total = client.count(COLLECTION).count
    print(f"✅ Upload complete. Total points in collection: {total}")


# ─────────────────────────────────────────────────────────────
# Step 5 — Smoke test
# ─────────────────────────────────────────────────────────────

def search(query: str, top_k: int = 3) -> None:
    print(f'\n🔍 Search: "{query}"')
    q_vec = embed_texts([query])[0]
    response = qdrant_client().query_points(
        collection_name=COLLECTION,
        query=q_vec,
        limit=top_k,
        with_payload=True,
    )
    for i, r in enumerate(response.points, 1):
        text = (r.payload or {}).get("text", "") if r.payload else ""
        sheet = (r.payload or {}).get("sheet", "—")
        preview = str(text)[:200].replace("\n", " ")
        print(f"  [{i}] score={r.score:.3f} | {sheet}")
        print(f"      {preview}...")


# ─────────────────────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────────────────────

if __name__ == "__main__":
    project_name = cfg["project"]["name"]
    print("=" * 55)
    print(f"  {project_name} — Load Knowledge Base into Qdrant")
    print("=" * 55)

    if not OPENAI_API_KEY or OPENAI_API_KEY == "sk-...":
        raise ValueError("OPENAI_API_KEY is not set. Check your .env file.")

    chunks   = get_chunks()
    enriched = embed_chunks(chunks)
    ensure_collection()
    upload(enriched)

    # Smoke-test with a couple of queries from your domain
    search("how much does it cost")
    search("warranty")

    print(f"\n🎉 Done! Knowledge base for '{project_name}' is loaded into Qdrant.")
