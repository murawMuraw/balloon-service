class GuestBalloonStore {
  constructor() {
    this.guestBalloons = new Map();
  }

  generateGuestId() {
    return `guest_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  set(userId, balloon) {
    this.guestBalloons.set(userId, balloon);
  }

  get(userId) {
    return this.guestBalloons.get(userId);
  }

  delete(userId) {
    return this.guestBalloons.delete(userId);
  }

  has(userId) {
    return this.guestBalloons.has(userId);
  }

  getAll() {
    return Array.from(this.guestBalloons.values());
  }

  getByBalloonId(balloonId) {
    for (const [key, balloon] of this.guestBalloons.entries()) {
      if (balloon.id === balloonId) {
        return { key, balloon };
      }
    }
    return null;
  }

  getActive() {
    return Array.from(this.guestBalloons.values()).filter(b => b.is_flying);
  }

  get size() {
    return this.guestBalloons.size;
  }
}

module.exports = new GuestBalloonStore();
