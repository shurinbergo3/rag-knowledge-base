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


class SearchSession:
    def __init__(self, cfg: dict) -> None:
        self.cfg = cfg
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key or api_key == "sk-...":
            raise ValueError("OPENAI_API_KEY is not set. Check your .env file.")
        self.openai = OpenAI(api_key=api_key)
        self.qdrant = QdrantClient(
            url=os.getenv("QDRANT_URL", "http://localhost:6333"),
            api_key=os.getenv("QDRANT_API_KEY") or None,
            timeout=30,
        )

    def search(self, query: str, top_k: int) -> list:
        response = self.openai.embeddings.create(
            model=self.cfg["embeddings"]["model"],
            input=[query],
        )
        q_vec = response.data[0].embedding

        result = self.qdrant.query_points(
            collection_name=self.cfg["qdrant"]["collection_name"],
            query=q_vec,
            limit=top_k,
            with_payload=True,
        )
        return result.points


def print_results(query: str, results) -> None:
    print(f'\n{"─" * 55}')
    print(f'Query: "{query}"')
    print(f'{"─" * 55}')
    if not results:
        print("No results found.")
        return
    for i, r in enumerate(results, 1):
        payload = r.payload or {}
        sheet = payload.get("sheet") or "—"
        category = payload.get("category") or "—"
        text = payload.get("text", "")
        print(f"\n[{i}] Score: {r.score:.4f}  |  Sheet: {sheet}  |  Category: {category}")
        print(text)
        print("─" * 55)


def interactive_mode(session: SearchSession) -> None:
    print(f"\n🔍 Knowledge Base Search — {session.cfg['project']['name']}")
    print("Type your query and press Enter. Type 'exit' to quit.\n")
    while True:
        try:
            query = input("Query: ").strip()
        except (EOFError, KeyboardInterrupt):
            print("\nBye!")
            return
        if query.lower() in ("exit", "quit", "q"):
            print("Bye!")
            return
        if not query:
            continue
        try:
            results = session.search(query, top_k=3)
        except Exception as e:
            print(f"⚠️  Search failed: {e}")
            continue
        print_results(query, results)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Test knowledge base search")
    parser.add_argument("--query", "-q", type=str, default=None,
                        help="Single query to run (skip interactive mode)")
    parser.add_argument("--top",   "-k", type=int, default=3,
                        help="Number of results to return (default: 3)")
    args = parser.parse_args()

    cfg = load_config()
    session = SearchSession(cfg)

    if args.query:
        results = session.search(args.query, args.top)
        print_results(args.query, results)
    else:
        interactive_mode(session)
