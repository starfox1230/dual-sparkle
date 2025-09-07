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

export interface SafeQuiz {
  quizName: string;
  questions: SafeQuestion[];
}

export interface SafeQuestion {
  question: string;
  options: string[];
}

export interface Question {
  question: string;
  options: string[];
  correctAnswer: string;
  explanation?: string;
}

export interface QuizSolution {
  question_index: number;
  correct_answer: string;
  explanation?: string;
}

export interface Match {
  id: string;
  quiz_name: string;
  quiz: SafeQuiz; // Now contains only safe data (no answers)
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
  answered: boolean;
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
export async function createMatch(quiz: Quiz, hostName: string, timerSeconds: number = 15): Promise<Match> {
  const user = await ensureAuth();
  
  console.log('🔒 Creating secure match with separated quiz data');
  
  // Use the secure function to create match with separated data
  const { data: matchId, error: createErr } = await supabase.rpc('create_secure_match', {
    p_quiz_name: quiz.quizName,
    p_quiz_data: quiz,
    p_timer_seconds: timerSeconds
  });
  
  if (createErr) {
    console.error('Secure match creation failed:', createErr);
    throw createErr;
  }
  
  // Fetch the created match
  const { data: match, error: fetchErr } = await supabase
    .from('matches')
    .select('*')
    .eq('id', matchId)
    .single();
    
  if (fetchErr) throw fetchErr;
  
  // Add host as first player
  const { error: pErr } = await supabase
    .from('players')
    .insert({
      match_id: matchId,
      uid: user.id,
      name: hostName || 'Host',
      ready: false,
      score: 0,
    });
    
  if (pErr) throw pErr;
  
  console.log('✅ Secure match created successfully');
  return match;
}

// Function to get quiz solutions (only for hosts)
export async function getQuizSolutions(matchId: string): Promise<QuizSolution[]> {
  const { data, error } = await supabase.rpc('get_quiz_solutions', {
    p_match_id: matchId
  });
  
  if (error) {
    console.error('Failed to fetch quiz solutions:', error);
    throw error;
  }
  
  return data || [];
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