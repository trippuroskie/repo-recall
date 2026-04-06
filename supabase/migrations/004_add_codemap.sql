-- Add codemap column to briefs table for agentic analysis results
ALTER TABLE briefs ADD COLUMN IF NOT EXISTS codemap jsonb DEFAULT NULL;
