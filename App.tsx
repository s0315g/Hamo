
import React, { useState, useEffect } from 'react';
import { Screen } from './types';
import HomeScreen from './components/HomeScreen';
import DocentScreen from './components/DocentScreen';
import ChatScreen from './components/ChatScreen';
import MissionScreen from './components/MissionScreen';
import CompletionScreen from './components/CompletionScreen';
import AdminScreen from './components/AdminScreen';
import { getThemes } from './services/dbService';

const App = () => {
  const [currentScreen, setCurrentScreen] = useState(Screen.HOME);
  const [selectedTheme, setSelectedTheme] = useState(null);
  const [selectedAge, setSelectedAge] = useState('adult');
  const [lastScore, setLastScore] = useState(0);
  const [lastTotalQuestions, setLastTotalQuestions] = useState(0);

  // Dev helper: auto-select a theme if VITE_FORCE_THEME_ID is set
  useEffect(() => {
    const forceId = (import.meta as any).env?.VITE_FORCE_THEME_ID as string | undefined;
    if (!forceId) return;

    (async () => {
      try {
        const themes: any[] = await getThemes();
        const t = themes.find(th => (th.id || th.theme_id || th.raw?.theme_id || '').toString().toLowerCase() === forceId.toString().toLowerCase());
        if (t) {
          setSelectedTheme(t);
          setSelectedAge('adult');
          setCurrentScreen(Screen.DOCENT);
        }
      } catch (e) {
        // ignore
      }
    })();
  }, []);

  const handleSelectTheme = (theme, age) => {
    setSelectedTheme(theme);
    setSelectedAge(age);
    setCurrentScreen(Screen.DOCENT);
  };

  const navigateTo = (screen) => {
    setCurrentScreen(screen);
  };

  const handleBackToHome = () => {
    setSelectedTheme(null);
    setCurrentScreen(Screen.HOME);
  };
  
  const handleBackToDocent = () => {
    setCurrentScreen(Screen.DOCENT);
  };

  const handleMissionComplete = (score, totalQuestions) => {
    setLastScore(score);
    setLastTotalQuestions(totalQuestions);
    setCurrentScreen(Screen.COMPLETION);
  };

  const handleRetryMission = () => {
    setCurrentScreen(Screen.MISSION);
  };

  const renderScreen = () => {
    switch (currentScreen) {
      case Screen.HOME:
        return <HomeScreen onSelectTheme={handleSelectTheme} />;
      case Screen.DOCENT:
        if (selectedTheme) {
          return <DocentScreen theme={selectedTheme} age={selectedAge} onNavigate={navigateTo} onBack={handleBackToHome} />;
        }
        return null; // Should not happen
      case Screen.CHAT:
        if (selectedTheme) {
          return <ChatScreen theme={selectedTheme} onBack={handleBackToDocent} />;
        }
        return null;
      case Screen.MISSION:
        if (selectedTheme) {
          return <MissionScreen theme={selectedTheme} onComplete={handleMissionComplete} onBack={handleBackToDocent}/>;
        }
        return null;
      case Screen.COMPLETION:
        return <CompletionScreen theme={selectedTheme} score={lastScore} totalQuestions={lastTotalQuestions} onNavigate={navigateTo} onRetry={handleRetryMission} />;
      case Screen.ADMIN:
        return <AdminScreen onNavigate={navigateTo} />;
      default:
        return <HomeScreen onSelectTheme={handleSelectTheme} />;
    }
  };

  return (
    <div className="antialiased" style={{ fontFamily: 'var(--font-family)', background: 'var(--bg-main)', color: 'var(--text-primary)'}}>
      {renderScreen()}
    </div>
  );
};

export default App;