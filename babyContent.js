/**
 * babyContent.js
 * 데일리 캠페인 "오늘, 세상에 온 아이" (知我世 탄생 노트) 콘텐츠 생성 엔진.
 * 시스템 프롬프트 v5.9.8 캠페인 스펙 구현.
 *
 * 축(軸): 출생시간 미상 → 그날 태어난 모두가 공유하는 일주(日柱). (ilju.js getIljuInfo 재활용)
 * 차별화: 오행 관계 엔진 — 아이 일간오행 × 절기 계절오행(봄木/여름火/환절기土/가을金/겨울水)의 생극.
 *   계절生아이=순풍 / 계절克아이=단련·담금질 / 아이生계절=베풂 / 아이克계절=주도 / 비화=순수 (전부 긍정 재정의)
 * 5블록: ①환영훅 ②오늘의하늘 ③아이의결 ④축복편지(+부모가 채워주면 더 빛나는 기운) ⑤오늘의상징(색·꽃)+이름 한 줄
 * 절대규칙: 비지시어("~해 주면 좋아요"만, "조심/주의/~해야" 금지) · 신생아 약점 단정 금지 · 경고로 끝내지 않음(모드1)
 * 제외: 서양 별자리·점성술·탄생석 / 행운의 숫자(소스 부재) / 추천 한자 전량 노출(뜻 티저 한 줄만) / 본문 CTA
 * 반복 방지: 60일 주기 피로 방지 위해 KST 날짜 기반 결정적 3-템플릿 로테이션.
 *
 * 순수 함수 모듈 — 텔레그램/HTTP 의존성 없음. 발송은 baby-bot.js 담당.
 */

'use strict';
const { getIljuInfo } = require('./ilju');
const { Solar } = require('lunar-javascript');

// ── 오행 상수 ──
const GEN = { 木: '火', 火: '土', 土: '金', 金: '水', 水: '木' }; // 생(生): A생GEN[A]
const KE  = { 木: '土', 土: '水', 水: '火', 火: '金', 金: '木' }; // 극(克): A극KE[A]
const REV_GEN = { 火: '木', 土: '火', 金: '土', 水: '金', 木: '水' }; // X를 생하는 오행(인성)

const ILGAN_EL = { 甲:'木',乙:'木',丙:'火',丁:'火',戊:'土',己:'土',庚:'金',辛:'金',壬:'水',癸:'水' };

// 월지(節기 기준) → 오행. 辰未戌丑=土(환절기).
const ZHI_EL = { 寅:'木',卯:'木',辰:'土',巳:'火',午:'火',未:'土',申:'金',酉:'金',戌:'土',亥:'水',子:'水',丑:'土' };
const SEASON_NAME = { 木:'봄', 火:'여름', 土:'환절기', 金:'가을', 水:'겨울' };

// ── §17 색채 (아이 일간오행 기준) ──
const COLOR = {
  木: '맑은 초록빛과 싱그러운 청록빛',
  火: '따뜻한 빨강과 은은한 주황빛',
  土: '포근한 황토빛과 부드러운 베이지',
  金: '맑은 흰빛과 은은한 금빛',
  水: '깊은 남빛과 차분한 검정',
};

// ── 꽃 (브랜드 장식용 — 오행 색과 어울리는 꽃. 술법 소스 무관, 계절꽃으로 자유 교체 가능) ──
const FLOWER = {
  木: ['은방울꽃 — 초록 잎 사이로 조용히 피어나는 흰 종 꽃',
       '수국 — 계절을 따라 빛깔이 깊어지는 넉넉한 꽃'],
  火: ['능소화 — 한여름 담장을 타고 환하게 피는 주홍 꽃',
       '백일홍 — 오래도록 붉게 피어 여름을 밝히는 꽃'],
  土: ['금잔화 — 흙 위로 동그랗게 피어나는 따뜻한 노랑 꽃',
       '프리지어 — 부드러운 향으로 자리를 채우는 노란 꽃'],
  金: ['치자꽃 — 조용히 피어 맑은 향을 멀리 보내는 흰 꽃',
       '목련 — 가장 먼저 봉오리를 여는 크고 흰 꽃'],
  水: ['붓꽃 — 물가에 피어나는 깊은 남빛 꽃',
       '도라지꽃 — 별처럼 다섯 갈래로 피는 보랏빛 꽃'],
};

// ── 오행 → 자연물(서술용) ──
const NATURE = { 木:'새싹', 火:'햇살', 土:'흙', 金:'보석', 水:'물' };

