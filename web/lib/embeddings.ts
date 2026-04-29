import OpenAI from 'openai'

const MODEL = 'text-embedding-3-small'
const BATCH_SIZE = 100

function getClient() {
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
}

export async function embedTexts(texts: string[]): Promise<number[][]> {
  const client = getClient()
  const results: number[][] = []
  const batches: string[][] = []

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    batches.push(texts.slice(i, i + BATCH_SIZE))
  }

  for (const batch of batches) {
    const response = await client.embeddings.create({ model: MODEL, input: batch })
    results.push(...response.data.map(d => d.embedding))
  }

  return results
}
