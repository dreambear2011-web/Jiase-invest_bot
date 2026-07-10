/**
 * invest-bot.js
 * 지아세 "오늘의 투자운" 텔레그램 봇 (§59 — 별도 봇/별도 BotFather 토큰).
 *
 * 흐름:
 *  /start    → 생년월일 입력 → 가입 완료 + 즉시 샘플 발송
 *  매일 발송(07:30 KST — 장 시작 전, "오늘의 나"와 시간대 분리)
 *  /오늘투자  → 즉시 확인   /이달투자 → 이달 남은 흐름   /stop /privacy
 *
 * v3 — [가치 재설계 + 풍부화]
 *  ① 한 덩어리 줄글 → 블록화(parse_mode:'HTML' + 라벨 + 구분선).
 *  ② 가치 축 이동: '포지션 행동 조언(§59-4 반복)'을 센터에서 내리고,
 *     십성별 '오늘의 투자 심리 거울'(SIP_INVEST_INSIGHT)을 센터로.
 *     → "맨날 분할익절" 인상 해소. 면책이 말하는 "성향·심리 진단"을 실제 이행.
 *  ③ "다가오는 5일 흐름" 프리뷰 추가(랜딩보다 살짝 풍성).
 * v4 — [디자인] 레이키 글리프 폐기 → 그날 오행 카드 5종 회전(오늘의 나 봇과 동일 세트).
 *     브랜드 마크(물길+돌탑)는 /start 첫인사 전용.
 *  ⚠️ §59-1 법적 경계선 그대로: 종목·코인명·매수매도 시그널 절대 금지.
 *     자산군은 카테고리명만. 모든 발송에 면책 문구 고정 동봉.
 *
 * 의존(같은 폴더): bornbone_today.js, sipseong.js(v3), ilju.js, assetMapping.js,
 *   investPhrases.js, storage.js, preview.js(신규)
 * 의존 패키지: dotenv, node-cron, node-telegram-bot-api, lunar-javascript
 */

'use strict';
require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const cron = require('node-cron');

const { todayFortune } = require('./bornbone_today');
const { getTodayDomain, SIP_INVEST_DETAIL, SIP_INVEST_INSIGHT } = require('./sipseong');
const { getIljuIntroLine } = require('./ilju');
const { getMacroLine, getAssetAreaLine } = require('./assetMapping');
const { pickAdvice, pickHealMsg, DISCLAIMER } = require('./investPhrases');
const { buildWeekPreview, kstMonthDay } = require('./preview');
const { upsertUser, getUser, removeUser, getAllUsers } = require('./storage');

const TOKEN = process.env.INVEST_BOT_TOKEN;
if (!TOKEN) {
  console.error('INVEST_BOT_TOKEN이 설정되지 않았습니다. .env 파일을 확인하세요.');
  process.exit(1);
}

// [디자인 v4] 레이키 글리프 폐기 — 발행 콘텐츠와 톤 충돌 + 모드1 심볼 노출 이슈 해소.
// 브랜드 마크(물길+돌탑, 균형·흐름 은유)는 /start 첫인사 전용. 돈·차트·화살표 없음(§59-1).
const BRAND_MARK = './invest-mark.png';
// 오행 카드 5종 — 그날 일진 오행에 맞춰 매일 마무리 이미지로 회전(오늘의 나 봇과 동일 세트).
const ELEMENT_CARD = {
  木: './card-wood.png',
  火: './card-fire.png',
  土: './card-earth.png',
  金: './card-metal.png',
  水: './card-water.png'
};

const bot = new TelegramBot(TOKEN, { polling: true });
const pending = new Map(); // chatId → 'awaiting_birthdate'

// 위기 개입 트리거 — 모드·상태 무관 항상 최우선 (지아세 전 채널 공통 규칙)
const CRISIS_KEYWORDS = ['죽고 싶다', '죽고싶다', '사라지고 싶다', '사라지고싶다', '끝내고 싶다', '끝내고싶다', '살기 싫다', '살기싫다'];
const CRISIS_MESSAGE =
  '지금 많이 힘드신 것 같습니다.\n' +
  '투자 손실이든 다른 이유든, 혼자 감당하지 않으셔도 됩니다.\n\n' +
  '자살예방상담전화 1393\n정신건강위기상담전화 1577-0199\n24시간 연결됩니다.';

function containsCrisisKeyword(text) {
  if (!text) return false;
  return CRISIS_KEYWORDS.some(k => text.includes(k));
}

