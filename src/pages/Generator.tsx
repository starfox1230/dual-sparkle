import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { createMatch, type Quiz } from '@/lib/supabase';
import { useToast } from '@/hooks/use-toast';
import { Zap, Gamepad2, Users, Copy as CopyIcon, ExternalLink, Eye, EyeOff } from 'lucide-react';

const Generator = () => {
  const [quizJson, setQuizJson] = useState('');
  const [hostName, setHostName] = useState('');

  // ✅ Keep timer as string so clearing the field doesn't snap back to 15
  const [timerSeconds, setTimerSeconds] = useState<string>('15');

  // ✅ NEW: Prompt Generator state
  const [difficulty, setDifficulty] = useState<'elementary' | 'high_school' | 'hard'>('high_school');

  const [questionCount, setQuestionCount] = useState<string>('10');
  const [showPrompt, setShowPrompt] = useState(false);

  const [isCreating, setIsCreating] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  const validateQuiz = (jsonStr: string): Quiz | null => {
    try {
      const quiz = JSON.parse(jsonStr);

      if (!quiz.quizName || !Array.isArray(quiz.questions)) return null;
      for (const q of quiz.questions) {
        if (!q.question || !Array.isArray(q.options) || !q.correctAnswer) return null;
        if (q.options.length < 2 || !q.options.includes(q.correctAnswer)) return null;
      }
      return quiz;
    } catch {
      return null;
    }
  };

  const handleCreateMatch = async () => {
    if (!hostName.trim()) {
      toast({
        title: 'Name Required',
        description: 'Please enter your name to create a match.',
        variant: 'destructive',
      });
      return;
    }

    const quiz = validateQuiz(quizJson);
    if (!quiz) {
      toast({
        title: 'Invalid Quiz',
        description: 'Please check your quiz JSON format.',
        variant: 'destructive',
      });
      return;
    }

    // Parse timer here (not while typing)
    const secs = parseInt(timerSeconds, 10);
    if (Number.isNaN(secs)) {
      toast({
        title: 'Timer Required',
        description: 'Please enter a number of seconds for the timer.',
        variant: 'destructive',
      });
      return;
    }
    if (secs < 5 || secs > 60) {
      toast({
        title: 'Invalid Timer',
        description: 'Timer must be between 5 and 60 seconds.',
        variant: 'destructive',
      });
      return;
    }

    setIsCreating(true);
    try {
      const match = await createMatch(quiz, hostName, secs);
      toast({
        title: 'Match Created!',
        description: 'Redirecting to match lobby...',
      });
      navigate(`/match/${match.id}`);
    } catch (error) {
      console.error('Error creating match:', error);
      toast({
        title: 'Error',
        description: 'Failed to create match. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsCreating(false);
    }
  };

  // ====== NEW: Prompt Generator logic ======
  const promptTemplates: Record<'hard' | 'high_school' | 'elementary', string> = {
    hard:
      'generate **{count} board-exam–level** multiple-choice questions that probe deep factual and conceptual mastery of the material. Questions must test understanding of facts and concepts as they apply in general contexts—**not** recall of the source’s exact wording or examples.',
    high_school:
      'generate **{count} high-school-level** multiple-choice questions that test a solid, general understanding of the main topics and key facts in the material.',
    elementary:
      'generate **{count} elementary-school-level** multiple-choice questions using simple language to test basic knowledge of the key points in the material.',
  };

  const promptText = useMemo(() => {
    const count = Math.max(1, Math.min(50, parseInt(questionCount || '10', 10) || 10));
    const difficultyText = promptTemplates[difficulty].replace('{count}', String(count));

    // NOTE: Your app expects a single JSON object with { quizName, questions }
    // so we keep the instructions consistent with that.
    return `Based *solely* on the attached source (PDF, YouTube video, or pasted text), ${difficultyText}

Return the result as a **single JSON object** with exactly these keys:
1. "quizName": a short title (e.g., "Chapter 5: Cell Division")
2. "questions": an array of question objects

Each question object must include **exactly**:
- "question": the question stem
- "options": an array of **exactly four** distinct answer strings
- "correctAnswer": one string that exactly matches one entry in "options"
- "explanation": a brief, clear rationale referencing the source

Example format:

{
  "quizName": "Sample Science Quiz",
  "questions": [
    {
      "question": "Sample question text here?",
      "options": ["Option A", "Option B", "Correct Option C", "Option D"],
      "correctAnswer": "Correct Option C",
      "explanation": "Brief explanation based on the document content."
    }
  ]
}

**Do not** include any extra commentary or markdown fences. Output **only** the JSON object.`;
  }, [difficulty, promptTemplates, questionCount]);

  const handleCopyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(promptText);
      toast({ title: 'Prompt copied', description: 'Paste it into Google AI Studio.', duration: 1500 });
    } catch {
      toast({ title: 'Copy failed', description: 'Please copy manually.', variant: 'destructive' });
    }
  };

  const sampleQuiz = {
    quizName: 'Space Knowledge Quiz',
    questions: [
      {
        question: 'What is the actual closest planet to the Sun?',
        options: ['Venus', 'Mercury', 'Earth', 'Mars'],
        correctAnswer: 'Mercury',
        explanation: 'Mercury is the innermost planet in our solar system.',
      },
      {
        question: 'How many moons does Jupiter have?',
        options: ['63', '79', '95', '102'],
        correctAnswer: '95',
        explanation: 'Jupiter has 95 confirmed moons as of recent discoveries.',
      },
    ],
  };

  return (
    <div className="min-h-screen bg-gradient-bg font-roboto">
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-3 mb-4">
            <Zap className="w-8 h-8 text-neon-blue" />
            <h1 className="text-4xl font-orbitron font-bold text-foreground">Quiz Generator</h1>
            <Gamepad2 className="w-8 h-8 text-neon-purple" />
          </div>
          <p className="text-xl text-muted-foreground">Create epic head-to-head quiz battles</p>
        </div>

        <div className="grid md:grid-cols-2 gap-8">
          {/* LEFT: Quiz Input */}
          <Card className="bg-card border-card-border border-2 shadow-glow-primary">
            <CardHeader>
              <CardTitle className="font-orbitron text-neon-blue flex items-center gap-2">
                <Users className="w-5 h-5" />
                Quiz Setup
              </CardTitle>
              <CardDescription>Paste your quiz JSON or use the sample below</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="hostName" className="text-foreground">
                  Your Name
                </Label>
                <Input
                  id="hostName"
                  placeholder="Enter your name"
                  value={hostName}
                  onChange={(e) => setHostName(e.target.value)}
                  className="bg-input border-input-border text-foreground"
                />
              </div>

              <div>
                <Label htmlFor="timer" className="text-foreground">
                  Timer Duration (seconds)
                </Label>
                <Input
                  id="timer"
                  type="number"
                  min="5"
                  max="60"
                  placeholder="Timer seconds"
                  value={timerSeconds}
                  onChange={(e) => setTimerSeconds(e.target.value)} // ← no auto-fallback; allow clearing
                  inputMode="numeric"
                  className="bg-input border-input-border text-foreground"
                />
              </div>

              <div>
                <Label htmlFor="quiz" className="text-foreground">
                  Quiz JSON
                </Label>
                <Textarea
                  id="quiz"
                  placeholder="Paste your quiz JSON here..."
                  value={quizJson}
                  onChange={(e) => setQuizJson(e.target.value)}
                  className="min-h-[300px] bg-input border-input-border text-foreground font-mono"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Button
                  onClick={() => setQuizJson(JSON.stringify(sampleQuiz, null, 2))}
                  variant="outline"
                  className="border-neon-cyan text-neon-cyan hover:bg-neon-cyan hover:text-primary-foreground"
                >
                  Load Sample Quiz
                </Button>

                <Button
                  onClick={handleCreateMatch}
                  disabled={isCreating}
                  className="bg-gradient-primary hover:shadow-glow-primary text-primary-foreground font-orbitron font-bold"
                >
                  {isCreating ? 'Creating Match...' : 'Create Match'}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* RIGHT: REPLACE the "Quiz Format Guide" card with this Prompt Generator card */}
          <Card className="bg-card border-card-border border-2 shadow-glow-primary">
            <CardHeader>
              <CardTitle className="font-orbitron text-neon-purple">AI Prompt Generator</CardTitle>
              <CardDescription>Build a prompt, then paste it into Google AI Studio to generate quiz JSON.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {/* 1) Difficulty */}
              <div className="space-y-2">
                <Label className="text-foreground">1. Choose Question Difficulty</Label>
                <div className="flex flex-wrap gap-2">
                  {[
                    { key: 'elementary', label: 'Elementary' },
                    { key: 'high_school', label: 'High School' },
                    { key: 'hard', label: 'Boards-Level (Hard)' },
                  ].map((opt) => (
                    <Button
                      key={opt.key}
                      type="button"
                      variant={difficulty === (opt.key as any) ? 'default' : 'outline'}
                      onClick={() => setDifficulty(opt.key as any)}
                      className={
                        difficulty === (opt.key as any)
                          ? 'bg-gradient-primary text-primary-foreground'
                          : 'border-card-border text-foreground hover:border-primary'
                      }
                    >
                      {opt.label}
                    </Button>
                  ))}
                </div>
              </div>

              {/* 2) Count */}
              <div className="space-y-2">
                <Label htmlFor="questionCount" className="text-foreground">
                  2. Number of Questions
                </Label>
                <Input
                  id="questionCount"
                  type="number"
                  min={1}
                  max={50}
                  inputMode="numeric"
                  value={questionCount}
                  onChange={(e) => setQuestionCount(e.target.value)}
                  className="bg-input border-input-border text-foreground max-w-[140px]"
                />
              </div>

              {/* 3) Actions */}
              <div className="space-y-2">
                <Label className="text-foreground">3. Copy the Generated Prompt</Label>
                <p className="text-sm text-muted-foreground">
                  Use this prompt with your source (PDF, YouTube, or pasted text) in an AI chat tool.
                </p>
                <div className="flex flex-wrap items-center gap-3">
                  <Button type="button" onClick={handleCopyPrompt} className="bg-gradient-primary">
                    <CopyIcon className="w-4 h-4 mr-2" />
                    Copy Prompt
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setShowPrompt((s) => !s)}
                    className="border-neon-purple text-neon-purple"
                  >
                    {showPrompt ? <EyeOff className="w-4 h-4 mr-2" /> : <Eye className="w-4 h-4 mr-2" />}
                    {showPrompt ? 'Hide Prompt' : 'Show Prompt'}
                  </Button>
                  <a
                    href="https://aistudio.google.com/prompts/new_chat"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-neon-cyan text-neon-cyan hover:bg-neon-cyan hover:text-primary-foreground transition"
                  >
                    <ExternalLink className="w-4 h-4" />
                    Paste at Google AI Studio
                  </a>
                </div>
              </div>

              {/* Prompt preview */}
              {showPrompt && (
                <div className="rounded-md border border-dashed border-card-border p-3 bg-muted/20">
                  <pre className="whitespace-pre-wrap text-sm">{promptText}</pre>
                </div>
              )}
            </CardContent>
          </Card>
          {/* END replacement */}
        </div>
      </div>
    </div>
  );
};

export default Generator;
