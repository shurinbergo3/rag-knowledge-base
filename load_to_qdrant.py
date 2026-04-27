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
import uuid
from pathlib import Path

import yaml
from dotenv import load_dotenv
from openai import OpenAI
from qdrant_client import QdrantClient
from qdrant_client.models import CollectionInfo, Distance, PointStruct, VectorParams
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

DISTANCE_MAP = {
    "Cosine": Distance.COSINE,
    "Dot":    Distance.DOT,
    "Euclid": Distance.EUCLID,
}

# ─────────────────────────────────────────────────────────────
# Clients
# ─────────────────────────────────────────────────────────────

openai_client = OpenAI(api_key=OPENAI_API_KEY)
qdrant_client = QdrantClient(url=QDRANT_URL, api_key=QDRANT_API_KEY, timeout=60)


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
# Step 2 — Embeddings
# ─────────────────────────────────────────────────────────────

def embed_texts(texts: list[str]) -> list[list[float]]:
    response = openai_client.embeddings.create(model=EMBEDDING_MODEL, input=texts)
    return [item.embedding for item in response.data]


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

def ensure_collection() -> None:
    existing = [c.name for c in qdrant_client.get_collections().collections]

    if COLLECTION in existing:
        info: CollectionInfo = qdrant_client.get_collection(COLLECTION)
        actual_dim = info.config.params.vectors.size
        if actual_dim != EMBEDDING_DIM:
            print(f"⚠️  Collection exists with dim={actual_dim}, recreating...")
            qdrant_client.delete_collection(COLLECTION)
        else:
            print(f"📌 Collection '{COLLECTION}' exists (dim={actual_dim}), upserting.")
            return

    qdrant_client.create_collection(
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
    batches = [enriched[i : i + BATCH_SIZE] for i in range(0, len(enriched), BATCH_SIZE)]

    for batch in tqdm(batches, desc="Upload"):
        points = [
            PointStruct(
                id=str(uuid.uuid4()),
                vector=ch["vector"],
                payload={
                    "text":     ch["text"],
                    "sheet":    ch["metadata"]["sheet"],
                    "category": ch["metadata"].get("category", ""),
                    "row":      ch["metadata"].get("row", 0),
                },
            )
            for ch in batch
        ]
        qdrant_client.upsert(collection_name=COLLECTION, points=points)

    total = qdrant_client.count(COLLECTION).count
    print(f"✅ Upload complete. Total points in collection: {total}")


# ─────────────────────────────────────────────────────────────
# Step 5 — Smoke test
# ─────────────────────────────────────────────────────────────

def search(query: str, top_k: int = 3) -> None:
    print(f'\n🔍 Search: "{query}"')
    q_vec   = embed_texts([query])[0]
    results = qdrant_client.search(
        collection_name=COLLECTION,
        query_vector=q_vec,
        limit=top_k,
        with_payload=True,
    )
    for i, r in enumerate(results, 1):
        preview = r.payload["text"][:200].replace("\n", " ")
        print(f"  [{i}] score={r.score:.3f} | {r.payload['sheet']}")
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
