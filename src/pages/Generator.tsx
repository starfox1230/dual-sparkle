import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  Bot,
  Clock3,
  Copy as CopyIcon,
  ExternalLink,
  Eye,
  EyeOff,
  Gamepad2,
  Loader2,
  Users,
  Zap,
} from 'lucide-react';

import { generateQuizFromYouTube, type QuizGenerationUsage } from '@/lib/ai';
import { cn } from '@/lib/utils';
import {
  buildManualPrompt,
  clampQuestionCount,
  difficultyOptions,
  isLikelyYouTubeUrl,
  type Difficulty,
} from '@/lib/quiz-generation';
import { createMatch, type Quiz } from '@/lib/supabase';
import { useToast } from '@/hooks/use-toast';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

type GenerationMode = 'manual' | 'automatic';
type AutomaticFlowStep = 'generate_quiz' | 'create_match';

interface GenerationMeta {
  model: string;
  usage?: QuizGenerationUsage;
}

interface AutomaticErrorState {
  step: AutomaticFlowStep;
  report: string;
}

const generationModes: ReadonlyArray<{ key: GenerationMode; label: string; description: string }> = [
  {
    key: 'manual',
    label: 'Manual',
    description: 'Build a prompt, use Google AI Studio, and paste the JSON yourself.',
  },
  {
    key: 'automatic',
    label: 'Automatic AI',
    description: 'Enter everything once, let AI generate the quiz, and create the match automatically.',
  },
];

function getReadableErrorMessage(error: unknown, fallback: string): string {
  if (typeof error === 'string' && error.trim()) {
    return error.trim();
  }

  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }

  if (error && typeof error === 'object') {
    const maybeError = error as Record<string, unknown>;

    if (typeof maybeError.message === 'string' && maybeError.message.trim()) {
      return maybeError.message.trim();
    }
  }

  return fallback;
}

function buildAutomaticErrorReport({
  step,
  error,
  youtubeUrl,
  hostName,
  timerSeconds,
  questionCount,
  difficulty,
  promptOverride,
  generationMeta,
}: {
  step: AutomaticFlowStep;
  error: unknown;
  youtubeUrl: string;
  hostName: string;
  timerSeconds: string;
  questionCount: string;
  difficulty: Difficulty;
  promptOverride: string;
  generationMeta: GenerationMeta | null;
}): string {
  const errorRecord = error && typeof error === 'object' ? (error as Record<string, unknown>) : null;
  const lines = [
    'Automatic AI setup failed.',
    `Timestamp: ${new Date().toISOString()}`,
    `Failed step: ${step === 'generate_quiz' ? 'Generate quiz from YouTube' : 'Create match from generated quiz'}`,
    `Message: ${getReadableErrorMessage(
      error,
      step === 'generate_quiz'
        ? 'Failed to generate a quiz from the YouTube URL.'
        : 'Failed to create the match from the generated quiz.',
    )}`,
    `Host name: ${hostName || '(blank)'}`,
    `YouTube URL: ${youtubeUrl || '(blank)'}`,
    `Timer seconds: ${timerSeconds || '(blank)'}`,
    `Question count: ${questionCount || '(blank)'}`,
    `Difficulty: ${difficulty}`,
    `Prompt override: ${promptOverride.trim() || '(blank)'}`,
  ];

  if (generationMeta) {
    lines.push(`Model: ${generationMeta.model}`);

    if (typeof generationMeta.usage?.totalTokens === 'number') {
      lines.push(`Total tokens: ${generationMeta.usage.totalTokens}`);
    }

    if (typeof generationMeta.usage?.promptTokens === 'number') {
      lines.push(`Prompt tokens: ${generationMeta.usage.promptTokens}`);
    }

    if (typeof generationMeta.usage?.candidateTokens === 'number') {
      lines.push(`Output tokens: ${generationMeta.usage.candidateTokens}`);
    }
  }

  if (errorRecord) {
    if (typeof errorRecord.code === 'string' && errorRecord.code.trim()) {
      lines.push(`Code: ${errorRecord.code.trim()}`);
    }

    if (typeof errorRecord.details === 'string' && errorRecord.details.trim()) {
      lines.push(`Details: ${errorRecord.details.trim()}`);
    }

    if (typeof errorRecord.hint === 'string' && errorRecord.hint.trim()) {
      lines.push(`Hint: ${errorRecord.hint.trim()}`);
    }
  }

  return lines.join('\n');
}

