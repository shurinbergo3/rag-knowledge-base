"""
query_test.py
=============
Interactive search tool to test your knowledge base in Qdrant.
Run after load_to_qdrant.py to verify everything works correctly.

Usage:
    python query_test.py
    python query_test.py --query "how much does it cost" --top 5
"""

import argparse
import os

import yaml
from dotenv import load_dotenv
from openai import OpenAI
from qdrant_client import QdrantClient

load_dotenv()


def load_config(path: str = "config.yaml") -> dict:
    with open(path, encoding="utf-8") as f:
        return yaml.safe_load(f)


def search(query: str, top_k: int, cfg: dict) -> list[dict]:
    openai_client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
    qdrant_client = QdrantClient(
        url=os.getenv("QDRANT_URL", "http://localhost:6333"),
        api_key=os.getenv("QDRANT_API_KEY") or None,
    )

    response = openai_client.embeddings.create(
        model=cfg["embeddings"]["model"],
        input=[query],
    )
    q_vec = response.data[0].embedding

    results = qdrant_client.search(
        collection_name=cfg["qdrant"]["collection_name"],
        query_vector=q_vec,
        limit=top_k,
        with_payload=True,
    )
    return results


def print_results(query: str, results) -> None:
    print(f'\n{"─" * 55}')
    print(f'Query: "{query}"')
    print(f'{"─" * 55}')
    if not results:
        print("No results found.")
        return
    for i, r in enumerate(results, 1):
        print(f"\n[{i}] Score: {r.score:.4f}  |  Sheet: {r.payload['sheet']}"
              f"  |  Category: {r.payload.get('category', '—')}")
        print(r.payload["text"])
        print("─" * 55)


def interactive_mode(cfg: dict) -> None:
    print(f"\n🔍 Knowledge Base Search — {cfg['project']['name']}")
    print("Type your query and press Enter. Type 'exit' to quit.\n")
    while True:
        query = input("Query: ").strip()
        if query.lower() in ("exit", "quit", "q"):
            print("Bye!")
            break
        if not query:
            continue
        results = search(query, top_k=3, cfg=cfg)
        print_results(query, results)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Test knowledge base search")
    parser.add_argument("--query", "-q", type=str, default=None,
                        help="Single query to run (skip interactive mode)")
    parser.add_argument("--top",   "-k", type=int, default=3,
                        help="Number of results to return (default: 3)")
    args = parser.parse_args()

    cfg = load_config()

    if args.query:
        results = search(args.query, args.top, cfg)
        print_results(args.query, results)
    else:
        interactive_mode(cfg)
