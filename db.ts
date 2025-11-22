
export const THEMES_DB = [
  {
    id: 'imjin_war',
    title: '임진왜란',
    description: '진주성에서 벌어진 치열했던 밤의 역사를 탐험하세요.',
    longDescription: '임진왜란은 1592년부터 1598년까지 벌어진 일련의 전쟁입니다.\n이 침략에는 일본, 조선, 그리고 명나라가 관련되어 있습니다.\n이 시대의 주요 전투, 인물, 기술 발전에 대해 깊이 알아보세요.',
    contextPrompt: '당신은 임진왜란을 전문으로 하는 역사학자입니다.'
  },
  {
    id: 'jinju_museum',
    title: '국립진주박물관',
    description: '진주의 밤, 진주성 안에서 빛나는 역사를 만나보세요.',
    longDescription: '국립진주박물관은 임진왜란을 중심으로 한 전문 역사 박물관입니다.\n진주성 내에 위치하고 있으며, 전쟁의 역사와 지역 문화를 심도 있게 조명합니다.\n다양한 유물과 전시를 통해 그 시대의 치열했던 역사를 생생하게 느껴보세요.',
    contextPrompt: '당신은 국립진주박물관의 지식이 풍부한 큐레이터이며, 특히 임진왜란에 대한 전문가입니다.'
  },
  {
    id: 'gonryongpo',
    title: '곤룡포',
    description: '조선 왕의 상징적인 붉은 용포의 위엄을 느껴보세요.',
    longDescription: '곤룡포는 조선 시대 왕들이 입었던 공식 복장입니다.\n황금 용 문양으로 장식되어 왕의 권위와 신성한 통치권을 상징했습니다.\n복잡한 디자인, 재료, 그리고 관련된 의식에 대해 알아보세요.',
    contextPrompt: '당신은 조선 왕실 의복 및 직물 전문가입니다.'
  },
];

export const QUIZZES_DB = {
  'imjin_war': [
    { question: '임진왜란은 몇 년도에 발발했나요?', options: ['1592년', '1598년', '1602년', '1492년'], correctAnswer: '1592년' },
    { question: '이순신 장군이 한산도 대첩에서 사용한 전술의 이름은 무엇인가요?', options: ['학익진', '어영진', '팔진도', '거북선'], correctAnswer: '학익진' },
    { question: '행주대첩을 이끈 장군은 누구인가요?', options: ['권율', '김시민', '이순신', '신립'], correctAnswer: '권율' },
    { question: '임진왜란 당시 조선의 왕은 누구였나요?', options: ['선조', '광해군', '인조', '효종'], correctAnswer: '선조' },
    { question: '일본군을 이끌고 조선을 침략한 인물은 누구인가요?', options: ['도요토미 히데요시', '도쿠가와 이에야스', '오다 노부나가', '사이토 도산'], correctAnswer: '도요토미 히데요시' }
  ],
  'jinju_museum': [
    { question: '국립진주박물관은 어디에 위치하고 있나요?', options: ['진주성', '창덕궁', '경복궁', '수원화성'], correctAnswer: '진주성' },
    { question: '국립진주박물관이 전문으로 다루는 주제는 무엇인가요?', options: ['임진왜란', '고려시대', '삼국시대', '조선 후기'], correctAnswer: '임진왜란' },
    { question: '진주대첩에서 활약한 장군은 누구인가요?', options: ['김시민', '이순신', '권율', '강감찬'], correctAnswer: '김시민' }
  ],
  'gonryongpo': [
    { question: '곤룡포는 누가 입는 옷이었나요?', options: ['왕', '왕비', '신하', '공주'], correctAnswer: '왕' },
    { question: '곤룡포에 주로 수놓아진 동물은 무엇인가요?', options: ['용', '호랑이', '봉황', '기린'], correctAnswer: '용' },
    { question: '왕의 곤룡포 가슴과 등, 어깨에 있는 용의 발톱은 몇 개인가요?', options: ['5개', '4개', '3개', '2개'], correctAnswer: '5개' }
  ]
};