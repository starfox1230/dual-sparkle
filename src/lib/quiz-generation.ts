export type Difficulty = 'elementary' | 'high_school' | 'hard';

export const difficultyOptions: ReadonlyArray<{ key: Difficulty; label: string }> = [
  { key: 'elementary', label: 'Elementary' },
  { key: 'high_school', label: 'High School' },
  { key: 'hard', label: 'Boards-Level (Hard)' },
];

const promptTemplates: Record<Difficulty, string> = {
  hard:
    'generate exactly {count} board-exam-level multiple-choice questions that probe deep factual and conceptual mastery of the material. Questions must test understanding of facts and concepts as they apply in general contexts, not recall of the source\'s exact wording or examples.',
  high_school:
    'generate exactly {count} high-school-level multiple-choice questions that test a solid, general understanding of the main topics and key facts in the material.',
  elementary:
    'generate exactly {count} elementary-school-level multiple-choice questions using simple language to test basic knowledge of the key points in the material.',
};

export function clampQuestionCount(rawValue: string | number | null | undefined): number {
  const numericValue =
    typeof rawValue === 'number' ? rawValue : Number.parseInt(String(rawValue ?? ''), 10);

  if (Number.isNaN(numericValue)) {
    return 10;
  }

  return Math.max(1, Math.min(50, numericValue));
}

export function buildManualPrompt({
  difficulty,
  questionCount,
}: {
  difficulty: Difficulty;
  questionCount: string | number;
}): string {
  const count = clampQuestionCount(questionCount);
  const difficultyText = promptTemplates[difficulty].replace('{count}', String(count));

  return `Based solely on the attached source (PDF, YouTube video, or pasted text), ${difficultyText}

The entire output MUST be a single JSON object. This object must contain two properties:
1. "quizName": A short, descriptive title for the quiz (for example, "Chapter 5: Cell Division").
2. "questions": An array of question objects.

For each question object in the "questions" array, include exactly these four properties:
- "question": the question stem.
- "options": an array of exactly four distinct answer strings.
- "correctAnswer": the one option that is correct and matches exactly one entry in "options".
- "explanation": a brief, clear rationale grounded in the source material.

Format the entire output as a single JSON object like this:

{
  "quizName": "Sample Science Quiz",
  "questions": [
    {
      "question": "Sample question text here?",
      "options": ["Option A", "Option B", "Correct Option C", "Option D"],
      "correctAnswer": "Correct Option C",
      "explanation": "Brief explanation based on the source content."
    }
  ]
}

Do not include any introductory text, concluding remarks, markdown fences, or commentary before or after the JSON object. Return only the JSON object.`;
}

export function isLikelyYouTubeUrl(value: string): boolean {
  try {
    const parsed = new URL(value.trim());
    const hostname = parsed.hostname.toLowerCase();

    return (
      hostname === 'youtu.be' ||
      hostname.endsWith('youtube.com') ||
      hostname.endsWith('youtube-nocookie.com')
    );
  } catch {
    return false;
  }
}
