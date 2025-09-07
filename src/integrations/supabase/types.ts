export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.4"
  }
  public: {
    Tables: {
      answers: {
        Row: {
          choice_index: number
          choice_text: string
          is_correct: boolean | null
          match_id: string
          points: number | null
          question_index: number
          submitted_at: string
          uid: string
        }
        Insert: {
          choice_index: number
          choice_text: string
          is_correct?: boolean | null
          match_id: string
          points?: number | null
          question_index: number
          submitted_at?: string
          uid: string
        }
        Update: {
          choice_index?: number
          choice_text?: string
          is_correct?: boolean | null
          match_id?: string
          points?: number | null
          question_index?: number
          submitted_at?: string
          uid?: string
        }
        Relationships: [
          {
            foreignKeyName: "answers_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
        ]
      }
      matches: {
        Row: {
          created_at: string
          current_question_index: number
          host_uid: string
          id: string
          is_public: boolean
          phase_start: string
          quiz: Json
          quiz_name: string
          status: string
          timer_seconds: number
        }
        Insert: {
          created_at?: string
          current_question_index?: number
          host_uid: string
          id?: string
          is_public?: boolean
          phase_start?: string
          quiz: Json
          quiz_name: string
          status?: string
          timer_seconds?: number
        }
        Update: {
          created_at?: string
          current_question_index?: number
          host_uid?: string
          id?: string
          is_public?: boolean
          phase_start?: string
          quiz?: Json
          quiz_name?: string
          status?: string
          timer_seconds?: number
        }
        Relationships: []
      }
      players: {
        Row: {
          answered: boolean
          joined_at: string
          match_id: string
          name: string
          ready: boolean
          score: number
          uid: string
        }
        Insert: {
          answered?: boolean
          joined_at?: string
          match_id: string
          name: string
          ready?: boolean
          score?: number
          uid: string
        }
        Update: {
          answered?: boolean
          joined_at?: string
          match_id?: string
          name?: string
          ready?: boolean
          score?: number
          uid?: string
        }
        Relationships: [
          {
            foreignKeyName: "players_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
        ]
      }
      quiz_data: {
        Row: {
          created_at: string
          id: string
          match_id: string
          questions: Json
          quiz_name: string
        }
        Insert: {
          created_at?: string
          id?: string
          match_id: string
          questions: Json
          quiz_name: string
        }
        Update: {
          created_at?: string
          id?: string
          match_id?: string
          questions?: Json
          quiz_name?: string
        }
        Relationships: []
      }
      quiz_solutions: {
        Row: {
          correct_answer: string
          created_at: string | null
          explanation: string | null
          id: string
          match_id: string
          question_index: number
        }
        Insert: {
          correct_answer: string
          created_at?: string | null
          explanation?: string | null
          id?: string
          match_id: string
          question_index: number
        }
        Update: {
          correct_answer?: string
          created_at?: string | null
          explanation?: string | null
          id?: string
          match_id?: string
          question_index?: number
        }
        Relationships: [
          {
            foreignKeyName: "quiz_solutions_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      create_secure_match: {
        Args:
          | { p_quiz_data: Json; p_quiz_name: string }
          | { p_quiz_data: Json; p_quiz_name: string; p_timer_seconds?: number }
        Returns: string
      }
      generate_random_id: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      get_quiz_solutions: {
        Args: { p_match_id: string }
        Returns: {
          correct_answer: string
          explanation: string
          question_index: number
        }[]
      }
      start_phase: {
        Args: { p_match_id: string; p_qindex?: number; p_status: string }
        Returns: undefined
      }
      update_player_scores: {
        Args: { p_match_id: string; p_scores: Json }
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
