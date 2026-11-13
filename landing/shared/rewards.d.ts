// Типи для shared/rewards.js (сайт на TypeScript імпортує ту саму логіку, що й бот)
export type Tier = 'bronze' | 'silver' | 'gold' | 'platinum' | 'blue';
type Status = 'done' | 'min' | 'miss' | null;
export interface PathMedal { at: number; icon: string; short: string; name: string; tier: Tier }
export interface BonusDef { key: BonusKey; icon: string; short: string; name: string; tier: Tier; instant: boolean; rule: string }
export type BonusKey = 'phoenix' | 'perfectWeek' | 'weekend' | 'storyteller' | 'earlyBird' | 'nightOwl' | 'firstOfDay' | 'minimalist';
export interface RewardsInput { id: number; days: Status[]; times?: (string | null)[]; comments?: { day: number; text: string }[] }
export interface ChallengeLike { startDate: string | null; currentDay: number; totalDays: number }
export interface Rewards {
  okDays: number;
  path: (PathMedal & { got: boolean; isNew: boolean })[];
  next: PathMedal | null;
  latest: PathMedal | null;
  bonus: Record<BonusKey, number>;
}
export const PATH: readonly PathMedal[];
export const BONUS: readonly BonusDef[];
export const TIER_LABEL: Record<'bronze' | 'silver' | 'gold' | 'platinum', string>;
export function cleanText(text: string): string;
export function firstOfDayCounts(all: RewardsInput[], ch: ChallengeLike): Map<number, number>;
export function rewardsOf(p: RewardsInput, ch: ChallengeLike, firstCounts: Map<number, number>): Rewards;
export function awardKeys(r: Rewards): { key: string; instant: boolean; path?: PathMedal; bonus?: BonusDef; n?: number }[];