function formatElapsedDuration(elapsedMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(elapsedMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

const Generator = () => {
  const [generationMode, setGenerationMode] = useState<GenerationMode>('manual');
  const [quizJson, setQuizJson] = useState('');
  const [hostName, setHostName] = useState('');
  const [timerSeconds, setTimerSeconds] = useState<string>('15');
  const [difficulty, setDifficulty] = useState<Difficulty>('high_school');
  const [questionCount, setQuestionCount] = useState<string>('10');
  const [showPrompt, setShowPrompt] = useState(false);
  const [youtubeUrl, setYouTubeUrl] = useState('');
  const [promptOverride, setPromptOverride] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationMeta, setGenerationMeta] = useState<GenerationMeta | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [automaticError, setAutomaticError] = useState<AutomaticErrorState | null>(null);
  const [automaticFlowStartedAt, setAutomaticFlowStartedAt] = useState<number | null>(null);
  const [automaticElapsedMs, setAutomaticElapsedMs] = useState(0);

  const navigate = useNavigate();
  const { toast } = useToast();

  const promptText = buildManualPrompt({ difficulty, questionCount });
  const isAutomaticBusy = generationMode === 'automatic' && (isGenerating || isCreating);
  const automaticStatusLabel = isGenerating
    ? 'Step 1 of 2: Generating your quiz from the YouTube URL'
    : 'Step 2 of 2: Creating your match lobby';

  useEffect(() => {
    if (!automaticFlowStartedAt) {
      setAutomaticElapsedMs(0);
      return;
    }

    const updateElapsed = () => {
      setAutomaticElapsedMs(Date.now() - automaticFlowStartedAt);
    };

    updateElapsed();

    const intervalId = window.setInterval(updateElapsed, 250);
    return () => window.clearInterval(intervalId);
  }, [automaticFlowStartedAt]);

  const validateQuiz = (jsonStr: string): Quiz | null => {
    try {
      const quiz = JSON.parse(jsonStr);

      if (!quiz.quizName || !Array.isArray(quiz.questions)) {
        return null;
      }

      for (const question of quiz.questions) {
        if (!question.question || !Array.isArray(question.options) || !question.correctAnswer) {
          return null;
        }

        if (question.options.length < 2 || !question.options.includes(question.correctAnswer)) {
          return null;
        }
      }

      return quiz;
    } catch {
      return null;
    }
  };

  const copyText = async ({
    text,
    successTitle,
    successDescription,
    failureTitle,
    failureDescription,
  }: {
    text: string;
    successTitle: string;
    successDescription: string;
    failureTitle: string;
    failureDescription: string;
  }) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({
        title: successTitle,
        description: successDescription,
        duration: 1500,
      });
    } catch {
      toast({
        title: failureTitle,
        description: failureDescription,
        variant: 'destructive',
      });
    }
  };

  const parseTimerSeconds = (): number | null => {
    const secs = Number.parseInt(timerSeconds, 10);

    if (Number.isNaN(secs)) {
      toast({
        title: 'Timer Required',
        description: 'Please enter a number of seconds for the timer.',
        variant: 'destructive',
      });
      return null;
    }

    if (secs < 5 || secs > 60) {
      toast({
        title: 'Invalid Timer',
        description: 'Timer must be between 5 and 60 seconds.',
        variant: 'destructive',
      });
      return null;
    }

    return secs;
  };

  const parseQuestionTotal = (): number | null => {
    const totalQuestions = Number.parseInt(questionCount, 10);

    if (Number.isNaN(totalQuestions)) {
      toast({
        title: 'Question Count Required',
        description: 'Please enter how many questions the AI should generate.',
        variant: 'destructive',
      });
      return null;
    }

    if (totalQuestions < 1 || totalQuestions > 50) {
      toast({
        title: 'Invalid Question Count',
        description: 'Question count must be between 1 and 50.',
        variant: 'destructive',
      });
      return null;
    }

    return clampQuestionCount(totalQuestions);
  };

  const createAndOpenMatch = async (quiz: Quiz, timerValue: number) => {
    const match = await createMatch(quiz, hostName.trim(), timerValue);
    toast({
      title: 'Match Created!',
      description: 'Redirecting to match lobby...',
    });
    navigate(`/match/${match.id}`);
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

    const timerValue = parseTimerSeconds();
    if (timerValue === null) {
      return;
    }

    setIsCreating(true);

    try {
      await createAndOpenMatch(quiz, timerValue);
    } catch (error) {
      console.error('Error creating match:', error);
      toast({
        title: 'Error',
        description: getReadableErrorMessage(error, 'Failed to create match. Please try again.'),
        variant: 'destructive',
      });
    } finally {
      setIsCreating(false);
    }
  };

  const handleCopyPrompt = async () => {
    await copyText({
      text: promptText,
      successTitle: 'Prompt copied',
      successDescription: 'Paste it into Google AI Studio.',
      failureTitle: 'Copy failed',
      failureDescription: 'Please copy manually.',
    });
  };

  const handleCopyAutomaticError = async () => {
    if (!automaticError) {
      return;
    }

    await copyText({
      text: automaticError.report,
      successTitle: 'Error copied',
      successDescription: 'The troubleshooting report is ready to paste anywhere you need it.',
      failureTitle: 'Copy failed',
      failureDescription: 'Please select the report text and copy it manually.',
    });
  };

  const handleGenerateWithAI = async () => {
    const trimmedUrl = youtubeUrl.trim();
    const trimmedHostName = hostName.trim();

    if (!trimmedHostName) {
      toast({
        title: 'Name Required',
        description: 'Please enter your name before generating the match.',
        variant: 'destructive',
      });
      return;
    }

    if (!trimmedUrl) {
      toast({
        title: 'YouTube URL Required',
        description: 'Please paste a YouTube URL to generate a quiz.',
        variant: 'destructive',
      });
      return;
    }

    if (!isLikelyYouTubeUrl(trimmedUrl)) {
      toast({
        title: 'Invalid YouTube URL',
        description: 'Please enter a valid YouTube watch, short, live, embed, or youtu.be URL.',
        variant: 'destructive',
      });
      return;
    }

    const timerValue = parseTimerSeconds();
    if (timerValue === null) {
      return;
    }

    const totalQuestions = parseQuestionTotal();
    if (totalQuestions === null) {
      return;
    }

    setAutomaticError(null);
    setGenerationMeta(null);
    setIsGenerating(true);
    setIsCreating(false);
    setAutomaticFlowStartedAt(Date.now());

    let failedStep: AutomaticFlowStep = 'generate_quiz';
    let nextGenerationMeta: GenerationMeta | null = null;

    try {
      const result = await generateQuizFromYouTube({
        youtubeUrl: trimmedUrl,
        difficulty,
        questionCount: totalQuestions,
        promptOverride,
      });

      const nextQuizJson = JSON.stringify(result.quiz, null, 2);
      if (!validateQuiz(nextQuizJson)) {
        throw new Error('The AI response was not valid quiz JSON for this app.');
      }

      nextGenerationMeta = {
        model: result.model,
        usage: result.usage,
      };

      setQuizJson(nextQuizJson);
      setGenerationMeta(nextGenerationMeta);

      failedStep = 'create_match';
      setIsGenerating(false);
      setIsCreating(true);

      await createAndOpenMatch(result.quiz, timerValue);
    } catch (error) {
      console.error('Automatic AI setup failed:', error);

      const fallbackMessage =
        failedStep === 'generate_quiz'
          ? 'Failed to generate a quiz from the YouTube URL.'
          : 'Failed to create the match from the generated quiz.';

      setAutomaticError({
        step: failedStep,
        report: buildAutomaticErrorReport({
          step: failedStep,
          error,
          youtubeUrl: trimmedUrl,
          hostName: trimmedHostName,
          timerSeconds,
          questionCount,
          difficulty,
          promptOverride,
          generationMeta: nextGenerationMeta,
        }),
      });

      toast({
        title: failedStep === 'generate_quiz' ? 'Generation failed' : 'Match creation failed',
        description: getReadableErrorMessage(error, fallbackMessage),
        variant: 'destructive',
      });
    } finally {
      setIsGenerating(false);
      setIsCreating(false);
      setAutomaticFlowStartedAt(null);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-bg font-roboto">
      <div className="container mx-auto max-w-5xl px-4 py-8">
        <div className="mb-8 text-center">
          <div className="mb-4 flex items-center justify-center gap-3">
            <Zap className="h-8 w-8 text-neon-blue" />
            <h1 className="font-orbitron text-4xl font-bold text-foreground">Quiz Generator</h1>
            <Gamepad2 className="h-8 w-8 text-neon-purple" />
          </div>
          <p className="text-xl text-muted-foreground">Create epic head-to-head quiz battles</p>
        </div>

        <Card className="mb-8 border-2 border-card-border bg-card shadow-glow-primary">
          <CardHeader className="pb-4">
            <CardTitle className="font-orbitron text-neon-blue">Generation Mode</CardTitle>
            <CardDescription>
              Choose whether you want the existing copy-and-paste workflow or direct AI generation.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col gap-3 md:flex-row">
              {generationModes.map((mode) => (
                <Button
                  key={mode.key}
                  type="button"
                  variant={generationMode === mode.key ? 'default' : 'outline'}
                  onClick={() => setGenerationMode(mode.key)}
                  disabled={isAutomaticBusy}
                  className={
                    generationMode === mode.key
                      ? 'flex-1 bg-gradient-primary text-primary-foreground'
                      : 'flex-1 border-card-border text-foreground hover:border-primary'
                  }
                >
                  {mode.label}
                </Button>
              ))}
            </div>
            <p className="text-sm text-muted-foreground">
              {generationModes.find((mode) => mode.key === generationMode)?.description}
            </p>
          </CardContent>
        </Card>

        {generationMode === 'automatic' ? (
          <Card className="mx-auto max-w-3xl border-2 border-card-border bg-card shadow-glow-primary">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 font-orbitron text-neon-purple">
                <Bot className="h-5 w-5" />
                Automatic AI Match Setup
              </CardTitle>
              <CardDescription>
                Enter the setup once and AI will generate the quiz JSON and create the match for you.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="youtubeUrl" className="text-foreground">
                  YouTube URL
                </Label>
                <Input
                  id="youtubeUrl"
                  type="url"
                  placeholder="https://www.youtube.com/watch?v=..."
                  value={youtubeUrl}
                  onChange={(event) => setYouTubeUrl(event.target.value)}
                  disabled={isAutomaticBusy}
                  className="border-input-border bg-input text-foreground"
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="hostNameAutomatic" className="text-foreground">
                    Your Name
                  </Label>
                  <Input
                    id="hostNameAutomatic"
                    placeholder="Enter your name"
                    value={hostName}
                    onChange={(event) => setHostName(event.target.value)}
                    disabled={isAutomaticBusy}
                    className="border-input-border bg-input text-foreground"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="timerAutomatic" className="text-foreground">
                    Timer Duration (seconds)
                  </Label>
                  <Input
                    id="timerAutomatic"
                    type="number"
                    min="5"
                    max="60"
                    inputMode="numeric"
                    placeholder="Timer seconds"
                    value={timerSeconds}
                    onChange={(event) => setTimerSeconds(event.target.value)}
                    disabled={isAutomaticBusy}
                    className="border-input-border bg-input text-foreground"
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="questionCountAutomatic" className="text-foreground">
                    Number of Questions
                  </Label>
                  <Input
                    id="questionCountAutomatic"
                    type="number"
                    min={1}
                    max={50}
                    inputMode="numeric"
                    value={questionCount}
                    onChange={(event) => setQuestionCount(event.target.value)}
                    disabled={isAutomaticBusy}
                    className="border-input-border bg-input text-foreground"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-foreground">Question Difficulty</Label>
                  <div className="flex flex-wrap gap-2">
                    {difficultyOptions.map((option) => (
                      <Button
                        key={option.key}
                        type="button"
                        variant={difficulty === option.key ? 'default' : 'outline'}
                        onClick={() => setDifficulty(option.key)}
                        disabled={isAutomaticBusy}
                        className={
                          difficulty === option.key
                            ? 'bg-gradient-primary text-primary-foreground'
                            : 'border-card-border text-foreground hover:border-primary'
                        }
                      >
                        {option.label}
                      </Button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="promptOverride" className="text-foreground">
                  Prompt Override (Optional)
                </Label>
                <Textarea
                  id="promptOverride"
                  placeholder="Add any extra quiz instructions here..."
                  value={promptOverride}
                  onChange={(event) => setPromptOverride(event.target.value)}
                  disabled={isAutomaticBusy}
                  className="min-h-[140px] border-input-border bg-input text-foreground"
                />
                <p className="text-sm text-muted-foreground">
                  Leave this blank to use the default quiz-generation prompt for the selected difficulty and count.
                </p>
              </div>

              <div className="rounded-md border border-dashed border-card-border bg-muted/20 p-3 text-sm text-muted-foreground">
                This mode sends the YouTube URL through your configured Gemini API key and may use paid API tokens.
                Once generation succeeds, the app immediately moves on to creating the match.
              </div>

              {isAutomaticBusy && (
                <div className="rounded-xl border border-neon-cyan/40 bg-muted/20 p-4 shadow-[0_0_20px_hsl(var(--neon-cyan)/0.12)]">
                  <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <div className="flex items-center gap-4">
                      <div className="relative flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full border border-neon-cyan/40 bg-background-secondary/60">
                        <div className="absolute inset-2 rounded-full border border-neon-blue/20 animate-pulse" />
                        <div className="absolute inset-4 rounded-full border border-neon-purple/30 animate-ping" />
                        <Loader2 className="relative z-10 h-7 w-7 animate-spin text-neon-cyan" />
                      </div>

                      <div className="space-y-1">
                        <p className="font-orbitron text-base font-bold text-foreground">{automaticStatusLabel}</p>
                        <p className="text-sm text-muted-foreground">
                          Please keep this window open while the app finishes the automated setup.
                        </p>
                        <div className="flex items-center gap-2 pt-1">
                          {[0, 1, 2].map((dotIndex) => (
                            <span
                              key={dotIndex}
                              className="h-2.5 w-2.5 rounded-full bg-neon-cyan animate-bounce"
                              style={{ animationDelay: `${dotIndex * 150}ms` }}
                            />
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="rounded-lg border border-card-border bg-background-secondary/70 px-4 py-3 text-center">
                      <div className="mb-1 flex items-center justify-center gap-2 text-xs uppercase tracking-[0.2em] text-muted-foreground">
                        <Clock3 className="h-3.5 w-3.5" />
                        Elapsed
                      </div>
                      <p className="font-orbitron text-2xl font-bold text-neon-cyan">
                        {formatElapsedDuration(automaticElapsedMs)}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {automaticError && (
                <div className="space-y-3">
                  <Alert variant="destructive" className="border-danger/60 bg-danger/10 text-foreground">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>
                      {automaticError.step === 'generate_quiz'
                        ? 'Quiz generation failed'
                        : 'Match creation failed after generation'}
                    </AlertTitle>
                    <AlertDescription>
                      Copy the troubleshooting report below if you want to paste the exact failure details into a bug
                      report or support chat.
                    </AlertDescription>
                  </Alert>

                  <div className="space-y-2">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <Label htmlFor="automaticErrorReport" className="text-foreground">
                        Copyable troubleshooting report
                      </Label>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={handleCopyAutomaticError}
                        className="border-danger/60 text-foreground hover:border-danger"
                      >
                        <CopyIcon className="mr-2 h-4 w-4" />
                        Copy Error
                      </Button>
                    </div>
                    <Textarea
                      id="automaticErrorReport"
                      readOnly
                      value={automaticError.report}
                      className="min-h-[220px] border-danger/40 bg-background-secondary/70 font-mono text-xs text-foreground"
                    />
                  </div>
                </div>
              )}

              {generationMeta && (
                <div className="rounded-md border border-card-border bg-muted/20 p-3 text-sm text-muted-foreground">
                  <p>
                    Last quiz generation used <span className="font-medium text-foreground">{generationMeta.model}</span>.
                  </p>
                  {typeof generationMeta.usage?.totalTokens === 'number' && (
                    <p>Total tokens: {generationMeta.usage.totalTokens}</p>
                  )}
                  {typeof generationMeta.usage?.promptTokens === 'number' && (
                    <p>Prompt tokens: {generationMeta.usage.promptTokens}</p>
                  )}
                  {typeof generationMeta.usage?.candidateTokens === 'number' && (
                    <p>Output tokens: {generationMeta.usage.candidateTokens}</p>
                  )}
                </div>
              )}

              <Button
                type="button"
                onClick={handleGenerateWithAI}
                disabled={isAutomaticBusy}
                className={cn(
                  'w-full bg-gradient-primary font-orbitron font-bold text-primary-foreground',
                  isAutomaticBusy && 'opacity-100',
                )}
              >
                {isGenerating ? 'Generating Quiz...' : isCreating ? 'Creating Match...' : 'Generate Match with AI'}
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-8 md:grid-cols-2">
            <Card className="border-2 border-card-border bg-card shadow-glow-primary">
              <CardHeader>
                <CardTitle className="font-orbitron text-neon-purple">Manual Prompt Generator</CardTitle>
                <CardDescription>
                  Build a prompt, paste it into Google AI Studio, then paste the returned quiz JSON on the right.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="space-y-2">
                  <Label className="text-foreground">1. Choose Question Difficulty</Label>
                  <div className="flex flex-wrap gap-2">
                    {difficultyOptions.map((option) => (
                      <Button
                        key={option.key}
                        type="button"
                        variant={difficulty === option.key ? 'default' : 'outline'}
                        onClick={() => setDifficulty(option.key)}
                        className={
                          difficulty === option.key
                            ? 'bg-gradient-primary text-primary-foreground'
                            : 'border-card-border text-foreground hover:border-primary'
                        }
                      >
                        {option.label}
                      </Button>
                    ))}
                  </div>
                </div>

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
                    onChange={(event) => setQuestionCount(event.target.value)}
                    className="max-w-[140px] border-input-border bg-input text-foreground"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-foreground">3. Copy the Generated Prompt</Label>
                  <p className="text-sm text-muted-foreground">
                    Use this prompt with your source in an AI chat tool, then paste the quiz JSON on the right.
                  </p>
                  <div className="flex flex-wrap items-center gap-3">
                    <Button type="button" onClick={handleCopyPrompt} className="bg-gradient-primary">
                      <CopyIcon className="mr-2 h-4 w-4" />
                      Copy Prompt
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setShowPrompt((value) => !value)}
                      className="border-neon-purple text-neon-purple"
                    >
                      {showPrompt ? <EyeOff className="mr-2 h-4 w-4" /> : <Eye className="mr-2 h-4 w-4" />}
                      {showPrompt ? 'Hide Prompt' : 'Show Prompt'}
                    </Button>
                    <a
                      href="https://aistudio.google.com/prompts/new_chat"
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-2 rounded-md border border-neon-cyan px-3 py-2 text-neon-cyan transition hover:bg-neon-cyan hover:text-primary-foreground"
                    >
                      <ExternalLink className="h-4 w-4" />
                      Paste at Google AI Studio
                    </a>
                  </div>
                </div>

                {showPrompt && (
                  <div className="rounded-md border border-dashed border-card-border bg-muted/20 p-3">
                    <pre className="whitespace-pre-wrap text-sm">{promptText}</pre>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="border-2 border-card-border bg-card shadow-glow-primary">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 font-orbitron text-neon-blue">
                  <Users className="h-5 w-5" />
                  Quiz Setup
                </CardTitle>
                <CardDescription>Paste quiz JSON manually, then configure the match.</CardDescription>
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
                    onChange={(event) => setHostName(event.target.value)}
                    className="border-input-border bg-input text-foreground"
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
                    onChange={(event) => setTimerSeconds(event.target.value)}
                    inputMode="numeric"
                    className="border-input-border bg-input text-foreground"
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
                    onChange={(event) => setQuizJson(event.target.value)}
                    className="min-h-[300px] border-input-border bg-input font-mono text-foreground"
                  />
                </div>

                <Button
                  onClick={handleCreateMatch}
                  disabled={isCreating}
                  className="w-full bg-gradient-primary font-orbitron font-bold text-primary-foreground hover:shadow-glow-primary"
                >
                  {isCreating ? 'Creating Match...' : 'Create Match'}
                </Button>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
};

export default Generator;
