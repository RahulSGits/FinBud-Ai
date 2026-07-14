// Base Interfaces for the Provider Architecture

export interface ProviderResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  provider_id: string;
  latency_ms?: number;
}

export interface STTProvider {
  id: string;
  name: string;
  transcribe(audioBuffer: Buffer, language: string): Promise<ProviderResponse<string>>;
  transcribeStream?(audioStream: AsyncIterable<Buffer>, language: string): AsyncIterable<string>;
}

export interface TTSProvider {
  id: string;
  name: string;
  speak(text: string, voiceId: string, language: string): Promise<ProviderResponse<Buffer>>;
  speakStream?(text: string, voiceId: string, language: string): AsyncIterable<Buffer>;
}

export interface LLMProvider {
  id: string;
  name: string;
  generate(prompt: string, context: string, history: any[]): Promise<ProviderResponse<string>>;
  generateStream?(prompt: string, context: string, history: any[]): AsyncIterable<string>;
}

export interface TelephonyProvider {
  id: string;
  name: string;
  makeCall(to: string, from: string, webhookUrl: string): Promise<ProviderResponse<{ callId: string }>>;
  sendSMS?(to: string, from: string, body: string): Promise<ProviderResponse<{ messageId: string }>>;
}

// Registry to hold instantiated providers
export class ProviderRegistry {
  private stt: Map<string, STTProvider> = new Map();
  private tts: Map<string, TTSProvider> = new Map();
  private llm: Map<string, LLMProvider> = new Map();
  private telephony: Map<string, TelephonyProvider> = new Map();

  registerSTT(provider: STTProvider) { this.stt.set(provider.id, provider); }
  registerTTS(provider: TTSProvider) { this.tts.set(provider.id, provider); }
  registerLLM(provider: LLMProvider) { this.llm.set(provider.id, provider); }
  registerTelephony(provider: TelephonyProvider) { this.telephony.set(provider.id, provider); }

  getSTT(id: string): STTProvider {
    const p = this.stt.get(id);
    if (!p) throw new Error(`STT Provider ${id} not found`);
    return p;
  }

  getTTS(id: string): TTSProvider {
    const p = this.tts.get(id);
    if (!p) throw new Error(`TTS Provider ${id} not found`);
    return p;
  }

  getLLM(id: string): LLMProvider {
    const p = this.llm.get(id);
    if (!p) throw new Error(`LLM Provider ${id} not found`);
    return p;
  }

  getTelephony(id: string): TelephonyProvider {
    const p = this.telephony.get(id);
    if (!p) throw new Error(`Telephony Provider ${id} not found`);
    return p;
  }
}

export const registry = new ProviderRegistry();
