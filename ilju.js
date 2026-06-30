/**
 * ilju.js
 * 60갑자 일주 정체성 데이터 — jiaseh_ilju_v2.html DB 추출본.
 * "오늘의 나" 봇 정체성 한 줄용. lunar-javascript로 생일의 일주(干支) 산출.
 *
 * 노출 빈도: 매일 노출 시 단정·세뇌처럼 느껴질 위험 → 약 30% 확률로만 노출.
 * 노출 시에도 3가지 표현 틀 중 무작위 선택 — 같은 문장 반복 방지.
 */

'use strict';
const { Solar } = require('lunar-javascript');

const ILGAN = {
  甲: { gisil: '굵게 뻗는 큰 나무처럼, 먼저 시작하고 이끄는 힘이 있습니다.' },
  乙: { gisil: '휘어도 꺾이지 않는 풀·덩굴처럼, 환경에 맞춰 살아남는 적응력이 있습니다.' },
  丙: { gisil: '환하게 퍼지는 태양처럼, 드러나고 주위를 밝히는 힘이 있습니다.' },
  丁: { gisil: '안으로 모으는 촛불처럼, 한곳에 집중해 깊이 비추는 힘이 있습니다.' },
  戊: { gisil: '높고 단단한 산처럼, 흔들려도 중심을 잡고 버티는 힘이 있습니다.' },
  己: { gisil: '기름진 밭흙처럼, 받아들이고 길러내며 품는 힘이 있습니다.' },
  庚: { gisil: '벼려지지 않은 무쇠처럼, 결단하고 밀어붙이는 힘이 있습니다.' },
  辛: { gisil: '세공된 보석처럼, 예리하고 섬세하게 가려내는 판단력이 있습니다.' },
  壬: { gisil: '흐르는 큰 물처럼, 넓게 품고 지혜로 돌아가는 힘이 있습니다.' },
  癸: { gisil: '스며드는 이슬·생명수처럼, 끊임없이 적시고 살려내는 힘이 있습니다.' }
};

