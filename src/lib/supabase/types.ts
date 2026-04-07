export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string | null;
          display_name: string | null;
          avatar_url: string | null;
          github_username: string | null;
          github_access_token: string | null;
          stripe_customer_id: string | null;
          subscription_status: string;
          subscription_period_end: string | null;
          subscription_period_start: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email?: string | null;
          display_name?: string | null;
          avatar_url?: string | null;
          github_username?: string | null;
          github_access_token?: string | null;
          stripe_customer_id?: string | null;
          subscription_status?: string;
          subscription_period_end?: string | null;
          subscription_period_start?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          email?: string | null;
          display_name?: string | null;
          avatar_url?: string | null;
          github_username?: string | null;
          github_access_token?: string | null;
          stripe_customer_id?: string | null;
          subscription_status?: string;
          subscription_period_end?: string | null;
          subscription_period_start?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      briefs: {
        Row: {
          id: string;
          user_id: string;
          repo_full_name: string;
          repo_info: Json;
          overview: Json;
          architecture: Json;
          features: Json;
          business_context: Json;
          timeline: Json;
          entrypoints: Json;
          codemap: Json | null;
          timeline_data: Json | null;
          generated_at: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          user_id: string;
          repo_full_name: string;
          repo_info: Json;
          overview: Json;
          architecture: Json;
          features: Json;
          business_context: Json;
          timeline: Json;
          entrypoints: Json;
          codemap?: Json | null;
          timeline_data?: Json | null;
          generated_at: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          repo_full_name?: string;
          repo_info?: Json;
          overview?: Json;
          architecture?: Json;
          features?: Json;
          business_context?: Json;
          timeline?: Json;
          entrypoints?: Json;
          codemap?: Json | null;
          timeline_data?: Json | null;
          generated_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      chat_sessions: {
        Row: {
          id: string;
          brief_id: string;
          user_id: string;
          title: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          brief_id: string;
          user_id: string;
          title?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          brief_id?: string;
          user_id?: string;
          title?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      chat_messages: {
        Row: {
          id: string;
          brief_id: string;
          session_id: string;
          user_id: string;
          role: string;
          content: string;
          timestamp: string;
          created_at: string;
        };
        Insert: {
          id: string;
          brief_id: string;
          session_id: string;
          user_id: string;
          role: string;
          content: string;
          timestamp: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          brief_id?: string;
          session_id?: string;
          user_id?: string;
          role?: string;
          content?: string;
          timestamp?: string;
        };
        Relationships: [];
      };
      usage: {
        Row: {
          id: string;
          user_id: string;
          action: string;
          repo_full_name: string | null;
          tokens_used: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          action: string;
          repo_full_name?: string | null;
          tokens_used?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          action?: string;
          repo_full_name?: string | null;
          tokens_used?: number;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
