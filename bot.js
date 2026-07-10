/**
 * bot.js
 * 지아세 "오늘의 나" 텔레그램 봇.
 *
 * 흐름:
 *  /start → 생년월일 입력 → 힐링모드 선택(가볍게/깊게) → 가입 완료 + 즉시 샘플 발송
 *  매일 07:00(KST) 자동 발송 / /오늘 즉시 확인 / /이달 이달 남은 흐름 / /stop /privacy
 *
 * v3 — [풍부화] 한 덩어리 줄글 → 블록화(parse_mode:'HTML' + 라벨 + 구분선) +
 *  "다가오는 5일 흐름" 프리뷰 추가(랜딩보다 살짝 풍성). 산출 로직·문장 풀은 그대로.
 *  일주 정체성 한 줄은 "오늘의 결" 블록 상단에 병합 → 안 뜨는 날 빈 블록 방지.
 * v4 — [디자인] 고정 글리프 → 그날 일진 오행 카드 5종 회전(발행 콘텐츠와 세계관 통일).
 *  브랜드 마크(일출+산)는 /start 첫인사 전용. 레이키 글리프 이슈 해소.
 */

'use strict';
require('dotenv').config();
const path = require('path');
const TelegramBot = require('node-telegram-bot-api');
const cron = require('node-cron');

const { todayFortune } = require('./bornbone_today');
const { getTodayDomain, SIP_DAILY_DETAIL, SIP_DAILY_ACTION } = require('./sipseong');
const { getIljuIntroLine } = require('./ilju');
const { getTodayOhang } = require('./assetMapping'); // 그날 일진 오행 → 오행 카드 선택
const { pickHeal } = require('./phrases');
const { buildWeekPreview, kstMonthDay } = require('./preview');
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

