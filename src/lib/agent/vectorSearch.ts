// In-memory vector store for semantic code search during agentic exploration
//
// Uses OpenRouter to access text-embedding-3-small (256 dims) for embeddings
// and brute-force cosine similarity for search.
//
// Optional pgvector persistence (Phase 6): when constructed with
// { repoSlug, commitSha, supabase } the store loads previously-embedded
// chunks for that (repo, commit) from Supabase on `loadFromDb()`, and
// write-through-inserts any new chunks embedded during the run. Reruns at
// the same commit then skip embedding entirely. Persistence failures degrade
// gracefully — the in-memory store keeps working.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../supabase/types";

type EmbeddingsClient = SupabaseClient<Database>;

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
  // Paths for which addDocuments has already been invoked this run. Used by
  // isIndexed() to short-circuit redundant `addDocumentsBackground` calls from
  // the tool executor. NOT populated by loadFromDb — partial cache coverage
  // must not suppress re-embedding of the missing chunks (see indexedChunkKeys).
  private indexedPaths = new Set<string>();
  // Per-chunk cache keys (`path:startLine`) for everything already in memory,
  // including chunks hydrated from Supabase. Used by addDocuments to skip
  // individual chunks whose embeddings we already have.
  private indexedChunkKeys = new Set<string>();
  private apiKey: string;
  private model: string;
  private dimensions: number;
  private pendingEmbeds: Promise<void>[] = [];

  // Phase 6 persistence (optional). All three must be present for writes to fire.
  private repoSlug?: string;
  private commitSha?: string;
  private supabase?: EmbeddingsClient;

  constructor(opts?: {
    model?: string;
    dimensions?: number;
    apiKey?: string;
    repoSlug?: string;
    commitSha?: string;
    supabase?: EmbeddingsClient;
  }) {
    this.model = opts?.model || DEFAULT_MODEL;
    this.dimensions = opts?.dimensions || DEFAULT_DIMENSIONS;
    this.apiKey = opts?.apiKey || process.env.OPENROUTER_API_KEY || "";
    this.repoSlug = opts?.repoSlug;
    this.commitSha = opts?.commitSha;
    this.supabase = opts?.supabase;

    // The pgvector column is fixed at vector(256) (migration 009). If a caller
    // ever asks for different dimensions, disable persistence rather than
    // write/read incompatible vectors into a column that would either reject
    // them or corrupt the cache.
    if (this.supabase && this.dimensions !== DEFAULT_DIMENSIONS) {
      console.warn(
        `[vectorSearch] Disabling persistence: dimensions=${this.dimensions} does not match pgvector column width (${DEFAULT_DIMENSIONS}).`
      );
      this.supabase = undefined;
    }
  }

  /** Whether this store is wired up for pgvector persistence */
  private get persistenceEnabled(): boolean {
    return Boolean(this.supabase && this.repoSlug && this.commitSha);
  }

  /**
   * Load previously-embedded chunks for (repoSlug, commitSha, model) from
   * Supabase into memory. Scopes to the current `model` so a model change
   * produces a fresh cache rather than mixing embedding spaces. Populates
   * `indexedChunkKeys` (per-chunk) — NOT `indexedPaths`, so `addDocuments`
   * still re-embeds any chunk of the same file that wasn't persisted last
   * time. Returns the number of chunks loaded.
   */
  async loadFromDb(): Promise<number> {
    if (!this.persistenceEnabled) return 0;

    try {
      const { data, error } = await this.supabase!
        .from("repo_embeddings")
        .select("path, start_line, end_line, snippet, content, embedding")
        .eq("repo_slug", this.repoSlug!)
        .eq("commit_sha", this.commitSha!)
        .eq("model", this.model);

      if (error) {
        console.warn("[vectorSearch] loadFromDb failed:", error.message);
        return 0;
      }
      if (!data || data.length === 0) return 0;

      for (const row of data) {
        // pgvector returns the embedding as number[] (via supabase-js) or
        // occasionally as a string like "[0.1,0.2,...]" depending on driver.
        const embedding = Array.isArray(row.embedding)
          ? (row.embedding as number[])
          : parseVectorString(row.embedding as unknown as string);
        if (!embedding) continue;

        this.chunks.push({
          embedding,
          content: row.content,
          metadata: {
            path: row.path,
            startLine: row.start_line,
            endLine: row.end_line,
            snippet: row.snippet,
          },
        });
        this.indexedChunkKeys.add(chunkKey(row.path, row.start_line));
      }
      return data.length;
    } catch (err) {
      console.warn("[vectorSearch] loadFromDb threw:", err);
      return 0;
    }
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
   * Add documents to the store. Chunks them code-aware, embeds only the
   * chunks we don't already have (from this run or a prior persisted run),
   * and stores them.
   */
  async addDocuments(
    docs: { path: string; content: string; startLine?: number }[]
  ): Promise<void> {
    if (docs.length === 0) return;

    // Chunk all documents, then filter at the chunk level so partial cache
    // coverage doesn't suppress re-embedding of the missing chunks. We do NOT
    // populate `indexedChunkKeys` / `indexedPaths` yet — if the embed call
    // throws partway through, leaving optimistic markers would cause later
    // reads to treat those chunks as cached and skip them forever.
    const allChunks: { text: string; metadata: ChunkMetadata }[] = [];
    const seenKeysThisCall = new Set<string>();
    for (const doc of docs) {
      const baseLineOffset = doc.startLine ?? 1;
      const chunks = chunkCode(doc.content, doc.path, baseLineOffset);
      for (const chunk of chunks) {
        const key = chunkKey(chunk.metadata.path, chunk.metadata.startLine);
        // Skip chunks we already have persisted, and dedupe within this call.
        if (this.indexedChunkKeys.has(key) || seenKeysThisCall.has(key)) continue;
        seenKeysThisCall.add(key);
        allChunks.push(chunk);
      }
    }

    if (allChunks.length === 0) {
      // No chunks to embed — but record that addDocuments was invoked for these
      // paths so isIndexed() can short-circuit repeat calls.
      for (const doc of docs) this.indexedPaths.add(doc.path);
      return;
    }

    // Embed in batches of 96. Mark chunks as indexed only after the batch
    // succeeds, so a mid-flight embed failure doesn't poison the cache.
    const BATCH_SIZE = 96;
    for (let i = 0; i < allChunks.length; i += BATCH_SIZE) {
      const batch = allChunks.slice(i, i + BATCH_SIZE);
      const texts = batch.map((c) => c.text);

      const data = await this.embed(texts);

      const newlyStored: StoredChunk[] = [];
      for (let j = 0; j < batch.length; j++) {
        const stored: StoredChunk = {
          embedding: data[j].embedding,
          metadata: batch[j].metadata,
          content: batch[j].text,
        };
        this.chunks.push(stored);
        this.indexedChunkKeys.add(
          chunkKey(stored.metadata.path, stored.metadata.startLine)
        );
        newlyStored.push(stored);
      }

      // Write-through to pgvector so reruns at this (repo, commit) skip embedding.
      // Failures here are non-fatal — the in-memory store is the source of truth
      // during the current analysis.
      if (this.persistenceEnabled && newlyStored.length > 0) {
        await this.persistChunks(newlyStored);
      }
    }

    // All batches succeeded — now it's safe to mark the submitted paths as
    // indexed so `isIndexed()` shortcuts redundant background calls.
    for (const doc of docs) this.indexedPaths.add(doc.path);
  }

  /** Upsert stored chunks into Supabase. Swallows errors (non-fatal). */
  private async persistChunks(chunks: StoredChunk[]): Promise<void> {
    if (!this.persistenceEnabled) return;
    try {
      const rows = chunks.map((c) => ({
        repo_slug: this.repoSlug!,
        commit_sha: this.commitSha!,
        path: c.metadata.path,
        start_line: c.metadata.startLine,
        end_line: c.metadata.endLine,
        snippet: c.metadata.snippet,
        content: c.content,
        embedding: c.embedding,
        model: this.model,
      }));

      // Upsert on the unique (repo_slug, commit_sha, path, start_line, model)
      // key. Including `model` in the key means a model change writes new rows
      // rather than colliding with a prior model's embeddings (which live in a
      // different vector space). Re-entering the same chunk within a run is
      // deduped via indexedChunkKeys before we ever get here, but
      // ignoreDuplicates guards against concurrent writers.
      const { error } = await this.supabase!
        .from("repo_embeddings")
        .upsert(rows, {
          onConflict: "repo_slug,commit_sha,path,start_line,model",
          ignoreDuplicates: true,
        });
      if (error) {
        console.warn("[vectorSearch] persistChunks failed:", error.message);
      }
    } catch (err) {
      console.warn("[vectorSearch] persistChunks threw:", err);
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
    this.indexedChunkKeys.clear();
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

/** Stable identity for a chunk within the store: path + start line. */
function chunkKey(path: string, startLine: number): string {
  return `${path}:${startLine}`;
}

/** Parse a pgvector string like "[0.1,0.2,...]" into number[]. */
function parseVectorString(s: string | null | undefined): number[] | null {
  if (!s || typeof s !== "string") return null;
  const trimmed = s.replace(/^\[/, "").replace(/\]$/, "");
  if (!trimmed) return null;
  const parts = trimmed.split(",");
  const out: number[] = new Array(parts.length);
  for (let i = 0; i < parts.length; i++) {
    const n = Number(parts[i]);
    if (!Number.isFinite(n)) return null;
    out[i] = n;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Query-only helper for callers (chat, brief search) that don't want to
// hydrate a full in-memory store. Embeds the query via OpenRouter, then
// dispatches a server-side cosine search through the `match_repo_embeddings`
// RPC (migration 010). Returns [] when no embeddings exist for the
// (repo, commit) — callers should treat that as "no RAG context".
// ---------------------------------------------------------------------------

export interface SearchByRepoOptions {
  supabase: EmbeddingsClient;
  repoSlug: string;
  commitSha: string;
  query: string;
  topK?: number;
  apiKey?: string;
  model?: string;
  dimensions?: number;
}

export interface RepoSearchResult extends SearchResult {
  snippet: string;
}

export async function searchEmbeddingsByRepo(
  opts: SearchByRepoOptions
): Promise<RepoSearchResult[]> {
  const apiKey = opts.apiKey || process.env.OPENROUTER_API_KEY || "";
  if (!apiKey) return [];
  const model = opts.model || DEFAULT_MODEL;
  const dimensions = opts.dimensions || DEFAULT_DIMENSIONS;
  const topK = opts.topK ?? 5;

  // The pgvector column is fixed at vector(256). If the caller asks for a
  // different dimension we'd be comparing against a different vector space;
  // bail rather than return garbage.
  if (dimensions !== DEFAULT_DIMENSIONS) {
    console.warn(
      `[vectorSearch] searchEmbeddingsByRepo: dimensions=${dimensions} does not match pgvector column width (${DEFAULT_DIMENSIONS}); skipping.`
    );
    return [];
  }

  let queryEmbedding: number[];
  try {
    const response = await fetch(OPENROUTER_EMBEDDINGS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://reporecall.dev",
        "X-Title": "RepoRecall RAG",
      },
      body: JSON.stringify({ model, input: [opts.query], dimensions }),
    });
    if (!response.ok) {
      console.warn("[vectorSearch] query embed failed:", await response.text());
      return [];
    }
    const result = await response.json();
    queryEmbedding = result.data?.[0]?.embedding;
    if (!Array.isArray(queryEmbedding)) return [];
  } catch (err) {
    console.warn("[vectorSearch] query embed threw:", err);
    return [];
  }

  try {
    const { data, error } = await opts.supabase.rpc("match_repo_embeddings", {
      query_embedding: queryEmbedding,
      repo: opts.repoSlug,
      sha: opts.commitSha,
      match_count: topK,
    });
    if (error) {
      console.warn("[vectorSearch] match_repo_embeddings failed:", error.message);
      return [];
    }
    if (!data) return [];
    return data.map((row) => ({
      path: row.path,
      startLine: row.start_line,
      endLine: row.end_line,
      score: Math.round(row.similarity * 1000) / 1000,
      content: row.content,
      snippet: row.snippet,
    }));
  } catch (err) {
    console.warn("[vectorSearch] match_repo_embeddings threw:", err);
    return [];
  }
}

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