const DB = [
  { ilju: '甲子', oneline: '먼저 달리되 요령 있게 돌아가는 사람' },
  { ilju: '甲寅', oneline: '스스로 길을 만들며 앞으로 나아가는 사람' },
  { ilju: '甲辰', oneline: '성과를 향해 담백하게 움직이는 사람' },
  { ilju: '甲午', oneline: '표현하고 만들어내며 묵묵히 쌓는 사람' },
  { ilju: '甲申', oneline: '전례 없이 새 길을 여는 사람' },
  { ilju: '甲戌', oneline: '성과를 향해 꿋꿋하게 노력하는 사람' },
  { ilju: '乙丑', oneline: '성과를 향해 담백하게 적응하는 사람' },
  { ilju: '乙卯', oneline: '내 방식대로 끝까지 해내는 사람' },
  { ilju: '乙巳', oneline: '표현하며 매일 새로워지는 사람' },
  { ilju: '乙未', oneline: '성과를 향해 꿋꿋하게 버티는 사람' },
  { ilju: '乙酉', oneline: '틀을 벗어나 새 방식을 찾는 사람' },
  { ilju: '乙亥', oneline: '배우며 묵묵히 쌓아가는 사람' },
  { ilju: '丙子', oneline: '용의주도하게 자리를 준비하는 사람' },
  { ilju: '丙寅', oneline: '따뜻하게 배우고 밝히는 사람' },
  { ilju: '丙辰', oneline: '보여주는 힘으로 표현하는 사람' },
  { ilju: '丙午', oneline: '단숨에 정상을 향해 달리는 사람' },
  { ilju: '丙申', oneline: '눈치 빠르게 성과를 읽는 사람' },
  { ilju: '丙戌', oneline: '표현하며 차곡차곡 모아가는 사람' },
  { ilju: '丁丑', oneline: '집중하며 차곡차곡 모아가는 사람' },
  { ilju: '丁卯', oneline: '눈치 빠르게 배우고 집중하는 사람' },
  { ilju: '丁巳', oneline: '깊이 집중하며 정점을 향해 달리는 사람' },
  { ilju: '丁未', oneline: '표현하는 힘이 빛나는 사람' },
  { ilju: '丁酉', oneline: '따뜻하게 성과를 쌓아가는 사람' },
  { ilju: '丁亥', oneline: '용의주도하게 자리를 준비하는 사람' },
  { ilju: '戊子', oneline: '용의주도하게 성과를 준비하는 사람' },
  { ilju: '戊寅', oneline: '따뜻하게 버티며 자리를 지키는 사람' },
  { ilju: '戊辰', oneline: '보여주는 힘으로 밀어붙이는 사람' },
  { ilju: '戊午', oneline: '배움으로 무장하고 정점을 향해 달리는 사람' },
  { ilju: '戊申', oneline: '눈치 빠르게 표현하는 사람' },
  { ilju: '戊戌', oneline: '차곡차곡 모으며 버티는 사람' },
  { ilju: '己丑', oneline: '차곡차곡 모으며 품는 사람' },
  { ilju: '己卯', oneline: '눈치 빠르게 자리를 잡는 사람' },
  { ilju: '己巳', oneline: '배움으로 무장하고 정점을 향해 품는 사람' },
  { ilju: '己未', oneline: '보여주는 힘으로 품는 사람' },
  { ilju: '己酉', oneline: '따뜻하게 표현하며 길러내는 사람' },
  { ilju: '己亥', oneline: '용의주도하게 성과를 품는 사람' },
  { ilju: '庚子', oneline: '결단하며 묵묵히 쌓는 사람' },
  { ilju: '庚寅', oneline: '전례 없이 성과를 향해 달리는 사람' },
  { ilju: '庚辰', oneline: '배움으로 무장하고 꿋꿋하게 결단하는 사람' },
  { ilju: '庚午', oneline: '매일 새로워지며 자리를 잡는 사람' },
  { ilju: '庚申', oneline: '결단하고 밀어붙이며 발이 땅에 닿는 사람' },
  { ilju: '庚戌', oneline: '배움으로 담백하게 결단하는 사람' },
  { ilju: '辛丑', oneline: '배움으로 무장하고 꿋꿋하게 가려내는 사람' },
  { ilju: '辛卯', oneline: '전례 없이 성과를 가려내는 사람' },
  { ilju: '辛巳', oneline: '묵묵히 자리를 지키며 가려내는 사람' },
  { ilju: '辛未', oneline: '배움으로 담백하게 가려내는 사람' },
  { ilju: '辛酉', oneline: '섬세하게 가려내며 발이 땅에 닿는 사람' },
  { ilju: '辛亥', oneline: '매일 새로워지며 가려내는 사람' },
  { ilju: '壬子', oneline: '넓게 품으며 정점을 향해 달리는 사람' },
  { ilju: '壬寅', oneline: '눈치 빠르게 표현하며 흐르는 사람' },
  { ilju: '壬辰', oneline: '차곡차곡 모으며 자리를 지키는 사람' },
  { ilju: '壬午', oneline: '용의주도하게 성과를 향해 흐르는 사람' },
  { ilju: '壬申', oneline: '따뜻하게 배우며 넓게 품는 사람' },
  { ilju: '壬戌', oneline: '보여주는 힘으로 자리를 지키는 사람' },
  { ilju: '癸丑', oneline: '보여주는 힘으로 자리를 스미는 사람' },
  { ilju: '癸卯', oneline: '따뜻하게 표현하며 스며드는 사람' },
  { ilju: '癸巳', oneline: '용의주도하게 성과를 향해 스미는 사람' },
  { ilju: '癸未', oneline: '차곡차곡 모으며 자리를 스미는 사람' },
  { ilju: '癸酉', oneline: '눈치 빠르게 배우며 스미는 사람' },
  { ilju: '癸亥', oneline: '끝까지 스며들며 정점을 향해 달리는 사람' }
];

/**
 * 생년월일 → 일주(干支) + 정체성 데이터 산출.
 */
function getIljuInfo(birthYear, birthMonth, birthDay) {
  const solar = Solar.fromYmd(birthYear, birthMonth, birthDay);
  const lunar = solar.getLunar();
  const ganzhi = lunar.getDayGan() + lunar.getDayZhi(); // 예: '甲子'
  const entry = DB.find(d => d.ilju === ganzhi);
  const gan = lunar.getDayGan();
  const gisil = (ILGAN[gan] && ILGAN[gan].gisil) || '';
  return entry ? { ilju: ganzhi, oneline: entry.oneline, gisil } : null;
}

// 단정형("당신은 ~사람입니다") 대신 묘사형 — 매번 다른 틀로 부드럽게 표현
const INTRO_TEMPLATES = [
  (info) => `오늘은 ${info.ilju} 일주가 가진 결이 유독 또렷하게 느껴지는 날입니다. ${info.gisil}`,
  (info) => `${info.gisil} 이것이 당신의 ${info.ilju} 일주에 새겨진 결입니다.`,
  (info) => `${info.ilju} 일주에게는, ${info.oneline}는 흐름이 있습니다.`
];

/**
 * 일주 정체성 한 줄 — 약 30% 확률로만 반환(null이면 미노출).
 * 매일 노출 시 단정·세뇌처럼 느껴지는 것을 방지하기 위한 의도적 설계.
 */
function getIljuIntroLine(birthYear, birthMonth, birthDay) {
  const info = getIljuInfo(birthYear, birthMonth, birthDay);
  if (!info) return null;
  if (Math.random() >= 0.3) return null;
  const templateIdx = Math.floor(Math.random() * INTRO_TEMPLATES.length);
  return INTRO_TEMPLATES[templateIdx](info);
}

module.exports = { getIljuInfo, getIljuIntroLine, DB, ILGAN };