// 랜딩(index.html) "오늘의 나" 위젯과 동일 문장(변형 0) + 추가 변형 2종.
// 마찰/정체/확장 3버킷 각 3변형을 날짜 기반으로 회전(같은 날 동일, 날짜 바뀌면 변형 회전).
const TYPE_MESSAGES = {
  A: [
    '오늘은 부딪히는 기운이 섞여드는 날입니다. 분명히 말했는데 다르게 들리거나, ' +
    '별일 아닌데 마음이 까끌까끌해질 수 있습니다. 당신이 잘못해서가 아니라 기운이 ' +
    '엇박자로 흐르는 탓이니, 너무 자책하지 않으셔도 됩니다. 무리해서 밀어붙이기보다 ' +
    '속도를 살짝 늦추고 한 박자 쉬어가면, 마찰은 생각보다 빠르게 가라앉습니다.',
    '오늘은 톱니가 살짝 어긋나는 날입니다. 평소라면 그냥 넘어갈 일에 마음이 걸리거나, ' +
    '같은 말도 괜히 날카롭게 들릴 수 있습니다. 이건 당신 탓이 아니라 오늘 흐르는 기운이 ' +
    '잠시 엇갈리는 것뿐입니다. 답을 서둘러 내기보다 한숨 돌리고 다시 보면, 어긋난 결이 ' +
    '금방 제자리를 찾습니다.',
    '오늘은 작은 마찰이 여기저기서 일어나기 쉬운 날입니다. 의도와 다르게 전달되거나, ' +
    '평소보다 신경이 곤두설 수 있는 흐름입니다. 잘못한 게 있어서가 아니라 오늘의 기운이 ' +
    '잠시 거칠게 부딪히는 탓입니다. 굳이 정면으로 맞서기보다 잠시 거리를 두면, 부딪힘은 ' +
    '의외로 쉽게 가라앉습니다.'
  ],
  B: [
    '오늘은 흐름이 한 박자 고이는 날입니다. 뭘 해도 평소만큼 진행이 안 되는 느낌이 ' +
    '들 수 있는데, 이건 멈춤이 아니라 안으로 다져지는 시간입니다. 새로 벌이기보다 ' +
    '있던 것을 정돈하고 비우면 한결 가벼워집니다. 오늘 조용히 머문 만큼, 며칠 뒤엔 ' +
    '더 단단한 바탕이 되어 돌아옵니다.',
    '오늘은 기운이 잠시 머무르는 날입니다. 평소보다 진도가 더디게 느껴질 수 있지만, ' +
    '멈춰 있는 게 아니라 안에서 조용히 다져지고 있는 시간입니다. 새 일을 벌이기보다 ' +
    '묵혀둔 것을 정리하면 마음이 한결 가벼워집니다. 오늘 들인 차분함이 며칠 뒤 더 단단한 ' +
    '결과로 돌아옵니다.',
    '오늘은 속도가 자연스럽게 줄어드는 날입니다. 밀어붙여도 잘 안 풀리는 느낌이 들 수 ' +
    '있는데, 그만큼 안으로 채워지는 시간이기도 합니다. 무리해서 진행시키기보다 미뤄둔 ' +
    '정리나 점검에 시간을 쓰면 좋습니다. 오늘의 멈춤은 다음 걸음을 더 단단하게 만들어 ' +
    '줄 시간입니다.'
  ],
  C: [
    '오늘은 당신 쪽으로 기운이 흘러드는 날입니다. 평소보다 일이 잘 풀리고 사람들과의 ' +
    '말도 잘 통하는 결이라, 미뤄둔 일이 있다면 오늘 한 걸음 밀어붙이기 좋습니다. ' +
    '다만 너무 욕심내며 한 번에 다 끌어안으려 하지는 마세요. 흐름이 좋을 때일수록 ' +
    '한 가지씩 야무지게 마무리하는 편이 더 멀리 갑니다.',
    '오늘은 기운이 당신 쪽으로 트이는 날입니다. 일이 평소보다 수월하게 풀리고, 대화도 ' +
    '한결 매끄럽게 통하는 결입니다. 미뤄둔 일이 있다면 오늘 한 걸음 내디뎌 보기 좋습니다. ' +
    '다만 욕심을 한꺼번에 부리기보다, 하나씩 야무지게 마무리하는 쪽이 더 오래갑니다.',
    '오늘은 흐름이 당신 편으로 흘러드는 날입니다. 평소보다 손이 가벼워지고, 사람들과의 ' +
    '말도 술술 풀리는 결입니다. 벌여놓은 일이나 미뤄둔 연락을 오늘 밀어붙이면 효과가 ' +
    '큽니다. 다만 한 번에 다 끌어안기보다, 한 가지씩 마무리해 나가는 편이 더 멀리 갑니다.'
  ]
};

// 날짜 기반 결정적 인덱스 — 같은 날 동일 문장, 날짜 바뀌면 변형 회전. chatId/생년 섞어 사용자별 편차.
function pickTypeMessage(type, date, seedKey) {
  const variants = TYPE_MESSAGES[type] || TYPE_MESSAGES.B;
  const kst = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(date);
  const g = (t) => +kst.find(p => p.type === t).value;
  const kstDayNum = Math.floor(Date.UTC(g('year'), g('month') - 1, g('day')) / 86400000);
  let seed = kstDayNum;
  if (seedKey) {
    const key = String(seedKey);
    for (let i = 0; i < key.length; i++) seed += key.charCodeAt(i);
  }
  const idx = ((seed % variants.length) + variants.length) % variants.length;
  return variants[idx];
}

// ⚠️ 이미지는 반드시 __dirname(이 파일이 있는 폴더) 기준 절대경로로. 상대경로('./x.png')는
//    실행 위치(cwd)에 따라 Railway에서 파일을 못 찾아 sendPhoto가 조용히 실패한다.
const IMG = (name) => path.join(__dirname, name);
// 브랜드 마크(일출+산) — /start 첫인사 전용
const BRAND_MARK = IMG('today-self-mark.png');
// 오행 카드 5종 — 그날 일진 오행에 맞춰 매일 마무리 이미지로 회전(발행 콘텐츠와 세계관 통일).
const ELEMENT_CARD = {
  木: IMG('card-wood.png'),
  火: IMG('card-fire.png'),
  土: IMG('card-earth.png'),
  金: IMG('card-metal.png'),
  水: IMG('card-water.png')
};

