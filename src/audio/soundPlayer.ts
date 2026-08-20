// Sound-trigger contract for core game actions. Free of DOM/browser globals
// (no AudioContext) so src/game.ts and src/game/commanderDamage.ts can stay
// unit-testable against a mock/stub player instead of a real audio backend.
// See src/audio/webAudioSoundPlayer.ts for the concrete WebAudio player,
// which only src/main.ts constructs.

export type SoundEvent =
  | 'lifeUp'
  | 'lifeDown'
  | 'turnPass'
  | 'commanderDamageUp'
  | 'commanderDamageDown'
  | 'eliminate'
  | 'gameEnd';

export interface SoundPlayer {
  play(event: SoundEvent): void;
}

/** Silent default used wherever no real SoundPlayer is injected (e.g. tests). */
export class NoopSoundPlayer implements SoundPlayer {
  play(): void {}
}
