export interface Chunk {
  text: string
  metadata: {
    source: string
    sheet?: string
    row?: number
    page?: number
  }
}

export interface UploadProgress {
  step: 'parse' | 'embed' | 'upload' | 'complete' | 'error'
  status: 'idle' | 'running' | 'done' | 'error'
  message?: string
  chunkCount?: number
  chunks?: Chunk[]
}

export interface SearchResult {
  id: string | number
  score: number
  text: string
  source: string
  sheet?: string
  page?: number
  row?: number
}
