// Voice provider abstraction.
//
// The core architectural rule of FinBud AI: the application owns the product,
// and a "voice provider" is only the engine that executes calls. Routes,
// dashboards, the database and business logic depend ONLY on this interface —
// never on OmniDimension, LiveKit, or any concrete vendor.
//
// Swapping the engine (OmniDimension -> a custom OpenAI + Sarvam + Deepgram +
// Exotel stack) means writing one new adapter that implements VoiceProvider and
// registering it. Nothing above this layer changes.

export type ProviderId = 'omnidimension' | 'livekit' | 'mock';

/** Canonical call states. Adapters map their vendor's vocabulary onto these. */
export type CallStatus = 'initiated' | 'ringing' | 'in_progress' | 'completed' | 'failed';

/** States that still occupy a concurrency slot. */
export const IN_FLIGHT: CallStatus[] = ['initiated', 'ringing', 'in_progress'];

export function normaliseStatus(raw: string | null | undefined): CallStatus {
  const s = String(raw ?? '').toLowerCase().replace(/[\s-]/g, '_');
  if (['queued', 'dispatched', 'scheduled', 'initiated', 'created'].includes(s)) return 'initiated';
  if (['ringing', 'dialing', 'dialling'].includes(s)) return 'ringing';
  if (['in_progress', 'active', 'answered', 'forwarding', 'ongoing', 'connected'].includes(s)) return 'in_progress';
  if (['completed', 'ended', 'done', 'finished'].includes(s)) return 'completed';
  if (['failed', 'error', 'busy', 'no_answer', 'canceled', 'cancelled'].includes(s)) return 'failed';
  // Unknown -> treat as in-flight so the runner never over-dials by assuming a
  // live call has finished.
  return 'initiated';
}

/** One structured section of the prompt builder. */
export interface PromptSection {
  title: string;
  body: string;
}

/**
 * Provider-neutral description of an agent. Adapters translate this into their
 * own upstream shape. This is what the AI Agent Builder edits.
 */
export interface AgentConfig {
  name: string;
  description?: string | null;
  firstMessage?: string | null;
  systemPrompt?: string | null;
  sections?: PromptSection[];

  llmModel?: string | null;
  sttModel?: string | null;
  ttsModel?: string | null;
  voiceId?: string | null;
  language?: string | null;
  temperature?: number | null;

  transferEnabled?: boolean | null;
  transferNumber?: string | null;

  /** Hard ceiling on one call, in seconds. Guards against runaway spend. */
  maxCallSeconds?: number | null;
  /** Silence before the agent prompts and then hangs up, in seconds. */
  idleTimeoutSeconds?: number | null;

  /** Absolute URL the provider should POST call events to. */
  webhookUrl?: string | null;
}

export interface StartCallParams {
  to: string;
  /** Provider-side agent id, when the agent has been synced. */
  externalAgentId?: string | null;
  /** Provider-side number id to dial from. */
  fromNumberId?: string | null;
  config: AgentConfig;
  /** Round-tripped back to us on every event for this call. */
  metadata: Record<string, unknown>;
}

export interface StartCallResult {
  providerCallId: string;
  status: CallStatus;
  /**
   * The caller id the customer will see, when the engine reports one.
   * Optional: LiveKit resolves it inside the SIP trunk and never tells us.
   */
  fromNumber?: string | null;
}

export interface VoiceOption {
  id: string;
  name: string;
  /** Underlying TTS vendor, when known. */
  provider?: string;
  language?: string;
  gender?: string;
  previewUrl?: string;
}

export interface ModelOption {
  id: string;
  name: string;
  kind: 'llm' | 'stt' | 'tts';
}

export interface LanguageOption {
  code: string;
  name: string;
}

export interface PhoneNumberOption {
  id: string;
  number: string;
  label?: string;
  country?: string;
}

/** Normalised webhook event — every adapter maps its payload onto this. */
export type VoiceEvent =
  | { kind: 'status'; callId: string; status: CallStatus }
  | { kind: 'transcript'; callId: string; transcript: string }
  | { kind: 'end'; callId: string; report: CallReport }
  | { kind: 'ignored'; callId?: string };

