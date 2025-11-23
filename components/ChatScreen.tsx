
import React, { useState, useRef, useEffect } from 'react';
import { startChat } from '../services/geminiService';
import { Chat } from '@google/genai';

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
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const messagesEndRef = useRef(null);

  // Effect to load speech synthesis voices
  useEffect(() => {
    const synth = window.speechSynthesis;
    const loadVoices = () => {
      setVoices(synth.getVoices());
    };
    synth.onvoiceschanged = loadVoices;
    loadVoices();
    return () => {
      synth.onvoiceschanged = null;
    };
  }, []);
  
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
      window.speechSynthesis.cancel();
      recognitionRef.current?.abort();
    };
  }, []);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(scrollToBottom, [messages]);

  const speak = (text) => {
    if (!text || voices.length === 0) return;

    const synth = window.speechSynthesis;
    synth.cancel(); // Stop any previous speech

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'ko-KR';
    utterance.pitch = 0.8; 
    utterance.rate = 0.95;
    
    const koreanVoices = voices.filter(voice => voice.lang === 'ko-KR');
    let selectedVoice = null;
    if (koreanVoices.length > 0) {
      const voicePriority = ['Google 한국의', 'Yuna', 'Narae', 'Heami', 'Female', '여성'];
      for (const name of voicePriority) {
        selectedVoice = koreanVoices.find(voice => voice.name.includes(name));
        if (selectedVoice) break;
      }
      if (!selectedVoice) selectedVoice = koreanVoices[0];
    }
    if (selectedVoice) utterance.voice = selectedVoice;
    
    synth.speak(utterance);
  };

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
      const aiMessage = { sender: 'ai', text: aiResponseText };
      setMessages(prev => [...prev, aiMessage]);
      speak(aiResponseText);
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
      const aiMessage = { sender: 'ai', text: aiResponseText };
      setMessages(prev => [...prev, aiMessage]);
      speak(aiResponseText);
    } catch (error) {
      console.error("Error sending message to Gemini:", error);
      const errorMessage = { sender: 'ai', text: "죄송합니다. 오류가 발생했습니다. 다시 시도해주세요." };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  // Send directly to our genai serverless function (OpenAI proxy)
  const handleGenaiSend = async (messageToSendOverride?: string) => {
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
        body: JSON.stringify({ message: messageToSend, systemInstruction: theme?.contextPrompt || '' }),
      });
      if (!resp.ok) throw new Error(`Server error: ${resp.status}`);
      let data;
      try { data = await resp.json(); } catch (e) { const txt = await resp.text(); data = { text: txt }; }
      const aiResponseText = data.text || JSON.stringify(data);
      const aiMessage = { sender: 'ai', text: aiResponseText };
      setMessages(prev => [...prev, aiMessage]);
      speak(aiResponseText);
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
                {msg.sender === 'ai' && 
                  <img src="https://i.ibb.co/k3y12s1/hamo-avatar.png" alt="하모 아바타" className="w-10 h-10 rounded-full bg-slate-200 flex-shrink-0" />
                }
                <div className={`max-w-xs md:max-w-md lg:max-w-2xl px-5 py-3 rounded-3xl ${msg.sender === 'user' ? 'bg-[var(--primary)] text-black rounded-br-lg' : 'glass-card text-[var(--text-primary)] rounded-bl-lg shadow-sm'}`}>
                  <p className="leading-relaxed">{msg.text}</p>
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="flex items-end gap-3 justify-start">
                <img src="https://i.ibb.co/k3y12s1/hamo-avatar.png" alt="하모 아바타" className="w-10 h-10 rounded-full bg-slate-200 flex-shrink-0" />
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
        <div className="flex items-center space-x-3">
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
              className={`w-12 h-12 flex-shrink-0 rounded-full flex items-center justify-center text-white transition-all duration-300 transform hover:scale-110 ${isRecording ? 'bg-[var(--danger)] animate-pulse' : 'bg-[var(--primary)] hover:bg-[var(--primary-light)]'}`}
              aria-label={isRecording ? "녹음 중지" : "녹음 시작"}
            >
              <i className="fas fa-microphone"></i>
            </button>
          ) : (
            <button 
              onClick={() => handleGenaiSend()} 
              disabled={isLoading || isInitializing} 
              className="w-12 h-12 flex-shrink-0 bg-[var(--primary)] text-black rounded-full flex items-center justify-center hover:bg-[var(--primary-light)] disabled:bg-stone-500 transition-colors transform hover:scale-110"
              aria-label="보내기"
            >
              <i className="fas fa-paper-plane"></i>
            </button>
          )}
          {/* GenAI (OpenAI) button - now the primary action label '기본 질문' */}
          <button
            onClick={() => handleGenaiSend()}
            disabled={isLoading || isInitializing || input.trim() === ''}
            className="ml-2 px-3 py-2 rounded-full bg-white/10 text-[var(--text-secondary)] hover:bg-white/20 transition"
            aria-label="기본 질문"
          >
            기본 질문
          </button>
        </div>
      </footer>
    </div>
  );
};

export default ChatScreen;