// 시작 시 이미지 파일 존재 점검 — 없으면 어떤 파일이 빠졌는지 로그로 바로 확인.
(function checkImages() {
  const fs = require('fs');
  const all = [BRAND_MARK, ...Object.values(ELEMENT_CARD)];
  const missing = all.filter((p) => !fs.existsSync(p));
  if (missing.length) {
    console.warn('[이미지 누락] 아래 파일을 봇 폴더에 넣어주세요:\n' + missing.map((p) => '  - ' + p).join('\n'));
  } else {
    console.log('[이미지] 7종 확인 완료');
  }
})();

function buildMessageParts(user, chatId) {
  const { birthYear, birthMonth, birthDay } = user;
  const now = new Date();
  const r = todayFortune(birthYear, now);
  const message = pickTypeMessage(r.type, now, chatId);

  // 일주 정체성 한 줄 — 약 30% 확률(ilju.js). "오늘의 결" 상단에 병합(빈 블록 방지).
  const iljuIntro = (birthMonth && birthDay)
    ? getIljuIntroLine(birthYear, birthMonth, birthDay)
    : null;
  const iljuLine = iljuIntro ? `${iljuIntro}\n` : '';

  // 십성 영역 + 활성화 이유 + 오늘의 행동 조언 — 생년월일 전체 필요(§59-8)
  const domain = getTodayDomain(birthYear, birthMonth, birthDay, now, 'daily');
  let domainBlock = '';
  if (domain) {
    domainBlock =
      `<b>오늘 스며드는 곳 · ${domain.label}</b>\n${SIP_DAILY_DETAIL[domain.sipseong] || ''}\n\n` +
      `<b>오늘 해보면 좋은 것</b>\n${SIP_DAILY_ACTION[domain.sipseong] || ''}\n\n`;
  }

  const dirBlock = r.dirLabel
    ? `<b>곁에 두면 좋은 방향</b>\n${r.dirLabel}의 기운을 가까이 두시면 흐름이 한결 부드러워집니다.\n\n`
    : '';

  const preview = buildWeekPreview(birthYear, 5, now);
  const heal = pickHeal(r.type, user.healMode);
  const ohang = getTodayOhang(now); // 그날 일진 오행 → 마무리 카드 선택

  const text =
    `🌅 <b>오늘의 나</b> · ${kstMonthDay(now)}\n` +
    `━━━━━━━━━━\n\n` +
    `<b>오늘의 결</b>\n${iljuLine}${message}\n\n` +
    `${domainBlock}` +
    `${dirBlock}` +
    `${preview}`;

  return { text, heal, ohang };
}

/** /이달 — 이달 남은 날 흐름(랜딩 월 캘린더의 텍스트판). */
function buildMonthPreview(birthYear) {
  const now = new Date();
  const y = +new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric' }).format(now);
  const m = +new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', month: '2-digit' }).format(now);
  const today = +new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', day: '2-digit' }).format(now);
  const daysInMonth = new Date(y, m, 0).getDate();
  const remain = daysInMonth - today + 1;
  return `🗓 <b>${m}월 남은 날의 흐름</b>\n` + buildWeekPreview(birthYear, remain, now).split('\n').slice(1).join('\n');
}

async function sendDailyToday(chatId, user) {
  const { text, heal, ohang } = buildMessageParts(user, chatId);
  await bot.sendMessage(chatId, text, { parse_mode: 'HTML' });
  // 힐링 멘트는 그날 오행 카드 캡션으로 분리 발송 — "오늘의 마무리 도장" + 매일 결이 바뀌는 감성
  const card = ELEMENT_CARD[ohang] || ELEMENT_CARD['土'];
  await bot.sendPhoto(chatId, card, { caption: heal })
    .catch((err) => console.error(`[오행카드 발송 실패] ${card} → ${err.message}`));
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
  const welcome =
    '안녕하세요, 지아세 知我世입니다 🙂\n' +
    '매일 아침 당신의 기운을 짧게 전해드립니다.\n\n' +
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

// ── /이달 : 이달 남은 흐름 ──
bot.onText(/\/이달/, (msg) => {
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

console.log('지아세 오늘의 나 봇 (v3) — 실행 중');
