-- Fix the create_secure_match function to handle JSONB operations correctly
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
  safe_quiz JSONB;
  question_element JSONB;
  i INTEGER := 0;
BEGIN
  -- Generate a unique match ID as UUID
  match_id := gen_random_uuid();
  
  -- Extract solutions from quiz data
  solutions := jsonb_build_array();
  
  -- Loop through questions using proper JSONB handling
  WHILE i < jsonb_array_length(p_quiz_data->'questions') LOOP
    question_element := p_quiz_data->'questions'->i;
    solutions := solutions || jsonb_build_object(
      'question_index', i,
      'correct_answer', question_element->>'correctAnswer',
      'explanation', COALESCE(question_element->>'explanation', '')
    );
    i := i + 1;
  END LOOP;
  
  -- Create safe quiz data (without answers and explanations)
  safe_quiz := jsonb_build_object(
    'quizName', p_quiz_data->>'quizName',
    'questions', (
      SELECT jsonb_agg(
        jsonb_build_object(
          'question', elem->>'question',
          'options', elem->'options'
        ) ORDER BY idx
      )
      FROM jsonb_array_elements(p_quiz_data->'questions') WITH ORDINALITY AS t(elem, idx)
    )
  );
  
  -- Create the match record with safe quiz data
  INSERT INTO matches (
    id,
    quiz_name,
    quiz,
    host_uid,
    status,
    current_question_index,
    timer_seconds,
    created_at
  ) VALUES (
    match_id,
    p_quiz_name,
    safe_quiz,
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
  
  -- Store the public quiz data (without answers) in quiz_data table
  INSERT INTO quiz_data (
    match_id,
    quiz_name,
    questions
  ) VALUES (
    match_id,
    p_quiz_name,
    safe_quiz->'questions'
  );
  
  RETURN match_id;
END;
$$;