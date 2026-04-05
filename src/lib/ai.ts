import { ensureAuth, supabase, type Quiz } from '@/lib/supabase';
import type { Difficulty } from '@/lib/quiz-generation';

export interface GenerateQuizPayload {
  youtubeUrl: string;
  difficulty: Difficulty;
  questionCount: number;
  promptOverride?: string;
}

export interface QuizGenerationUsage {
  promptTokens?: number;
  candidateTokens?: number;
  thoughtsTokens?: number;
  totalTokens?: number;
}

export interface GenerateQuizResponse {
  quiz: Quiz;
  model: string;
  usage?: QuizGenerationUsage;
  sourceMode?: 'video';
  videoId?: string;
}

function isQuizResponse(value: unknown): value is GenerateQuizResponse {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const maybeResponse = value as Record<string, unknown>;
  const maybeQuiz = maybeResponse.quiz;

  return (
    !!maybeQuiz &&
    typeof maybeQuiz === 'object' &&
    typeof (maybeQuiz as Record<string, unknown>).quizName === 'string' &&
    Array.isArray((maybeQuiz as Record<string, unknown>).questions)
  );
}

async function getFunctionErrorMessage(error: unknown): Promise<string> {
  const fallback = 'Failed to generate quiz JSON.';

  if (!error || typeof error !== 'object') {
    return fallback;
  }

  const maybeError = error as { message?: unknown; context?: unknown };

  if (maybeError.context instanceof Response) {
    try {
      const payload = await maybeError.context.clone().json();
      if (payload && typeof payload === 'object') {
        const maybePayload = payload as Record<string, unknown>;
        if (typeof maybePayload.error === 'string') {
          return maybePayload.error;
        }
      }
    } catch {
      // Fall back to the generic error message below.
    }

    try {
      const text = await maybeError.context.clone().text();
      if (text.trim()) {
        return text.trim();
      }
    } catch {
      // Fall back to the generic error message below.
    }
  }

  if (typeof maybeError.message === 'string' && maybeError.message.trim()) {
    return maybeError.message.trim();
  }

  return fallback;
}

export async function generateQuizFromYouTube(
  payload: GenerateQuizPayload,
): Promise<GenerateQuizResponse> {
  await ensureAuth();

  const { data, error } = await supabase.functions.invoke('generate-quiz', {
    body: payload,
  });

  if (error) {
    throw new Error(await getFunctionErrorMessage(error));
  }

  if (!isQuizResponse(data)) {
    throw new Error('The AI response did not match the expected quiz format.');
  }

  return data;
}
