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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      client_activities: {
        Row: {
          activity_type: string
          client_id: string
          created_at: string
          id: string
          notes: string | null
          occurred_at: string
          title: string
          user_id: string
        }
        Insert: {
          activity_type?: string
          client_id: string
          created_at?: string
          id?: string
          notes?: string | null
          occurred_at?: string
          title: string
          user_id: string
        }
        Update: {
          activity_type?: string
          client_id?: string
          created_at?: string
          id?: string
          notes?: string | null
          occurred_at?: string
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_activities_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      client_phones: {
        Row: {
          client_id: string
          created_at: string
          id: string
          is_primary: boolean
          label: string
          number: string
          user_id: string
        }
        Insert: {
          client_id: string
          created_at?: string
          id?: string
          is_primary?: boolean
          label?: string
          number: string
          user_id: string
        }
        Update: {
          client_id?: string
          created_at?: string
          id?: string
          is_primary?: boolean
          label?: string
          number?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_phones_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      client_systems: {
        Row: {
          battery: string | null
          client_id: string
          created_at: string
          id: string
          installed_date: string | null
          inverter: string | null
          name: string
          notes: string | null
          panels: string | null
          status: string
          system_size: string | null
          system_type: string | null
          updated_at: string
          user_id: string
          value: number
          warranty: string | null
        }
        Insert: {
          battery?: string | null
          client_id: string
          created_at?: string
          id?: string
          installed_date?: string | null
          inverter?: string | null
          name: string
          notes?: string | null
          panels?: string | null
          status?: string
          system_size?: string | null
          system_type?: string | null
          updated_at?: string
          user_id: string
          value?: number
          warranty?: string | null
        }
        Update: {
          battery?: string | null
          client_id?: string
          created_at?: string
          id?: string
          installed_date?: string | null
          inverter?: string | null
          name?: string
          notes?: string | null
          panels?: string | null
          status?: string
          system_size?: string | null
          system_type?: string | null
          updated_at?: string
          user_id?: string
          value?: number
          warranty?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_systems_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          address: string | null
          battery: string | null
          city: string | null
          contact_person: string | null
          created_at: string
          email: string | null
          gps: string | null
          id: string
          installation_date: string | null
          inverter: string | null
          name: string
          next_action: string | null
          notes: string | null
          panels: string | null
          phone: string | null
          status: string
          system_size: string | null
          system_type: string | null
          updated_at: string
          user_id: string
          value: number
          warranty: string | null
        }
        Insert: {
          address?: string | null
          battery?: string | null
          city?: string | null
          contact_person?: string | null
          created_at?: string
          email?: string | null
          gps?: string | null
          id?: string
          installation_date?: string | null
          inverter?: string | null
          name: string
          next_action?: string | null
          notes?: string | null
          panels?: string | null
          phone?: string | null
          status?: string
          system_size?: string | null
          system_type?: string | null
          updated_at?: string
          user_id: string
          value?: number
          warranty?: string | null
        }
        Update: {
          address?: string | null
          battery?: string | null
          city?: string | null
          contact_person?: string | null
          created_at?: string
          email?: string | null
          gps?: string | null
          id?: string
          installation_date?: string | null
          inverter?: string | null
          name?: string
          next_action?: string | null
          notes?: string | null
          panels?: string | null
          phone?: string | null
          status?: string
          system_size?: string | null
          system_type?: string | null
          updated_at?: string
          user_id?: string
          value?: number
          warranty?: string | null
        }
        Relationships: []
      }
      installations: {
        Row: {
          city: string | null
          client_id: string | null
          client_name: string | null
          created_at: string
          crew_lead: string | null
          id: string
          notes: string | null
          progress: number
          scheduled_date: string | null
          status: string
          system: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          city?: string | null
          client_id?: string | null
          client_name?: string | null
          created_at?: string
          crew_lead?: string | null
          id?: string
          notes?: string | null
          progress?: number
          scheduled_date?: string | null
          status?: string
          system?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          city?: string | null
          client_id?: string | null
          client_name?: string | null
          created_at?: string
          crew_lead?: string | null
          id?: string
          notes?: string | null
          progress?: number
          scheduled_date?: string | null
          status?: string
          system?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "installations_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          amount: number
          amount_paid: number
          client_id: string | null
          client_name: string | null
          created_at: string
          due_date: string | null
          id: string
          issue_date: string
          notes: string | null
          number: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount?: number
          amount_paid?: number
          client_id?: string | null
          client_name?: string | null
          created_at?: string
          due_date?: string | null
          id?: string
          issue_date?: string
          notes?: string | null
          number: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          amount_paid?: number
          client_id?: string | null
          client_name?: string | null
          created_at?: string
          due_date?: string | null
          id?: string
          issue_date?: string
          notes?: string | null
          number?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          city: string | null
          created_at: string
          email: string | null
          id: string
          name: string
          notes: string | null
          owner: string | null
          phone: string | null
          source: string | null
          stage: string
          system_type: string | null
          updated_at: string
          user_id: string
          value: number
        }
        Insert: {
          city?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          owner?: string | null
          phone?: string | null
          source?: string | null
          stage?: string
          system_type?: string | null
          updated_at?: string
          user_id: string
          value?: number
        }
        Update: {
          city?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          owner?: string | null
          phone?: string | null
          source?: string | null
          stage?: string
          system_type?: string | null
          updated_at?: string
          user_id?: string
          value?: number
        }
        Relationships: []
      }
      payments: {
        Row: {
          amount: number
          client_id: string | null
          client_name: string | null
          created_at: string
          id: string
          invoice_id: string | null
          method: string | null
          notes: string | null
          paid_on: string
          reference: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          amount?: number
          client_id?: string | null
          client_name?: string | null
          created_at?: string
          id?: string
          invoice_id?: string | null
          method?: string | null
          notes?: string | null
          paid_on?: string
          reference?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          client_id?: string | null
          client_name?: string | null
          created_at?: string
          id?: string
          invoice_id?: string | null
          method?: string | null
          notes?: string | null
          paid_on?: string
          reference?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      quotes: {
        Row: {
          amount: number
          client_id: string | null
          client_name: string | null
          created_at: string
          id: string
          notes: string | null
          number: string
          status: string
          system_summary: string | null
          updated_at: string
          user_id: string
          valid_until: string | null
        }
        Insert: {
          amount?: number
          client_id?: string | null
          client_name?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          number: string
          status?: string
          system_summary?: string | null
          updated_at?: string
          user_id: string
          valid_until?: string | null
        }
        Update: {
          amount?: number
          client_id?: string | null
          client_name?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          number?: string
          status?: string
          system_summary?: string | null
          updated_at?: string
          user_id?: string
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quotes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          client_id: string | null
          created_at: string
          done: boolean
          due_date: string | null
          id: string
          lead_id: string | null
          notes: string | null
          owner: string | null
          priority: string
          related_to: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          done?: boolean
          due_date?: string | null
          id?: string
          lead_id?: string | null
          notes?: string | null
          owner?: string | null
          priority?: string
          related_to?: string | null
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          client_id?: string | null
          created_at?: string
          done?: boolean
          due_date?: string | null
          id?: string
          lead_id?: string | null
          notes?: string | null
          owner?: string | null
          priority?: string
          related_to?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      zoho_connections: {
        Row: {
          access_token: string
          connected_by: string | null
          created_at: string
          expires_at: string
          id: string
          organization_id: string | null
          refresh_token: string
          region: string
          scope: string | null
          updated_at: string
        }
        Insert: {
          access_token: string
          connected_by?: string | null
          created_at?: string
          expires_at: string
          id?: string
          organization_id?: string | null
          refresh_token: string
          region?: string
          scope?: string | null
          updated_at?: string
        }
        Update: {
          access_token?: string
          connected_by?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          organization_id?: string | null
          refresh_token?: string
          region?: string
          scope?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      zoho_credit_notes: {
        Row: {
          balance: number | null
          creditnote_number: string | null
          customer_name: string | null
          customer_zoho_id: string | null
          date: string | null
          id: string
          raw: Json
          status: string | null
          synced_at: string
          total: number | null
          zoho_id: string
        }
        Insert: {
          balance?: number | null
          creditnote_number?: string | null
          customer_name?: string | null
          customer_zoho_id?: string | null
          date?: string | null
          id?: string
          raw?: Json
          status?: string | null
          synced_at?: string
          total?: number | null
          zoho_id: string
        }
        Update: {
          balance?: number | null
          creditnote_number?: string | null
          customer_name?: string | null
          customer_zoho_id?: string | null
          date?: string | null
          id?: string
          raw?: Json
          status?: string | null
          synced_at?: string
          total?: number | null
          zoho_id?: string
        }
        Relationships: []
      }
      zoho_customers: {
        Row: {
          company_name: string | null
          display_name: string | null
          email: string | null
          id: string
          mobile: string | null
          outstanding: number | null
          phone: string | null
          raw: Json
          status: string | null
          synced_at: string
          unused_credits: number | null
          zoho_id: string
        }
        Insert: {
          company_name?: string | null
          display_name?: string | null
          email?: string | null
          id?: string
          mobile?: string | null
          outstanding?: number | null
          phone?: string | null
          raw?: Json
          status?: string | null
          synced_at?: string
          unused_credits?: number | null
          zoho_id: string
        }
        Update: {
          company_name?: string | null
          display_name?: string | null
          email?: string | null
          id?: string
          mobile?: string | null
          outstanding?: number | null
          phone?: string | null
          raw?: Json
          status?: string | null
          synced_at?: string
          unused_credits?: number | null
          zoho_id?: string
        }
        Relationships: []
      }
      zoho_estimates: {
        Row: {
          currency_code: string | null
          customer_name: string | null
          customer_zoho_id: string | null
          date: string | null
          estimate_number: string | null
          expiry_date: string | null
          id: string
          raw: Json
          status: string | null
          synced_at: string
          total: number | null
          zoho_id: string
        }
        Insert: {
          currency_code?: string | null
          customer_name?: string | null
          customer_zoho_id?: string | null
          date?: string | null
          estimate_number?: string | null
          expiry_date?: string | null
          id?: string
          raw?: Json
          status?: string | null
          synced_at?: string
          total?: number | null
          zoho_id: string
        }
        Update: {
          currency_code?: string | null
          customer_name?: string | null
          customer_zoho_id?: string | null
          date?: string | null
          estimate_number?: string | null
          expiry_date?: string | null
          id?: string
          raw?: Json
          status?: string | null
          synced_at?: string
          total?: number | null
          zoho_id?: string
        }
        Relationships: []
      }
      zoho_expenses: {
        Row: {
          account_name: string | null
          amount: number | null
          date: string | null
          description: string | null
          id: string
          raw: Json
          status: string | null
          synced_at: string
          vendor_name: string | null
          vendor_zoho_id: string | null
          zoho_id: string
        }
        Insert: {
          account_name?: string | null
          amount?: number | null
          date?: string | null
          description?: string | null
          id?: string
          raw?: Json
          status?: string | null
          synced_at?: string
          vendor_name?: string | null
          vendor_zoho_id?: string | null
          zoho_id: string
        }
        Update: {
          account_name?: string | null
          amount?: number | null
          date?: string | null
          description?: string | null
          id?: string
          raw?: Json
          status?: string | null
          synced_at?: string
          vendor_name?: string | null
          vendor_zoho_id?: string | null
          zoho_id?: string
        }
        Relationships: []
      }
      zoho_invoices: {
        Row: {
          balance: number | null
          currency_code: string | null
          customer_name: string | null
          customer_zoho_id: string | null
          date: string | null
          due_date: string | null
          id: string
          invoice_number: string | null
          raw: Json
          status: string | null
          synced_at: string
          total: number | null
          zoho_id: string
        }
        Insert: {
          balance?: number | null
          currency_code?: string | null
          customer_name?: string | null
          customer_zoho_id?: string | null
          date?: string | null
          due_date?: string | null
          id?: string
          invoice_number?: string | null
          raw?: Json
          status?: string | null
          synced_at?: string
          total?: number | null
          zoho_id: string
        }
        Update: {
          balance?: number | null
          currency_code?: string | null
          customer_name?: string | null
          customer_zoho_id?: string | null
          date?: string | null
          due_date?: string | null
          id?: string
          invoice_number?: string | null
          raw?: Json
          status?: string | null
          synced_at?: string
          total?: number | null
          zoho_id?: string
        }
        Relationships: []
      }
      zoho_items: {
        Row: {
          description: string | null
          id: string
          name: string | null
          rate: number | null
          raw: Json
          sku: string | null
          status: string | null
          synced_at: string
          unit: string | null
          zoho_id: string
        }
        Insert: {
          description?: string | null
          id?: string
          name?: string | null
          rate?: number | null
          raw?: Json
          sku?: string | null
          status?: string | null
          synced_at?: string
          unit?: string | null
          zoho_id: string
        }
        Update: {
          description?: string | null
          id?: string
          name?: string | null
          rate?: number | null
          raw?: Json
          sku?: string | null
          status?: string | null
          synced_at?: string
          unit?: string | null
          zoho_id?: string
        }
        Relationships: []
      }
      zoho_organizations: {
        Row: {
          country: string | null
          currency_code: string | null
          email: string | null
          fiscal_year_start_month: number | null
          id: string
          name: string | null
          raw: Json
          synced_at: string
          zoho_id: string
        }
        Insert: {
          country?: string | null
          currency_code?: string | null
          email?: string | null
          fiscal_year_start_month?: number | null
          id?: string
          name?: string | null
          raw?: Json
          synced_at?: string
          zoho_id: string
        }
        Update: {
          country?: string | null
          currency_code?: string | null
          email?: string | null
          fiscal_year_start_month?: number | null
          id?: string
          name?: string | null
          raw?: Json
          synced_at?: string
          zoho_id?: string
        }
        Relationships: []
      }
      zoho_payments: {
        Row: {
          amount: number | null
          customer_name: string | null
          customer_zoho_id: string | null
          date: string | null
          id: string
          payment_mode: string | null
          payment_number: string | null
          raw: Json
          reference_number: string | null
          synced_at: string
          zoho_id: string
        }
        Insert: {
          amount?: number | null
          customer_name?: string | null
          customer_zoho_id?: string | null
          date?: string | null
          id?: string
          payment_mode?: string | null
          payment_number?: string | null
          raw?: Json
          reference_number?: string | null
          synced_at?: string
          zoho_id: string
        }
        Update: {
          amount?: number | null
          customer_name?: string | null
          customer_zoho_id?: string | null
          date?: string | null
          id?: string
          payment_mode?: string | null
          payment_number?: string | null
          raw?: Json
          reference_number?: string | null
          synced_at?: string
          zoho_id?: string
        }
        Relationships: []
      }
      zoho_sales_orders: {
        Row: {
          currency_code: string | null
          customer_name: string | null
          customer_zoho_id: string | null
          date: string | null
          id: string
          raw: Json
          salesorder_number: string | null
          status: string | null
          synced_at: string
          total: number | null
          zoho_id: string
        }
        Insert: {
          currency_code?: string | null
          customer_name?: string | null
          customer_zoho_id?: string | null
          date?: string | null
          id?: string
          raw?: Json
          salesorder_number?: string | null
          status?: string | null
          synced_at?: string
          total?: number | null
          zoho_id: string
        }
        Update: {
          currency_code?: string | null
          customer_name?: string | null
          customer_zoho_id?: string | null
          date?: string | null
          id?: string
          raw?: Json
          salesorder_number?: string | null
          status?: string | null
          synced_at?: string
          total?: number | null
          zoho_id?: string
        }
        Relationships: []
      }
      zoho_sync_logs: {
        Row: {
          entity: string
          error: string | null
          finished_at: string | null
          id: string
          records_synced: number | null
          started_at: string
          status: string
          triggered_by: string | null
        }
        Insert: {
          entity: string
          error?: string | null
          finished_at?: string | null
          id?: string
          records_synced?: number | null
          started_at?: string
          status: string
          triggered_by?: string | null
        }
        Update: {
          entity?: string
          error?: string | null
          finished_at?: string | null
          id?: string
          records_synced?: number | null
          started_at?: string
          status?: string
          triggered_by?: string | null
        }
        Relationships: []
      }
      zoho_taxes: {
        Row: {
          id: string
          raw: Json
          synced_at: string
          tax_name: string | null
          tax_percentage: number | null
          tax_type: string | null
          zoho_id: string
        }
        Insert: {
          id?: string
          raw?: Json
          synced_at?: string
          tax_name?: string | null
          tax_percentage?: number | null
          tax_type?: string | null
          zoho_id: string
        }
        Update: {
          id?: string
          raw?: Json
          synced_at?: string
          tax_name?: string | null
          tax_percentage?: number | null
          tax_type?: string | null
          zoho_id?: string
        }
        Relationships: []
      }
      zoho_vendors: {
        Row: {
          company_name: string | null
          email: string | null
          id: string
          outstanding_payable: number | null
          phone: string | null
          raw: Json
          status: string | null
          synced_at: string
          vendor_name: string | null
          zoho_id: string
        }
        Insert: {
          company_name?: string | null
          email?: string | null
          id?: string
          outstanding_payable?: number | null
          phone?: string | null
          raw?: Json
          status?: string | null
          synced_at?: string
          vendor_name?: string | null
          zoho_id: string
        }
        Update: {
          company_name?: string | null
          email?: string | null
          id?: string
          outstanding_payable?: number | null
          phone?: string | null
          raw?: Json
          status?: string | null
          synced_at?: string
          vendor_name?: string | null
          zoho_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
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
