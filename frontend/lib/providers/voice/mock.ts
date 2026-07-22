// Mock voice provider — active when USE_MOCK_DATA=true.
//
// Lets the entire product (agent builder, campaigns, call logs, analytics,
// WhatsApp automation) be exercised end to end without a single paid API key.
// It simulates a realistic call lifecycle and writes the same normalised events
// a real provider would deliver over a webhook.
import {
  CallEndReport,
  StartCallParams,
  StartCallResult,
  VoiceAgentConfig,
  VoiceOption,
  VoiceProvider,
  VoiceWebhookEvent,
  normaliseCallStatus,
} from './types';

/** Deterministic per-call outcome so repeated runs are reproducible. */
function hash(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

const OUTCOMES = [
  {
    weight: 35,
    endedReason: 'customer-ended-call',
    interested: true,
    leadStatus: 'interested',
    summary:
      'Customer expressed clear interest in a home loan of around ₹25,00,000. Asked about interest rates and processing fees. Requested a callback from a loan officer tomorrow morning.',
    intent: 'home_loan_enquiry',
    nextAction: 'schedule_callback',
    objections: null as string | null,
  },
  {
    weight: 25,
    endedReason: 'customer-ended-call',
    interested: false,
    leadStatus: 'not_interested',
    summary:
      'Customer stated they already have an ongoing loan with another lender and are not looking to refinance at this time.',
    intent: 'not_interested',
    nextAction: 'do_not_contact',
    objections: 'already_has_loan',
  },
  {
    weight: 20,
    endedReason: 'customer-did-not-answer',
    interested: false,
    leadStatus: 'no_answer',
    summary: 'No answer. Call rang out without being picked up.',
    intent: null,
    nextAction: 'retry_later',
    objections: null,
  },
  {
    weight: 12,
    endedReason: 'customer-ended-call',
    interested: true,
    leadStatus: 'callback_requested',
    summary:
      'Customer was driving and asked to be called back in the evening. Showed initial interest in a personal loan.',
    intent: 'personal_loan_enquiry',
    nextAction: 'schedule_callback',
    objections: 'bad_timing',
  },
  {
    weight: 8,
    endedReason: 'voicemail',
    interested: false,
    leadStatus: 'voicemail',
    summary: 'Reached voicemail. Left a short message with a callback number.',
    intent: null,
    nextAction: 'retry_later',
    objections: null,
  },
];

function pickOutcome(seed: string) {
  const total = OUTCOMES.reduce((sum, o) => sum + o.weight, 0);
  let n = hash(seed) % total;
  for (const outcome of OUTCOMES) {
    if (n < outcome.weight) return outcome;
    n -= outcome.weight;
  }
  return OUTCOMES[0];
}

function buildTranscript(config: VoiceAgentConfig, outcome: ReturnType<typeof pickOutcome>) {
  const greeting = config.firstMessage || 'Hello! Am I speaking with the account holder?';

  if (outcome.leadStatus === 'no_answer' || outcome.leadStatus === 'voicemail') {
    return [{ role: 'assistant', message: greeting }];
  }

  const replies: Record<string, string[]> = {
    interested: [
      'Yes, speaking.',
      "I've been thinking about a home loan actually. What rates do you offer?",
      'That sounds reasonable. Can someone call me tomorrow morning to discuss?',
    ],
    not_interested: [
      'Yes, who is this?',
      'I already have a loan running with another bank.',
      "No, I'm not looking to switch. Please remove my number.",
    ],
    callback_requested: [
      'Yes, but I’m driving right now.',
      'Can you call me back in the evening?',
      'Around 7pm works. Thanks.',
    ],
  };

  const customerLines = replies[outcome.leadStatus] || replies.interested;
  const agentLines = [
    greeting,
    'I’m calling from Finance Buddha about loan options you may be eligible for.',
    'Understood — I’ll make a note of that. Thank you for your time!',
  ];

  const turns: { role: string; message: string }[] = [];
  for (let i = 0; i < agentLines.length; i++) {
    turns.push({ role: 'assistant', message: agentLines[i] });
    if (customerLines[i]) turns.push({ role: 'user', message: customerLines[i] });
  }
  return turns;
}

export class MockVoiceProvider implements VoiceProvider {
  readonly id = 'mock' as const;
  readonly name = 'Mock (no external calls)';

  async isConfigured(): Promise<boolean> {
    return true;
  }

  async createAgent(config: VoiceAgentConfig): Promise<{ externalAgentId: string }> {
    return { externalAgentId: `mock_agent_${hash(config.name + Date.now())}` };
  }

  async updateAgent(): Promise<void> {}

  async deleteAgent(): Promise<void> {}

  async startCall(params: StartCallParams): Promise<StartCallResult> {
    const callLogId = String(params.metadata.callLogId || '');
    const providerCallId = `mock_call_${hash(callLogId + params.to)}`;

    if (callLogId) {
      // Drive the lifecycle in the background so the caller returns immediately,
      // exactly as a real provider webhook would behave.
      void this.simulate(callLogId, params);
    }

    return { providerCallId, status: 'ringing' as const };
  }

  private async simulate(callLogId: string, params: StartCallParams): Promise<void> {
    const { applyVoiceEvent } = await import('./events');
    const outcome = pickOutcome(callLogId);
    const answered = outcome.leadStatus !== 'no_answer';

    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

    try {
      await sleep(600);
      await applyVoiceEvent({ kind: 'status', callLogId, status: 'ringing' });

      if (answered) {
        await sleep(900);
        await applyVoiceEvent({ kind: 'status', callLogId, status: 'in-progress' });
      }

      const turns = buildTranscript(params.config, outcome);
      await sleep(700);
      await applyVoiceEvent({
        kind: 'transcript',
        callLogId,
        transcript: turns.map((t) => `${t.role === 'user' ? 'Customer' : 'Agent'}: ${t.message}`).join('\n'),
      });

      const durationSec = answered ? 45 + (hash(callLogId) % 180) : 0;
      const report: CallEndReport = {
        durationSec,
        endedReason: outcome.endedReason,
        recordingUrl: answered ? '/sample-call.mp3' : null,
        transcriptJson: JSON.stringify(turns),
        summary: outcome.summary,
        interested: outcome.interested,
        customerIntent: outcome.intent,
        nextAction: outcome.nextAction,
        objections: outcome.objections,
      };

      await sleep(800);
      await applyVoiceEvent({ kind: 'end-of-call', callLogId, report });
    } catch (err) {
      console.error('[mock voice] simulation failed', err);
    }
  }

  async endCall(): Promise<void> {}

  async listVoices(): Promise<VoiceOption[]> {
    return [
      { id: 'priya', name: 'Priya (Hindi)', provider: 'mock', language: 'hi', gender: 'female' },
      { id: 'arjun', name: 'Arjun (Hindi)', provider: 'mock', language: 'hi', gender: 'male' },
      { id: 'rachel', name: 'Rachel (English)', provider: 'mock', language: 'en', gender: 'female' },
      { id: 'burt', name: 'Burt (English)', provider: 'mock', language: 'en', gender: 'male' },
    ];
  }

  parseWebhook(payload: any): VoiceWebhookEvent {
    const callLogId = payload?.callLogId;
    if (!callLogId) return { kind: 'ignored' };
    return { kind: 'status', callLogId, status: normaliseCallStatus(payload.status || 'completed') };
  }
}
