/**
 * storage.js
 * 간단한 JSON 파일 기반 사용자 저장소. 소규모(가족·지인~수백 명) 운영 기준.
 * 사용자 늘어나면 SQLite/Postgres로 교체 권장(§"일반 공개봇 검토" 대화 참조).
 *
 * 저장 항목: { [chatId]: { birthYear, healMode: 'off'|'on', joinedAt } }
 */

'use strict';
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'users.json');

function loadUsers() {
  try {
    const raw = fs.readFileSync(DB_PATH, 'utf-8');
    return JSON.parse(raw);
  } catch (e) {
    return {};
  }
}

function saveUsers(users) {
  fs.writeFileSync(DB_PATH, JSON.stringify(users, null, 2), 'utf-8');
}

function upsertUser(chatId, data) {
  const users = loadUsers();
  users[chatId] = { ...(users[chatId] || {}), ...data };
  saveUsers(users);
  return users[chatId];
}

function getUser(chatId) {
  const users = loadUsers();
  return users[chatId] || null;
}

function removeUser(chatId) {
  const users = loadUsers();
  delete users[chatId];
  saveUsers(users);
}

function getAllUsers() {
  return loadUsers();
}

module.exports = { loadUsers, saveUsers, upsertUser, getUser, removeUser, getAllUsers };
