// Voice orchestration provider abstraction.
//
// Application code (routes, campaigns, dashboards) must only ever talk to the
// `VoiceProvider` interface below. Adding a provider means adding an adapter in
// this folder and registering it in ./index.ts — no route, UI or schema changes.

export type VoiceProviderId = 'vapi' | 'omnidimension' | 'mock';

/** A single structured section of the prompt builder. */
export interface PromptSection {
  title: string;
  body: string;
}

/**
 * Provider-neutral description of an agent. Adapters translate this into
 * whatever shape their upstream API expects.
 */
export interface VoiceAgentConfig {
  name: string;
  description?: string | null;
  /** Greeting spoken when the call connects. */
  firstMessage?: string | null;
  systemPrompt?: string | null;
  /** Structured prompt-builder sections, when the agent has them. */
  sections?: PromptSection[];

  // LLM
  llmProvider?: string | null;
  model?: string | null;
  temperature?: number | null;
  maxTokens?: number | null;

  // Text to speech
  voiceProvider?: string | null;
  voiceId?: string | null;
  language?: string | null;

  // Speech to text
  sttProvider?: string | null;
  sttModel?: string | null;

  // Call behaviour
  silenceTimeout?: number | null;
  interruptions?: boolean | null;
  transferEnabled?: boolean | null;
  transferNumber?: string | null;

  /** Where the provider should POST call events. */
  serverUrl?: string | null;
}

export interface StartCallParams {
  /** E.164 destination, e.g. +919876543210. */
  to: string;
  /** Provider-side agent id, when the agent has been synced. */
  externalAgentId?: string | null;
  /** Provider-side number id to dial from. */
  fromNumberId?: string | null;
  /** Inline config, used when the agent has no externalAgentId yet. */
  config: VoiceAgentConfig;
  /** Round-tripped back to us on every webhook for this call. */
  metadata: Record<string, unknown>;
}

/**
 * Canonical call states. Providers use their own vocabulary (Vapi: `queued`,
 * `forwarding`, `ended`; OmniDimension: `dispatched`), so adapters must map
 * onto this set — the campaign runner's concurrency and completion checks
 * depend on it.
 */
export type CallStatus =
  | 'initiated'
  | 'ringing'
  | 'in-progress'
  | 'completed'
  | 'failed';

/** States where a call still occupies a concurrency slot. */
export const IN_FLIGHT_STATUSES: CallStatus[] = ['initiated', 'ringing', 'in-progress'];

export function normaliseCallStatus(raw: string | null | undefined): CallStatus {
  const s = String(raw ?? '').toLowerCase().trim();

  if (['queued', 'dispatched', 'scheduled', 'initiated', 'created'].includes(s)) return 'initiated';
  if (['ringing', 'dialing', 'dialling'].includes(s)) return 'ringing';
  if (['in-progress', 'in_progress', 'active', 'answered', 'forwarding', 'ongoing'].includes(s)) {
    return 'in-progress';
  }
  if (['completed', 'ended', 'done', 'finished'].includes(s)) return 'completed';
  if (['failed', 'error', 'busy', 'no-answer', 'canceled', 'cancelled'].includes(s)) return 'failed';

  // Unknown state: treat as in-flight so the runner does not over-dial by
  // assuming a live call has finished.
  return 'initiated';
}

export interface StartCallResult {
  providerCallId: string;
  status: CallStatus;
}

export interface VoiceOption {
  id: string;
  name: string;
  /** Underlying TTS vendor, e.g. 11labs / cartesia / sarvam. */
  provider: string;
  language?: string;
  gender?: string;
}

/** Normalised webhook event — every adapter maps its payload onto this. */
export type VoiceWebhookEvent =
  | { kind: 'status'; callLogId: string; status: string }
  | { kind: 'transcript'; callLogId: string; transcript: string }
  | { kind: 'end-of-call'; callLogId: string; report: CallEndReport }
  | { kind: 'ignored'; callLogId?: string };

export interface CallEndReport {
  durationSec: number;
  endedReason?: string | null;
  recordingUrl?: string | null;
  /** Full turn-by-turn transcript, serialised as JSON. */
  transcriptJson?: string | null;
  summary?: string | null;
  interested: boolean;
  customerIntent?: string | null;
  nextAction?: string | null;
  objections?: string | null;
}

export interface VoiceProvider {
  readonly id: VoiceProviderId;
  readonly name: string;

  /** True when credentials are present. Never throws. */
  isConfigured(): Promise<boolean>;

  createAgent(config: VoiceAgentConfig): Promise<{ externalAgentId: string }>;
  updateAgent(externalAgentId: string, config: VoiceAgentConfig): Promise<void>;
  deleteAgent(externalAgentId: string): Promise<void>;

  startCall(params: StartCallParams): Promise<StartCallResult>;
  endCall(providerCallId: string): Promise<void>;

  listVoices(): Promise<VoiceOption[]>;

  /** Pure function: provider payload -> normalised event. */
  parseWebhook(payload: any): VoiceWebhookEvent;
}

/** Thrown by adapters so routes can map failures onto sensible HTTP codes. */
export class VoiceProviderError extends Error {
  constructor(
    message: string,
    readonly provider: string,
    readonly status: number = 502,
    readonly detail?: string
  ) {
    super(message);
    this.name = 'VoiceProviderError';
  }
}
