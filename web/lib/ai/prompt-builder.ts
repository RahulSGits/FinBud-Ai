// AI-assisted agent authoring.
//
// Two capabilities, both backed by an LLM:
//   generateAgent  — one plain-English sentence becomes a complete, structured
//                    agent definition (OmniDimension's "describe it and go").
//   enhanceSection — rewrite a single prompt section, keeping the author's
//                    intent but making it specific and speakable.
//
// Everything returned is a draft the user reviews before saving; nothing is
// written to the database from here.
import OpenAI from 'openai';

const MODEL = process.env.PROMPT_AI_MODEL || 'gpt-4o-mini';

export class AiNotConfiguredError extends Error {
  constructor() {
    super('OPENAI_API_KEY is not configured, so AI authoring is unavailable.');
    this.name = 'AiNotConfiguredError';
  }
}

function client(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new AiNotConfiguredError();
  return new OpenAI({ apiKey });
}

export function isAiConfigured(): boolean {
  return !!process.env.OPENAI_API_KEY;
}

export interface GeneratedAgent {
  name: string;
  description: string;
  firstMessage: string;
  systemPrompt: string;
  businessContext: string;
  callObjective: string;
  qualificationRules: string;
  objectionHandling: string;
  complianceRules: string;
  closingScript: string;
}

// Voice-specific constraints are baked in here rather than left to the user:
// prompts that read well on screen usually sound wrong when spoken aloud.
const GENERATE_SYSTEM = `You design AI voice agents that make outbound phone calls for a lending company in India (Finance Buddha).

Given a short description, produce a complete agent definition as JSON with exactly these keys:

{
  "name": "short agent name, 2-4 words",
  "description": "one line describing what this agent does",
  "firstMessage": "the exact opening line spoken when the customer answers. Use {{customer_name}} where their name belongs. One or two sentences.",
  "systemPrompt": "who the agent is, its persona and tone. 3-5 sentences.",
  "businessContext": "what the company offers and any facts the agent needs. 3-6 bullet-style lines separated by newlines.",
  "callObjective": "the single measurable goal of the call, plus what a successful outcome looks like.",
  "qualificationRules": "the specific questions to ask and the criteria that make a lead qualified. Use newline-separated lines.",
  "objectionHandling": "common objections and how to respond. Format each as 'Objection -> response' on its own line.",
  "complianceRules": "regulatory and courtesy rules for Indian outbound calling, including honouring do-not-call requests immediately.",
  "closingScript": "how to close in each case: interested, not interested, and callback requested."
}

Rules:
- Everything is spoken aloud by a text-to-speech system. Write plain, natural, speakable sentences. No markdown, no bullet characters, no emoji.
- Be specific to the described use case. Never produce generic filler.
- Keep the agent honest: it must identify itself as an AI assistant if asked directly, never claim to be human, and never invent rates, offers or approvals.
- Always require that a customer asking to be removed is acknowledged politely and the call ended.
- Reply with the JSON object only, no prose or code fences.`;

const ENHANCE_SYSTEM = `You improve one section of an AI voice-agent prompt.

You will receive the section name, its current content, and context about the agent. Rewrite that section so it is specific, actionable and natural when spoken by a text-to-speech system.

Rules:
- Preserve the author's intent and any concrete facts they wrote. Never invent rates, offers, product names or legal claims.
- Prefer short, speakable sentences. No markdown, no bullet characters, no emoji.
- If the current content is empty, write a sensible first draft from the context.
- Reply with the improved section text only, with no preamble, quotes or explanation.`;

function parseJsonObject(raw: string): any {
  let text = raw.trim();
  // Models still fence JSON despite instructions not to.
  if (text.startsWith('```')) {
    text = text.replace(/^```(?:json)?/, '').replace(/```$/, '').trim();
  }
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('The AI response did not contain JSON.');
  return JSON.parse(text.slice(start, end + 1));
}

const REQUIRED_KEYS: (keyof GeneratedAgent)[] = [
  'name', 'description', 'firstMessage', 'systemPrompt', 'businessContext',
  'callObjective', 'qualificationRules', 'objectionHandling', 'complianceRules', 'closingScript',
];

/** Turn a one-line description into a full agent definition. */
export async function generateAgent(description: string): Promise<GeneratedAgent> {
  const res = await client().chat.completions.create({
    model: MODEL,
    temperature: 0.7,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: GENERATE_SYSTEM },
      { role: 'user', content: description.trim().slice(0, 2000) },
    ],
  });

  const parsed = parseJsonObject(res.choices[0]?.message?.content ?? '');

  // Never hand a half-populated object to the UI: a missing key would silently
  // save an agent with an empty section.
  const out = {} as GeneratedAgent;
  for (const key of REQUIRED_KEYS) {
    out[key] = typeof parsed[key] === 'string' ? parsed[key].trim() : '';
  }
  if (!out.name || !out.firstMessage) {
    throw new Error('The AI response was incomplete. Try rephrasing the description.');
  }
  return out;
}

export type SectionKey =
  | 'systemPrompt' | 'businessContext' | 'callObjective' | 'qualificationRules'
  | 'objectionHandling' | 'complianceRules' | 'closingScript' | 'firstMessage';

const SECTION_LABEL: Record<SectionKey, string> = {
  firstMessage: 'Opening line',
  systemPrompt: 'Agent persona and tone',
  businessContext: 'Business context',
  callObjective: 'Call objective',
  qualificationRules: 'Qualification rules',
  objectionHandling: 'Objection handling',
  complianceRules: 'Compliance rules',
  closingScript: 'Closing script',
};

/** Rewrite a single section, using the rest of the agent as context. */
export async function enhanceSection(
  section: SectionKey,
  current: string,
  context: { name?: string; description?: string; callObjective?: string }
): Promise<string> {
  const contextLines = [
    context.name && `Agent name: ${context.name}`,
    context.description && `Agent purpose: ${context.description}`,
    context.callObjective && section !== 'callObjective' && `Call objective: ${context.callObjective}`,
  ].filter(Boolean).join('\n');

  const res = await client().chat.completions.create({
    model: MODEL,
    temperature: 0.6,
    messages: [
      { role: 'system', content: ENHANCE_SYSTEM },
      {
        role: 'user',
        content: `Section: ${SECTION_LABEL[section]}\n\n${contextLines}\n\nCurrent content:\n${current.trim() || '(empty)'}`,
      },
    ],
  });

  const text = (res.choices[0]?.message?.content ?? '').trim();
  if (!text) throw new Error('The AI returned an empty result.');
  // Strip wrapping quotes a model sometimes adds around a rewritten passage.
  return text.replace(/^["']|["']$/g, '').trim();
}

/** Assemble the structured sections into the prompt the worker will use. */
export function assembleSystemPrompt(agent: Partial<GeneratedAgent>): string {
  const parts: string[] = [];
  if (agent.systemPrompt?.trim()) parts.push(agent.systemPrompt.trim());

  const sections: [string, string | undefined][] = [
    ['Business context', agent.businessContext],
    ['Call objective', agent.callObjective],
    ['Qualification rules', agent.qualificationRules],
    ['Objection handling', agent.objectionHandling],
    ['Compliance', agent.complianceRules],
    ['Closing', agent.closingScript],
  ];

  for (const [title, body] of sections) {
    if (body?.trim()) parts.push(`## ${title}\n${body.trim()}`);
  }

  return parts.join('\n\n') || 'You are a helpful AI voice assistant.';
}
