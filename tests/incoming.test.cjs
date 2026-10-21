const { test } = require('node:test');
const assert = require('node:assert/strict');
const { IncomingReplies, notificationBounds } = require('../src/incoming');
const row = (id, text, role = 'assistant') => ({ id, text, role });
const page = (messages, stop = false, url = 'https://chatgpt.com/dots/home') => ({ messages, stop, url });

test('old history and history prepended by scrolling never notify', () => {
  const replies = new IncomingReplies();
  assert.equal(replies.observe(page([row('1', 'old')]), 0), null);
  assert.equal(replies.observe(page([row('0', 'older'), row('1', 'old')]), 9000), null);
});
test('proactive replies need no user message; streaming and grouped bubbles settle once', () => {
  const replies = new IncomingReplies();
  const old = row('1', 'old');
  replies.observe(page([old]), 0);
  assert.equal(replies.observe(page([old, row('2', '안')], true), 1), null);
  assert.equal(replies.observe(page([old, row('2', '안녕')], true), 6000), null);
  assert.equal(replies.observe(page([old, row('2', '안녕'), row('3', '잠깐 쉴래?')]), 7000), null);
  assert.equal(replies.observe(page([old, row('2', '안녕'), row('3', '잠깐 쉴래?')]), 11000), '안녕\n\n잠깐 쉴래?');
  assert.equal(replies.observe(page([old, row('2', '안녕'), row('3', '잠깐 쉴래?')]), 19000), null);
  replies.observe(page([old, row('2', '안녕'), row('3', '잠깐 쉴래?'), row('4', '잠깐 쉴래?')]), 20000);
  assert.equal(replies.observe(page([old, row('2', '안녕'), row('3', '잠깐 쉴래?'), row('4', '잠깐 쉴래?')]), 24000), '잠깐 쉴래?');
});
test('user messages do not notify; reload and conversation switch rebaseline', () => {
  const replies = new IncomingReplies();
  replies.observe(page([row('1', 'old')]), 0);
  assert.equal(replies.observe(page([row('1', 'old'), row('2', 'hello', 'user')]), 10000), null);
  assert.equal(replies.observe(page([row('new-id', 'old')]), 20000), null);
  assert.equal(replies.observe(page([row('new-id', 'other')], false, 'https://chatgpt.com/dots/other')), null);
  replies.reset();
  assert.equal(replies.observe(page([row('new-id', 'old')])), null);
});
test('notification stays in each monitor work area and flips at the top edge', () => {
  for (const area of [{ x: 0, y: 0, width: 1920, height: 1040 }, { x: -1280, y: -100, width: 1280, height: 900 }]) {
    for (const x of [area.x, area.x + area.width - 190]) for (const y of [area.y, area.y + area.height - 190]) {
      const b = notificationBounds({ x, y, width: 190, height: 190 }, area);
      assert.ok(b.x >= area.x && b.y >= area.y);
      assert.ok(b.x + b.width <= area.x + area.width && b.y + b.height <= area.y + area.height);
      assert.equal(b.below, y === area.y);
    }
  }
});
