import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { supabase, joinMatch, startPhase, getQuizSolutions, type Match, type Player, type Answer, type QuizSolution, type SafeQuiz } from '@/lib/supabase';
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
  const [quizSolutions, setQuizSolutions] = useState<QuizSolution[]>([]);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [playerName, setPlayerName] = useState('');
  const [showJoinForm, setShowJoinForm] = useState(false);
  const [selectedChoice, setSelectedChoice] = useState<number | null>(null);
  const [showQR, setShowQR] = useState(false);
  const [roundProcessed, setRoundProcessed] = useState(false);
  const [nextQuestionTriggered, setNextQuestionTriggered] = useState(false);
  const { toast } = useToast();
  // The currentQuestionRef was causing a stale closure issue in the subscription. It has been removed.

  const currentQuestion = match?.quiz.questions[match.current_question_index];
  const currentSolution = quizSolutions.find(s => s.question_index === match?.current_question_index);
  const isHost = currentUser && match && currentUser.id === match.host_uid;
  const currentPlayer = players.find(p => p.uid === currentUser?.id);
  const otherPlayer = players.find(p => p.uid !== currentUser?.id);
  const allReady = players.length === 2 && players.every(p => p.ready);
  const hasAnswered = answers.some(a => a.uid === currentUser?.id && a.question_index === match?.current_question_index);

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

  useEffect(() => {
    if (!matchId || !currentUser) return;

    const fetchData = async () => {
      // Fetch match
      const { data: matchData } = await supabase
        .from('matches')
        .select('*')
        .eq('id', matchId)
        .single();

      if (matchData) {
        setMatch(matchData);
      }

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

        if (answersData) {
          setAnswers(answersData);
        }
      }
    };

    fetchData();

    // Set up realtime subscriptions with better state management
    const matchChannel = supabase
      .channel(`match:${matchId}`)
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'matches', 
        filter: `id=eq.${matchId}` 
      }, (payload) => {
        console.log('🔄 Match realtime update:', payload.eventType, payload.new);
        if (payload.new) {
          const newMatch = payload.new as Match;
          setMatch(prev => {
            console.log('📱 Match state change:', { 
              oldStatus: prev?.status, 
              newStatus: newMatch.status,
              oldQuestion: prev?.current_question_index,
              newQuestion: newMatch.current_question_index
            });
            return newMatch;
          });
        }
      })
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'players',
        filter: `match_id=eq.${matchId}`
      }, (payload) => {
        console.log('👥 Player realtime update:', payload.eventType, payload.new || payload.old);
        
        if (payload.eventType === 'INSERT' && payload.new) {
          setPlayers(prev => {
            const newPlayer = payload.new as Player;
            if (prev.some(p => p.uid === newPlayer.uid)) return prev;
            console.log('➕ New player joined:', newPlayer.name);
            return [...prev, newPlayer];
          });
        } else if (payload.eventType === 'UPDATE' && payload.new) {
          setPlayers(prev => {
            const updatedPlayer = payload.new as Player;
            const updated = prev.map(p => p.uid === updatedPlayer.uid ? updatedPlayer : p);
            console.log('🔄 Player updated:', updatedPlayer.name, 'Score:', updatedPlayer.score, 'Ready:', updatedPlayer.ready);
            return updated;
          });
        } else {
          // Fallback: refetch data for any other changes
          fetchData();
        }
      })
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'answers',
        filter: `match_id=eq.${matchId}`
      }, (payload) => {
        console.log('💬 Answer realtime update:', payload.eventType, payload.new);
        
        if (payload.eventType === 'INSERT' && payload.new) {
          const newAnswer = payload.new as Answer;
          setAnswers(prev => {
            if (prev.some(a => a.uid === newAnswer.uid && a.question_index === newAnswer.question_index)) {
              return prev;
            }
            const playerName = players.find(p => p.uid === newAnswer.uid)?.name || 'Unknown';
            console.log('➕ New answer received from', playerName, ':', newAnswer.choice_text);
            return [...prev, newAnswer];
          });
        } else if (payload.eventType === 'UPDATE' && payload.new) {
          setAnswers(prev => {
            const updatedAnswer = payload.new as Answer;
            const updated = prev.map(a => 
              a.uid === updatedAnswer.uid && a.question_index === updatedAnswer.question_index 
                ? updatedAnswer : a
            );
            console.log('🔄 Answer updated:', updatedAnswer.uid, 'Correct:', updatedAnswer.is_correct);
            return updated;
          });
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(matchChannel);
    };
  }, [matchId, currentUser]);

  useEffect(() => {
    if (!match || !isHost || match.status !== 'question_reveal') return;

    const timeout = setTimeout(() => {
      startPhase(match.id, 'answering');
    }, 5000);

    return () => clearTimeout(timeout);
  }, [match, isHost]);

  useEffect(() => {
    setSelectedChoice(null);
  }, [match?.current_question_index]);

  // Clear answers when a new question is revealed and fetch fresh quiz solutions
  useEffect(() => {
    if (match?.status === 'question_reveal') {
      console.log('🧹 Clearing answers for new question:', match.current_question_index);
      setAnswers([]);
      
      // Fetch quiz solutions for ALL players (not just hosts) when new questions start
      if (matchId) {
        console.log('🔑 Fetching quiz solutions for round review...');
        getQuizSolutions(matchId)
          .then(solutions => {
            setQuizSolutions(solutions);
            console.log('✅ Quiz solutions fetched:', solutions.length, 'questions');
          })
          .catch(error => {
            console.error('❌ Failed to fetch quiz solutions:', error);
          });
      }
    }
  }, [match?.current_question_index, match?.status, matchId]);

  // Fetch quiz solutions when entering round_end phase for answer review
  useEffect(() => {
    if (match?.status === 'round_end' && matchId && quizSolutions.length === 0) {
      console.log('🔑 Fetching quiz solutions for answer review...');
      getQuizSolutions(matchId)
        .then(solutions => {
          setQuizSolutions(solutions);
          console.log('✅ Quiz solutions loaded for review:', solutions.length, 'questions');
        })
        .catch(error => {
          console.error('❌ Failed to fetch quiz solutions for review:', error);
        });
    }
  }, [match?.status, matchId, quizSolutions.length]);

  // Reset round processed state when entering new phases
  useEffect(() => {
    if (match?.status === 'question_reveal' || match?.status === 'answering') {
      setRoundProcessed(false);
      console.log('🔄 Reset round processed state for phase:', match.status);
    }
  }, [match?.status, match?.current_question_index]);

