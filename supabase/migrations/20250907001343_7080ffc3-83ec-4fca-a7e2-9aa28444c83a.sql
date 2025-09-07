-- Create quiz_solutions table to store sensitive answer data
CREATE TABLE public.quiz_solutions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  match_id UUID NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  question_index INTEGER NOT NULL,
  correct_answer TEXT NOT NULL,
  explanation TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(match_id, question_index)
);

-- Enable RLS on quiz_solutions
ALTER TABLE public.quiz_solutions ENABLE ROW LEVEL SECURITY;

-- Only hosts can access their quiz solutions
CREATE POLICY "Hosts can manage their quiz solutions" 
ON public.quiz_solutions 
FOR ALL 
USING (
  EXISTS (
    SELECT 1 FROM public.matches 
    WHERE matches.id = quiz_solutions.match_id 
    AND matches.host_uid = auth.uid()
  )
) 
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.matches 
    WHERE matches.id = quiz_solutions.match_id 
    AND matches.host_uid = auth.uid()
  )
);

-- Create function to safely create match with separated quiz data
CREATE OR REPLACE FUNCTION public.create_secure_match(
  p_quiz_name TEXT,
  p_quiz_data JSONB
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  match_id UUID;
  question_record RECORD;
  question_index INTEGER := 0;
  safe_quiz JSONB;
  safe_questions JSONB := '[]'::jsonb;
BEGIN
  -- Create the match first to get the ID
  INSERT INTO matches (quiz_name, quiz, host_uid, status, timer_seconds)
  VALUES (p_quiz_name, '{}'::jsonb, auth.uid(), 'lobby', 30)
  RETURNING id INTO match_id;
  
  -- Process each question to separate safe and sensitive data
  FOR question_record IN 
    SELECT * FROM jsonb_array_elements(p_quiz_data->'questions')
  LOOP
    -- Store sensitive data in quiz_solutions
    INSERT INTO quiz_solutions (match_id, question_index, correct_answer, explanation)
    VALUES (
      match_id, 
      question_index, 
      question_record.value->>'correctAnswer',
      question_record.value->>'explanation'
    );
    
    -- Build safe question data (without answers/explanations)
    safe_questions := safe_questions || jsonb_build_object(
      'question', question_record.value->'question',
      'options', question_record.value->'options'
    );
    
    question_index := question_index + 1;
  END LOOP;
  
  -- Update match with safe quiz data
  safe_quiz := jsonb_build_object(
    'quizName', p_quiz_data->>'quizName',
    'questions', safe_questions
  );
  
  UPDATE matches 
  SET quiz = safe_quiz 
  WHERE id = match_id;
  
  RETURN match_id;
END;
$$;

-- Function to get quiz solutions for hosts only
CREATE OR REPLACE FUNCTION public.get_quiz_solutions(p_match_id UUID)
RETURNS TABLE(question_index INTEGER, correct_answer TEXT, explanation TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  -- Verify caller is the host
  IF NOT EXISTS (
    SELECT 1 FROM matches 
    WHERE id = p_match_id AND host_uid = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Only the host can access quiz solutions';
  END IF;
  
  RETURN QUERY
  SELECT qs.question_index, qs.correct_answer, qs.explanation
  FROM quiz_solutions qs
  WHERE qs.match_id = p_match_id
  ORDER BY qs.question_index;
END;
$$;