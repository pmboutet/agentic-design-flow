-- Migration: Add thinking mode configuration to AI model configs
-- Description: Adds support for Claude's extended thinking mode
-- Date: 2025-03-29

-- Add columns for thinking mode configuration
ALTER TABLE ai_model_configs
ADD COLUMN IF NOT EXISTS enable_thinking BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS thinking_budget_tokens INTEGER DEFAULT 10000;

-- Add constraints
ALTER TABLE ai_model_configs
ADD CONSTRAINT thinking_budget_min_tokens CHECK (
  thinking_budget_tokens IS NULL OR thinking_budget_tokens >= 1024
);

-- Add comment
COMMENT ON COLUMN ai_model_configs.enable_thinking IS 'Enable Claude extended thinking mode for this model';
COMMENT ON COLUMN ai_model_configs.thinking_budget_tokens IS 'Maximum tokens for Claude internal reasoning (min: 1024)';
