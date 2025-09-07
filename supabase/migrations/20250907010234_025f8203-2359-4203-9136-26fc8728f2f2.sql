-- Allow all players in a match to view quiz solutions (needed for answer review screen)
DROP POLICY IF EXISTS "Hosts can manage their quiz solutions" ON quiz_solutions;

-- Create separate policies for viewing and managing
CREATE POLICY "Players can view quiz solutions in their matches" 
ON quiz_solutions 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM players 
    WHERE players.match_id = quiz_solutions.match_id 
    AND players.uid = auth.uid()
  )
);

CREATE POLICY "Hosts can manage their quiz solutions" 
ON quiz_solutions 
FOR ALL 
USING (
  EXISTS (
    SELECT 1 FROM matches 
    WHERE matches.id = quiz_solutions.match_id 
    AND matches.host_uid = auth.uid()
  )
) 
WITH CHECK (
  EXISTS (
    SELECT 1 FROM matches 
    WHERE matches.id = quiz_solutions.match_id 
    AND matches.host_uid = auth.uid()
  )
);