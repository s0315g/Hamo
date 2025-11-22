import React, { useState } from 'react';
import { Screen } from '../types';

const CompletionScreen = ({ score, totalQuestions, onNavigate, onRetry }) => {
  const percentage = totalQuestions > 0 ? Math.round((score / totalQuestions) * 100) : 0;
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitResult, setSubmitResult] = useState<string | null>(null);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const [serverResponse, setServerResponse] = useState<any | null>(null);

  const validateEmail = (e: string) => {
    return /^\S+@\S+\.\S+$/.test(e);
  };

  const handleClaim = async () => {
    setSubmitResult(null);
    if (!validateEmail(email)) {
      setSubmitResult('유효한 이메일 주소를 입력해주세요.');
      return;
    }
    setIsSubmitting(true);
    if (!termsAccepted) {
      setSubmitResult('개인정보 수집/이용 동의가 필요합니다. 약관을 확인해주세요.');
      setIsSubmitting(false);
      return;
    }
    try {
      // POST to backend proxy which forwards to remote API (/api/recipient)
      const resp = await fetch('/.netlify/functions/backend-proxy?path=/api/recipient', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, score, totalQuestions }),
      });
      if (!resp.ok) {
        const text = await resp.text();
        throw new Error(text || `Request failed with status ${resp.status}`);
      }
      const data = await resp.json().catch(() => ({}));
      setServerResponse(data);
      setSubmitResult('신청이 접수되었습니다. 이메일을 확인해주세요.');
      try { localStorage.setItem('lastPrizeEmail', email); } catch (e) {}
      // save submission record locally for admin / CSV
      try {
        const STORAGE_KEY = 'prizeSubmissions';
        const raw = localStorage.getItem(STORAGE_KEY);
        const arr = raw ? JSON.parse(raw) : [];
        const rec = { timestamp: new Date().toISOString(), email, score, totalQuestions, response: data };
        arr.push(rec);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(arr));
      } catch (e) { console.warn('Failed to save submission locally', e); }
    } catch (err: any) {
      console.error('Claim error', err);
      setSubmitResult('신청 중 오류가 발생했습니다. 나중에 다시 시도해주세요.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 relative overflow-hidden">
      <div id="stars" className="fixed"></div>
      <div id="stars2" className="fixed"></div>
      <div id="stars3" className="fixed"></div>
      <div className="text-center glass-card p-8 rounded-3xl shadow-2xl max-w-md w-full border-2 border-[var(--accent)]">
        <i className="fas fa-trophy text-7xl text-[var(--accent)] mb-4"></i>
        <h1 className="text-5xl font-black text-white mb-2">미션 완료!</h1>
        <p className="text-lg text-[var(--text-secondary)] mb-6">모든 퀴즈를 풀었어요!</p>
        
        <div className="mb-8 p-6 bg-black/20 rounded-2xl">
          <p className="text-2xl font-bold text-[var(--primary)]">최종 점수</p>
          <p className="text-8xl font-black text-[var(--primary)] my-2">{score} / {totalQuestions}</p>
          <p className="text-2xl font-bold text-[var(--primary)]">({percentage}%)</p>
        </div>

        <div className="flex flex-col sm:flex-row gap-4">
          <button 
            onClick={() => onNavigate(Screen.HOME)} 
            className="flex-1 py-4 px-6 bg-transparent text-[var(--primary)] font-bold rounded-full shadow-md hover:bg-white/10 transition-all transform hover:-translate-y-0.5 border-2 border-[var(--primary)]"
          >
            홈으로 가기
          </button>
          <button 
            onClick={onRetry} 
            className="flex-1 py-4 px-6 bg-[var(--accent)] text-black font-bold rounded-full shadow-lg hover:bg-[var(--accent-hover)] transition-all transform hover:-translate-y-0.5"
          >
            다시 도전!
          </button>
        </div>
        <div className="mt-6">
          <h3 className="text-lg text-[var(--text-primary)] font-bold mb-2">경품 신청</h3>
          <p className="text-sm text-[var(--text-secondary)] mb-3">미션을 완료하신 분은 이메일을 입력하시면 경품 응모가 접수됩니다.</p>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="example@email.com"
              className="w-full sm:flex-1 p-3 rounded-full bg-black/10 text-white placeholder:text-white/60"
              aria-label="이메일 주소"
            />
            <button
              onClick={handleClaim}
              disabled={isSubmitting}
              className="w-full sm:w-auto py-3 px-5 bg-[var(--primary)] text-black font-bold rounded-full shadow hover:bg-[var(--primary-light)] disabled:opacity-60"
            >
              {isSubmitting ? '전송 중...' : '신청'}
            </button>
          </div>
          <div className="mt-3 flex items-center space-x-3">
            <label className="inline-flex items-center text-sm text-[var(--text-secondary)]">
              <input type="checkbox" checked={termsAccepted} onChange={(e) => setTermsAccepted(e.target.checked)} className="mr-2 w-4 h-4" />
              개인정보 수집/이용에 동의합니다.
            </label>
            <button onClick={() => setShowTerms(true)} className="text-sm text-[var(--text-secondary)] underline">약관 보기</button>
          </div>
          {serverResponse && (
            <div className="mt-3 text-sm text-[var(--text-primary)]">
              서버 응답: <pre className="inline whitespace-pre-wrap">{JSON.stringify(serverResponse)}</pre>
            </div>
          )}

          {showTerms && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60">
              <div className="bg-white text-black rounded-xl p-6 max-w-xl w-full mx-4 max-h-[80vh] overflow-auto">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-lg font-bold">개인정보 수집 및 이용 동의</h3>
                  <button onClick={() => setShowTerms(false)} className="text-sm text-[var(--text-secondary)]">닫기</button>
                </div>
                <div className="text-sm text-stone-700 leading-relaxed">
                  <p>수집 항목: 이메일 주소</p>
                  <p>목적: 경품 응모 및 당첨자 연락</p>
                  <p>보유 기간: 응모일로부터 1년(또는 관련 법령에 따른 보관기간)</p>
                  <p>제공받는 자: 하모예 팀</p>
                  <p>동의를 거부할 권리가 있으며, 동의 거부 시 경품 응모가 제한될 수 있습니다.</p>
                  <p className="mt-3">※ 데모입니다.</p>
                </div>
              </div>
            </div>
          )}
          {submitResult && <div className="mt-3 text-sm text-[var(--text-secondary)]">{submitResult}</div>}
        </div>
      </div>
    </div>
  );
};

export default CompletionScreen;