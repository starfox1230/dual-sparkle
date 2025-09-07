-- Migrate existing matches to secure format (fixed)
DO $$
DECLARE
  match_record RECORD;
  question_record RECORD;
  q_index INTEGER;
  safe_quiz JSONB;
  safe_questions JSONB := '[]'::jsonb;
BEGIN
  -- Process each existing match
  FOR match_record IN 
    SELECT id, quiz, host_uid FROM matches 
    WHERE quiz ? 'questions' 
    AND EXISTS (
      SELECT 1 FROM jsonb_array_elements(quiz->'questions') AS q 
      WHERE q ? 'correctAnswer'
    )
  LOOP
    q_index := 0;
    safe_questions := '[]'::jsonb;
    
    -- Process each question in the match
    FOR question_record IN 
      SELECT * FROM jsonb_array_elements(match_record.quiz->'questions')
    LOOP
      -- Insert solution data into quiz_solutions table
      INSERT INTO quiz_solutions (match_id, question_index, correct_answer, explanation)
      VALUES (
        match_record.id,
        q_index,
        question_record.value->>'correctAnswer',
        question_record.value->>'explanation'
      )
      ON CONFLICT (match_id, question_index) DO NOTHING;
      
      -- Build safe question (without answers/explanations)
      safe_questions := safe_questions || jsonb_build_object(
        'question', question_record.value->'question',
        'options', question_record.value->'options'
      );
      
      q_index := q_index + 1;
    END LOOP;
    
    -- Update match with safe quiz data
    safe_quiz := jsonb_build_object(
      'quizName', match_record.quiz->>'quizName',
      'questions', safe_questions
    );
    
    UPDATE matches 
    SET quiz = safe_quiz 
    WHERE id = match_record.id;
    
  END LOOP;
  
  RAISE NOTICE 'Successfully migrated existing matches to secure format';
END $$;