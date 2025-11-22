import React, { useState, useEffect } from 'react';
import { getQuizForTheme } from '../services/dbService';

const MissionScreen = ({ theme, onComplete, onBack }) => {
  // FIX: Explicitly type the questions state as any[] to prevent TypeScript from inferring it as never[] from an empty array.
  const [questions, setQuestions] = useState<any[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState(null);
  const [showFeedback, setShowFeedback] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchQuiz = async () => {
      setIsLoading(true);
      setError(null);
      const fetchedQuestions = await getQuizForTheme(theme.id);
      // Normalize fetched quiz items into a consistent shape:
      // { question: string, options: string[], correctAnswer: string }
      if (Array.isArray(fetchedQuestions)) {
        const normalized = fetchedQuestions.map((q: any, idx: number) => {
          const questionText = q.question || q.question_text || q.quiz_question || q.title || q.prompt || q.q || '';

          let options: any = q.options || q.choices || q.answers || q.option_list || q.items || null;
          // If options is an object (map), use its values
          if (options && typeof options === 'object' && !Array.isArray(options)) {
            options = Object.values(options);
          }
          // If options is a single string, try splitting by newline or pipe
          if (typeof options === 'string') {
            options = options.split(/\r?\n|\|/).map((s: string) => s.trim()).filter(Boolean);
          }
          // Ensure options is an array
          if (!Array.isArray(options)) {
            // Some backends return option fields like {A: 'x', B: 'y'}; attempt best-effort
            options = [];
          }

          const correct = q.correctAnswer || q.answer || q.correct || q.correct_answer || q.key || q.correctOption || '';

          const normalizedItem = {
            question: questionText || `문제 ${idx + 1}`,
            options,
            correctAnswer: correct,
            raw: q,
          };
          // Dev log if shape looks unexpected
          if (!normalizedItem.options || !Array.isArray(normalizedItem.options) || normalizedItem.options.length === 0) {
            console.warn('MissionScreen: quiz item has no options after normalization', normalizedItem);
          }
          return normalizedItem;
        });
        setQuestions(normalized);
      } else {
        setError('퀴즈를 불러오는데 실패했습니다. 이 테마에 대한 퀴즈가 없습니다.');
      }
      setIsLoading(false);
    };

    fetchQuiz();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme]);

  const handleBack = () => {
    console.log('MissionScreen: back clicked', { hasOnBack: !!onBack, onBackType: typeof onBack });
    if (onBack && typeof onBack === 'function') {
      try {
        onBack();
        return;
      } catch (err) {
        console.warn('MissionScreen: onBack threw error, falling back to history/back', err);
      }
    }

    // If there is a history to go back to, use it.
    try {
      if (window && window.history && window.history.length > 1) {
        window.history.back();
        return;
      }
    } catch (err) {
      console.warn('MissionScreen: window.history.back failed', err);
    }

    // Final fallback: navigate to root
    try {
      window.location.href = '/';
    } catch (err) {
      console.error('MissionScreen: final fallback navigation failed', err);
    }
  };

  const handleAnswer = (answer) => {
    if (showFeedback) return;
    setSelectedAnswer(answer);
    setShowFeedback(true);
    if (answer === questions[currentQuestionIndex].correctAnswer) {
      setScore(s => s + 1);
    }
  };

  const handleNext = () => {
    if (currentQuestionIndex < questions.length - 1) {
      setCurrentQuestionIndex(i => i + 1);
      setSelectedAnswer(null);
      setShowFeedback(false);
    } else {
      onComplete(score, questions.length);
    }
  };

  const getButtonClass = (option) => {
    if (!showFeedback) {
      return 'bg-white/10 border-transparent hover:border-white/50 hover:bg-white/20';
    }
    const isCorrect = option === questions[currentQuestionIndex].correctAnswer;
    const isSelected = option === selectedAnswer;

    if (isCorrect) {
      return 'bg-[var(--success)] border-[var(--success)] text-black';
    }
    if (isSelected) {
      return 'bg-[var(--danger)] border-[var(--danger)] text-white';
    }
    return 'bg-white/5 border-transparent opacity-60';
  };

  if (isLoading) {
    return (
      <div className="min-h-screen p-4 flex flex-col items-center justify-center relative">
        <div id="stars" className="fixed"></div>
        <div id="stars2" className="fixed"></div>
        <div id="stars3" className="fixed"></div>
        <div className="text-2xl font-semibold text-[var(--text-primary)]">미션을 생성 중입니다...</div>
        <div className="w-16 h-16 border-4 border-[var(--primary)] border-t-transparent rounded-full animate-spin mt-4"></div>
      </div>
    );
  }
  
  if (error) {
    return (
      <div className="min-h-screen p-4 text-center flex flex-col items-center justify-center relative">
        <div id="stars" className="fixed"></div>
        <div id="stars2" className="fixed"></div>
        <div id="stars3" className="fixed"></div>
        <div className="text-xl font-semibold text-[var(--danger)] mb-4">{error}</div>
        <button type="button" title="테마로 돌아가기" onClick={handleBack} className="px-6 py-2 bg-[var(--primary)] text-black font-semibold rounded-full shadow hover:bg-[var(--primary-light)] transition-colors relative z-50 pointer-events-auto">
          뒤로가기
        </button>
      </div>
    );
  }

  if (questions.length === 0) {
    return (
        <div className="min-h-screen p-4 text-center flex flex-col items-center justify-center relative">
            <div id="stars" className="fixed"></div>
            <div id="stars2" className="fixed"></div>
            <div id="stars3" className="fixed"></div>
            <div className="text-xl font-semibold text-[var(--text-primary)] mb-4">이 테마에 대한 미션이 없습니다.</div>
            <button type="button" title="테마로 돌아가기" onClick={handleBack} className="px-6 py-2 bg-[var(--primary)] text-black font-semibold rounded-full shadow hover:bg-[var(--primary-light)] transition-colors relative z-50 pointer-events-auto">
            뒤로가기
            </button>
        </div>
    );
  }
  
  const currentQuestion = questions[currentQuestionIndex];

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 relative">
        <div id="stars" className="fixed"></div>
        <div id="stars2" className="fixed"></div>
        <div id="stars3" className="fixed"></div>
      <div className="w-full max-w-2xl glass-card rounded-3xl shadow-2xl p-6 sm:p-8 relative">
        <header className="mb-6">
          <div className="flex justify-between items-center text-[var(--text-secondary)]">
            <h1 className="text-xl font-bold text-[var(--text-primary)]">미션: {theme.title}</h1>
            <p className="font-bold text-lg text-[var(--text-primary)]">{currentQuestionIndex + 1} / {questions.length}</p>
          </div>
          <div className="w-full bg-white/10 rounded-full h-4 mt-2">
            <div className="bg-[var(--accent)] h-4 rounded-full transition-all duration-500" style={{ width: `${((currentQuestionIndex + 1) / questions.length) * 100}%` }}></div>
          </div>
        </header>

        <main>
          <p className="text-2xl md:text-3xl font-bold text-white mb-8 min-h-[100px]">{currentQuestion.question}</p>
          <div className="space-y-4">
            {currentQuestion.options.map((option, i) => (
              <button
                key={i}
                onClick={() => handleAnswer(option)}
                disabled={showFeedback}
                className={`w-full text-left p-5 rounded-2xl border-2 text-lg font-bold transition-all duration-300 transform active:scale-95 ${getButtonClass(option)}`}
              >
                {option}
              </button>
            ))}
          </div>
        </main>
        
        {showFeedback && (
          <footer className="mt-8 text-center animate-fade-in">
            <button onClick={handleNext} className="w-full py-4 bg-[var(--primary)] text-black font-bold text-xl rounded-full shadow-lg hover:bg-[var(--primary-light)] transition-all transform hover:-translate-y-1">
              {currentQuestionIndex < questions.length - 1 ? '다음 문제' : '미션 완료!'}
            </button>
          </footer>
        )}

      </div>
       <button type="button" title="테마로 돌아가기" onClick={handleBack} className="mt-8 text-[var(--text-secondary)] font-semibold hover:text-[var(--text-primary)] transition-colors relative z-50 pointer-events-auto">
          테마로 돌아가기
        </button>
    </div>
  );
};

export default MissionScreen;