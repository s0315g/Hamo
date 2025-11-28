
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { getItems, getQuizzes } from '../services/dbService';
import { Screen } from '../types';

const extractVideoUrl = (candidate: any): string | null => {
  if (!candidate) return null;
  if (typeof candidate === 'string') {
    const trimmed = candidate.trim();
    return trimmed.length ? trimmed : null;
  }
  if (typeof candidate === 'object') {
    const direct = candidate.video || candidate.videoUrl || candidate.video_url || candidate.url || candidate.src || candidate.file || candidate.path;
    if (typeof direct === 'string' && direct.trim()) return direct.trim();
    if (candidate.media) {
      const mediaVal = typeof candidate.media === 'string'
        ? candidate.media
        : candidate.media.video || candidate.media.url || candidate.media.src;
      if (typeof mediaVal === 'string' && mediaVal.trim()) return mediaVal.trim();
    }
  }
  return null;
};

// Minimap Popup Component
const MinimapPopup = ({ spots, activeSpot, onSelectSpot, onClose }) => {
  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 animate-fade-in backdrop-blur-sm"
      onClick={handleBackdropClick}
      aria-modal="true"
      role="dialog"
    >
      <div className="glass-card rounded-3xl shadow-2xl p-6 w-full max-w-sm m-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-bold text-[var(--text-primary)]">미니맵</h2>
          <button onClick={onClose} className="text-stone-400 hover:text-[var(--text-primary)] text-3xl leading-none" aria-label="닫기">
            &times;
          </button>
        </div>
        <div className="p-4 bg-black/20 rounded-2xl max-h-64 overflow-y-auto">
            <div className="grid grid-cols-5 gap-y-8 items-center">
            {spots.map((_, index) => {
                const isCompleted = index < activeSpot;
                const isActive = index === activeSpot;
                const isLastItemInRow = (index + 1) % 5 === 0;
                const isLastItemOverall = index === spots.length - 1;

                return (
                    <div key={index} className="relative flex justify-center">
                    {/* Connector line to the next spot */}
                    {!isLastItemInRow && !isLastItemOverall && (
                        <div
                        className={`absolute left-1/2 top-1/2 -translate-y-1/2 w-full h-1.5 z-0 transition-colors duration-500
                            ${isCompleted ? 'bg-[var(--accent)]' : 'bg-white/20'}`}
                        ></div>
                    )}
                    
                    <button
                        key={index}
                        onClick={() => onSelectSpot(index)}
                        className="relative z-10 w-10 h-10 rounded-full flex items-center justify-center bg-transparent transition-all duration-300 transform hover:scale-110 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[var(--primary)]"
                        aria-label={`Spot ${index + 1}로 이동`}
                    >
                        <div className={`w-5 h-5 rounded-full transition-all duration-300
                            ${ isActive
                                ? 'bg-[var(--danger)] shadow-lg ring-4 ring-red-200/50 transform scale-125'
                                : isCompleted
                                    ? 'bg-[var(--accent)]'
                                    : 'bg-transparent border-2 border-white/50'
                            }`}>
                        </div>
                    </button>
                    </div>
                );
            })}
            </div>
        </div>
      </div>
    </div>
  );
};


