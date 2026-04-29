# RAG Knowledge Base Loader

A ready-to-use pipeline that turns a structured Excel knowledge base into a searchable vector database in [Qdrant](https://qdrant.tech). Built for AI sales consultants and customer-support bots.

## How it works

```
Excel (filled by your team)
        ↓  excel_to_chunks.py    — parse sheets into text chunks
chunks.json
        ↓  load_to_qdrant.py     — embed with OpenAI → upsert to Qdrant
Qdrant collection
        ↓
Your AI agent (RAG retrieval)
```

The bot retrieves the 3–5 most relevant chunks for each customer message and answers **only** from that context — no hallucinated prices or deadlines.

---

## Excel template structure

The pipeline expects an Excel file with these six sheets (names configurable in `config.yaml`):

| Sheet | Contents |
|-------|----------|
| 1 · Catalog | Products / services with characteristics and prices |
| 2 · FAQ | Customer questions + ready-made bot answers |
| 3 · Qualification | Step-by-step lead qualification scenario |
| 4 · Conditions | Work terms: measurement, delivery, payment, warranty |
| 5 · Escalation | Rules for when to hand off to a human manager |
| 6 · Stop-topics | Topics the bot must not answer on its own |

> A ready-to-fill Excel template is included in the repo as `knowledge_base_template.xlsx`.

---

## Quick start

### 1 · Clone and install

```bash
git clone https://github.com/your-username/rag-knowledge-base.git
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
  path: "knowledge_base.xlsx"   # path to your filled Excel file

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
├── requirements.txt
└── knowledge_base_template.xlsx   # Excel template to fill
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

Это готовый пайплайн для создания базы знаний AI-бота продаж или поддержки клиентов. Пайплайн превращает структурированный Excel-файл в векторную базу данных Qdrant, из которой бот достаёт релевантные фрагменты при ответе на вопросы клиентов (RAG — Retrieval-Augmented Generation).

```
Excel (заполняется командой)
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

**`excel_to_chunks.py`** — Парсер Excel-файла.
Читает шесть листов базы знаний и превращает каждую строку в текстовый фрагмент (чанк) с метаданными (лист, категория, номер строки). Результат сохраняется в `chunks.json`.

Поддерживаемые листы:

| Лист | Содержимое |
|------|-----------|
| 1 · Каталог | Товары / услуги с характеристиками и ценами |
| 2 · FAQ | Вопросы клиентов + готовые ответы бота |
| 3 · Квалификация | Пошаговый сценарий квалификации лида |
| 4 · Условия работы | Замер, доставка, оплата, гарантия |
| 5 · Эскалация | Правила передачи диалога менеджеру |
| 6 · Стоп-слова | Темы, на которые бот не отвечает самостоятельно |

**`load_to_qdrant.py`** — Загрузчик в векторную БД.
Загружает чанки из `chunks.json` (или парсит Excel заново, если файл отсутствует), создаёт векторные эмбеддинги через OpenAI и загружает их в коллекцию Qdrant батчами. Если коллекция уже существует — делает upsert без дублей. В конце автоматически запускает два тестовых запроса для проверки работоспособности.

**`query_test.py`** — Интерактивный тестировщик поиска.
Позволяет проверить базу знаний вручную: либо в интерактивном режиме (вводи запросы в терминале), либо разовым запросом через аргумент `--query`. Выводит топ-N результатов с оценкой релевантности, листом и категорией.

---

### Быстрый старт

```bash
# 1. Установить зависимости
pip install -r requirements.txt

# 2. Заполнить .env (ключи OpenAI и Qdrant)
cp .env.example .env

# 3. Настроить config.yaml (имя проекта, путь к Excel, имена листов)

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