// 유형별 흐름 마무리 멘트 (거시 문장 뒤 자연 연결)
const TYPE_FLOW = {
  A: '무리하게 밀어붙이기보다 한 박자 늦추는 쪽이 오늘의 결을 지키는 방법입니다.',
  B: '무리해서 흔들어 깨우지 않아도 괜찮은 흐름입니다.',
  C: '애써 누르지 않아도 자연스럽게 흘러가는 하루입니다.'
};

/**
 * v3 블록 구조 메시지 빌드.
 * [오늘의 결] → [오늘 당신의 성향]★센터 → [눈길 가는 자산군] → [오늘의 마음가짐] → [5일 프리뷰]
 */
function buildInvestParts(user) {
  const { birthYear, birthMonth, birthDay } = user;
  const now = new Date();
  const r = todayFortune(birthYear, now);
  const macro = getMacroLine(r.type, now);
  const areaLine = getAssetAreaLine(macro.ohang);
  const advice = pickAdvice(r.type);
  const healMsg = pickHealMsg(r.type);
  const flow = TYPE_FLOW[r.type] || TYPE_FLOW.B;

  // 일주 정체성 한 줄 — 약 30% 확률(ilju.js). "오늘의 결" 블록 상단에 병합(빈 블록 방지).
  const iljuIntro = (birthMonth && birthDay)
    ? getIljuIntroLine(birthYear, birthMonth, birthDay)
    : null;
  const iljuLine = iljuIntro ? `${iljuIntro}\n` : '';

  // ★센터 — 십성 영역(왜) + 오늘의 투자 심리 거울(통찰). 생년월일 전체 필요.
  const domain = getTodayDomain(birthYear, birthMonth, birthDay, now, 'invest');
  let insightBlock = '';
  if (domain) {
    const detail = SIP_INVEST_DETAIL[domain.sipseong] || '';
    const insight = SIP_INVEST_INSIGHT[domain.sipseong] || '';
    insightBlock =
      `<b>오늘 당신의 성향</b>\n${detail}` +
      (insight ? `\n${insight}` : '') + `\n\n`;
  }

  const preview = buildWeekPreview(birthYear, 5, now);

  const text =
    `🌅 <b>오늘의 투자운</b> · ${kstMonthDay(now)}\n` +
    `━━━━━━━━━━\n\n` +
    `<b>오늘의 결</b>\n${iljuLine}${macro.text} ${flow}\n\n` +
    `${insightBlock}` +
    `<b>눈길 가는 자산군</b>\n${areaLine}\n\n` +
    `<b>오늘의 마음가짐</b>\n${advice}\n\n` +
    `${preview}`;

  return { text, healMsg, ohang: macro.ohang };
}

/** /이달투자 — 이달 남은 날 흐름(랜딩 월 캘린더의 텍스트판). 남은 일수만큼. */
function buildMonthPreview(birthYear) {
  const now = new Date();
  const { m } = { m: +new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', month: '2-digit' }).format(now) };
  const y = +new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric' }).format(now);
  const daysInMonth = new Date(y, m, 0).getDate();
  const today = +new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', day: '2-digit' }).format(now);
  const remain = daysInMonth - today + 1;
  return `🗓 <b>${m}월 남은 날의 흐름</b>\n` + buildWeekPreview(birthYear, remain, now).split('\n').slice(1).join('\n');
}

async function sendDailyInvest(chatId, user) {
  const { text, healMsg, ohang } = buildInvestParts(user);
  await bot.sendMessage(chatId, text, { parse_mode: 'HTML' });
  // 힐링 + 면책은 그날 오행 카드 캡션으로 분리 발송 — "마무리 도장" + 매일 결이 바뀌는 감성
  const card = ELEMENT_CARD[ohang] || ELEMENT_CARD['土'];
  await bot.sendPhoto(chatId, card, {
    caption: `${healMsg}\n\n${DISCLAIMER}`
  });
}

// ── /start : 온보딩 ──
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const existing = getUser(chatId);
  if (existing && existing.birthYear) {
    bot.sendMessage(chatId, '이미 가입되어 있습니다. /오늘투자 로 바로 확인하실 수 있어요. (다시 설정하려면 /stop 후 /start)');
    return;
  }
  pending.set(chatId, 'awaiting_birthdate');
  const welcome =
    '안녕하세요, 지아세 知我世 — 오늘의 투자운입니다 🙂\n' +
    '매일 아침, 오늘의 흐름과 오늘 당신의 투자 심리를 짧게 전해드립니다.\n\n' +
    `${DISCLAIMER}\n\n` +
    '생년월일을 숫자 8자리로 보내주세요. (예: 19901225)';
  bot.sendPhoto(chatId, BRAND_MARK, { caption: welcome })
    .catch(() => bot.sendMessage(chatId, welcome)); // 이미지 실패 시 텍스트 폴백
});

