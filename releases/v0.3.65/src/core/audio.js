import { SKILL_SFX_FILES, SKILL_SFX_SETTINGS } from "../data/skill-sfx.js?v=v0.3.65";

export const AUDIO_FILES = {
  click: "./assets/audio/click.wav",
  footsteps: "./assets/audio/footsteps.wav",
  battleStart: "./assets/audio/battle-start.wav",
  swordApproach: "./assets/audio/sword-approach.wav",
  attack: "./assets/audio/attack.wav",
  hit: "./assets/audio/hit.wav",
  miss: "./assets/audio/miss.wav",
  win: "./assets/audio/win.wav",
  revive: "./assets/audio/revive.wav",
  fail: "./assets/audio/fail.wav",
  death: "./assets/audio/death.wav",
  defense: "./assets/audio/defense.wav",
  support: "./assets/audio/support.wav",
  artifact: "./assets/audio/artifact.wav",
  enemyHitWolf: "./assets/audio/enemy-hit-wolf.wav",
  enemyHitBerserkWolf: "./assets/audio/enemy-hit-berserk-wolf.wav",
  enemyHitSpider: "./assets/audio/enemy-hit-spider.wav",
  enemyHitWhiteJadePython: "./assets/audio/enemy-hit-white-jade-python.wav",
  enemyHitStoneGolem: "./assets/audio/enemy-hit-stone-golem.wav",
  enemyHitGate: "./assets/audio/enemy-hit-gate.wav",
  enemyHitTiger: "./assets/audio/enemy-hit-tiger.wav",
  enemyHitLostMindApothecary: "./assets/audio/enemy-hit-lost-mind-apothecary.wav",
  enemyHitEvilAlchemist: "./assets/audio/enemy-hit-evil-alchemist.wav",
  enemyHitPursuer: "./assets/audio/enemy-hit-pursuer.wav",
  enemyHitPursuerElite: "./assets/audio/enemy-hit-pursuer-elite.wav",
  enemyHitFiveElementsDisciple: "./assets/audio/enemy-hit-five-elements-disciple.wav",
  enemyHitFiveElementsElite: "./assets/audio/enemy-hit-five-elements-elite.wav",
  enemyHitQingyiCultivator: "./assets/audio/enemy-hit-qingyi-cultivator.wav",
  enemyHitZhengyangDisciple: "./assets/audio/enemy-hit-zhengyang-disciple.wav",
  enemyHitZhengyangElite: "./assets/audio/enemy-hit-zhengyang-elite.wav",
  enemyHitZhengyangChief: "./assets/audio/enemy-hit-zhengyang-chief.wav",
  enemyHitZhengyangLeftProtector: "./assets/audio/enemy-hit-zhengyang-left-protector.wav",
  enemyHitPeiben: "./assets/audio/enemy-hit-peiben.wav",
  enemyHitAqiao: "./assets/audio/enemy-hit-aqiao.wav",
  enemyHitHanping: "./assets/audio/enemy-hit-hanping.wav",
  ...Object.fromEntries(Object.entries(SKILL_SFX_FILES).map(([key, file]) => [
    `skill:${key}`, `./assets/audio/skills/${file}.wav`,
  ])),
};
const FILES = AUDIO_FILES;

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
  hiddenSwordOuterDisciple: "enemyHitPeiben",
  fiveElementsOuterDisciple: "enemyHitAqiao",
  zhengyangOuterDisciple: "enemyHitHanping",
});

export const BGM_FILES = {
  map: "./assets/audio/bgm-map.wav",
  rest: "./assets/audio/bgm-rest.wav",
  combat: "./assets/audio/bgm-combat.wav",
  gateCombat: "./assets/audio/bgm-gate.wav",
  merchant: "./assets/audio/bgm-merchant.wav",
};

