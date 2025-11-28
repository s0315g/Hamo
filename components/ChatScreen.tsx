
import React, { useState, useRef, useEffect } from 'react';
import { startChat } from '../services/geminiService';
import { Chat } from '@google/genai';
import { AI_AVATAR_SRC } from '../constants';

// FIX: Add type definitions for the SpeechRecognition API to resolve TypeScript errors.
// This is necessary because the Web Speech API is not yet a W3C standard and may not be included in default TypeScript DOM typings.
interface SpeechRecognition extends EventTarget {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  continuous: boolean;
  onresult: (event: any) => void;
  onstart: () => void;
  onend: () => void;
  onerror: (event: any) => void;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

declare global {
  interface Window {
    SpeechRecognition: { new(): SpeechRecognition };
    webkitSpeechRecognition: { new(): SpeechRecognition };
  }
}

const ChatScreen = ({ theme, onBack }) => {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);
  const [isRecording, setIsRecording] = useState(false);
  const [chat, setChat] = useState<Chat | null>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const messagesEndRef = useRef(null);
  const streamingTimeoutsRef = useRef<number[]>([]);

  // Effect to set up Speech Recognition
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.warn("Speech recognition not supported in this browser.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'ko-KR';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      setInput(transcript);
      // Automatically send the message after transcription
      handleSend(transcript);
    };

    recognition.onstart = () => setIsRecording(true);
    recognition.onend = () => setIsRecording(false);
    recognition.onerror = (event) => {
      console.error("Speech recognition error:", event.error);
      setIsRecording(false);
    };

