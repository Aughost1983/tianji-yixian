import { SKILL_SFX_FILES, SKILL_SFX_SETTINGS } from "../data/skill-sfx.js?v=v0.3.89";

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
  cardSeal: "./assets/audio/card-seal.wav",
  statusPositive: "./assets/audio/status-positive.wav",
  statusNegative: "./assets/audio/status-negative.wav",
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
// Playback goes directly through HTMLAudio.volume. AudioContext is used only
// to verify short files; scene/fade and persisted user volume are multiplied once.
export const BGM_MIX_GAIN = 1.0;
export const BGM_VOLUME = {
  map: 0.30,
  rest: 0.30,
  merchant: 0.275,
  combat: 0.25,
  gateCombat: 0.25,
};
const DEFAULT_BGM_VOLUME = BGM_VOLUME.map;
const ENEMY_HIT_DELAY_MS = 110;
const VOLUME_STEPS = [1, 0, 0.25, 0.5, 0.75];
export const AUDIO_VOLUME_KEY = "tianji.audio.volume";
// One silent PCM sample unlocks existing media elements inside the entry click.
// No long BGM is requested before its verified Blob has been prepared.
const SILENT_WAV = "data:audio/wav;base64,UklGRiYAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQIAAAAAAA==";

export class AudioManager {
  constructor(storage = null) {
    try { this.storage = storage ?? globalThis.localStorage; } catch { this.storage = null; }
    // Read synchronously before creating media: a restored user setting
    // must never produce an initial full-volume sound or BGM sample.
    let storedVolume = null;
    try { storedVolume = this.storage?.getItem(AUDIO_VOLUME_KEY); } catch { /* Storage may be unavailable. */ }
    const value = typeof storedVolume === "string" && storedVolume.trim() !== "" ? Number(storedVolume) : NaN;
    this.volumeLevel = VOLUME_STEPS.includes(value) ? value : .75;
    this.enabled = this.volumeLevel > 0;
    this.cache = new Map();
    this.bgmCache = new Map();
    this.currentBgmId = null;
    this.desiredBgmId = null;
    this.bgmVolume = DEFAULT_BGM_VOLUME;
    this.bgmFadeTimer = null;
    this.context = null;
    this.voiceBaseVolumes = new WeakMap();
    this.preloadedVoices = new WeakSet();
    this.sfxUrls = new Map();
    this.decodedSfx = new Map();
    this.decodedHashes = new Map();
    this.bgmUrls = new Map();
    this.bgmUnlocked = new Set();
  }

  ensureContext() {
    if (!this.context || this.context.state === "closed") {
      const Context = globalThis.AudioContext ?? globalThis.webkitAudioContext;
      if (!Context) throw new Error("Short sound decoding is unavailable");
      // Validation only: no sources, gains, compressor or destination routing.
      // Replacing a closed decoder never interrupts native media playback.
      this.context = new Context();
    }
    return this.context;
  }

  outputVolume(baseVolume) {
    // The stored/displayed step is the actual multiplier: 50% is .5,
    // 100% is 1. Apply it once to both SFX and BGM; there is no boost mapping.
    return Math.max(0, Math.min(1, baseVolume * this.volumeLevel));
  }

  applyMediaVolumes() {
    for (const audio of this.bgmCache.values()) audio.volume = this.bgmOutputVolume();
    for (const pool of this.cache.values()) {
      for (const audio of pool) audio.volume = this.outputVolume(this.voiceBaseVolumes.get(audio) ?? .45);
    }
  }

