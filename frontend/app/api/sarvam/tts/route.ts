import { NextResponse } from 'next/server';
import { SarvamAIClient } from 'sarvamai';

export async function POST(req: Request) {
  try {
    const { text, speaker = 'shubh', targetLanguageCode = 'hi-IN' } = await req.json();
    
    if (!text) {
      return NextResponse.json({ error: 'Text is required' }, { status: 400 });
    }

    const client = new SarvamAIClient({
      apiSubscriptionKey: process.env.SARVAM_API_KEY || 'YOUR_SARVAM_API_KEY',
    });

    // In JS SDK, text_to_speech might be textToSpeech
    const response = await (client as any).textToSpeech.convert({
      model: 'bulbul:v3',
      text,
      targetLanguageCode,
      speaker,
    });

    return NextResponse.json(response);
  } catch (error: any) {
    console.error('Sarvam TTS Error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
