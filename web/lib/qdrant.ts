import { QdrantClient } from '@qdrant/js-client-rest'
import type { Chunk, SearchResult } from './types'
import { v4 as uuidv4 } from 'uuid'

const DIMENSION = 1536
const UPSERT_BATCH = 100
const PROJECT_NAME_RE = /^[a-zA-Z0-9_-]{1,48}$/

let cachedClient: QdrantClient | null = null
let cachedFor: { url: string; apiKey: string | undefined } | null = null

function getClient(): QdrantClient {
  const url = process.env.QDRANT_URL ?? 'http://localhost:6333'
  const apiKey = process.env.QDRANT_API_KEY || undefined

  if (cachedClient && cachedFor && cachedFor.url === url && cachedFor.apiKey === apiKey) {
    return cachedClient
  }

  cachedClient = new QdrantClient({ url, apiKey })
  cachedFor = { url, apiKey }
  return cachedClient
}

export function defaultProject(): string {
  return process.env.QDRANT_COLLECTION ?? 'knowledge_base'
}

export function isValidProjectName(name: string): boolean {
  return PROJECT_NAME_RE.test(name)
}

function assertValid(name: string) {
  if (!isValidProjectName(name)) {
    throw new Error('Invalid project name. Use 1–48 chars: letters, digits, "-", "_".')
  }
}

function extractVectorSize(vectors: unknown): number | undefined {
  if (!vectors || typeof vectors !== 'object') return undefined
  const v = vectors as Record<string, unknown>
  if (typeof v.size === 'number') return v.size
  for (const value of Object.values(v)) {
    if (value && typeof value === 'object' && typeof (value as { size?: unknown }).size === 'number') {
      return (value as { size: number }).size
    }
  }
  return undefined
}

export async function listProjects(): Promise<string[]> {
  const client = getClient()
  const { collections } = await client.getCollections()
  return collections.map(c => c.name).sort()
}

export async function ensureCollection(collection: string): Promise<void> {
  assertValid(collection)
  const client = getClient()

  const { collections } = await client.getCollections()
  const exists = collections.some(c => c.name === collection)

  if (exists) {
    const info = await client.getCollection(collection)
    const dim = extractVectorSize(info.config?.params?.vectors)
    if (dim !== undefined && dim !== DIMENSION) {
      await client.deleteCollection(collection)
      await createCollection(client, collection)
    }
    return
  }

  try {
    await createCollection(client, collection)
  } catch (err) {
    const recheck = await client.getCollections()
    if (!recheck.collections.some(c => c.name === collection)) throw err
  }
}

async function createCollection(client: QdrantClient, collection: string) {
  await client.createCollection(collection, {
    vectors: { size: DIMENSION, distance: 'Cosine' },
  })
}

export async function deleteProject(collection: string): Promise<void> {
  assertValid(collection)
  const client = getClient()
  await client.deleteCollection(collection)
}

export async function upsertChunks(
  collection: string,
  chunks: Chunk[],
  vectors: number[][],
): Promise<void> {
  assertValid(collection)
  if (chunks.length !== vectors.length) {
    throw new Error(`Vector/chunk count mismatch: ${chunks.length} vs ${vectors.length}`)
  }
  const client = getClient()

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

  for (let i = 0; i < points.length; i += UPSERT_BATCH) {
    await client.upsert(collection, { wait: true, points: points.slice(i, i + UPSERT_BATCH) })
  }
}

export async function searchQdrant(
  collection: string,
  queryVector: number[],
  topK: number,
): Promise<SearchResult[]> {
  assertValid(collection)
  const client = getClient()

  const response = await client.query(collection, {
    query: queryVector,
    limit: topK,
    with_payload: true,
  })

  return response.points.map(r => ({
    id: r.id as string,
    score: r.score ?? 0,
    text: (r.payload?.text as string) ?? '',
    source: (r.payload?.source as string) ?? '',
    sheet: (r.payload?.sheet as string) ?? undefined,
    page: r.payload?.page != null ? Number(r.payload.page) : undefined,
    row: r.payload?.row != null ? Number(r.payload.row) : undefined,
  }))
}
