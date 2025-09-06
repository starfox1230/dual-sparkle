-- Fix security issue: Update function to set proper search_path
CREATE OR REPLACE FUNCTION start_phase(
  p_match_id UUID,
  p_status TEXT,
  p_qindex INTEGER DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.matches 
  SET 
    status = p_status,
    phase_start = now(),
    current_question_index = COALESCE(p_qindex, current_question_index)
  WHERE id = p_match_id AND host_uid = auth.uid();
END;
$$;