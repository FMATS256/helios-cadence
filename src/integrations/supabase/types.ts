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
      asset_lifecycle_events: {
        Row: {
          asset_id: string
          created_at: string
          created_by: string | null
          event_type: string
          id: string
          notes: string | null
          occurred_at: string
        }
        Insert: {
          asset_id: string
          created_at?: string
          created_by?: string | null
          event_type: string
          id?: string
          notes?: string | null
          occurred_at?: string
        }
        Update: {
          asset_id?: string
          created_at?: string
          created_by?: string | null
          event_type?: string
          id?: string
          notes?: string | null
          occurred_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "asset_lifecycle_events_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
        ]
      }
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
      backup_schedules: {
        Row: {
          created_at: string
          created_by: string | null
          enabled: boolean
          frequency: string
          id: string
          last_run_at: string | null
          next_run_at: string
          retention_days: number
          server_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          enabled?: boolean
          frequency?: string
          id?: string
          last_run_at?: string | null
          next_run_at?: string
          retention_days?: number
          server_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          enabled?: boolean
          frequency?: string
          id?: string
          last_run_at?: string | null
          next_run_at?: string
          retention_days?: number
          server_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "backup_schedules_server_id_fkey"
            columns: ["server_id"]
            isOneToOne: true
            referencedRelation: "cloud_servers"
            referencedColumns: ["id"]
          },
        ]
      }
      budget_alerts: {
        Row: {
          cap_usd: number
          created_at: string
          customer_id: string
          id: string
          level: string
          month: string
          pct: number
          sent_at: string
          spend_usd: number
        }
        Insert: {
          cap_usd: number
          created_at?: string
          customer_id: string
          id?: string
          level: string
          month: string
          pct: number
          sent_at?: string
          spend_usd: number
        }
        Update: {
          cap_usd?: number
          created_at?: string
          customer_id?: string
          id?: string
          level?: string
          month?: string
          pct?: number
          sent_at?: string
          spend_usd?: number
        }
        Relationships: [
          {
            foreignKeyName: "budget_alerts_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      cloud_activity: {
        Row: {
          action: string
          actor_email: string | null
          actor_id: string | null
          created_at: string
          detail: Json | null
          id: string
          server_id: string | null
        }
        Insert: {
          action: string
          actor_email?: string | null
          actor_id?: string | null
          created_at?: string
          detail?: Json | null
          id?: string
          server_id?: string | null
        }
        Update: {
          action?: string
          actor_email?: string | null
          actor_id?: string | null
          created_at?: string
          detail?: Json | null
          id?: string
          server_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cloud_activity_server_id_fkey"
            columns: ["server_id"]
            isOneToOne: false
            referencedRelation: "cloud_servers"
            referencedColumns: ["id"]
          },
        ]
      }
      cloud_deployments: {
        Row: {
          action: string
          completed_at: string | null
          created_at: string
          created_by: string | null
          error: string | null
          id: string
          operation_id: string | null
          progress: number | null
          provider_command_id: string | null
          provider_response: Json | null
          request_payload: Json | null
          server_id: string | null
          started_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          action: string
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          error?: string | null
          id?: string
          operation_id?: string | null
          progress?: number | null
          provider_command_id?: string | null
          provider_response?: Json | null
          request_payload?: Json | null
          server_id?: string | null
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          action?: string
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          error?: string | null
          id?: string
          operation_id?: string | null
          progress?: number | null
          provider_command_id?: string | null
          provider_response?: Json | null
          request_payload?: Json | null
          server_id?: string | null
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cloud_deployments_server_id_fkey"
            columns: ["server_id"]
            isOneToOne: false
            referencedRelation: "cloud_servers"
            referencedColumns: ["id"]
          },
        ]
      }
      cloud_servers: {
        Row: {
          account_number: string | null
          archived_at: string | null
          billing_cycle: string | null
          cpu_cores: number | null
          cpu_type: string | null
          created_at: string
          created_by: string | null
          customer_id: string | null
          datacenter: string | null
          disk_sizes_gb: number[] | null
          handed_over_at: string | null
          handed_over_by: string | null
          handed_over_to_email: string | null
          id: string
          image: string | null
          last_synced_at: string | null
          monthly_cost_usd: number | null
          name: string
          networks: Json | null
          notes: string | null
          power_state: string | null
          private_ips: string[] | null
          provider: string
          provider_meta: Json | null
          provider_server_id: string | null
          public_ips: string[] | null
          ram_mb: number | null
          root_password_ref: string | null
          selling_price_usd: number | null
          ssh_key: string | null
          status: string
          tags: string[] | null
          updated_at: string
        }
        Insert: {
          account_number?: string | null
          archived_at?: string | null
          billing_cycle?: string | null
          cpu_cores?: number | null
          cpu_type?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          datacenter?: string | null
          disk_sizes_gb?: number[] | null
          handed_over_at?: string | null
          handed_over_by?: string | null
          handed_over_to_email?: string | null
          id?: string
          image?: string | null
          last_synced_at?: string | null
          monthly_cost_usd?: number | null
          name: string
          networks?: Json | null
          notes?: string | null
          power_state?: string | null
          private_ips?: string[] | null
          provider?: string
          provider_meta?: Json | null
          provider_server_id?: string | null
          public_ips?: string[] | null
          ram_mb?: number | null
          root_password_ref?: string | null
          selling_price_usd?: number | null
          ssh_key?: string | null
          status?: string
          tags?: string[] | null
          updated_at?: string
        }
        Update: {
          account_number?: string | null
          archived_at?: string | null
          billing_cycle?: string | null
          cpu_cores?: number | null
          cpu_type?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          datacenter?: string | null
          disk_sizes_gb?: number[] | null
          handed_over_at?: string | null
          handed_over_by?: string | null
          handed_over_to_email?: string | null
          id?: string
          image?: string | null
          last_synced_at?: string | null
          monthly_cost_usd?: number | null
          name?: string
          networks?: Json | null
          notes?: string | null
          power_state?: string | null
          private_ips?: string[] | null
          provider?: string
          provider_meta?: Json | null
          provider_server_id?: string | null
          public_ips?: string[] | null
          ram_mb?: number | null
          root_password_ref?: string | null
          selling_price_usd?: number | null
          ssh_key?: string | null
          status?: string
          tags?: string[] | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cloud_servers_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
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
      cloud_storage_accounts: {
        Row: {
          access_url: string | null
          account_number: string | null
          archived_at: string | null
          created_at: string
          created_by: string | null
          currency: string | null
          customer_id: string | null
          id: string
          monthly_cost: number | null
          name: string
          notes: string | null
          provider: string | null
          renewal_date: string | null
          status: string | null
          storage_tb: number | null
          updated_at: string
          used_tb: number | null
        }
        Insert: {
          access_url?: string | null
          account_number?: string | null
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string | null
          customer_id?: string | null
          id?: string
          monthly_cost?: number | null
          name: string
          notes?: string | null
          provider?: string | null
          renewal_date?: string | null
          status?: string | null
          storage_tb?: number | null
          updated_at?: string
          used_tb?: number | null
        }
        Update: {
          access_url?: string | null
          account_number?: string | null
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string | null
          customer_id?: string | null
          id?: string
          monthly_cost?: number | null
          name?: string
          notes?: string | null
          provider?: string | null
          renewal_date?: string | null
          status?: string | null
          storage_tb?: number | null
          updated_at?: string
          used_tb?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "cloud_storage_accounts_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      cloud_workspaces: {
        Row: {
          branding: Json
          created_at: string
          customer_id: string
          id: string
          name: string
          slug: string
          status: string
          updated_at: string
          workspace_key: string
        }
        Insert: {
          branding?: Json
          created_at?: string
          customer_id: string
          id?: string
          name: string
          slug: string
          status?: string
          updated_at?: string
          workspace_key: string
        }
        Update: {
          branding?: Json
          created_at?: string
          customer_id?: string
          id?: string
          name?: string
          slug?: string
          status?: string
          updated_at?: string
          workspace_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "cloud_workspaces_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      communications: {
        Row: {
          account_number: string | null
          body: string | null
          channel: string
          created_at: string
          created_by: string | null
          customer_id: string | null
          direction: string
          external_id: string | null
          id: string
          metadata: Json | null
          recipient: string | null
          sender: string | null
          sent_at: string | null
          status: string | null
          subject: string | null
          updated_at: string
        }
        Insert: {
          account_number?: string | null
          body?: string | null
          channel: string
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          direction?: string
          external_id?: string | null
          id?: string
          metadata?: Json | null
          recipient?: string | null
          sender?: string | null
          sent_at?: string | null
          status?: string | null
          subject?: string | null
          updated_at?: string
        }
        Update: {
          account_number?: string | null
          body?: string | null
          channel?: string
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          direction?: string
          external_id?: string | null
          id?: string
          metadata?: Json | null
          recipient?: string | null
          sender?: string | null
          sent_at?: string | null
          status?: string | null
          subject?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "communications_customer_id_fkey"
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
      customer_budgets: {
        Row: {
          alert_threshold_pct: number
          created_at: string
          created_by: string | null
          customer_id: string
          enabled: boolean
          id: string
          monthly_cap_usd: number
          notify_user_id: string | null
          updated_at: string
        }
        Insert: {
          alert_threshold_pct?: number
          created_at?: string
          created_by?: string | null
          customer_id: string
          enabled?: boolean
          id?: string
          monthly_cap_usd?: number
          notify_user_id?: string | null
          updated_at?: string
        }
        Update: {
          alert_threshold_pct?: number
          created_at?: string
          created_by?: string | null
          customer_id?: string
          enabled?: boolean
          id?: string
          monthly_cap_usd?: number
          notify_user_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_budgets_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: true
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
      customer_services: {
        Row: {
          assigned_by: string | null
          billing_cycle: string
          catalog_id: string
          created_at: string
          currency: string
          customer_id: string
          id: string
          next_renewal: string | null
          notes: string | null
          quantity: number
          started_on: string
          status: string
          subscription_id: string | null
          unit_price: number
          updated_at: string
        }
        Insert: {
          assigned_by?: string | null
          billing_cycle?: string
          catalog_id: string
          created_at?: string
          currency?: string
          customer_id: string
          id?: string
          next_renewal?: string | null
          notes?: string | null
          quantity?: number
          started_on?: string
          status?: string
          subscription_id?: string | null
          unit_price?: number
          updated_at?: string
        }
        Update: {
          assigned_by?: string | null
          billing_cycle?: string
          catalog_id?: string
          created_at?: string
          currency?: string
          customer_id?: string
          id?: string
          next_renewal?: string | null
          notes?: string | null
          quantity?: number
          started_on?: string
          status?: string
          subscription_id?: string | null
          unit_price?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_services_catalog_id_fkey"
            columns: ["catalog_id"]
            isOneToOne: false
            referencedRelation: "service_catalog"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_services_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_services_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
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
          account_type: string
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
          account_type?: string
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
          account_type?: string
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
      deployment_steps: {
        Row: {
          attempts: number
          completed_at: string | null
          created_at: string
          error: string | null
          id: string
          output: Json | null
          seq: number
          started_at: string | null
          status: string
          step_key: string
          step_label: string
          workflow_id: string
        }
        Insert: {
          attempts?: number
          completed_at?: string | null
          created_at?: string
          error?: string | null
          id?: string
          output?: Json | null
          seq: number
          started_at?: string | null
          status?: string
          step_key: string
          step_label: string
          workflow_id: string
        }
        Update: {
          attempts?: number
          completed_at?: string | null
          created_at?: string
          error?: string | null
          id?: string
          output?: Json | null
          seq?: number
          started_at?: string | null
          status?: string
          step_key?: string
          step_label?: string
          workflow_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "deployment_steps_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "deployment_workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      deployment_workflows: {
        Row: {
          completed_at: string | null
          context: Json
          created_at: string
          created_by: string | null
          current_step: string | null
          customer_id: string | null
          error: string | null
          id: string
          plan_id: string | null
          progress: number
          provider: string
          retry_count: number
          server_id: string | null
          started_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          context?: Json
          created_at?: string
          created_by?: string | null
          current_step?: string | null
          customer_id?: string | null
          error?: string | null
          id?: string
          plan_id?: string | null
          progress?: number
          provider: string
          retry_count?: number
          server_id?: string | null
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          context?: Json
          created_at?: string
          created_by?: string | null
          current_step?: string | null
          customer_id?: string | null
          error?: string | null
          id?: string
          plan_id?: string | null
          progress?: number
          provider?: string
          retry_count?: number
          server_id?: string | null
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "deployment_workflows_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deployment_workflows_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "provisioning_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deployment_workflows_server_id_fkey"
            columns: ["server_id"]
            isOneToOne: false
            referencedRelation: "cloud_servers"
            referencedColumns: ["id"]
          },
        ]
      }
      email_template_versions: {
        Row: {
          created_at: string
          created_by: string | null
          html_content: string | null
          id: string
          mode: string
          note: string | null
          sample_data: Json | null
          subject: string | null
          template_id: string
          template_name: string
          unlayer_design: Json | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          html_content?: string | null
          id?: string
          mode: string
          note?: string | null
          sample_data?: Json | null
          subject?: string | null
          template_id: string
          template_name: string
          unlayer_design?: Json | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          html_content?: string | null
          id?: string
          mode?: string
          note?: string | null
          sample_data?: Json | null
          subject?: string | null
          template_id?: string
          template_name?: string
          unlayer_design?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "email_template_versions_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "email_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      email_templates: {
        Row: {
          created_at: string
          display_name: string
          from_name: string | null
          html_content: string | null
          id: string
          is_active: boolean
          mode: string
          preview_text: string | null
          sample_data: Json | null
          subject: string | null
          template_name: string
          unlayer_design: Json | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          display_name: string
          from_name?: string | null
          html_content?: string | null
          id?: string
          is_active?: boolean
          mode?: string
          preview_text?: string | null
          sample_data?: Json | null
          subject?: string | null
          template_name: string
          unlayer_design?: Json | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          display_name?: string
          from_name?: string | null
          html_content?: string | null
          id?: string
          is_active?: boolean
          mode?: string
          preview_text?: string | null
          sample_data?: Json | null
          subject?: string | null
          template_name?: string
          unlayer_design?: Json | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      email_theme: {
        Row: {
          address: string
          brand_name: string
          color_accent: string
          color_background: string
          color_body: string
          color_ink: string
          color_primary: string
          font_family: string
          id: string
          logo_url: string | null
          singleton: boolean
          site_url: string
          support_email: string
          support_phone: string
          tagline: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          address?: string
          brand_name?: string
          color_accent?: string
          color_background?: string
          color_body?: string
          color_ink?: string
          color_primary?: string
          font_family?: string
          id?: string
          logo_url?: string | null
          singleton?: boolean
          site_url?: string
          support_email?: string
          support_phone?: string
          tagline?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          address?: string
          brand_name?: string
          color_accent?: string
          color_background?: string
          color_body?: string
          color_ink?: string
          color_primary?: string
          font_family?: string
          id?: string
          logo_url?: string | null
          singleton?: boolean
          site_url?: string
          support_email?: string
          support_phone?: string
          tagline?: string
          updated_at?: string
          updated_by?: string | null
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
      invoice_line_items: {
        Row: {
          created_at: string
          description: string
          id: string
          invoice_id: string
          line_total: number | null
          position: number
          quantity: number
          tax_rate: number
          unit_price: number
        }
        Insert: {
          created_at?: string
          description: string
          id?: string
          invoice_id: string
          line_total?: number | null
          position?: number
          quantity?: number
          tax_rate?: number
          unit_price?: number
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          invoice_id?: string
          line_total?: number | null
          position?: number
          quantity?: number
          tax_rate?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoice_line_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
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
      kb_articles: {
        Row: {
          author_id: string | null
          category: string | null
          content: string
          created_at: string
          id: string
          published: boolean
          slug: string
          tags: string[]
          title: string
          updated_at: string
          visibility: string
        }
        Insert: {
          author_id?: string | null
          category?: string | null
          content?: string
          created_at?: string
          id?: string
          published?: boolean
          slug: string
          tags?: string[]
          title: string
          updated_at?: string
          visibility?: string
        }
        Update: {
          author_id?: string | null
          category?: string | null
          content?: string
          created_at?: string
          id?: string
          published?: boolean
          slug?: string
          tags?: string[]
          title?: string
          updated_at?: string
          visibility?: string
        }
        Relationships: []
      }
      licenses: {
        Row: {
          account_number: string | null
          archived_at: string | null
          auto_renew: boolean | null
          category: string | null
          cost: number | null
          created_at: string
          created_by: string | null
          currency: string | null
          customer_id: string | null
          expiry_date: string | null
          id: string
          license_key: string | null
          notes: string | null
          product: string
          purchase_date: string | null
          seats: number | null
          status: string | null
          updated_at: string
          vendor: string | null
        }
        Insert: {
          account_number?: string | null
          archived_at?: string | null
          auto_renew?: boolean | null
          category?: string | null
          cost?: number | null
          created_at?: string
          created_by?: string | null
          currency?: string | null
          customer_id?: string | null
          expiry_date?: string | null
          id?: string
          license_key?: string | null
          notes?: string | null
          product: string
          purchase_date?: string | null
          seats?: number | null
          status?: string | null
          updated_at?: string
          vendor?: string | null
        }
        Update: {
          account_number?: string | null
          archived_at?: string | null
          auto_renew?: boolean | null
          category?: string | null
          cost?: number | null
          created_at?: string
          created_by?: string | null
          currency?: string | null
          customer_id?: string | null
          expiry_date?: string | null
          id?: string
          license_key?: string | null
          notes?: string | null
          product?: string
          purchase_date?: string | null
          seats?: number | null
          status?: string | null
          updated_at?: string
          vendor?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "licenses_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      managed_nas_accounts: {
        Row: {
          account_number: string | null
          archived_at: string | null
          capacity_tb: number | null
          created_at: string
          created_by: string | null
          currency: string | null
          customer_id: string | null
          id: string
          location: string | null
          management_url: string | null
          model: string | null
          monthly_cost: number | null
          name: string
          notes: string | null
          raid_level: string | null
          renewal_date: string | null
          serial_number: string | null
          status: string | null
          updated_at: string
          vendor: string | null
        }
        Insert: {
          account_number?: string | null
          archived_at?: string | null
          capacity_tb?: number | null
          created_at?: string
          created_by?: string | null
          currency?: string | null
          customer_id?: string | null
          id?: string
          location?: string | null
          management_url?: string | null
          model?: string | null
          monthly_cost?: number | null
          name: string
          notes?: string | null
          raid_level?: string | null
          renewal_date?: string | null
          serial_number?: string | null
          status?: string | null
          updated_at?: string
          vendor?: string | null
        }
        Update: {
          account_number?: string | null
          archived_at?: string | null
          capacity_tb?: number | null
          created_at?: string
          created_by?: string | null
          currency?: string | null
          customer_id?: string | null
          id?: string
          location?: string | null
          management_url?: string | null
          model?: string | null
          monthly_cost?: number | null
          name?: string
          notes?: string | null
          raid_level?: string | null
          renewal_date?: string | null
          serial_number?: string | null
          status?: string | null
          updated_at?: string
          vendor?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "managed_nas_accounts_customer_id_fkey"
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
      monitoring_incidents: {
        Row: {
          acknowledged_at: string | null
          acknowledged_by: string | null
          check_id: string
          created_at: string
          ended_at: string | null
          id: string
          last_error: string | null
          started_at: string
        }
        Insert: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          check_id: string
          created_at?: string
          ended_at?: string | null
          id?: string
          last_error?: string | null
          started_at?: string
        }
        Update: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          check_id?: string
          created_at?: string
          ended_at?: string | null
          id?: string
          last_error?: string | null
          started_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "monitoring_incidents_check_id_fkey"
            columns: ["check_id"]
            isOneToOne: false
            referencedRelation: "monitoring_checks"
            referencedColumns: ["id"]
          },
        ]
      }
      monitoring_results: {
        Row: {
          check_id: string
          checked_at: string
          error: string | null
          id: string
          response_ms: number | null
          status: string
        }
        Insert: {
          check_id: string
          checked_at?: string
          error?: string | null
          id?: string
          response_ms?: number | null
          status: string
        }
        Update: {
          check_id?: string
          checked_at?: string
          error?: string | null
          id?: string
          response_ms?: number | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "monitoring_results_check_id_fkey"
            columns: ["check_id"]
            isOneToOne: false
            referencedRelation: "monitoring_checks"
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
      payment_allocations: {
        Row: {
          amount: number
          created_at: string
          id: string
          invoice_id: string
          payment_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          invoice_id: string
          payment_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          invoice_id?: string
          payment_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_allocations_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_allocations_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          account_number: string
          amount: number
          created_at: string
          created_by: string | null
          currency: string
          customer_id: string
          id: string
          invoice_id: string | null
          method: string | null
          notes: string | null
          paid_at: string
          receipt_number: string | null
          reconciliation_status: string
          reference: string | null
          service_context: string | null
          status: string
          updated_at: string
        }
        Insert: {
          account_number: string
          amount: number
          created_at?: string
          created_by?: string | null
          currency?: string
          customer_id: string
          id?: string
          invoice_id?: string | null
          method?: string | null
          notes?: string | null
          paid_at?: string
          receipt_number?: string | null
          reconciliation_status?: string
          reference?: string | null
          service_context?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          account_number?: string
          amount?: number
          created_at?: string
          created_by?: string | null
          currency?: string
          customer_id?: string
          id?: string
          invoice_id?: string | null
          method?: string | null
          notes?: string | null
          paid_at?: string
          receipt_number?: string | null
          reconciliation_status?: string
          reference?: string | null
          service_context?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
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
          archived_at: string | null
          created_at: string
          customer_id: string | null
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
          customer_id?: string | null
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
          customer_id?: string | null
          department?: string | null
          email?: string | null
          full_name?: string | null
          id?: string
          phone?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
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
      provisioning_plans: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string
          created_by: string | null
          customer_id: string | null
          estimated_hourly_usd: number | null
          estimated_monthly_usd: number | null
          estimated_setup_minutes: number | null
          id: string
          notes: string | null
          provider: string
          region: string | null
          rejected_reason: string | null
          report: Json
          request: Json
          status: string
          updated_at: string
          workflow_id: string | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          estimated_hourly_usd?: number | null
          estimated_monthly_usd?: number | null
          estimated_setup_minutes?: number | null
          id?: string
          notes?: string | null
          provider: string
          region?: string | null
          rejected_reason?: string | null
          report: Json
          request: Json
          status?: string
          updated_at?: string
          workflow_id?: string | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          estimated_hourly_usd?: number | null
          estimated_monthly_usd?: number | null
          estimated_setup_minutes?: number | null
          id?: string
          notes?: string | null
          provider?: string
          region?: string | null
          rejected_reason?: string | null
          report?: Json
          request?: Json
          status?: string
          updated_at?: string
          workflow_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "provisioning_plans_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      quote_line_items: {
        Row: {
          created_at: string
          description: string
          id: string
          line_total: number | null
          position: number
          quantity: number
          quote_id: string
          tax_rate: number
          unit_price: number
        }
        Insert: {
          created_at?: string
          description: string
          id?: string
          line_total?: number | null
          position?: number
          quantity?: number
          quote_id: string
          tax_rate?: number
          unit_price?: number
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          line_total?: number | null
          position?: number
          quantity?: number
          quote_id?: string
          tax_rate?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "quote_line_items_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      quotes: {
        Row: {
          account_number: string
          amount: number
          created_at: string
          created_by: string | null
          currency: string
          customer_id: string
          id: string
          notes: string | null
          quote_number: string | null
          status: string
          title: string
          updated_at: string
          valid_until: string | null
        }
        Insert: {
          account_number: string
          amount?: number
          created_at?: string
          created_by?: string | null
          currency?: string
          customer_id: string
          id?: string
          notes?: string | null
          quote_number?: string | null
          status?: string
          title: string
          updated_at?: string
          valid_until?: string | null
        }
        Update: {
          account_number?: string
          amount?: number
          created_at?: string
          created_by?: string | null
          currency?: string
          customer_id?: string
          id?: string
          notes?: string | null
          quote_number?: string | null
          status?: string
          title?: string
          updated_at?: string
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quotes_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      server_backups: {
        Row: {
          created_at: string
          created_by: string | null
          error: string | null
          expires_at: string | null
          id: string
          kind: string
          notes: string | null
          provider: string | null
          provider_snapshot_id: string | null
          server_id: string
          size_gb: number | null
          status: string
          taken_at: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          error?: string | null
          expires_at?: string | null
          id?: string
          kind?: string
          notes?: string | null
          provider?: string | null
          provider_snapshot_id?: string | null
          server_id: string
          size_gb?: number | null
          status?: string
          taken_at?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          error?: string | null
          expires_at?: string | null
          id?: string
          kind?: string
          notes?: string | null
          provider?: string | null
          provider_snapshot_id?: string | null
          server_id?: string
          size_gb?: number | null
          status?: string
          taken_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "server_backups_server_id_fkey"
            columns: ["server_id"]
            isOneToOne: false
            referencedRelation: "cloud_servers"
            referencedColumns: ["id"]
          },
        ]
      }
      service_catalog: {
        Row: {
          billing_cycle: string
          category: string
          code: string
          created_at: string
          created_by: string | null
          currency: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          unit_price: number
          updated_at: string
        }
        Insert: {
          billing_cycle?: string
          category?: string
          code: string
          created_at?: string
          created_by?: string | null
          currency?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          unit_price?: number
          updated_at?: string
        }
        Update: {
          billing_cycle?: string
          category?: string
          code?: string
          created_at?: string
          created_by?: string | null
          currency?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          unit_price?: number
          updated_at?: string
        }
        Relationships: []
      }
      starlink_accounts: {
        Row: {
          account_number: string
          archived_at: string | null
          balance_usd: number
          created_at: string
          created_by: string | null
          customer_id: string
          id: string
          kit_serial: string | null
          last_checked_at: string | null
          monthly_price: number
          notes: string | null
          plan_type: string
          provider_payload: Json | null
          service_address: string | null
          starlink_account_number: string | null
          status: string
          terminal_id: string | null
          updated_at: string
        }
        Insert: {
          account_number: string
          archived_at?: string | null
          balance_usd?: number
          created_at?: string
          created_by?: string | null
          customer_id: string
          id?: string
          kit_serial?: string | null
          last_checked_at?: string | null
          monthly_price?: number
          notes?: string | null
          plan_type?: string
          provider_payload?: Json | null
          service_address?: string | null
          starlink_account_number?: string | null
          status?: string
          terminal_id?: string | null
          updated_at?: string
        }
        Update: {
          account_number?: string
          archived_at?: string | null
          balance_usd?: number
          created_at?: string
          created_by?: string | null
          customer_id?: string
          id?: string
          kit_serial?: string | null
          last_checked_at?: string | null
          monthly_price?: number
          notes?: string | null
          plan_type?: string
          provider_payload?: Json | null
          service_address?: string | null
          starlink_account_number?: string | null
          status?: string
          terminal_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "starlink_accounts_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      starlink_recharges: {
        Row: {
          account_number: string
          created_at: string
          currency: string
          customer_charge_usd: number
          customer_id: string
          external_company: string
          external_payout_usd: number
          external_status: string
          id: string
          margin_usd: number
          notes: string | null
          payment_method: string | null
          payment_reference: string | null
          requested_by: string | null
          starlink_account_id: string
          status: string
          updated_at: string
        }
        Insert: {
          account_number: string
          created_at?: string
          currency?: string
          customer_charge_usd?: number
          customer_id: string
          external_company?: string
          external_payout_usd?: number
          external_status?: string
          id?: string
          margin_usd?: number
          notes?: string | null
          payment_method?: string | null
          payment_reference?: string | null
          requested_by?: string | null
          starlink_account_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          account_number?: string
          created_at?: string
          currency?: string
          customer_charge_usd?: number
          customer_id?: string
          external_company?: string
          external_payout_usd?: number
          external_status?: string
          id?: string
          margin_usd?: number
          notes?: string | null
          payment_method?: string | null
          payment_reference?: string | null
          requested_by?: string | null
          starlink_account_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "starlink_recharges_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "starlink_recharges_starlink_account_id_fkey"
            columns: ["starlink_account_id"]
            isOneToOne: false
            referencedRelation: "starlink_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          account_number: string
          amount: number
          auto_renew: boolean
          billing_cycle: string
          created_at: string
          created_by: string | null
          currency: string
          customer_id: string
          description: string | null
          id: string
          next_renewal: string | null
          notes: string | null
          plan_name: string
          started_on: string | null
          status: string
          updated_at: string
        }
        Insert: {
          account_number: string
          amount?: number
          auto_renew?: boolean
          billing_cycle?: string
          created_at?: string
          created_by?: string | null
          currency?: string
          customer_id: string
          description?: string | null
          id?: string
          next_renewal?: string | null
          notes?: string | null
          plan_name: string
          started_on?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          account_number?: string
          amount?: number
          auto_renew?: boolean
          billing_cycle?: string
          created_at?: string
          created_by?: string | null
          currency?: string
          customer_id?: string
          description?: string | null
          id?: string
          next_renewal?: string | null
          notes?: string | null
          plan_name?: string
          started_on?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_customer_id_fkey"
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
      voip_accounts: {
        Row: {
          account_number: string | null
          archived_at: string | null
          balance_updated_at: string | null
          balance_usd: number
          created_at: string
          created_by: string | null
          customer_id: string | null
          dandemutande_account: string | null
          extensions: string[]
          id: string
          last_successful_recharge_at: string | null
          last_synced_at: string | null
          low_balance_threshold_usd: number
          notes: string | null
          sip_password_credential_id: string | null
          sip_username: string | null
          status: string
          tags: string[]
          updated_at: string
          voip_number: string
        }
        Insert: {
          account_number?: string | null
          archived_at?: string | null
          balance_updated_at?: string | null
          balance_usd?: number
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          dandemutande_account?: string | null
          extensions?: string[]
          id?: string
          last_successful_recharge_at?: string | null
          last_synced_at?: string | null
          low_balance_threshold_usd?: number
          notes?: string | null
          sip_password_credential_id?: string | null
          sip_username?: string | null
          status?: string
          tags?: string[]
          updated_at?: string
          voip_number: string
        }
        Update: {
          account_number?: string | null
          archived_at?: string | null
          balance_updated_at?: string | null
          balance_usd?: number
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          dandemutande_account?: string | null
          extensions?: string[]
          id?: string
          last_successful_recharge_at?: string | null
          last_synced_at?: string | null
          low_balance_threshold_usd?: number
          notes?: string | null
          sip_password_credential_id?: string | null
          sip_username?: string | null
          status?: string
          tags?: string[]
          updated_at?: string
          voip_number?: string
        }
        Relationships: [
          {
            foreignKeyName: "voip_accounts_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voip_accounts_sip_password_credential_id_fkey"
            columns: ["sip_password_credential_id"]
            isOneToOne: false
            referencedRelation: "credentials"
            referencedColumns: ["id"]
          },
        ]
      }
      voip_recharges: {
        Row: {
          amount_usd: number
          balance_after: number | null
          balance_before: number | null
          created_at: string
          customer_id: string | null
          email_error: string | null
          email_status: string
          id: string
          notes: string | null
          payment_method: string | null
          payment_reference: string | null
          pop_url: string | null
          receipt_number: string | null
          requested_by: string | null
          status: string
          updated_at: string
          verified_at: string | null
          voip_account_id: string
        }
        Insert: {
          amount_usd: number
          balance_after?: number | null
          balance_before?: number | null
          created_at?: string
          customer_id?: string | null
          email_error?: string | null
          email_status?: string
          id?: string
          notes?: string | null
          payment_method?: string | null
          payment_reference?: string | null
          pop_url?: string | null
          receipt_number?: string | null
          requested_by?: string | null
          status?: string
          updated_at?: string
          verified_at?: string | null
          voip_account_id: string
        }
        Update: {
          amount_usd?: number
          balance_after?: number | null
          balance_before?: number | null
          created_at?: string
          customer_id?: string | null
          email_error?: string | null
          email_status?: string
          id?: string
          notes?: string | null
          payment_method?: string | null
          payment_reference?: string | null
          pop_url?: string | null
          receipt_number?: string | null
          requested_by?: string | null
          status?: string
          updated_at?: string
          verified_at?: string | null
          voip_account_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "voip_recharges_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voip_recharges_voip_account_id_fkey"
            columns: ["voip_account_id"]
            isOneToOne: false
            referencedRelation: "voip_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      voip_sync_log: {
        Row: {
          created_at: string
          error: string | null
          extracted: Json | null
          id: string
          source: string
          status: string
          voip_account_id: string | null
        }
        Insert: {
          created_at?: string
          error?: string | null
          extracted?: Json | null
          id?: string
          source?: string
          status: string
          voip_account_id?: string | null
        }
        Update: {
          created_at?: string
          error?: string | null
          extracted?: Json | null
          id?: string
          source?: string
          status?: string
          voip_account_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "voip_sync_log_voip_account_id_fkey"
            columns: ["voip_account_id"]
            isOneToOne: false
            referencedRelation: "voip_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      web_hosting_accounts: {
        Row: {
          account_number: string | null
          archived_at: string | null
          bandwidth_gb: number | null
          control_panel: string | null
          control_panel_url: string | null
          created_at: string
          created_by: string | null
          currency: string | null
          customer_id: string | null
          disk_quota_gb: number | null
          domain: string
          id: string
          monthly_cost: number | null
          notes: string | null
          plan: string | null
          provider: string | null
          renewal_date: string | null
          status: string | null
          updated_at: string
          username: string | null
        }
        Insert: {
          account_number?: string | null
          archived_at?: string | null
          bandwidth_gb?: number | null
          control_panel?: string | null
          control_panel_url?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string | null
          customer_id?: string | null
          disk_quota_gb?: number | null
          domain: string
          id?: string
          monthly_cost?: number | null
          notes?: string | null
          plan?: string | null
          provider?: string | null
          renewal_date?: string | null
          status?: string | null
          updated_at?: string
          username?: string | null
        }
        Update: {
          account_number?: string | null
          archived_at?: string | null
          bandwidth_gb?: number | null
          control_panel?: string | null
          control_panel_url?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string | null
          customer_id?: string | null
          disk_quota_gb?: number | null
          domain?: string
          id?: string
          monthly_cost?: number | null
          notes?: string | null
          plan?: string | null
          provider?: string | null
          renewal_date?: string | null
          status?: string | null
          updated_at?: string
          username?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "web_hosting_accounts_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_audit_log: {
        Row: {
          action: string
          actor_kind: string
          actor_user_id: string | null
          created_at: string
          detail: Json
          id: string
          ip: unknown
          resource_id: string | null
          resource_kind: string | null
          user_agent: string | null
          workspace_id: string
        }
        Insert: {
          action: string
          actor_kind?: string
          actor_user_id?: string | null
          created_at?: string
          detail?: Json
          id?: string
          ip?: unknown
          resource_id?: string | null
          resource_kind?: string | null
          user_agent?: string | null
          workspace_id: string
        }
        Update: {
          action?: string
          actor_kind?: string
          actor_user_id?: string | null
          created_at?: string
          detail?: Json
          id?: string
          ip?: unknown
          resource_id?: string | null
          resource_kind?: string | null
          user_agent?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_audit_log_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "cloud_workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_invitations: {
        Row: {
          accepted_at: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string | null
          role: Database["public"]["Enums"]["workspace_role"]
          token: string
          workspace_id: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          role?: Database["public"]["Enums"]["workspace_role"]
          token: string
          workspace_id: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          role?: Database["public"]["Enums"]["workspace_role"]
          token?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_invitations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "cloud_workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_members: {
        Row: {
          accepted_at: string | null
          id: string
          invited_at: string
          invited_by: string | null
          role: Database["public"]["Enums"]["workspace_role"]
          user_id: string
          workspace_id: string
        }
        Insert: {
          accepted_at?: string | null
          id?: string
          invited_at?: string
          invited_by?: string | null
          role?: Database["public"]["Enums"]["workspace_role"]
          user_id: string
          workspace_id: string
        }
        Update: {
          accepted_at?: string | null
          id?: string
          invited_at?: string
          invited_by?: string | null
          role?: Database["public"]["Enums"]["workspace_role"]
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_members_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "cloud_workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_servers: {
        Row: {
          created_at: string
          customer_notes: string | null
          display_name: string | null
          id: string
          server_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          customer_notes?: string | null
          display_name?: string | null
          id?: string
          server_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          customer_notes?: string | null
          display_name?: string | null
          id?: string
          server_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_servers_server_id_fkey"
            columns: ["server_id"]
            isOneToOne: true
            referencedRelation: "cloud_servers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_servers_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "cloud_workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_ssh_keys: {
        Row: {
          created_at: string
          created_by: string | null
          fingerprint: string | null
          id: string
          name: string
          public_key: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          fingerprint?: string | null
          id?: string
          name: string
          public_key: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          fingerprint?: string | null
          id?: string
          name?: string
          public_key?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_ssh_keys_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "cloud_workspaces"
            referencedColumns: ["id"]
          },
        ]
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
      has_workspace_role: {
        Args: {
          _min: Database["public"]["Enums"]["workspace_role"]
          _user: string
          _workspace: string
        }
        Returns: boolean
      }
      is_master_admin: { Args: { _user_id: string }; Returns: boolean }
      is_workspace_member: {
        Args: { _user: string; _workspace: string }
        Returns: boolean
      }
      portal_customer_id: { Args: { _user_id: string }; Returns: string }
      recompute_invoice_status: {
        Args: { _invoice_id: string }
        Returns: undefined
      }
      recompute_payment_reconciliation: {
        Args: { _payment_id: string }
        Returns: undefined
      }
      workspace_role_of: {
        Args: { _user: string; _workspace: string }
        Returns: Database["public"]["Enums"]["workspace_role"]
      }
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
      workspace_role: "owner" | "admin" | "developer" | "viewer"
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
      workspace_role: ["owner", "admin", "developer", "viewer"],
    },
  },
} as const
