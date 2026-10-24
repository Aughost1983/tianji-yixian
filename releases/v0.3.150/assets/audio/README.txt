天机一线 v0.3.148 当前音频修订（44.1kHz / mono / 16-bit PCM）

幽娥enemy-hit-moth.wav：0.280s，以柔和妩媚的成年女性吟叫／轻哼为主，分层混入轻柔和声、气声，以及很轻的蛾翼与鳞粉余响。
五层都从原创振荡器／固定种子噪声合成，不使用任何游戏人物受击声音作为输入。快速起音、自然衰减、防削波峰值保持。
重建命令、100项音频资源数、原音量控制与110ms受击声延迟保持。石姬和其他音频不变。
以下为历史版本说明。

天机一线 v0.3.147 历史音频修订（44.1kHz / mono / 16-bit PCM）

enemy-hit-moth.wav  0.280s  幽娥：全新原创破碎妖声＋宽翼失衡扑簌＋鳞粉薄膜余响。
0～75ms：从零合成的女性妖异双声源泛音，短促、沙哑、非普通人声“啊／呃”。
约45～200ms：两片宽翼稍错开抖动，不规则加速，低沉空气扰动、薄膜共振和短促翅脉颤音是辨识主体。
120～280ms：薄膜摩擦和细腻鳞粉沙沙余响，快速自然衰减；起止为零、无削波、清理直流偏置。
不读取、不改造任何游戏人物的受击录音；声线、翼膜及鳞粉均由独立振荡器／固定种子噪声／共振模式原创合成。
重建：python3 tools/generate-special-beast-hit-sfx.py（仅生成时需numpy/scipy；游戏无需新增依赖）。
石姬音频、100项音频资源数量、幽娥映射与110ms延迟、实际精血损失判断、音量及静音控制均保持。

以下为历版音频说明，其中旧版幽娥的时长、素材来源和配比已由上述v0.3.147完全替换。

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

v0.3.146 特殊妖兽专属受击声：
enemy-hit-lady-rock.wav  0.340s  石姬：70%短促石晶断裂与30%低沉空腔共鸣，轻微清冷晶体泛音，尾部快速衰减。
enemy-hit-moth.wav       0.260s  幽娥：60%现有女性声线重塑的短促气声轻哼，40%薄翼快速震颤／柔软薄膜摩擦尾音。
以上百分比为双层振幅混合配比，感知响度由音色和包络共同决定；两个文件均为44.1kHz / mono / 16-bit PCM WAV。
幽娥人声源为游戏已有enemy-hit-qingyi-cultivator.wav；石晶／石腔／翼膜层由固定种子程序生成，不使用外部录音。
重建命令：python3 tools/generate-special-beast-hit-sfx.py（仅生成时需要numpy/scipy）。
新增映射对应ladyRock / moth，仍按实际精血损失>0触发、延迟110ms、原音量与静音设置播放，纳入资源校验及预解码。
本版运行时共100个音频资源：95个短音效、5条BGM。历史段落中的资源数量为当时版本记录。
