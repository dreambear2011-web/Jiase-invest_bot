/**
 * sipseong.js
 * "오늘의 나" §59-8 / 투자봇 신규 연동용 — 오늘 일진 천간이 내 일간 기준
 * 비겁/식상/재성/관성/인성 중 무엇인지 판별 후 영역(일상어 또는 투자어)로 변환.
 * lunar-javascript 사용 (지아세_랜딩_P3.html과 동일 엔진). 두 봇이 동일 파일 공유.
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

function getDayGan(birthYear, birthMonth, birthDay) {
  const solar = Solar.fromYmd(birthYear, birthMonth, birthDay);
  const lunar = solar.getLunar();
  const ganHanja = lunar.getDayGan();
  return GAN_KR[ganHanja] || ganHanja;
}

function getTodayDayGan(date = new Date()) {
  const solar = Solar.fromDate(date);
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

module.exports = {
  getDayGan, getTodayDayGan, getSipseong, getTodayDomain,
  SIP_TO_AREA, SIP_TO_INVEST
};
