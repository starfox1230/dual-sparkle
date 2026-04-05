import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bot, Copy as CopyIcon, ExternalLink, Eye, EyeOff, Gamepad2, Users, Zap } from 'lucide-react';

import { generateQuizFromYouTube, type QuizGenerationUsage } from '@/lib/ai';
import {
  buildManualPrompt,
  clampQuestionCount,
  difficultyOptions,
  isLikelyYouTubeUrl,
  type Difficulty,
} from '@/lib/quiz-generation';
import { createMatch, type Quiz } from '@/lib/supabase';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

type GenerationMode = 'manual' | 'automatic';

interface GenerationMeta {
  model: string;
  usage?: QuizGenerationUsage;
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
    description: 'Send a YouTube URL through Gemini and auto-fill the quiz JSON.',
  },
];

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

  const navigate = useNavigate();
  const { toast } = useToast();

  const promptText = buildManualPrompt({ difficulty, questionCount });

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

    const secs = Number.parseInt(timerSeconds, 10);
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

  const handleCopyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(promptText);
      toast({
        title: 'Prompt copied',
        description: 'Paste it into Google AI Studio.',
        duration: 1500,
      });
    } catch {
      toast({
        title: 'Copy failed',
        description: 'Please copy manually.',
        variant: 'destructive',
      });
    }
  };

  const handleGenerateWithAI = async () => {
    const trimmedUrl = youtubeUrl.trim();

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

    setIsGenerating(true);
    setGenerationMeta(null);

    try {
      const result = await generateQuizFromYouTube({
        youtubeUrl: trimmedUrl,
        difficulty,
        questionCount: clampQuestionCount(questionCount),
        promptOverride,
      });

      const nextQuizJson = JSON.stringify(result.quiz, null, 2);
      if (!validateQuiz(nextQuizJson)) {
        throw new Error('The AI response was not valid quiz JSON for this app.');
      }

      setQuizJson(nextQuizJson);
      setGenerationMeta({
        model: result.model,
        usage: result.usage,
      });

      toast({
        title: 'Quiz generated',
        description: 'The generated quiz JSON has been added to Quiz Setup.',
      });
    } catch (error) {
      console.error('Error generating quiz:', error);
      toast({
        title: 'Generation failed',
        description:
          error instanceof Error ? error.message : 'Failed to generate a quiz from the YouTube URL.',
        variant: 'destructive',
      });
    } finally {
      setIsGenerating(false);
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

        <div className="grid gap-8 md:grid-cols-2">
          <Card className="border-2 border-card-border bg-card shadow-glow-primary">
            {generationMode === 'manual' ? (
              <>
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
              </>
            ) : (
              <>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 font-orbitron text-neon-purple">
                    <Bot className="h-5 w-5" />
                    Automatic AI Quiz Generator
                  </CardTitle>
                  <CardDescription>
                    Use Gemini through a Supabase Edge Function to generate quiz JSON directly from a YouTube URL.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div className="space-y-2">
                    <Label htmlFor="youtubeUrl" className="text-foreground">
                      1. YouTube URL
                    </Label>
                    <Input
                      id="youtubeUrl"
                      type="url"
                      placeholder="https://www.youtube.com/watch?v=..."
                      value={youtubeUrl}
                      onChange={(event) => setYouTubeUrl(event.target.value)}
                      className="border-input-border bg-input text-foreground"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-foreground">2. Choose Question Difficulty</Label>
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
                    <Label htmlFor="questionCountAutomatic" className="text-foreground">
                      3. Number of Questions
                    </Label>
                    <Input
                      id="questionCountAutomatic"
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
                    <Label htmlFor="promptOverride" className="text-foreground">
                      4. Prompt Override (Optional)
                    </Label>
                    <Textarea
                      id="promptOverride"
                      placeholder="Add any extra quiz instructions here..."
                      value={promptOverride}
                      onChange={(event) => setPromptOverride(event.target.value)}
                      className="min-h-[140px] border-input-border bg-input text-foreground"
                    />
                    <p className="text-sm text-muted-foreground">
                      Leave this blank to use the default quiz-generation prompt for the selected difficulty and count.
                    </p>
                  </div>

                  <div className="rounded-md border border-dashed border-card-border bg-muted/20 p-3 text-sm text-muted-foreground">
                    This mode sends the YouTube URL through your configured Gemini API key and may use paid API tokens.
                    The generated JSON will be placed into the Quiz Setup panel automatically.
                  </div>

                  <Button
                    type="button"
                    onClick={handleGenerateWithAI}
                    disabled={isGenerating}
                    className="w-full bg-gradient-primary font-orbitron font-bold text-primary-foreground"
                  >
                    {isGenerating ? 'Generating Quiz...' : 'Generate with AI'}
                  </Button>

                  {generationMeta && (
                    <div className="rounded-md border border-card-border bg-muted/20 p-3 text-sm text-muted-foreground">
                      <p>
                        Generated with <span className="font-medium text-foreground">{generationMeta.model}</span>.
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
                </CardContent>
              </>
            )}
          </Card>

          <Card className="border-2 border-card-border bg-card shadow-glow-primary">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 font-orbitron text-neon-blue">
                <Users className="h-5 w-5" />
                Quiz Setup
              </CardTitle>
              <CardDescription>
                Paste quiz JSON manually or let Automatic AI fill it in, then configure the match.
              </CardDescription>
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
                  placeholder={
                    generationMode === 'automatic'
                      ? 'Generated quiz JSON will appear here, or you can paste your own...'
                      : 'Paste your quiz JSON here...'
                  }
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
      </div>
    </div>
  );
};

export default Generator;
