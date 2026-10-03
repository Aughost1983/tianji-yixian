import { SKILL_SFX_FILES, SKILL_SFX_SETTINGS } from "../data/skill-sfx.js";

const FILES = {
  click: "./assets/audio/click.mp3",
  footsteps: "./assets/audio/footsteps.mp3",
  battleStart: "./assets/audio/battle-start.mp3",
  swordApproach: "./assets/audio/sword-approach.mp3",
  attack: "./assets/audio/attack.mp3",
  hit: "./assets/audio/hit.mp3",
  miss: "./assets/audio/miss.mp3",
  win: "./assets/audio/win.mp3",
  revive: "./assets/audio/revive.mp3",
  fail: "./assets/audio/fail.mp3",
  death: "./assets/audio/death.mp3",
  defense: "./assets/audio/defense.mp3",
  support: "./assets/audio/support.mp3",
  artifact: "./assets/audio/artifact.mp3",
  enemyHitWolf: "./assets/audio/enemy-hit-wolf.mp3",
  enemyHitBerserkWolf: "./assets/audio/enemy-hit-berserk-wolf.mp3",
  enemyHitSpider: "./assets/audio/enemy-hit-spider.mp3",
  enemyHitWhiteJadePython: "./assets/audio/enemy-hit-white-jade-python.mp3",
  enemyHitStoneGolem: "./assets/audio/enemy-hit-stone-golem.mp3",
  enemyHitGate: "./assets/audio/enemy-hit-gate.mp3",
  enemyHitTiger: "./assets/audio/enemy-hit-tiger.mp3",
  enemyHitLostMindApothecary: "./assets/audio/enemy-hit-lost-mind-apothecary.mp3",
  enemyHitEvilAlchemist: "./assets/audio/enemy-hit-evil-alchemist.mp3",
  enemyHitPursuer: "./assets/audio/enemy-hit-pursuer.mp3",
  enemyHitPursuerElite: "./assets/audio/enemy-hit-pursuer-elite.mp3",
  enemyHitFiveElementsDisciple: "./assets/audio/enemy-hit-five-elements-disciple.mp3",
  enemyHitFiveElementsElite: "./assets/audio/enemy-hit-five-elements-elite.mp3",
  enemyHitQingyiCultivator: "./assets/audio/enemy-hit-qingyi-cultivator.mp3",
  enemyHitZhengyangDisciple: "./assets/audio/enemy-hit-zhengyang-disciple.mp3",
  enemyHitZhengyangElite: "./assets/audio/enemy-hit-zhengyang-elite.mp3",
  enemyHitZhengyangChief: "./assets/audio/enemy-hit-zhengyang-chief.mp3",
  enemyHitZhengyangLeftProtector: "./assets/audio/enemy-hit-zhengyang-left-protector.mp3",
  ...Object.fromEntries(Object.entries(SKILL_SFX_FILES).map(([key, file]) => [
    `skill:${key}`, `./assets/audio/skills/${file}.mp3`,
  ])),
};

const ENEMY_HIT_SFX = Object.freeze({
  wolf: "enemyHitWolf",
  berserkWolf: "enemyHitBerserkWolf",
  spider: "enemyHitSpider",
  whiteJadePython: "enemyHitWhiteJadePython",
  stoneGolem: "enemyHitStoneGolem",
  gate: "enemyHitGate",
  tiger: "enemyHitTiger",
  lostMindApothecary: "enemyHitLostMindApothecary",
  evilAlchemist: "enemyHitEvilAlchemist",
  pursuerSword: "enemyHitPursuer",
  pursuerElite: "enemyHitPursuerElite",
  fiveElementsDisciple: "enemyHitFiveElementsDisciple",
  fiveElementsElite: "enemyHitFiveElementsElite",
  qingyiCultivator: "enemyHitQingyiCultivator",
  zhengyangDisciple: "enemyHitZhengyangDisciple",
  zhengyangElite: "enemyHitZhengyangElite",
  zhengyangChief: "enemyHitZhengyangChief",
  zhengyangLeftProtector: "enemyHitZhengyangLeftProtector",
});

const BGM_FILES = {
  map: "./assets/audio/bgm-map.mp3",
  rest: "./assets/audio/bgm-rest.mp3",
  combat: "./assets/audio/bgm-combat.mp3",
  gateCombat: "./assets/audio/bgm-gate.mp3",
  merchant: "./assets/audio/bgm-merchant.mp3",
};

const MAX_VOICES_PER_SFX = 6;
const DEFAULT_BGM_VOLUME = 0.30;
const ENEMY_HIT_DELAY_MS = 110;
const VOLUME_STEPS = [1, 0, 0.25, 0.5, 0.75];

export class AudioManager {
  constructor() {
    this.enabled = true;
    this.volumeLevel = 1;
    this.cache = new Map();
    this.voiceBaseVolumes = new WeakMap();
    this.bgmCache = new Map();
    this.currentBgmId = null;
    this.desiredBgmId = null;
    this.bgmVolume = DEFAULT_BGM_VOLUME;
    this.bgmFadeTimer = null;
  }

