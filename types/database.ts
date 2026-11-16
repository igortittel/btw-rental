// GENERATED from the Supabase project (supabase gen types typescript). Do not edit by hand.
// Regenerate after every migration: npm run db:types

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
      audit_log: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          diff: Json | null
          entity: string
          entity_id: string | null
          id: number
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          diff?: Json | null
          entity: string
          entity_id?: string | null
          id?: never
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          diff?: Json | null
          entity?: string
          entity_id?: string | null
          id?: never
        }
        Relationships: []
      }
      auth_tokens: {
        Row: {
          created_at: string
          created_by: string | null
          expires_at: string
          id: string
          profile_id: string
          purpose: Database["public"]["Enums"]["auth_token_purpose"]
          token_hash: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          expires_at: string
          id?: string
          profile_id: string
          purpose: Database["public"]["Enums"]["auth_token_purpose"]
          token_hash: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          expires_at?: string
          id?: string
          profile_id?: string
          purpose?: Database["public"]["Enums"]["auth_token_purpose"]
          token_hash?: string
          used_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "auth_tokens_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "auth_tokens_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      availability_blocks: {
        Row: {
          created_at: string
          created_by: string | null
          ends_at: string
          id: string
          note: string | null
          reason: Database["public"]["Enums"]["block_reason"]
          starts_at: string
          vehicle_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          ends_at: string
          id?: string
          note?: string | null
          reason?: Database["public"]["Enums"]["block_reason"]
          starts_at: string
          vehicle_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          ends_at?: string
          id?: string
          note?: string | null
          reason?: Database["public"]["Enums"]["block_reason"]
          starts_at?: string
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "availability_blocks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "availability_blocks_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "public_vehicles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "availability_blocks_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_counters: {
        Row: {
          last_number: number
          year: number
        }
        Insert: {
          last_number?: number
          year: number
        }
        Update: {
          last_number?: number
          year?: number
        }
        Relationships: []
      }
      booking_extras: {
        Row: {
          booking_id: string
          extra_id: string | null
          id: string
          name_snapshot: Json
          pricing_type: Database["public"]["Enums"]["extra_pricing_type"]
          quantity: number
          total_cents: number
          unit_price_cents: number
        }
        Insert: {
          booking_id: string
          extra_id?: string | null
          id?: string
          name_snapshot: Json
          pricing_type: Database["public"]["Enums"]["extra_pricing_type"]
          quantity?: number
          total_cents: number
          unit_price_cents: number
        }
        Update: {
          booking_id?: string
          extra_id?: string | null
          id?: string
          name_snapshot?: Json
          pricing_type?: Database["public"]["Enums"]["extra_pricing_type"]
          quantity?: number
          total_cents?: number
          unit_price_cents?: number
        }
        Relationships: [
          {
            foreignKeyName: "booking_extras_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_extras_extra_id_fkey"
            columns: ["extra_id"]
            isOneToOne: false
            referencedRelation: "extras"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_notes: {
        Row: {
          author_id: string | null
          body: string
          booking_id: string
          created_at: string
          id: string
        }
        Insert: {
          author_id?: string | null
          body: string
          booking_id: string
          created_at?: string
          id?: string
        }
        Update: {
          author_id?: string | null
          body?: string
          booking_id?: string
          created_at?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_notes_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_notes_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_status_history: {
        Row: {
          booking_id: string
          changed_by: string | null
          created_at: string
          from_status: Database["public"]["Enums"]["booking_status"] | null
          id: string
          note: string | null
          to_status: Database["public"]["Enums"]["booking_status"]
        }
        Insert: {
          booking_id: string
          changed_by?: string | null
          created_at?: string
          from_status?: Database["public"]["Enums"]["booking_status"] | null
          id?: string
          note?: string | null
          to_status: Database["public"]["Enums"]["booking_status"]
        }
        Update: {
          booking_id?: string
          changed_by?: string | null
          created_at?: string
          from_status?: Database["public"]["Enums"]["booking_status"] | null
          id?: string
          note?: string | null
          to_status?: Database["public"]["Enums"]["booking_status"]
        }
        Relationships: [
          {
            foreignKeyName: "booking_status_history_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_status_history_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      bookings: {
        Row: {
          abroad_countries: string | null
          abroad_trip: boolean
          blocked_until: string
          buffer_minutes: number
          cancellation_fee_cents: number | null
          cancellation_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          created_at: string
          created_by: Database["public"]["Enums"]["booking_creator"]
          created_by_staff_id: string | null
          customer_id: string
          customer_note: string | null
          customer_snapshot: Json
          days: number
          deposit_cents: number
          deposit_payment_method: Database["public"]["Enums"]["payment_method"]
          deposit_received_at: string | null
          deposit_received_marked_by: string | null
          deposit_return_method:
            | Database["public"]["Enums"]["payment_method"]
            | null
          deposit_return_note: string | null
          deposit_returned_at: string | null
          deposit_returned_cents: number | null
          deposit_status: Database["public"]["Enums"]["deposit_status"]
          extra_km_cents: number
          id: string
          is_individual_price: boolean
          km_limit_per_day: number
          locale: string
          number: string
          pending_change: Json | null
          pickup_at: string
          pickup_custom_address: string | null
          pickup_location_id: string
          price_override_reason: string | null
          price_snapshot: Json
          rental_paid_at: string | null
          rental_paid_marked_by: string | null
          rental_payment_method: Database["public"]["Enums"]["payment_method"]
          rental_payment_status: Database["public"]["Enums"]["rental_payment_status"]
          return_at: string
          return_custom_address: string | null
          return_location_id: string
          review_requested_at: string | null
          status: Database["public"]["Enums"]["booking_status"]
          subtotal_cents: number | null
          total_cents: number | null
          updated_at: string
          vat_rate: number
          vehicle_id: string
        }
        Insert: {
          abroad_countries?: string | null
          abroad_trip?: boolean
          blocked_until: string
          buffer_minutes: number
          cancellation_fee_cents?: number | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string
          created_by?: Database["public"]["Enums"]["booking_creator"]
          created_by_staff_id?: string | null
          customer_id: string
          customer_note?: string | null
          customer_snapshot?: Json
          days: number
          deposit_cents: number
          deposit_payment_method: Database["public"]["Enums"]["payment_method"]
          deposit_received_at?: string | null
          deposit_received_marked_by?: string | null
          deposit_return_method?:
            | Database["public"]["Enums"]["payment_method"]
            | null
          deposit_return_note?: string | null
          deposit_returned_at?: string | null
          deposit_returned_cents?: number | null
          deposit_status?: Database["public"]["Enums"]["deposit_status"]
          extra_km_cents: number
          id?: string
          is_individual_price?: boolean
          km_limit_per_day: number
          locale?: string
          number: string
          pending_change?: Json | null
          pickup_at: string
          pickup_custom_address?: string | null
          pickup_location_id: string
          price_override_reason?: string | null
          price_snapshot?: Json
          rental_paid_at?: string | null
          rental_paid_marked_by?: string | null
          rental_payment_method: Database["public"]["Enums"]["payment_method"]
          rental_payment_status?: Database["public"]["Enums"]["rental_payment_status"]
          return_at: string
          return_custom_address?: string | null
          return_location_id: string
          review_requested_at?: string | null
          status?: Database["public"]["Enums"]["booking_status"]
          subtotal_cents?: number | null
          total_cents?: number | null
          updated_at?: string
          vat_rate: number
          vehicle_id: string
        }
        Update: {
          abroad_countries?: string | null
          abroad_trip?: boolean
          blocked_until?: string
          buffer_minutes?: number
          cancellation_fee_cents?: number | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string
          created_by?: Database["public"]["Enums"]["booking_creator"]
          created_by_staff_id?: string | null
          customer_id?: string
          customer_note?: string | null
          customer_snapshot?: Json
          days?: number
          deposit_cents?: number
          deposit_payment_method?: Database["public"]["Enums"]["payment_method"]
          deposit_received_at?: string | null
          deposit_received_marked_by?: string | null
          deposit_return_method?:
            | Database["public"]["Enums"]["payment_method"]
            | null
          deposit_return_note?: string | null
          deposit_returned_at?: string | null
          deposit_returned_cents?: number | null
          deposit_status?: Database["public"]["Enums"]["deposit_status"]
          extra_km_cents?: number
          id?: string
          is_individual_price?: boolean
          km_limit_per_day?: number
          locale?: string
          number?: string
          pending_change?: Json | null
          pickup_at?: string
          pickup_custom_address?: string | null
          pickup_location_id?: string
          price_override_reason?: string | null
          price_snapshot?: Json
          rental_paid_at?: string | null
          rental_paid_marked_by?: string | null
          rental_payment_method?: Database["public"]["Enums"]["payment_method"]
          rental_payment_status?: Database["public"]["Enums"]["rental_payment_status"]
          return_at?: string
          return_custom_address?: string | null
          return_location_id?: string
          review_requested_at?: string | null
          status?: Database["public"]["Enums"]["booking_status"]
          subtotal_cents?: number | null
          total_cents?: number | null
          updated_at?: string
          vat_rate?: number
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bookings_cancelled_by_fkey"
            columns: ["cancelled_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_created_by_staff_id_fkey"
            columns: ["created_by_staff_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_deposit_received_marked_by_fkey"
            columns: ["deposit_received_marked_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_pickup_location_id_fkey"
            columns: ["pickup_location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_pickup_location_id_fkey"
            columns: ["pickup_location_id"]
            isOneToOne: false
            referencedRelation: "public_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_rental_paid_marked_by_fkey"
            columns: ["rental_paid_marked_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_return_location_id_fkey"
            columns: ["return_location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_return_location_id_fkey"
            columns: ["return_location_id"]
            isOneToOne: false
            referencedRelation: "public_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "public_vehicles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      consents: {
        Row: {
          booking_id: string | null
          granted: boolean
          granted_at: string
          id: string
          ip: unknown
          profile_id: string
          type: Database["public"]["Enums"]["consent_type"]
          user_agent: string | null
          version: string
        }
        Insert: {
          booking_id?: string | null
          granted?: boolean
          granted_at?: string
          id?: string
          ip?: unknown
          profile_id: string
          type: Database["public"]["Enums"]["consent_type"]
          user_agent?: string | null
          version: string
        }
        Update: {
          booking_id?: string | null
          granted?: boolean
          granted_at?: string
          id?: string
          ip?: unknown
          profile_id?: string
          type?: Database["public"]["Enums"]["consent_type"]
          user_agent?: string | null
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "consents_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consents_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_internal: {
        Row: {
          blacklist_note: string | null
          internal_note: string | null
          is_blacklisted: boolean
          profile_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          blacklist_note?: string | null
          internal_note?: string | null
          is_blacklisted?: boolean
          profile_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          blacklist_note?: string | null
          internal_note?: string | null
          is_blacklisted?: boolean
          profile_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_internal_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          amount_cents: number | null
          booking_id: string
          created_at: string
          id: string
          issued_at: string | null
          number: string | null
          storage_path: string
          type: Database["public"]["Enums"]["document_type"]
          uploaded_by: string | null
        }
        Insert: {
          amount_cents?: number | null
          booking_id: string
          created_at?: string
          id?: string
          issued_at?: string | null
          number?: string | null
          storage_path: string
          type: Database["public"]["Enums"]["document_type"]
          uploaded_by?: string | null
        }
        Update: {
          amount_cents?: number | null
          booking_id?: string
          created_at?: string
          id?: string
          issued_at?: string | null
          number?: string | null
          storage_path?: string
          type?: Database["public"]["Enums"]["document_type"]
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "documents_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      email_log: {
        Row: {
          booking_id: string | null
          created_at: string
          error: string | null
          id: string
          locale: string | null
          profile_id: string | null
          recipient: string
          resend_id: string | null
          status: Database["public"]["Enums"]["email_status"]
          type: string
        }
        Insert: {
          booking_id?: string | null
          created_at?: string
          error?: string | null
          id?: string
          locale?: string | null
          profile_id?: string | null
          recipient: string
          resend_id?: string | null
          status?: Database["public"]["Enums"]["email_status"]
          type: string
        }
        Update: {
          booking_id?: string | null
          created_at?: string
          error?: string | null
          id?: string
          locale?: string | null
          profile_id?: string | null
          recipient?: string
          resend_id?: string | null
          status?: Database["public"]["Enums"]["email_status"]
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_log_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_log_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      extras: {
        Row: {
          code: string | null
          created_at: string
          description: Json
          id: string
          is_active: boolean
          is_global: boolean
          max_charge_cents: number | null
          max_quantity: number
          name: Json
          price_cents: number
          pricing_type: Database["public"]["Enums"]["extra_pricing_type"]
          sort_order: number
        }
        Insert: {
          code?: string | null
          created_at?: string
          description?: Json
          id?: string
          is_active?: boolean
          is_global?: boolean
          max_charge_cents?: number | null
          max_quantity?: number
          name: Json
          price_cents: number
          pricing_type: Database["public"]["Enums"]["extra_pricing_type"]
          sort_order?: number
        }
        Update: {
          code?: string | null
          created_at?: string
          description?: Json
          id?: string
          is_active?: boolean
          is_global?: boolean
          max_charge_cents?: number | null
          max_quantity?: number
          name?: Json
          price_cents?: number
          pricing_type?: Database["public"]["Enums"]["extra_pricing_type"]
          sort_order?: number
        }
        Relationships: []
      }
      features: {
        Row: {
          created_at: string
          group_key: Database["public"]["Enums"]["feature_group"]
          id: string
          name: Json
          sort_order: number
        }
        Insert: {
          created_at?: string
          group_key: Database["public"]["Enums"]["feature_group"]
          id?: string
          name: Json
          sort_order?: number
        }
        Update: {
          created_at?: string
          group_key?: Database["public"]["Enums"]["feature_group"]
          id?: string
          name?: Json
          sort_order?: number
        }
        Relationships: []
      }
      handover_protocols: {
        Row: {
          accessories: Json
          booking_id: string
          charge_level: number | null
          cleanliness: Json
          created_at: string
          created_by: string | null
          customer_signature_path: string | null
          fuel_level: number | null
          handover_at: string | null
          id: string
          location_id: string | null
          note: string | null
          odometer_km: number | null
          pdf_path: string | null
          signed_at: string | null
          signed_by_name: string | null
          staff_name: string | null
          staff_signature_path: string | null
          supersedes_id: string | null
          type: Database["public"]["Enums"]["protocol_type"]
          updated_at: string
          version: number
        }
        Insert: {
          accessories?: Json
          booking_id: string
          charge_level?: number | null
          cleanliness?: Json
          created_at?: string
          created_by?: string | null
          customer_signature_path?: string | null
          fuel_level?: number | null
          handover_at?: string | null
          id?: string
          location_id?: string | null
          note?: string | null
          odometer_km?: number | null
          pdf_path?: string | null
          signed_at?: string | null
          signed_by_name?: string | null
          staff_name?: string | null
          staff_signature_path?: string | null
          supersedes_id?: string | null
          type: Database["public"]["Enums"]["protocol_type"]
          updated_at?: string
          version?: number
        }
        Update: {
          accessories?: Json
          booking_id?: string
          charge_level?: number | null
          cleanliness?: Json
          created_at?: string
          created_by?: string | null
          customer_signature_path?: string | null
          fuel_level?: number | null
          handover_at?: string | null
          id?: string
          location_id?: string | null
          note?: string | null
          odometer_km?: number | null
          pdf_path?: string | null
          signed_at?: string | null
          signed_by_name?: string | null
          staff_name?: string | null
          staff_signature_path?: string | null
          supersedes_id?: string | null
          type?: Database["public"]["Enums"]["protocol_type"]
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "handover_protocols_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "handover_protocols_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "handover_protocols_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "handover_protocols_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "public_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "handover_protocols_supersedes_id_fkey"
            columns: ["supersedes_id"]
            isOneToOne: false
            referencedRelation: "handover_protocols"
            referencedColumns: ["id"]
          },
        ]
      }
      locations: {
        Row: {
          address: string
          created_at: string
          for_pickup: boolean
          for_return: boolean
          id: string
          is_active: boolean
          is_default: boolean
          latitude: number | null
          longitude: number | null
          map_url: string | null
          name: Json
          sort_order: number
          surcharge_cents: number
        }
        Insert: {
          address: string
          created_at?: string
          for_pickup?: boolean
          for_return?: boolean
          id?: string
          is_active?: boolean
          is_default?: boolean
          latitude?: number | null
          longitude?: number | null
          map_url?: string | null
          name: Json
          sort_order?: number
          surcharge_cents?: number
        }
        Update: {
          address?: string
          created_at?: string
          for_pickup?: boolean
          for_return?: boolean
          id?: string
          is_active?: boolean
          is_default?: boolean
          latitude?: number | null
          longitude?: number | null
          map_url?: string | null
          name?: Json
          sort_order?: number
          surcharge_cents?: number
        }
        Relationships: []
      }
      price_tiers: {
        Row: {
          id: string
          max_days: number | null
          min_days: number
        }
        Insert: {
          id?: string
          max_days?: number | null
          min_days: number
        }
        Update: {
          id?: string
          max_days?: number | null
          min_days?: number
        }
        Relationships: []
      }
      profiles: {
        Row: {
          anonymized_at: string | null
          billing_address: Json
          company_name: string | null
          created_at: string
          date_of_birth: string | null
          deletion_requested_at: string | null
          dic: string | null
          email: string | null
          first_name: string
          ic_dph: string | null
          ico: string | null
          id: string
          is_company: boolean
          last_name: string
          locale: string
          password_set: boolean
          phone: string | null
          type: Database["public"]["Enums"]["profile_type"]
          updated_at: string
        }
        Insert: {
          anonymized_at?: string | null
          billing_address?: Json
          company_name?: string | null
          created_at?: string
          date_of_birth?: string | null
          deletion_requested_at?: string | null
          dic?: string | null
          email?: string | null
          first_name?: string
          ic_dph?: string | null
          ico?: string | null
          id: string
          is_company?: boolean
          last_name?: string
          locale?: string
          password_set?: boolean
          phone?: string | null
          type?: Database["public"]["Enums"]["profile_type"]
          updated_at?: string
        }
        Update: {
          anonymized_at?: string | null
          billing_address?: Json
          company_name?: string | null
          created_at?: string
          date_of_birth?: string | null
          deletion_requested_at?: string | null
          dic?: string | null
          email?: string | null
          first_name?: string
          ic_dph?: string | null
          ico?: string | null
          id?: string
          is_company?: boolean
          last_name?: string
          locale?: string
          password_set?: boolean
          phone?: string | null
          type?: Database["public"]["Enums"]["profile_type"]
          updated_at?: string
        }
        Relationships: []
      }
      protocol_damages: {
        Row: {
          created_at: string
          description: string
          id: string
          is_new: boolean
          photo_path: string | null
          protocol_id: string
          view: Database["public"]["Enums"]["damage_view"]
          x: number
          y: number
        }
        Insert: {
          created_at?: string
          description?: string
          id?: string
          is_new?: boolean
          photo_path?: string | null
          protocol_id: string
          view: Database["public"]["Enums"]["damage_view"]
          x: number
          y: number
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          is_new?: boolean
          photo_path?: string | null
          protocol_id?: string
          view?: Database["public"]["Enums"]["damage_view"]
          x?: number
          y?: number
        }
        Relationships: [
          {
            foreignKeyName: "protocol_damages_protocol_id_fkey"
            columns: ["protocol_id"]
            isOneToOne: false
            referencedRelation: "handover_protocols"
            referencedColumns: ["id"]
          },
        ]
      }
      protocol_photos: {
        Row: {
          angle: string
          created_at: string
          id: string
          protocol_id: string
          storage_path: string
        }
        Insert: {
          angle: string
          created_at?: string
          id?: string
          protocol_id: string
          storage_path: string
        }
        Update: {
          angle?: string
          created_at?: string
          id?: string
          protocol_id?: string
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "protocol_photos_protocol_id_fkey"
            columns: ["protocol_id"]
            isOneToOne: false
            referencedRelation: "handover_protocols"
            referencedColumns: ["id"]
          },
        ]
      }
      rate_limits: {
        Row: {
          count: number
          key: string
          window_start: string
        }
        Insert: {
          count?: number
          key: string
          window_start: string
        }
        Update: {
          count?: number
          key?: string
          window_start?: string
        }
        Relationships: []
      }
      settings: {
        Row: {
          is_public: boolean
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          is_public?: boolean
          key: string
          updated_at?: string
          updated_by?: string | null
          value: Json
        }
        Update: {
          is_public?: boolean
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
      settlements: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          booking_id: string
          created_at: string
          damage_cents: number
          extra_km: number
          extra_km_cents: number
          fuel_cents: number
          fuel_diff: number | null
          id: string
          km_driven: number | null
          late_cents: number
          note: string | null
          other_cents: number
          total_cents: number | null
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          booking_id: string
          created_at?: string
          damage_cents?: number
          extra_km?: number
          extra_km_cents?: number
          fuel_cents?: number
          fuel_diff?: number | null
          id?: string
          km_driven?: number | null
          late_cents?: number
          note?: string | null
          other_cents?: number
          total_cents?: number | null
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          booking_id?: string
          created_at?: string
          damage_cents?: number
          extra_km?: number
          extra_km_cents?: number
          fuel_cents?: number
          fuel_diff?: number | null
          id?: string
          km_driven?: number | null
          late_cents?: number
          note?: string | null
          other_cents?: number
          total_cents?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "settlements_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "settlements_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: true
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_roles: {
        Row: {
          created_at: string
          invited_by: string | null
          is_active: boolean
          role: Database["public"]["Enums"]["staff_role"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          invited_by?: string | null
          is_active?: boolean
          role: Database["public"]["Enums"]["staff_role"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          invited_by?: string | null
          is_active?: boolean
          role?: Database["public"]["Enums"]["staff_role"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_roles_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_roles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicle_categories: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: Json
          slug: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: Json
          slug: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: Json
          slug?: string
          sort_order?: number
        }
        Relationships: []
      }
      vehicle_extras: {
        Row: {
          extra_id: string
          is_enabled: boolean
          price_override_cents: number | null
          vehicle_id: string
        }
        Insert: {
          extra_id: string
          is_enabled?: boolean
          price_override_cents?: number | null
          vehicle_id: string
        }
        Update: {
          extra_id?: string
          is_enabled?: boolean
          price_override_cents?: number | null
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vehicle_extras_extra_id_fkey"
            columns: ["extra_id"]
            isOneToOne: false
            referencedRelation: "extras"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_extras_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "public_vehicles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_extras_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicle_features: {
        Row: {
          feature_id: string
          sort_order: number
          vehicle_id: string
        }
        Insert: {
          feature_id: string
          sort_order?: number
          vehicle_id: string
        }
        Update: {
          feature_id?: string
          sort_order?: number
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vehicle_features_feature_id_fkey"
            columns: ["feature_id"]
            isOneToOne: false
            referencedRelation: "features"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_features_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "public_vehicles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_features_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicle_images: {
        Row: {
          alt: Json
          created_at: string
          height: number | null
          id: string
          is_main: boolean
          sort_order: number
          storage_path: string
          vehicle_id: string
          width: number | null
        }
        Insert: {
          alt?: Json
          created_at?: string
          height?: number | null
          id?: string
          is_main?: boolean
          sort_order?: number
          storage_path: string
          vehicle_id: string
          width?: number | null
        }
        Update: {
          alt?: Json
          created_at?: string
          height?: number | null
          id?: string
          is_main?: boolean
          sort_order?: number
          storage_path?: string
          vehicle_id?: string
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "vehicle_images_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "public_vehicles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_images_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicle_prices: {
        Row: {
          price_per_day_cents: number
          tier_id: string
          vehicle_id: string
        }
        Insert: {
          price_per_day_cents: number
          tier_id: string
          vehicle_id: string
        }
        Update: {
          price_per_day_cents?: number
          tier_id?: string
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vehicle_prices_tier_id_fkey"
            columns: ["tier_id"]
            isOneToOne: false
            referencedRelation: "price_tiers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_prices_tier_id_fkey"
            columns: ["tier_id"]
            isOneToOne: false
            referencedRelation: "public_price_tiers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_prices_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "public_vehicles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_prices_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicles: {
        Row: {
          assistance: Json | null
          brand: string
          buffer_minutes: number | null
          category_id: string
          created_at: string
          deposit_cents: number | null
          description: Json
          drivetrain: Database["public"]["Enums"]["drivetrain_type"] | null
          engine: string | null
          extra_km_cents: number | null
          for_rental: boolean
          for_transfer: boolean
          fuel: Database["public"]["Enums"]["fuel_type"]
          gears: number | null
          id: string
          is_active: boolean
          km_limit_per_day: number | null
          license_plate: string | null
          luggage: number | null
          min_driver_age: number | null
          min_license_months: number | null
          model: string
          name: string
          power_hp: number | null
          power_kw: number | null
          seats: number
          slug: string
          sort_order: number
          transmission: Database["public"]["Enums"]["transmission_type"]
          updated_at: string
          variant: string | null
          vin: string
        }
        Insert: {
          assistance?: Json | null
          brand: string
          buffer_minutes?: number | null
          category_id: string
          created_at?: string
          deposit_cents?: number | null
          description?: Json
          drivetrain?: Database["public"]["Enums"]["drivetrain_type"] | null
          engine?: string | null
          extra_km_cents?: number | null
          for_rental?: boolean
          for_transfer?: boolean
          fuel: Database["public"]["Enums"]["fuel_type"]
          gears?: number | null
          id?: string
          is_active?: boolean
          km_limit_per_day?: number | null
          license_plate?: string | null
          luggage?: number | null
          min_driver_age?: number | null
          min_license_months?: number | null
          model: string
          name: string
          power_hp?: number | null
          power_kw?: number | null
          seats: number
          slug: string
          sort_order?: number
          transmission: Database["public"]["Enums"]["transmission_type"]
          updated_at?: string
          variant?: string | null
          vin: string
        }
        Update: {
          assistance?: Json | null
          brand?: string
          buffer_minutes?: number | null
          category_id?: string
          created_at?: string
          deposit_cents?: number | null
          description?: Json
          drivetrain?: Database["public"]["Enums"]["drivetrain_type"] | null
          engine?: string | null
          extra_km_cents?: number | null
          for_rental?: boolean
          for_transfer?: boolean
          fuel?: Database["public"]["Enums"]["fuel_type"]
          gears?: number | null
          id?: string
          is_active?: boolean
          km_limit_per_day?: number | null
          license_plate?: string | null
          luggage?: number | null
          min_driver_age?: number | null
          min_license_months?: number | null
          model?: string
          name?: string
          power_hp?: number | null
          power_kw?: number | null
          seats?: number
          slug?: string
          sort_order?: number
          transmission?: Database["public"]["Enums"]["transmission_type"]
          updated_at?: string
          variant?: string | null
          vin?: string
        }
        Relationships: [
          {
            foreignKeyName: "vehicles_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "public_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicles_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "vehicle_categories"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      public_categories: {
        Row: {
          id: string | null
          name: Json | null
          slug: string | null
          sort_order: number | null
          vehicle_count: number | null
        }
        Insert: {
          id?: string | null
          name?: Json | null
          slug?: string | null
          sort_order?: number | null
          vehicle_count?: never
        }
        Update: {
          id?: string | null
          name?: Json | null
          slug?: string | null
          sort_order?: number | null
          vehicle_count?: never
        }
        Relationships: []
      }
      public_locations: {
        Row: {
          address: string | null
          for_pickup: boolean | null
          for_return: boolean | null
          id: string | null
          is_default: boolean | null
          latitude: number | null
          longitude: number | null
          map_url: string | null
          name: Json | null
          sort_order: number | null
          surcharge_cents: number | null
        }
        Insert: {
          address?: string | null
          for_pickup?: boolean | null
          for_return?: boolean | null
          id?: string | null
          is_default?: boolean | null
          latitude?: number | null
          longitude?: number | null
          map_url?: string | null
          name?: Json | null
          sort_order?: number | null
          surcharge_cents?: number | null
        }
        Update: {
          address?: string | null
          for_pickup?: boolean | null
          for_return?: boolean | null
          id?: string | null
          is_default?: boolean | null
          latitude?: number | null
          longitude?: number | null
          map_url?: string | null
          name?: Json | null
          sort_order?: number | null
          surcharge_cents?: number | null
        }
        Relationships: []
      }
      public_price_tiers: {
        Row: {
          id: string | null
          max_days: number | null
          min_days: number | null
        }
        Insert: {
          id?: string | null
          max_days?: number | null
          min_days?: number | null
        }
        Update: {
          id?: string | null
          max_days?: number | null
          min_days?: number | null
        }
        Relationships: []
      }
      public_settings: {
        Row: {
          key: string | null
          value: Json | null
        }
        Insert: {
          key?: string | null
          value?: Json | null
        }
        Update: {
          key?: string | null
          value?: Json | null
        }
        Relationships: []
      }
      public_vehicles: {
        Row: {
          assistance_phone: string | null
          brand: string | null
          category_name: Json | null
          category_slug: string | null
          deposit_cents: number | null
          description: Json | null
          drivetrain: Database["public"]["Enums"]["drivetrain_type"] | null
          engine: string | null
          extra_km_cents: number | null
          extras: Json | null
          features: Json | null
          fuel: Database["public"]["Enums"]["fuel_type"] | null
          gears: number | null
          id: string | null
          images: Json | null
          km_limit_per_day: number | null
          luggage: number | null
          min_driver_age: number | null
          min_license_months: number | null
          model: string | null
          name: string | null
          power_hp: number | null
          power_kw: number | null
          price_from_cents: number | null
          prices: Json | null
          seats: number | null
          slug: string | null
          sort_order: number | null
          transmission: Database["public"]["Enums"]["transmission_type"] | null
          updated_at: string | null
          variant: string | null
          vin: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      change_booking_status: {
        Args: {
          p_booking_id: string
          p_note?: string
          p_to_status: Database["public"]["Enums"]["booking_status"]
        }
        Returns: {
          abroad_countries: string | null
          abroad_trip: boolean
          blocked_until: string
          buffer_minutes: number
          cancellation_fee_cents: number | null
          cancellation_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          created_at: string
          created_by: Database["public"]["Enums"]["booking_creator"]
          created_by_staff_id: string | null
          customer_id: string
          customer_note: string | null
          customer_snapshot: Json
          days: number
          deposit_cents: number
          deposit_payment_method: Database["public"]["Enums"]["payment_method"]
          deposit_received_at: string | null
          deposit_received_marked_by: string | null
          deposit_return_method:
            | Database["public"]["Enums"]["payment_method"]
            | null
          deposit_return_note: string | null
          deposit_returned_at: string | null
          deposit_returned_cents: number | null
          deposit_status: Database["public"]["Enums"]["deposit_status"]
          extra_km_cents: number
          id: string
          is_individual_price: boolean
          km_limit_per_day: number
          locale: string
          number: string
          pending_change: Json | null
          pickup_at: string
          pickup_custom_address: string | null
          pickup_location_id: string
          price_override_reason: string | null
          price_snapshot: Json
          rental_paid_at: string | null
          rental_paid_marked_by: string | null
          rental_payment_method: Database["public"]["Enums"]["payment_method"]
          rental_payment_status: Database["public"]["Enums"]["rental_payment_status"]
          return_at: string
          return_custom_address: string | null
          return_location_id: string
          review_requested_at: string | null
          status: Database["public"]["Enums"]["booking_status"]
          subtotal_cents: number | null
          total_cents: number | null
          updated_at: string
          vat_rate: number
          vehicle_id: string
        }
        SetofOptions: {
          from: "*"
          to: "bookings"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      check_rate_limit: {
        Args: { p_key: string; p_max: number; p_window_seconds: number }
        Returns: boolean
      }
      consume_auth_token: {
        Args: { p_token_hash: string }
        Returns: {
          profile_id: string
          purpose: Database["public"]["Enums"]["auth_token_purpose"]
        }[]
      }
      create_booking: { Args: { p: Json }; Returns: Json }
      is_vehicle_available: {
        Args: {
          p_exclude_booking_id?: string
          p_pickup_at: string
          p_return_at: string
          p_vehicle_id: string
        }
        Returns: boolean
      }
      vehicle_availability: {
        Args: { p_from: string; p_to: string; p_vehicle_id: string }
        Returns: {
          ends_at: string
          kind: string
          starts_at: string
        }[]
      }
    }
    Enums: {
      auth_token_purpose: "set_password" | "reset_password"
      block_reason: "service" | "stk" | "private" | "other"
      booking_creator: "customer" | "staff"
      booking_status:
        | "new"
        | "confirmed"
        | "modified"
        | "active"
        | "completed"
        | "cancelled"
      consent_type:
        | "terms"
        | "gdpr"
        | "marketing"
        | "deposit"
        | "km_limit"
        | "license"
      damage_view: "top" | "left" | "right" | "front" | "rear"
      deposit_status: "pending" | "received" | "returned" | "partially_returned"
      document_type: "proforma" | "invoice" | "credit_note" | "settlement"
      drivetrain_type: "fwd" | "rwd" | "awd"
      email_status: "queued" | "sent" | "delivered" | "bounced" | "failed"
      extra_pricing_type: "per_day" | "per_rental"
      feature_group: "comfort" | "technical" | "safety" | "included"
      fuel_type: "petrol" | "diesel" | "hybrid" | "plug_in_hybrid" | "electric"
      payment_method: "transfer" | "terminal" | "cash"
      profile_type: "customer" | "staff"
      protocol_type: "pickup" | "return"
      rental_payment_status:
        | "unpaid"
        | "paid"
        | "refunded"
        | "partially_refunded"
      staff_role: "operator" | "manager" | "owner"
      transmission_type: "automatic" | "manual"
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
      auth_token_purpose: ["set_password", "reset_password"],
      block_reason: ["service", "stk", "private", "other"],
      booking_creator: ["customer", "staff"],
      booking_status: [
        "new",
        "confirmed",
        "modified",
        "active",
        "completed",
        "cancelled",
      ],
      consent_type: [
        "terms",
        "gdpr",
        "marketing",
        "deposit",
        "km_limit",
        "license",
      ],
      damage_view: ["top", "left", "right", "front", "rear"],
      deposit_status: ["pending", "received", "returned", "partially_returned"],
      document_type: ["proforma", "invoice", "credit_note", "settlement"],
      drivetrain_type: ["fwd", "rwd", "awd"],
      email_status: ["queued", "sent", "delivered", "bounced", "failed"],
      extra_pricing_type: ["per_day", "per_rental"],
      feature_group: ["comfort", "technical", "safety", "included"],
      fuel_type: ["petrol", "diesel", "hybrid", "plug_in_hybrid", "electric"],
      payment_method: ["transfer", "terminal", "cash"],
      profile_type: ["customer", "staff"],
      protocol_type: ["pickup", "return"],
      rental_payment_status: [
        "unpaid",
        "paid",
        "refunded",
        "partially_refunded",
      ],
      staff_role: ["operator", "manager", "owner"],
      transmission_type: ["automatic", "manual"],
    },
  },
} as const
