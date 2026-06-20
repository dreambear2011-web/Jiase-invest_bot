/**
 * sipseong.js
 * "오늘의 나" §59-8 — ③ 오늘의 영역 산출.
 * 오늘 일진 천간이 내 일간 기준 비겁/식상/재성/관성/인성 중 무엇인지 판별 후
 * 모드1 일상어로 변환한다. lunar-javascript 사용 (지아세_랜딩_P3.html과 동일 엔진).
 */

'use strict';
const { Solar } = require('lunar-javascript');

// 한자 천간 → 한글
const GAN_KR = {
  '甲': '갑', '乙': '을', '丙': '병', '丁': '정', '戊': '무',
  '己': '기', '庚': '경', '辛': '신', '壬': '임', '癸': '계'
};

// 천간 → 오행
const GAN_OH = {
  갑: '木', 을: '木', 병: '火', 정: '火', 무: '土',
  기: '土', 경: '金', 신: '金', 임: '水', 계: '水'
};

const SHENG = { 木: '火', 火: '土', 土: '金', 金: '水', 水: '木' }; // A生B (A가 B를 생함)
const KE    = { 木: '土', 土: '水', 水: '火', 火: '金', 金: '木' }; // A克B (A가 B를 극함)

const SIP_TO_AREA = {
  비겁: '나 혼자 하는 일·내 줏대',
  식상: '말하고 표현하고 만드는 일',
  재성: '손에 잡히는 결과·실속',
  관성: '사람들과의 관계·소속된 자리',
  인성: '배우고 쉬는 시간'
};

/**
 * 생년월일(양력)로 일간(한글 1자) 산출. 시(時) 불필요.
 */
function getDayGan(birthYear, birthMonth, birthDay) {
  const solar = Solar.fromYmd(birthYear, birthMonth, birthDay);
  const lunar = solar.getLunar();
  const ganHanja = lunar.getDayGan(); // '甲'~'癸'
  return GAN_KR[ganHanja] || ganHanja;
}

/**
 * 오늘 날짜의 일간(한글 1자) 산출.
 */
function getTodayDayGan(date = new Date()) {
  const solar = Solar.fromDate(date);
  const lunar = solar.getLunar();
  const ganHanja = lunar.getDayGan();
  return GAN_KR[ganHanja] || ganHanja;
}

/**
 * 내 일간 vs 오늘 일간 → 십성 판별.
 */
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
 * 통합 API — birthYear/Month/Day → 오늘의 영역 일상어 한 줄.
 * birthMonth/birthDay 없으면(기존 가입자) null 반환 — 재수집 트리거용.
 */
function todayArea(birthYear, birthMonth, birthDay, date = new Date()) {
  if (!birthMonth || !birthDay) return null;
  const myDayGan = getDayGan(birthYear, birthMonth, birthDay);
  const todayDayGan = getTodayDayGan(date);
  const sip = getSipseong(myDayGan, todayDayGan);
  if (!sip) return null;
  return { sip, area: SIP_TO_AREA[sip] };
}

module.exports = { getDayGan, getTodayDayGan, getSipseong, todayArea, SIP_TO_AREA };
