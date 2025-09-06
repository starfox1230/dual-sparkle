-- Create matches table
CREATE TABLE public.matches (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  quiz_name TEXT NOT NULL,
  quiz JSONB NOT NULL,
  host_uid UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'lobby' CHECK (status IN ('lobby', 'question_reveal', 'answering', 'round_end', 'finished')),
  current_question_index INTEGER NOT NULL DEFAULT 0,
  phase_start TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  timer_seconds INTEGER NOT NULL DEFAULT 30,
  is_public BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create players table
CREATE TABLE public.players (
  match_id UUID NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  uid UUID NOT NULL,
  name TEXT NOT NULL,
  joined_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  ready BOOLEAN NOT NULL DEFAULT false,
  score INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (match_id, uid)
);

-- Create answers table
CREATE TABLE public.answers (
  match_id UUID NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  uid UUID NOT NULL,
  question_index INTEGER NOT NULL,
  choice_index INTEGER NOT NULL,
  choice_text TEXT NOT NULL,
  is_correct BOOLEAN,
  points INTEGER,
  submitted_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  PRIMARY KEY (match_id, uid, question_index)
);

-- Create indexes for performance
CREATE INDEX idx_players_match_id ON public.players(match_id);
CREATE INDEX idx_answers_match_id ON public.answers(match_id);

-- Enable RLS
ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.players ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.answers ENABLE ROW LEVEL SECURITY;

-- RLS Policies for matches
CREATE POLICY "Anyone can view public matches" ON public.matches
FOR SELECT USING (is_public = true);

CREATE POLICY "Authenticated users can create matches" ON public.matches
FOR INSERT WITH CHECK (auth.uid() IS NOT NULL AND auth.uid() = host_uid);

CREATE POLICY "Host can update their matches" ON public.matches
FOR UPDATE USING (auth.uid() = host_uid);

-- RLS Policies for players
CREATE POLICY "Anyone can view players in public matches" ON public.players
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.matches m 
    WHERE m.id = match_id AND m.is_public = true
  )
);

CREATE POLICY "Authenticated users can join as players" ON public.players
FOR INSERT WITH CHECK (
  auth.uid() IS NOT NULL AND 
  auth.uid() = uid AND
  EXISTS (
    SELECT 1 FROM public.matches m 
    WHERE m.id = match_id AND m.is_public = true
  )
);

CREATE POLICY "Players can update their own data" ON public.players
FOR UPDATE USING (auth.uid() = uid);

-- RLS Policies for answers
CREATE POLICY "Players can view answers in their matches" ON public.answers
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.players p 
    WHERE p.match_id = answers.match_id AND p.uid = auth.uid()
  )
);

CREATE POLICY "Players can submit their own answers" ON public.answers
FOR INSERT WITH CHECK (
  auth.uid() IS NOT NULL AND 
  auth.uid() = uid AND
  EXISTS (
    SELECT 1 FROM public.players p 
    WHERE p.match_id = answers.match_id AND p.uid = auth.uid()
  )
);

-- Create function to start game phases
CREATE OR REPLACE FUNCTION start_phase(
  p_match_id UUID,
  p_status TEXT,
  p_qindex INTEGER DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
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

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.matches;
ALTER PUBLICATION supabase_realtime ADD TABLE public.players; 
ALTER PUBLICATION supabase_realtime ADD TABLE public.answers;