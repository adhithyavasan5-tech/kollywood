export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18";
  };
  public: {
    Tables: {
      _match_test: {
        Row: {
          r: string | null;
        };
        Insert: {
          r?: string | null;
        };
        Update: {
          r?: string | null;
        };
        Relationships: [];
      };
      app_private_config: {
        Row: {
          name: string;
          value: string;
        };
        Insert: {
          name: string;
          value: string;
        };
        Update: {
          name?: string;
          value?: string;
        };
        Relationships: [];
      };
      movies: {
        Row: {
          aliases: string[];
          backdrop_path: string | null;
          cast_json: Json;
          director: string;
          director_photo: string | null;
          genres: string[];
          hero: string;
          hero_photo: string | null;
          heroine: string;
          heroine_photo: string | null;
          id: number;
          original_title: string | null;
          overview: string | null;
          playable: boolean;
          popularity: number;
          poster_path: string | null;
          punch_line: string | null;
          release_date: string | null;
          source: string;
          story: string;
          story_easy: string | null;
          story_ta: string | null;
          synced_at: string | null;
          title: string;
          tmdb_id: number | null;
          trivia: string[];
          vote_count: number;
          wiki_title: string | null;
          year: number | null;
        };
        Insert: {
          aliases?: string[];
          backdrop_path?: string | null;
          cast_json?: Json;
          director: string;
          director_photo?: string | null;
          genres?: string[];
          hero: string;
          hero_photo?: string | null;
          heroine: string;
          heroine_photo?: string | null;
          id?: number;
          original_title?: string | null;
          overview?: string | null;
          playable?: boolean;
          popularity?: number;
          poster_path?: string | null;
          punch_line?: string | null;
          release_date?: string | null;
          source?: string;
          story: string;
          story_easy?: string | null;
          story_ta?: string | null;
          synced_at?: string | null;
          title: string;
          tmdb_id?: number | null;
          trivia?: string[];
          vote_count?: number;
          wiki_title?: string | null;
          year?: number | null;
        };
        Update: {
          aliases?: string[];
          backdrop_path?: string | null;
          cast_json?: Json;
          director?: string;
          director_photo?: string | null;
          genres?: string[];
          hero?: string;
          hero_photo?: string | null;
          heroine?: string;
          heroine_photo?: string | null;
          id?: number;
          original_title?: string | null;
          overview?: string | null;
          playable?: boolean;
          popularity?: number;
          poster_path?: string | null;
          punch_line?: string | null;
          release_date?: string | null;
          source?: string;
          story?: string;
          story_easy?: string | null;
          story_ta?: string | null;
          synced_at?: string | null;
          title?: string;
          tmdb_id?: number | null;
          trivia?: string[];
          vote_count?: number;
          wiki_title?: string | null;
          year?: number | null;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          avatar: string | null;
          created_at: string;
          id: string;
          player_id: string;
          total_games: number;
          total_points: number;
          username: string;
        };
        Insert: {
          avatar?: string | null;
          created_at?: string;
          id: string;
          player_id: string;
          total_games?: number;
          total_points?: number;
          username: string;
        };
        Update: {
          avatar?: string | null;
          created_at?: string;
          id?: string;
          player_id?: string;
          total_games?: number;
          total_points?: number;
          username?: string;
        };
        Relationships: [];
      };
      room_players: {
        Row: {
          avatar: string | null;
          joined_at: string;
          player_id: string | null;
          room_id: string;
          score: number;
          user_id: string;
          username: string;
        };
        Insert: {
          avatar?: string | null;
          joined_at?: string;
          player_id?: string | null;
          room_id: string;
          score?: number;
          user_id: string;
          username: string;
        };
        Update: {
          avatar?: string | null;
          joined_at?: string;
          player_id?: string | null;
          room_id?: string;
          score?: number;
          user_id?: string;
          username?: string;
        };
        Relationships: [
          {
            foreignKeyName: "room_players_room_id_fkey";
            columns: ["room_id"];
            isOneToOne: false;
            referencedRelation: "rooms";
            referencedColumns: ["id"];
          },
        ];
      };
      room_secrets: {
        Row: {
          movie_id: number | null;
          room_id: string;
          used_movies: number[];
          used_tmdb_ids: number[];
        };
        Insert: {
          movie_id?: number | null;
          room_id: string;
          used_movies?: number[];
          used_tmdb_ids?: number[];
        };
        Update: {
          movie_id?: number | null;
          room_id?: string;
          used_movies?: number[];
          used_tmdb_ids?: number[];
        };
        Relationships: [
          {
            foreignKeyName: "room_secrets_room_id_fkey";
            columns: ["room_id"];
            isOneToOne: true;
            referencedRelation: "rooms";
            referencedColumns: ["id"];
          },
        ];
      };
      rooms: {
        Row: {
          answer_player_id: string | null;
          answered_players: string[];
          clue: number;
          clue_data: Json;
          code: string;
          created_at: string;
          event_seq: number;
          host_id: string;
          id: string;
          last_event: Json | null;
          max_players: number;
          phase: string;
          phase_ends_at: string | null;
          reveal: Json | null;
          round: number;
          status: string;
          total_rounds: number;
          updated_at: string;
        };
        Insert: {
          answer_player_id?: string | null;
          answered_players?: string[];
          clue?: number;
          clue_data?: Json;
          code: string;
          created_at?: string;
          event_seq?: number;
          host_id: string;
          id?: string;
          last_event?: Json | null;
          max_players: number;
          phase?: string;
          phase_ends_at?: string | null;
          reveal?: Json | null;
          round?: number;
          status?: string;
          total_rounds?: number;
          updated_at?: string;
        };
        Update: {
          answer_player_id?: string | null;
          answered_players?: string[];
          clue?: number;
          clue_data?: Json;
          code?: string;
          created_at?: string;
          event_seq?: number;
          host_id?: string;
          id?: string;
          last_event?: Json | null;
          max_players?: number;
          phase?: string;
          phase_ends_at?: string | null;
          reveal?: Json | null;
          round?: number;
          status?: string;
          total_rounds?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      tmdb_sync_state: {
        Row: {
          id: number;
          last_error: string | null;
          last_run_at: string | null;
          page: number;
          passes: number;
          processed: number;
          year: number;
        };
        Insert: {
          id?: number;
          last_error?: string | null;
          last_run_at?: string | null;
          page?: number;
          passes?: number;
          processed?: number;
          year?: number;
        };
        Update: {
          id?: number;
          last_error?: string | null;
          last_run_at?: string | null;
          page?: number;
          passes?: number;
          processed?: number;
          year?: number;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      _begin_round: { Args: { p_room: string }; Returns: undefined };
      _bump: { Args: { p_event: Json; p_room: string }; Returns: undefined };
      _clue_secs: { Args: { p_room: string }; Returns: string };
      _familiarity: {
        Args: { m: Database["public"]["Tables"]["movies"]["Row"] };
        Returns: number;
      };
      _gen_code: { Args: never; Returns: string };
      _is_familiar_classic: {
        Args: { m: Database["public"]["Tables"]["movies"]["Row"] };
        Returns: boolean;
      };
      _norm: { Args: { s: string }; Returns: string };
      _reveal: {
        Args: {
          p_dialogue: string;
          p_outcome: string;
          p_room: string;
          p_winner: string;
        };
        Returns: undefined;
      };
      _safe_trivia: {
        Args: { m: Database["public"]["Tables"]["movies"]["Row"] };
        Returns: string[];
      };
      _star_lead: {
        Args: { m: Database["public"]["Tables"]["movies"]["Row"] };
        Returns: boolean;
      };
      _valid_avatar: { Args: { p: string }; Returns: string };
      _wrong: {
        Args: { p_room: string; p_timeout: boolean; p_user: string };
        Returns: undefined;
      };
      advance_room: { Args: { p_room: string }; Returns: undefined };
      buzz: { Args: { p_room: string }; Returns: boolean };
      clue_rewrite_queue: {
        Args: { p_limit: number };
        Returns: {
          aliases: string[];
          director: string;
          genres: string[];
          hero: string;
          heroine: string;
          id: number;
          overview: string;
          story: string;
          title: string;
          year: number;
        }[];
      };
      create_room: { Args: { p_max: number }; Returns: string };
      get_server_time: { Args: never; Returns: string };
      is_player_id_available: {
        Args: { p_player_id: string };
        Returns: boolean;
      };
      is_room_member: { Args: { p_room: string }; Returns: boolean };
      join_room: { Args: { p_code: string }; Returns: string };
      leave_room: { Args: { p_room: string }; Returns: undefined };
      movie_details: { Args: { p_id: number }; Returns: Json };
      movie_pool_stats: { Args: never; Returns: Json };
      movie_showcase: {
        Args: { p_limit?: number };
        Returns: {
          id: number;
          poster_path: string;
          title: string;
          wiki_title: string;
          year: number;
        }[];
      };
      set_avatar: { Args: { p_avatar: string }; Returns: undefined };
      start_game: { Args: { p_room: string }; Returns: undefined };
      submit_answer: {
        Args: { p_answer: string; p_room: string };
        Returns: boolean;
      };
      tmdb_upsert_movies: { Args: { p_movies: Json }; Returns: number };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {},
  },
} as const;
