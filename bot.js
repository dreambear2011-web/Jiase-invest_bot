/**
 * bot.js
 * 지아세 "오늘의 나" 텔레그램 봇.
 *
 * 흐름:
 *  /start → 생년월일 입력(YYYYMMDD) → 힐링모드 선택(가볍게/깊게) → 가입 완료 + 즉시 샘플 발송
 *  매일 07:00(KST) 전체 가입자에게 자동 발송
 *  /오늘  → 즉시 확인
 *  /stop  → 수신 거부
 *  /privacy → 개인정보 처리 안내
 *
 * [2026-06-20 변경 — §59-8] 출생연도만 받던 온보딩을 생년월일 전체(시 불필요)로 변경.
 * ②(내 에너지)와 ⑤(방향) 사이에 ③(오늘의 영역 — 십성 기반) 신설.
 * 기존 가입자(연도만 저장됨)는 /오늘 또는 /start 시 1회 재입력 요청으로 자연 전환.
 *
 * 실행 전: npm install && cp .env.example .env (BOT_TOKEN 입력) 후 npm start
 */

'use strict';
require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const cron = require('node-cron');

const { todayFortune } = require('./bornbone_today');
const { todayArea } = require('./sipseong');
const { pickHeal } = require('./phrases');
const { upsertUser, getUser, removeUser, getAllUsers } = require('./storage');

const TOKEN = process.env.BOT_TOKEN;
if (!TOKEN) {
  console.error('BOT_TOKEN이 설정되지 않았습니다. .env 파일을 확인하세요.');
  process.exit(1);
}

const bot = new TelegramBot(TOKEN, { polling: true });

// 진행 중인 온보딩 상태(메모리) — chatId → 'awaiting_birthdate'
const pending = new Map();

// 위기 개입 트리거 키워드 (모드·상태와 무관하게 항상 최우선)
const CRISIS_KEYWORDS = ['죽고 싶다', '죽고싶다', '사라지고 싶다', '사라지고싶다', '끝내고 싶다', '끝내고싶다', '살기 싫다', '살기싫다'];
const CRISIS_MESSAGE =
  '지금 많이 힘드신 것 같습니다.\n' +
  '이런 마음이 들 때는 혼자 감당하지 않으셔도 됩니다.\n\n' +
  '자살예방상담전화 1393\n정신건강위기상담전화 1577-0199\n24시간 연결됩니다.';

function containsCrisisKeyword(text) {
  if (!text) return false;
  return CRISIS_KEYWORDS.some(k => text.includes(k));
}

const TYPE_INTRO = {
  A: '오늘은 마찰이 도는 결입니다.',
  B: '오늘은 차분히 고이는 결입니다.',
  C: '오늘은 받쳐주는 결입니다.'
};

// ④ 조언 — 십성(영역)별 그라운딩 한 줄 (모드1, 기법명 비노출)
const SIP_ADVICE = {
  비겁: '오늘은 남 눈치보다 내 줏대를 먼저 따르셔도 좋습니다.',
  식상: '오늘은 머릿속에 있는 걸 말이나 글로 꺼내보시면 풀립니다.',
  재성: '당장 성과를 보려 하지 마세요. 오늘은 쌓아두는 쪽이 맞습니다.',
  관성: '오늘 생긴 오해는 오늘 풀려 하지 마세요. 한 박자 미루는 게 관계를 지킵니다.',
  인성: '오늘은 새로 배우거나, 그냥 쉬는 시간을 가지셔도 좋습니다.'
};

function buildMessage(user) {
  const { birthYear, birthMonth, birthDay, healMode } = user;
  const r = todayFortune(birthYear);
  const intro = TYPE_INTRO[r.type] || TYPE_INTRO.B;
  const dirLine = r.dirLabel ? `${r.dirLabel}의 기운을 곁에 두시면 좋습니다.\n` : '';
  const heal = pickHeal(r.type, healMode);

  const area = todayArea(birthYear, birthMonth, birthDay);
  const areaLine = area
    ? `\n오늘은 특히 '${area.area}' 쪽이 활성화되는 날입니다.\n${SIP_ADVICE[area.sip]}\n`
    : ''; // 생월일 미수집 가입자는 ③④ 생략, ①②⑤만 발송(하위호환)

  return (
    `🌅 오늘의 나\n\n` +
    `${intro}\n` +
    `${areaLine}\n` +
    `${dirLine}\n` +
    `${heal}`
  );
}

// 생월일 미수집 가입자에게 1회 재요청
function needsBirthdateUpgrade(user) {
  return user && user.birthYear && (!user.birthMonth || !user.birthDay);
}

// ── /start : 온보딩 시작 ──
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const existing = getUser(chatId);
  if (existing && existing.birthYear) {
    if (needsBirthdateUpgrade(existing)) {
      pending.set(chatId, 'awaiting_birthdate_upgrade');
      bot.sendMessage(chatId,
        '오늘의 영역(③) 기능이 추가됐어요. 생년월일 8자리로 다시 보내주시면 적용됩니다. (예: 19901225)'
      );
      return;
    }
    bot.sendMessage(chatId, '이미 가입되어 있습니다. /오늘 로 바로 확인하실 수 있어요. (다시 설정하려면 /stop 후 /start)');
    return;
  }
  pending.set(chatId, 'awaiting_birthdate');
  bot.sendMessage(chatId,
    '안녕하세요, 지아세 知我世입니다 🙂\n' +
    '매일 아침 당신의 기운을 짧게 전해드립니다.\n\n' +
    '생년월일을 8자리 숫자로 보내주세요. (예: 19901225, 시간은 몰라도 됩니다)'
  );
});

