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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      api_calls_log: {
        Row: {
          action: string
          created_at: string
          duration_ms: number | null
          error: string | null
          external_order_id: string | null
          id: string
          status_code: number | null
          success: boolean
        }
        Insert: {
          action: string
          created_at?: string
          duration_ms?: number | null
          error?: string | null
          external_order_id?: string | null
          id?: string
          status_code?: number | null
          success?: boolean
        }
        Update: {
          action?: string
          created_at?: string
          duration_ms?: number | null
          error?: string | null
          external_order_id?: string | null
          id?: string
          status_code?: number | null
          success?: boolean
        }
        Relationships: []
      }
      bot_sessions: {
        Row: {
          state: Json
          telegram_id: string
          updated_at: string
        }
        Insert: {
          state?: Json
          telegram_id: string
          updated_at?: string
        }
        Update: {
          state?: Json
          telegram_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      customers: {
        Row: {
          created_at: string
          email: string | null
          first_purchase: string | null
          id: string
          last_purchase: string | null
          name: string
          phone: string | null
          telegram_id: string | null
          telegram_username: string | null
          total_orders: number
          total_spent: number
          whatsapp: string | null
        }
        Insert: {
          created_at?: string
          email?: string | null
          first_purchase?: string | null
          id?: string
          last_purchase?: string | null
          name: string
          phone?: string | null
          telegram_id?: string | null
          telegram_username?: string | null
          total_orders?: number
          total_spent?: number
          whatsapp?: string | null
        }
        Update: {
          created_at?: string
          email?: string | null
          first_purchase?: string | null
          id?: string
          last_purchase?: string | null
          name?: string
          phone?: string | null
          telegram_id?: string | null
          telegram_username?: string | null
          total_orders?: number
          total_spent?: number
          whatsapp?: string | null
        }
        Relationships: []
      }
      orders: {
        Row: {
          created_at: string
          customer_id: string | null
          delivered_accounts: Json | null
          external_order_id: string
          failure_reason: string | null
          id: string
          notes: string | null
          payment_method: string
          payment_proof: string | null
          product_id: string
          product_name: string
          profit: number | null
          quantity: number
          selling_price: number
          source: string
          status: string
          total_amount: number | null
          total_cost: number | null
          updated_at: string
          wholesale_cost: number
        }
        Insert: {
          created_at?: string
          customer_id?: string | null
          delivered_accounts?: Json | null
          external_order_id: string
          failure_reason?: string | null
          id?: string
          notes?: string | null
          payment_method: string
          payment_proof?: string | null
          product_id: string
          product_name: string
          profit?: number | null
          quantity: number
          selling_price: number
          source: string
          status?: string
          total_amount?: number | null
          total_cost?: number | null
          updated_at?: string
          wholesale_cost: number
        }
        Update: {
          created_at?: string
          customer_id?: string | null
          delivered_accounts?: Json | null
          external_order_id?: string
          failure_reason?: string | null
          id?: string
          notes?: string | null
          payment_method?: string
          payment_proof?: string | null
          product_id?: string
          product_name?: string
          profit?: number | null
          quantity?: number
          selling_price?: number
          source?: string
          status?: string
          total_amount?: number | null
          total_cost?: number | null
          updated_at?: string
          wholesale_cost?: number
        }
        Relationships: [
          {
            foreignKeyName: "orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          description: string | null
          id: string
          is_active: boolean
          last_synced: string
          markup_percentage: number | null
          name: string
          selling_price: number
          stock_count: number | null
          total_sold: number
          wholesale_price: number
        }
        Insert: {
          description?: string | null
          id: string
          is_active?: boolean
          last_synced?: string
          markup_percentage?: number | null
          name: string
          selling_price?: number
          stock_count?: number | null
          total_sold?: number
          wholesale_price?: number
        }
        Update: {
          description?: string | null
          id?: string
          is_active?: boolean
          last_synced?: string
          markup_percentage?: number | null
          name?: string
          selling_price?: number
          stock_count?: number | null
          total_sold?: number
          wholesale_price?: number
        }
        Relationships: []
      }
      settings: {
        Row: {
          key: string
          updated_at: string
          value: string | null
        }
        Insert: {
          key: string
          updated_at?: string
          value?: string | null
        }
        Update: {
          key?: string
          updated_at?: string
          value?: string | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      create_manual_order: {
        Args: {
          _customer_id: string
          _customer_name: string
          _notes: string
          _payment_method: string
          _payment_proof: string
          _phone: string
          _product_id: string
          _product_name: string
          _quantity: number
          _selling_price: number
          _whatsapp: string
          _wholesale_cost: number
        }
        Returns: string
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      owner_exists: { Args: never; Returns: boolean }
      report_daily_series: {
        Args: { _from: string; _to: string; _tz?: string }
        Returns: {
          day: string
          order_count: number
          profit: number
          revenue: number
        }[]
      }
      report_summary: {
        Args: { _from: string; _to: string }
        Returns: {
          bot_count: number
          cost: number
          manual_count: number
          order_count: number
          profit: number
          revenue: number
        }[]
      }
      report_top_products: {
        Args: { _from: string; _limit?: number; _to: string }
        Returns: {
          product_id: string
          product_name: string
          profit: number
          revenue: number
          units: number
        }[]
      }
    }
    Enums: {
      app_role: "admin" | "user"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "user"],
    },
  },
} as const
