'use client';

import { useState } from 'react';
import Header from '@/components/dashboard/header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PlayCircle, Loader2 } from 'lucide-react';

export default function SarvamTestPage() {
  const [text, setText] = useState('नमस्ते, आज मैं आपकी क्या मदद कर सकता हूँ?');
  const [isLoading, setIsLoading] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  const testTTS = async () => {
    try {
      setIsLoading(true);
      setAudioUrl(null);
      const res = await fetch('/api/sarvam/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, speaker: 'shubh', targetLanguageCode: 'hi-IN' })
      });
      
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to fetch TTS');
      
      if (data.audios && data.audios.length > 0) {
        // Sarvam AI returns base64 audio in the audios array
        const audioBase64 = data.audios[0];
        setAudioUrl(`data:audio/wav;base64,${audioBase64}`);
      }
    } catch (err) {
      console.error(err);
      alert('TTS Error. Check console.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-screen overflow-hidden bg-slate-50 dark:bg-[#020617]">
      <Header title="Sarvam AI Integration" />
      <main className="flex-1 overflow-y-auto p-6 md:p-8">
        <div className="max-w-3xl mx-auto space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Text to Speech (Hindi)</CardTitle>
              <CardDescription>Test the Sarvam AI bulbul:v3 model for high-quality Indian regional voices.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-1 block">Text to Synthesize</label>
                <Textarea 
                  value={text} 
                  onChange={e => setText(e.target.value)} 
                  rows={3} 
                  className="resize-none"
                />
              </div>
              
              <Button 
                onClick={testTTS} 
                disabled={isLoading || !text}
                className="bg-emerald-600 hover:bg-emerald-500 text-white w-full sm:w-auto"
              >
                {isLoading ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Generating Audio...</>
                ) : (
                  <><PlayCircle className="w-4 h-4 mr-2" /> Generate Speech</>
                )}
              </Button>

              {audioUrl && (
                <div className="mt-6 p-4 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10">
                  <p className="text-sm font-medium mb-2 text-slate-700 dark:text-slate-300">Generated Audio</p>
                  <audio controls src={audioUrl} className="w-full" autoPlay />
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