/**
 * What an engine says became of one call when we ask it directly.
 *
 * `report` is present only once the call has actually ended; a call that is
 * still up reports its status and nothing else.
 */
export interface FetchedCallResult {
  status: CallStatus;
  report?: CallReport;
}

export interface CallReport {
  durationSec: number;
  endedReason?: string | null;
  recordingUrl?: string | null;
  /**
   * The line the customer saw.
   *
   * Trial accounts dial from a shared number that the dispatch response does
   * not name, so this is often only knowable afterwards, from the call log.
   */
  fromNumber?: string | null;
  transcript?: { role: string; text: string }[] | null;
  transcriptText?: string | null;
  summary?: string | null;
  interested: boolean;
  leadStatus?: string | null;
  leadScore?: number | null;
  sentiment?: string | null;
  customerIntent?: string | null;
  nextAction?: string | null;
  objections?: string | null;
}

/**
 * The one interface the whole application talks to. A provider need not support
 * every capability — see `capabilities` — but the shape is uniform, so callers
 * can feature-detect rather than special-case a vendor.
 */
export interface VoiceProvider {
  readonly id: ProviderId;
  readonly name: string;

  /** True when credentials are present. Never throws. */
  isConfigured(): Promise<boolean>;

  /** Which optional features this engine supports, for UI feature-detection. */
  capabilities(): ProviderCapabilities;

  // Agent lifecycle
  createAgent(config: AgentConfig): Promise<{ externalAgentId: string }>;
  updateAgent(externalAgentId: string, config: AgentConfig): Promise<void>;
  deleteAgent(externalAgentId: string): Promise<void>;

  // Calls
  startCall(params: StartCallParams): Promise<StartCallResult>;
  endCall(providerCallId: string): Promise<void>;

  // Discovery — loaded dynamically, never hardcoded in the UI
  listVoices(): Promise<VoiceOption[]>;
  listModels(): Promise<ModelOption[]>;
  listLanguages(): Promise<LanguageOption[]>;
  listPhoneNumbers(): Promise<PhoneNumberOption[]>;

  /** Pure function: raw provider payload -> normalised event. */
  parseWebhook(payload: any): VoiceEvent;

  /**
   * Ask the engine what became of a call, by its provider-side id.
   *
   * Optional on purpose, and the reason it exists at all: an engine that runs
   * calls on its own servers tells us the outcome by webhook, and a webhook is
   * one delivery attempt to a URL we do not control the routing of. Never
   * configured, deployment URL moved, one POST dropped — and the transcript is
   * lost to us while the vendor still holds it. Polling recovers it.
   *
   * Engines that push their own results (LiveKit's worker, the simulator) have
   * nothing to poll and simply omit this, so callers must feature-detect.
   *
   * The contract, which callers depend on to decide what to write:
   *   - call has ended         -> { status, report }
   *   - call is still up       -> { status }, no report
   *   - id the engine does not know -> null, so the row is left alone
   *   - transport failure      -> throws, so the caller can retry next pass
   */
  fetchCallResult?(providerCallId: string): Promise<FetchedCallResult | null>;
}

export interface ProviderCapabilities {
  /** Provider hosts a server-side agent we sync to (vs. inline config per call). */
  serverAgents: boolean;
  knowledgeBase: boolean;
  phoneNumbers: boolean;
  voiceCatalogue: boolean;
  /** Provider sends events by webhook (vs. we drive the lifecycle ourselves). */
  webhooks: boolean;
}

/** Thrown by adapters so routes can map failures onto sensible HTTP codes. */
export class ProviderError extends Error {
  constructor(
    message: string,
    readonly provider: string,
    readonly status = 502,
    readonly detail?: string
  ) {
    super(message);
    this.name = 'ProviderError';
  }
}

/** Flatten structured prompt sections into a single system prompt. Shared. */
export function buildSystemPrompt(config: AgentConfig): string {
  const parts: string[] = [];
  if (config.systemPrompt?.trim()) parts.push(config.systemPrompt.trim());
  for (const s of config.sections ?? []) {
    if (s.body?.trim()) parts.push(`## ${s.title}\n${s.body.trim()}`);
  }
  return parts.join('\n\n') || 'You are a helpful AI voice assistant.';
}
