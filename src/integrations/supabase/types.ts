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
      assets: {
        Row: {
          account_number: string | null
          archived_at: string | null
          asset_tag: string | null
          asset_type: string
          assigned_to: string | null
          cost: number | null
          created_at: string
          created_by: string | null
          customer_id: string | null
          id: string
          location: string | null
          make: string | null
          model: string | null
          notes: string | null
          purchase_date: string | null
          serial_number: string | null
          status: string
          updated_at: string
          warranty_expires: string | null
        }
        Insert: {
          account_number?: string | null
          archived_at?: string | null
          asset_tag?: string | null
          asset_type: string
          assigned_to?: string | null
          cost?: number | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          id?: string
          location?: string | null
          make?: string | null
          model?: string | null
          notes?: string | null
          purchase_date?: string | null
          serial_number?: string | null
          status?: string
          updated_at?: string
          warranty_expires?: string | null
        }
        Update: {
          account_number?: string | null
          archived_at?: string | null
          asset_tag?: string | null
          asset_type?: string
          assigned_to?: string | null
          cost?: number | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          id?: string
          location?: string | null
          make?: string | null
          model?: string | null
          notes?: string | null
          purchase_date?: string | null
          serial_number?: string | null
          status?: string
          updated_at?: string
          warranty_expires?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "assets_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          account_number: string | null
          action: string
          actor_email: string | null
          actor_id: string | null
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          ip_address: string | null
          new_value: Json | null
          old_value: Json | null
          user_agent: string | null
        }
        Insert: {
          account_number?: string | null
          action: string
          actor_email?: string | null
          actor_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          ip_address?: string | null
          new_value?: Json | null
          old_value?: Json | null
          user_agent?: string | null
        }
        Update: {
          account_number?: string | null
          action?: string
          actor_email?: string | null
          actor_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          ip_address?: string | null
          new_value?: Json | null
          old_value?: Json | null
          user_agent?: string | null
        }
        Relationships: []
      }
      cloud_services: {
        Row: {
          account_number: string
          admin_url: string | null
          archived_at: string | null
          created_at: string
          created_by: string | null
          customer_id: string
          id: string
          monthly_cost: number | null
          notes: string | null
          plan: string | null
          renewal_date: string | null
          seats: number | null
          service_name: string
          service_type: string
          status: string
          updated_at: string
          vendor: string | null
        }
        Insert: {
          account_number: string
          admin_url?: string | null
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          customer_id: string
          id?: string
          monthly_cost?: number | null
          notes?: string | null
          plan?: string | null
          renewal_date?: string | null
          seats?: number | null
          service_name: string
          service_type: string
          status?: string
          updated_at?: string
          vendor?: string | null
        }
        Update: {
          account_number?: string
          admin_url?: string | null
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string
          id?: string
          monthly_cost?: number | null
          notes?: string | null
          plan?: string | null
          renewal_date?: string | null
          seats?: number | null
          service_name?: string
          service_type?: string
          status?: string
          updated_at?: string
          vendor?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cloud_services_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      credential_access_log: {
        Row: {
          accessed_by: string | null
          action: string
          created_at: string
          credential_id: string
          id: string
          ip_address: string | null
          user_agent: string | null
        }
        Insert: {
          accessed_by?: string | null
          action: string
          created_at?: string
          credential_id: string
          id?: string
          ip_address?: string | null
          user_agent?: string | null
        }
        Update: {
          accessed_by?: string | null
          action?: string
          created_at?: string
          credential_id?: string
          id?: string
          ip_address?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "credential_access_log_credential_id_fkey"
            columns: ["credential_id"]
            isOneToOne: false
            referencedRelation: "credentials"
            referencedColumns: ["id"]
          },
        ]
      }
      credential_versions: {
        Row: {
          auth_tag: string
          changed_by: string | null
          ciphertext: string
          created_at: string
          credential_id: string
          id: string
          iv: string
          key_id: string
        }
        Insert: {
          auth_tag: string
          changed_by?: string | null
          ciphertext: string
          created_at?: string
          credential_id: string
          id?: string
          iv: string
          key_id: string
        }
        Update: {
          auth_tag?: string
          changed_by?: string | null
          ciphertext?: string
          created_at?: string
          credential_id?: string
          id?: string
          iv?: string
          key_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "credential_versions_credential_id_fkey"
            columns: ["credential_id"]
            isOneToOne: false
            referencedRelation: "credentials"
            referencedColumns: ["id"]
          },
        ]
      }
      credentials: {
        Row: {
          account_number: string | null
          archived_at: string | null
          auth_tag: string
          ciphertext: string
          created_at: string
          created_by: string | null
          credential_type: string
          customer_id: string | null
          expires_at: string | null
          id: string
          iv: string
          key_id: string
          linked_asset: string | null
          name: string
          notes: string | null
          owner_id: string | null
          tags: string[]
          updated_at: string
          url: string | null
          username: string | null
        }
        Insert: {
          account_number?: string | null
          archived_at?: string | null
          auth_tag: string
          ciphertext: string
          created_at?: string
          created_by?: string | null
          credential_type: string
          customer_id?: string | null
          expires_at?: string | null
          id?: string
          iv: string
          key_id?: string
          linked_asset?: string | null
          name: string
          notes?: string | null
          owner_id?: string | null
          tags?: string[]
          updated_at?: string
          url?: string | null
          username?: string | null
        }
        Update: {
          account_number?: string | null
          archived_at?: string | null
          auth_tag?: string
          ciphertext?: string
          created_at?: string
          created_by?: string | null
          credential_type?: string
          customer_id?: string | null
          expires_at?: string | null
          id?: string
          iv?: string
          key_id?: string
          linked_asset?: string | null
          name?: string
          notes?: string | null
          owner_id?: string | null
          tags?: string[]
          updated_at?: string
          url?: string | null
          username?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "credentials_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_branches: {
        Row: {
          account_number: string
          address: string | null
          archived_at: string | null
          city: string | null
          country: string | null
          created_at: string
          customer_id: string
          id: string
          is_headquarters: boolean
          name: string
          updated_at: string
        }
        Insert: {
          account_number: string
          address?: string | null
          archived_at?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          customer_id: string
          id?: string
          is_headquarters?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          account_number?: string
          address?: string | null
          archived_at?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          customer_id?: string
          id?: string
          is_headquarters?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_branches_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_contacts: {
        Row: {
          account_number: string
          archived_at: string | null
          contact_type: string
          created_at: string
          customer_id: string
          email: string | null
          id: string
          is_primary: boolean
          name: string
          notes: string | null
          phone: string | null
          role: string | null
          updated_at: string
        }
        Insert: {
          account_number: string
          archived_at?: string | null
          contact_type?: string
          created_at?: string
          customer_id: string
          email?: string | null
          id?: string
          is_primary?: boolean
          name: string
          notes?: string | null
          phone?: string | null
          role?: string | null
          updated_at?: string
        }
        Update: {
          account_number?: string
          archived_at?: string | null
          contact_type?: string
          created_at?: string
          customer_id?: string
          email?: string | null
          id?: string
          is_primary?: boolean
          name?: string
          notes?: string | null
          phone?: string | null
          role?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_contacts_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_notes: {
        Row: {
          account_number: string
          author_id: string | null
          body: string
          created_at: string
          customer_id: string
          id: string
          pinned: boolean
        }
        Insert: {
          account_number: string
          author_id?: string | null
          body: string
          created_at?: string
          customer_id: string
          id?: string
          pinned?: boolean
        }
        Update: {
          account_number?: string
          author_id?: string | null
          body?: string
          created_at?: string
          customer_id?: string
          id?: string
          pinned?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "customer_notes_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_timeline: {
        Row: {
          account_number: string
          actor_id: string | null
          created_at: string
          customer_id: string
          description: string | null
          event_type: string
          id: string
          metadata: Json
          title: string
        }
        Insert: {
          account_number: string
          actor_id?: string | null
          created_at?: string
          customer_id: string
          description?: string | null
          event_type: string
          id?: string
          metadata?: Json
          title: string
        }
        Update: {
          account_number?: string
          actor_id?: string | null
          created_at?: string
          customer_id?: string
          description?: string | null
          event_type?: string
          id?: string
          metadata?: Json
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_timeline_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          account_manager_id: string | null
          account_number: string
          archived_at: string | null
          billing_address: string | null
          company_name: string
          created_at: string
          created_by: string | null
          id: string
          industry: string | null
          notes: string | null
          primary_email: string | null
          primary_phone: string | null
          status: string
          tags: string[]
          updated_at: string
          website: string | null
        }
        Insert: {
          account_manager_id?: string | null
          account_number?: string
          archived_at?: string | null
          billing_address?: string | null
          company_name: string
          created_at?: string
          created_by?: string | null
          id?: string
          industry?: string | null
          notes?: string | null
          primary_email?: string | null
          primary_phone?: string | null
          status?: string
          tags?: string[]
          updated_at?: string
          website?: string | null
        }
        Update: {
          account_manager_id?: string | null
          account_number?: string
          archived_at?: string | null
          billing_address?: string | null
          company_name?: string
          created_at?: string
          created_by?: string | null
          id?: string
          industry?: string | null
          notes?: string | null
          primary_email?: string | null
          primary_phone?: string | null
          status?: string
          tags?: string[]
          updated_at?: string
          website?: string | null
        }
        Relationships: []
      }
      inventory_items: {
        Row: {
          archived_at: string | null
          category: string | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          location: string | null
          name: string
          quantity: number
          reorder_level: number
          sku: string
          supplier: string | null
          unit_cost: number | null
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          category?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          location?: string | null
          name: string
          quantity?: number
          reorder_level?: number
          sku: string
          supplier?: string | null
          unit_cost?: number | null
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          category?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          location?: string | null
          name?: string
          quantity?: number
          reorder_level?: number
          sku?: string
          supplier?: string | null
          unit_cost?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      invoices: {
        Row: {
          account_number: string
          archived_at: string | null
          created_at: string
          created_by: string | null
          currency: string
          customer_id: string
          due_date: string | null
          id: string
          invoice_number: string
          issue_date: string
          notes: string | null
          paid_at: string | null
          status: string
          subtotal: number
          tax: number
          total: number
          updated_at: string
        }
        Insert: {
          account_number: string
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          customer_id: string
          due_date?: string | null
          id?: string
          invoice_number?: string
          issue_date?: string
          notes?: string | null
          paid_at?: string | null
          status?: string
          subtotal?: number
          tax?: number
          total?: number
          updated_at?: string
        }
        Update: {
          account_number?: string
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          customer_id?: string
          due_date?: string | null
          id?: string
          invoice_number?: string
          issue_date?: string
          notes?: string | null
          paid_at?: string | null
          status?: string
          subtotal?: number
          tax?: number
          total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      monitoring_checks: {
        Row: {
          account_number: string | null
          archived_at: string | null
          check_type: string
          created_at: string
          created_by: string | null
          customer_id: string | null
          enabled: boolean
          id: string
          interval_seconds: number
          last_checked_at: string | null
          last_error: string | null
          last_response_ms: number | null
          name: string
          status: string
          target: string
          updated_at: string
        }
        Insert: {
          account_number?: string | null
          archived_at?: string | null
          check_type: string
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          enabled?: boolean
          id?: string
          interval_seconds?: number
          last_checked_at?: string | null
          last_error?: string | null
          last_response_ms?: number | null
          name: string
          status?: string
          target: string
          updated_at?: string
        }
        Update: {
          account_number?: string | null
          archived_at?: string | null
          check_type?: string
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          enabled?: boolean
          id?: string
          interval_seconds?: number
          last_checked_at?: string | null
          last_error?: string | null
          last_response_ms?: number | null
          name?: string
          status?: string
          target?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "monitoring_checks_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          kind: string
          link: string | null
          read_at: string | null
          title: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          kind?: string
          link?: string | null
          read_at?: string | null
          title: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          kind?: string
          link?: string | null
          read_at?: string | null
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          archived_at: string | null
          created_at: string
          department: string | null
          email: string | null
          full_name: string | null
          id: string
          phone: string | null
          status: string
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          department?: string | null
          email?: string | null
          full_name?: string | null
          id: string
          phone?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          department?: string | null
          email?: string | null
          full_name?: string | null
          id?: string
          phone?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      projects: {
        Row: {
          account_number: string
          archived_at: string | null
          budget: number | null
          completed_at: string | null
          created_at: string
          created_by: string | null
          customer_id: string
          description: string | null
          due_date: string | null
          id: string
          name: string
          owner_id: string | null
          priority: string
          project_code: string | null
          start_date: string | null
          status: string
          updated_at: string
        }
        Insert: {
          account_number: string
          archived_at?: string | null
          budget?: number | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          customer_id: string
          description?: string | null
          due_date?: string | null
          id?: string
          name: string
          owner_id?: string | null
          priority?: string
          project_code?: string | null
          start_date?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          account_number?: string
          archived_at?: string | null
          budget?: number | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string
          description?: string | null
          due_date?: string | null
          id?: string
          name?: string
          owner_id?: string | null
          priority?: string
          project_code?: string | null
          start_date?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      system_settings: {
        Row: {
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          updated_by?: string | null
          value: Json
        }
        Update: {
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
      ticket_messages: {
        Row: {
          attachments: Json
          author_id: string | null
          body: string
          created_at: string
          id: string
          is_internal: boolean
          ticket_id: string
        }
        Insert: {
          attachments?: Json
          author_id?: string | null
          body: string
          created_at?: string
          id?: string
          is_internal?: boolean
          ticket_id: string
        }
        Update: {
          attachments?: Json
          author_id?: string | null
          body?: string
          created_at?: string
          id?: string
          is_internal?: boolean
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_messages_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      tickets: {
        Row: {
          account_number: string
          archived_at: string | null
          assigned_team: string | null
          assigned_to: string | null
          category: string | null
          created_at: string
          created_by: string | null
          customer_id: string
          description: string | null
          id: string
          priority: string
          resolution_notes: string | null
          resolved_at: string | null
          sla_due_at: string | null
          status: string
          subject: string
          ticket_number: string
          updated_at: string
        }
        Insert: {
          account_number: string
          archived_at?: string | null
          assigned_team?: string | null
          assigned_to?: string | null
          category?: string | null
          created_at?: string
          created_by?: string | null
          customer_id: string
          description?: string | null
          id?: string
          priority?: string
          resolution_notes?: string | null
          resolved_at?: string | null
          sla_due_at?: string | null
          status?: string
          subject: string
          ticket_number?: string
          updated_at?: string
        }
        Update: {
          account_number?: string
          archived_at?: string | null
          assigned_team?: string | null
          assigned_to?: string | null
          category?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string
          description?: string | null
          id?: string
          priority?: string
          resolution_notes?: string | null
          resolved_at?: string | null
          sla_due_at?: string | null
          status?: string
          subject?: string
          ticket_number?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tickets_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          granted_by: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          granted_by?: string | null
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          granted_by?: string | null
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
      gen_customer_account_number: { Args: never; Returns: string }
      has_any_role: { Args: { _user_id: string }; Returns: boolean }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_master_admin: { Args: { _user_id: string }; Returns: boolean }
    }
    Enums: {
      app_role:
        | "master_admin"
        | "operations_manager"
        | "finance"
        | "sales"
        | "account_manager"
        | "technical_support"
        | "cloud_engineer"
        | "cyber_security"
        | "noc"
        | "inventory"
        | "procurement"
        | "customer_success"
        | "read_only"
        | "custom"
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
    Enums: {
      app_role: [
        "master_admin",
        "operations_manager",
        "finance",
        "sales",
        "account_manager",
        "technical_support",
        "cloud_engineer",
        "cyber_security",
        "noc",
        "inventory",
        "procurement",
        "customer_success",
        "read_only",
        "custom",
      ],
    },
  },
} as const
