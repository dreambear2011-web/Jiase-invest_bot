/**
 * bornbone_today.js
 * "오늘의 나" 구성기학 엔진 — 지아세_랜딩_P3.html에서 추출한 단일 모듈.
 * 외부 의존 0 (계산 로직 전부 자체 포함). KB §41-5/§59-7 참조.
 *
 * 계산 로직 수정은 이 파일에서만. 웹(지아세_랜딩_P3.html)과 텔레그램 봇이
 * 동일 이 로직을 각자 환경에 맞게 이식해서 사용 — 한 곳만 고치면 동기화.
 *
 * API: todayFortune(birthYear, dateObj?) → { honmeisei, type, typeLabel, dir, dirLabel }
 */

'use strict';

const NINE_STARS = [
  { num: 1, element: '수' }, { num: 2, element: '토' }, { num: 3, element: '목' },
  { num: 4, element: '목' }, { num: 5, element: '토' }, { num: 6, element: '금' },
  { num: 7, element: '금' }, { num: 8, element: '토' }, { num: 9, element: '화' }
];

const ELEMENT_RELATION = {
  '수': { generates: '목', generated: '금', kills: '화', killed: '토' },
  '목': { generates: '화', generated: '수', kills: '토', killed: '금' },
  '화': { generates: '토', generated: '목', kills: '금', killed: '수' },
  '토': { generates: '금', generated: '화', kills: '수', killed: '목' },
  '금': { generates: '수', generated: '토', kills: '목', killed: '화' }
};

const FLY_ORDER = [4, 8, 2, 6, 0, 3, 7, 5, 1];
const DIR_LABELS = ['남동', '남', '남서', '동', '중', '서', '북동', '북', '북서'];
const POS_ELEMENT = ['목', '화', '토', '목', '토', '금', '토', '수', '금'];
const RISSHUN_DAY = 4; // 입춘 경계(2/4) — 본명성 연 경계 기준

function calcHonmeisei(year, month, day) {
  if (month < 2 || (month === 2 && day < RISSHUN_DAY)) year--;
  let sum = 0;
  String(year).split('').forEach(d => sum += parseInt(d, 10));
  while (sum > 9) {
    let s = 0;
    String(sum).split('').forEach(d => s += parseInt(d, 10));
    sum = s;
  }
  let r = 11 - sum;
  if (r > 9) r -= 9;
  return r;
}

function calcDayCenterStar(year, month, day) {
  const DAY = 86400000;
  const ANCHOR = Date.UTC(2026, 5, 19); // 2026-06-19 하지 부두 甲子 (음둔 9紫) — 도사폰 검증 앵커
  const tgt = Date.UTC(year, month - 1, day);
  const idx = d => Math.round((d - ANCHOR) / DAY);
  const isGapja = d => ((((idx(d) % 60) + 60) % 60) === 0);

  function buduNear(s) {
    let best = null, bd = 99;
    for (let k = -35; k <= 35; k++) {
      const d = s + k * DAY;
      if (isGapja(d) && Math.abs(k) < bd) { bd = Math.abs(k); best = d; }
    }
    return best;
  }

  const cands = [];
  for (let Y = year - 1; Y <= year + 1; Y++) {
    cands.push({ d: buduNear(Date.UTC(Y, 5, 21)), dun: 'eum' });   // 하지부두 → 음둔
    cands.push({ d: buduNear(Date.UTC(Y, 11, 22)), dun: 'yang' }); // 동지부두 → 양둔
  }
  cands.sort((a, b) => a.d - b.d);

  let gov = cands[0];
  for (const c of cands) { if (c.d <= tgt) gov = c; else break; }

  const N = Math.round((tgt - gov.d) / DAY);
  let center = gov.dun === 'yang' ? (N % 9) + 1 : 9 - (N % 9);
  if (center < 1) center += 9;
  return center;
}

function generateChart(centerStar) {
  const chart = new Array(9).fill(0);
  let star = centerStar;
  for (let i = 0; i < 9; i++) {
    chart[FLY_ORDER[i]] = star;
    star = star >= 9 ? 1 : star + 1;
  }
  return chart;
}

function getOppositePosition(pos) {
  return ({ 0: 8, 1: 7, 2: 6, 3: 5, 5: 3, 6: 2, 7: 1, 8: 0 })[pos];
}

// 판별 우선순위: ①입중궁/오황/암검→정체(B) ②퇴기→정체(B) ③살기/사기→마찰(A) ④생기/비화→확장(C)
function todayType(honmeisei, dayChart) {
  const honmeiEl = NINE_STARS[honmeisei - 1].element;
  const pos = dayChart.indexOf(honmeisei);
  if (pos === 4) return 'B'; // 입중궁
  const ns = POS_ELEMENT[pos];
  const rel = ELEMENT_RELATION[honmeiEl];
  if (ns === rel.killed) return 'A'; // 살기
  if (ns === rel.kills) return 'A';  // 사기
  if (ns === rel.generates) return 'B'; // 퇴기
  return 'C'; // 생기·비화
}

function todayLuckyDir(honmeisei, dayChart) {
  const honmeiEl = NINE_STARS[honmeisei - 1].element;
  const rel = ELEMENT_RELATION[honmeiEl];
  const goouPos = dayChart.indexOf(5); // 오황
  const ankenPos = goouPos !== 4 ? getOppositePosition(goouPos) : -1; // 암검
  const honmeiPos = dayChart.indexOf(honmeisei);
  const tekiPos = getOppositePosition(honmeiPos);
  const rank = { '생기': 3, '비화': 2, '퇴기': 1 };
  let best = null;

  for (let pos = 0; pos < 9; pos++) {
    if (pos === 4) continue;
    if (pos === goouPos || pos === ankenPos) continue;
    if (pos === honmeiPos || pos === tekiPos) continue;
    const el = NINE_STARS[dayChart[pos] - 1].element;
    let kind = null;
    if (el === rel.generated) kind = '생기';
    else if (el === honmeiEl && dayChart[pos] !== honmeisei) kind = '비화';
    else if (el === rel.generates) kind = '퇴기';
    if (kind && (!best || rank[kind] > rank[best.kind])) best = { pos, kind };
  }
  return best ? { dir: DIR_LABELS[best.pos], kind: best.kind, pos: best.pos } : null;
}

const TYPE_LABEL = { A: '마찰', B: '정체', C: '확장' };

/**
 * todayFortune(birthYear, dateObj?)
 * @param {number} birthYear - 태어난 해(양력)
 * @param {Date} [dateObj] - 기준 날짜 (기본: 오늘)
 * @returns {{honmeisei:number, type:'A'|'B'|'C', typeLabel:string, dir:string|null, dirLabel:string|null}}
 */
function todayFortune(birthYear, dateObj) {
  const d = dateObj || new Date();
  const y = d.getFullYear(), m = d.getMonth() + 1, day = d.getDate();
  const honmeisei = calcHonmeisei(birthYear, 6, 15); // 본명성 산출용 기준일(월일은 영향 없음, 연도만 사용)
  const dayChart = generateChart(calcDayCenterStar(y, m, day));
  const type = todayType(honmeisei, dayChart);
  const lucky = todayLuckyDir(honmeisei, dayChart);
  return {
    honmeisei,
    type,
    typeLabel: TYPE_LABEL[type],
    dir: lucky ? lucky.dir : null,
    dirLabel: lucky ? lucky.dir + ' 방향' : null
  };
}

module.exports = { todayFortune, calcHonmeisei, calcDayCenterStar, generateChart, todayType, todayLuckyDir };
