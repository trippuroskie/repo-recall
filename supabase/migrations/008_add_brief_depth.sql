-- Add depth column to briefs tables to record whether a brief was produced by
-- standard or deep (multi-cycle) agentic analysis. Nullable so existing rows
-- are treated as "standard" by the application layer.
ALTER TABLE briefs ADD COLUMN IF NOT EXISTS depth text DEFAULT NULL;
ALTER TABLE public_briefs ADD COLUMN IF NOT EXISTS depth text DEFAULT NULL;