const MAX_VOICES_PER_SFX = 6;
const DEFAULT_BGM_VOLUME = 0.30;
const ENEMY_HIT_DELAY_MS = 110;
const VOLUME_STEPS = [1, 0, 0.25, 0.5, 0.75];
// One silent PCM sample unlocks existing media elements inside the entry click.
// No long BGM is requested before its verified Blob has been prepared.
const SILENT_WAV = "data:audio/wav;base64,UklGRiYAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQIAAAAAAA==";

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
    this.context = null;
    this.decodedSfx = new Map();
    this.decodedHashes = new Map();
    this.activeSfx = new Map();
    this.bgmUrls = new Map();
    this.bgmUnlocked = new Set();
  }

  ensureContext() {
    if (!this.context || this.context.state === "closed") {
      const Context = globalThis.AudioContext ?? globalThis.webkitAudioContext;
      if (!Context) throw new Error("Short sound decoding is unavailable");
      this.context = new Context();
    }
    return this.context;
  }

  unlock() {
    // Invoke synchronously from the entry/retry click, before any network await.
    try {
      const context = this.ensureContext();
      if (context.state !== "running") void context.resume().catch(() => {});
    } catch { /* The Ready Gate will surface an actual decode failure. */ }
    if (typeof globalThis.Audio === "function") {
      for (const id of Object.keys(BGM_FILES)) {
        if (this.bgmUnlocked.has(id) || this.bgmCache.has(id)) continue;
        const audio = new Audio(SILENT_WAV);
        audio.muted = true; audio.volume = 0;
        this.bgmCache.set(id, audio);
        const request = audio.play();
        request?.then(() => {
          this.bgmUnlocked.add(id);
          if (audio.src === SILENT_WAV) { audio.pause(); audio.currentTime = 0; }
          audio.muted = false;
        }, () => { audio.muted = false; });
      }
    }
  }

  async prepareSfx(ids, bytes, hash) {
    if (ids.every((id) => this.decodedSfx.has(id) && this.decodedHashes.get(id) === hash)) return;
    const context = this.ensureContext();
    // The decoder may detach its input. Keep the verified cache bytes intact.
    const buffer = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Short sound decoding timed out")), 30000);
      const finish = (error, value) => { clearTimeout(timer); error ? reject(error) : resolve(value); };
      try {
        const result = context.decodeAudioData(bytes.slice(0), (value) => finish(null, value), (error) => finish(error));
        result?.then((value) => finish(null, value), (error) => finish(error));
      } catch (error) { finish(error); }
    });
    if (!buffer || buffer.length <= 0 || buffer.duration <= 0) throw new Error("Empty short sound buffer");
    for (const id of ids) {
      if (!FILES[id]) throw new Error("Unknown sound identity");
      this.decodedSfx.set(id, buffer); this.decodedHashes.set(id, hash);
    }
  }

  prepareBgm(ids, url) {
    // BGM remains compressed/PCM file bytes in a cached Blob; no AudioBuffer.
    for (const id of ids) {
      if (!BGM_FILES[id]) throw new Error("Unknown BGM identity");
      this.bgmUrls.set(id, url);
      const audio = this.bgmCache.get(id);
      if (audio) { audio.pause(); audio.src = url; audio.loop = true; audio.preload = "metadata"; audio.load?.(); }
    }
  }

  playDecoded(id, baseVolume) {
    const context = this.ensureContext();
    if (context.state !== "running") void context.resume().catch(() => {});
    const pool = this.activeSfx.get(id) ?? new Set();
    this.activeSfx.set(id, pool);
    if (pool.size >= MAX_VOICES_PER_SFX) {
      const oldest = pool.values().next().value;
      oldest.source.stop(); pool.delete(oldest);
    }
    const source = context.createBufferSource();
    const gain = context.createGain();
    source.buffer = this.decodedSfx.get(id);
    gain.gain.value = baseVolume * this.volumeLevel;
    source.connect(gain); gain.connect(context.destination);
    const voice = { source, gain, baseVolume };
    pool.add(voice);
    source.onended = () => { pool.delete(voice); source.disconnect(); gain.disconnect(); };
    source.start();
  }

  toggle() {
    const step = VOLUME_STEPS.indexOf(this.volumeLevel);
    this.volumeLevel = VOLUME_STEPS[(step + 1) % VOLUME_STEPS.length];
    this.enabled = this.volumeLevel > 0;
    if (!this.enabled) {
      for (const audio of this.bgmCache.values()) audio.pause();
      for (const pool of this.cache.values()) for (const voice of pool) voice.pause();
      for (const pool of this.activeSfx.values()) {
        for (const voice of pool) voice.source.stop();
        pool.clear();
      }
    } else if (this.desiredBgmId) {
      this.startBgm(this.desiredBgmId);
    }
    for (const pool of this.cache.values()) {
      for (const voice of pool) voice.volume = (this.voiceBaseVolumes.get(voice) ?? 0) * this.volumeLevel;
    }
    for (const bgm of this.bgmCache.values()) bgm.volume = this.bgmVolume * this.volumeLevel;
    for (const pool of this.activeSfx.values()) {
      for (const voice of pool) voice.gain.gain.value = voice.baseVolume * this.volumeLevel;
    }
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
      if (this.decodedSfx.has(id)) continue;
      if (!FILES[id] || this.cache.has(id)) continue;
      const voice = this.getVoice(id);
      if (!voice) continue;
      voice.preload = "auto";
      voice.load?.();
    }
  }

  play(id, gainValue = 0.45) {
    if (!this.enabled || !FILES[id]) return;
    const baseVolume = Math.max(0, Math.min(1, Number(gainValue) || 0));
    if (this.decodedSfx.has(id)) {
      this.playDecoded(id, baseVolume);
      return;
    }
    const audio = this.getVoice(id);
    if (!audio) return;
    audio.currentTime = 0;
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
      audio = new Audio(this.bgmUrls.get(id) ?? BGM_FILES[id]);
      audio.loop = true;
      audio.preload = "metadata";
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
