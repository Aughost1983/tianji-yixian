天机一线 v0.1.51 程序生成音频（44.1kHz / mono / 16-bit PCM）

音效：
click.wav      约45ms   更短促的“咔啦”机械点击
attack.wav     约145ms  清脆、高频、快速上扬的出招声
hit.wav        约110ms  响亮、偏高频的命中冲击声
defense.wav    约260ms  青蓝防御语义的金属/护盾共振
support.wav    约280ms  更柔和、空气感更强的辅助提示
artifact.wav   约340ms  法宝主动/被动生效专属的清脆“叮”声
fail.wav       约420ms  下行、不协和的失败/心魔提示
death.wav      约580ms  低频下坠并带碎裂感的死亡提示
win.wav        约720ms  上行大调式胜利提示

背景音乐（均30秒；本版进一步抑制宽带噪声与高频毛刺，保持更平滑、悦耳的质感，并重新选择天然连续的循环切点）：
bgm-map.wav     30s  幽静洞天氛围，带潜伏危机；进一步压缩过深静弱谷并平滑强弱过渡，避免近似停播
bgm-rest.wav    30s  更空灵通透的打坐氛围；增加纯净长音与稀疏钟磬式泛音
bgm-combat.wav  30s  更激烈、更紧张且略带可怖感；128 BPM，后半段节奏密度进一步提高
bgm-merchant.wav 30s  俏皮、古怪的拨弦/钟音商人主题，夹杂少量阴森和声；循环尾音跨越30秒边界继续衔接

地图/打坐/战斗BGM播放增益维持0.30；商人BGM为0.225（低25%）；普通按钮click播放增益0.40；场景切换时不会和另一条BGM叠播。


v0.1.93 敌人专属受击音效（均为44.1kHz / mono / 16-bit PCM短音）：
enemy-hit-wolf.wav                 妖狼：短促粗粝的犬科低吼
enemy-hit-berserk-wolf.wav         狂暴妖狼：更低沉、更凶狠的失真低吼
enemy-hit-spider.wav               血蜘蛛：甲壳脆响与高频刮擦
enemy-hit-white-jade-python.wav    白玉蟒：嘶声混合柔软躯体闷响
enemy-hit-stone-golem.wav          石头傀儡：更响亮的沉闷电子低鸣与中低频冲击
enemy-hit-tiger.wav                守门石虎：更洪亮宏伟、毛刺更少的愤怒虎啸
enemy-hit-lost-mind-apothecary.wav 药人：紧张、破碎的人形喘叫
enemy-hit-evil-alchemist.wav       紫袍药师：年轻女性轻柔尖细、带挑逗感的气声喘息
enemy-hit-pursuer.wav              藏剑峰弟子：简单、短促的年轻男子受击叫声
enemy-hit-pursuer-elite.wav        藏剑峰菁英弟子：较低沉、稳重的成年男子受击叫声
这些音效仅在对应敌人实际损失精血>0时触发：通用hit.wav立即播放，110ms后以统一0.33增益播放专属受击声。


v0.2.02：删除v0.2.01的 enemy-death-tail-* 拖长死亡尾音资产与播放逻辑；普通敌人受击仍为通用hit后110ms、统一0.33增益播放专属受击声。

v0.2.03：重做藏剑峰弟子/菁英弟子专属受击声，减少毛刺并简化为自然男声短叫；普通受击播放逻辑仍为通用hit后110ms、统一0.33增益。

footsteps.wav   1.0s  第五段开场白结束后的洞内行走脚步声；2500ms纯黑中于0ms和900ms各播放一次

battle-start.wav  0.50s  进入任意战斗时播放一次；增益提高，500ms后开始2000ms失焦/聚焦，战斗BGM在转场第1500ms启动

enemy-hit-qingyi-cultivator.wav  0.22s  青衣修士受击声；由五行门菁英素材升调并加强高频，偏年轻女子声线

bgm-gate.wav  30s  门战专属：全新迷幻循环，叠加湿润水滴/水流、合成呼吸与吟唱感人声纹理、不规则软拍击与强弱交替节奏；仅门战播放，首尾闭环

v0.3.46 技能专属音效：assets/audio/skills/ 内共 51 段 145～250ms 的 44.1kHz／单声道／16-bit PCM WAV。
src/data/skill-sfx.js 给玩家技能、敌人招式及对应物品配置 skillSfxKey，升级版与同名敌我招式共用声音语义。
attack／defense／support 通用动作声在 0ms 播放，专属声音分别在 145／260／280ms 非阻塞启动。
音频以固定种子程序生成；重新生成命令：python3 tools/generate-skill-sfx.py。

v0.3.47：默认暂停技能专属音效播放，文件和映射没有删除。将 src/data/skill-sfx.js 的 SKILL_SFX_SETTINGS.enabled 改为 true 即可恢复。


v0.3.64 菜鸟小队专属受击声：
enemy-hit-peiben.wav    0.215s  裴本：年轻男声，较清亮、克制、短促。
enemy-hit-aqiao.wav     0.180s  阿巧：年轻女声，轻巧快速，减轻沉重低频。
enemy-hit-hanping.wav   0.245s  韩平：稍厚实的年轻男声，不使用正阳山弟子的粗犷喊声。
以上三段基于现有游戏人声配色重新塑形，均为44.1kHz / mono / 16-bit PCM；不含外部录音。
再生成：python3 tools/generate-rookie-hit-sfx.py（仅再生成需要numpy/scipy，游玩不需要）。
对应敌人ID分别为hiddenSwordOuterDisciple / fiveElementsOuterDisciple / zhengyangOuterDisciple。
揭名前后使用同一专属受击声；触发条件、110ms延迟、实际伤害判断与音量控制沿用现有系统。
全部86个短音效由统一Ready Gate预解码；5条BGM完整缓存后使用Blob媒体元素，不预解码为整曲AudioBuffer。
