import React, { useEffect, useState } from 'react';
import { Screen } from '../types';

const STORAGE_KEY = 'prizeSubmissions';

const formatDate = (iso) => {
  try {
    return new Date(iso).toLocaleString();
  } catch (e) { return iso; }
};

const toCsv = (rows) => {
  const header = ['timestamp','email','score','totalQuestions','response'];
  const escape = (s) => '"' + String(s ?? '').replace(/"/g,'""') + '"';
  const lines = [header.map(escape).join(',')];
  for (const r of rows) {
    lines.push([r.timestamp, r.email, r.score, r.totalQuestions, JSON.stringify(r.response || '')].map(escape).join(','));
  }
  return lines.join('\n');
};

const AdminScreen = ({ onNavigate }) => {
  const [records, setRecords] = useState<any[]>([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      setRecords(Array.isArray(arr) ? arr : []);
    } catch (e) {
      setRecords([]);
    }
  }, []);

  const handleDownload = () => {
    const csv = toCsv(records);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `submissions_${new Date().toISOString().slice(0,19).replace(/[:T]/g,'-')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleClear = () => {
    if (!confirm('모든 제출 기록을 삭제하시겠습니까?')) return;
    localStorage.removeItem(STORAGE_KEY);
    setRecords([]);
  };

  return (
    <div className="min-h-screen p-6 flex flex-col items-center bg-black">
      <div className="w-full max-w-4xl glass-card rounded-3xl p-6">
        <div className="flex justify-between items-center mb-4">
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">응모 내역 (로컬)</h1>
          <div className="flex items-center space-x-2">
            <button onClick={() => onNavigate(Screen.HOME)} className="px-4 py-2 rounded-full bg-transparent border border-white/10 text-[var(--text-primary)]">홈</button>
            <button onClick={handleDownload} className="px-4 py-2 rounded-full bg-[var(--primary)] text-black font-bold">CSV 다운로드</button>
            <button onClick={handleClear} className="px-4 py-2 rounded-full bg-white/10">삭제</button>
          </div>
        </div>

        <div className="overflow-auto max-h-[60vh]">
          {records.length === 0 ? (
            <div className="text-[var(--text-secondary)]">기록이 없습니다.</div>
          ) : (
            <table className="w-full table-fixed text-sm">
              <thead>
                <tr className="text-left text-[var(--text-secondary)]">
                  <th className="w-48">시간</th>
                  <th className="w-64">이메일</th>
                  <th className="w-24">점수</th>
                  <th className="w-24">문항수</th>
                  <th>서버 응답</th>
                </tr>
              </thead>
              <tbody>
                {records.map((r, i) => (
                  <tr key={i} className="border-t border-white/5">
                    <td className="py-2 align-top">{formatDate(r.timestamp)}</td>
                    <td className="py-2 align-top">{r.email}</td>
                    <td className="py-2 align-top">{r.score}</td>
                    <td className="py-2 align-top">{r.totalQuestions}</td>
                    <td className="py-2 align-top"><pre className="whitespace-pre-wrap text-xs">{JSON.stringify(r.response,null,2)}</pre></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminScreen;