  unlock() {
    // Keep the entry-click media activation; no WebAudio playback or routing.
    if (typeof globalThis.Audio !== "function") return;
    for (const id of Object.keys(BGM_FILES)) {
      if (this.bgmUnlocked.has(id) || this.bgmCache.has(id)) continue;
      try {
        const audio = new Audio(SILENT_WAV);
        audio.muted = true;
        audio.volume = this.bgmOutputVolume();
        this.bgmCache.set(id, audio);
        const request = audio.play();
        request?.then(() => {
          this.bgmUnlocked.add(id);
          if (audio.src === SILENT_WAV) { audio.pause(); audio.currentTime = 0; }
          audio.muted = false;
        }, () => { audio.muted = false; });
      } catch { /* The resource gate still verifies and prepares required files. */ }
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

  prepareSfxMedia(ids, url) {
    // Native playback uses exactly the bytes that passed hash/WAV/decode checks,
    // even on HTTP LAN/offline pages where an optional worker is unavailable.
    for (const id of ids) {
      if (!FILES[id]) throw new Error("Unknown sound identity");
      this.sfxUrls.set(id, url);
      for (const audio of this.cache.get(id) ?? []) {
        audio.pause(); audio.src = url;
        this.preloadedVoices.delete(audio);
      }
    }
  }

  prepareBgm(ids, url) {
    // BGM stays in verified Blob files; it is never decoded into an AudioBuffer.
    for (const id of ids) {
      if (!BGM_FILES[id]) throw new Error("Unknown BGM identity");
      this.bgmUrls.set(id, url);
      const audio = this.getBgm(id);
      if (!audio) throw new Error("HTMLAudio playback is unavailable");
      audio.pause(); audio.src = url; audio.loop = true; audio.preload = "metadata";
      audio.volume = this.bgmOutputVolume(); audio.load?.();
    }
  }

  toggle() {
    const step = VOLUME_STEPS.indexOf(this.volumeLevel);
    return this.setVolumeLevel(VOLUME_STEPS[(step + 1) % VOLUME_STEPS.length]);
  }

  setVolumeLevel(level) {
    if (!VOLUME_STEPS.includes(level)) return this.enabled;
    this.volumeLevel = level;
    this.enabled = this.volumeLevel > 0;
    try { this.storage?.setItem(AUDIO_VOLUME_KEY, String(this.volumeLevel)); } catch { /* Keep live audio working. */ }
    this.applyMediaVolumes();
    if (!this.enabled) {
      for (const audio of this.bgmCache.values()) audio.pause();
      for (const pool of this.cache.values()) for (const voice of pool) voice.pause();
    } else if (this.desiredBgmId) {
      this.startBgm(this.desiredBgmId);
    }
    return this.enabled;
  }

  getVoice(id) {
    if (!FILES[id] || typeof globalThis.Audio !== "function") return null;
    let pool = this.cache.get(id);
    if (!pool) {
      pool = [];
      this.cache.set(id, pool);
    }

    let voice = pool.find((audio) => audio.paused || audio.ended);
    if (!voice && pool.length < MAX_VOICES_PER_SFX) {
      voice = new Audio(this.sfxUrls.get(id) ?? FILES[id]);
      voice.preload = "auto";
      this.voiceBaseVolumes.set(voice, .45);
      voice.volume = this.outputVolume(.45);
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
      if (!FILES[id]) continue;
      const voice = this.cache.get(id)?.[0] ?? this.getVoice(id);
      if (!voice || this.preloadedVoices.has(voice)) continue;
      voice.preload = "auto";
      voice.load?.();
      // Record success after load(), so a thrown load can be retried.
      this.preloadedVoices.add(voice);
    }
  }

  play(id, gainValue = 0.45) {
    if (!this.enabled || !FILES[id]) return;
    const baseVolume = Math.max(0, Math.min(1, Number(gainValue) || 0));
    // decodedSfx is validation evidence, never a playback backend.
    const audio = this.getVoice(id);
    if (!audio) return;
    this.voiceBaseVolumes.set(audio, baseVolume);
    audio.volume = this.outputVolume(baseVolume);
    try {
      audio.currentTime = 0;
      audio.play()?.catch(() => {});
    } catch { /* Media rejection must not interrupt game settlement. */ }
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
    if (typeof globalThis.Audio !== "function") return null;
    let audio = this.bgmCache.get(id);
    if (!audio) {
      audio = new Audio(this.bgmUrls.get(id) ?? BGM_FILES[id]);
      audio.loop = true;
      audio.preload = "metadata";
      audio.volume = this.bgmOutputVolume();
      this.bgmCache.set(id, audio);
    }
    return audio;
  }

  bgmOutputVolume() {
    return this.outputVolume(this.bgmVolume * BGM_MIX_GAIN);
  }

  startBgm(id) {
    const audio = this.getBgm(id);
    if (!audio || !this.enabled) return;
    this.applyMediaVolumes();
    try { audio.play()?.catch(() => {}); } catch { /* A later gesture can retry playback. */ }
  }

  setBgm(id, volume = BGM_VOLUME[id] ?? DEFAULT_BGM_VOLUME) {
    const normalized = BGM_FILES[id] ? id : null;
    this.desiredBgmId = normalized;
    this.bgmVolume = Math.max(0, Math.min(1, volume));
    this.applyMediaVolumes();
    if (this.currentBgmId !== normalized) {
      if (this.bgmFadeTimer) { clearInterval(this.bgmFadeTimer); this.bgmFadeTimer = null; }
      if (this.currentBgmId) { const previous = this.bgmCache.get(this.currentBgmId); if (previous) { previous.pause(); previous.currentTime = 0; } }
      this.currentBgmId = normalized;
    }
    if (!normalized) return;
    const audio = this.getBgm(normalized);
    if (!audio) return;
    if (this.enabled && audio.paused) this.startBgm(normalized);
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
      this.bgmVolume = value; this.applyMediaVolumes();
      if (t >= 1) { clearInterval(this.bgmFadeTimer); this.bgmFadeTimer = null; }
    }, 50);
  }
}
