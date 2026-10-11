// Concise enemy tells, keyed by the skill's canonical name rather than enemy ID.
// Each row is [Chinese, English, Japanese], matching the game's three locales.
export const INTENT_DETAILS = Object.freeze({
  "嚎叫": ["强化下次撕咬伤害", "Boost next Bite damage", "次の噛みつきの威力を高める"],
  "怒视": ["提升疯狂撕咬次数", "Increase Frenzied Bite hits", "次の狂乱噛みつきの回数を増やす"],
  "蜕皮": ["恢复25%精血", "Restore 25% HP", "精血を25%回復"],
  "硬化": ["获得12守势并获得【坚硬】", "Gain 12 Stance and [Hardness]", "守勢12と【堅硬】を得る"],
  "石化": ["获得1层【石化】", "Gain 1 [Petrify]", "【石化】を1層得る"],
  "谷神咒": ["罡气转化为精血，无罡气时获得1层【不死】", "Convert Qi to HP; if none, gain 1 [Undying]", "罡気を精血に変え、罡気がなければ【不死】を1層得る"],
  "唤醒": ["召唤石头傀儡", "Summon a Stone Golem", "石人形を召喚"],
  "玄牝之气": ["附加【气滞】或【心魔】，自身获得【罡气】和【反震】", "Apply [Qi Stagnation] or [Heart Demon]; gain [Qi] and [Reflection]", "【気滞】か【心魔】を付与し、自身は【罡気】と【反震】を得る"],
  "哭泣": ["灼烧转化为精血", "Convert [Burn] into HP", "【灼焼】を精血に変える"],
  "尖叫": ["削减15守势并附加1层【气滞】", "Reduce 15 Stance; apply 1 [Qi Stagnation]", "守勢を15減らし【気滞】を1層付与"],
  "焚炎诀": ["引爆【灼烧】", "Detonate [Burn]", "【灼焼】を引爆する"],
  "锁命丹": ["恢复30精血并获得【不死】", "Restore 30 HP and gain [Undying]", "精血を30回復し【不死】を得る"],
  "鬼闪": ["闪避一切攻击", "Evade all attacks", "すべての攻撃を回避"],
  "补血丹": ["恢复15精血", "Restore 15 HP", "精血を15回復"],
  "食气术": ["恢复2法力", "Restore 2 Mana", "法力を2回復"],
  "灵气丹": ["获得4法力", "Gain 4 Mana", "法力を4得る"],
  "破绿瓶": ["全体恢复精血和法力", "Restore HP and Mana to all allies", "味方全体の精血と法力を回復"],
  "锻体术": ["获得3罡气和5守势", "Gain 3 Qi and 5 Stance", "罡気3と守勢5を得る"],
  "崩山劲+": ["获得8守势并蓄势反击", "Gain 8 Stance; prepare a counterattack", "守勢8を得て反撃に備える"],
  "锻体术+": ["获得5罡气和10守势", "Gain 5 Qi and 10 Stance", "罡気5と守勢10を得る"],
  "浑天功": ["受击后附加2层【破甲】", "Apply 2 [Armor Break] after being attacked", "被弾後【破甲】2層を付与"],
  "铁骨": ["强化下次武技伤害", "Boost next martial attack damage", "次の武技の威力を高める"],
  "浑天功+": ["受击后附加3层【破甲】，自身获得1层【愈合】", "Apply 3 [Armor Break] when hit; gain 1 [Healing]", "被弾後【破甲】を3層付与し、自身は【癒合】を1層得る"],
  "金刚不坏": ["获得12罡气，下回合再获得12罡气", "Gain 12 Qi; gain 12 more next turn", "罡気を12得て、次のターンにさらに12得る"],
  "不死之躯+": ["获得2层【不死】和2层【愈合】", "Gain 2 [Undying] and 2 [Healing]", "【不死】2層と【癒合】2層を得る"],
  "不死之躯++": ["获得3层【不死】和3层【愈合】", "Gain 3 [Undying] and 3 [Healing]", "【不死】3層と【癒合】3層を得る"],
  "敛气入骨": ["罡气转化为下次武技伤害", "Convert Qi into next martial attack damage", "罡気を次の武技のダメージに変える"],
  "浑天功++": ["受击后附加4层【破甲】，自身获得2层【愈合】", "Apply 4 [Armor Break] when hit; gain 2 [Healing]", "被弾後【破甲】を4層付与し、自身は【癒合】を2層得る"],
  "万劫长春": ["全体获得2层【结界】和2层【愈合】", "All allies gain 2 [Barrier] and 2 [Healing]", "味方全体が【結界】2層と【癒合】2層を得る"],
  "甘霖咒": ["减半【灼烧】并获得2层【愈合】", "Halve [Burn]; gain 2 [Healing]", "【灼焼】を半減し【癒合】を2層得る"],
  "土遁术": ["尝试逃跑", "Attempt to flee", "逃走を試みる"],
  "土遁术+": ["尝试逃跑，失败时获得12守势", "Attempt to flee; gain 12 Stance on failure", "逃走を試み、失敗時に守勢12を得る"],
  "清凉符": ["减少10层【灼烧】", "Remove up to 10 [Burn]", "【灼焼】を10層減らす"],
  "灵心符": ["减少5层【心魔】", "Remove up to 5 [Heart Demon]", "【心魔】を5層減らす"],
  "八方镇岳": ["获得24罡气和【八方镇岳】", "Gain 24 Qi and [Eight Directions Ward]", "罡気を24得て【八方鎮岳】を得る"],
  "金刚符": ["获得12罡气和12守势", "Gain 12 Qi and 12 Stance", "罡気12と守勢12を得る"],
  "剑意": ["获得2层剑意", "Gain 2 [Sword Intent]", "【剣意】2層を得る"],
  "剑意+": ["获得3层剑意", "Gain 3 [Sword Intent]", "【剣意】3層を得る"],
  "剑罡+": ["获得10罡气和1层剑意", "Gain 10 Qi and 1 [Sword Intent]", "罡気10と【剣意】1層を得る"],
});

export function intentDetailForName(name, language = "zh-CN") {
  const index = language === "en" ? 1 : language === "ja" ? 2 : 0;
  return INTENT_DETAILS[name]?.[index] ?? "";
}
