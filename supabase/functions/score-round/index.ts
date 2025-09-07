import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface Answer {
  uid: string;
  choice_text: string;
  question_index: number;
}

interface QuizSolution {
  question_index: number;
  correct_answer: string;
}

interface Player {
  uid: string;
  score: number;
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Get the authorization header
    const authHeader = req.headers.get('authorization')
    if (!authHeader) {
      throw new Error('No authorization header')
    }

    // Create Supabase client
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          persistSession: false,
        },
      }
    )

    // Get the user from the auth header
    const { data: { user }, error: userError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    )

    if (userError || !user) {
      throw new Error('Invalid auth token')
    }

    const { matchId, questionIndex } = await req.json()

    if (!matchId || questionIndex === undefined) {
      throw new Error('matchId and questionIndex are required')
    }

    console.log(`🔢 Scoring round for match ${matchId}, question ${questionIndex}`)

    // Verify user is host of the match
    const { data: match, error: matchError } = await supabase
      .from('matches')
      .select('host_uid')
      .eq('id', matchId)
      .single()

    if (matchError || !match) {
      throw new Error('Match not found')
    }

    if (match.host_uid !== user.id) {
      throw new Error('Only the host can trigger scoring')
    }

    // Get all answers for this question
    const { data: answers, error: answersError } = await supabase
      .from('answers')
      .select('uid, choice_text, question_index')
      .eq('match_id', matchId)
      .eq('question_index', questionIndex)

    if (answersError) {
      throw new Error(`Failed to fetch answers: ${answersError.message}`)
    }

    // Get the correct answer
    const { data: solutions, error: solutionsError } = await supabase
      .from('quiz_solutions')
      .select('question_index, correct_answer')
      .eq('match_id', matchId)
      .eq('question_index', questionIndex)
      .single()

    if (solutionsError || !solutions) {
      throw new Error(`Failed to fetch solution: ${solutionsError?.message}`)
    }

    // Get current player scores
    const { data: players, error: playersError } = await supabase
      .from('players')
      .select('uid, score')
      .eq('match_id', matchId)

    if (playersError) {
      throw new Error(`Failed to fetch players: ${playersError.message}`)
    }

    // Calculate scores
    const scoreUpdates = players.map((player: Player) => {
      const answer = answers?.find((a: Answer) => a.uid === player.uid)
      const isCorrect = answer?.choice_text === solutions.correct_answer
      const points = isCorrect ? 1 : 0
      const newScore = player.score + points

      console.log(`Player ${player.uid}: ${answer?.choice_text} (${isCorrect ? 'correct' : 'incorrect'}) - Score: ${player.score} + ${points} = ${newScore}`)

      return {
        uid: player.uid,
        score: newScore,
        ready: false // Reset ready status for next round
      }
    })

    // Update all player scores in a single transaction
    for (const update of scoreUpdates) {
      const { error: updateError } = await supabase
        .from('players')
        .update({ score: update.score, ready: update.ready })
        .eq('match_id', matchId)
        .eq('uid', update.uid)

      if (updateError) {
        console.error(`Failed to update player ${update.uid}:`, updateError)
        throw new Error(`Failed to update player score: ${updateError.message}`)
      }
    }

    // Update answer records with correct/incorrect status and points
    if (answers) {
      for (const answer of answers) {
        const isCorrect = answer.choice_text === solutions.correct_answer
        const points = isCorrect ? 1 : 0

        const { error: answerUpdateError } = await supabase
          .from('answers')
          .update({ is_correct: isCorrect, points })
          .eq('match_id', matchId)
          .eq('uid', answer.uid)
          .eq('question_index', questionIndex)

        if (answerUpdateError) {
          console.error(`Failed to update answer for ${answer.uid}:`, answerUpdateError)
        }
      }
    }

    console.log(`✅ Scoring complete for match ${matchId}, question ${questionIndex}`)

    return new Response(
      JSON.stringify({ success: true, scoreUpdates }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    )

  } catch (error) {
    console.error('Error in score-round function:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400 
      }
    )
  }
})