-- Fix get_quiz_solutions function to allow player access during answering phase
CREATE OR REPLACE FUNCTION get_quiz_solutions(p_match_id uuid)
RETURNS TABLE(question_index integer, correct_answer text, explanation text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  match_status TEXT;
BEGIN
  -- Check match status
  SELECT status INTO match_status 
  FROM matches 
  WHERE id = p_match_id;
  
  -- Allow hosts to always access solutions
  IF EXISTS (
    SELECT 1 FROM matches 
    WHERE id = p_match_id AND host_uid = auth.uid()
  ) THEN
    RETURN QUERY
    SELECT qs.question_index, qs.correct_answer, qs.explanation
    FROM quiz_solutions qs
    WHERE qs.match_id = p_match_id
    ORDER BY qs.question_index;
    RETURN;
  END IF;
  
  -- Allow players to view solutions during answering, round_end, or finished phases
  IF match_status IN ('answering', 'round_end', 'finished') AND EXISTS (
    SELECT 1 FROM players 
    WHERE match_id = p_match_id AND uid = auth.uid()
  ) THEN
    RETURN QUERY
    SELECT qs.question_index, qs.correct_answer, qs.explanation
    FROM quiz_solutions qs
    WHERE qs.match_id = p_match_id
    ORDER BY qs.question_index;
    RETURN;
  END IF;
  
  -- Otherwise, deny access
  RAISE EXCEPTION 'Access denied to quiz solutions';
END;
$$;