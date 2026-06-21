-- ============================================================
-- StudyGenie AI — Supabase pgvector Schema
-- Run this SQL in your Supabase project SQL Editor
-- ============================================================

-- 1. Enable pgvector extension
create extension if not exists vector;

-- 2. Document chunks table — stores text + embedding for RAG
create table if not exists document_chunks (
  id           uuid        primary key default gen_random_uuid(),
  document_id  text        not null,
  chunk_index  int         not null,
  content      text        not null,
  embedding    vector,     -- dimension is dynamic (set by model output)
  created_at   timestamptz default now()
);

-- 3. Index for fast approximate-nearest-neighbor search (cosine distance)
--    NOTE: Run this AFTER inserting some data — ivfflat needs rows to build lists.
--    If you get an error on a fresh table, skip this and add it later.
create index if not exists document_chunks_embedding_idx
  on document_chunks using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

-- 4. Index on document_id for fast per-document filtering
create index if not exists document_chunks_doc_id_idx
  on document_chunks (document_id);

-- 5. Semantic search RPC function
--    Returns content + cosine similarity score for the top N chunks
--    matching a given document_id and query embedding.
create or replace function match_documents(
  query_embedding    vector,
  match_document_id  text,
  match_count        int     default 5,
  match_threshold    float   default 0.3
)
returns table (
  content    text,
  similarity float
)
language sql
stable
as $$
  select
    content,
    1 - (embedding <=> query_embedding) as similarity
  from document_chunks
  where
    document_id = match_document_id
    and 1 - (embedding <=> query_embedding) > match_threshold
  order by embedding <=> query_embedding
  limit match_count;
$$;

-- 6. Optional: TTL cleanup function — delete chunks older than N days
--    Schedule this with pg_cron or call it manually.
create or replace function cleanup_old_chunks(older_than_days int default 7)
returns void
language sql
as $$
  delete from document_chunks
  where created_at < now() - (older_than_days || ' days')::interval;
$$;