// ── 천간 → 아이의 결(신생아 톤, 10천간 고정) ──
const ILGAN_GYEOL = {
  甲: '곧게 뻗어 오르는 큰 나무처럼, 먼저 나서서 이끄는 씩씩한 결',
  乙: '바람에 휘어도 꺾이지 않는 풀과 덩굴처럼, 어디서든 잘 자라는 부드럽고 강한 결',
  丙: '환하게 퍼지는 햇살처럼, 있는 자리를 밝히는 따뜻한 결',
  丁: '조용히 타오르는 촛불처럼, 한곳을 깊이 비추는 다정한 결',
  戊: '든든한 산처럼, 흔들려도 중심을 잡고 버티는 묵직한 결',
  己: '기름진 밭흙처럼, 무엇이든 품어 길러내는 너른 결',
  庚: '잘 벼린 무쇠처럼, 마음먹으면 곧게 밀고 나가는 단단한 결',
  辛: '잘 세공된 보석처럼, 정확하고 섬세하게 가려내는 맑은 결',
  壬: '넓게 흐르는 큰 물처럼, 두루 품고 지혜롭게 돌아가는 깊은 결',
  癸: '촉촉이 스며드는 이슬처럼, 끊임없이 적시고 살려내는 생명의 결',
};

// ── 계절(오늘의 하늘) 서술 ──
const SEASON_SKY = {
  木: '만물이 처음 싹을 틔우는 봄의 한복판이에요. 새 기운이 땅을 밀고 올라오는, 시작의 계절입니다.',
  火: '해가 길고 볕이 넉넉한 한여름이에요. 온 세상이 무성하게 자라나는, 가장 환하고 뜨거운 계절입니다.',
  土: '계절과 계절이 손을 바꾸는 환절기예요. 지난 계절을 갈무리하고 다음을 준비하는, 중심이 잡히는 때입니다.',
  金: '열매가 여물고 결실이 맺히는 가을이에요. 공기가 맑아지고 모든 것이 단단해지는 계절입니다.',
  水: '만물이 안으로 힘을 모으는 겨울이에요. 씨앗을 깊이 품고 조용히 쉬어가는, 다음 봄을 준비하는 계절입니다.',
};

// ── 오행 관계 판별 ──
function relationOf(seasonEl, childEl) {
  if (seasonEl === childEl) return 'BIHWA';         // 비화(순수)
  if (GEN[seasonEl] === childEl) return 'S_GEN_C';  // 계절生아이(순풍)
  if (GEN[childEl] === seasonEl) return 'C_GEN_S';  // 아이生계절(베풂)
  if (KE[seasonEl] === childEl) return 'S_KE_C';    // 계절克아이(단련·담금질)
  if (KE[childEl] === seasonEl) return 'C_KE_S';    // 아이克계절(주도)
  return 'BIHWA';
}