const revealAnswers = useCallback(async () => {
    // The condition to enter the function remains the same
    if (!match || !currentQuestion || !currentSolution || roundProcessed) return;

    console.log('🎯 Starting answer reveal and scoring process');
    
    try {
      // 1. FIRST, reset the ready state for all players.
      // This ensures that when the phase changes to 'round_end', the condition 
      // to immediately skip to the next round will be false.
      console.log('🔄 Resetting ready states...');
      for (const player of players) {
        const { error: readyErr } = await supabase
          .from('players')
          .update({ ready: false })
          .eq('match_id', match.id)
          .eq('uid', player.uid);
        
        if (readyErr) {
          console.error(`❌ Ready reset failed for ${player.name}:`, readyErr);
        }
      }

      // 2. THEN, transition to the round_end phase.
      await startPhase(match.id, 'round_end');
      console.log('✅ Phase transitioned to round_end');
      
      // The rest of the function continues as before, processing scores...
      const currentAnswers = answers.filter(a => a.question_index === match.current_question_index);
      console.log('📝 Processing answers:', currentAnswers.map(a => ({ 
        player: players.find(p => p.uid === a.uid)?.name, 
        choice: a.choice_text, 
        correct: currentSolution.correct_answer 
      })));

      for (const answer of currentAnswers) {
        const isCorrect = answer.choice_text === currentSolution.correct_answer;
        const points = isCorrect ? 1 : 0;
        const player = players.find(p => p.uid === answer.uid);
        
        console.log(`⚡ Processing answer for ${player?.name || 'Unknown Player'} (${answer.uid}):`, {
          choice: answer.choice_text,
          correctAnswer: currentSolution.correct_answer,
          isCorrect,
          points,
          currentScore: player?.score || 0
        });

        // Update answer correctness
        const { error: ansErr } = await supabase
          .from('answers')
          .update({ is_correct: isCorrect, points })
          .eq('match_id', match.id)
          .eq('uid', answer.uid)
          .eq('question_index', match.current_question_index);
        
        if (ansErr) console.error('❌ Answer update failed:', ansErr);

        // Update player score
        if (player && points > 0) {
          const newScore = (player.score || 0) + points;
          console.log(`🏆 Updating score for ${player.name} (${answer.uid}): ${player.score || 0} + ${points} = ${newScore}`);
          
          const { error: scoreErr } = await supabase
            .from('players')
            .update({ score: newScore })
            .eq('match_id', match.id)
            .eq('uid', answer.uid);
          
          if (scoreErr) {
            console.error(`❌ Score update failed for ${player.name}:`, scoreErr);
          } else {
            console.log(`✅ Score updated successfully for ${player.name}`);
          }
        } else if (player) {
          console.log(`⭕ No points awarded to ${player.name} - incorrect answer`);
        } else {
          console.error(`❌ Could not find player for uid: ${answer.uid}`);
        }
      }

      // 3. The 'reset ready state' block that was at the end has been removed from here.

      console.log('🎉 Answer reveal and scoring complete!');
    } catch (error) {
      console.error('💥 Reveal answers error:', error);
    }
  }, [match, currentQuestion, currentSolution, answers, players, roundProcessed]); // Adjusted dependencies as isHost is not used inside anymore

  useEffect(() => {
    if (!match || !isHost) return;

    if (match.status !== 'answering') {
      setRoundProcessed(false);
      return;
    }

    if (roundProcessed) return;
    
    // Make sure we have quiz solutions loaded before processing
    if (!currentSolution) {
      console.log('⏳ Waiting for quiz solutions to load...');
      return;
    }
    
    // Check if all players have answered
    const currentAnswers = answers.filter(
      a => a.question_index === match.current_question_index
    );
    console.log(`📊 Answer check: ${currentAnswers.length}/${players.length} players answered`);
    console.log('📝 Current answers:', currentAnswers.map(a => ({ 
      player: players.find(p => p.uid === a.uid)?.name || a.uid, 
      choice: a.choice_text 
    })));
    console.log('👥 Players in match:', players.map(p => ({ uid: p.uid, name: p.name })));
    
    const allAnswered = players.length > 0 && currentAnswers.length === players.length;

    // Immediately proceed to round end when all players have answered
    if (allAnswered) {
      console.log('🎯 All players answered! Starting reveal process...');
      setRoundProcessed(true);
      revealAnswers();
      return;
    }

    const now = Date.now();
    const start = new Date(match.phase_start).getTime();
    const remaining = match.timer_seconds * 1000 - (now - start);
    
    if (remaining <= 0) {
      if (!roundProcessed) {
        console.log('⏰ Timer expired, revealing answers...');
        setRoundProcessed(true);
        revealAnswers();
      }
      return;
    }

    const timeout = setTimeout(() => {
      console.log('⏰ Timer expired (timeout), revealing answers...');
      setRoundProcessed(true);
      revealAnswers();
    }, remaining);

    return () => clearTimeout(timeout);
  }, [match, answers, players, isHost, roundProcessed, revealAnswers, currentSolution]);

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
      if (nextIndex < (match.quiz as SafeQuiz).questions.length) {
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

     const newAnswer: Omit<Answer, 'is_correct' | 'points'> = {
      match_id: match.id,
      uid: currentUser.id,
      question_index: match.current_question_index,
      choice_index: choiceIndex,
      choice_text: currentQuestion.options[choiceIndex],
      submitted_at: new Date().toISOString(),
    };

    // Optimistically update local state so answer feedback is immediate
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
    if (!matchId) return;
    const url = `${window.location.origin}/match/${matchId}`;
    navigator.clipboard.writeText(url);
    toast({
      title: "Link Copied!",
      description: "Share this link to invite a friend.",
    });
  };

  // ... rest of the component remains unchanged
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
              onKeyPress={(e) => e.key === 'Enter' && handleJoin()}
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

          {showQR && matchId && (
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

            {match.status === 'answering' && otherPlayer && (
              <div className="text-center text-muted-foreground">
                {answers.some(
                  a => a.uid === otherPlayer.uid && a.question_index === match.current_question_index
                )
                  ? `${otherPlayer.name} has answered`
                  : `Waiting for ${otherPlayer.name}...`}
              </div>
            )}

            <Card className="bg-card border-card-border border-2 shadow-glow-primary">
              <div className="p-8 text-center">
                <h2 className="text-2xl font-orbitron font-bold text-foreground mb-8">
                  {currentQuestion.question}
                </h2>
                
                {match.status === 'answering' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl mx-auto">
                    {currentQuestion.options.map((option, index) => {
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

        {match.status === 'round_end' && currentQuestion && currentSolution && (
          <div className="space-y-6">
            <Card className="bg-card border-card-border border-2 shadow-glow-primary">
              <div className="p-8 text-center space-y-6">
                <h2 className="text-2xl font-orbitron font-bold text-foreground">
                  {currentQuestion.question}
                </h2>
                
                <div className="text-xl font-bold">
                  <span className="text-success">Correct Answer: {currentSolution.correct_answer}</span>
                </div>
                
                {currentSolution.explanation && (
                  <p className="text-muted-foreground max-w-2xl mx-auto">
                    {currentSolution.explanation}
                  </p>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl mx-auto">
                  {players.map((player) => {
                    const answer = answers.find(a => a.uid === player.uid && a.question_index === match.current_question_index);
                    const isCorrect = answer ? answer.choice_text === currentSolution.correct_answer : false;
                    const points = isCorrect ? 1 : 0;

                    return (
                      <div
                        key={player.uid}
                        className={`p-4 rounded-lg border-2 ${
                          isCorrect
                            ? 'border-success bg-success/10'
                            : 'border-danger bg-danger/10'
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
                {currentPlayer && otherPlayer && currentPlayer.score > otherPlayer.score && (
                  <span className="text-success">🏆 You Win! 🏆</span>
                )}
                {currentPlayer && otherPlayer && currentPlayer.score < otherPlayer.score && (
                  <span className="text-danger">You Lost!</span>
                )}
                {currentPlayer && otherPlayer && currentPlayer.score === otherPlayer.score && (
                  <span className="text-warning">It's a Tie!</span>
                )}
              </div>

              <ScoreBoard players={players} currentUserId={currentUser?.id} final={true} answers={answers} currentQuestionIndex={match.current_question_index} phase={'finished'} />
              
              <div className="flex gap-4 justify-center">
                <Button
                  onClick={() => window.location.href = '/'}
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
