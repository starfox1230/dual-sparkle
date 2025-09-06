import { useEffect, useState } from 'react';
import { Progress } from '@/components/ui/progress';
import { Clock, Zap } from 'lucide-react';

interface TimerProps {
  phaseStart: string;
  timerSeconds: number;
  phase: 'question_reveal' | 'answering';
}

export const Timer = ({ phaseStart, timerSeconds, phase }: TimerProps) => {
  const [timeLeft, setTimeLeft] = useState(timerSeconds);
  const [progress, setProgress] = useState(100);

  useEffect(() => {
    const interval = setInterval(() => {
      const now = new Date().getTime();
      const start = new Date(phaseStart).getTime();
      const elapsed = Math.floor((now - start) / 1000);
      const remaining = Math.max(0, timerSeconds - elapsed);
      
      setTimeLeft(remaining);
      setProgress((remaining / timerSeconds) * 100);
    }, 100);

    return () => clearInterval(interval);
  }, [phaseStart, timerSeconds]);

  if (phase === 'question_reveal') {
    return (
      <div className="text-center">
        <div className="flex items-center justify-center gap-2 mb-4">
          <Zap className="w-6 h-6 text-neon-cyan animate-pulse" />
          <h3 className="text-xl font-orbitron font-bold text-neon-cyan">
            Question Reveal
          </h3>
          <Zap className="w-6 h-6 text-neon-cyan animate-pulse" />
        </div>
        <div className="text-sm text-muted-foreground">
          Get ready to answer in {timeLeft} seconds...
        </div>
      </div>
    );
  }

  const getColorClass = () => {
    if (progress > 50) return 'text-success';
    if (progress > 20) return 'text-warning';
    return 'text-danger';
  };

  const getProgressClass = () => {
    if (progress > 50) return 'bg-success';
    if (progress > 20) return 'bg-warning';
    return 'bg-danger';
  };

  return (
    <div className="text-center space-y-4">
      <div className="flex items-center justify-center gap-3">
        <Clock className={`w-8 h-8 ${getColorClass()}`} />
        <div className={`text-4xl font-orbitron font-bold ${getColorClass()}`}>
          {timeLeft}s
        </div>
      </div>
      
      <div className="max-w-md mx-auto">
        <Progress 
          value={progress} 
          className="h-3 bg-muted"
        />
      </div>
      
      <div className="text-sm text-muted-foreground">
        {timeLeft > 0 ? 'Time to answer!' : 'Time\'s up!'}
      </div>
    </div>
  );
};