// ── 관계별 '아이의 결' 서사 (3-템플릿 로테이션) ──
// {sn}=계절 자연물, {cn}=아이 자연물
const REL_STORY = {
  S_GEN_C: [
    '오늘의 계절 기운이 이 아이를 부드럽게 밀어 올려줍니다. 순풍을 등에 업고 시작하는 셈이에요. 애써 힘주지 않아도 결이 자연스럽게 자라나는 아이입니다.',
    '오늘의 {sn} 같은 계절이 이 아이의 결을 살뜰히 키워줍니다. 뒤에서 조용히 받쳐주는 바람이 있는 셈이라, 하고 싶은 방향으로 쭉쭉 뻗어가기 좋은 아이예요.',
    '계절의 기운과 이 아이가 서로를 살립니다. 순한 흐름을 타고난 아이라, 무리 없이 제 결대로 자라나는 힘이 있어요.',
  ],
  S_KE_C: [
    '오늘의 {sn} 같은 계절 기운이 이 아이의 {cn} 같은 결을 단단히 감싸 벼려줍니다. 처음부터 완성된 게 아니라, 계절을 통과하며 더 선명해지는 담금질의 결이에요. 그래서 더 귀합니다.',
    '뜨겁고 강한 계절이 이 아이를 두드려 결을 세워줍니다. 열을 지나온 것이 더 맑고 단단해지듯, 이 아이는 겪으며 벼려지는 아이예요. 그 과정 자체가 이 아이의 빛이 됩니다.',
    '오늘의 계절은 이 아이에게 담금질의 시간을 선물합니다. 눌리는 게 아니라 벼려지는 거예요. 통과한 만큼 또렷해지고, 또렷해진 만큼 오래 빛나는 결입니다.',
  ],
  C_GEN_S: [
    '이 아이의 기운이 계절을 향해 환하게 흘러나갑니다. 타고나길 주변에 베풀며 빛나는 결이에요. 주는 만큼 저절로 채워지는, 넉넉한 아이입니다.',
    '이 아이의 {cn} 같은 결이 계절을 살찌웁니다. 곁에 있으면 주위가 밝아지는 아이라, 베풂이 곧 이 아이의 힘이 되는 결이에요.',
    '오늘의 아이는 계절에게 자기 기운을 내어줍니다. 나눌수록 커지는 결이라, 사람들 사이에서 유독 사랑받으며 자라날 아이예요.',
  ],
  C_KE_S: [
    '이 아이의 기운이 계절을 앞장서 이끌고 갑니다. 상황을 주도하며 길을 여는 씩씩한 결이에요. 주어진 자리에 머물기보다 스스로 판을 만드는 아이입니다.',
    '오늘의 아이는 계절보다 한 발 앞서 나갑니다. 이끄는 힘을 타고난 결이라, 무언가를 처음 시작하고 밀고 나가는 데 유독 강한 아이예요.',
    '이 아이의 {cn} 같은 결이 계절을 다스립니다. 흐름에 휩쓸리지 않고 스스로 방향을 잡는, 중심이 뚜렷한 아이입니다.',
  ],
  BIHWA: [
    '오늘의 계절과 이 아이가 같은 결로 울립니다. 타고난 기질이 흐려지지 않고 순수하게 빛나는 아이예요. 자기다움이 아주 또렷한 결입니다.',
    '계절의 기운과 이 아이가 한 방향으로 흐릅니다. 섞이지 않고 제 빛을 그대로 내는 아이라, 무엇을 좋아하고 무엇이 되고 싶은지가 유독 분명한 결이에요.',
    '오늘의 아이는 계절과 결이 꼭 맞습니다. 순수하게 자기 색을 지닌 아이라, 그 색을 지켜주기만 해도 스스로 환하게 자라날 결입니다.',
  ],
};

// ── '부모가 채워주면 더 빛나는 기운' — 관계로 채움 오행 도출(일주-축 근사, §7 강점 프레임) ──
// 정확한 희기신은 태어난 시간까지 필요 → 유료 작명/보고서 영역. 여기선 관계 기반 강점 프레임만.
function fillElementOf(relation, childEl) {
  switch (relation) {
    case 'S_KE_C': return REV_GEN[childEl];  // 인성: 감싸 길러주는 기운
    case 'C_GEN_S': return REV_GEN[childEl]; // 인성: 다시 채워주는 기운
    case 'C_KE_S': return REV_GEN[childEl];  // 인성: 든든히 받쳐주는 기운
    case 'S_GEN_C': return GEN[childEl];     // 식상: 마음껏 펼치게 하는 기운
    case 'BIHWA':   return GEN[childEl];     // 식상: 흘러나갈 통로를 열어주는 기운
    default:        return GEN[childEl];
  }
}
// 채움 오행 → 부모가 해주면 좋은 일상 (비지시어: "~해 주면 좋아요"만)
const FILL_CARE = {
  木: '새로운 걸 보여주고 바깥 바람을 자주 쐬어 주면, 이 아이의 결이 쭉쭉 뻗어납니다.',
  火: '밝고 따뜻한 볕과 환한 웃음을 자주 보여 주면, 이 아이의 빛이 한결 환해집니다.',
  土: '규칙적인 리듬과 포근한 품으로 감싸 주면, 이 아이의 결이 더 단단히 자리 잡습니다.',
  金: '조용하고 정돈된 자리, 맑은 공기를 만들어 주면, 이 아이의 결이 더 맑게 섭니다.',
  水: '충분히 재우고 물처럼 잔잔한 리듬을 만들어 주면, 이 아이의 날이 한결 부드러워집니다.',
};

// ── 환영 훅 (3-템플릿 로테이션) — {date}=날짜, {season}=계절명 ──
const WELCOME = [
  '{date}, 오늘 세상에 온 아이에게.\n{season}의 한복판에 도착한, 세상에서 가장 작고 귀한 손님입니다.',
  '{date}에 온 아이에게.\n{season}의 기운을 첫 숨으로 안고 태어난 아이예요. 잘 왔어요.',
  '{date}, 오늘 태어난 아이를 위한 노트.\n{season}의 문턱을 열고 세상에 첫 발을 디딘 아이입니다.',
];

