-- Add timeline_data column to briefs table for enriched timeline visualizations
ALTER TABLE briefs ADD COLUMN IF NOT EXISTS timeline_data jsonb DEFAULT NULL;
