const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type Difficulty = 'elementary' | 'high_school' | 'hard';

interface GenerateQuizRequest {
  youtubeUrl: string;
  difficulty: Difficulty;
  questionCount: number;
  promptOverride?: string;
}

interface NormalizedQuestion {
  question: string;
  options: string[];
  correctAnswer: string;
  explanation: string;
}

interface NormalizedQuiz {
  quizName: string;
  questions: NormalizedQuestion[];
}

const DEFAULT_GEMINI_MODEL = Deno.env.get('GEMINI_MODEL') ?? 'gemini-3.1-pro-preview';
const GEMINI_API_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

const QUIZ_RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    quizName: { type: 'STRING' },
    questions: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          question: { type: 'STRING' },
          options: {
            type: 'ARRAY',
            items: { type: 'STRING' },
          },
          correctAnswer: { type: 'STRING' },
          explanation: { type: 'STRING' },
        },
        required: ['question', 'options', 'correctAnswer', 'explanation'],
      },
    },
  },
  required: ['quizName', 'questions'],
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });
}

function errorResponse(message: string, status = 400): Response {
  return jsonResponse({ error: message }, status);
}

function clampQuestionCount(value: number): number {
  return Math.max(1, Math.min(50, value));
}

function extractYouTubeVideoId(rawUrlOrId: string): string {
  const candidate = rawUrlOrId.trim();
  if (!candidate) {
    throw new Error('Please enter a YouTube URL.');
  }

  if (/^[\w-]{11}$/.test(candidate)) {
    return candidate;
  }

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new Error('That does not look like a valid YouTube URL.');
  }

  const hostname = parsed.hostname.toLowerCase();
  const pathParts = parsed.pathname.split('/').filter(Boolean);

  if ((hostname === 'youtu.be' || hostname === 'www.youtu.be') && pathParts[0]) {
    return pathParts[0];
  }

  if (hostname.endsWith('youtube.com') || hostname.endsWith('youtube-nocookie.com')) {
    const queryVideoId = parsed.searchParams.get('v');
    if (queryVideoId) {
      return queryVideoId;
    }

    for (const prefix of ['shorts', 'embed', 'live', 'v']) {
      const index = pathParts.indexOf(prefix);
      if (index >= 0 && pathParts[index + 1]) {
        return pathParts[index + 1];
      }
    }
  }

  throw new Error('That does not look like a valid YouTube URL.');
}

function buildPrompt({
  difficulty,
  questionCount,
  promptOverride,
}: {
  difficulty: Difficulty;
  questionCount: number;
  promptOverride?: string;
}): string {
  const promptTemplates: Record<Difficulty, string> = {
    hard:
      'generate exactly {count} board-exam-level multiple-choice questions that probe deep factual and conceptual mastery of the material. Questions must test understanding of facts and concepts as they apply in general contexts, not recall of the video\'s exact wording.',
    high_school:
      'generate exactly {count} high-school-level multiple-choice questions that test a solid, general understanding of the main topics and key facts in the material.',
    elementary:
      'generate exactly {count} elementary-school-level multiple-choice questions using simple language to test basic knowledge of the key points in the material.',
  };

  const count = clampQuestionCount(questionCount);
  const difficultyText = promptTemplates[difficulty].replace('{count}', String(count));
  const extraInstructions = promptOverride?.trim()
    ? `\n\nAdditional instructions from the user:\n${promptOverride.trim()}`
    : '';

  return `Based solely on the attached YouTube video, including spoken content and any clearly inferable instructional context, ${difficultyText}

The entire output MUST be a single JSON object with exactly these two top-level properties:
1. "quizName": A short, descriptive title for the quiz.
2. "questions": An array of question objects.

Each question object must include exactly these four properties:
- "question": the question stem.
- "options": an array of exactly four distinct answer strings.
- "correctAnswer": the one option that is correct and matches exactly one entry in "options".
- "explanation": a brief, clear rationale grounded in the video content.

Do not include markdown, commentary, or code fences. Return only the JSON object.${extraInstructions}`;
}