    recognitionRef.current = recognition;

  }, []);


  useEffect(() => {
    // Initialize chat even if `contextPrompt` is empty — show greeting and clear initializing flag.
    setIsInitializing(true);
    setMessages([]);
    const initTimeout = setTimeout(() => {
      try {
        const sys = (theme && theme.contextPrompt) ? theme.contextPrompt : '';
        setChat(startChat(sys));
      } catch (err) {
        console.warn('ChatScreen: failed to start chat wrapper', err);
        setChat(null);
      }
      setMessages([
        { sender: 'ai', text: `안녕하세요! ${theme?.title || ''}에 대해 무엇이 궁금하신가요? 제가 아는 모든 것을 알려드릴게요!` }
      ]);
      setIsInitializing(false);
    }, 500);

    return () => clearTimeout(initTimeout);
  }, [theme]);

  // Effect for cleanup on unmount
  useEffect(() => {
    return () => {
      recognitionRef.current?.abort();
      streamingTimeoutsRef.current.forEach((id) => clearTimeout(id));
      streamingTimeoutsRef.current = [];
    };
  }, []);

  const appendAiPlaceholder = () => {
    let placeholderIndex = -1;
    setMessages((prev) => {
      placeholderIndex = prev.length;
      return [...prev, { sender: 'ai', text: '' }];
    });
    return placeholderIndex;
  };


  const updateAiMessageAt = (index: number, text: string) => {
    setMessages((prev) => prev.map((msg, idx) => (idx === index ? { ...msg, text } : msg)));
  };

  const streamAiMessage = (fullText: string) => {
    const text = typeof fullText === 'string' ? fullText : String(fullText ?? '');
    if (!text) return;
    if (text.length <= 60) {
      setMessages((prev) => [...prev, { sender: 'ai', text }]);
      return;
    }

    let placeholderIndex = -1;
    setMessages((prev) => {
      placeholderIndex = prev.length;
      return [...prev, { sender: 'ai', text: '' }];
    });

    const chars = Array.from(text);
    let acc = '';
    const emit = () => {
      if (!chars.length) {
        return;
      }
      acc += chars.shift();
      setMessages((prev) => prev.map((msg, idx) => (idx === placeholderIndex ? { ...msg, text: acc } : msg)));
      if (!chars.length) {
        return;
      }
      const delay = /[\.?!]/.test(acc.slice(-1)) ? 45 : 18;
      const tid = window.setTimeout(emit, delay);
      streamingTimeoutsRef.current.push(tid);
    };

    emit();
  };

  const consumeGenaiStream = async (body: ReadableStream<Uint8Array> | null) => {
    if (!body) throw new Error('스트림이 비어 있습니다.');

    const reader = body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    let placeholderIndex: number | null = null;
    let fullText = '';

    const ensurePlaceholder = () => {
      if (placeholderIndex === null) {
        placeholderIndex = appendAiPlaceholder();
      }
      return placeholderIndex;
    };

    const processChunk = (chunk: string) => {
      const lines = chunk.split('\n');
      for (const rawLine of lines) {
        if (!rawLine.trim()) continue;
        if (!rawLine.startsWith('data:')) continue;
        const payloadStr = rawLine.replace(/^data:\s*/, '');
        if (payloadStr === '') continue;
        let payload: any;
        try {
          payload = JSON.parse(payloadStr);
        } catch (err) {
          console.warn('ChatScreen: failed to parse SSE payload', err, payloadStr);
          continue;
        }
        const eventType = payload.event || 'delta';
        if (eventType === 'start') continue;
        if (eventType === 'delta') {
          const nextText = typeof payload.fullText === 'string' && payload.fullText.length > 0
            ? payload.fullText
            : `${fullText}${payload.text || ''}`;
          if (!nextText) continue;
          fullText = nextText;
          const idx = ensurePlaceholder();
          updateAiMessageAt(idx, nextText);
        } else if (eventType === 'complete') {
          const finalText = typeof payload.text === 'string' && payload.text.length > 0 ? payload.text : fullText;
          if (finalText) {
            const idx = ensurePlaceholder();
            updateAiMessageAt(idx, finalText);
            fullText = finalText;
          }
          return true;
        } else if (eventType === 'error') {
          throw new Error(payload.message || '스트리밍 중 오류가 발생했습니다.');
        }
      }
      return false;
    };

    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const segments = buffer.split('\n\n');
        buffer = segments.pop() ?? '';
        for (const segment of segments) {
          const completed = processChunk(segment);
          if (completed) return fullText;
        }
      }
      if (buffer.trim()) {
        processChunk(buffer);
      }
      return fullText;
    } finally {
      reader.releaseLock();
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(scrollToBottom, [messages]);

  // Send via app proxy directly to backend API (useful for testing)
  const handleProxySend = async (messageToSendOverride?: string) => {
    const messageToSend = messageToSendOverride || input;
    if (messageToSend.trim() === '' || isLoading || isInitializing) return;

    const userMessage = { sender: 'user', text: messageToSend };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const url = '/.netlify/functions/backend-proxy?path=/api/chat';
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: messageToSend }),
      });
      if (!resp.ok) throw new Error(`Server error: ${resp.status}`);
      let data;
      try { data = await resp.json(); } catch (e) { const txt = await resp.text(); data = { text: txt }; }
      const aiResponseText = data.text || data.answer || JSON.stringify(data);
      streamAiMessage(aiResponseText);
    } catch (error) {
      console.error('Proxy send error:', error);
      const errorMessage = { sender: 'ai', text: "죄송합니다. 응답 중 오류가 발생했습니다." };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };


  const handleSend = async (messageToSendOverride?: string) => {
    const messageToSend = messageToSendOverride || input;
    if (messageToSend.trim() === '' || isLoading || isInitializing || !chat) return;

    const userMessage = { sender: 'user', text: messageToSend };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const response = await chat.sendMessage({ message: messageToSend });
      const aiResponseText = response.text;
      streamAiMessage(aiResponseText);
    } catch (error) {
      console.error("Error sending message to Gemini:", error);
      const errorMessage = { sender: 'ai', text: "죄송합니다. 오류가 발생했습니다. 다시 시도해주세요." };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };
  

  // Send directly to our genai serverless function (OpenAI proxy)
  const handleGenaiSend = async (messageToSendOverride?: string, options?: { forceOpenAI?: boolean }) => {
    const messageToSend = messageToSendOverride || input;
    if (messageToSend.trim() === '' || isLoading || isInitializing) return;

    const userMessage = { sender: 'user', text: messageToSend };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const url = '/.netlify/functions/genai';
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: messageToSend,
          systemInstruction: theme?.contextPrompt || '',
          stream: true,
          forceOpenAI: Boolean(options?.forceOpenAI),
        }),
      });
      if (!resp.ok) throw new Error(`Server error: ${resp.status}`);
      const contentType = resp.headers.get('content-type') || '';
      if (contentType.includes('text/event-stream')) {
        await consumeGenaiStream(resp.body);
      } else {
        let data;
        try {
          data = await resp.json();
        } catch (e) {
          const txt = await resp.text();
          data = { text: txt };
        }
        const aiResponseText = data.text || JSON.stringify(data);
        streamAiMessage(aiResponseText);
      }
    } catch (error) {
      console.error('GenAI send error:', error);
      const errorMessage = { sender: 'ai', text: "죄송합니다. 응답 중 오류가 발생했습니다." };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggleRecording = () => {
    if (isRecording) {
      recognitionRef.current?.stop();
    } else {
      recognitionRef.current?.start();
    }
  };

  return (
    <div className="flex flex-col h-screen">
      <style>{`
        @keyframes hamoFloat {
          0% { transform: rotateX(6deg) rotateY(-6deg) translateY(2px); }
          50% { transform: rotateX(9deg) rotateY(-3deg) translateY(-4px); }
          100% { transform: rotateX(6deg) rotateY(-6deg) translateY(2px); }
        }
        @keyframes hamoPulse {
          0% { opacity: 0.55; transform: scale(0.95); }
          50% { opacity: 0.9; transform: scale(1.05); }
          100% { opacity: 0.55; transform: scale(0.95); }
        }
      `}</style>
       <div id="stars" className="fixed"></div>
      <div id="stars2" className="fixed"></div>
      <div id="stars3" className="fixed"></div>
      <header className="flex items-center p-4 bg-black/30 backdrop-blur-md shadow-md z-10 shrink-0">
        <button onClick={onBack} className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] mr-4 transition-colors">
          <i className="fas fa-arrow-left text-xl"></i>
        </button>
        <h1 className="text-xl font-bold text-[var(--text-primary)]">{theme.title}: 하모에게 질문하기</h1>
      </header>
      
      <main className="flex-1 overflow-y-auto p-4 space-y-4">
        {isInitializing ? (
           <div className="flex flex-col items-center justify-center h-full">
             <div className="w-12 h-12 border-4 border-[var(--primary)] border-t-transparent rounded-full animate-spin"></div>
             <p className="mt-4 text-[var(--text-secondary)]">하모와 대화를 시작하는 중...</p>
           </div>
        ) : (
          <>
            {messages.map((msg, index) => (
              <div key={index} className={`flex items-end gap-3 ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                {msg.sender === 'ai' && (
                  <div className="relative w-16 h-16 sm:w-20 sm:h-20 flex-shrink-0" style={{ perspective: '800px' }}>
                    <div className="absolute inset-0 rounded-full bg-gradient-to-r from-cyan-300 via-indigo-300 to-pink-300 blur-2xl opacity-70 animate-[hamoPulse_3s_ease-in-out_infinite]" />
                    <div className="absolute inset-2 rounded-full bg-black/60 blur-lg" />
                    <div className="relative w-full h-full rounded-full border border-white/20 shadow-[0_12px_30px_rgba(15,23,42,0.45)] overflow-hidden" style={{ animation: 'hamoFloat 5s ease-in-out infinite' }}>
                      <img src={AI_AVATAR_SRC} alt="하모 아바타" className="w-full h-full object-cover" />
                      <div className="absolute inset-0 bg-gradient-to-br from-white/20 via-transparent to-black/40 mix-blend-screen" />
                      <div className="absolute top-2 left-2 w-4 h-4 rounded-full bg-white/70 blur-sm" />
                      <div className="absolute top-4 left-4 w-2 h-2 rounded-full bg-white/80" />
                      <div className="absolute bottom-3 right-4 w-3 h-3 rounded-full bg-white/50 blur" />
                    </div>
                  </div>
                )}
                <div className={`max-w-xs md:max-w-md lg:max-w-2xl px-5 py-3 rounded-3xl ${msg.sender === 'user' ? 'bg-[var(--primary)] text-black rounded-br-lg' : 'glass-card text-[var(--text-primary)] rounded-bl-lg shadow-sm'}`}>
                  <p className="leading-relaxed">{msg.text}</p>
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="flex items-end gap-3 justify-start">
                <img src="/videos/hamo.png" alt="하모 아바타" className="w-10 h-10 rounded-full bg-slate-200 flex-shrink-0" />
                <div className="max-w-xs md:max-w-md px-5 py-3 rounded-3xl glass-card text-[var(--text-primary)] rounded-bl-lg shadow-sm">
                  <div className="flex items-center space-x-1.5">
                    <span className="w-2.5 h-2.5 bg-stone-300 rounded-full animate-pulse delay-0"></span>
                    <span className="w-2.5 h-2.5 bg-stone-300 rounded-full animate-pulse delay-150"></span>
                    <span className="w-2.5 h-2.5 bg-stone-300 rounded-full animate-pulse delay-300"></span>
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </>
        )}
      </main>

      <footer className="p-4 bg-black/30 backdrop-blur-md border-t border-white/10">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="flex w-full items-center gap-3">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleGenaiSend()}
              placeholder={isRecording ? "듣고 있어요..." : (isInitializing ? "채팅을 준비 중입니다..." : "질문을 입력하거나 마이크를 누르세요...")}
              className="flex-1 p-3 px-5 border border-white/20 rounded-full focus:outline-none focus:ring-2 focus:ring-[var(--primary)] transition bg-transparent text-white placeholder:text-[var(--text-secondary)]"
              disabled={isLoading || isInitializing}
            />
            {input.trim() === '' ? (
              <button
                onClick={handleToggleRecording}
                disabled={isLoading || isInitializing}
                className={`min-w-[48px] min-h-[48px] w-12 h-12 flex-shrink-0 rounded-full flex items-center justify-center text-white transition-all duration-300 ${isRecording ? 'bg-[var(--danger)] animate-pulse' : 'bg-[var(--primary)] hover:bg-[var(--primary-light)]'} `}
                aria-label={isRecording ? "녹음 중지" : "녹음 시작"}
              >
                <i className="fas fa-microphone text-lg"></i>
              </button>
            ) : (
              <button
                onClick={() => handleGenaiSend()}
                disabled={isLoading || isInitializing}
                className="min-w-[48px] min-h-[48px] w-12 h-12 flex-shrink-0 bg-[var(--primary)] text-black rounded-full flex items-center justify-center hover:bg-[var(--primary-light)] disabled:bg-stone-500 transition-colors"
                aria-label="보내기"
              >
                <i className="fas fa-paper-plane text-lg"></i>
              </button>
            )}
          </div>
        </div>
      </footer>
    </div>
  );
};

export default ChatScreen;