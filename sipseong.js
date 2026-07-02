/**
 * sipseong.js
 * "오늘의 나" §59-8 / 투자봇 신규 연동용 — 오늘 일진 천간이 내 일간 기준
 * 비겁/식상/재성/관성/인성 중 무엇인지 판별 후 영역(일상어 또는 투자어)로 변환.
 * lunar-javascript 사용 (지아세_랜딩_P3.html과 동일 엔진). 두 봇이 동일 파일 공유.
 *
 * v2 — "오늘의 나" 정보량 강화: 영역 설명 1문장(SIP_DAILY_DETAIL) +
 * 오늘의 행동 조언 1문장(SIP_DAILY_ACTION) 추가. 기존 함수·시그니처는 변경 없음.
 */

'use strict';
const { Solar } = require('lunar-javascript');

const GAN_KR = {
  '甲': '갑', '乙': '을', '丙': '병', '丁': '정', '戊': '무',
  '己': '기', '庚': '경', '辛': '신', '壬': '임', '癸': '계'
};

const GAN_OH = {
  갑: '木', 을: '木', 병: '火', 정: '火', 무: '土',
  기: '土', 경: '金', 신: '金', 임: '水', 계: '水'
};

const SHENG = { 木: '火', 火: '土', 土: '金', 金: '水', 水: '木' }; // A生B
const KE    = { 木: '土', 土: '水', 水: '火', 火: '金', 金: '木' }; // A克B

// "오늘의 나" — 모드1 일상어 (§59-8 확정)
const SIP_TO_AREA = {
  비겁: '나 혼자 하는 일·내 줏대',
  식상: '말하고 표현하고 만드는 일',
  재성: '손에 잡히는 결과·실속',
  관성: '사람들과의 관계·소속된 자리',
  인성: '배우고 쉬는 시간'
};

// "투자봇" — 재물 콘텍스트 어휘 (카테고리명만, 종목·코인명 절대 미사용 — §59-1)
const SIP_TO_INVEST = {
  비겁: '내가 직접 주도하는 결',
  식상: '굴리고 회전시키는 결',
  재성: '손에 바로 잡히는 결',
  관성: '계약·책임이 따라붙는 결',
  인성: '쌓아두고 지키는 결'
};

// "오늘의 나" — 영역이 왜 활성화되는지 1문장 설명
const SIP_DAILY_DETAIL = {
  비겁: '오늘 일진이 당신과 같은 결의 기운이라, 평소보다 더 또렷하게 \'내 방식\'이 드러나는 날입니다.',
  식상: '오늘 일진이 당신이 만들어내는 쪽 기운과 만나, 표현하고 드러내는 힘이 평소보다 세지는 날입니다.',
  재성: '오늘 일진이 당신이 다스리는 쪽 기운과 만나, 손에 잡히는 결과 쪽으로 시선이 가는 날입니다.',
  관성: '오늘 일진이 당신을 다스리는 쪽 기운과 만나, 사람들과의 관계·소속된 자리 쪽으로 신경이 쓰이는 날입니다.',
  인성: '오늘 일진이 당신을 채워주는 쪽 기운과 만나, 배우고 쉬는 쪽으로 마음이 기우는 날입니다.'
};

// "오늘의 나" — 십성별 오늘의 행동 조언 1문장
const SIP_DAILY_ACTION = {
  비겁: '혼자 결정하고 밀어붙여도 좋은 날입니다. 오늘은 남의 의견보다 내 판단을 믿어보세요.',
  식상: '미뤄둔 말이나 작업이 있다면, 오늘 한번 꺼내어 보여주기 좋은 때입니다.',
  재성: '오늘은 정산하거나 마무리 짓는 일을 처리하기 좋습니다.',
  관성: '오늘은 평소 미뤄둔 연락이나 인사를 챙기면 도움이 됩니다.',
  인성: '오늘은 새로 배우거나 충분히 쉬는 시간을 가지면 좋습니다.'
};

