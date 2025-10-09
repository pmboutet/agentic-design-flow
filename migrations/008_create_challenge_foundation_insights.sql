-- Create table for challenge foundation insights relationships
CREATE TABLE IF NOT EXISTS public.challenge_foundation_insights (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  challenge_id UUID NOT NULL REFERENCES public.challenges(id) ON DELETE CASCADE,
  insight_id UUID NOT NULL REFERENCES public.insights(id) ON DELETE CASCADE,
  priority VARCHAR(20) NOT NULL DEFAULT 'medium', -- low, medium, high, critical
  reason TEXT, -- Why this insight is foundational for this challenge
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(challenge_id, insight_id)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_challenge_foundation_insights_challenge_id ON public.challenge_foundation_insights(challenge_id);
CREATE INDEX IF NOT EXISTS idx_challenge_foundation_insights_insight_id ON public.challenge_foundation_insights(insight_id);
CREATE INDEX IF NOT EXISTS idx_challenge_foundation_insights_priority ON public.challenge_foundation_insights(priority);

-- Add RLS policies
ALTER TABLE public.challenge_foundation_insights ENABLE ROW LEVEL SECURITY;

-- Policy for authenticated users to read foundation insights
CREATE POLICY "Users can read challenge foundation insights" ON public.challenge_foundation_insights
  FOR SELECT USING (auth.role() = 'authenticated');

-- Policy for authenticated users to insert foundation insights
CREATE POLICY "Users can insert challenge foundation insights" ON public.challenge_foundation_insights
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- Policy for authenticated users to update foundation insights
CREATE POLICY "Users can update challenge foundation insights" ON public.challenge_foundation_insights
  FOR UPDATE USING (auth.role() = 'authenticated');

-- Policy for authenticated users to delete foundation insights
CREATE POLICY "Users can delete challenge foundation insights" ON public.challenge_foundation_insights
  FOR DELETE USING (auth.role() = 'authenticated');
