/**
 * bot.js
 * 지아세 "오늘의 나" 텔레그램 봇.
 *
 * 흐름:
 *  /start → 생년월일 입력 → 힐링모드 선택(가볍게/깊게) → 가입 완료 + 즉시 샘플 발송
 *  매일 07:00(KST) 전체 가입자에게 자동 발송
 *  /오늘  → 즉시 확인
 *  /stop  → 수신 거부
 *  /privacy → 개인정보 처리 안내
 *
 * v2 — 문체 풍부화(랜딩 index.html "오늘의 나" 위젯과 동일 톤·분량으로 통일) +
 * 정보량 강화(60갑자 일주 정체성·십성 영역 설명·행동 조언 추가).
 *
 * 실행 전: npm install && cp .env.example .env (BOT_TOKEN 입력) 후 npm start
 */

'use strict';
require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const cron = require('node-cron');

const { todayFortune } = require('./bornbone_today');
const { getTodayDomain, SIP_DAILY_DETAIL, SIP_DAILY_ACTION } = require('./sipseong');
const { getIljuIntroLine } = require('./ilju');
const { pickHeal } = require('./phrases');
const { upsertUser, getUser, removeUser, getAllUsers } = require('./storage');

const TOKEN = process.env.BOT_TOKEN;
if (!TOKEN) {
  console.error('BOT_TOKEN이 설정되지 않았습니다. .env 파일을 확인하세요.');
  process.exit(1);
}

const bot = new TelegramBot(TOKEN, { polling: true });

// 진행 중인 온보딩 상태(메모리) — chatId → 'awaiting_birthdate' | 'awaiting_healmode'
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

// 랜딩(index.html) "오늘의 나" 위젯과 동일 문장 — 문체·분량 통일
const TYPE_MESSAGE = {
  A: '오늘은 부딪히는 기운이 섞여드는 날입니다. 분명히 말했는데 다르게 들리거나, ' +
     '별일 아닌데 마음이 까끌까끌해질 수 있습니다. 당신이 잘못해서가 아니라 기운이 ' +
     '엇박자로 흐르는 탓이니, 너무 자책하지 않으셔도 됩니다. 무리해서 밀어붙이기보다 ' +
     '속도를 살짝 늦추고 한 박자 쉬어가면, 마찰은 생각보다 빠르게 가라앉습니다.',
  B: '오늘은 흐름이 한 박자 고이는 날입니다. 뭘 해도 평소만큼 진행이 안 되는 느낌이 ' +
     '들 수 있는데, 이건 멈춤이 아니라 안으로 다져지는 시간입니다. 새로 벌이기보다 ' +
     '있던 것을 정돈하고 비우면 한결 가벼워집니다. 오늘 조용히 머문 만큼, 며칠 뒤엔 ' +
     '더 단단한 바탕이 되어 돌아옵니다.',
  C: '오늘은 당신 쪽으로 기운이 흘러드는 날입니다. 평소보다 일이 잘 풀리고 사람들과의 ' +
     '말도 잘 통하는 결이라, 미뤄둔 일이 있다면 오늘 한 걸음 밀어붙이기 좋습니다. ' +
     '다만 너무 욕심내며 한 번에 다 끌어안으려 하지는 마세요. 흐름이 좋을 때일수록 ' +
     '한 가지씩 야무지게 마무리하는 편이 더 멀리 갑니다.'
};

const GLYPH_PATH = './today-self-mark.png'; // "오늘의 나" 공통 시그니처 이미지 — 유형·모드 불문 통일

function buildMessageParts(user) {
  const { birthYear, birthMonth, birthDay } = user;
  const r = todayFortune(birthYear);
  const message = TYPE_MESSAGE[r.type] || TYPE_MESSAGE.B;

  // ① 일주 정체성 한 줄 — 약 30% 확률로만 노출(ilju.js). 매일 노출 시 단정·세뇌 위험 방지.
  const iljuIntro = (birthMonth && birthDay)
    ? getIljuIntroLine(birthYear, birthMonth, birthDay)
    : null;
  const iljuLine = iljuIntro ? `${iljuIntro}\n\n` : '';

  // ② 십성 영역 + 활성화 이유 + 오늘의 행동 조언 — 생년월일 전체 필요(§59-8)
  const domain = getTodayDomain(birthYear, birthMonth, birthDay, new Date(), 'daily');
  const domainBlock = domain
    ? `\n\n오늘은 특히 '${domain.label}' 쪽에 그 기운이 스며듭니다. ` +
      `${SIP_DAILY_DETAIL[domain.sipseong] || ''}\n\n` +
      `오늘 해보면 좋은 것 — ${SIP_DAILY_ACTION[domain.sipseong] || ''}`
    : '';

  const dirLine = r.dirLabel
    ? `\n\n오늘은 ${r.dirLabel}의 기운을 가까이 두시면, 흐름이 한결 부드러워집니다.`
    : '';
  const heal = pickHeal(r.type, user.healMode);

  const text =
    `🌅 오늘의 나\n\n` +
    `${iljuLine}` +
    `${message}` +
    `${domainBlock}` +
    `${dirLine}`;

  return { text, heal };
}