  toggle() {
    const step = VOLUME_STEPS.indexOf(this.volumeLevel);
    this.volumeLevel = VOLUME_STEPS[(step + 1) % VOLUME_STEPS.length];
    this.enabled = this.volumeLevel > 0;
    if (!this.enabled) {
      for (const audio of this.bgmCache.values()) audio.pause();
      for (const pool of this.cache.values()) for (const voice of pool) voice.pause();
    } else if (this.desiredBgmId) {
      this.startBgm(this.desiredBgmId);
    }
    for (const pool of this.cache.values()) {
      for (const voice of pool) voice.volume = (this.voiceBaseVolumes.get(voice) ?? 0) * this.volumeLevel;
    }
    for (const bgm of this.bgmCache.values()) bgm.volume = this.bgmVolume * this.volumeLevel;
    return this.enabled;
  }

  getVoice(id) {
    let pool = this.cache.get(id);
    if (!pool) {
      pool = [];
      this.cache.set(id, pool);
    }

    let voice = pool.find((audio) => audio.paused || audio.ended);
    if (!voice && pool.length < MAX_VOICES_PER_SFX) {
      voice = new Audio(FILES[id]);
      pool.push(voice);
    }
    if (!voice) {
      voice = pool.shift();
      pool.push(voice);
      voice.pause();
    }
    return voice;
  }

  preload(ids = []) {
    for (const id of ids) {
      if (!FILES[id] || this.cache.has(id)) continue;
      const voice = this.getVoice(id);
      if (!voice) continue;
      voice.preload = "auto";
      voice.load?.();
    }
  }

  play(id, gainValue = 0.45) {
    if (!this.enabled || !FILES[id]) return;
    const audio = this.getVoice(id);
    if (!audio) return;
    audio.currentTime = 0;
    const baseVolume = Math.max(0, Math.min(1, Number(gainValue) || 0));
    this.voiceBaseVolumes.set(audio, baseVolume);
    audio.volume = baseVolume * this.volumeLevel;
    audio.play().catch(() => {});
  }

  playSkill(skillSfxKey, gainValue = 0.43) {
    if (!SKILL_SFX_SETTINGS.enabled) return;
    if (skillSfxKey && SKILL_SFX_FILES[skillSfxKey]) this.play(`skill:${skillSfxKey}`, gainValue);
  }

  playEnemyHit(enemy, gainValue = null, delayMs = ENEMY_HIT_DELAY_MS) {
    if (!enemy || enemy.kind !== "enemy") return;
    const sfxId = ENEMY_HIT_SFX[enemy.enemyId];
    if (!sfxId) return;
    const resolvedGain = gainValue ?? 0.4;
    // The generic impact sound is fired immediately by damage resolution.
    // Let the enemy-specific reaction follow a short moment later so the
    // two layers read as impact -> voice instead of masking each other.
    const wait = Math.max(0, Math.floor(Number(delayMs) || 0));
    if (wait === 0) {
      this.play(sfxId, resolvedGain);
      return;
    }
    setTimeout(() => {
      if (this.enabled) this.play(sfxId, resolvedGain);
    }, wait);
  }

  getBgm(id) {
    if (!BGM_FILES[id]) return null;
    let audio = this.bgmCache.get(id);
    if (!audio) {
      audio = new Audio(BGM_FILES[id]);
      audio.loop = true;
      audio.preload = "auto";
      this.bgmCache.set(id, audio);
    }
    return audio;
  }

  startBgm(id) {
    const audio = this.getBgm(id);
    if (!audio || !this.enabled) return;
    audio.volume = Math.max(0, Math.min(1, this.bgmVolume * this.volumeLevel));
    audio.play().catch(() => {});
  }

  setBgm(id, volume = DEFAULT_BGM_VOLUME) {
    const normalized = BGM_FILES[id] ? id : null;
    this.desiredBgmId = normalized;
    this.bgmVolume = Math.max(0, Math.min(1, volume));
    if (this.currentBgmId !== normalized) {
      if (this.bgmFadeTimer) { clearInterval(this.bgmFadeTimer); this.bgmFadeTimer = null; }
      if (this.currentBgmId) { const previous = this.bgmCache.get(this.currentBgmId); if (previous) { previous.pause(); previous.currentTime = 0; } }
      this.currentBgmId = normalized;
    }
    if (!normalized) return;
    const audio = this.getBgm(normalized);
    if (!audio) return;
    audio.volume = this.bgmVolume * this.volumeLevel;
    if (this.enabled && audio.paused) audio.play().catch(() => {});
  }

  fadeBgmVolume(targetVolume, durationMs = 1500) {
    if (this.bgmFadeTimer) { clearInterval(this.bgmFadeTimer); this.bgmFadeTimer = null; }
    const id = this.currentBgmId; const audio = id ? this.getBgm(id) : null; if (!audio) return;
    const start = Math.max(0, Math.min(1, Number(this.bgmVolume) || 0));
    const target = Math.max(0, Math.min(1, Number(targetVolume) || 0));
    const duration = Math.max(1, Math.floor(Number(durationMs) || 1)); const startedAt = Date.now();
    this.bgmFadeTimer = setInterval(() => {
      if (this.currentBgmId !== id) { clearInterval(this.bgmFadeTimer); this.bgmFadeTimer = null; return; }
      const t = Math.min(1, (Date.now() - startedAt) / duration); const value = start + (target - start) * t;
      this.bgmVolume = value; audio.volume = value * this.volumeLevel;
      if (t >= 1) { clearInterval(this.bgmFadeTimer); this.bgmFadeTimer = null; }
    }, 50);
  }
}