function getApiErrorMessage(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const maybePayload = payload as Record<string, unknown>;
  const maybeError = maybePayload.error;
  if (!maybeError || typeof maybeError !== 'object') {
    return null;
  }

  const maybeMessage = (maybeError as Record<string, unknown>).message;
  return typeof maybeMessage === 'string' && maybeMessage.trim() ? maybeMessage.trim() : null;
}

async function callGemini(payload: GenerateQuizRequest, apiKey: string) {
  const url = `${GEMINI_API_BASE_URL}/${encodeURIComponent(DEFAULT_GEMINI_MODEL)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const requestBody = {
    systemInstruction: {
      parts: [
        {
          text: 'You are an expert exam writer. Use only the attached YouTube video and return strict JSON that matches the requested schema.',
        },
      ],
    },
    contents: [
      {
        parts: [
          {
            text: buildPrompt(payload),
          },
          {
            file_data: {
              file_uri: payload.youtubeUrl,
            },
          },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.35,
      response_mime_type: 'application/json',
      response_schema: QUIZ_RESPONSE_SCHEMA,
    },
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
  });

  const responseText = await response.text();
  let responseJson: unknown = null;

  try {
    responseJson = responseText ? JSON.parse(responseText) : null;
  } catch {
    responseJson = null;
  }

  if (!response.ok) {
    const message = getApiErrorMessage(responseJson) ?? 'Gemini rejected the quiz generation request.';
    throw new Error(message);
  }

  if (!responseJson || typeof responseJson !== 'object') {
    throw new Error('Gemini returned a non-JSON API response.');
  }

  return responseJson as Record<string, unknown>;
}

function extractJsonText(apiResponse: Record<string, unknown>): string {
  const candidates = Array.isArray(apiResponse.candidates) ? apiResponse.candidates : [];

  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== 'object') {
      continue;
    }

    const content = (candidate as Record<string, unknown>).content;
    if (!content || typeof content !== 'object') {
      continue;
    }

    const parts = Array.isArray((content as Record<string, unknown>).parts)
      ? ((content as Record<string, unknown>).parts as unknown[])
      : [];

    const text = parts
      .filter((part): part is Record<string, unknown> => !!part && typeof part === 'object')
      .map((part) => (typeof part.text === 'string' ? part.text : ''))
      .join('')
      .trim();

    if (text) {
      return text;
    }
  }

  const promptFeedback = apiResponse.promptFeedback;
  if (promptFeedback) {
    throw new Error(`Gemini did not return a quiz. Prompt feedback: ${JSON.stringify(promptFeedback)}`);
  }

  throw new Error('Gemini returned an empty response.');
}

function parseQuizJson(rawText: string): Record<string, unknown> {
  let cleaned = rawText.trim();

  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  }

  try {
    return JSON.parse(cleaned) as Record<string, unknown>;
  } catch {
    throw new Error('Gemini returned malformed quiz JSON.');
  }
}

function normalizeQuestion(question: unknown, index: number): NormalizedQuestion {
  if (!question || typeof question !== 'object') {
    throw new Error(`Question ${index + 1} is not an object.`);
  }

  const candidate = question as Record<string, unknown>;
  const options = Array.isArray(candidate.options)
    ? candidate.options.map((option) => String(option).trim())
    : [];

  const normalizedQuestion = {
    question: String(candidate.question ?? '').trim(),
    options,
    correctAnswer: String(candidate.correctAnswer ?? '').trim(),
    explanation: String(candidate.explanation ?? '').trim(),
  };

  if (!normalizedQuestion.question) {
    throw new Error(`Question ${index + 1} is missing text.`);
  }

  if (normalizedQuestion.options.length !== 4) {
    throw new Error(`Question ${index + 1} must have exactly four options.`);
  }

  if (new Set(normalizedQuestion.options.map((option) => option.toLowerCase())).size !== 4) {
    throw new Error(`Question ${index + 1} has duplicate options.`);
  }

  if (!normalizedQuestion.correctAnswer) {
    throw new Error(`Question ${index + 1} is missing a correct answer.`);
  }

  if (!normalizedQuestion.options.includes(normalizedQuestion.correctAnswer)) {
    const caseInsensitiveMatch = normalizedQuestion.options.filter(
      (option) => option.toLowerCase() === normalizedQuestion.correctAnswer.toLowerCase(),
    );

    if (caseInsensitiveMatch.length === 1) {
      normalizedQuestion.correctAnswer = caseInsensitiveMatch[0];
    } else {
      throw new Error(`Question ${index + 1} has a correct answer that does not match its options.`);
    }
  }

  if (!normalizedQuestion.explanation) {
    normalizedQuestion.explanation = 'No explanation provided.';
  }

  return normalizedQuestion;
}

function normalizeQuiz(rawPayload: Record<string, unknown>, expectedQuestionCount: number): NormalizedQuiz {
  const quizName = String(rawPayload.quizName ?? rawPayload.title ?? '').trim();
  const questions = Array.isArray(rawPayload.questions) ? rawPayload.questions : [];

  if (!quizName) {
    throw new Error('Gemini did not return a quiz title.');
  }

  if (!questions.length) {
    throw new Error('Gemini did not return any quiz questions.');
  }

  const normalizedQuestions = questions.map((question, index) => normalizeQuestion(question, index));
  const clampedCount = clampQuestionCount(expectedQuestionCount);

  if (normalizedQuestions.length !== clampedCount) {
    throw new Error(
      `Gemini returned ${normalizedQuestions.length} questions instead of the requested ${clampedCount}.`,
    );
  }

  return {
    quizName,
    questions: normalizedQuestions,
  };
}

function getUsage(responseJson: Record<string, unknown>) {
  const usageMetadata =
    responseJson.usageMetadata && typeof responseJson.usageMetadata === 'object'
      ? (responseJson.usageMetadata as Record<string, unknown>)
      : {};

  return {
    promptTokens: Number(usageMetadata.promptTokenCount ?? 0),
    candidateTokens: Number(usageMetadata.candidatesTokenCount ?? 0),
    thoughtsTokens: Number(usageMetadata.thoughtsTokenCount ?? 0),
    totalTokens: Number(
      usageMetadata.totalTokenCount ??
        Number(usageMetadata.promptTokenCount ?? 0) +
          Number(usageMetadata.candidatesTokenCount ?? 0),
    ),
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return errorResponse('Method not allowed.', 405);
  }

  const apiKey = Deno.env.get('GEMINI_API_KEY');
  if (!apiKey) {
    return errorResponse('GEMINI_API_KEY is not configured for the generate-quiz function.', 500);
  }

  try {
    const payload = (await req.json()) as Partial<GenerateQuizRequest>;
    const youtubeUrl = String(payload.youtubeUrl ?? '').trim();
    const promptOverride = typeof payload.promptOverride === 'string' ? payload.promptOverride : '';
    const questionCount = Number(payload.questionCount);

    if (!youtubeUrl) {
      return errorResponse('Please enter a YouTube URL.', 400);
    }

    if (!['elementary', 'high_school', 'hard'].includes(String(payload.difficulty))) {
      return errorResponse('Difficulty must be one of: elementary, high_school, or hard.', 400);
    }

    if (!Number.isFinite(questionCount)) {
      return errorResponse('questionCount must be a number.', 400);
    }

    const requestPayload: GenerateQuizRequest = {
      youtubeUrl,
      difficulty: payload.difficulty as Difficulty,
      questionCount: clampQuestionCount(questionCount),
      promptOverride,
    };

    const videoId = extractYouTubeVideoId(requestPayload.youtubeUrl);
    const responseJson = await callGemini(requestPayload, apiKey);
    const rawQuizText = extractJsonText(responseJson);
    const parsedQuiz = parseQuizJson(rawQuizText);
    const quiz = normalizeQuiz(parsedQuiz, requestPayload.questionCount);

    return jsonResponse({
      quiz,
      model: DEFAULT_GEMINI_MODEL,
      usage: getUsage(responseJson),
      sourceMode: 'video',
      videoId,
    });
  } catch (error) {
    console.error('Error in generate-quiz function:', error);
    return errorResponse(error instanceof Error ? error.message : 'Failed to generate quiz.', 400);
  }
});
