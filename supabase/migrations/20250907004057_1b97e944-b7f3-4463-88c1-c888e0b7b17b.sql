-- Fix RLS policy for answers table to allow real-time updates
-- Drop the existing policy and create a more reliable one using IN instead of EXISTS

DROP POLICY IF EXISTS "Players can view answers in their matches" ON public.answers;

-- Create improved policy for real-time updates
CREATE POLICY "Players can view answers in their matches" 
ON public.answers 
FOR SELECT 
USING (
  auth.uid() IN (
    SELECT players.uid
    FROM players
    WHERE players.match_id = answers.match_id
  )
);