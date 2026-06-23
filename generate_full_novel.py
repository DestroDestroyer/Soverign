# generate_full_novel.py
"""
Script to dynamically expand Heavenly_Rebellion_Book1_Script.txt by inserting
59 high-quality wuxia filler scenes into the skipped scene gaps (Scenes 31-40, 42-46, 48-55, 57-67, 69-79, 81-82, 84-89, 92-94, 96-98).
This creates a complete, continuous 100-scene novel script containing deep character emotions, power level explanations, and epic story twists.
"""

import os
import re
from pathlib import Path

# New filler scenes to inject into the gaps
FILLER_SCENES = {
    31: {
        "title": "Scene 31: The Array Blueprint",
        "description": "Luan studies an ancient defensive array blueprint in the fortress library, his fingers tracing the glowing runes. The spiritual pressure of Yuno City's foundations hums in response. He feels a deep connection to the first sovereign.",
        "dialogue": "LUAN: This array was designed by the first sovereign. It requires dragon Qi to activate. My father forgot this.\nWEI BOLONG: Can we activate it, my prince?\nLUAN: With my breakthrough, yes. But it requires absolute trust.",
        "prompt": "Wuxia research scene, prince studying a glowing blue scroll blueprint on a wooden table in a dimly lit library, ancient scrolls and books around him, general watching with arms crossed, 8K"
    },
    32: {
        "title": "Scene 32: Sector Recruitment",
        "description": "Luan meets with local sect leaders of the northern border, asking for their alliance. The sect leaders are hesitant, fearing the Emperor's wrath and the immense power gap between their local disciples and the imperial army.",
        "dialogue": "SECT LEADER: We are simple cultivators, Prince. We do not fight imperial armies.\nLUAN: The emperor sent golden poison to his own son. Do you think he will spare your sects once Yuno City falls?\nSECT LEADER: (silence, then bowing) ...You speak the truth. The Green Cloud Sect stands with you.",
        "prompt": "Wuxia diplomatic scene, prince in black armor meeting with elderly sect leaders in green robes inside a stone courtyard, respectful bows, tense negotiations, plum blossoms falling, 8K"
    },
    33: {
        "title": "Scene 33: Refitting the Garrison",
        "description": "The fortress blacksmiths work day and night, refitting worn armor with dragon-scale inscriptions under Luan's direction. The atmosphere is thick with soot and determination.",
        "dialogue": "SMITH: These inscriptions will strengthen the steel tenfold, Your Highness. But we need more spiritual stones.\nLUAN: Use the palace treasures Zhao Bing brought. We use the emperor's gold to arm our rebellion.\nSMITH: (grinning) Irony is a fine metal, my prince.",
        "prompt": "Wuxia blacksmith forge scene, burly smiths hammering glowing orange steel on anvils in a dark stone foundry, sparks flying everywhere, prince inspecting weapons, dramatic contrast, 8K"
    },
    34: {
        "title": "Scene 34: Secret Passages",
        "description": "Lin Qiuyue guides Luan through the hidden catacombs beneath Yuno City, showing him escape routes and ambush points that predated the fortress construction.",
        "dialogue": "LIN QIUYUE: These tunnels lead directly to the enemy's rear. I used Phantom Step to map them.\nLUAN: You've been preparing for this war long before I arrived, haven't you?\nLIN QIUYUE: In this world, Prince, you are either the hunter or the prey.",
        "prompt": "Mysterious wuxia cave scene, strategist showing hidden tunnel paths with a lantern to a prince in dark armor, stone walls carved with ancient symbols, shadows flaring, 8K"
    },
    35: {
        "title": "Scene 35: The First skirmish",
        "description": "A small scouting party of the Northern Coalition breaches the valley watch. Luan leads a swift counterattack, testing his new Spirit Awakening Rank 5 power.",
        "dialogue": "COALITION SCOUT: (stumbling back, bleeding) A mere frontier prince cannot be this strong!\nLUAN: (sword crackling with blue Qi) Tell your generals that the frontier no longer belongs to the capital.\nCOALITION SCOUT: (screaming as he retreats)",
        "prompt": "Action-packed wuxia skirmish scene, prince in black armor slashing with blue-Qi sword through coalition soldiers on a misty mountain pass, dynamic action composition, 8K"
    },
    36: {
        "title": "Scene 36: Lin Qiuyue's Secrets",
        "description": "Lin Qiuyue stands alone in the moonlit gardens, staring at the folded fan in her pale hands. Luan approaches, sensing a deep sadness beneath her cold demeanor.",
        "dialogue": "LIN QIUYUE: My father died because he loved the empire more than the emperor. I will not repeat his mistake.\nLUAN: I do not ask for love, Qiuyue. I ask for victory.\nLIN QIUYUE: (silver eyes cool) Then we are perfectly aligned.",
        "prompt": "Poetic wuxia garden scene, pale woman strategist in grey robes staring at a folded fan under moonlight, blooming white plum trees, prince standing in shadow, 8K"
    },
    37: {
        "title": "Scene 37: Storing the Grain",
        "description": "Wei Bolong oversees the civilian storage of grain, preparing Yuno City for a long siege. The citizens work alongside the soldiers, their spirits high.",
        "dialogue": "CITIZEN: The Prince gave us his own rations during the winter. We will bleed for him now.\nWEI BOLONG: (patting the man's shoulder) Keep the grain dry. We'll be eating well while the coalition starves.\nWEI BOLONG: (looking up at the clouds) The snow is coming.",
        "prompt": "Wuxia fortress courtyard scene, civilians and soldiers storing grain bags in stone granaries, general shouting orders, snowy mountains in background, warm afternoon light, 8K"
    },
    38: {
        "title": "Scene 38: The Shadow Assassin",
        "description": "At midnight, a cloaked figure slips into Luan's command tent, a poison dagger aimed at Luan's throat. Luan's eyes open, blazing blue in the dark.",
        "dialogue": "ASSASSIN: (whispering) The emperor sends his final regards, boy.\nLUAN: (grabbing the assassin's wrist, bones cracking) Tell my father I received them.\nSYSTEM: [Danger neutralized. Assassin level: Spirit Awakening Rank 7. Cultivation absorbed: 100 Rebellion Points.]",
        "prompt": "Intense wuxia assassination scene, prince in bed catching the wrist of a cloaked assassin in dark tent, glowing blue spiritual energy, moonlight cutting through tent flap, 8K"
    },
    39: {
        "title": "Scene 39: The Rebel's Pledge",
        "description": "Luan gathers his top commanders around the stone war table, explaining the upcoming battle. The power level of their unified strategy is their only hope.",
        "dialogue": "GENERAL: We are fighting against thirty-to-one odds. This is suicide.\nLUAN: No, it is a sieve. Only the strong will survive. And we are the frontier.\nWEI BOLONG: (slamming fist on table) For the Prince!",
        "prompt": "Wuxia military meeting scene, prince showing strategy markers on a stone table to five generals in heavy armor, flickering torchlight, grim determined faces, 8K"
    },
    40: {
        "title": "Scene 40: The Eve of Battle",
        "description": "Yuno City goes silent as the snow begins to fall. Luan stands alone on the high tower, looking at the distant coalition campfires. The battle begins at dawn.",
        "dialogue": "LUAN: (inner) Let them come. Tomorrow, the heavens will witness our rebellion.\nSYSTEM: [Survive the Northern Siege mission: ACTIVE. Target countdown: 6 hours.]",
        "prompt": "Epic wuxia night scene, prince in dark dragon armor standing on a high stone watchtower, looking down at ten thousand campfire spots on the northern plain, light snow falling, 8K"
    },
    42: {
        "title": "Scene 42: Gathering the Spoils",
        "description": "The battlefield is silent except for the groans of the wounded. Luan's soldiers gather the weapons and armor of the defeated coalition vanguard.",
        "dialogue": "WEI BOLONG: We took three thousand steel swords and twenty war wagons, my prince.\nLUAN: Distribute them to the new sect volunteers. A weapon in hand makes a soldier.\nWEI BOLONG: (laughing) The emperor is practically paying for our weapons.",
        "prompt": "Wuxia battlefield aftermath scene, soldiers collecting swords and shields on a misty valley plain under grey morning sky, distant fortress walls, 8K"
    },
    43: {
        "title": "Scene 43: Lin Qiuyue's Trap",
        "description": "Lin Qiuyue explains the next step: using fake messengers to spread rumors of Luan's death to the coalition main force, inducing them to rush blindly.",
        "dialogue": "LIN QIUYUE: Cautious generals become reckless when they think the enemy is leaderless. Kuro Han will rush the pass.\nLUAN: And we will be waiting.\nLIN QIUYUE: Exactly. The battlefield is a theater, and we are the directors.",
        "prompt": "Wuxia strategy planning scene, pale woman strategist showing a letter to the prince, candles throwing dramatic shadows on the wall, intense focus, 8K"
    },
    44: {
        "title": "Scene 44: The Emperor's Fury",
        "description": "In the imperial capital, Emperor Longwei smashes a jade cup as the news of Zhao Bing's death reaches him. His paranoid fear turns to absolute rage.",
        "dialogue": "EMPEROR LONGWEI: Zhao Bing is dead?! The poison blade of my throne?! How?!\nSHADOW SPY: The Third Prince... he has broken through his meridian suppression. He is at Spirit Awakening Realm.\nEMPEROR LONGWEI: (trembling) Seize his name! Purge his allies! I want his head!",
        "prompt": "Imperial wuxia throne room scene, gaunt paranoid emperor in golden robes smashing a jade cup in fury on a golden throne, shadow spies kneeling below, 8K"
    },
    45: {
        "title": "Scene 45: The Soldier's Song",
        "description": "Around the campfires, Yuno City soldiers sing an old frontier ballad of honor and defiance. Luan sits among them, sharing their bread and showing his humanity.",
        "dialogue": "VETERAN: We sing for the fallen, Prince. They died standing.\nLUAN: We will all stand together when the capital falls. (takes a drink of wine)\nVETERAN: (raising cup) To Luan Tianlong!",
        "prompt": "Wuxia campfire scene, soldiers in worn armor laughing and singing around a campfire at night inside the fortress courtyard, prince sitting with them, 8K"
    },
    46: {
        "title": "Scene 46: Cultivating the Dragon Qi",
        "description": "Luan sits in deep meditation, running the blue spiritual energy through his meridians. The system alerts him to a dormant dragon vein beneath the fortress.",
        "dialogue": "SYSTEM: [Dormant Dragon Vein detected beneath Yuno City. Resonance: 12%. Recommend host absorb energy to accelerate breakthrough.]\nLUAN: (Qi flaring blue) Let's begin.\nSYSTEM: [Absorbing... Cultivation speed multiplied by five.]",
        "prompt": "Wuxia meditation scene, prince sitting cross-legged in a glowing blue stone chamber, sapphire spiritual energy swirling around his body, serene expression, 8K"
    },
    48: {
        "title": "Scene 48: The Poisonous Swamp",
        "description": "Luan leads a small detachment through the dangerous northern swamps, seeking an ancient path to outflank the coalition main force.",
        "dialogue": "WEI BOLONG: The air itself is toxic here, my prince. My Qi is burning.\nLUAN: Keep your breath shallow. The system has provided a clearing pill.\nLIN QIUYUE: (pointing fan) The path is ahead. We are almost through.",
        "prompt": "Atmospheric wuxia swamp scene, soldiers moving through dark misty swamp with glowing green gas, gnarled roots, prince leading, mysterious mood, 8K"
    },
    49: {
        "title": "Scene 49: The Beast King",
        "description": "A massive toxic swamp beast attacks Luan's vanguard. Luan steps forward, his sword blazing blue to protect his men.",
        "dialogue": "SYSTEM: [Danger: Swamp Beast King. Power Level: Spirit Awakening Realm Rank 8.]\nLUAN: (lunging forward) Just a beast. Watch my blade!\nWEI BOLONG: (spear ready) Attack!",
        "prompt": "Dynamic wuxia monster battle, prince in dark armor leaping to slash a massive glowing swamp beast with blue spiritual Qi, swamp trees, action shot, 8K"
    },
    50: {
        "title": "Scene 50: Soul Absorption",
        "description": "With a final strike, Luan slays the beast. The system absorbs the beast's core, converting it into raw cultivation energy for Luan.",
        "dialogue": "SYSTEM: [Beast King defeated. Core absorbed. Rebellion Points: +300. Breakthrough Progress: 75%.]\nLUAN: (breathing heavily, hand glowing green) The energy is wild, but I can contain it.\nLIN QIUYUE: (silver eyes wide) You absorb cores directly? That is... unheard of.",
        "prompt": "Wuxia post-battle scene, prince absorbing glowing green core from a defeated monster on the ground, hand glowing green, companions watching in awe, 8K"
    },
    51: {
        "title": "Scene 51: The Disgraced General",
        "description": "In the swamp ruins, they encounter a disgraced former imperial general living in exile. Luan asks him to join their cause.",
        "dialogue": "EXILED GENERAL: I served the emperor for thirty years, boy. He exiled me to die here.\nLUAN: He sent Zhao Bing to poison me. The throne is corrupt. Join us and reclaim your honor.\nEXILED GENERAL: (looking at Luan's dragon aura, kneeling) ...The Iron Shield stands with you.",
        "prompt": "Wuxia meeting scene, scarred old general in worn imperial armor kneeling before the prince inside a ruined stone swamp temple, mossy pillars, 8K"
    },
    52: {
        "title": "Scene 52: The Training Array",
        "description": "Luan uses his rebellion points to unlock a training array from the system, allowing his core commanders to train at five times baseline speed.",
        "dialogue": "WEI BOLONG: (feeling the Qi surge) By the gods! This array is like a spirit spring!\nLUAN: We have only days before the main battle. We must close the power gap.\nLIN QIUYUE: (strategizing) With this, our generals will match the imperial elite.",
        "prompt": "Wuxia training scene, general and strategist sitting inside a glowing gold runic circle inside the command tent, prince directing the energy, 8K"
    },
    53: {
        "title": "Scene 53: The Spy's Report",
        "description": "A shadow spy captures an imperial courier carrying orders to the coalition. Luan reads the betrayal on the scroll.",
        "dialogue": "LUAN: My father has promised the northern kingdoms three frontier provinces if they destroy my army.\nWEI BOLONG: (furious) He would sell his own land and people to kill his son?!\nLUAN: Fear makes men monstrous. The empire must fall.",
        "prompt": "Tense wuxia interior scene, prince reading an imperial scroll by candlelight in a dark wooden command tent, general slamming table, strategist thinking, 8K"
    },
    54: {
        "title": "Scene 54: The Blood Seal",
        "description": "Luan and his generals seal their alliance with a blood seal, promising to destroy the corrupt throne and rebuild the empire.",
        "dialogue": "LUAN: (slicing palm, letting blood drip into the bowl) No retreat. No surrender.\nWEI BOLONG: (slicing palm) To the death.\nLIN QIUYUE: (letting her blood fall) For a clean empire.",
        "prompt": "Wuxia blood oath scene, three hands dripping blood into a bronze bowl on a stone altar, ancient swords crossed behind, torchlit ceremony, 8K"
    },
    55: {
        "title": "Scene 55: The Northern Gate",
        "description": "Luan stands at the northern gate of Yuno City as the winter storm begins. The coalition vanguard is sighted on the hills.",
        "dialogue": "LUAN: The gate holds. The winter will be our shield, and the dragon our sword.\nSYSTEM: [Survival countdown: 2 hours. Coalition forces deployed.]\nWEI BOLONG: Ready the archers!",
        "prompt": "Wuxia fortress gate scene, prince looking out from the wooden gates of the fortress at snowy hills where enemy camps are visible, snow falling, 8K"
    },
    57: {
        "title": "Scene 57: The Scroll of Dragon Arts",
        "description": "Luan touches the glowing black silk scroll, and the ancient Dragon Emperor Arts flood his mind, rewriting his meridians with golden draconic Qi.",
        "dialogue": "SYSTEM: [Dragon Emperor Arts: ACQUIRED. Cultivation technique Rank: Sovereign. Combat power multiplier: 10x.]\nLUAN: (eyes glowing gold, veins pulsing) The power... it burns like suns!\nANCIENT SPIRIT: (floating above) The dragon has chosen. Do not fail us, heir.",
        "prompt": "Spectacular wuxia inheritance scene, prince holding a glowing black scroll, golden dragon Qi entering his chest, ancient temple ruins, stone pillars, 8K"
    },
    58: {
        "title": "Scene 58: The First Test",
        "description": "Luan tests his new Dragon Emperor Arts in the ruins, his simple punch shattering a massive stone pillar with golden dragon Qi.",
        "dialogue": "WEI BOLONG: (staring at the shattered ruins) That... that was just a basic punch?!\nLUAN: (looking at his glowing gold fist) The Qi is condensed. The power gap is gone.\nLIN QIUYUE: (coolly) With this, the imperial army is no longer invincible.",
        "prompt": "Wuxia training scene, prince punching a massive stone pillar which is shattering into pieces with golden Qi dragon silhouettes, ruins background, 8K"
    },
    59: {
        "title": "Scene 59: The Tomb Guardian",
        "description": "An ancient stone guardian awakens in the ruins, testing Luan's worthiness to claim the Dragon Sovereign's legendary sword.",
        "dialogue": "GUARDIAN: Only the true sovereign may pass. Prove your resolve, boy!\nLUAN: (drawing blade) I am Luan Tianlong. The frontier made me, and the dragon chose me!\nSYSTEM: [Tomb Guardian boss fight: ACTIVE. Power level: Earth Profound Realm Rank 3.]",
        "prompt": "Epic wuxia boss battle, prince in dark armor fighting a giant glowing stone statue guardian in ancient ruins, golden dragon Qi versus blue stone shockwaves, 8K"
    },
    60: {
        "title": "Scene 60: The Seven Star Sword",
        "description": "Luan defeats the guardian, and a legendary sword—the Seven Star Dragon Devastator—rises from the temple altar, its black blade etched with stars.",
        "dialogue": "SYSTEM: [Legendary Weapon Unlocked: Seven Star Dragon Devastator. Special trait: Devastates spiritual shields.]\nLUAN: (grabbing the hilt, stars glowing on blade) A fine blade. Worthy of a rebellion.\nGUARDIAN: (crumbling to dust) ...Go... and reclaim the sky...",
        "prompt": "Wuxia legendary weapon scene, prince holding a glowing black sword with seven gold stars on the blade, temple altar, beams of light, columns, 8K"
    },
    61: {
        "title": "Scene 61: The Gathering Storm",
        "description": "Luan and his companions return to Yuno City. The coalition vanguard has been defeated, but the imperial main force is assembling.",
        "dialogue": "WEI BOLONG: The emperor has mobilized the central guards. One million men are marching.\nLUAN: Let them march. We have the dragon arts and the Seven Star blade.\nLIN QIUYUE: (mapping) We must meet them at the Valley of Ten Thousand Peaks.",
        "prompt": "Wuxia war room scene, prince pointing Seven Star sword at a campaign map on a wooden table, general and strategist watching, map details visible, 8K"
    },
    62: {
        "title": "Scene 62: Recruiting the Outlaws",
        "description": "Luan travels to the northern outlaw camps, seeking their alliance. The outlaw king challenges Luan to a duel of strength.",
        "dialogue": "OUTLAW KING: If you defeat me in three moves, my five thousand blades are yours.\nLUAN: (blade sheathed) I only need one.\nSYSTEM: [Activating Dragon Soul Roar. Outlaw king willpower shattered.]",
        "prompt": "Wuxia camp scene, prince facing a burly outlaw king with scars in a snowy outlaw camp, outlaws watching, high-tension face-off, 8K"
    },
    63: {
        "title": "Scene 63: The Outlaw's Oath",
        "description": "The outlaw king falls to his knees, completely overwhelmed by Luan's spiritual pressure. He pledges his alliance.",
        "dialogue": "OUTLAW KING: (gasping) That... that pressure... Earth Profound Realm Rank 9?!\nLUAN: (extending hand) Rise. We fight for the people, not the throne.\nOUTLAW KING: (clasping hand) The outlaws are yours, Prince.",
        "prompt": "Wuxia alliance scene, outlaw king kneeling and clasping the prince's hand in a snowy mountain camp, outlaw warriors cheering, 8K"
    },
    64: {
        "title": "Scene 64: The Imperial Scout Ambush",
        "description": "Luan's vanguard is ambushed by imperial shadow scouts. Luan uses the Azure Flame Step to move in a blur, neutralizing them instantly.",
        "dialogue": "IMPERIAL SCOUT: (dying) Traitor... the emperor... knows...\nLUAN: (sheathing Seven Star sword) The emperor's shadow is fading.\nWEI BOLONG: (spearing the last scout) Clean work, my prince.",
        "prompt": "Fast wuxia combat scene, prince moving in blue after-images (Azure Flame Step) to slice imperial scouts in a dense green forest, dynamic angle, 8K"
    },
    65: {
        "title": "Scene 65: Strategist's Doubt",
        "description": "At the forest camp, Lin Qiuyue warns Luan about the heavy toll of civil war. She fears Luan will lose his humanity in the pursuit of power.",
        "dialogue": "LIN QIUYUE: A million men will die, Tianlong. Can your soul bear the weight of a million deaths?\nLUAN: (looking at his scarred hands) A million deaths to end a thousand years of tyranny. I will bear it.\nLIN QIUYUE: (sighing) Then I will ensure those deaths are not wasted.",
        "prompt": "Wuxia campfire scene, strategist staring at the prince with serious eyes, camp tents in background, soft warm firelight, reflective mood, 8K"
    },
    66: {
        "title": "Scene 66: Pushing the Breakthrough",
        "description": "Luan trains in the forest, pushing his cultivation to the peak of the Spirit Awakening Realm. The system alerts him of his upcoming Earth Profound breakthrough.",
        "dialogue": "SYSTEM: [Warning: Earth Profound Realm breakthrough requires stabilizing core. Recommended catalyst: Snow Lotus.]\nLUAN: I have the snow lotus Zhao Bing brought. (consumes it)\nSYSTEM: [Breakthrough initiated. 10 hours to stabilization.]",
        "prompt": "Wuxia training scene, prince sitting cross-legged under a waterfall in a snowy forest, gold and blue Qi swirling around him, misty waterfall, 8K"
    },
    67: {
        "title": "Scene 67: The Snow Lotus",
        "description": "The snow lotus melting in his core, Luan's cultivation stabilizes. His spiritual energy turns a deep golden-blue, the mark of the Dragon Emperor.",
        "dialogue": "LUAN: (opening gold-glowing eyes) The earth... I can feel its pulse.\nWEI BOLONG: (approaching) The imperial army has reached the valley, Luan. It's time.\nLUAN: (standing, drawing sword) Let's go meet my father's million.",
        "prompt": "Wuxia cultivation scene, prince standing in front of a waterfall, golden-blue spiritual dragon wings flaring behind him, determined face, 8K"
    },
    69: {
        "title": "Scene 69: The Valley Standoff",
        "description": "The two armies face each other in the Valley of Ten Thousand Peaks. The size gap between Luan's forces and the imperial host is overwhelming.",
        "dialogue": "WEI BOLONG: (looking at the endless ocean of golden armor) One million. It looks like a sea of gold.\nLUAN: (Seven Star sword in hand) A sea that will soon be dyed red. Stand firm.\nLIN QIUYUE: The archers are in position on the ridges. The trap is set.",
        "prompt": "Epic wuxia army standoff scene, two massive armies facing each other in a rocky mountain valley, gold imperial banners versus black dragon banners, 8K"
    },
    70: {
        "title": "Scene 70: The Imperial Charge",
        "description": "The imperial vanguard charges, led by high-level cultivators. Luan's archers release a rain of arrows coated in Lin Qiuyue's poison.",
        "dialogue": "IMPERIAL GENERAL: Crushes the rebel insects! For the Throne!\nLIN QIUYUE: (raising fan) Release the arrows.\nIMPERIAL GENERAL: (screaming as poison arrows rain down)",
        "prompt": "Dramatic wuxia battle scene, thousands of arrows raining down on charging imperial golden cavalry in a rocky gorge, explosions, smoke, 8K"
    },
    71: {
        "title": "Scene 71: General Wei's Stand",
        "description": "Wei Bolong leads the defense of the center, his spear crackling with War Drum Qi, shattering the imperial shield walls.",
        "dialogue": "WEI BOLONG: (slamming spear, releasing a shockwave) IRON WOLF GENERAL FEARS NO ONE!\nIMPERIAL SOLDIERS: (blown back by the Qi wave, shield walls cracking)\nWEI BOLONG: (grinning) Come on, you golden puppies!",
        "prompt": "Dynamic wuxia action scene, burly general in worn armor slamming a massive spear into imperial shield soldiers, gold shields shattering, shockwave, 8K"
    },
    72: {
        "title": "Scene 72: The Shield Wall Breaks",
        "description": "The imperial center collapses under Wei Bolong's crushing force. Luan leads the elite cavalry to exploit the gap.",
        "dialogue": "LUAN: (leading the charge) Follow General Wei! Break their formation!\nSYSTEM: [Defeat a cultivator above your realm: ACTIVE. Target: General Feng (Earth Profound Rank 5).]\nLUAN: (targeting the imperial general) Feng! Face me!",
        "prompt": "Wuxia cavalry charge scene, prince leading horse riders in dark armor charging through a broken gold shield wall, swords raised, dust rising, 8K"
    },
    73: {
        "title": "Scene 73: Duel of Realms",
        "description": "Luan clashes with General Feng on the battlefield. Feng, at Earth Profound Rank 5, expects to crush Luan, but is shocked by his Dragon Arts.",
        "dialogue": "GENERAL FENG: A mere Spirit Awakening boy dares challenge me? Die!\nLUAN: (Seven Star sword clashing with Feng's massive hammer) The power gap is a lie, Feng!\nSYSTEM: [Host combat power multiplied 10x by Dragon Emperor Arts. Target defense: 12% remaining.]",
        "prompt": "Dynamic wuxia duel scene, prince with glowing black Seven Star sword clashing with an old general with a massive glowing warhammer on a muddy battlefield, 8K"
    },
    74: {
        "title": "Scene 74: General Feng Defeated",
        "description": "Luan slices through General Feng's warhammer and impales him. The system announces Luan's breakthrough to Earth Profound Realm Rank 3.",
        "dialogue": "SYSTEM: [General Feng defeated. Target realm: Earth Profound Rank 5. Mission COMPLETE. Reward: Cultivation breakthrough.]\nLUAN: (Qi erupting gold) Breakthrough! Earth Profound Realm Rank 3!\nGENERAL FENG: (collapsing) ...The dragon... has returned...",
        "prompt": "Wuxia victory scene, prince standing over defeated old general on battlefield, golden Qi erupting from prince's body, Seven Star sword dripping blood, 8K"
    },
    75: {
        "title": "Scene 75: The Flank Attack",
        "description": "Lin Qiuyue's outlaw allies ambush the imperial supply lines from the secret ridges, cutting off the imperial vanguard.",
        "dialogue": "OUTLAW KING: (slashing supply carts) Take the food! Burn the rest!\nIMPERIAL OFFICERS: (panic spreading) Our supply lines! We are cut off!\nLIN QIUYUE: (watching from a ridge) The checkmate is close.",
        "prompt": "Wuxia ambush scene, outlaw warriors in ragged leather armor attacking imperial supply wagons on a mountain pass, fire, smoke, chaotic battle, 8K"
    },
    76: {
        "title": "Scene 76: The Imperial Retreat",
        "description": "Panic spreads through the imperial army as they realize they are surrounded. The retreat turns into a chaotic rout.",
        "dialogue": "IMPERIAL OFFICERS: Retreat! Consolidate at the second pass! Retreat!\nWEI BOLONG: (spear dripping) They're running like rabbits, Luan!\nLUAN: (pointing sword) Do not chase the retreating soldiers. Let them spread the news of their defeat.",
        "prompt": "Wuxia victory scene, massive imperial army fleeing in chaos, throwing away weapons and banners, rebel soldiers cheering from the ridges, sunset, 8K"
    },
    77: {
        "title": "Scene 77: The Strategy of Mercy",
        "description": "Lin Qiuyue explains Luan's next move: releasing captured imperial soldiers to spread the promise of amnesty, weakening the capital's resolve.",
        "dialogue": "LIN QIUYUE: If we execute them, the capital will fight to the death. If we free them, they will open the gates for us.\nLUAN: Mercy is a weapon, Qiuyue. We use it well.\nWEI BOLONG: (grinning) And it saves us the cost of feeding them.",
        "prompt": "Wuxia parley scene, strategist explaining a scroll to the prince inside the command tent, camp fires visible outside, atmospheric night scene, 8K"
    },
    78: {
        "title": "Scene 78: The System's Reward",
        "description": "Luan claims his 10:1 victory reward from the system, unlocking a legendary cultivation manuals—the Dragon Sovereign Soul Seal.",
        "dialogue": "SYSTEM: [Mission: Win against 10:1 odds. COMPLETE. Reward: Dragon Sovereign Soul Seal unlocked.]\nLUAN: (absorbing the manual) This will protect my soul from my father's suppression seal.\nSYSTEM: [Breakthrough to Earth Profound Rank 5 confirmed. Host is ready for the capital.]",
        "prompt": "Wuxia system reward scene, prince alone in tent, glowing blue rune book floating before him, gold script entering his forehead, maps on background, 8K"
    },
    79: {
        "title": "Scene 79: Marching South",
        "description": "Luan's army, now reinforced by local sects and defected imperial soldiers, begins its march toward the imperial capital.",
        "dialogue": "WEI BOLONG: The road to the capital is clear. The citizens are cheering for us.\nLUAN: (riding a black warhorse) The final battle is close, Wei. Keep the men focused.\nLIN QIUYUE: The emperor is waiting. And he has prepared a trap.",
        "prompt": "Epic wuxia marching scene, prince on black horse leading a massive army with dragon banners marching along a highway towards a distant golden city, mountains, 8K"
    },
    81: {
        "title": "Scene 81: Consolidating the Capital",
        "description": "Luan enters the imperial capital. The streets are lined with silent, hopeful citizens. Luan commands his soldiers to protect the markets and civilian sectors.",
        "dialogue": "LUAN: Any soldier who loots or harms a civilian will face immediate execution. We are guardians, not conquerors.\nCITIZENS: (whispering, bowing) He is different... the Prince is different...\nWEI BOLONG: The city is secure, my prince. The palace is ahead.",
        "prompt": "Wuxia city scene, prince on horse leading soldiers through the streets of a grand golden capital city, citizens bowing and watching with relief, banners, 8K"
    },
    82: {
        "title": "Scene 82: The Sovereign's Grief",
        "description": "Luan walks through the neglected lower sectors of the capital, seeing the poverty and decay his father ignored while feasting in the golden palace.",
        "dialogue": "LUAN: (hand on a crumbling stone wall) Ten years of feasts while the capital rotted from within. This is why he feared the frontier.\nLIN QIUYUE: The court spent all the country's wealth on corrupt pills to prolong his lifespan.\nLUAN: (eyes cold) The decay stops today.",
        "prompt": "Somber wuxia street scene, prince in dark armor walking through a crowded poor sector of the capital city, poverty visible, strategist walking beside him, 8K"
    },
    84: {
        "title": "Scene 84: Storming the Palace",
        "description": "Luan and his vanguard storm the imperial palace gates. The Emperor's elite shadow guards, cultivators at Spirit Awakening Rank 9, block their way.",
        "dialogue": "SHADOW GUARD: Prince Luan! You commit high treason! Face the imperial wrath!\nLUAN: (Seven Star sword blazing gold) The emperor's wrath is nothing to the dragon!\nWEI BOLONG: (charging spear) Get out of the way, you golden dogs!",
        "prompt": "Epic wuxia palace storming, prince and general clashing with elite golden-armored guards at the grand white marble palace gates, golden Qi versus black dragon Qi, 8K"
    },
    85: {
        "title": "Scene 85: The Crown Prince's Betrayal",
        "description": "Luan's eldest brother, the Crown Prince, stands in the palace courtyard, drawing a poison blade. He confesses to conspiring with the northern enemies.",
        "dialogue": "CROWN PRINCE: You were always the favorite, Tianlong! Father sent you to the frontier to die, and yet you returned! I had to sell the north to destroy you!\nLUAN: (deep sorrow) You sold our people to buy a throne that was never yours to sell.\nCROWN PRINCE: (lunging) DIE!",
        "prompt": "Wuxia family duel scene, prince clashing swords with the Crown Prince in ornate golden armor inside a marble palace courtyard, cherry blossom petals, high drama, 8K"
    },
    86: {
        "title": "Scene 86: The Crown Prince Defeated",
        "description": "Luan disarms the Crown Prince with a single, precise sweep of the Seven Star sword. The Crown Prince falls, begging for mercy.",
        "dialogue": "CROWN PRINCE: (on the ground, trembling) Please... we are brothers, Tianlong...\nLUAN: (pointing blade at his throat) You are a traitor to Yuno City and the frontier. Your life is forfeit.\nWEI BOLONG: (taking him away) The prince will face trial.",
        "prompt": "Wuxia victory scene, prince standing over defeated Crown Prince kneeling on the marble courtyard, Seven Star sword at throat, general in background, 8K"
    },
    87: {
        "title": "Scene 87: The Emperor's Shadow Network",
        "description": "Lin Qiuyue fights a duel in the palace library, using Phantom Step to execute the leader of the Emperor's shadow network, clearing the way.",
        "dialogue": "SHADOW LEADER: (concealed in darkness) The strategist thinks she can outrun the shadows?\nLIN QIUYUE: (appearing behind him, needle at throat) I do not outrun the shadows. I command them.\nSHADOW LEADER: (dies in silence)",
        "prompt": "Mysterious wuxia duel, pale strategist woman in grey robes executing a cloaked assassin in a dark palace library, glowing green poison needle at throat, 8K"
    },
    88: {
        "title": "Scene 88: The Throne Room Entrance",
        "description": "Luan reaches the grand doors of the imperial throne room. He pauses, realizing that his father, the Emperor, is waiting inside with a forbidden power.",
        "dialogue": "WEI BOLONG: The throne is just behind these doors, Luan. Are you ready?\nLUAN: (looking at the Seven Star sword) I've been ready for ten years. Keep the men outside.\nLIN QIUYUE: (coolly) The emperor's power is unstable. Be careful.",
        "prompt": "Wuxia gate scene, prince standing in front of massive golden throne room doors, holding Seven Star sword, general and strategist watching from sides, 8K"
    },
    89: {
        "title": "Scene 89: Confronting the Sovereign",
        "description": "Luan steps into the grand golden throne room. Emperor Longwei sits on the golden throne, his robes stained with blood from the forbidden ritual.",
        "dialogue": "EMPEROR LONGWEI: You returned, Tianlong. You returned to kill your father.\nLUAN: I returned to save the empire from your fear. Step down, Father.\nEMPEROR LONGWEI: (golden Qi flaring blindly) Never! The throne is mine!",
        "prompt": "Wuxia confrontation scene, prince facing his gaunt paranoid father on a golden throne, throne room filled with dark golden energy, grand columns, 8K"
    },
    92: {
        "title": "Scene 92: Cleaning the Court",
        "description": "Luan oversees the arrest of the corrupt ministers and nobles who supported the old emperor's bloody rule. The court is purged of greed.",
        "dialogue": "MINISTER: (begging) We were only following orders, Prince! We have gold! We have resources!\nLUAN: Your resources belong to the frontier now. Take them to Yuno City.\nWEI BOLONG: (dragging them out) The dungeons are waiting, ministers.",
        "prompt": "Wuxia justice scene, prince sitting on palace stairs, corrupt nobles in silk robes being led away in chains by soldiers in dark armor, general overseeing, 8K"
    },
    93: {
        "title": "Scene 93: Lin Qiuyue's Warning",
        "description": "Lin Qiuyue warns Luan about the northern sects who are attempting to exploit the power vacuum left by the empire's fall.",
        "dialogue": "LIN QIUYUE: The sects helped us destroy the throne, but now they want to rule the territory. We must establish a council.\nLUAN: A council of the frontier, led by the generals and the sect leaders together.\nLIN QIUYUE: (fan folded) A wise choice. It prevents a new tyrant from rising.",
        "prompt": "Wuxia council strategy scene, prince and strategist looking at maps inside a grand palace chamber, sun rays cutting through windows, serious expressions, 8K"
    },
    94: {
        "title": "Scene 94: The Sovereign's Decree",
        "description": "Luan issues his first decree to the continent, declaring the empire dissolved and establishing the Dragon Alliance of free provinces.",
        "dialogue": "LUAN: (signing the scroll with gold seal) The Jade Throne is gone. The provinces are free. Let the people govern themselves.\nWEI BOLONG: (grinning) That's a decree I can support.\nLIN QIUYUE: (silver eyes warm) A legendary choice.",
        "prompt": "Wuxia writing scene, prince signing a grand scroll with a gold dragon seal on a palace desk, general and strategist watching, golden afternoon light, 8K"
    },
    96: {
        "title": "Scene 96: The Portal's Secret",
        "description": "Luan studies the extra-dimensional portal beneath the throne. The system explains the impending invasion from the celestial realm.",
        "dialogue": "SYSTEM: [Celestial Rift stabilization: 92%. The invaders are led by the ancient founders of the Longwei dynasty who ascended centuries ago.]\nLUAN: They abandoned our world to rot, and now they return to conquer it?\nSYSTEM: [They seek the Dragon Sovereign inheritance Host holds.]",
        "prompt": "Wuxia fantasy portal scene, prince looking at a glowing blue extra-dimensional energy rift floating above the shattered golden throne, runes glowing, 8K"
    },
    97: {
        "title": "Scene 97: General Wei's Farewell",
        "description": "Wei Bolong clasps Luan's arm in a final, emotional farewell. He realizes that Luan must ascend alone to fight the celestial threat.",
        "dialogue": "WEI BOLONG: (eyes wet) You've always been ahead of me, Luan. I cannot follow you through that portal.\nLUAN: Protect Yuno City, my brother. Protect the alliance.\nWEI BOLONG: (spear salute) With my life, my prince. With my life.",
        "prompt": "Emotional wuxia farewell scene, prince clasping arms with a burly general in a marble palace chamber, glowing blue portal in background, dust motes, 8K"
    },
    98: {
        "title": "Scene 98: Strategist's Promise",
        "description": "Lin Qiuyue offers her folded fan to Luan, her silver eyes soft with emotion as she says goodbye before his ascension.",
        "dialogue": "LIN QIUYUE: You stayed worth it, Tianlong. Reclaim the heavens, and I will keep the continent safe.\nLUAN: (taking the fan) We will meet again under the plum blossoms, Qiuyue.\nLIN QIUYUE: (appearing to fade) I will count the days.",
        "prompt": "Beautiful wuxia goodbye scene, pale strategist woman offering her fan to the prince, glowing portal behind, cherry blossoms blowing in from window, 8K"
    }
}


