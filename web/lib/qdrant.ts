import { QdrantClient } from '@qdrant/js-client-rest'
import type { Chunk, SearchResult } from './types'
import { v4 as uuidv4 } from 'uuid'

const DIMENSION = 1536

function getClient() {
  return new QdrantClient({
    url: process.env.QDRANT_URL ?? 'http://localhost:6333',
    apiKey: process.env.QDRANT_API_KEY || undefined,
  })
}

function getCollection() {
  return process.env.QDRANT_COLLECTION ?? 'knowledge_base'
}

export async function ensureCollection(): Promise<void> {
  const client = getClient()
  const collection = getCollection()

  const { collections } = await client.getCollections()
  const exists = collections.some(c => c.name === collection)

  if (exists) {
    const info = await client.getCollection(collection)
    const dim = (info.config?.params?.vectors as { size?: number })?.size
    if (dim && dim !== DIMENSION) {
      await client.deleteCollection(collection)
      await createCollection(client, collection)
    }
    return
  }

  await createCollection(client, collection)
}

async function createCollection(client: QdrantClient, collection: string) {
  await client.createCollection(collection, {
    vectors: { size: DIMENSION, distance: 'Cosine' },
  })
}

export async function upsertChunks(
  chunks: Chunk[],
  vectors: number[][]
): Promise<void> {
  const client = getClient()
  const collection = getCollection()

  const points = chunks.map((chunk, i) => ({
    id: uuidv4(),
    vector: vectors[i],
    payload: {
      text: chunk.text,
      source: chunk.metadata.source,
      sheet: chunk.metadata.sheet ?? null,
      page: chunk.metadata.page ?? null,
      row: chunk.metadata.row ?? null,
    },
  }))

  const BATCH = 100
  for (let i = 0; i < points.length; i += BATCH) {
    await client.upsert(collection, { wait: true, points: points.slice(i, i + BATCH) })
  }
}

export async function searchQdrant(
  queryVector: number[],
  topK: number
): Promise<SearchResult[]> {
  const client = getClient()
  const collection = getCollection()

  const results = await client.search(collection, {
    vector: queryVector,
    limit: topK,
    with_payload: true,
  })

  return results.map(r => ({
    id: r.id as string,
    score: r.score,
    text: (r.payload?.text as string) ?? '',
    source: (r.payload?.source as string) ?? '',
    sheet: (r.payload?.sheet as string) ?? undefined,
    page: r.payload?.page != null ? Number(r.payload.page) : undefined,
    row: r.payload?.row != null ? Number(r.payload.row) : undefined,
  }))
}
