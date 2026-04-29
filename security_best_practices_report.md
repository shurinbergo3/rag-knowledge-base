# Security Best Practices Report
**Project:** RAG Knowledge Base Loader  
**Date:** 2026-04-27  
**Scope:** excel_to_chunks.py, load_to_qdrant.py, query_test.py, config.yaml, requirements.txt

---

## Executive Summary

The codebase is a local CLI pipeline with no web-facing surface, which significantly reduces risk. No critical vulnerabilities were found. The main concerns are: unpinned dependencies (supply-chain risk), missing file path validation (path traversal), missing Excel file type check, and unprotected intermediate file `chunks.json` with potentially sensitive business data. All findings are fixable with small, non-breaking changes.

---

## HIGH

### H1 — Unpinned dependencies (supply-chain risk)
**File:** `requirements.txt:1-6`  
**Impact:** A future vulnerable version of any dependency is automatically installed on fresh `pip install`.

`>=` constraints allow pip to install any future version — including ones with security vulnerabilities or breaking changes. This is especially relevant for `openpyxl` (parses untrusted files) and `qdrant-client`.

**Fix:** Pin to a specific version or use a bounded range:
```
openai>=1.30.0,<2.0.0
qdrant-client>=1.9.0,<2.0.0
openpyxl>=3.1.0,<4.0.0
pyyaml>=6.0,<7.0
python-dotenv>=1.0.0,<2.0.0
tqdm>=4.66.0,<5.0.0
```

---

### H2 — No file path validation (path traversal)
**Files:** `excel_to_chunks.py:55`, `load_to_qdrant.py:51`

`excel_path` from `config.yaml` is passed directly to `openpyxl.load_workbook(excel_path)` without any checks. A value like `../../etc/passwd` or an absolute path to a sensitive file would be silently accepted (openpyxl will fail to parse it, but the intent is clear).

**Fix:** Validate that the path exists, resolves within an expected directory, and has an Excel extension:
```python
from pathlib import Path

ALLOWED_EXTENSIONS = {".xlsx", ".xlsm", ".xls"}

def validate_excel_path(path: str) -> Path:
    p = Path(path).resolve()
    if not p.exists():
        raise FileNotFoundError(f"Excel file not found: {p}")
    if p.suffix.lower() not in ALLOWED_EXTENSIONS:
        raise ValueError(f"Not an Excel file: {p.name}")
    return p
```

---

## MEDIUM

### M1 — chunks.json contains sensitive business data, no protection
**Files:** `excel_to_chunks.py:231`, `load_to_qdrant.py:81`

`chunks.json` is written to disk in plaintext and likely contains prices, delivery terms, escalation rules, and other internal business data. It is not mentioned in `.gitignore`, so it can easily be accidentally committed.

**Fix:** Add `chunks.json` to `.gitignore`. If the data is sensitive, also restrict file permissions on write:
```python
import stat
with open(out_path, "w", encoding="utf-8") as f:
    json.dump(chunks, f, ensure_ascii=False, indent=2)
os.chmod(out_path, stat.S_IRUSR | stat.S_IWUSR)  # owner read/write only
```

---

### M2 — No limit on file size or chunk count (cost/memory DoS)
**File:** `excel_to_chunks.py:49`

There is no cap on the number of rows, sheets, or text length per chunk. A very large Excel file would:
- Consume unbounded memory during parsing
- Send an unbounded number of requests to the OpenAI API (unexpected cost)

**Fix:** Add a configurable max in `config.yaml` and enforce it:
```yaml
limits:
  max_chunks: 5000
  max_text_length: 2000   # chars per chunk, truncated if exceeded
```
```python
MAX_TEXT = config.get("limits", {}).get("max_text_length", 2000)
# in make_chunk:
text = text[:MAX_TEXT]
```

---

### M3 — SSRF via QDRANT_URL
**Files:** `load_to_qdrant.py:42`, `query_test.py:31`

`QDRANT_URL` is read from `.env` and passed directly to `QdrantClient`. If an attacker can modify `.env` (e.g., on a shared server), they can redirect all vector data to an internal or external host.

**Fix:** Validate the URL scheme before connecting:
```python
from urllib.parse import urlparse

def validate_qdrant_url(url: str) -> str:
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        raise ValueError(f"Invalid QDRANT_URL scheme: {parsed.scheme}")
    return url
```

---

## LOW

### L1 — Weak API key pre-check
**File:** `load_to_qdrant.py:194`

```python
if not OPENAI_API_KEY or OPENAI_API_KEY == "sk-...":
```

Only catches the literal placeholder `"sk-..."`. Any other placeholder value (e.g., `"your-key-here"`, `"123"`) passes through and fails at the first API call with a confusing auth error instead of an early, clear message.

**Fix:** Check key format more broadly:
```python
if not OPENAI_API_KEY or len(OPENAI_API_KEY) < 20 or OPENAI_API_KEY.startswith("sk-..."):
    raise ValueError("OPENAI_API_KEY is missing or looks like a placeholder. Check your .env file.")
```

---

### L2 — Silent loss of Qdrant authentication
**File:** `load_to_qdrant.py:43`

```python
QDRANT_API_KEY = os.getenv("QDRANT_API_KEY") or None
```

If `QDRANT_API_KEY` is set to an empty string `""` in `.env`, it becomes `None` and Qdrant is accessed without authentication — with no warning. This is likely intentional for local Docker, but should be logged.

**Fix:** Add a log message when running without auth:
```python
QDRANT_API_KEY = os.getenv("QDRANT_API_KEY") or None
if not QDRANT_API_KEY:
    print("⚠️  QDRANT_API_KEY not set — connecting without authentication (OK for local dev)")
```

---

## Summary Table

| ID | Severity | File | Description |
|----|----------|------|-------------|
| H1 | HIGH | requirements.txt | Unpinned dependencies |
| H2 | HIGH | excel_to_chunks.py, load_to_qdrant.py | Path traversal via excel path |
| M1 | MEDIUM | excel_to_chunks.py, load_to_qdrant.py | chunks.json not in .gitignore, unprotected |
| M2 | MEDIUM | excel_to_chunks.py | No limits on file size / chunk count |
| M3 | MEDIUM | load_to_qdrant.py, query_test.py | SSRF via QDRANT_URL |
| L1 | LOW | load_to_qdrant.py | Weak API key pre-check |
| L2 | LOW | load_to_qdrant.py | Silent no-auth on empty QDRANT_API_KEY |
