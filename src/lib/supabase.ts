import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://bdspbocabpfvljkodjqf.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJkc3Bib2NhYnBmdmxqa29kanFmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTcxNzcyMjEsImV4cCI6MjA3Mjc1MzIyMX0.vWVU67a0Y6OdFbrcGulHBOx4Fw8N9UdsrYLyxwGRztA';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
});

// Types for our database schema
export interface Quiz {
  quizName: string;
  questions: Question[];
}

export interface Question {
  question: string;
  options: string[];
  correctAnswer: string;
  explanation?: string;
}

export interface Match {
  id: string;
  quiz_name: string;
  quiz: Quiz;
  host_uid: string;
  status: 'lobby' | 'question_reveal' | 'answering' | 'round_end' | 'finished';
  current_question_index: number;
  phase_start: string;
  timer_seconds: number;
  is_public: boolean;
  created_at: string;
}

export interface Player {
  match_id: string;
  uid: string;
  name: string;
  joined_at: string;
  ready: boolean;
  score: number;
}

export interface Answer {
  match_id: string;
  uid: string;
  question_index: number;
  choice_index: number;
  choice_text: string;
  is_correct?: boolean;
  points?: number;
  submitted_at: string;
}

// Auth helper functions
export async function ensureAuth(): Promise<any> {
  try {
    let { data: { session } } = await supabase.auth.getSession();
    
    if (!session) {
      console.log('No session found, attempting anonymous auth...');
      // Try anonymous auth first
      const { data, error } = await supabase.auth.signInAnonymously();
      if (error) {
        console.error('Anonymous auth failed:', error);
        throw new Error(`Authentication failed: ${error.message}`);
      }
      console.log('Anonymous auth successful');
    }
    
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError) {
      console.error('Failed to get user:', userError);
      throw new Error(`Failed to get user: ${userError.message}`);
    }
    
    if (!user) {
      throw new Error('No user found after authentication');
    }
    
    return user;
  } catch (error) {
    console.error('ensureAuth error:', error);
    throw error;
  }
}

// Match management functions
export async function createMatch(quiz: Quiz, hostName: string): Promise<Match> {
  const user = await ensureAuth();
  
  const { data: match, error: mErr } = await supabase
    .from('matches')
    .insert({
      quiz_name: quiz.quizName,
      quiz,
      host_uid: user.id,
      status: 'lobby',
      timer_seconds: 30,
    })
    .select('*')
    .single();
    
  if (mErr) throw mErr;
  
  // Add host as first player
  const { error: pErr } = await supabase
    .from('players')
    .insert({
      match_id: match.id,
      uid: user.id,
      name: hostName || 'Host',
      ready: false,
      score: 0,
    });
    
  if (pErr) throw pErr;
  
  return match;
}

export async function joinMatch(matchId: string, playerName: string): Promise<void> {
  const user = await ensureAuth();
  
  const { error } = await supabase
    .from('players')
    .insert({
      match_id: matchId,
      uid: user.id,
      name: playerName || 'Player',
      ready: false,
      score: 0,
    });
    
  if (error) throw error;
}

export async function startPhase(matchId: string, status: string, questionIndex?: number): Promise<void> {
  const { error } = await supabase.rpc('start_phase', {
    p_match_id: matchId,
    p_status: status,
    p_qindex: questionIndex,
  });
  
  if (error) throw error;
}