async function sendDailyToday(chatId, user) {
  const { text, heal } = buildMessageParts(user);
  await bot.sendMessage(chatId, text);
  // 힐링 멘트는 시그니처 이미지 캡션으로 분리 발송 — "오늘의 마무리 도장" 효과 (투자봇과 동일 패턴)
  await bot.sendPhoto(chatId, GLYPH_PATH, { caption: heal });
}

// ── /start : 온보딩 시작 ──
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const existing = getUser(chatId);
  if (existing && existing.birthYear) {
    bot.sendMessage(chatId, '이미 가입되어 있습니다. /오늘 로 바로 확인하실 수 있어요. (다시 설정하려면 /stop 후 /start)');
    return;
  }
  pending.set(chatId, 'awaiting_birthdate');
  bot.sendMessage(chatId,
    '안녕하세요, 지아세 知我世입니다 🙂\n' +
    '매일 아침 당신의 기운을 짧게 전해드립니다.\n\n' +
    '생년월일을 숫자 8자리로 보내주세요. (예: 19901225)'
  );
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

// ── /오늘 : 즉시 확인 ──
bot.onText(/\/오늘/, (msg) => {
  const chatId = msg.chat.id;
  const user = getUser(chatId);
  if (!user || !user.birthYear) {
    bot.sendMessage(chatId, '먼저 /start 로 가입해주세요.');
    return;
  }
  sendDailyToday(chatId, user).catch(err => console.error('발송 실패:', err.message));
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
    '수집 항목: 생년월일, 텔레그램 chat ID, 힐링모드 설정값만 저장합니다.\n' +
    '용도: 매일 발송 콘텐츠 개인화 목적 외 사용하지 않습니다.\n' +
    '삭제: /stop 시 즉시 파기됩니다.\n\n' +
    '※ 본 콘텐츠는 의료행위·심리치료가 아닌 예방적 자기관리 참고용 서비스입니다.'
  );
});

// ── 힐링모드 선택 콜백 ──
bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const data = query.data; // 'heal_off' | 'heal_on'

  if (data === 'heal_off' || data === 'heal_on') {
    const healMode = data === 'heal_on' ? 'on' : 'off';
    const pendingDate = pending.get(`${chatId}:birthdate`); // { year, month, day }
    const newUser = {
      birthYear: pendingDate.year,
      birthMonth: pendingDate.month,
      birthDay: pendingDate.day,
      healMode,
      joinedAt: new Date().toISOString()
    };
    upsertUser(chatId, newUser);
    pending.delete(chatId);
    pending.delete(`${chatId}:birthdate`);

    bot.answerCallbackQuery(query.id);
    await bot.sendMessage(chatId, '가입이 완료되었습니다. 매일 아침 7시에 전해드릴게요 🙂\n\n오늘의 기운을 먼저 보여드릴게요 —');
    sendDailyToday(chatId, newUser).catch(err => console.error('샘플 발송 실패:', err.message));
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

  // 온보딩: 생년월일 8자리 입력 대기 중
  if (pending.get(chatId) === 'awaiting_birthdate') {
    const parsed = parseBirthdate(text);
    if (!parsed) {
      bot.sendMessage(chatId, '생년월일을 숫자 8자리로 다시 보내주세요. (예: 19901225)');
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
  }
});

// ── 매일 07:00(KST) 전체 가입자 발송 ──
cron.schedule('0 7 * * *', () => {
  const users = getAllUsers();
  Object.entries(users).forEach(([chatId, u]) => {
    if (!u || !u.birthYear) return;
    sendDailyToday(chatId, u).catch(err => {
      console.error(`발송 실패 (chatId=${chatId}):`, err.message);
    });
  });
  console.log(`[${new Date().toISOString()}] 일일 발송 완료 — 대상 ${Object.keys(users).length}명`);
}, { timezone: 'Asia/Seoul' });

console.log('지아세 오늘의 나 봇 — 실행 중');
