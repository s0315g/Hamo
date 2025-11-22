import React, { useState, useEffect } from 'react';
import { getThemes } from '../services/dbService';

const HomeScreen = ({ onSelectTheme }) => {
  // FIX: Explicitly type the themes state as any[] to avoid type errors.
  // FIX: Corrected a typo in the useState hook from 'an y[]>' to 'useState<any[]>'.
  const [themes, setThemes] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedAge, setSelectedAge] = useState('adult');
  const [selectedThemeId, setSelectedThemeId] = useState('');

  useEffect(() => {
    const fetchThemes = async () => {
      try {
        const fetchedThemes = await getThemes();
        // FIX: Add a type guard to ensure fetchedThemes is an array before accessing its properties.
        if (Array.isArray(fetchedThemes)) {
            setThemes(fetchedThemes);
            if (fetchedThemes.length > 0) {
              setSelectedThemeId(fetchedThemes[0].id);
            }
        }
      } catch (err) {
        setError('테마를 불러오는데 실패했습니다.');
      } finally {
        setIsLoading(false);
      }
    };
    fetchThemes();
  }, []);

  const handleStart = () => {
    const theme = themes.find(t => t.id === selectedThemeId);
    if (theme) {
      onSelectTheme(theme, selectedAge);
    }
  };

  const selectedTheme = themes.find(t => t.id === selectedThemeId);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4">
        <div className="w-16 h-16 border-4 border-[var(--primary)] border-t-transparent rounded-full animate-spin"></div>
        <p className="mt-4 text-[var(--text-secondary)]">테마 목록을 불러오는 중...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen p-4 text-center">
        <div className="text-xl font-semibold text-[var(--danger)] mb-4">{error}</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div id="stars"></div>
      <div id="stars2"></div>
      <div id="stars3"></div>
      <div className="w-full max-w-md glass-card rounded-3xl shadow-2xl transform transition-all duration-500 hover:scale-[1.02] mt-20">
        <div className="p-8">
          <div className="flex justify-center -mt-28 mb-4">
        <video
                  autoPlay
                  loop
                  muted
                  playsInline
                  className="w-40 h-40 object-cover rounded-full border-4 border-white/20 shadow-lg"
          src="/videos/hamohi_video.mp4"
              ></video>
          </div>
            <header className="text-center space-y-2">
            <h1 className="text-5xl font-bold text-white">진주 하모 도슨트</h1>
            <p className="text-lg text-[var(--text-secondary)]">아름다운 도시 진주에서 하모와 함께 역사를 만나보세요.</p>
            </header>

            <main className="space-y-4 mt-6">
            <div>
                <label htmlFor="age-select" className="block text-lg font-bold text-[var(--text-primary)] mb-2">
                연령 선택
                </label>
                <select
                id="age-select"
                value={selectedAge}
                onChange={(e) => setSelectedAge(e.target.value)}
                className="mt-1 block w-full p-3 border border-white/20 rounded-full shadow-sm focus:ring-2 focus:ring-[var(--primary)] focus:border-[var(--primary)] bg-transparent text-lg transition appearance-none"
                style={{backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%23A0B1D3' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`, backgroundPosition: 'right 0.75rem center', backgroundRepeat: 'no-repeat', backgroundSize: '1.5em 1.5em'}}
                >
                <option value="adult" className="bg-[#1D2B53]">어른</option>
                <option value="child" className="bg-[#1D2B53]">어린이</option>
                </select>
            </div>
            <div>
                <label htmlFor="theme-select" className="block text-lg font-bold text-[var(--text-primary)] mb-2">
                테마 선택
                </label>
                <select
                id="theme-select"
                value={selectedThemeId}
                onChange={(e) => setSelectedThemeId(e.target.value)}
                className="mt-1 block w-full p-3 border border-white/20 rounded-full shadow-sm focus:ring-2 focus:ring-[var(--primary)] focus:border-[var(--primary)] bg-transparent text-lg transition appearance-none"
                style={{backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%23A0B1D3' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`, backgroundPosition: 'right 0.75rem center', backgroundRepeat: 'no-repeat', backgroundSize: '1.5em 1.5em'}}
                >
                {themes.map((theme) => (
                    <option key={theme.id} value={theme.id} className="bg-[#1D2B53]">
                    {theme.title}
                    </option>
                ))}
                </select>
            </div>
            </main>
            
            <footer className="mt-6">
            <button
                onClick={handleStart}
                disabled={!selectedTheme}
                className="w-full mt-4 flex justify-center py-4 px-4 border border-transparent rounded-full shadow-lg text-xl font-bold text-black bg-[var(--primary)] hover:bg-[var(--primary-light)] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[var(--primary)] disabled:bg-stone-400 disabled:shadow-none disabled:transform-none transition-all duration-300 transform hover:-translate-y-1"
            >
                관람 시작!
            </button>
            </footer>
        </div>
      </div>
    </div>
  );
};

export default HomeScreen;