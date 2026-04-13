// In-memory vector store for semantic code search during agentic exploration
//
// Uses OpenRouter to access text-embedding-3-small (256 dims) for embeddings
// and brute-force cosine similarity for search. The store is per-analysis and
// not persisted.

const DEFAULT_MODEL = "openai/text-embedding-3-small";
const DEFAULT_DIMENSIONS = 256;
const MAX_TOKENS_PER_CHUNK = 300;
const CHUNK_OVERLAP_TOKENS = 50;
const OPENROUTER_EMBEDDINGS_URL = "https://openrouter.ai/api/v1/embeddings";

export interface ChunkMetadata {
  path: string;
  startLine: number;
  endLine: number;
  snippet: string; // first ~200 chars of the chunk
}

interface StoredChunk {
  embedding: number[];
  metadata: ChunkMetadata;
  content: string;
}

export interface SearchResult {
  path: string;
  startLine: number;
  endLine: number;
  score: number;
  content: string;
}

// Regex patterns for code-aware splitting — matches function/class/export boundaries
const CODE_BOUNDARY_RE =
  /^(?:(?:export\s+)?(?:default\s+)?(?:async\s+)?(?:function|class|interface|type|enum|const|let|var|module)\s|(?:def |class |async def |pub fn |fn |impl |mod ))/m;

export class EmbeddingStore {
  private chunks: StoredChunk[] = [];
  private indexedPaths = new Set<string>();
  private apiKey: string;
  private model: string;
  private dimensions: number;
  private pendingEmbeds: Promise<void>[] = [];

  constructor(opts?: { model?: string; dimensions?: number; apiKey?: string }) {
    this.model = opts?.model || DEFAULT_MODEL;
    this.dimensions = opts?.dimensions || DEFAULT_DIMENSIONS;
    this.apiKey = opts?.apiKey || process.env.OPENROUTER_API_KEY || "";
  }

  /** Number of chunks currently stored */
  get size(): number {
    return this.chunks.length;
  }

  /** Whether a file path has already been indexed */
  isIndexed(path: string): boolean {
    return this.indexedPaths.has(path);
  }

  /**
   * Add documents to the store. Chunks them code-aware, embeds, and stores.
   * Skips files already indexed.
   */
  async addDocuments(
    docs: { path: string; content: string; startLine?: number }[]
  ): Promise<void> {
    // Filter out already-indexed paths
    const newDocs = docs.filter((d) => !this.indexedPaths.has(d.path));
    if (newDocs.length === 0) return;

    // Chunk all documents
    const allChunks: { text: string; metadata: ChunkMetadata }[] = [];
    for (const doc of newDocs) {
      const baseLineOffset = doc.startLine ?? 1;
      const chunks = chunkCode(doc.content, doc.path, baseLineOffset);
      allChunks.push(...chunks);
      this.indexedPaths.add(doc.path);
    }

    if (allChunks.length === 0) return;

    // Embed in batches of 96
    const BATCH_SIZE = 96;
    for (let i = 0; i < allChunks.length; i += BATCH_SIZE) {
      const batch = allChunks.slice(i, i + BATCH_SIZE);
      const texts = batch.map((c) => c.text);

      const data = await this.embed(texts);

      for (let j = 0; j < batch.length; j++) {
        this.chunks.push({
          embedding: data[j].embedding,
          metadata: batch[j].metadata,
          content: batch[j].text,
        });
      }
    }
  }

  /**
   * Fire-and-forget indexing — queues embedding work without blocking the caller.
   * Call `flushPending()` before searching if you need all pending docs indexed.
   */
  addDocumentsBackground(
    docs: { path: string; content: string; startLine?: number }[]
  ): void {
    const promise = this.addDocuments(docs).catch((err) => {
      console.warn("[vectorSearch] Background indexing failed:", err);
    });
    this.pendingEmbeds.push(promise);
  }

  /** Wait for all background indexing to complete */
  async flushPending(): Promise<void> {
    await Promise.allSettled(this.pendingEmbeds);
    this.pendingEmbeds = [];
  }

  /**
   * Search for chunks semantically similar to the query.
   * Returns top-K results sorted by descending cosine similarity.
   */
  async search(query: string, topK = 10): Promise<SearchResult[]> {
    // Flush any pending background embeds first
    await this.flushPending();

    if (this.chunks.length === 0) return [];

    // Embed the query
    const data = await this.embed([query]);
    const queryEmbedding = data[0].embedding;

    // Brute-force cosine similarity
    const scored = this.chunks.map((chunk) => ({
      score: cosineSimilarity(queryEmbedding, chunk.embedding),
      metadata: chunk.metadata,
      content: chunk.content,
    }));

    scored.sort((a, b) => b.score - a.score);

    // Deduplicate: if multiple chunks from the same file region overlap, keep the best
    const seen = new Set<string>();
    const results: SearchResult[] = [];
    for (const item of scored) {
      if (results.length >= topK) break;
      const key = `${item.metadata.path}:${item.metadata.startLine}`;
      if (seen.has(key)) continue;
      seen.add(key);
      results.push({
        path: item.metadata.path,
        startLine: item.metadata.startLine,
        endLine: item.metadata.endLine,
        score: Math.round(item.score * 1000) / 1000,
        content: item.content,
      });
    }

    return results;
  }

