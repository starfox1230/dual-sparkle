import { useState, useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Check, X, Copy, Filter } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import type { Answer, QuizSolution, SafeQuiz } from '@/lib/supabase';

type FilterType = 'all' | 'correct' | 'wrong';

interface QuestionReviewProps {
  quizData: SafeQuiz;
  allSolutions: QuizSolution[];
  answers: Answer[];
  currentUserId: string;
}

export const QuestionReview = ({ 
  quizData, 
  allSolutions, 
  answers, 
  currentUserId 
}: QuestionReviewProps) => {
  const [filter, setFilter] = useState<FilterType>('all');
  const { toast } = useToast();

  const reviewData = useMemo(() => {
    if (!quizData?.questions) return [];
    
    return quizData.questions.map((question, index) => {
      const solution = allSolutions.find(s => s.question_index === index);
      const userAnswer = answers.find(a => a.uid === currentUserId && a.question_index === index);
      const isCorrect = userAnswer?.is_correct ?? false;
      
      return {
        index,
        question: question.question,
        options: question.options,
        userAnswer: userAnswer?.choice_text || 'No answer',
        userAnswerIndex: userAnswer?.choice_index,
        correctAnswer: solution?.correct_answer || 'Unknown',
        explanation: solution?.explanation || '',
        isCorrect,
        points: userAnswer?.points || 0
      };
    });
  }, [quizData, allSolutions, answers, currentUserId]);

  const filteredData = useMemo(() => {
    switch (filter) {
      case 'correct':
        return reviewData.filter(q => q.isCorrect);
      case 'wrong':
        return reviewData.filter(q => !q.isCorrect);
      default:
        return reviewData;
    }
  }, [reviewData, filter]);

  const correctCount = reviewData.filter(q => q.isCorrect).length;
  const wrongCount = reviewData.filter(q => !q.isCorrect).length;

  const formatForClipboard = (data: typeof filteredData): string => {
    const filterLabel = filter === 'all' ? 'All Questions' : filter === 'correct' ? 'Correct Answers' : 'Wrong Answers';
    
    let text = `📋 Quiz Review - ${filterLabel}\n`;
    text += `═══════════════════════════════\n\n`;
    
    data.forEach((item, idx) => {
      text += `Question ${item.index + 1}: ${item.question}\n`;
      text += `Your Answer: ${item.userAnswer} ${item.isCorrect ? '✓' : '✗'}\n`;
      text += `Correct Answer: ${item.correctAnswer}\n`;
      if (item.explanation) {
        text += `Explanation: ${item.explanation}\n`;
      }
      text += `Points: +${item.points}\n`;
      if (idx < data.length - 1) {
        text += `\n───────────────────────────────\n\n`;
      }
    });
    
    text += `\n═══════════════════════════════\n`;
    text += `Total: ${correctCount}/${reviewData.length} correct`;
    
    return text;
  };

  const handleCopy = async () => {
    const text = formatForClipboard(filteredData);
    await navigator.clipboard.writeText(text);
    toast({
      title: 'Copied!',
      description: `${filter === 'all' ? 'All' : filter === 'correct' ? 'Correct' : 'Wrong'} answers copied to clipboard`,
    });
  };

  return (
    <Card className="bg-card border-card-border border-2 shadow-glow-primary mt-6">
      <div className="p-6 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <h3 className="text-xl font-orbitron font-bold text-foreground flex items-center gap-2">
            <Filter className="w-5 h-5 text-neon-blue" />
            Question Review
          </h3>
          
          <div className="flex gap-2 flex-wrap">
            <Button
              variant={filter === 'all' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilter('all')}
              className={filter === 'all' 
                ? 'bg-gradient-primary text-primary-foreground font-orbitron' 
                : 'border-neon-blue text-neon-blue hover:bg-neon-blue/20 font-orbitron'}
            >
              All ({reviewData.length})
            </Button>
            <Button
              variant={filter === 'correct' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilter('correct')}
              className={filter === 'correct' 
                ? 'bg-gradient-success text-primary-foreground font-orbitron' 
                : 'border-neon-green text-neon-green hover:bg-neon-green/20 font-orbitron'}
            >
              <Check className="w-4 h-4 mr-1" />
              Correct ({correctCount})
            </Button>
            <Button
              variant={filter === 'wrong' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilter('wrong')}
              className={filter === 'wrong' 
                ? 'bg-gradient-danger text-primary-foreground font-orbitron' 
                : 'border-danger text-danger hover:bg-danger/20 font-orbitron'}
            >
              <X className="w-4 h-4 mr-1" />
              Wrong ({wrongCount})
            </Button>
          </div>
        </div>

        <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2">
          {filteredData.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No {filter === 'correct' ? 'correct' : 'wrong'} answers to display
            </div>
          ) : (
            filteredData.map((item) => (
              <div 
                key={item.index}
                className={`p-4 rounded-lg border-2 ${
                  item.isCorrect 
                    ? 'bg-success/10 border-success/30' 
                    : 'bg-danger/10 border-danger/30'
                }`}
              >
                <div className="flex items-start justify-between gap-3 mb-2">
                  <span className="font-orbitron font-bold text-sm text-muted-foreground">
                    Q{item.index + 1}
                  </span>
                  <Badge 
                    variant="outline"
                    className={item.isCorrect 
                      ? 'border-success text-success' 
                      : 'border-danger text-danger'}
                  >
                    {item.isCorrect ? <Check className="w-3 h-3 mr-1" /> : <X className="w-3 h-3 mr-1" />}
                    {item.isCorrect ? 'Correct' : 'Wrong'}
                  </Badge>
                </div>
                
                <p className="text-foreground font-medium mb-3">{item.question}</p>
                
                <div className="space-y-2 text-sm">
                  <div className="flex gap-2">
                    <span className="text-muted-foreground min-w-[100px]">Your answer:</span>
                    <span className={item.isCorrect ? 'text-success' : 'text-danger'}>
                      {item.userAnswer}
                    </span>
                  </div>
                  
                  {!item.isCorrect && (
                    <div className="flex gap-2">
                      <span className="text-muted-foreground min-w-[100px]">Correct:</span>
                      <span className="text-success">{item.correctAnswer}</span>
                    </div>
                  )}
                  
                  {item.explanation && (
                    <div className="mt-2 p-2 bg-muted/30 rounded text-muted-foreground">
                      <span className="font-medium">Explanation:</span> {item.explanation}
                    </div>
                  )}
                  
                  <div className="text-xs text-neon-blue mt-1">
                    +{item.points} points
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        <Button
          onClick={handleCopy}
          variant="outline"
          className="w-full border-neon-blue text-neon-blue hover:bg-neon-blue hover:text-primary-foreground font-orbitron"
        >
          <Copy className="w-4 h-4 mr-2" />
          Copy {filter === 'all' ? 'All' : filter === 'correct' ? 'Correct' : 'Wrong'} to Clipboard
        </Button>
      </div>
    </Card>
  );
};
