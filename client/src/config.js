export const CLASS_DATA = {
  gunner: {
    id: 'gunner', name: '枪手', icon: 'MG', role: '持续火力 · 护盾掩护', color: 0xf1aa4d,
    loadout: [
      { name: '多管机枪', slot: '主武器', badge: 'MG', damage: 12, terrain: 12, rate: 0.105, mag: 80, reserve: 420, heat: true, range: 58 },
      { name: '重型左轮', slot: '副武器', badge: 'RV', damage: 40, terrain: 120, rate: 0.58, mag: 6, reserve: 36, range: 75 },
      { name: '矿镐', slot: '通用工具', badge: 'P', damage: 18, terrain: 18, rate: 0.23, range: 3.1, mining: true },
      { name: '滑索发射器', slot: '通行工具', badge: 'ZIP', tool: 'zipline', charges: 4, maxCharges: 4 },
      { name: '护盾发生器', slot: '支援工具', badge: 'SH', tool: 'shield', charges: 3, maxCharges: 3 }
    ], grenade: { name: '黏性手雷', count: 4, max: 4, damage: 100, radius: 7, color: 0xe88947 }
  },
  driller: {
    id: 'driller', name: '钻机手', icon: 'DR', role: '近距清怪 · 挖掘开路', color: 0xf07851,
    loadout: [
      { name: '喷火器', slot: '主武器', badge: 'FL', damage: 4.5, terrain: 2.7, rate: 0.1, fuel: 100, reserve: 300, range: 13, flame: true },
      { name: '半自动手枪', slot: '副武器', badge: 'PI', damage: 40, terrain: 40, rate: 0.33, mag: 16, reserve: 112, range: 52 },
      { name: '矿镐', slot: '通用工具', badge: 'P', damage: 18, terrain: 18, rate: 0.23, range: 3.1, mining: true },
      { name: '动力钻', slot: '通行工具', badge: 'DR', tool: 'drill', fuel: 100, maxFuel: 100, rate: 20, fuelRate: 10, range: 2.5 },
      { name: '遥控炸药', slot: '支援工具', badge: 'C4', tool: 'satchel', charges: 2, maxCharges: 2 }
    ], grenade: { name: '冲击斧', count: 3, max: 3, damage: 110, radius: 0, color: 0xf0aa4d }
  },
  scout: {
    id: 'scout', name: '侦察兵', icon: 'SC', role: '快速转移 · 远距精准', color: 0x68b6dc,
    loadout: [
      { name: '侦察步枪', slot: '主武器', badge: 'AR', damage: 18, terrain: 18, rate: 0.13, mag: 30, reserve: 180, range: 75 },
      { name: '轻型精准手枪', slot: '副武器', badge: 'PR', damage: 42, terrain: 42, rate: 0.45, mag: 12, reserve: 72, range: 82 },
      { name: '矿镐', slot: '通用工具', badge: 'P', damage: 18, terrain: 18, rate: 0.23, range: 3.1, mining: true },
      { name: '抓钩', slot: '通行工具', badge: 'HK', tool: 'grapple', range: 18, cooldown: 5 },
      { name: '照明枪', slot: '支援工具', badge: 'FLR', tool: 'flaregun', charges: 4, maxCharges: 4 }
    ], grenade: { name: 'IFG 抑制力场', count: 2, max: 2, damage: 0, radius: 4, color: 0x64d3cb }
  },
  engineer: {
    id: 'engineer', name: '工程师', icon: 'EN', role: '阵地构筑 · 自动火力', color: 0xa78ce0,
    loadout: [
      { name: '战斗霰弹枪', slot: '主武器', badge: 'SG', damage: 10, pellets: 8, terrain: 10, rate: 0.7, mag: 8, reserve: 64, range: 30, spread: 0.065 },
      { name: '冲锋枪', slot: '副武器', badge: 'SM', damage: 10, terrain: 10, rate: 0.09, mag: 45, reserve: 270, range: 48 },
      { name: '矿镐', slot: '通用工具', badge: 'P', damage: 18, terrain: 18, rate: 0.23, range: 3.1, mining: true },
      { name: '平台枪', slot: '通行工具', badge: 'PL', tool: 'platform', charges: 4, maxCharges: 4 },
      { name: '自动哨戒机枪', slot: '支援工具', badge: 'SGN', tool: 'sentry', charges: 1, maxCharges: 1 }
    ], grenade: { name: 'L.U.R.E. 全息诱饵', count: 2, max: 2, damage: 0, radius: 8, color: 0x9f80e0 }
  }
};

export const ENEMIES = {
  rusher: { id: 'rusher', name: '圆背啃咬虫', class: '普通近战', hp: 72, speed: 3.5, damage: 12, range: 2.2, color: 0x9a7353, scale: 0.78, attack: 1.6, weak: 'tail', score: 1 },
  hauler: { id: 'hauler', name: '钩颚重虫', class: '普通近战', hp: 150, speed: 1.9, damage: 20, range: 2.5, color: 0x7a6350, scale: 1.1, attack: 2.8, score: 2 },
  acid: { id: 'acid', name: '酸囊吐射虫', class: '普通远程', hp: 64, speed: 1.8, damage: 14, range: 12, color: 0x7ba66d, scale: 0.85, attack: 3.8, ranged: 'acid', score: 1 },
  shard: { id: 'shard', name: '晶棘射手', class: '普通远程', hp: 82, speed: 1.5, damage: 8, range: 17, color: 0x839b9a, scale: 0.88, attack: 4.2, ranged: 'shard', score: 2 },
  rupture: { id: 'rupture', name: '裂背冲锋虫', class: '精英近战', hp: 520, speed: 2.6, damage: 30, range: 7, color: 0x906b50, scale: 1.42, attack: 6.5, elite: true, weak: 'sac', weakMultiplier: 2, score: 12 },
  siege: { id: 'siege', name: '棱背炮虫', class: '精英远程', hp: 620, speed: 1.25, damage: 18, range: 22, color: 0x7e8f80, scale: 1.5, attack: 7, elite: true, ranged: 'mortar', weak: 'crystal', weakMultiplier: 2, score: 14 },
  boss: { id: 'boss', name: '渊脊母虫', class: 'BOSS', hp: 2600, speed: 1.65, damage: 24, range: 10, color: 0x624d44, scale: 3.1, attack: 4.5, boss: true, weakMultiplier: 2, score: 100 }
};

export const WAVE_PLANS = [
  { id: 'A', name: '掘穴冲锋', weights: { rusher: .55, hauler: .25, acid: .15, shard: .05 }, eliteBias: 'rupture' },
  { id: 'B', name: '酸棘封锁', weights: { rusher: .20, hauler: .10, acid: .40, shard: .30 }, eliteBias: 'siege' },
  { id: 'C', name: '混合推进', weights: { rusher: .35, hauler: .25, acid: .25, shard: .15 }, eliteBias: 'balanced' },
  { id: 'D', name: '精英压轴', weights: { rusher: .25, hauler: .25, acid: .25, shard: .25 }, eliteBias: 'alternate' }
];

export const WAVE_TOTALS = [30, 36, 42, 48, 54, 60, 66, 72];
export const WAVE_TIMES = [45, 105, 165, 225, 285, 345, 405, 465];
export const ELITE_COUNTS = [0, 0, 1, 1, 2, 3, 4, 5];
export const ACTIVE_CAPS = [12, 16, 20, 24, 26, 28, 30, 36];
export const RETURN_AT = 600;
export const EARLY_RETURN_TRAVEL = 60;
export const WEAKPOINT_MULTIPLIER = 2;
