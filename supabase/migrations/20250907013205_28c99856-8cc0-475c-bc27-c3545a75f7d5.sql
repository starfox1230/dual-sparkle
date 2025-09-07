-- First, let's see what tables we actually have and create what's missing
-- Create quiz_data table if it doesn't exist
CREATE TABLE IF NOT EXISTS quiz_data (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  match_id UUID NOT NULL,
  quiz_name TEXT NOT NULL,
  questions JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on quiz_data
ALTER TABLE quiz_data ENABLE ROW LEVEL SECURITY;

-- Create policies for quiz_data
CREATE POLICY "Anyone can view quiz data in public matches" 
ON quiz_data 
FOR SELECT 
USING (EXISTS (
  SELECT 1 FROM matches 
  WHERE matches.id = quiz_data.match_id 
  AND matches.is_public = true
));

-- Now fix the create_secure_match function to work with the ACTUAL schema
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
  safe_quiz JSONB;
  question_element JSONB;
  i INTEGER := 0;
BEGIN
  -- Generate a unique match ID as UUID
  match_id := gen_random_uuid();
  
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
  
  -- Store quiz solutions in the EXISTING schema (individual rows)
  WHILE i < jsonb_array_length(p_quiz_data->'questions') LOOP
    question_element := p_quiz_data->'questions'->i;
    
    INSERT INTO quiz_solutions (
      match_id,
      question_index,
      correct_answer,
      explanation
    ) VALUES (
      match_id,
      i,
      question_element->>'correctAnswer',
      COALESCE(question_element->>'explanation', '')
    );
    
    i := i + 1;
  END LOOP;
  
  -- Store the public quiz data in quiz_data table
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