  /** Reset the store */
  clear(): void {
    this.chunks = [];
    this.indexedPaths.clear();
    this.pendingEmbeds = [];
  }

  /** Call OpenRouter embeddings endpoint */
  private async embed(
    input: string[]
  ): Promise<{ embedding: number[] }[]> {
    const response = await fetch(OPENROUTER_EMBEDDINGS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://reporecall.dev",
        "X-Title": "RepoRecall Embeddings",
      },
      body: JSON.stringify({
        model: this.model,
        input,
        dimensions: this.dimensions,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Embedding request failed (${response.status}): ${err}`);
    }

    const result = await response.json();
    return result.data as { embedding: number[] }[];
  }
}

// ---------------------------------------------------------------------------
// Chunking
// ---------------------------------------------------------------------------

function chunkCode(
  content: string,
  path: string,
  baseLineOffset: number
): { text: string; metadata: ChunkMetadata }[] {
  const lines = content.split("\n");
  if (lines.length === 0) return [];

  // Try code-aware splitting first
  const boundaries = findCodeBoundaries(lines);

  if (boundaries.length > 1) {
    return chunkByBoundaries(lines, boundaries, path, baseLineOffset);
  }

  // Fallback: fixed-size chunking by approximate token count (~4 chars per token)
  return chunkBySize(lines, path, baseLineOffset);
}

/** Find line indices where code boundaries (function/class declarations) occur */
function findCodeBoundaries(lines: string[]): number[] {
  const boundaries: number[] = [0]; // always start at line 0
  for (let i = 1; i < lines.length; i++) {
    if (CODE_BOUNDARY_RE.test(lines[i])) {
      boundaries.push(i);
    }
  }
  return boundaries;
}

/** Chunk using detected code boundaries, merging small adjacent chunks */
function chunkByBoundaries(
  lines: string[],
  boundaries: number[],
  path: string,
  baseLineOffset: number
): { text: string; metadata: ChunkMetadata }[] {
  const chunks: { text: string; metadata: ChunkMetadata }[] = [];
  const maxChunkLines = MAX_TOKENS_PER_CHUNK; // rough: 1 line ≈ 1-2 tokens avg for code

  for (let i = 0; i < boundaries.length; i++) {
    const start = boundaries[i];
    const end = i + 1 < boundaries.length ? boundaries[i + 1] : lines.length;
    let chunkLines = lines.slice(start, end);

    // If chunk is too small, merge with next boundary
    if (chunkLines.length < 5 && i + 1 < boundaries.length) continue;

    // If chunk is too large, sub-chunk by size
    if (chunkLines.length > maxChunkLines) {
      const subChunks = chunkBySize(chunkLines, path, baseLineOffset + start);
      chunks.push(...subChunks);
      continue;
    }

    const text = chunkLines.join("\n");
    chunks.push({
      text: `// ${path}:${baseLineOffset + start}-${baseLineOffset + end - 1}\n${text}`,
      metadata: {
        path,
        startLine: baseLineOffset + start,
        endLine: baseLineOffset + end - 1,
        snippet: text.slice(0, 200),
      },
    });
  }

  return chunks;
}

/** Fixed-size chunking with overlap */
function chunkBySize(
  lines: string[],
  path: string,
  baseLineOffset: number
): { text: string; metadata: ChunkMetadata }[] {
  const chunks: { text: string; metadata: ChunkMetadata }[] = [];
  const charsPerToken = 4;
  const maxChars = MAX_TOKENS_PER_CHUNK * charsPerToken;
  const overlapChars = CHUNK_OVERLAP_TOKENS * charsPerToken;

  let charCount = 0;
  let chunkStart = 0;

  for (let i = 0; i < lines.length; i++) {
    charCount += lines[i].length + 1; // +1 for newline

    if (charCount >= maxChars || i === lines.length - 1) {
      const chunkLines = lines.slice(chunkStart, i + 1);
      const text = chunkLines.join("\n");

      chunks.push({
        text: `// ${path}:${baseLineOffset + chunkStart}-${baseLineOffset + i}\n${text}`,
        metadata: {
          path,
          startLine: baseLineOffset + chunkStart,
          endLine: baseLineOffset + i,
          snippet: text.slice(0, 200),
        },
      });

      // Move start back by overlap amount
      charCount = 0;
      let overlapCount = 0;
      let newStart = i + 1;
      for (let j = i; j > chunkStart && overlapCount < overlapChars; j--) {
        overlapCount += lines[j].length + 1;
        newStart = j;
      }
      chunkStart = newStart;
      charCount = 0;
    }
  }

  return chunks;
}

// ---------------------------------------------------------------------------
// Math
// ---------------------------------------------------------------------------

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}
