-- Create the missing generate_random_id function
CREATE OR REPLACE FUNCTION generate_random_id()
RETURNS TEXT
LANGUAGE SQL
AS $$
  SELECT substring(gen_random_uuid()::text, 1, 8);
$$;

-- Drop and recreate the create_secure_match function with correct return type
DROP FUNCTION IF EXISTS create_secure_match(text, jsonb, integer);

CREATE OR REPLACE FUNCTION create_secure_match(
  p_quiz_name TEXT,
  p_quiz_data JSONB,
  p_timer_seconds INTEGER DEFAULT 15
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  match_id UUID;
  solutions JSONB;
BEGIN
  -- Generate a unique match ID as UUID
  match_id := gen_random_uuid();
  
  -- Extract solutions from quiz data
  solutions := jsonb_build_array();
  FOR i IN 0..jsonb_array_length(p_quiz_data->'questions') - 1 LOOP
    solutions := solutions || jsonb_build_object(
      'question_index', i,
      'correct_answer', p_quiz_data->'questions'->i->>'correctAnswer',
      'explanation', COALESCE(p_quiz_data->'questions'->i->>'explanation', '')
    );
  END LOOP;
  
  -- Create the match record
  INSERT INTO matches (
    id,
    quiz_name,
    host_uid,
    status,
    current_question_index,
    timer_seconds,
    created_at
  ) VALUES (
    match_id,
    p_quiz_name,
    auth.uid(),
    'lobby',
    0,
    p_timer_seconds,
    now()
  );
  
  -- Store quiz solutions separately in the secure table
  INSERT INTO quiz_solutions (
    match_id,
    solutions
  ) VALUES (
    match_id,
    solutions
  );
  
  -- Store the public quiz data (without answers)
  INSERT INTO quiz_data (
    match_id,
    quiz_name,
    questions
  ) VALUES (
    match_id,
    p_quiz_name,
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'question', q->>'question',
          'options', q->'options'
        ) ORDER BY ordinality - 1
      )
      FROM jsonb_array_elements(p_quiz_data->'questions') WITH ORDINALITY AS q
    )
  );
  
  RETURN match_id;
END;
$$;