function getDayGan(birthYear, birthMonth, birthDay) {
  const solar = Solar.fromYmd(birthYear, birthMonth, birthDay);
  const lunar = solar.getLunar();
  const ganHanja = lunar.getDayGan();
  return GAN_KR[ganHanja] || ganHanja;
}

// ⚠️ 서버 타임존 버그 수정[2026-07-01]: Solar.fromDate(date)는 Date를 서버 로컬
// 타임존 기준으로 년/월/일을 읽는다. Railway 등 UTC 서버에서 KST 07~08시 발송 시
// UTC로는 아직 전날 22~23시라서 일진이 하루 밀려 계산되는 문제가 있었음(매일 재현).
// → 타임존 무관하게 항상 Asia/Seoul 달력 기준 연/월/일로 변환 후 Solar.fromYmd 사용.
function resolveKstYmd(date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(date);
  const get = (t) => +parts.find(p => p.type === t).value;
  return { y: get('year'), m: get('month'), d: get('day') };
}

function getTodayDayGan(date = new Date()) {
  const { y, m, d } = resolveKstYmd(date);
  const solar = Solar.fromYmd(y, m, d);
  const lunar = solar.getLunar();
  const ganHanja = lunar.getDayGan();
  return GAN_KR[ganHanja] || ganHanja;
}

function getSipseong(myDayGan, todayDayGan) {
  const my = GAN_OH[myDayGan];
  const today = GAN_OH[todayDayGan];
  if (!my || !today) return null;
  if (my === today) return '비겁';
  if (SHENG[my] === today) return '식상';   // 내가 생함
  if (SHENG[today] === my) return '인성';   // 나를 생함
  if (KE[my] === today) return '재성';      // 내가 극함
  if (KE[today] === my) return '관성';      // 나를 극함
  return null;
}

/**
 * 통합 API — birthYear/Month/Day → 오늘의 십성·영역.
 * birthMonth/birthDay 없으면(기존 가입자, 연도만 저장) null 반환 — 재수집 트리거용.
 * @param {'daily'|'invest'} [flavor='daily'] - 'daily'=오늘의 나(일상어) / 'invest'=투자봇(재물어)
 */
function getTodayDomain(birthYear, birthMonth, birthDay, date = new Date(), flavor = 'daily') {
  if (!birthMonth || !birthDay) return null;
  const myGan = getDayGan(birthYear, birthMonth, birthDay);
  const todayGan = getTodayDayGan(date);
  const sip = getSipseong(myGan, todayGan);
  if (!sip) return null;
  const label = flavor === 'invest' ? SIP_TO_INVEST[sip] : SIP_TO_AREA[sip];
  return { sipseong: sip, label };
}

// "투자봇" — 영역이 왜 활성화되는지 1문장 설명 (포지션 행동 어휘는 investPhrases.js가 전담 —
// 여기서는 설명만, 별도 행동 지시는 추가하지 않음 — §59-1 법적 경계선 보호)
const SIP_INVEST_DETAIL = {
  비겁: '오늘 일진이 당신과 같은 결의 기운이라, 평소보다 더 주도적으로 판단하게 되는 날입니다.',
  식상: '오늘 일진이 당신이 굴리는 쪽 기운과 만나, 회전·전환 쪽으로 마음이 쏠리는 날입니다.',
  재성: '오늘 일진이 당신이 다스리는 쪽 기운과 만나, 손에 잡히는 결과 쪽으로 시선이 가는 날입니다.',
  관성: '오늘 일진이 당신을 다스리는 쪽 기운과 만나, 계약·책임이 따라붙는 결정 쪽으로 무게가 실리는 날입니다.',
  인성: '오늘 일진이 당신을 채워주는 쪽 기운과 만나, 쌓아두고 지키는 쪽으로 마음이 기우는 날입니다.'
};

module.exports = {
  getDayGan, getTodayDayGan, getSipseong, getTodayDomain,
  SIP_TO_AREA, SIP_TO_INVEST, SIP_DAILY_DETAIL, SIP_DAILY_ACTION, SIP_INVEST_DETAIL
};
