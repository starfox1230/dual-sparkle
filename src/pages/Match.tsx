import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { supabase, joinMatch, startPhase, type Match, type Player, type Answer } from '@/lib/supabase';
import type { User } from '@supabase/supabase-js';
import { useToast } from '@/hooks/use-toast';
import { Timer } from '@/components/Timer';
import { ScoreBoard } from '@/components/ScoreBoard';
import { QRCodeSVG } from 'qrcode.react';
import { Copy, Users, Crown, Zap, Check, X } from 'lucide-react';

const MatchPage = () => {
  const { matchId } = useParams<{ matchId: string }>();
  const [match, setMatch] = useState<Match | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [playerName, setPlayerName] = useState('');
  const [showJoinForm, setShowJoinForm] = useState(false);
  const [selectedChoice, setSelectedChoice] = useState<number | null>(null);
  const [showQR, setShowQR] = useState(false);
  const [roundProcessed, setRoundProcessed] = useState(false);
  const [nextQuestionTriggered, setNextQuestionTriggered] = useState(false);
  const { toast } = useToast();

  // Refs to avoid stale closures in realtime handlers
  const currentQuestionRef = useRef<number>(0);
  const matchRef = useRef<Match | null>(null);
  const playersRef = useRef<Player[]>([]);
  const isHostRef = useRef<boolean>(false);
  const roundProcessedRef = useRef<boolean>(false);
  const revealAnswersRef = useRef<() => void>(() => {});

  const currentQuestion = match?.quiz.questions[match.current_question_index];
  const isHost = !!(currentUser && match && currentUser.id === match.host_uid);
  const currentPlayer = players.find(p => p.uid === currentUser?.id);
  const otherPlayer = players.find(p => p.uid !== currentUser?.id);
  const allReady = players.length === 2 && players.every(p => p.ready);

  // Derived answer state for the *current question*
  const answersForCurrent = useMemo(
    () => answers.filter(a => a.question_index === match?.current_question_index),
    [answers, match?.current_question_index]
  );
  const answeredUids = useMemo(() => new Set(answersForCurrent.map(a => a.uid)), [answersForCurrent]);
  const iHaveAnswered = !!(currentUser && answeredUids.has(currentUser.id));
  const otherHasAnswered = !!(otherPlayer && answeredUids.has(otherPlayer.uid));
  const hasAnswered = iHaveAnswered;

  // Keep refs in sync
  useEffect(() => {
    matchRef.current = match;
    isHostRef.current = isHost;
  }, [match, isHost]);

  useEffect(() => {
    playersRef.current = players;
  }, [players]);

  useEffect(() => {
    roundProcessedRef.current = roundProcessed;
  }, [roundProcessed]);

  useEffect(() => {
    currentQuestionRef.current = match?.current_question_index ?? 0;
  }, [match?.current_question_index]);

  useEffect(() => {
    revealAnswersRef.current = () => {}; // placeholder until assigned after revealAnswers is defined
  }, []);

  // Auth
  useEffect(() => {
    if (!matchId) return;

    const initAuth = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setCurrentUser(user);

      if (!user) {
        try {
          const { data } = await supabase.auth.signInAnonymously();
          setCurrentUser(data.user);
        } catch (error) {
          console.error('Auth error:', error);
        }
      }
    };

    initAuth();
  }, [matchId]);

  // Initial fetch + realtime
  useEffect(() => {
    if (!matchId || !currentUser) return;

    const fetchData = async () => {
      // Fetch match
      const { data: matchData } = await supabase
        .from('matches')
        .select('*')
        .eq('id', matchId)
        .single();

      if (matchData) setMatch(matchData);

      // Fetch players
      const { data: playersData } = await supabase
        .from('players')
        .select('*')
        .eq('match_id', matchId);

      if (playersData) {
        setPlayers(playersData);

        // Check if current user needs to join
        const isPlayerInMatch = playersData.some(p => p.uid === currentUser.id);
        if (!isPlayerInMatch && playersData.length < 2) {
          setShowJoinForm(true);
        }
      }

      // Fetch answers for current question
      if (matchData) {
        const { data: answersData } = await supabase
          .from('answers')
          .select('*')
          .eq('match_id', matchId)
          .eq('question_index', matchData.current_question_index);

        if (answersData) setAnswers(answersData);
      }
    };

    fetchData();

    // Realtime subscriptions
    const matchChannel = supabase
      .channel(`match:${matchId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'matches', filter: `id=eq.${matchId}` },
        (payload) => {
          if (payload.new) {
            setMatch(payload.new as Match);
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'players', filter: `match_id=eq.${matchId}` },
        () => {
          // Re-fetch players (keeps ready/score in sync)
          (async () => {
            const { data: playersData } = await supabase
              .from('players')
              .select('*')
              .eq('match_id', matchId);
            if (playersData) setPlayers(playersData);
          })();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'answers', filter: `match_id=eq.${matchId}` },
        (payload) => {
          if (!payload.new) return;
          const newAnswer = payload.new as Answer;
          if (newAnswer.question_index !== currentQuestionRef.current) return;

          setAnswers(prev => {
            const next = [
              ...prev.filter(a => !(a.uid === newAnswer.uid && a.question_index === newAnswer.question_index)),
              newAnswer,
            ];

            // Host: flip instantly when both have answered (no waiting for timer)
            const m = matchRef.current;
            if (
              m &&
              isHostRef.current &&
              m.status === 'answering' &&
              !roundProcessedRef.current
            ) {
              const onThisQ = next.filter(a => a.question_index === m.current_question_index);
              const uniqueUids = new Set(onThisQ.map(a => a.uid));
              const playerCount = playersRef.current.length;

              if (playerCount > 0 && uniqueUids.size === playerCount) {
                // Mark processed and reveal
                roundProcessedRef.current = true;
                setRoundProcessed(true);
                // Call via ref to avoid stale closure
                revealAnswersRef.current();
              }
            }

            return next;
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(matchChannel);
    };
  }, [matchId, currentUser]);

  // Auto-advance from question_reveal -> answering after 5s (host only)
  useEffect(() => {
    if (!match || !isHost || match.status !== 'question_reveal') return;

    const timeout = setTimeout(() => {
      startPhase(match.id, 'answering');
    }, 5000);

    return () => clearTimeout(timeout);
  }, [match, isHost]);

  // Reset local selection each question
  useEffect(() => {
    setSelectedChoice(null);
  }, [match?.current_question_index]);

  // Clear answers cache for the new question to avoid stale indicators
  useEffect(() => {
    if (match?.status === 'question_reveal') {
      setAnswers([]);
    }
  }, [match?.current_question_index, match?.status]);

  // Ensure ready state resets immediately when entering round end
  useEffect(() => {
    if (match?.status === 'round_end') {
      setPlayers(prev => prev.map(p => ({ ...p, ready: false })));
    }
  }, [match?.status]);

  const revealAnswers = useCallback(async () => {
    const m = matchRef.current;
    const qIndex = currentQuestionRef.current;
    const currMatch = m ?? match;
    const currQuestion =
      currMatch?.quiz.questions[currMatch.current_question_index];

    if (!currMatch || !currQuestion) return;

    try {
      // Local optimistic update so Timer stops and results show immediately
      setPlayers(prev =>
        prev.map(p => {
          const ans = answers.find(a => a.uid === p.uid && a.question_index === qIndex);
          const isCorrect = ans ? ans.choice_text === currQuestion.correctAnswer : false;
          const points = isCorrect ? 1 : 0;
          return { ...p, score: (p.score || 0) + points, ready: false };
        })
      );

      setAnswers(prev =>
        prev.map(a => {
          if (a.question_index !== qIndex) return a;
          const isCorrect = a.choice_text === currQuestion.correctAnswer;
          const points = isCorrect ? 1 : 0;
          return { ...a, is_correct: isCorrect, points };
        })
      );

      // Optimistic match status change to unmount Timer
      setMatch(prev => (prev ? { ...prev, status: 'round_end', phase_start: new Date().toISOString() } : prev));

      await startPhase(currMatch.id, 'round_end');

      // Persist correctness & points and reset readies
      for (const p of playersRef.current) {
        const ans = answers.find(a => a.uid === p.uid && a.question_index === qIndex);
        const isCorrect = ans ? ans.choice_text === currQuestion.correctAnswer : false;
        const points = isCorrect ? 1 : 0;

        if (ans) {
          const { error: ansErr } = await supabase
            .from('answers')
            .update({ is_correct: isCorrect, points })
            .eq('match_id', currMatch.id)
            .eq('uid', p.uid)
            .eq('question_index', qIndex);
          if (ansErr) console.error('Answer update error:', ansErr);
        }

        const { error: playerErr } = await supabase
          .from('players')
          .update({ score: (p.score || 0) + points, ready: false })
          .eq('match_id', currMatch.id)
          .eq('uid', p.uid);
        if (playerErr) console.error('Player score update error:', playerErr);
      }
    } catch (error) {
      console.error('Reveal answers error:', error);
    }
  }, [match, answers]);

  // Expose latest revealAnswers via ref for realtime callback
  useEffect(() => {
    revealAnswersRef.current = () => {
      // Call the memoized function with latest closures
      (async () => {
        await revealAnswers();
      })();
    };
  }, [revealAnswers]);

  // Host-side auto reveal (fallback if realtime path misses)
  useEffect(() => {
    if (!match || !isHost) return;

    if (match.status !== 'answering') {
      setRoundProcessed(false);
      return;
    }

    if (roundProcessed) return;

    const currentAnswers = answers.filter(a => a.question_index === match.current_question_index);
    const allAnswered = currentAnswers.length === players.length && players.length > 0;

    if (allAnswered) {
      setRoundProcessed(true);
      revealAnswers();
      return;
    }

    // Fallback: reveal when timer hits zero
    const now = Date.now();
    const start = new Date(match.phase_start).getTime();
    const remaining = match.timer_seconds * 1000 - (now - start);
    const timeout = setTimeout(() => {
      setRoundProcessed(true);
      revealAnswers();
    }, Math.max(0, remaining));

    return () => clearTimeout(timeout);
  }, [match, answers, players, isHost, roundProcessed, revealAnswers]);

  // Next question when both press Ready on round_end (host only)
  useEffect(() => {
    if (!match || !isHost) return;

    if (match.status !== 'round_end') {
      setNextQuestionTriggered(false);
      return;
    }

    if (nextQuestionTriggered) return;

    if (players.length > 0 && players.every(p => p.ready)) {
      setNextQuestionTriggered(true);
      const nextIndex = match.current_question_index + 1;
      if (nextIndex < match.quiz.questions.length) {
        startPhase(match.id, 'question_reveal', nextIndex);
      } else {
        startPhase(match.id, 'finished');
      }
    }
  }, [match, players, isHost, nextQuestionTriggered]);

  const handleJoin = async () => {
    if (!playerName.trim() || !matchId) return;

    try {
      await joinMatch(matchId, playerName);
      setShowJoinForm(false);
      toast({
        title: "Joined Match!",
        description: "Welcome to the quiz battle!",
      });
    } catch (error) {
      console.error('Join error:', error);
      toast({
        title: "Error",
        description: "Failed to join match. It might be full.",
        variant: "destructive",
      });
    }
  };

  const handleReady = async () => {
    if (!currentPlayer || !matchId || !currentUser) return;

    const { error } = await supabase
      .from('players')
      .update({ ready: !currentPlayer.ready })
      .eq('match_id', matchId)
      .eq('uid', currentUser.id);

    if (error) {
      toast({
        title: "Error",
        description: "Failed to update ready status.",
        variant: "destructive",
      });
    }
  };

  const handleStart = async () => {
    if (!isHost || !matchId) return;

    try {
      await startPhase(matchId, 'question_reveal', 0);
    } catch (error) {
      console.error('Start error:', error);
    }
  };

  const handleAnswer = async (choiceIndex: number) => {
    if (!currentUser || !match || !currentQuestion || hasAnswered) return;

    setSelectedChoice(choiceIndex);

    const newAnswer = {
      match_id: match.id,
      uid: currentUser.id,
      question_index: match.current_question_index,
      choice_index: choiceIndex,
      choice_text: currentQuestion.options[choiceIndex],
    };

    // Optimistic local update
    setAnswers(prev => [
      ...prev.filter(a => !(a.uid === currentUser.id && a.question_index === match.current_question_index)),
      newAnswer as Answer,
    ]);

    const { error } = await supabase
      .from('answers')
      .upsert(newAnswer);

    if (error) {
      console.error('Answer error:', error);
      setSelectedChoice(null);
    }
  };

  const copyInviteLink = () => {
    const url = `${window.location.origin}/match/${matchId}`;
    navigator.clipboard.writeText(url);
    toast({
      title: "Link Copied!",
      description: "Share this link to invite a friend.",
    });
  };

  if (showJoinForm) {
    return (
      <div className="min-h-screen bg-gradient-bg flex items-center justify-center p-4">
        <Card className="w-full max-w-md bg-card border-card-border border-2 shadow-glow-primary">
          <div className="p-6 text-center space-y-4">
            <div className="flex items-center justify-center gap-2 mb-4">
              <Users className="w-6 h-6 text-neon-blue" />
              <h2 className="text-2xl font-orbitron font-bold text-foreground">Join Match</h2>
            </div>

            <Input
              placeholder="Enter your name"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
              className="bg-input border-input-border text-foreground"
            />

            <Button
              onClick={handleJoin}
              disabled={!playerName.trim()}
              className="w-full bg-gradient-primary hover:shadow-glow-primary text-primary-foreground font-orbitron font-bold"
            >
              Join Battle
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  if (!match || !currentPlayer) {
    return (
      <div className="min-h-screen bg-gradient-bg flex items-center justify-center">
        <div className="text-center">
          <Zap className="w-12 h-12 mx-auto mb-4 text-neon-blue animate-pulse" />
          <p className="text-xl font-orbitron text-foreground">Loading match...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-bg font-roboto">
      <div className="container mx-auto px-4 py-6 max-w-4xl">
        {/* Header */}
        <div className="text-center mb-6">
          <div className="flex items-center justify-center gap-3 mb-2">
            <Crown className="w-6 h-6 text-neon-purple" />
            <h1 className="text-2xl font-orbitron font-bold text-foreground">
              {match.quiz_name}
            </h1>
          </div>

          <div className="flex items-center justify-center gap-4 mb-4">
            <Badge variant="secondary" className="bg-secondary text-secondary-foreground">
              {match.status.replace('_', ' ').toUpperCase()}
            </Badge>
            {match.status !== 'lobby' && (
              <Badge variant="outline" className="border-neon-cyan text-neon-cyan">
                Question {match.current_question_index + 1} of {match.quiz.questions.length}
              </Badge>
            )}
          </div>

          {match.status === 'lobby' && (
            <div className="flex items-center justify-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={copyInviteLink}
                className="border-neon-blue text-neon-blue hover:bg-neon-blue hover:text-primary-foreground"
              >
                <Copy className="w-4 h-4 mr-1" />
                Copy Link
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowQR(!showQR)}
                className="border-neon-purple text-neon-purple hover:bg-neon-purple hover:text-primary-foreground"
              >
                QR Code
              </Button>
            </div>
          )}

          {showQR && (
            <div className="mt-4 flex justify-center">
              <div className="bg-white p-4 rounded-lg">
                <QRCodeSVG value={`${window.location.origin}/match/${matchId}`} size={128} />
              </div>
            </div>
          )}
        </div>

        {/* Players & Score */}
        <ScoreBoard
          players={players}
          currentUserId={currentUser?.id}
          answers={answers}
          currentQuestionIndex={match.current_question_index}
          phase={match.status}
        />

        {/* Game Content */}
        {match.status === 'lobby' && (
          <Card className="bg-card border-card-border border-2 shadow-glow-primary">
            <div className="p-8 text-center space-y-6">
              <h2 className="text-3xl font-orbitron font-bold text-foreground">Lobby</h2>
              <p className="text-muted-foreground">
                {players.length === 1 ? 'Waiting for second player...' : 'Both players connected!'}
              </p>

              <div className="space-y-4">
                <Button
                  onClick={handleReady}
                  variant={currentPlayer.ready ? "default" : "outline"}
                  className={`w-full ${
                    currentPlayer.ready
                      ? 'bg-gradient-success shadow-glow-success'
                      : 'border-neon-green text-neon-green hover:bg-neon-green hover:text-primary-foreground'
                  } font-orbitron font-bold`}
                >
                  {currentPlayer.ready ? (
                    <>
                      <Check className="w-5 h-5 mr-2" />
                      Ready!
                    </>
                  ) : (
                    'Ready Up'
                  )}
                </Button>

                {isHost && allReady && (
                  <Button
                    onClick={handleStart}
                    className="w-full bg-gradient-primary hover:shadow-glow-primary text-primary-foreground font-orbitron font-bold text-lg"
                  >
                    <Zap className="w-5 h-5 mr-2" />
                    Start Quiz Battle!
                  </Button>
                )}
              </div>
            </div>
          </Card>
        )}

        {(match.status === 'question_reveal' || match.status === 'answering') && currentQuestion && (
          <div className="space-y-6">
            <Timer
              phaseStart={match.phase_start}
              timerSeconds={match.status === 'question_reveal' ? 5 : match.timer_seconds}
              phase={match.status}
            />

            {match.status === 'answering' && (
              <div className="flex justify-center gap-2 text-sm">
                <span
                  className={`px-2 py-1 rounded-full border ${
                    iHaveAnswered ? 'border-neon-green text-neon-green' : 'border-muted-foreground text-muted-foreground'
                  }`}
                >
                  You: {iHaveAnswered ? 'Submitted' : 'Thinking…'}
                </span>
                {otherPlayer && (
                  <span
                    className={`px-2 py-1 rounded-full border ${
                      otherHasAnswered ? 'border-neon-blue text-neon-blue' : 'border-muted-foreground text-muted-foreground'
                    }`}
                  >
                    {otherPlayer.name}: {otherHasAnswered ? 'Answered' : 'Waiting…'}
                  </span>
                )}
              </div>
            )}

            <Card className="bg-card border-card-border border-2 shadow-glow-primary">
              <div className="p-8 text-center">
                <h2 className="text-2xl font-orbitron font-bold text-foreground mb-8">
                  {currentQuestion.question}
                </h2>

                {match.status === 'answering' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl mx-auto">
                    {currentQuestion.options.map((option: string, index: number) => {
                      const isSelected = selectedChoice === index;
                      const isDisabled = hasAnswered;

                      return (
                        <Button
                          key={index}
                          onClick={() => handleAnswer(index)}
                          disabled={isDisabled}
                          variant="outline"
                          className={`h-16 text-left justify-start ${
                            isSelected
                              ? 'border-neon-green bg-neon-green/10 text-neon-green shadow-glow-success'
                              : 'border-card-border hover:border-primary hover:text-primary'
                          } ${isDisabled && !isSelected ? 'opacity-50' : ''}`}
                        >
                          <span className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center mr-3 font-orbitron font-bold">
                            {String.fromCharCode(65 + index)}
                          </span>
                          {option}
                        </Button>
                      );
                    })}
                  </div>
                )}
              </div>
            </Card>
          </div>
        )}

        {match.status === 'round_end' && currentQuestion && (
          <div className="space-y-6">
            <Card className="bg-card border-card-border border-2 shadow-glow-primary">
              <div className="p-8 text-center space-y-6">
                <h2 className="text-2xl font-orbitron font-bold text-foreground">
                  {currentQuestion.question}
                </h2>

                <div className="text-xl font-bold">
                  <span className="text-success">Correct Answer: {currentQuestion.correctAnswer}</span>
                </div>

                {currentQuestion.explanation && (
                  <p className="text-muted-foreground max-w-2xl mx-auto">
                    {currentQuestion.explanation}
                  </p>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl mx-auto">
                  {players.map((player) => {
                    const answer = answers.find(a => a.uid === player.uid && a.question_index === match.current_question_index);
                    const isCorrect = answer ? answer.choice_text === currentQuestion.correctAnswer : false;
                    const points = isCorrect ? 1 : 0;

                    return (
                      <div
                        key={player.uid}
                        className={`p-4 rounded-lg border-2 ${
                          isCorrect ? 'border-success bg-success/10' : 'border-danger bg-danger/10'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-semibold">{player.name}</span>
                          {isCorrect ? (
                            <Check className="w-5 h-5 text-success" />
                          ) : (
                            <X className="w-5 h-5 text-danger" />
                          )}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {answer ? answer.choice_text : 'No answer'}
                        </div>
                        {answer && (
                          <div className="text-lg font-bold text-foreground">
                            +{points} points
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                <Button
                  onClick={handleReady}
                  variant={currentPlayer.ready ? "default" : "outline"}
                  className={`${
                    currentPlayer.ready
                      ? 'bg-gradient-success shadow-glow-success'
                      : 'border-neon-green text-neon-green hover:bg-neon-green hover:text-primary-foreground'
                  } font-orbitron font-bold`}
                >
                  {currentPlayer.ready ? 'Waiting for opponent...' : 'Ready for Next'}
                </Button>
              </div>
            </Card>
          </div>
        )}

        {match.status === 'finished' && (
          <Card className="bg-card border-card-border border-2 shadow-glow-primary">
            <div className="p-8 text-center space-y-6">
              <h2 className="text-4xl font-orbitron font-bold text-foreground">
                Quiz Complete!
              </h2>

              <div className="text-2xl font-bold">
                {currentPlayer && otherPlayer && currentPlayer.score > (otherPlayer.score ?? 0) && (
                  <span className="text-success">🏆 You Win! 🏆</span>
                )}
                {currentPlayer && otherPlayer && currentPlayer.score < (otherPlayer.score ?? 0) && (
                  <span className="text-danger">You Lost!</span>
                )}
                {currentPlayer && otherPlayer && currentPlayer.score === (otherPlayer.score ?? 0) && (
                  <span className="text-warning">It's a Tie!</span>
                )}
              </div>

              <ScoreBoard players={players} currentUserId={currentUser?.id} final={true} />

              <div className="flex gap-4 justify-center">
                <Button
                  onClick={() => (window.location.href = '/')}
                  className="bg-gradient-primary hover:shadow-glow-primary text-primary-foreground font-orbitron font-bold"
                >
                  New Quiz
                </Button>
              </div>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
};

export default MatchPage;