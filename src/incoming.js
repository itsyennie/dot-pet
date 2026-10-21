// Tracks appended replies, not historical messages loaded above the current tail.
class IncomingReplies {
  constructor(stableMs = 4000) { this.stableMs = stableMs; this.reset(); }
  reset() { this.url = null; this.tail = null; this.pending = new Map(); }
  observe(current, now = Date.now()) {
    const url = new URL(current.url);
    const key = url.origin + url.pathname;
    const messages = current.messages;
    if (this.url !== key || (this.tail && !messages.some(m => m.id === this.tail))) {
      this.reset(); this.url = key; this.tail = messages.at(-1)?.id || null;
      return null;
    }
    const boundary = this.tail ? messages.findIndex(m => m.id === this.tail) : -1;
    for (const message of messages.slice(boundary + 1)) {
      if (message.role === 'assistant') this.pending.set(message.id, { text: message.text, changed: now });
    }
    this.tail = messages.at(-1)?.id || this.tail;
    for (const [id, item] of this.pending) {
      const message = messages.find(m => m.id === id);
      if (!message) { this.pending.delete(id); continue; }
      if (message.text !== item.text) { item.text = message.text; item.changed = now; }
    }
    if (!this.pending.size || current.stop) return null;
    const items = [...this.pending.values()];
    if (items.some(item => !item.text || now - item.changed < this.stableMs)) return null;
    this.pending.clear();
    return items.map(item => item.text).join('\n\n');
  }
}

function notificationBounds(pet, area, width = 300, height = 174) {
  width = Math.min(width, area.width); height = Math.min(height, area.height);
  const clamp = (n, min, max) => Math.max(min, Math.min(n, max));
  const below = pet.y - height - 8 < area.y;
  const x = clamp(Math.round(pet.x + pet.width / 2 - width / 2), area.x, area.x + area.width - width);
  const y = clamp(below ? pet.y + pet.height + 8 : pet.y - height - 8, area.y, area.y + area.height - height);
  return { x, y, width, height, below, tip: clamp(Math.round(pet.x + pet.width / 2 - x), 24, width - 24) };
}
module.exports = { IncomingReplies, notificationBounds };
