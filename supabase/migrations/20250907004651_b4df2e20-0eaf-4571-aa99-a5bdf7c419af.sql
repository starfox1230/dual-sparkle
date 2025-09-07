-- Enable realtime for answers table
ALTER TABLE public.answers REPLICA IDENTITY FULL;

-- Add answers table to realtime publication if not already added
ALTER PUBLICATION supabase_realtime ADD TABLE public.answers;