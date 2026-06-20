/**
 * bot.js
 * 지아세 "오늘의 나" 텔레그램 봇.
 *
 * 흐름:
 *  /start → 출생연도 입력 → 힐링모드 선택(가볍게/깊게) → 가입 완료 + 즉시 샘플 발송
 *  매일 07:00(KST) 전체 가입자에게 자동 발송
 *  /오늘  → 즉시 확인
 *  /stop  → 수신 거부
 *  /privacy → 개인정보 처리 안내
 *
 * 실행 전: npm install && cp .env.example .env (BOT_TOKEN 입력) 후 npm start
 */

'use strict';
require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const cron = require('node-cron');

const { todayFortune } = require('./bornbone_today');
const { pickHeal } = require('./phrases');
const { upsertUser, getUser, removeUser, getAllUsers } = require('./storage');

const TOKEN = process.env.BOT_TOKEN;
if (!TOKEN) {
  console.error('BOT_TOKEN이 설정되지 않았습니다. .env 파일을 확인하세요.');
  process.exit(1);
}

const bot = new TelegramBot(TOKEN, { polling: true });

// 진행 중인 온보딩 상태(메모리) — chatId → 'awaiting_year'
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
  A: '오늘은 날이 선 칼처럼 마찰이 도는 결입니다. 서로 부딪히고 갈리는 기운이라, ' +
     '평소보다 작은 일에도 신경이 곤두서기 쉬운 날입니다.',
  B: '오늘은 물이 고이듯 차분히 가라앉는 결입니다. 크게 움직이지 않고 안으로 다져지는 ' +
     '하루라, 무리해서 무언가를 밀어붙이지 않아도 괜찮습니다.',
  C: '오늘은 땅이 든든히 받쳐주듯 기댈 곳이 있는 결입니다. 혼자 애쓰지 않아도 흐름이 ' +
     '당신 쪽으로 기울어 있는 날입니다.'
};

const TYPE_BODY = {
  A: '마음이 자꾸 쓰인다면, 오늘만큼은 굳이 정면으로 맞부딪히지 않아도 됩니다. ' +
     '한 발 물러서서 숨을 고르는 것도 오늘을 잘 보내는 방법입니다.',
  B: '고이는 기운은 쌓이는 기운이기도 합니다. 오늘 조용히 머문 시간이 며칠 뒤엔 ' +
     '단단한 바탕이 되어줄 거예요.',
  C: '받쳐주는 기운이 도는 날엔, 평소 미뤄두었던 부탁이나 시도를 해보기에도 좋습니다. ' +
     '뜻밖의 도움이 따라올 수 있는 결입니다.'
};

function buildMessage(birthYear, healMode) {
  const r = todayFortune(birthYear);
  const intro = TYPE_INTRO[r.type] || TYPE_INTRO.B;
  const body = TYPE_BODY[r.type] || TYPE_BODY.B;
  const dirLine = r.dirLabel
    ? `\n\n오늘은 ${r.dirLabel}의 기운을 가까이 두시면, 흐름이 한결 부드러워집니다.`
    : '';
  const heal = pickHeal(r.type, healMode);

  return (
    `🌅 오늘의 나\n\n` +
    `${intro} ${body}` +
    `${dirLine}\n\n` +
    `${heal}`
  );
}

// ── /start : 온보딩 시작 ──
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const existing = getUser(chatId);
  if (existing && existing.birthYear) {
    bot.sendMessage(chatId, '이미 가입되어 있습니다. /오늘 로 바로 확인하실 수 있어요. (다시 설정하려면 /stop 후 /start)');
    return;
  }
  pending.set(chatId, 'awaiting_year');
  bot.sendMessage(chatId,
    '안녕하세요, 지아세 知我世입니다 🙂\n' +
    '매일 아침 당신의 기운을 짧게 전해드립니다.\n\n' +
    '태어난 해를 숫자 4자리로 보내주세요. (예: 1990)'
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
  bot.sendMessage(chatId, buildMessage(user.birthYear, user.healMode));
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
    '수집 항목: 출생연도, 텔레그램 chat ID, 힐링모드 설정값만 저장합니다.\n' +
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
    const pendingYear = pending.get(`${chatId}:year`);
    upsertUser(chatId, {
      birthYear: pendingYear,
      healMode,
      joinedAt: new Date().toISOString()
    });
    pending.delete(chatId);
    pending.delete(`${chatId}:year`);

    bot.answerCallbackQuery(query.id);
    bot.sendMessage(chatId, '가입이 완료되었습니다. 매일 아침 7시에 전해드릴게요 🙂\n\n오늘의 기운을 먼저 보여드릴게요 —');
    bot.sendMessage(chatId, buildMessage(pendingYear, healMode));
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

  // 온보딩: 출생연도 입력 대기 중
  if (pending.get(chatId) === 'awaiting_year') {
    const year = parseInt(text.trim(), 10);
    if (!year || year < 1900 || year > 2100) {
      bot.sendMessage(chatId, '연도를 숫자 4자리로 다시 보내주세요. (예: 1990)');
      return;
    }
    pending.set(`${chatId}:year`, year);
    pending.set(chatId, 'awaiting_healmode');
    bot.sendMessage(chatId, '정화 방식을 골라주세요.', {
      reply_markup: {
        inline_keyboard: [[
          { text: '가볍게', callback_data: 'heal_off' },
          { text: '깊게', callback_data: 'heal_on' }
        ]]
      }
    });
  }
});

// ── 매일 07:00(KST) 전체 가입자 발송 ──
cron.schedule('0 7 * * *', () => {
  const users = getAllUsers();
  Object.entries(users).forEach(([chatId, u]) => {
    if (!u || !u.birthYear) return;
    bot.sendMessage(chatId, buildMessage(u.birthYear, u.healMode)).catch(err => {
      console.error(`발송 실패 (chatId=${chatId}):`, err.message);
    });
  });
  console.log(`[${new Date().toISOString()}] 일일 발송 완료 — 대상 ${Object.keys(users).length}명`);
}, { timezone: 'Asia/Seoul' });

console.log('지아세 오늘의 나 봇 — 실행 중');
