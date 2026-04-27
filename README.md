# RAG Knowledge Base Loader

A ready-to-use pipeline that turns any Excel file into a searchable vector database in [Qdrant](https://qdrant.tech). Built for AI sales consultants and customer-support bots.

## How it works

```
Excel (any structure, any number of sheets)
        ↓  excel_to_chunks.py    — parse sheets into text chunks
chunks.json
        ↓  load_to_qdrant.py     — embed with OpenAI → upsert to Qdrant
Qdrant collection
        ↓
Your AI agent (RAG retrieval)
```

The bot retrieves the 3–5 most relevant chunks for each customer message and answers **only** from that context — no hallucinated prices or deadlines.

---

## Excel format

The parser reads **any Excel file** automatically — no hardcoded sheet names or column order.

- Column headers are read from `header_row` (default: row 3)
- Data starts at `data_start_row` (default: row 4)
- Each non-empty row becomes one chunk: `Header: value\n...`
- Sheets to skip and placeholder values are configurable in `config.yaml`

---

## Quick start

### 1 · Clone and install

```bash
git clone https://github.com/shurinbergo3/rag-knowledge-base.git
cd rag-knowledge-base
pip install -r requirements.txt
```

### 2 · Configure secrets

```bash
cp .env.example .env
# Edit .env — add your OpenAI and Qdrant credentials
```

### 3 · Configure the project

Edit `config.yaml`:

```yaml
project:
  name: "My Company"

excel:
  path: "knowledge_base.xlsx"   # path to your Excel file
  header_row: 3                 # row with column headers
  data_start_row: 4             # first row of data
  skip_sheets: ["Cover"]        # sheets to skip (optional)

qdrant:
  collection_name: "my_kb"      # collection name in Qdrant
```

### 4 · Start Qdrant

**Option A — Local Docker (for testing):**
```bash
docker run -d -p 6333:6333 qdrant/qdrant
# Dashboard: http://localhost:6333/dashboard
```

**Option B — Qdrant Cloud (production):**
1. Create a free cluster at [cloud.qdrant.io](https://cloud.qdrant.io)
2. Copy the cluster URL and API key into `.env`

### 5 · Parse the Excel file

```bash
python excel_to_chunks.py
```

Output: `chunks.json` — preview of parsed chunks is printed to console.

### 6 · Load into Qdrant

```bash
python load_to_qdrant.py
```

The script embeds all chunks with OpenAI and upserts them to Qdrant. Two smoke-test queries are run automatically at the end.

### 7 · Test search interactively

```bash
# Interactive mode
python query_test.py

# Single query
python query_test.py --query "how much does it cost" --top 5
```

---

## Updating the knowledge base

When your team updates the Excel file, just re-run both scripts:

```bash
python excel_to_chunks.py
python load_to_qdrant.py
```

`upsert` is used, so existing points are updated and new ones are added without duplicates.

---

## Project structure

```
rag-knowledge-base/
├── excel_to_chunks.py        # Excel → chunks.json
├── load_to_qdrant.py         # chunks.json → Qdrant
├── query_test.py             # Interactive search tester
├── config.yaml               # All settings (no secrets)
├── .env.example              # Secret keys template
├── .gitignore
└── requirements.txt
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

## Requirements

- Python 3.10+
- OpenAI API key ([platform.openai.com](https://platform.openai.com))
- Qdrant (local Docker or [Qdrant Cloud](https://cloud.qdrant.io))

Embedding cost for a typical knowledge base (~60 chunks): **< $0.01**

---

## License

MIT

---

## Описание на русском

### Что делает этот проект

Это готовый пайплайн для создания базы знаний AI-бота продаж или поддержки клиентов. Пайплайн превращает **любой** Excel-файл в векторную базу данных Qdrant, из которой бот достаёт релевантные фрагменты при ответе на вопросы клиентов (RAG — Retrieval-Augmented Generation).

```
Excel (любая структура, любое количество листов)
        ↓  excel_to_chunks.py    — парсит листы в текстовые чанки
chunks.json
        ↓  load_to_qdrant.py     — создаёт эмбеддинги через OpenAI → загружает в Qdrant
Коллекция Qdrant
        ↓
Ваш AI-агент (RAG-поиск)
```

Бот извлекает 3–5 наиболее релевантных фрагментов для каждого сообщения клиента и отвечает **только** из этого контекста — никаких придуманных цен и сроков.

---

### Структура скриптов

**`excel_to_chunks.py`** — Универсальный парсер Excel.
Читает заголовки колонок из строки `header_row`, затем для каждой строки данных строит чанк вида `Заголовок: значение`. Работает с любым файлом — без привязки к именам листов или порядку колонок. Результат сохраняется в `chunks.json`.

**`load_to_qdrant.py`** — Загрузчик в векторную БД.
Загружает чанки из `chunks.json` (или парсит Excel заново, если файл отсутствует), создаёт векторные эмбеддинги через OpenAI и загружает их в коллекцию Qdrant батчами. Если коллекция уже существует — делает upsert без дублей. В конце автоматически запускает два тестовых запроса.

**`query_test.py`** — Интерактивный тестировщик поиска.
Позволяет проверить базу знаний вручную: в интерактивном режиме (цикл в терминале) или разовым запросом через `--query`. Выводит топ-N результатов с оценкой релевантности и названием листа.

---

### Быстрый старт

```bash
# 1. Установить зависимости
pip install -r requirements.txt

# 2. Заполнить .env (ключи OpenAI и Qdrant)
cp .env.example .env

# 3. Настроить config.yaml (путь к Excel, номера строк с заголовками и данными)

# 4. Запустить Qdrant локально
docker run -d -p 6333:6333 qdrant/qdrant

# 5. Спарсить Excel → chunks.json
python excel_to_chunks.py

# 6. Загрузить в Qdrant
python load_to_qdrant.py

# 7. Протестировать поиск
python query_test.py
```

---

### Обновление базы знаний

Когда команда обновила Excel — просто перезапустите оба скрипта:

```bash
python excel_to_chunks.py
python load_to_qdrant.py
```

Используется `upsert`, поэтому существующие точки обновляются, новые добавляются — дублей не будет.

---

### Системный промпт для бота

```
Ты консультант по продажам. Отвечай ТОЛЬКО на основе предоставленных документов базы знаний.
Если ответа в документах нет — скажи: «Уточню у менеджера»
и попроси контактные данные клиента.
Никогда не придумывай цены, сроки и условия самостоятельно.
```