// ── /오늘 : 즉시 확인 ──
bot.onText(/\/오늘/, (msg) => {
  const chatId = msg.chat.id;
  const user = getUser(chatId);
  if (!user || !user.birthYear) {
    bot.sendMessage(chatId, '먼저 /start 로 가입해주세요.');
    return;
  }
  if (needsBirthdateUpgrade(user)) {
    pending.set(chatId, 'awaiting_birthdate_upgrade');
    bot.sendMessage(chatId, '오늘의 영역(③) 기능이 추가됐어요. 생년월일 8자리로 다시 보내주세요. (예: 19901225)');
    return;
  }
  bot.sendMessage(chatId, buildMessage(user));
});

// ── /stop : 수신 거부 ──
bot.onText(/\/stop/, (msg) => {
  const chatId = msg.chat.id;
  removeUser(chatId);
  pending.delete(chatId);
  bot.sendMessage(chatId, '수신이 해지되었습니다. 언제든 /start 로 다시 시작하실 수 있어요.');
});

// ── /privacy : 개인정보 처리 안내 ──
bot.onText(/\/privacy/, (msg) => {
  bot.sendMessage(msg.chat.id,
    '수집 항목: 생년월일(시 제외), 텔레그램 chat ID, 힐링모드 설정값만 저장합니다.\n' +
    '용도: 매일 발송 콘텐츠 개인화 목적 외 사용하지 않습니다.\n' +
    '삭제: /stop 시 즉시 파기됩니다.\n\n' +
    '※ 본 콘텐츠는 의료행위·심리치료가 아닌 예방적 자기관리 참고용 서비스입니다.'
  );
});

// ── 힐링모드 선택 콜백 ──
bot.on('callback_query', (query) => {
  const chatId = query.message.chat.id;
  const data = query.data; // 'heal_off' | 'heal_on'

  if (data === 'heal_off' || data === 'heal_on') {
    const healMode = data === 'heal_on' ? 'on' : 'off';
    const pendingDate = pending.get(`${chatId}:birthdate`);
    const user = {
      birthYear: pendingDate.year,
      birthMonth: pendingDate.month,
      birthDay: pendingDate.day,
      healMode,
      joinedAt: new Date().toISOString()
    };
    upsertUser(chatId, user);
    pending.delete(chatId);
    pending.delete(`${chatId}:birthdate`);

    bot.answerCallbackQuery(query.id);
    bot.sendMessage(chatId, '가입이 완료되었습니다. 매일 아침 7시에 전해드릴게요 🙂\n\n오늘의 기운을 먼저 보여드릴게요 —');
    bot.sendMessage(chatId, buildMessage(user));
  }
});

// ── 일반 텍스트 처리 (온보딩 진행 + 위기개입 키워드 감지) ──
bot.on('message', (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;
  if (!text || text.startsWith('/')) return;

  // 위기개입 트리거: 모드·온보딩 상태와 무관하게 항상 최우선
  if (containsCrisisKeyword(text)) {
    bot.sendMessage(chatId, CRISIS_MESSAGE);
    return;
  }

  const state = pending.get(chatId);

  // 온보딩: 생년월일 입력 대기 중 (신규 가입)
  if (state === 'awaiting_birthdate') {
    const parsed = parseBirthdate(text);
    if (!parsed) {
      bot.sendMessage(chatId, '생년월일 8자리로 다시 보내주세요. (예: 19901225)');
      return;
    }
    pending.set(`${chatId}:birthdate`, parsed);
    pending.set(chatId, 'awaiting_healmode');
    bot.sendMessage(chatId, '정화 방식을 골라주세요.', {
      reply_markup: {
        inline_keyboard: [[
          { text: '가볍게', callback_data: 'heal_off' },
          { text: '깊게', callback_data: 'heal_on' }
        ]]
      }
    });
    return;
  }

  // 기존 가입자 — 생월일 추가 수집(업그레이드)
  if (state === 'awaiting_birthdate_upgrade') {
    const parsed = parseBirthdate(text);
    if (!parsed) {
      bot.sendMessage(chatId, '생년월일 8자리로 다시 보내주세요. (예: 19901225)');
      return;
    }
    const user = getUser(chatId) || {};
    upsertUser(chatId, { ...user, birthYear: parsed.year, birthMonth: parsed.month, birthDay: parsed.day });
    pending.delete(chatId);
    bot.sendMessage(chatId, '업데이트되었습니다 🙂 /오늘 로 바로 확인해보세요.');
    return;
  }
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

// ── 매일 07:00(KST) 전체 가입자 발송 ──
cron.schedule('0 7 * * *', () => {
  const users = getAllUsers();
  Object.entries(users).forEach(([chatId, u]) => {
    if (!u || !u.birthYear) return;
    bot.sendMessage(chatId, buildMessage(u)).catch(err => {
      console.error(`발송 실패 (chatId=${chatId}):`, err.message);
    });
  });
  console.log(`[${new Date().toISOString()}] 일일 발송 완료 — 대상 ${Object.keys(users).length}명`);
}, { timezone: 'Asia/Seoul' });

console.log('지아세 오늘의 나 봇 — 실행 중');
