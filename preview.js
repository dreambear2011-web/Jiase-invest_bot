/**
 * preview.js  (신규 · 두 봇 공유)
 * "다가오는 N일 흐름" 프리뷰 — 랜딩(index.html) renderMonthly의 봇 텍스트판.
 * todayFortune(by, dateObj).typeLabel 을 그대로 재사용하므로 새 계산 로직 없음.
 *
 * ★ 봇을 "랜딩보다 살짝 풍성"하게 만드는 핵심 블록.
 *   랜딩은 월 전체 색점 캘린더(1회 방문용), 봇은 매일 오니까 앞으로 5일만(피로 방지).
 *
 * 의존: bornbone_today.js (두 봇에 이미 존재)
 */

'use strict';
const { todayFortune } = require('./bornbone_today');

function kstParts(date) {
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(date);
  const g = (t) => +p.find((x) => x.type === t).value;
  return { y: g('year'), m: g('month'), d: g('day') };
}

/** KST 기준 "M월 D일" — 블록 헤더용 */
function kstMonthDay(date = new Date()) {
  const { m, d } = kstParts(date);
  return `${m}월 ${d}일`;
}

/**
 * 앞으로 days일 흐름(오늘 포함). parse_mode:'HTML' 문자열 반환.
 * KST 변환은 todayFortune 내부(Intl Asia/Seoul)가 전담하므로
 * UTC 정오 인스턴스만 넘기면 서버 타임존 무관하게 정확하다.
 */
function buildWeekPreview(birthYear, days = 5, now = new Date()) {
  const { y, m, d } = kstParts(now);
  const lines = [];
  for (let i = 0; i < days; i++) {
    // 03:00 UTC = 12:00 KST → 해당 KST 달력일로 고정. 월말 넘김은 Date가 자동 정규화.
    const inst = new Date(Date.UTC(y, m - 1, d + i, 3, 0, 0));
    const { d: dd } = kstParts(inst);
    const label = todayFortune(birthYear, inst).typeLabel; // 확장 / 마찰 / 정체
    const tag = i === 0 ? `${dd}일(오늘)` : `${dd}일`;
    lines.push(`· ${tag} — ${label}`);
  }
  return `📅 <b>다가오는 ${days}일 흐름</b>\n${lines.join('\n')}`;
}

module.exports = { buildWeekPreview, kstMonthDay };
