import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { createMatch, type Quiz } from '@/lib/supabase';
import { useToast } from '@/hooks/use-toast';
import { Zap, Gamepad2, Users } from 'lucide-react';

const Generator = () => {
  const [quizJson, setQuizJson] = useState('');
  const [hostName, setHostName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  const validateQuiz = (jsonStr: string): Quiz | null => {
    try {
      const quiz = JSON.parse(jsonStr);
      
      if (!quiz.quizName || !Array.isArray(quiz.questions)) {
        return null;
      }
      
      for (const q of quiz.questions) {
        if (!q.question || !Array.isArray(q.options) || !q.correctAnswer) {
          return null;
        }
        if (q.options.length < 2 || !q.options.includes(q.correctAnswer)) {
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
        title: "Name Required",
        description: "Please enter your name to create a match.",
        variant: "destructive",
      });
      return;
    }

    const quiz = validateQuiz(quizJson);
    if (!quiz) {
      toast({
        title: "Invalid Quiz",
        description: "Please check your quiz JSON format.",
        variant: "destructive",
      });
      return;
    }

    setIsCreating(true);
    try {
      const match = await createMatch(quiz, hostName);
      toast({
        title: "Match Created!",
        description: "Redirecting to match lobby...",
      });
      navigate(`/match/${match.id}`);
    } catch (error) {
      console.error('Error creating match:', error);
      toast({
        title: "Error",
        description: "Failed to create match. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsCreating(false);
    }
  };

  const sampleQuiz = {
    quizName: "Space Knowledge Quiz",
    questions: [
      {
        question: "What is the closest planet to the Sun?",
        options: ["Venus", "Mercury", "Earth", "Mars"],
        correctAnswer: "Mercury",
        explanation: "Mercury is the innermost planet in our solar system."
      },
      {
        question: "How many moons does Jupiter have?",
        options: ["63", "79", "95", "102"],
        correctAnswer: "95",
        explanation: "Jupiter has 95 confirmed moons as of recent discoveries."
      }
    ]
  };

  return (
    <div className="min-h-screen bg-gradient-bg font-roboto">
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-3 mb-4">
            <Zap className="w-8 h-8 text-neon-blue" />
            <h1 className="text-4xl font-orbitron font-bold text-foreground">
              Quiz Generator
            </h1>
            <Gamepad2 className="w-8 h-8 text-neon-purple" />
          </div>
          <p className="text-xl text-muted-foreground">
            Create epic head-to-head quiz battles
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-8">
          {/* Quiz Input */}
          <Card className="bg-card border-card-border border-2 shadow-glow-primary">
            <CardHeader>
              <CardTitle className="font-orbitron text-neon-blue flex items-center gap-2">
                <Users className="w-5 h-5" />
                Quiz Setup
              </CardTitle>
              <CardDescription>
                Paste your quiz JSON or use the sample below
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="hostName" className="text-foreground">Your Name</Label>
                <Input
                  id="hostName"
                  placeholder="Enter your name"
                  value={hostName}
                  onChange={(e) => setHostName(e.target.value)}
                  className="bg-input border-input-border text-foreground"
                />
              </div>
              
              <div>
                <Label htmlFor="quiz" className="text-foreground">Quiz JSON</Label>
                <Textarea
                  id="quiz"
                  placeholder="Paste your quiz JSON here..."
                  value={quizJson}
                  onChange={(e) => setQuizJson(e.target.value)}
                  className="min-h-[300px] bg-input border-input-border text-foreground font-mono"
                />
              </div>

              <Button
                onClick={() => setQuizJson(JSON.stringify(sampleQuiz, null, 2))}
                variant="outline"
                className="w-full border-neon-cyan text-neon-cyan hover:bg-neon-cyan hover:text-primary-foreground"
              >
                Load Sample Quiz
              </Button>

              <Button
                onClick={handleCreateMatch}
                disabled={isCreating}
                className="w-full bg-gradient-primary hover:shadow-glow-primary text-primary-foreground font-orbitron font-bold"
              >
                {isCreating ? 'Creating Match...' : 'Create Match'}
              </Button>
            </CardContent>
          </Card>

          {/* Quiz Format Guide */}
          <Card className="bg-card border-card-border border-2">
            <CardHeader>
              <CardTitle className="font-orbitron text-neon-purple">
                Quiz Format Guide
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div>
                <h4 className="font-semibold text-foreground mb-2">Required Structure:</h4>
                <pre className="bg-muted p-3 rounded font-mono text-xs overflow-x-auto">
{`{
  "quizName": "Your Quiz Title",
  "questions": [
    {
      "question": "Question text?",
      "options": ["A", "B", "C", "D"],
      "correctAnswer": "B",
      "explanation": "Why B is correct"
    }
  ]
}`}
                </pre>
              </div>

              <div>
                <h4 className="font-semibold text-foreground mb-2">Rules:</h4>
                <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                  <li>At least 2 options per question</li>
                  <li>correctAnswer must match one option exactly</li>
                  <li>explanation is optional but recommended</li>
                  <li>Questions can have 2-6 options</li>
                </ul>
              </div>

              <div className="p-3 bg-warning/10 border border-warning rounded">
                <p className="text-warning text-xs">
                  <strong>Tip:</strong> Questions with 4 options work best for mobile gameplay!
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default Generator;