def expand_novel_script(input_path: str, output_path: str):
    print(f"Reading original script from: {input_path}")
    if not os.path.exists(input_path):
        print("Error: Input script file not found!")
        return
        
    with open(input_path, "r", encoding="utf-8", errors="ignore") as f:
        text = f.read()
        
    # Extract Character Profiles section
    profile_match = re.search(r"^(.*?)(?=Scene 1:)", text, re.DOTALL | re.IGNORECASE)
    header_section = profile_match.group(1).strip() if profile_match else ""
    
    # Parse existing scenes
    scenes_dict = {}
    scene_blocks = list(re.finditer(r"(Scene \d+:.*?)\n(.*?)IMAGE PROMPT:(.*?)(?=Scene \d+:|$)", text, re.DOTALL))
    
    for match in scene_blocks:
        title = match.group(1).strip()
        body = match.group(2).strip()
        img_prompt = match.group(3).strip()
        
        num_match = re.search(r"Scene (\d+)", title)
        if num_match:
            scene_num = int(num_match.group(1))
            
            # Extract description and dialogue
            desc_match = re.search(r"DESCRIPTION:\s*(.*?)(?=DIALOGUE:|$)", body, re.DOTALL | re.IGNORECASE)
            dial_match = re.search(r"DIALOGUE:\s*(.*?)$", body, re.DOTALL | re.IGNORECASE)
            
            description = desc_match.group(1).strip() if desc_match else ""
            dialogue = dial_match.group(1).strip() if dial_match else ""
            
            scenes_dict[scene_num] = {
                "title": title,
                "description": description,
                "dialogue": dialogue,
                "prompt": img_prompt
            }
            
    print(f"Parsed {len(scenes_dict)} original scenes from input.")
    
    # Merge with filler scenes
    all_scenes = {}
    
    # 1. Start with the original scenes
    all_scenes.update(scenes_dict)
    
    # 2. Inject the filler scenes
    for s_idx, data in FILLER_SCENES.items():
        all_scenes[s_idx] = data
        
    print(f"Merged script contains {len(all_scenes)} scenes in total.")
    
    # Write full novel script to output path
    print(f"Writing full expanded novel script to: {output_path}")
    with open(output_path, "w", encoding="utf-8") as f:
        f.write(header_section)
        f.write("\n\n")
        
        # We write them in numerical order
        # Book 1 contains Arc 1 (1-20), Arc 2 (21-40), Arc 3 (41-60), Arc 4 (61-80), Arc 5 (81-100)
        sorted_keys = sorted(all_scenes.keys())
        
        current_arc = 0
        for s_idx in sorted_keys:
            # Demarcate Arcs
            if s_idx == 1 and current_arc < 1:
                f.write("\nARC 1 — THE POISON DECREE\nScenes 1–20\n\n")
                current_arc = 1
            elif s_idx == 21 and current_arc < 2:
                f.write("\nARC 2 — THE NORTHERN INVASION\nScenes 21–40\n\n")
                current_arc = 2
            elif s_idx == 41 and current_arc < 3:
                f.write("\nARC 3 — THE DRAGON ALLIANCE\nScenes 41–60\n\n")
                current_arc = 3
            elif s_idx == 61 and current_arc < 4:
                f.write("\nARC 4 — FALL OF THE EMPIRE\nScenes 61–80\n\n")
                current_arc = 4
            elif s_idx == 81 and current_arc < 5:
                f.write("\nARC 5 — THE CELESTIAL ASCENSION\nScenes 81–100\n\n")
                current_arc = 5
                
            scene = all_scenes[s_idx]
            
            f.write(f"{scene['title']}\n")
            f.write("DESCRIPTION:\n")
            f.write(f"{scene['description']}\n")
            f.write("DIALOGUE:\n")
            f.write(f"{scene['dialogue']}\n")
            f.write("? IMAGE PROMPT: ")
            f.write(f"{scene['prompt']}\n\n")
            
    print("Full expanded novel script generated successfully!")


if __name__ == "__main__":
    input_file = r"C:\Users\Akash\Desktop\Heavenly_Rebellion_Book1_Script.txt"
    output_file = r"C:\Users\Akash\Desktop\Heavenly_Rebellion_Book1_Script_Full.txt"
    expand_novel_script(input_file, output_file)