// 8자리 생년월일 문자열 파싱 + 범위 검증
function parseBirthdate(text) {
  const t = text.trim();
  if (!/^\d{8}$/.test(t)) return null;
  const year = +t.slice(0, 4);
  const month = +t.slice(4, 6);
  const day = +t.slice(6, 8);
  if (year < 1900 || year > 2100) return null;
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > 31) return null;
  return { year, month, day };
}

// ── /오늘투자 : 즉시 확인 ──
bot.onText(/\/오늘투자/, async (msg) => {
  const chatId = msg.chat.id;
  const user = getUser(chatId);
  if (!user || !user.birthYear) {
    bot.sendMessage(chatId, '먼저 /start 로 가입해주세요.');
    return;
  }
  await sendDailyInvest(chatId, user);
});

// ── /이달투자 : 이달 남은 흐름 ──
bot.onText(/\/이달투자/, (msg) => {
  const chatId = msg.chat.id;
  const user = getUser(chatId);
  if (!user || !user.birthYear) {
    bot.sendMessage(chatId, '먼저 /start 로 가입해주세요.');
    return;
  }
  bot.sendMessage(chatId, buildMonthPreview(user.birthYear), { parse_mode: 'HTML' });
});

// ── /stop : 수신 거부 ──
bot.onText(/\/stop/, (msg) => {
  const chatId = msg.chat.id;
  removeUser(chatId);
  pending.delete(chatId);
  bot.sendMessage(chatId, '수신이 해지되었습니다. 언제든 /start 로 다시 시작하실 수 있어요.');
});

// ── /privacy : 개인정보 처리 + 법적 고지 ──
bot.onText(/\/privacy/, (msg) => {
  bot.sendMessage(msg.chat.id,
    '수집 항목: 생년월일, 텔레그램 chat ID만 저장합니다.\n' +
    '용도: 매일 발송 콘텐츠 개인화 목적 외 사용하지 않습니다.\n' +
    '삭제: /stop 시 즉시 파기됩니다.\n\n' +
    `${DISCLAIMER}\n` +
    '본 서비스는 유사투자자문업에 해당하지 않으며, 특정 금융투자상품에 대한 ' +
    '투자판단·매수매도 시그널을 제공하지 않습니다.'
  );
});

// ── 온보딩 진행 + 위기개입 키워드 감지 ──
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;
  if (!text || text.startsWith('/')) return;

  if (containsCrisisKeyword(text)) {
    bot.sendMessage(chatId, CRISIS_MESSAGE);
    return;
  }

  if (pending.get(chatId) === 'awaiting_birthdate') {
    const parsed = parseBirthdate(text);
    if (!parsed) {
      bot.sendMessage(chatId, '생년월일을 숫자 8자리로 다시 보내주세요. (예: 19901225)');
      return;
    }
    const newUser = {
      birthYear: parsed.year,
      birthMonth: parsed.month,
      birthDay: parsed.day,
      joinedAt: new Date().toISOString()
    };
    upsertUser(chatId, newUser);
    pending.delete(chatId);
    await bot.sendMessage(chatId, '가입이 완료되었습니다. 매일 아침 7시 30분에 전해드릴게요 🙂\n\n오늘의 흐름을 먼저 보여드릴게요 —');
    sendDailyInvest(chatId, newUser).catch(err => console.error('샘플 발송 실패:', err.message));
  }
});

// ── 매일 07:30(KST) 전체 가입자 발송 — "오늘의 나"(07:00)와 시간대 분리 ──
cron.schedule('30 7 * * *', () => {
  const users = getAllUsers();
  Object.entries(users).forEach(([chatId, u]) => {
    if (!u || !u.birthYear) return;
    sendDailyInvest(chatId, u).catch(err => {
      console.error(`발송 실패 (chatId=${chatId}):`, err.message);
    });
  });
  console.log(`[${new Date().toISOString()}] 투자운 일일 발송 완료 — 대상 ${Object.keys(users).length}명`);
}, { timezone: 'Asia/Seoul' });

console.log('지아세 오늘의 투자운 봇 (v3) — 실행 중');
