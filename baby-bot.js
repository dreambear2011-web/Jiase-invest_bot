/**
 * baby-bot.js
 * 데일리 캠페인 "오늘, 세상에 온 아이" — 발송 러너 (관리자 전용 초안 배달).
 *
 * 역할: 매일 아침 오늘의 5블록 콘텐츠 + 스레드 버전을 '현정님 텔레그램'으로 배달.
 *       → 검토 후 인스타/스레드에 직접 게시(초안→검토→납품 워크플로우 유지).
 *       구독자 발송 봇이 아님(bot.js와 별개). 토큰 0·유료 API 0(결정론적 텍스트 생성).
 *
 * 실행 모드 (환경변수 MODE):
 *   once      (기본) — 오늘 콘텐츠 1회 발송 후 종료. Railway Cron이 매일 트리거.
 *   schedule        — 프로세스 상주, 매일 08:00(KST) 자동 발송 (자체 호스팅 시).
 *   getid           — 봇에게 아무 메시지나 보내면 chat.id를 콘솔에 출력(최초 1회 셋업용).
 *
 * 환경변수:
 *   BABY_BOT_TOKEN   — 텔레그램 봇 토큰 (@BotFather)
 *   ADMIN_CHAT_ID    — 현정님 chat id (getid 모드로 확인)
 *
 * Railway Cron 예시(매일 KST 08:00 = UTC 23:00): "0 23 * * *", 명령 `node baby-bot.js`
 */

'use strict';
require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const { buildDailyContent } = require('./babyContent');

const TOKEN = process.env.BABY_BOT_TOKEN;
const ADMIN = process.env.ADMIN_CHAT_ID;
const MODE = process.env.MODE || 'once';

if (!TOKEN) {
  console.error('BABY_BOT_TOKEN이 설정되지 않았습니다.');
  process.exit(1);
}

// getid: chat id 확인용 (최초 셋업 1회) ─────────────────────────────
if (MODE === 'getid') {
  const bot = new TelegramBot(TOKEN, { polling: true });
  console.log('getid 모드 — 봇에게 아무 메시지나 보내주세요. chat.id를 출력합니다. (Ctrl+C로 종료)');
  bot.on('message', (msg) => {
    console.log(`chat.id = ${msg.chat.id}  (from: ${msg.chat.first_name || msg.chat.title || ''})`);
    bot.sendMessage(msg.chat.id, `이 채팅의 chat.id 는 ${msg.chat.id} 입니다. ADMIN_CHAT_ID 에 넣어주세요.`);
  });
  return;
}

// 오늘 콘텐츠를 관리자에게 배달 ──────────────────────────────────────
async function deliver(bot, date = new Date()) {
  if (!ADMIN) throw new Error('ADMIN_CHAT_ID가 설정되지 않았습니다. (MODE=getid로 확인)');
  const c = buildDailyContent(date);
  const m = c.meta;

  // ① 헤더 — 오늘의 산출 요약(내부 검토용, 게시 대상 아님)
  const header =
    `🍼 오늘, 세상에 온 아이 — ${m.dateStr}\n` +
    `일주 ${m.ilju} · 아이 ${m.ilgan}(${m.childEl}) × ${m.seasonName}(${m.seasonEl}) · ` +
    `채움 ${m.fillEl}\n` +
    `— 아래 5장을 인스타 캐러셀 슬롯에 그대로 —`;
  await bot.sendMessage(ADMIN, header);

  // ② 카드 5장 — 각 메시지 = 캐러셀 한 장(복붙 편의)
  for (let i = 0; i < c.instaCards.length; i++) {
    await bot.sendMessage(ADMIN, `【CARD ${i + 1}/5】\n${c.instaCards[i]}`);
  }

  // ③ 스레드 모드2 버전
  await bot.sendMessage(ADMIN, `🧵 스레드(모드2)\n\n${c.threadText}`);

  // ④ '부모가 채워주면' 단독 블록(분리 발행 옵션)
  await bot.sendMessage(ADMIN, `💛 옵션 블록\n\n${c.blessingBonus}`);

  // ⑤ 게시 체크 리마인더 (면책 바이오 상시 / 본문 CTA 금지)
  await bot.sendMessage(ADMIN,
    `✅ 게시 전 체크\n` +
    `· 바이오 링크 = 소리오행 위젯 → gift 랜딩 (본문 CTA 금지)\n` +
    `· 면책 문구 바이오 상시\n` +
    `· 캐러셀 첫 장 비율로 나머지 잘림 → 전 슬롯 1080×1350 통일`
  );

  console.log(`[${new Date().toISOString()}] 배달 완료 — ${m.dateStr} ${m.ilju} ${m.relation}`);
}

if (MODE === 'schedule') {
  const cron = require('node-cron');
  const bot = new TelegramBot(TOKEN, { polling: false });
  cron.schedule('0 8 * * *', () => {
    deliver(bot).catch(err => console.error('배달 실패:', err.message));
  }, { timezone: 'Asia/Seoul' });
  console.log('baby-bot — schedule 모드 (매일 08:00 KST 배달) 실행 중');
} else {
  // once (기본) — 1회 배달 후 종료
  const bot = new TelegramBot(TOKEN, { polling: false });
  deliver(bot)
    .then(() => process.exit(0))
    .catch(err => { console.error('배달 실패:', err.message); process.exit(1); });
}
