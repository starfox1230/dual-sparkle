import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Crown, User, Check, Clock } from 'lucide-react';
import type { Player, Answer } from '@/lib/supabase';

interface ScoreBoardProps {
  players: Player[];
  currentUserId?: string;
  final?: boolean;
  phase?: string;
  playersWhoAnswered?: Set<string>;
}

export const ScoreBoard = ({
  players,
  currentUserId,
  final = false,
  phase,
  playersWhoAnswered = new Set(),
}: ScoreBoardProps) => {
  if (players.length === 0) return null;

  const sortedPlayers = [...players].sort((a, b) => b.score - a.score);
  const isWinner = (player: Player) => final && player === sortedPlayers[0] && sortedPlayers[0].score > (sortedPlayers[1]?.score || 0);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
      {players.map((player) => {
        const isCurrentUser = player.uid === currentUserId;
        const winner = isWinner(player);
        
        const hasAnswered = playersWhoAnswered.has(player.uid);

        return (
          <Card
            key={player.uid}
            className={`p-4 border-2 transition-all duration-300 ${
              isCurrentUser
                ? 'border-primary shadow-glow-primary bg-primary/5'
                : 'border-card-border bg-card'
            } ${winner ? 'shadow-glow-success' : ''}`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {winner ? (
                  <Crown className="w-6 h-6 text-success" />
                ) : (
                  <User className="w-6 h-6 text-muted-foreground" />
                )}
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-foreground">
                      {player.name}
                    </span>
                    {isCurrentUser && (
                      <Badge variant="secondary" className="text-xs">
                        You
                      </Badge>
                    )}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Joined {new Date(player.joined_at).toLocaleTimeString()}
                  </div>
                </div>
              </div>

              <div className="text-right">
                <div
                  className={`text-2xl font-orbitron font-bold ${
                    winner ? 'text-success' : 'text-foreground'
                  }`}
                >
                  {player.score}
                </div>
                <div className="flex items-center gap-1 text-xs">
                  {phase === 'answering' ? (
                    hasAnswered ? (
                      <div className="flex items-center gap-1 text-success">
                        <Check className="w-3 h-3" />
                        Answered
                      </div>
                    ) : (
                      <div className="flex items-center gap-1 text-muted-foreground">
                        <Clock className="w-3 h-3" />
                        Waiting
                      </div>
                    )
                  ) : player.ready ? (
                    <div className="flex items-center gap-1 text-success">
                      <Check className="w-3 h-3" />
                      Ready
                    </div>
                  ) : (
                    <div className="flex items-center gap-1 text-muted-foreground">
                      <Clock className="w-3 h-3" />
                      Waiting
                    </div>
                  )}
                </div>
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
};