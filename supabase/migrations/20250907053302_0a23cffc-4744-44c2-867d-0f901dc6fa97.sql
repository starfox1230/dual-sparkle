-- Add answered column to players table for answer tracking
ALTER TABLE public.players 
ADD COLUMN answered boolean NOT NULL DEFAULT false;