-- Fix the search path issue by updating the function
CREATE OR REPLACE FUNCTION update_player_scores(
  p_match_id UUID,
  p_scores JSONB
) RETURNS VOID AS $$
DECLARE
  score_record RECORD;
  match_host_uid UUID;
BEGIN
  -- Verify that the caller is the host of the match
  SELECT host_uid INTO match_host_uid 
  FROM matches 
  WHERE id = p_match_id;
  
  IF match_host_uid != auth.uid() THEN
    RAISE EXCEPTION 'Only the host can update scores';
  END IF;
  
  -- Update scores for each player
  FOR score_record IN 
    SELECT * FROM jsonb_to_recordset(p_scores) AS x(uid UUID, score INTEGER, ready BOOLEAN)
  LOOP
    UPDATE players 
    SET score = score_record.score, ready = score_record.ready
    WHERE match_id = p_match_id AND uid = score_record.uid;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;