# RAG Knowledge Base

Two ways to turn documents into a searchable vector database in [Qdrant](https://qdrant.tech):

1. **Web app** — drag-and-drop UI for Excel, CSV, PDF, DOCX, Markdown, TXT. Multi-project (one Qdrant collection per project), authenticated, deployable to Vercel.
2. **Python CLI** — scripted pipeline for structured Excel knowledge bases. Good for teams that maintain content in spreadsheets and re-sync on a schedule.

Both share the same backend (OpenAI embeddings + Qdrant) and write the same payload shape (`text`, `source`, `sheet`, `page`, `row`), so a search built one way works with chunks loaded the other.

```
Documents → parse → chunks → OpenAI embeddings → Qdrant collection
                                                     ↓
                                           Your AI agent (RAG retrieval)
```

---

## Web app

Located in `web/`. Next.js 14 + Tailwind. Authenticated by a shared secret, with multi-project support.

### Features

- **Multiple file types**: `.xlsx`, `.xls`, `.csv`, `.pdf`, `.docx`, `.doc`, `.md`, `.markdown`, `.txt`
- **Multi-project**: each project = one Qdrant collection. Create / switch / delete from the UI.
- **Live progress** via Server-Sent Events: parse → embed → upload.
- **Auth**: every API route requires `x-api-secret`. Browser stores it in `localStorage` after a one-time prompt.
- **Reliability**: retries with backoff on OpenAI 429/5xx, hard-truncation to fit the embedding token limit, race-safe collection creation, named-vector aware dim check.
- **Limits** to keep things sane: 25 MB per file, 10 000 chunks per upload, 1 000 chars per query, 1–48 char project names (`[a-zA-Z0-9_-]`).

### Run locally

```bash
cd web
npm install
cp .env.local.example .env.local
# fill in OPENAI_API_KEY, QDRANT_URL, QDRANT_API_KEY (if cloud), API_SECRET
npm run dev
```

Open http://localhost:3000, enter the `API_SECRET` value, and start uploading.

Generate an `API_SECRET` like this:

```bash
openssl rand -hex 32
```

### Deploy to Vercel

```bash
cd web
vercel link            # one-time
vercel env add OPENAI_API_KEY  production
vercel env add QDRANT_URL      production
vercel env add QDRANT_API_KEY  production
vercel env add API_SECRET      production
vercel --prod
```

### Programmatic API

All routes require `x-api-secret: <value>` (or `Authorization: Bearer <value>`).

```bash
# Search
curl -H "x-api-secret: $API_SECRET" \
  "https://your-app.vercel.app/api/search?q=warranty&top=5&project=my_kb"

# List / create / delete projects
curl -H "x-api-secret: $API_SECRET" https://.../api/projects
curl -H "x-api-secret: $API_SECRET" -H "Content-Type: application/json" \
  -X POST -d '{"name":"my_kb"}' https://.../api/projects
curl -H "x-api-secret: $API_SECRET" -X DELETE \
  "https://.../api/projects?name=my_kb"

# Upload (streamed Server-Sent Events response)
curl -H "x-api-secret: $API_SECRET" \
  -F "file=@docs.pdf" -F "project=my_kb" \
  https://.../api/upload
```

---

## Python CLI

Located at the repo root. Best when your knowledge base lives in a structured Excel template that the team edits regularly.

```
Excel (filled by your team)
        ↓  excel_to_chunks.py    — parse sheets into text chunks
chunks.json
        ↓  load_to_qdrant.py     — embed with OpenAI → upsert to Qdrant
Qdrant collection
        ↓
Your AI agent (RAG retrieval)
```

### Excel template structure

The pipeline expects an Excel file with these six sheets (names configurable in `config.yaml`):

| Sheet | Contents |
|-------|----------|
| 1 · Catalog | Products / services with characteristics and prices |
| 2 · FAQ | Customer questions + ready-made bot answers |
| 3 · Qualification | Step-by-step lead qualification scenario |
| 4 · Conditions | Work terms: measurement, delivery, payment, warranty |
| 5 · Escalation | Rules for when to hand off to a human manager |
| 6 · Stop-topics | Topics the bot must not answer on its own |

> A ready-to-fill Excel template is included as `knowledge_base_template.xlsx`.

### Quick start

```bash
# 1. Install
pip install -r requirements.txt

# 2. Configure secrets
cp .env.example .env  # then edit: OPENAI_API_KEY, QDRANT_URL, QDRANT_API_KEY

# 3. Configure project (config.yaml — see below)

# 4. Start Qdrant (local Docker)
docker run -d -p 6333:6333 qdrant/qdrant

# 5. Parse Excel → chunks.json
python excel_to_chunks.py

# 6. Embed and load into Qdrant
python load_to_qdrant.py

# 7. Test search
python query_test.py
python query_test.py --query "how much does it cost" --top 5
```

### `config.yaml`

```yaml
project:
  name: "My Company"

excel:
  path: "knowledge_base.xlsx"   # path to your filled Excel file
  header_row: 3                 # row number with column headers
  data_start_row: 4             # first data row (after headers)
  skip_sheets: []               # sheet names to skip
  skip_values: ["FILL", "—", "-"]   # cell values treated as empty

embeddings:
  model: "text-embedding-3-small"
  dimension: 1536
  batch_size: 50

qdrant:
  collection_name: "my_kb"
  distance: "Cosine"

output:
  chunks_file: "chunks.json"
```

### Updating the knowledge base

When the team updates the Excel file, re-run both scripts:

```bash
python excel_to_chunks.py
python load_to_qdrant.py
```

`upsert` is used, so existing points are updated and new ones are added without duplicates.

> Note: collection IDs are random UUIDs per upsert, so re-running adds duplicates of the same content. To start clean, delete the collection in Qdrant first or change `collection_name` in `config.yaml`.

---

## Requirements

- **Python**: 3.10+ (for the CLI)
- **Node.js**: 18+ (for the web app)
- **OpenAI API key**: [platform.openai.com](https://platform.openai.com)
- **Qdrant**: local Docker or [Qdrant Cloud](https://cloud.qdrant.io)

Embedding cost for a typical knowledge base (~60 chunks): **< $0.01** with `text-embedding-3-small`.

---

## Project structure

```
rag-knowledge-base/
├── excel_to_chunks.py            # CLI: Excel → chunks.json
├── load_to_qdrant.py             # CLI: chunks.json → Qdrant
├── query_test.py                 # CLI: interactive search tester
├── config.yaml                   # CLI settings
├── requirements.txt
├── knowledge_base_template.xlsx  # Excel template
└── web/                          # Next.js 14 web app
    ├── app/
    │   ├── api/
    │   │   ├── auth-check/       # POST: verify API_SECRET
    │   │   ├── projects/         # GET/POST/DELETE: manage collections
    │   │   ├── search/           # GET:  vector search
    │   │   └── upload/           # POST: parse + embed + upsert (SSE)
    │   └── page.tsx
    ├── components/
    │   ├── AuthGate.tsx
    │   ├── ProjectSelector.tsx
    │   ├── UploadTab.tsx
    │   ├── UploadZone.tsx
    │   ├── SearchTab.tsx
    │   ├── ProgressSteps.tsx
    │   └── ChunkPreview.tsx
    └── lib/
        ├── auth.ts               # server-side secret check (timing-safe)
        ├── client-auth.ts        # browser fetch wrapper
        ├── embeddings.ts         # OpenAI client + retries + truncation
        ├── qdrant.ts             # Qdrant client + project CRUD
        ├── use-projects.ts       # React hook
        └── parsers/              # Per-format parsers + shared chunking
            ├── chunking.ts
            ├── excel.ts          ├── csv.ts
            ├── pdf.ts            ├── docx.ts
            ├── md.ts             └── txt.ts
```

---

## System prompt for your bot

Use this in your AI agent to enforce strict RAG behaviour:

```
You are a customer consultant. Answer ONLY using the provided knowledge base documents.
If the answer is not in the documents, say: "Let me check with our manager"
and ask the customer for their contact details.
Never invent prices, deadlines, or terms on your own.
```

---

## License

MIT

---

## Описание на русском

Готовый пайплайн для построения базы знаний AI-бота продаж или поддержки. Превращает документы в векторную базу Qdrant, из которой бот достаёт релевантные фрагменты при ответе на вопросы клиентов (RAG).

Два способа использовать:

1. **Web-приложение** (`web/`) — drag-and-drop интерфейс для Excel/CSV/PDF/DOCX/Markdown/TXT. Несколько проектов (по коллекции на каждый), защита по секрету, разворачивается на Vercel.
2. **Python-скрипты** в корне репозитория — для команд, которые ведут структурированную базу в Excel-шаблоне и регулярно её пересинкивают.

### Web-приложение

Защищено общим секретом `API_SECRET`. При первом заходе браузер просит его ввести, дальше он хранится в `localStorage` и автоматически подкладывается во все запросы. Тот же секрет должен быть прописан на сервере (Vercel env vars или `.env.local`).

```bash
# Локально
cd web
npm install
cp .env.local.example .env.local
# заполнить OPENAI_API_KEY, QDRANT_URL, QDRANT_API_KEY, API_SECRET
npm run dev

# Сгенерировать секрет
openssl rand -hex 32

# Деплой на Vercel
vercel env add OPENAI_API_KEY  production
vercel env add QDRANT_URL      production
vercel env add QDRANT_API_KEY  production
vercel env add API_SECRET      production
vercel --prod
```

В UI:
- **Project selector** — создавай/выбирай/удаляй проекты (= коллекции в Qdrant).
- **Upload** — перетащи файл, нажми «Build into "..."», увидишь живой прогресс парсинга, эмбеддингов и загрузки.
- **Search** — векторный поиск по выбранному проекту с подсветкой источника (sheet/page/row).

### Python-скрипты

Подходят, если у тебя структурированная Excel-таблица с шестью листами (каталог, FAQ, квалификация, условия, эскалация, стоп-темы).

```bash
pip install -r requirements.txt
cp .env.example .env       # OPENAI_API_KEY, QDRANT_URL, QDRANT_API_KEY
# отредактировать config.yaml (имя проекта, путь к Excel, имена листов)

docker run -d -p 6333:6333 qdrant/qdrant

python excel_to_chunks.py    # Excel → chunks.json
python load_to_qdrant.py     # chunks.json → Qdrant + два smoke-теста
python query_test.py         # интерактивный поиск
```

При обновлении Excel — просто запусти оба скрипта заново. Используется `upsert`.

### Системный промпт для бота

```
Ты консультант по продажам. Отвечай ТОЛЬКО на основе предоставленных документов базы знаний.
Если ответа в документах нет — скажи: «Уточню у менеджера»
и попроси контактные данные клиента.
Никогда не придумывай цены, сроки и условия самостоятельно.
```
