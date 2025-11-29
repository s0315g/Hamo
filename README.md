## 구성

### 프론트엔드 (Vite + React)
- 단일 페이지 앱 구조로 `App.tsx`가 화면 전환을 관리합니다. 주요 화면은 **Home → Docent → Chat/Mission → Completion → Admin** 흐름으로 구성됩니다.
- `components/HomeScreen` 은 테마·연령 선택과 "관람 시작" 진입을 담당합니다. 선택한 값은 상위 App 상태로 올려 보내져 이후 화면들이 재사용합니다.
- `components/DocentScreen` 은 실제 도슨트 투어 화면입니다. `dbService` 를 통해 테마별 전시 아이템과 퀴즈를 불러오고, Web Speech API 로 TTS·STT, 비디오 배경, 미니맵, 코스 패널 등을 제어합니다.
- `components/ChatScreen` 은 음성 입력(webkitSpeechRecognition)과 OpenAI/백엔드 연동 채팅 UI를 제공합니다. 마이크 버튼·기본 질문 버튼 등 모바일 대응 UI 로직이 포함되어 있습니다.
- `components/MissionScreen`, `CompletionScreen`, `AdminScreen` 은 각각 퀴즈 진행, 리워드 제출, 제출 기록 열람(로컬 스토리지) 기능을 담당합니다.
- 스타일은 Tailwind + 커스텀 CSS(`index.css`) 조합이며 배경 영상(`/videos/*`)과 글래스모피즘 카드가 일관된 룩앤필을 만듭니다.

### 데이터 / API 연동
- `services/dbService.ts` 가 모든 REST 호출을 담당하며, HTTPS 환경에서는 Netlify Function `/.netlify/functions/backend-proxy` 를 통해 원격 API(`15.165.213.11:8080`) 호출로 mixed-content 를 피합니다.
- 테마/아이템/퀴즈 응답을 다양한 스키마에서 정규화해 프론트엔드가 공통 필드를 사용하도록 합니다. 원격 호출 실패 시 `db.ts` 에 있는 로컬 목 데이터를 사용합니다.
- 퀴즈/리워드 제출 등 POST 요청은 백엔드 프록시를 통해 전달되며, 제출 내역은 `localStorage` 에도 보존됩니다.
- 클라이언트 측에서는 아이템별 사용자 지정 영상 URL, 음성 재생 상태 등도 `localStorage` 로 캐시합니다.

### 서버리스 / LLM
- `netlify/functions/genai.js` 는 OpenAI Chat Completions 프록시로, 필요 시 백엔드 `/api/chat` 결과를 우선 사용하거나 `forceOpenAI` 플래그로 직접 OpenAI 응답을 반환합니다. 띄어쓰기 교정을 위한 추가 OpenAI 호출도 같은 함수에서 처리합니다.
- `netlify/functions/backend-proxy.js` 는 모든 백엔드 REST 요청을 안전하게 중계합니다.
- `services/geminiService.ts` 는 Google AI Studio(Gemini) 채팅 세션을 위한 래퍼입니다.

## 동작 흐름

1. **홈 진입** – 앱 로드 시 `getThemes()` 로 테마 목록을 불러오고, 사용자가 연령·테마를 선택해 "관람 시작"을 누르면 `App` 상태가 `Screen.DOCENT` 로 이동합니다.
2. **도슨트 투어 초기화** – `DocentScreen` 이 마운트되면 1초간 준비 모달을 보여주고, 동시에 `getItems`, `getQuizzes` 로 데이터를 불러와 코스·퀴즈·배경 영상을 세팅합니다. 각 코스 설명은 Web Speech API 로 낭독되고, 미니맵/코스 패널에서 자유롭게 이동할 수 있습니다.
3. **AI 상호작용** – 투어 중 "하모에게 질문" 버튼을 누르면 `ChatScreen` 으로 이동합니다. 사용자는 텍스트 입력 또는 마이크 입력을 선택할 수 있으며, 요청은 `/.netlify/functions/genai` 에 전달됩니다. "기본 질문" 버튼은 RAG 없이 OpenAI 결과만 반환합니다.
4. **미션 & 리워드** – 코스를 모두 들은 뒤 "미션"으로 이동하면 퀴즈를 풀고, 완료 시 `CompletionScreen` 으로 이동해 이메일·테마 정보를 포함한 리워드 신청을 전송합니다. 제출 내역은 로컬/백엔드 양쪽에 기록됩니다.