// ── 축복 편지 (3-템플릿 로테이션) ──
const BLESSING = [
  '오늘 이 아이를 처음 안은 당신께.\n긴 기다림 끝에, 세상에서 가장 작은 손이 당신 품에 왔습니다. 잘 오셨어요. 그리고 이미 충분히 잘 해내고 계세요.',
  '오늘 부모가 된 당신께.\n작은 숨소리 하나에 온 세상이 바뀐 하루였을 거예요. 이 아이가 온 것만으로 오늘은 이미 좋은 날입니다. 당신도 오늘 참 애쓰셨어요.',
  '오늘 이 아이를 맞이한 당신께.\n세상에서 가장 작은 심장이 당신 곁에서 뛰기 시작했어요. 무엇을 더 하지 않아도, 곁에 있어 주는 것만으로 충분합니다.',
];

// ── 이름 뜻 티저 (관계별, 로테이션 · 실제 한자 노출 금지) ──
const NAME_TEASER = {
  S_GEN_C: ['순풍을 타고 쭉쭉 자라나는, 뻗어가는 기운을 담은 뜻',
            '막힘없이 자라나 넓게 펼쳐지는, 성장을 담은 뜻'],
  S_KE_C: ['계절을 통과해 더 단단하고 맑아지는, 벼려진 빛을 담은 뜻',
           '겪으며 또렷해지는, 단단하고 깊은 결을 담은 뜻'],
  C_GEN_S: ['주위를 환히 밝히고 나누는, 베푸는 빛을 담은 뜻',
            '곁을 따뜻하게 채우는, 넉넉한 마음을 담은 뜻'],
  C_KE_S: ['앞장서 길을 여는, 씩씩하게 이끄는 기운을 담은 뜻',
           '스스로 방향을 잡는, 뚜렷한 중심을 담은 뜻'],
  BIHWA: ['타고난 결이 흐려지지 않고 맑게 빛나는, 순수한 기운을 담은 뜻',
          '자기 색을 오롯이 지키는, 또렷한 결을 담은 뜻'],
};

// ── KST 날짜 유틸 ──
function kstParts(date) {
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(date);
  const g = (t) => +p.find(x => x.type === t).value;
  return { y: g('year'), m: g('month'), d: g('day') };
}
// 60일 피로 방지용 결정적 회전 인덱스 (같은 날=같은 값, 날짜 바뀌면 회전)
function rotIndex(y, m, d, len, salt = 0) {
  const dayNum = Math.floor(Date.UTC(y, m - 1, d) / 86400000);
  return (((dayNum + salt) % len) + len) % len;
}
function fill(tpl, map) {
  return tpl.replace(/\{(\w+)\}/g, (_, k) => (k in map ? map[k] : `{${k}}`));
}

/**
 * 오늘(또는 지정일)의 캠페인 콘텐츠 생성.
 * @param {Date} date - 기준 시각(기본 now). KST 달력일의 일주를 축으로 산출.
 * @returns { meta, instaCards[5], blessingBonus, threadText }
 */
