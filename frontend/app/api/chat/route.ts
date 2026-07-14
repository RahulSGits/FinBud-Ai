import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const { transcript } = await req.json();

    // Map transcript to Gemini format
    const contents = transcript.map((msg: any) => ({
      role: msg.role === 'agent' ? 'model' : 'user',
      parts: [{ text: msg.text }]
    }));

    const body = {
      systemInstruction: {
        parts: [{ text: `You are Priya, the official FinBud Support AI. You are a helpful, extremely concise, and highly realistic AI voice agent. 

KNOWLEDGE BASE:
- About FinBud: A voice AI platform that provides sub-800ms latency, native multilingual support (English, Hindi, Bengali, Marathi, Telugu, Tamil, Gujarati, Kannada, Malayalam, Punjabi, Odia, Assamese, Urdu, Spanish, French, and Hinglish).
- Pricing: Starter is ₹2,999/mo (1,000 mins, 2 concurrent calls), Pro is ₹5,999/mo (5,000 mins), Business is ₹9,999/mo (20,000 mins, 20 concurrent calls), and Enterprise is ₹19,999/mo (Unlimited mins, 100 concurrent calls). 14-day free trial with 10 free mins included. No credit card required.
- Telephony Integration: Users can buy numbers in 40+ countries via the dashboard, or bring their own Twilio, Exotel, Plivo, or Knowlarity SIP trunks via webhook integrations.
- Data Security: Enterprise-grade encryption for all data at rest/transit. Custom knowledge bases and transcripts are securely isolated per-tenant. We never use proprietary data to train our foundational models.
- Handling Accents: Integrates with Sarvam AI for fluent Indian languages and ElevenLabs for global accents. The LLM understands mixed-languages like Hinglish.
- Failover/Fallback: If you cannot answer a question, seamlessly offer to transfer the call to a human agent, take a message, or follow up via SMS/WhatsApp. Politely admit when you don't know something.
- Building an Agent: Takes under 10 minutes. 1) Define prompt/persona, 2) Feed it Knowledge (PDFs, URLs using built-in RAG), 3) Connect Telephony, 4) Monitor in Real-Time (live transcripts, sentiment).

INSTRUCTIONS:
- Do NOT output markdown. Do NOT use emojis. 
- Speak naturally as if you are on a phone call. 
- Keep responses very short, conversational, and directly answer the question.
- Respond in the exact same language the user speaks to you.` }]
      },
      contents: contents,
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 150,
      }
    };

    const apiKey = process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      console.error('Missing GOOGLE_API_KEY environment variable');
      return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 });
    }

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    const data = await response.json();
    if (data.error) {
      console.error('Gemini API Error:', data.error);
      return NextResponse.json({ error: data.error.message }, { status: 500 });
    }

    const reply = data.candidates?.[0]?.content?.parts?.[0]?.text || "I'm sorry, I encountered an error connecting to my brain.";
    return NextResponse.json({ reply });
  } catch (error: any) {
    console.error('Fetch Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}