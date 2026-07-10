/**
 * assetMapping.js
 * "오늘의 투자운" — 거시 흐름(오늘 일진 오행) + 오늘의 영역(자산군) 산출.
 * §59-2 자산군↔오행 매핑 테이블 그대로 적용. lunar-javascript로 오늘 일진 천간 산출.
 *
 * v2 — 표현 풍부화. 공식 조합형(오행+동사) 대신 오행×유형 15조합을 직접 풀어쓴
 * 문장으로 교체. ohang→자산군 매핑(OH_TO_ASSET)과 함수 시그니처는 변경 없음
 * (invest-bot.js 쪽 호출 코드 그대로 사용 가능).
 *
 * ※ 법적 경계선(§59-1): 자산군은 항상 카테고리명만. 종목·코인명 절대 사용 금지.
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

// §59-2 자산군 ↔ 오행 매핑 (카테고리명만 — 종목·코인명 절대 미사용)
const OH_TO_ASSET = {
  木: '성장 계열',
  火: '에너지 계열',
  土: '실물·안정 계열',
  金: '금융·경화 계열',
  水: '유동성 계열'
};

/**
 * 거시 흐름 — 오행(木火土金水) × 유형(A 마찰 / B 정체 / C 확장) 15조합.
 * 공식으로 조합하지 않고 직접 풀어쓴 문장 — 표현 풍부화의 핵심.
 */
const MACRO_TEXT = {
  木: {
    A: '오늘은 木기운이 뻗어가다 가지가 엇갈리듯 부딪히는 날입니다. ' +
       '뻗어나가려는 힘은 있지만 곳곳에서 결이 어긋나기 쉽습니다.',
    B: '오늘은 木기운이 뿌리를 내리듯 차분히 고이는 날입니다. ' +
       '서두르지 않고 천천히 안으로 쌓아가는 결입니다.',
    C: '오늘은 木기운이 새순처럼 힘차게 뻗어오르는 날입니다. ' +
       '자라나려는 흐름이 막힘없이 트여 있는 날입니다.'
  },
  火: {
    A: '오늘은 火기운이 불씨끼리 부딪히듯 거세게 충돌하는 날입니다. ' +
       '뜨거운 만큼 마찰도 커서, 자칫 화상을 입기 쉬운 결입니다.',
    B: '오늘은 火기운이 잔불처럼 잦아들며 고이는 날입니다. ' +
       '겉으로는 잠잠해도 속에서는 온기가 천천히 다져지는 흐름입니다.',
    C: '오늘은 火기운이 불꽃처럼 힘차게 타오르는 날입니다. ' +
       '환하게 번지는 만큼 그 빛을 따라가기 좋은 결입니다.'
  },
  土: {
    A: '오늘은 土기운이 흙더미끼리 무너지듯 부딪히는 날입니다. ' +
       '단단해 보이던 자리도 오늘은 곳곳이 들썩이는 결입니다.',
    B: '오늘은 土기운이 땅처럼 묵묵히 다져지는 날입니다. ' +
       '화려하진 않아도 한 걸음씩 단단해지는 흐름입니다.',
    C: '오늘은 土기운이 너른 대지처럼 든든히 펼쳐지는 날입니다. ' +
       '발 디딜 곳이 넓어, 마음 놓고 나서기 좋은 결입니다.'
  },
  金: {
    A: '오늘은 金기운이 칼날끼리 맞부딪히듯 날이 선 날입니다. ' +
       '서로 갈리고 깎이는 기운이라 작은 마찰도 크게 느껴지는 결입니다.',
    B: '오늘은 金기운이 서늘하게 가라앉아 고이는 날입니다. ' +
       '겉으로 차갑게 멈춰 보여도, 안에서는 결이 단단해지는 흐름입니다.',
    C: '오늘은 金기운이 잘 벼린 칼처럼 예리하게 빛나는 날입니다. ' +
       '결단이 선명하게 서는, 정제된 흐름이 도는 날입니다.'
  },
  水: {
    A: '오늘은 水기운이 물살끼리 부딪히듯 거세게 흔들리는 날입니다. ' +
       '흐름이 한쪽으로 정해지지 않고 이리저리 휘몰아치는 결입니다.',
    B: '오늘은 水기운이 깊은 물처럼 고요히 고이는 날입니다. ' +
       '겉으로 잔잔해도 그 아래에서 다음 흐름을 천천히 빚고 있는 날입니다.',
    C: '오늘은 水기운이 큰 강처럼 막힘없이 흘러가는 날입니다. ' +
       '흐름을 거스르지 않고 따라가기만 해도 멀리 닿는 결입니다.'
  }
};

/**
 * 오늘의 영역(자산군) — 오행별로 직접 풀어쓴 문장.
 */
const AREA_TEXT = {
  木: '오늘은 특히 성장 계열 자산군에 그 기운이 새싹처럼 뻗어오릅니다.',
  火: '오늘은 특히 에너지 계열 자산군이 불꽃처럼 일어나 들썩입니다.',
  土: '오늘은 특히 실물·안정 계열 자산군이 땅처럼 묵묵히 자리를 지킵니다.',
  金: '오늘은 특히 금융·경화 계열 자산군이 칼날처럼 단단하게 응축됩니다.',
  水: '오늘은 특히 유동성 계열 자산군이 물줄기처럼 방향을 바꾸며 흐릅니다.'
};

// ⚠️ 서버 타임존 버그 수정[2026-07-01]: sipseong.js와 동일 이슈 — Solar.fromDate(date)가
// 서버 로컬(UTC 등) 기준으로 날짜를 읽어 KST 아침 발송 시 일진이 하루 밀리는 문제.
// → Asia/Seoul 달력 기준 연/월/일로 변환 후 Solar.fromYmd 사용.
function resolveKstYmd(date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(date);
  const get = (t) => +parts.find(p => p.type === t).value;
  return { y: get('year'), m: get('month'), d: get('day') };
}

function getTodayOhang(date = new Date()) {
  const { y, m, d } = resolveKstYmd(date);
  const solar = Solar.fromYmd(y, m, d);
  const lunar = solar.getLunar();
  const ganHanja = lunar.getDayGan();
  const ganKr = GAN_KR[ganHanja] || ganHanja;
  return GAN_OH[ganKr];
}

/**
 * 거시 흐름 한 줄(문단). 시그니처 변경 없음 — { ohang, text } 그대로 반환.
 */
function getMacroLine(type, date = new Date()) {
  const oh = getTodayOhang(date);
  const text = (MACRO_TEXT[oh] && MACRO_TEXT[oh][type]) || MACRO_TEXT['土'].B;
  return { ohang: oh, text };
}

/**
 * 오늘의 영역(자산군) 한 줄. 시그니처 변경 없음 — 문자열 그대로 반환.
 */
function getAssetAreaLine(ohang) {
  return AREA_TEXT[ohang] || AREA_TEXT['土'];
}

module.exports = { getTodayOhang, getMacroLine, getAssetAreaLine, OH_TO_ASSET };