function buildDailyContent(date = new Date()) {
  const { y, m, d } = kstParts(date);

  // 일주(日柱) — 그날 태어난 모두의 공유 축. (출생시간 미상 → 시주 불산입, 정확한 이름은 시간까지 → 유료 작명)
  const ilju = getIljuInfo(y, m, d);
  const ilgan = ilju.ilju[0];
  const childEl = ILGAN_EL[ilgan];

  // 계절오행 — 節기 기준 월지
  const lunar = Solar.fromYmd(y, m, d).getLunar();
  const monthZhi = lunar.getMonthZhi();
  const seasonEl = ZHI_EL[monthZhi];
  const seasonName = SEASON_NAME[seasonEl];

  // 오행 관계
  const relation = relationOf(seasonEl, childEl);
  const fillEl = fillElementOf(relation, childEl);

  const dateStr = `${y}년 ${m}월 ${d}일`;
  const sn = NATURE[seasonEl];
  const cn = NATURE[childEl];

  // 회전 인덱스 (블록마다 salt를 달리해 같은 날에도 블록끼리 패턴이 겹치지 않게)
  const iWelcome = rotIndex(y, m, d, WELCOME.length, 0);
  const iStory   = rotIndex(y, m, d, REL_STORY[relation].length, 1);
  const iBless   = rotIndex(y, m, d, BLESSING.length, 2);
  const iFlower  = rotIndex(y, m, d, FLOWER[childEl].length, 3);
  const iTeaser  = rotIndex(y, m, d, NAME_TEASER[relation].length, 4);

  const relStory = fill(REL_STORY[relation][iStory], { sn, cn });

  // ── 5블록 카드 ──
  const card1 =
    fill(WELCOME[iWelcome], { date: dateStr, season: seasonName });

  const card2 =
    `[오늘의 하늘]\n${SEASON_SKY[seasonEl]}\n이런 날에 온 아이는, 이 계절의 기운을 첫 숨으로 안고 태어납니다.`;

  const card3 =
    `[아이의 결]\n이 아이 안에는 ${ILGAN_GYEOL[ilgan]}이 있어요.\n${relStory}`;

  const card4 =
    `[오늘의 편지]\n${BLESSING[iBless]}\n\n` +
    `이 아이의 반짝임은 이미 안에 들어 있어요. 부모가 더해 주면 좋은 건 딱 하나 — ` +
    `${FILL_CARE[fillEl]}`;

  const card5 =
    `[오늘의 상징]\n오늘의 색 · ${COLOR[childEl]}\n오늘의 꽃 · ${FLOWER[childEl][iFlower]}\n\n` +
    `이름 한 줄 · ${NAME_TEASER[relation][iTeaser]}이 이 아이에게 어울려요.\n` +
    `정확한 이름은 이 아이가 태어난 '시간'까지 담아야 완성됩니다. ` +
    `오늘의 결 위에 시간의 결을 더하면, 세상에 하나뿐인 이름이 돼요.`;

  // ── '부모가 채워주면 더 빛나는 기운' 단독 블록(카드 분리 발행용 옵션) ──
  const blessingBonus =
    `[부모가 채워주면 더 빛나는 기운]\n` +
    `이 아이가 이미 가진 결은 그대로 두어도 충분히 빛나요. ` +
    `여기에 살짝 더해 주면 좋은 기운이 있다면 — ${FILL_CARE[fillEl]}`;

  // ── 스레드 모드2 (원리 살짝 공개, 신뢰형) ──
  const threadText = buildThread({
    dateStr, ilju, ilgan, childEl, seasonEl, seasonName, relation, fillEl, sn, cn,
  });

  return {
    meta: {
      dateStr, ilju: ilju.ilju, ilgan, childEl,
      monthZhi, seasonEl, seasonName, relation, fillEl,
      color: COLOR[childEl], flower: FLOWER[childEl][iFlower],
    },
    instaCards: [card1, card2, card3, card4, card5],
    blessingBonus,
    threadText,
  };
}

// 관계별 한 줄 원리(모드2 — 극/생 용어 허용)
const REL_PRINCIPLE = {
  S_GEN_C: '계절이 아이를 생(生)하는 자리 — 순풍입니다. 계절 기운이 아이를 밀어 올려줘요.',
  S_KE_C: '계절이 아이를 극(克)하는 자리지만, 이건 담금질입니다. 불이 쇠를 벼려 더 단단하게 만들듯, 겪으며 선명해지는 결이에요.',
  C_GEN_S: '아이가 계절을 생(生)하는 자리 — 베풂입니다. 자기 기운을 내어주며 빛나는 결이에요.',
  C_KE_S: '아이가 계절을 극(克)하는 자리 — 주도입니다. 계절을 앞장서 이끄는 씩씩한 결이에요.',
  BIHWA: '계절과 아이가 같은 오행 — 비화(比和)입니다. 기질이 흐려지지 않고 순수하게 빛나는 결이에요.',
};
function buildThread({ dateStr, ilju, ilgan, childEl, seasonEl, seasonName, relation, fillEl, sn, cn }) {
  return (
    `${dateStr}, 오늘 태어난 아이의 결을 사주로 읽어봅니다.\n\n` +
    `오늘 온 아이는 '${ilgan}(${childEl})'의 날에 왔어요. ${ILGAN_GYEOL[ilgan]}을 타고났습니다.\n\n` +
    `그리고 지금은 ${seasonName}, ${seasonEl}의 기운이 무르익는 계절이죠. ` +
    `${REL_PRINCIPLE[relation]}\n\n` +
    `그래서 이 아이에게 잘 어울리는 건 '${fillEl}의 흐름' — ${FILL_CARE[fillEl]}\n\n` +
    `정확한 이름은 태어난 시간까지 담아야 완성됩니다.`
  );
}

module.exports = { buildDailyContent, relationOf, fillElementOf };
