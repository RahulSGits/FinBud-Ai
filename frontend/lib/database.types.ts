// FinBud AI — Database type definitions
// These mirror the InsForge PostgreSQL schema

export type UserRole = 'admin' | 'user' | 'team_member';
export type PlanTier = 'free_trial' | 'starter' | 'pro' | 'business' | 'enterprise';
export type SubscriptionStatus = 'active' | 'trialing' | 'past_due' | 'canceled' | 'expired';
export type CallStatus = 'initiated' | 'ringing' | 'in_progress' | 'completed' | 'failed' | 'no_answer' | 'busy' | 'voicemail';
export type CallOutcome = 'interested' | 'not_interested' | 'callback' | 'no_answer' | 'voicemail' | 'completed' | 'failed';
export type AgentStatus = 'draft' | 'active' | 'paused' | 'archived';
export type KnowledgeSourceType = 'url' | 'pdf' | 'faq' | 'text' | 'website';
export type ProviderCategory = 'stt' | 'tts' | 'llm' | 'telephony';
export type CreditAction = 'debit' | 'credit' | 'refund' | 'gift' | 'trial' | 'purchase';
export type AuditAction = 'login' | 'logout' | 'signup' | 'agent_create' | 'agent_update' | 'agent_delete' | 'call_initiated' | 'subscription_change' | 'credit_change' | 'provider_update' | 'user_suspended' | 'user_deleted' | 'plan_created' | 'plan_updated';

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  created_at: string;
  updated_at: string;
  company?: string | null;
  status: string;
  plan_tier: string;
  is_trial: boolean;
  credits: number;
  total_calls: number;
  avatar_url?: string | null;
  phone?: string | null;
  is_suspended?: boolean;
}

export interface Organization {
  id: string;
  name: string;
  website: string | null;
  industry: string | null;
  logo_url: string | null;
  created_at: string;
}

export interface OrgMember {
  id: string;
  org_id: string;
  user_id: string;
  role: 'owner' | 'admin' | 'member';
  created_at: string;
}

export interface Plan {
  id: string;
  name: string;
  tier: PlanTier;
  price_monthly: number;
  price_yearly: number;
  call_minutes: number;
  max_agents: number;
  max_concurrent_calls: number;
  features: string[];
  is_active: boolean;
  created_at: string;
}

export interface Subscription {
  id: string;
  org_id: string;
  plan_id: string;
  status: SubscriptionStatus;
  trial_ends_at: string | null;
  current_period_start: string;
  current_period_end: string;
  created_at: string;
}

export interface Credits {
  id: string;
  org_id: string;
  balance: number;
  lifetime_used: number;
  updated_at: string;
}

export interface CreditTransaction {
  id: string;
  org_id: string;
  action: CreditAction;
  amount: number;
  description: string;
  performed_by: string | null;
  created_at: string;
}

export interface Agent {
  id: string;
  org_id: string;
  created_by: string;
  name: string;
  industry: string;
  system_prompt: string;
  greeting_message: string;
  voice_id: string | null;
  voice_provider: string | null;
  language: string;
  telephony_provider: string | null;
  caller_id: string | null;
  status: AgentStatus;
  total_calls: number;
  total_minutes: number;
  created_at: string;
  updated_at: string;
}

export interface AgentKnowledge {
  id: string;
  agent_id: string;
  source_type: KnowledgeSourceType;
  title: string;
  content: string | null;
  url: string | null;
  storage_path: string | null;
  created_at: string;
}

export interface CallLog {
  id: string;
  org_id: string;
  agent_id: string;
  user_id: string;
  phone_number: string;
  direction: 'inbound' | 'outbound';
  status: CallStatus;
  outcome: CallOutcome | null;
  duration: number;
  cost: number;
  provider_used: string | null;
  provider_call_id: string | null;
  started_at: string;
  ended_at: string | null;
  created_at: string;
}

export interface CallRecording {
  id: string;
  call_id: string;
  recording_url: string;
  storage_path: string;
  duration: number;
  file_size: number;
  created_at: string;
}

export interface CallTranscript {
  id: string;
  call_id: string;
  transcript: Record<string, unknown>[];
  summary: string | null;
  sentiment: string | null;
  created_at: string;
}

export interface MessageLog {
  id: string;
  org_id: string;
  agent_id: string | null;
  recipient: string;
  message_type: 'sms' | 'whatsapp' | 'email';
  content: string;
  status: 'sent' | 'delivered' | 'failed' | 'pending';
  cost: number;
  created_at: string;
}

export interface ApiProvider {
  id: string;
  name: string;
  slug: string;
  category: ProviderCategory;
  description: string;
  logo_url: string | null;
  is_system: boolean;
  created_at: string;
}

export interface ProviderConfig {
  id: string;
  org_id: string | null;
  provider_id: string;
  api_key: string;
  api_secret: string | null;
  webhook_url: string | null;
  extra_config: Record<string, unknown> | null;
  is_active: boolean;
  created_at: string;
}

export interface AuditLog {
  id: string;
  user_id: string | null;
  action: AuditAction;
  target_type: string | null;
  target_id: string | null;
  metadata: Record<string, unknown> | null;
  ip_address: string | null;
  created_at: string;
}

export interface Invoice {
  id: string;
  org_id: string;
  amount: number;
  currency: string;
  status: 'draft' | 'paid' | 'failed' | 'refunded';
  description: string;
  period_start: string;
  period_end: string;
  created_at: string;
}

export interface Notification {
  id: string;
  user_id: string;
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  is_read: boolean;
  created_at: string;
}