const DocentScreen = ({ theme, age, onNavigate, onBack }) => {
  const [activeSpot, setActiveSpot] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isTourCompleted, setIsTourCompleted] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [isMinimapOpen, setIsMinimapOpen] = useState(false);
  // Keep course panel closed on entry by default
  const [isCourseOpen, setIsCourseOpen] = useState(false);
  const [progresses, setProgresses] = useState<number[]>([]);
  const [isIntroOpen, setIsIntroOpen] = useState(false);
  const [isTextVisible, setIsTextVisible] = useState(false);
  const [items, setItems] = useState<any[]>([]);
  const [quizzes, setQuizzes] = useState<any[]>([]);
  const [fullScriptItem, setFullScriptItem] = useState<any | null>(null);
  // Client-side per-item video overrides (stored in localStorage)
  const [itemVideoOverrides, setItemVideoOverrides] = useState<Record<string,string>>(() => {
    try {
      const raw = localStorage.getItem('itemVideoOverrides');
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      return {};
    }
  });
  const [showInitialLoading, setShowInitialLoading] = useState(true);

  const saveItemVideoOverride = (itemId: string, url: string | null) => {
    try {
      const next = { ...(itemVideoOverrides || {}) } as Record<string,string>;
      if (url) next[itemId] = url;
      else delete next[itemId];
      setItemVideoOverrides(next);
      localStorage.setItem('itemVideoOverrides', JSON.stringify(next));
    } catch (e) {
      console.warn('Failed to save item video override', e);
    }
  };

  // Helper: convert escaped newline sequences ("\\n") into real newlines
  const unescapeText = (s: any) => {
    if (s == null) return '';
    try {
      return String(s).replace(/\\r\\n/g, '\n').replace(/\\r/g, '\n').replace(/\\n/g, '\n');
    } catch (e) {
      return String(s);
    }
  };

  // Build content spots: prefer item-level scripts when items exist, otherwise use theme longDescription
  const descriptionSpots = useMemo(() => {
    if (items && items.length > 0) {
      return items.map((it) => {
        const scriptChild = it.script_child || it.scriptChild || it.raw?.script_child || '';
        const scriptGeneral = it.script_general || it.scriptGeneral || it.raw?.script_general || '';
        const chosen = age === 'child' ? (scriptChild || scriptGeneral) : (scriptGeneral || scriptChild);
        // Unescape any escaped newline sequences so UI shows real line breaks
        const normalized = unescapeText(chosen || it.item_desc || '');
        return normalized.toString().trim();
      }).map(s => s || '(설명 없음)');
    }
    return theme.longDescription.split('\n').filter(p => p.trim() !== '');
  }, [theme.longDescription, items, age]);

  // Titles for each spot (item name when items exist, otherwise theme title)
  const descriptionTitles = useMemo(() => {
    if (items && items.length > 0) return items.map(it => it.item_name || it.name || it.title || it.raw?.item_name || '무명 코스');
    return theme.longDescription.split('\n').map((_,i)=> `${theme.title} ${i+1}`);
  }, [items, theme]);
  
  const sectionVideoPlaylist = useMemo(() => {
    const collected = new Set<string>();
    const pushCandidate = (value: any) => {
      const url = extractVideoUrl(value);
      if (url) collected.add(url);
    };
    const fromArray = (maybeArr: any) => {
      if (Array.isArray(maybeArr)) maybeArr.forEach(pushCandidate);
    };

    fromArray((theme as any)?.sectionVideos);
    fromArray((theme as any)?.videos);
    fromArray((theme as any)?.videoList);
    fromArray(theme?.raw?.sectionVideos);
    fromArray(theme?.raw?.section_videos);
    fromArray(theme?.raw?.videos);
    fromArray(theme?.raw?.videoList);

    const themedSections = (theme as any)?.sections || theme?.raw?.sections || theme?.raw?.sliderSections || theme?.raw?.slides;
    if (Array.isArray(themedSections)) {
      themedSections.forEach((section: any) => {
        pushCandidate(section);
        pushCandidate(section?.video || section?.videoUrl || section?.video_url);
        pushCandidate(section?.media || section?.media_url);
        fromArray(section?.videos || section?.videoList);
      });
    }

    if (Array.isArray(items)) {
      items.forEach((item) => {
        fromArray(item?.sectionVideos || item?.section_videos || item?.videoList || item?.videos);
      });
    }

    return Array.from(collected);
  }, [items, theme]);
  
  const videoSources = {
    imjin_war: '/videos/hamowar_start_video.mp4',
    jinju_museum: '/videos/hamowar_start_video.mp4',
    gonryongpo: '/videos/hamowar_start_video.mp4'
  };
  const themeVideo = videoSources[theme.id] || videoSources['jinju_museum'];

  let itemVideo: string | null = null;
  try {
    const it = items && items.length > 0 ? items[activeSpot] : null;
    if (it) {
      // First check client-side overrides (localStorage)
      const id = it.item_id || it.itemId || it.id || `itm_${activeSpot}`;
      if (id && itemVideoOverrides && itemVideoOverrides[id]) {
        itemVideo = itemVideoOverrides[id];
      }
      // If no override, use backend-provided fields
      if (!itemVideo) {
        itemVideo = it.video || it.video_src || it.videoUrl || it.src || it.file || null;
        if (!itemVideo && it.media) itemVideo = it.media.video || it.media.url || null;
        if (!itemVideo && it.raw) itemVideo = it.raw.video || it.raw.video_src || it.raw.media?.video || it.raw.media_url || null;
      }
      // Normalize empty-string to null
      if (itemVideo === '') itemVideo = null;
    }
  } catch (e) {
    itemVideo = null;
  }

  // Default special-case: for the Imjin War theme, prefer specific intro videos
  // for the first and second spots unless a client override is present.
  const introVideo = '/videos/hamoIntroduce.mp4';
  const courseVideo = themeVideo;
  let videoSrc = itemVideo;

  if (!videoSrc && sectionVideoPlaylist.length > 0) {
    const loopIndex = activeSpot % sectionVideoPlaylist.length;
    videoSrc = sectionVideoPlaylist[loopIndex];
  }

  if (!videoSrc) {
    videoSrc = activeSpot === 0 ? introVideo : courseVideo;
  }

  useEffect(() => {
    setProgresses(new Array(descriptionSpots.length).fill(0));
  }, [descriptionSpots.length]);

  useEffect(() => {
    const synth = window.speechSynthesis;
    const handleBeforeUnload = () => {
      synth.cancel();
    };
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      synth.cancel();
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, []);

  // Show a quick one-time loading modal on first mount
  useEffect(() => {
    const timer = setTimeout(() => setShowInitialLoading(false), 1400);
    return () => clearTimeout(timer);
  }, []);

  // Load items and quizzes for preview
  useEffect(() => {
    let mounted = true;
    if (!theme?.id) return;
    (async () => {
      try {
        const fetchedItems = await getItems(theme.id);
        if (mounted) setItems(Array.isArray(fetchedItems) ? fetchedItems : []);
        // Dev-only probe: log first item's full object and scripts to help debug multiline scripts
        try {
          if ((import.meta as any).env?.DEV) {
            const first = Array.isArray(fetchedItems) && fetchedItems.length > 0 ? fetchedItems[0] : fetchedItems;
            console.log('DEV PROBE: first fetched item (full):', first);
            console.log('DEV PROBE: script_child:', first?.script_child || first?.scriptChild || first?.raw?.script_child);
            console.log('DEV PROBE: script_general:', first?.script_general || first?.scriptGeneral || first?.raw?.script_general);
          }
        } catch (probeErr) {
          console.warn('DEV PROBE: failed to log item scripts', probeErr);
        }
      } catch (e) {
        console.warn('Failed to load items for theme', theme.id, e);
        if (mounted) setItems([]);
      }
      try {
        const fetchedQuizzes = await getQuizzes(theme.id);
        if (mounted) setQuizzes(Array.isArray(fetchedQuizzes) ? fetchedQuizzes : []);
      } catch (e) {
        console.warn('Failed to load quizzes for theme', theme.id, e);
        if (mounted) setQuizzes([]);
      }
    })();
    return () => { mounted = false; };
  }, [theme?.id]);

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
  
  const updateProgress = (index, value) => {
    setProgresses(prev => {
        const newProgresses = [...prev];
        if (newProgresses[index] !== undefined) {
            newProgresses[index] = value;
        }
        return newProgresses;
    });
  };

  // Refs for smooth progress animation during speech
  const rafRef = useRef<number | null>(null);
  const animStartRef = useRef<number | null>(null);
  const animDurationRef = useRef<number>(0);
  // Keep reference to the active utterance so we can pause/resume instead of cancelling
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  // track speak attempts for a simple one-time retry if speech never starts
  const speakAttemptsRef = useRef<number>(0);
  const cancelProgressAnimation = () => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    animStartRef.current = null;
    animDurationRef.current = 0;
  };

  useEffect(() => {
    const synth = window.speechSynthesis;
    const textToSpeak = descriptionSpots[activeSpot];
    if (!textToSpeak) {
      // nothing to speak
      return;
    }

    const startNewUtterance = () => {
      console.debug('[Docent] startNewUtterance() attempt=', speakAttemptsRef.current + 1, 'activeSpot=', activeSpot);
      // cancel any existing speech and create a fresh utterance
      synth.cancel();
      cancelProgressAnimation();

      const utterance = new SpeechSynthesisUtterance(textToSpeak);
      utterance.lang = 'ko-KR';
      utterance.rate = 1; 
      utterance.pitch = 0.8; 
      utterance.volume = 1;

      const koreanVoices = voices.filter(voice => voice.lang === 'ko-KR');
      let selectedVoice = null as any;
      if (koreanVoices.length > 0) {
        const voicePriority = ['Google 한국의', 'Yuna', 'Narae', 'Heami', 'Female', '여성'];
        for (const name of voicePriority) {
          selectedVoice = koreanVoices.find(voice => voice.name.includes(name));
          if (selectedVoice) break;
        }
        if (!selectedVoice) selectedVoice = koreanVoices[0];
      }
      if (selectedVoice) utterance.voice = selectedVoice;

      utterance.onstart = () => {
        console.debug('[Docent] utterance.onstart fired for spot', activeSpot);
        updateProgress(activeSpot, 0);
        cancelProgressAnimation();
        animStartRef.current = performance.now();
        const baseCharMs = 150;
        const rateFactor = utterance.rate && typeof utterance.rate === 'number' ? utterance.rate : 1.0;
        const est = Math.max(800, Math.floor((textToSpeak.length * baseCharMs) / Math.max(0.1, rateFactor)));
        animDurationRef.current = est;

        const step = (ts: number) => {
          if (animStartRef.current == null) return;
          const elapsed = ts - animStartRef.current;
          const pct = Math.min(99, (elapsed / animDurationRef.current) * 100);
          updateProgress(activeSpot, Math.max(0, Math.floor(pct)));
          rafRef.current = requestAnimationFrame(step);
        };
        rafRef.current = requestAnimationFrame(step);
      };

      utterance.onboundary = (event) => {
        try {
          const relIndex = typeof event.charIndex === 'number' ? event.charIndex : 0;
          const absolute = Math.min(textToSpeak.length, relIndex + (event.charLength || 0));
          const progress = (absolute / (textToSpeak.length || 1)) * 100;
          updateProgress(activeSpot, Math.min(99, Math.floor(progress)));
        } catch (e) {
          // ignore
        }
      };

      utterance.onend = () => {
        console.debug('[Docent] utterance.onend fired for spot', activeSpot);
        try { if ((window as any).__ttsOwner === 'docent') (window as any).__ttsOwner = null; } catch (e) {}
        cancelProgressAnimation();
        updateProgress(activeSpot, 100);
        setTimeout(() => {
          if (activeSpot === descriptionSpots.length - 1) {
            setIsPlaying(false);
            setIsTourCompleted(true);
          } else {
            setActiveSpot(prev => prev + 1);
          }
        }, 150);
      };

      utterance.onerror = (e) => {
        // Suppress benign 'interrupted' errors which browsers sometimes
        // emit when speech is programmatically cancelled or preempted.
        try {
          const maybeErr = String(((e as any)?.error) || ((e as any)?.message) || (e && e.type) || '');
          if (maybeErr.toLowerCase().includes('interrupted')) {
            cancelProgressAnimation();
            setIsPlaying(false);
            updateProgress(activeSpot, 0);
            utteranceRef.current = null;
            return;
          }
        } catch (ignore) {}

        console.error('SpeechSynthesis Error:', e);
        try { if ((window as any).__ttsOwner === 'docent') (window as any).__ttsOwner = null; } catch (err) {}
        cancelProgressAnimation();
        setIsPlaying(false);
        updateProgress(activeSpot, 0);
        utteranceRef.current = null;
      };

      utteranceRef.current = utterance;
      try {
        console.debug('[Docent] about to speak utterance, text length=', textToSpeak.length, 'voicesAvailable=', voices.length);
        (window as any).__ttsOwner = 'docent';
        synth.speak(utterance);
      } catch (speakErr) {
        console.warn('[Docent] synth.speak threw error', speakErr);
        try { if ((window as any).__ttsOwner === 'docent') (window as any).__ttsOwner = null; } catch (e) {}
      }

      // Fallback: if synth doesn't report speaking after short delay, retry once
      setTimeout(() => {
        try {
          const speaking = !!(synth && synth.speaking);
          console.debug('[Docent] post-speak check: speaking=', speaking, 'paused=', !!(synth && synth.paused));
          if (!speaking && speakAttemptsRef.current < 1) {
            speakAttemptsRef.current += 1;
            console.warn('[Docent] synth did not start speaking, retrying (attempt=', speakAttemptsRef.current + 1, ')');
            try { synth.cancel(); } catch (e) {}
            const retryUtterance = new SpeechSynthesisUtterance(textToSpeak);
            retryUtterance.lang = utterance.lang;
            retryUtterance.rate = utterance.rate;
            retryUtterance.pitch = utterance.pitch;
            retryUtterance.volume = utterance.volume;
            if (utterance.voice) retryUtterance.voice = utterance.voice;
            retryUtterance.onstart = utterance.onstart;
            retryUtterance.onboundary = utterance.onboundary;
            retryUtterance.onend = utterance.onend;
            retryUtterance.onerror = utterance.onerror;
            utteranceRef.current = retryUtterance;
            try { synth.speak(retryUtterance); } catch (e) { console.warn('[Docent] retry speak failed', e); }
          }
        } catch (e) {
          console.warn('[Docent] post-speak check failed', e);
        }
      }, 1200);
    };

    // When playing is requested:
    if (isPlaying) {
      // If currently paused, resume; otherwise start a new utterance
      if (synth.paused && synth.speaking) {
        // resume existing utterance
        // restart animation based on current progress
        const currentProg = progresses[activeSpot] || 0;
        cancelProgressAnimation();
        animStartRef.current = performance.now();
        const baseCharMs = 150;
        const rateFactor = 1.0;
        const estTotal = Math.max(800, Math.floor((textToSpeak.length * baseCharMs) / Math.max(0.1, rateFactor)));
        const remainingDuration = Math.max(300, Math.floor(((100 - currentProg) / 100) * estTotal));
        animDurationRef.current = remainingDuration;
        const startProg = currentProg;
        const step = (ts: number) => {
          if (animStartRef.current == null) return;
          const elapsed = ts - animStartRef.current;
          const add = Math.min(99 - startProg, (elapsed / animDurationRef.current) * (100 - startProg));
          updateProgress(activeSpot, Math.max(0, Math.floor(startProg + add)));
          rafRef.current = requestAnimationFrame(step);
        };
        rafRef.current = requestAnimationFrame(step);
        try { synth.resume(); } catch (e) { /* ignore */ }
      } else {
        // start fresh utterance for the current spot
        startNewUtterance();
      }
    } else {
      // pause behavior: pause speech rather than cancelling so we can resume
      if (synth.speaking) {
        try { synth.pause(); } catch (e) { /* ignore */ }
        // stop the smooth animation while paused
        cancelProgressAnimation();
      }
    }
    
    return () => {
      // If component unmounts or dependencies change, cancel only if not paused
      try {
        if (synth.speaking && !synth.paused) synth.cancel();
      } catch (e) {}
      cancelProgressAnimation();
      utteranceRef.current = null;
    };
  }, [isPlaying, activeSpot, descriptionSpots, voices]);

  const handleSpotClick = (index) => {
    setIsPlaying(false);
    setIsTourCompleted(false);
    
    setProgresses(prev => {
        const newProgresses = [...prev];
        for (let i = index; i < newProgresses.length; i++) {
            newProgresses[i] = 0;
        }
        return newProgresses;
    });

    setActiveSpot(index);
    setIsTextVisible(true);
  };

  

  const handlePlayPause = () => {
    if (!isPlaying) {
      setIsTextVisible(true);
      if (isTourCompleted) {
        setIsTourCompleted(false);
        setActiveSpot(0);
        setProgresses(new Array(descriptionSpots.length).fill(0));
      }
    }
    setIsPlaying(!isPlaying);
  };


  return (
    <div className="flex flex-col h-screen bg-black">
      {showInitialLoading && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" role="dialog" aria-modal="true">
          <div className="glass-card p-6 rounded-3xl flex flex-col items-center text-center text-white">
            <div className="w-12 h-12 border-4 border-[var(--primary)] border-t-transparent rounded-full animate-spin"></div>
            <p className="mt-4 text-lg font-semibold">관람 공간을 준비하고 있어요...</p>
          </div>
        </div>
      )}
       {isMinimapOpen && (
        <MinimapPopup
          spots={descriptionSpots}
          activeSpot={activeSpot}
          onSelectSpot={(index) => {
            handleSpotClick(index);
            setIsMinimapOpen(false);
          }}
          onClose={() => setIsMinimapOpen(false)}
        />
      )}
      <header className="p-4 bg-black/30 backdrop-blur-md shadow-md z-30 shrink-0">
        <div className="relative flex items-center justify-center">
            <button onClick={onBack} className="absolute left-0 text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors">
                <i className="fas fa-arrow-left text-xl"></i>
            </button>
            <div className="text-center">
                <h1 className="text-xl font-bold text-[var(--text-primary)]">테마: {theme.title}</h1>
                <p className="text-sm text-[var(--text-secondary)]">연령: {age === 'child' ? '어린이' : '어른'}</p>
            </div>
            <div className="absolute right-0 flex items-center space-x-3">
              <button
                onClick={() => setIsMinimapOpen(true)}
                className="text-3xl text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-transform transform hover:scale-110"
                aria-label="미니맵 열기"
                title="미니맵"
              >
                <i className="fa-regular fa-map"></i>
              </button>
              <button
                onClick={() => setIsCourseOpen(c => !c)}
                className="text-2xl text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-transform transform hover:scale-110"
                aria-label={isCourseOpen ? '코스 닫기' : '코스 열기'}
                title={isCourseOpen ? '코스 닫기' : '코스 열기'}
              >
                <i className="fas fa-list"></i>
              </button>
            </div>
        </div>
      </header>
      
      <main className="flex-1 relative overflow-hidden bg-black flex items-center justify-center">
        <video
          key={videoSrc}
          autoPlay
          loop
          muted
          playsInline
          className="absolute top-0 left-0 w-full h-full object-cover z-0"
        >
          <source src={videoSrc} type="video/mp4" />
        </video>
        <div className="absolute inset-0 bg-black/40 z-10"></div>

        <div className="relative z-20 w-full h-full flex flex-col justify-end p-4">
          {/* Museum item panel: shows items as cards (non-overlapping) */}
          {isCourseOpen && (
          <aside
            className="absolute right-4 top-6 z-40 bg-black/60 p-3 rounded-2xl text-sm text-[var(--text-secondary)] w-64 max-h-[48vh] shadow-lg no-scrollbar-panel"
            style={{ overflowY: 'auto', msOverflowStyle: 'none', scrollbarWidth: 'none' }}
          >
            <style>{`.no-scrollbar-panel::-webkit-scrollbar{display:none}`}</style>
            <div className="mb-3 font-semibold text-[var(--text-primary)]">코스</div>
            {items.length === 0 ? (
              <div className="text-xs">(코스 없음)</div>
            ) : (
              <div className="space-y-3">
                {items.map((it, i) => {
                  const title = it.item_name || it.name || it.title || it.raw?.item_name || `코스 ${i+1}`;
                  const childScript = it.script_child || it.scriptChild || it.raw?.script_child || '';
                  const generalScript = it.script_general || it.scriptGeneral || it.raw?.script_general || '';
                  const previewScript = (childScript || generalScript || it.item_desc || '').toString();
                  const previewLines = previewScript.replace(/\\n/g, '\n').split('\n').map(s => s.trim()).filter(Boolean).slice(0,2).join(' ');

                  return (
                    <div key={i} className="p-2 bg-white/5 rounded-lg">
                      <div className="font-semibold text-sm text-white truncate">{title}</div>
                          {previewScript ? (
                            (() => {
                              const chars = previewScript.length;
                              const estMs = Math.max(500, Math.floor(chars * 150));
                              const seconds = Math.round(estMs / 1000);
                              const minutesOnly = Math.max(1, Math.ceil(seconds / 60));
                              return (
                                <div className="text-xs text-[var(--text-secondary)] mt-1 leading-snug truncate">예상 관람시간: 약 {minutesOnly}분</div>
                              );
                            })()
                          ) : (
                            <div className="text-xs text-[var(--text-secondary)] mt-1">설명 없음</div>
                          )}
                      <div className="mt-2 flex items-center space-x-2">
                        <button type="button" onClick={() => { handleSpotClick(i); setIsTextVisible(true); setIsPlaying(true); setIsCourseOpen(false); setIsMinimapOpen(false); }} className="text-xs py-1 px-2 bg-[var(--primary)] text-black rounded-full font-semibold">관람</button>
                            <button type="button" onClick={() => {
                                const chosenFull = (age === 'child') ? (childScript || generalScript || it.item_desc || '') : (generalScript || childScript || it.item_desc || '');
                                setFullScriptItem({ title, text: chosenFull.toString() });
                              }} className="text-xs py-1 px-2 bg-white/10 text-[var(--text-secondary)] rounded-full">전체보기</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            <div className="mt-4 text-xs text-[var(--text-secondary)]">퀴즈: {quizzes.length}개</div>
          </aside>
          )}
          {isTourCompleted ? (
            <div className="text-center bg-black/50 backdrop-blur-lg p-6 rounded-3xl text-white animate-fade-in">
              <i className="fas fa-check-circle text-5xl text-[var(--accent)] mb-3"></i>
              <h2 className="text-2xl font-bold">관람 내용이 모두 종료되었습니다.</h2>
              <p className="mt-2 text-[var(--text-secondary)]">이제 미션을 수행하여 리워드를 획득하세요!</p>
              <button 
                onClick={() => onNavigate(Screen.MISSION)} 
                className="mt-4 py-3 px-8 bg-[var(--accent)] text-black font-bold rounded-full shadow-lg hover:bg-[var(--accent-hover)] transition-all transform hover:scale-105"
              >
                미션 시작하기
              </button>
            </div>
          ) : isTextVisible ? (
            <div className="glass-card p-6 animate-fade-in rounded-2xl max-w-2xl mx-auto">
              <div className="flex items-start justify-between">
                <h3 className="text-white font-semibold">{descriptionTitles[activeSpot]}</h3>
                <button
                  onClick={() => setFullScriptItem({ title: descriptionTitles[activeSpot], text: descriptionSpots[activeSpot] })}
                  className="ml-4 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                >
                  전체보기
                </button>
              </div>
              <p className="text-white text-center text-lg leading-relaxed max-h-40 overflow-y-auto whitespace-pre-wrap mt-3">
                {descriptionSpots[activeSpot]}
              </p>
            </div>
          ) : null}
        </div>
      </main>

      {/* Full script modal (dev/UX): shows full script text for current item */}
      {/* Intro modal: plays hamoIntroduce video as background */}
      {isIntroOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" role="dialog" aria-modal="true">
          <video
            autoPlay
            loop
            muted
            playsInline
            className="absolute top-0 left-0 w-full h-full object-cover z-0"
          >
            <source src="/videos/hamoIntroduce.mp4" type="video/mp4" />
          </video>
          <div className="absolute inset-0 bg-black/50 z-10"></div>
          <div className="relative z-20 max-w-3xl w-full mx-4 bg-white/5 backdrop-blur-md rounded-2xl p-6 text-white">
            <div className="flex items-start justify-between">
              <h2 className="text-2xl font-bold">{theme.title} 소개</h2>
              <button onClick={() => setIsIntroOpen(false)} className="text-stone-200 hover:text-white text-2xl">&times;</button>
            </div>
            <div className="mt-4 text-[var(--text-secondary)] whitespace-pre-wrap max-h-[60vh] overflow-auto">
              {theme.longDescription}
            </div>
          </div>
        </div>
      )}

      {fullScriptItem && (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50" role="dialog" aria-modal="true">
          <div className="bg-white text-black rounded-xl p-6 max-w-2xl w-full mx-4 max-h-[80vh] overflow-auto">
            <div className="flex justify-between items-start mb-4">
              <h2 className="text-xl font-bold">{fullScriptItem.title}</h2>
              <button onClick={() => setFullScriptItem(null)} className="text-stone-500 hover:text-stone-800">닫기</button>
            </div>
            <pre className="whitespace-pre-wrap text-sm leading-relaxed">{fullScriptItem.text}</pre>
          </div>
        </div>
      )}

      <div className="p-6 bg-black/30 backdrop-blur-md shadow-t-lg shrink-0 z-30">
        <div className="flex items-center space-x-2 mb-6">
            {descriptionSpots.map((_, index) => {
                const prog = progresses[index] || 0;
                const isPassed = index < activeSpot || prog >= 100;
                // track background: accent when passed/completed, subtle otherwise
                const trackClass = isPassed ? 'bg-[var(--accent)]' : 'bg-white/20';
                // inner fill: use slightly different shade when partial
                const innerClass = isPassed ? 'h-full rounded-full bg-[var(--accent)]' : 'h-full rounded-full bg-[var(--accent-hover)]';
                return (
                <div 
                  key={index} 
                  className={`flex-1 h-2 rounded-full ${trackClass} cursor-pointer overflow-hidden group`} 
                  onClick={() => handleSpotClick(index)}
                  role="button"
                  tabIndex={0}
                  aria-label={`Go to spot ${index + 1}`}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleSpotClick(index); }}
                >
                  <div
                    className={`${innerClass} transition-all duration-300`}
                    style={{
                      width: `${Math.min(100, prog)}%`,
                    }}
                  />
                </div>
              )})}
        </div>
        <div className="flex items-center justify-center space-x-8">
           <button
              onClick={() => setIsTextVisible(!isTextVisible)}
              className={`w-16 h-16 rounded-full flex items-center justify-center text-2xl transition-all duration-300 transform hover:scale-110 shadow-md ${isTextVisible ? 'bg-[var(--primary)] text-black' : 'bg-white/20 text-[var(--text-primary)] hover:bg-white/30'}`}
              aria-label={isTextVisible ? "설명 숨기기" : "설명 보기"}
            >
              <i className="fas fa-file-alt"></i>
            </button>
          <button 
            onClick={handlePlayPause} 
            className="w-20 h-20 rounded-full flex items-center justify-center bg-white shadow-lg text-[var(--primary)] hover:text-[var(--primary-light)] text-5xl transition-transform transform hover:scale-110 active:scale-100"
            aria-label={isPlaying ? "일시정지" : "재생"}
          >
            <i className={`fas ${isPlaying ? 'fa-pause-circle' : 'fa-play-circle'}`}></i>
          </button>
          {/* mute button removed - volume is fixed in TTS utterance */}
          <div className="w-16 h-16"></div>
        </div>
      </div>

      <footer className="p-4 grid grid-cols-2 gap-4 shrink-0 z-30">
        <button onClick={() => onNavigate(Screen.CHAT)} className="py-4 px-4 glass-card rounded-full shadow-md text-lg font-bold text-[var(--text-primary)] hover:bg-white/20 transition-all transform hover:-translate-y-0.5">
          <i className="fas fa-question-circle mr-2 text-[var(--primary)]"></i>
          하모에게 질문
        </button>
        <button onClick={() => onNavigate(Screen.MISSION)} className="py-4 px-4 glass-card rounded-full shadow-md text-lg font-bold text-[var(--text-primary)] hover:bg-white/20 transition-all transform hover:-translate-y-0.5">
          <i className="fas fa-tasks mr-2 text-[var(--accent)]"></i>
          미션 수행
        </button>
      </footer>
    </div>
  );
};

export default DocentScreen;