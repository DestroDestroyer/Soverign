# story_expander.py
"""
Rich, long-form narrative expansion database for Heavenly Rebellion Book 1.
Each scene's text is expanded to include detailed scenery, character thoughts,
cultivation power levels, power gaps, and dramatic twists.
At standard speaking rates, this generates ~1 hour of TTS audio narration.
"""

SCENE_EXPANSIONS = {
    0: (
        "Welcome, fellow cultivators and storytellers, to the grand premiere of our epic journey: "
        "The Heavenly Rebellion. This is a brand new channel dedicated to bringing you the finest, "
        "most immersive cinematic wuxia and xianxia stories. Your support means the absolute world to me. "
        "Before the narration starts, I would love to ask for your support. Please consider subscribing to "
        "this new channel, leaving a like, and sharing your thoughts in the comments below. Together, "
        "we shall watch empires burn and sovereigns rise. Sit back, relax, and let the adventure begin."
    ),
    1: (
        "The northern wind howls across the desolate plains, carrying the scent of frost and old blood. "
        "Prince Luan Tianlong stands atop the ancient granite walls of Yuno City, his scarred hand resting "
        "on the pommel of his sword. At twenty-eight, Luan is a legendary figure on the frontier—a battle-scarred "
        "prince who has spent ten years defending the empire from the northern coalition. Yet, despite his renown, "
        "Luan's cultivation is stuck at the Mortal Refinement Peak, Rank 9. He is a mortal peak, yet to break through "
        "to the Spirit Awakening Realm. In this world, the power gap between a Mortal Refinement cultivator and a "
        "Spirit Awakening cultivator is a vast chasm. A Spirit Awakening expert can manipulate spiritual Qi to crush "
        "a hundred mortals with a single strike. Luan knows this, but he has focused his life on brutal, efficient "
        "frontier combat. Tonight, a dark premonition grips him. The sun bleeds red, painting the sky in a crimson hue. "
        "Luan whispers, 'Ten years of holding this line while they feasted in the capital. And still the wind smells "
        "like war.' A guard captain approaches, reporting the arrival of a messenger from the imperial court under the "
        "golden seal, escorted by thirty armed imperial guards. Luan's eyes narrow. He commands the captain to double "
        "the watch. A twist is already brewing: why would the emperor send a heavily armed escort to a loyal prince on "
        "the frontier?"
    ),
    2: (
        "Eunuch Zhao Bing, known in the capital as the Emperor's Poisoned Blade, steps into the torchlit fortress hall. "
        "Despite the dusty journey, his golden silk robes are immaculate. Zhao Bing is a terrifying figure; behind his "
        "soft, polite smile lies a cultivator at the Spirit Awakening Realm, Rank 9. The power gap between Prince Luan, "
        "a mere Mortal Refinement cultivator, and Zhao Bing is staggering. A Rank 9 Spirit Awakening expert could easily "
        "obliterate a thousand mortal soldiers. Zhao Bing extends the imperial decree, sealed with the Jade Dragon mark. "
        "His thirty guards fan out, their hand-forged golden armor reflecting the torchlight. General Wei Bolong, Luan's "
        "sworn brother, growls in suspicion, sensing a trap. Wei Bolong himself is an Earth Profound Realm Peak Rank 9 "
        "cultivator—a massive powerhouse who actually dwarfs Zhao Bing in strength. The power gap here favors the frontier: "
        "Wei Bolong could crush Zhao Bing in seconds. Yet, Zhao Bing remains serene and unafraid. Why? There must be a "
        "hidden twist. Zhao Bing reads the decree, announcing that the Emperor has sent his regards. But Luan replies "
        "coldly, knowing that the emperor does not send his personal assassin for simple greetings."
    ),
    3: (
        "An oppressive tension fills the stone hall as Eunuch Zhao Bing prepares to unroll the imperial decree. "
        "The frontier veterans, men who have survived a hundred bloody skirmishes, exchange tense glances. Their battle-honed "
        "instincts scream that death is in the room. Hands slowly drift to the hilts of their swords. The thirty imperial "
        "guards, sensing the shifting mood, tighten their formation around the eunuch. The power gap between the elite imperial "
        "guards—cultivators at the Spirit Awakening Realm Rank 5—and the average frontier soldiers, who are mostly in the "
        "Mortal Refinement realm, is substantial. A direct clash would result in a bloodbath. General Wei Bolong steps "
        "forward, his Earth Profound Qi faintly flaring, demanding that the guards sheathe their weapons. Zhao Bing plays it "
        "off as mere ceremony, mockingly asking if the fierce frontier warriors are afraid of a few golden swords. The hidden "
        "twist: Zhao Bing has brought a suppression talisman, designed to neutralize Wei Bolong's Earth Profound Qi, "
        "ensuring the imperial decree can be executed without interference."
    ),
    4: (
        "The final blow falls not from a sword, but from words. Zhao Bing unrolls the decree and reads the chilling words "
        "in a flat, monotone voice. Prince Luan is accused of treason, frontier corruption, and illegal military expansion. "
        "The penalty is death by suicide, using the golden poison provided by the Emperor's 'mercy.' Zhao Bing produces a small "
        "jade vial containing the lethal draught. The hall falls into a horrified silence. The soldiers are frozen. Wei Bolong's "
        "voice breaks like stone: 'Mercy. He calls that mercy.' Zhao Bing extends the vial, giving Luan until the third incense "
        "stick burns out. Luan stares at the vial. He is calm. The power gap between Luan's Mortal Refinement cultivation and the "
        "sovereign power of the Dragon Throne is absolute. To defy the Emperor is to invite the destruction of Yuno City. Luan "
        "asks Zhao Bing: 'What crime did I commit that was not first ordered by my father?' A twist: the Emperor's true fear is "
        "not Luan's treason, but Luan's popularity. The frontier army is loyal to Luan, not the throne."
    ),
    5: (
        "The decree's words spark an immediate, volcanic reaction throughout the fortress. Veterans who have bled beside Luan "
        "for a decade draw their weapons, roaring in fury. The thirty imperial guards close into a defensive circle around Zhao "
        "Bing, their hand-forged blades raised. Wei Bolong levels his massive spear at the eunuch's throat, his voice thundering: "
        "'TEN YEARS! Ten years the Prince bled for this empire while the emperor played politics in his golden cage—and THIS is "
        "his reward?!' The soldiers join the roar, refusing to let their prince be executed. Zhao Bing remains serene, warning "
        "them that interfering with an imperial decree is treason. Wei Bolong retorts that they have been traitors since they "
        "followed a prince worth following. Luan raises his hand, and the hall goes instantly silent. The power gap between Luan "
        "and Zhao Bing is clear, but Luan's absolute control over his men represents a different kind of power. A twist: Luan "
        "is not silent out of fear, but because he is analyzing Zhao Bing's positioning and preparing his next move."
    ),
    6: (
        "In the heavy silence that follows Luan's command, his mind floods with a decade of memory. He remembers the quiet costs "
        "of the frontier—the soldiers buried in frozen ground, the letters to their families he wrote himself, the children "
        "who called him guardian, and the winters survived on half rations because the capital's supply lines were always "
        "delayed. Luan's inner monologue reveals his journey: 'Ten years ago I came to this frontier as punishment—a prince too "
        "troublesome for court. I was twenty-three and furious. I thought the north would break me. Instead, it made me.' "
        "He remembers burying four thousand men and learning every name. The emperor could not name a single one. The power gap "
        "between Luan's battle-hardened loyalty and the emperor's fearful greed is vast. A twist: Luan realizes that by ordering "
        "his death, the emperor has freed him from his oath of filial duty, giving him the moral right to rebel."
    ),
    7: (
        "Luan's memories drift back to the first northern winter—a brutal campaign where the enemy coalition's cavalry charge "
        "nearly broke Yuno City's eastern gate. Luan had fought for six hours straight on the wall with a broken rib, refusing "
        "to retreat. After the battle, Wei Bolong found him collapsed behind a supply cart. Wei Bolong had crouched over him, "
        "gruff and worried: 'You absolute fool. You could have commanded from the rear.' Luan had replied: 'And what would they "
        "have thought? That their prince hides while they die?' Wei Bolong had promised to never tell the men. In the present, "
        "Luan realizes this is what the emperor wants to erase: a decade of a man's life and the shared bonds of the frontier. "
        "The power level of Luan's character is not just defined by his Mortal Refinement Rank 9 cultivation, but by the iron "
        "will forged in those freezing trenches. A twist: Luan realizes that the broken rib from that winter is the very source "
        "of his meridian blockage, which has held back his cultivation for years."
    ),
    8: (
        "Clarity arrives like a cold blade. Luan understands now that his father does not hate him; his father fears him. "
        "Ten years on the frontier built an army that loves its commander more than the Dragon Throne. The emperor sent Zhao "
        "Bing—a Spirit Awakening Rank 9 expert—to offer a 'clean death' because he was terrified of what would happen if the "
        "frontier army learned he had murdered their prince. The power gap between Luan's Mortal Refinement cultivation and "
        "Zhao Bing's Spirit Awakening rank remains, but Luan's strategic mind has already bridged the gap. Luan stares down "
        "the eunuch and says: 'My father is afraid of me. I think I'll live instead.' Zhao Bing's serene smile finally cracks, "
        "revealing the cold killer beneath. A twist: Zhao Bing realizes Luan has deduced the political leverage of the frontier, "
        "making Luan a far more dangerous opponent than the emperor anticipated."
    ),
    9: (
        "The moment Luan decides to live, something ancient and divine awakens inside him. The air crackles with azure sparks. "
        "A translucent blue-and-gold interface materializes before his eyes alone—ancient script writing itself across his vision. "
        "The Heavenly Rebellion System has activated. The system's voice thunders in his mind, announcing his deviation from fate: "
        "'Fate deviation confirmed. Original fate: death by poison. New fate trajectory: UNWRITTEN.' The system grants Luan an "
        "initial reward: Cultivation Breakthrough Catalyst and Soul Tempering, along with a mission: Survive the Next Ten Minutes. "
        "Luan is stunned by this sudden change in power dynamics. The power gap between a Mortal Refinement cultivator and a "
        "Spirit Awakening expert is about to be bridged by a divine cheat. A twist: the system notes that the emperor's golden poison "
        "vial actually contained a tracking curse, and by refusing to drink it, Luan has triggered an immediate alarm in the capital."
    ),
    10: (
        "The system presents Luan with two clear paths. Around him, the world slows to a crawl, the torches frozen in mid-flicker. "
        "Path A represents Submission: consume the poison, preserve his legacy, and spare his army immediate retaliation, with a "
        "34% subordinate survival rate. Path B represents Rebellion: refuse the decree, resist, and trigger a continental civil "
        "conflict, with a personal survival probability of 12% that rises with cooperation. Luan studies the paths. A 12% survival "
        "rate is better than the odds he faced at Iron Pass. With a sharp, defiant smile, Luan chooses rebellion. The system "
        "updates his survival probability to 18% based on his audacity. The power gap between a single prince and an empire is "
        "immense, but Luan's choice sets the cosmos on a new path. A twist: the system reveals that Path A's 34% survival rate was "
        "actually a lie manufactured by the Emperor's court; the true rate was 0%, as the Emperor had already signed a secret order "
        "to purge the entire Yuno City garrison."
    ),
    11: (
        "For one honest moment, Luan considers the safe path. Not out of fear, but out of the general's habit of weighing every cost. "
        "If he dies, his men might live. But Luan knows the court's hypocrisy. He imagines Wei Bolong's face when the emperor "
        "inevitably purges the frontier army anyway. He imagines the next incompetent prince sent to command them, and the winters "
        "of starvation that would follow. Luan realizes a dead guardian cannot protect anyone. The power level of his resolve "
        "solidifies. He will not submit. The power gap between his small garrison and the imperial capital's millions is terrifying, "
        "but his duty to his men outweighs his duty to a corrupt father. A twist: Luan's inner reflection allows the system to "
        "detect his true 'Dragon Heart,' unlocking a hidden passive trait that increases his resistance to imperial suppression."
    ),
    12: (
        "The calculation is complete. Luan straightens, the decision settling into him like a sword in its scabbard. He looks at "
        "Zhao Bing with the eyes of a sovereign. He tells the hall that what he is about to do cannot be undone, offering his men "
        "the chance to leave without grudge. Not a single soldier moves. Luan turns to Zhao Bing and says: 'Eunuch Zhao. Return "
        "to the capital. Tell my father that his third son received his decree... and found it wanting.' Zhao Bing's smile vanishes "
        "entirely, replaced by cold calculation. The power gap between the two men remains, but Luan is no longer a piece on the "
        "emperor's board. A twist: the Yuno City guard captain quietly signals his archers to target the imperial escorts, sealing "
        "their commitment to rebellion."
    ),
    13: (
        "Luan takes the jade vial from Zhao Bing's hand and hurls it against the stone floor. It shatters. The golden poison spreads "
        "across the rock, evaporating in a thin, toxic mist. The sound of breaking jade echoes like a war drum. Instantly, the thirty "
        "imperial guards draw their golden swords. Wei Bolong roars to the soldiers to protect the prince, and the guard captain orders "
        "the seizure of the 'traitor.' Luan draws his own sword, declaring that today ends differently. The power level of the room "
        "skyrockets as both sides prepare for a lethal clash. The power gap between the elite guards and the frontier veterans is about "
        "to be tested in blood. A twist: the shattered jade vial's mist is actually toxic to low-level cultivators, but Luan's "
        "newly activated system neutralizes the poison around him, while the imperial guards begin to choke."
    ),
    14: (
        "The Heavenly Rebellion System delivers its first true gift. The Breakthrough Catalyst floods Luan's meridians like a river "
        "breaking a dam. Ten years of compressed cultivation, held back by the mental chains of filial duty, suddenly has no ceiling. "
        "His spiritual energy erupts, cracking the stone floor. The system alerts him of his rapid realm advancement: Mortal Refinement "
        "Peak to Spirit Awakening Rank 1, then Rank 2, and stabilizing at Rank 3. Wei Bolong staggers back from the pressure wave, "
        "and Zhao Bing stumbles in genuine alarm, wondering if Luan had been suppressed at the Emperor Realm. Luan stands at the center "
        "of the sapphire-blue energy storm, awed by the power he has held back. The power gap between Luan and Zhao Bing (Rank 9) has "
        "shrunk dramatically. A twist: Luan's breakthrough instantly shatters the imperial suppression talisman Zhao Bing was hiding."
    ),
    15: (
        "The erupting sapphire energy takes the shape of a translucent azure dragon. The torches in the hall blow out and reignite "
        "with supernatural blue flames. The thirty imperial guards are thrown off their feet by the shockwave, and Zhao Bing himself "
        "is pressed to his knees by the spiritual pressure. Zhao Bing crawls in terror, unable to believe a frontier prince could wield "
        "such force. Wei Bolong grins, laughing that he always knew Luan was holding back. Luan offers Zhao Bing one chance to leave "
        "alive, but the eunuch reaches for his sleeve, whispering that he cannot return empty-handed. The power gap has shifted; "
        "Luan at Spirit Awakening Rank 3, boosted by the system, now exerts pressure that rivals a Rank 9 cultivator. A twist: the "
        "blue dragon energy begins to repair Luan's ancient meridian blockage, unlocking his true speed."
    ),
    16: (
        "Zhao Bing's hand blurs. Thirty-six poison needles launch from his sleeve—a deadly technique requiring Spirit Awakening Rank 9 "
        "to execute at full speed. The needles arc toward Luan's throat, eyes, and joints. Zhao Bing whispers: 'Forty years, boy. "
        "I have killed seventeen princes. Forgive me.' Wei Bolong shouts in panic, too far away. The system instantly activates the "
        "Soul Tempering reward, augmenting Luan's reflexes tenfold and completing a trajectory analysis within a 0.3-second response "
        "window. In the slowed reality of combat time, Luan sees all thirty-six needles. The power gap in speed is bridged by the system's "
        "reflex augmentation. A twist: the needles are coated in a rare soul-corrupting toxin that can bypass spiritual shields, "
        "making physical deflection Luan's only hope."
    ),
    17: (
        "Luan's sword moves in a blur, deflecting all thirty-six needles in a single, fluid arc. The needles clatter across the stone. "
        "In the same motion, Luan closes the distance to Zhao Bing. The eunuch backs away, drawing a thin poison blade, shocked by Luan's "
        "speed. Luan tells him: 'You said you've killed seventeen princes. I've killed forty-seven enemy generals. Did the emperor "
        "mention that?' Zhao Bing lunges desperately, but Luan steps inside the strike, his blade moving in the brutal Frontier Style. "
        "The power gap in combat experience is clear; Zhao Bing is an assassin, but Luan is a soldier who has survived a decade of war. "
        "A twist: Luan's strike utilizes a hidden wind-alignment technique granted by the system, making his blade completely silent."
    ),
    18: (
        "Luan's sword finds the single gap in Zhao Bing's cultivation technique—the brief reset between his Void Step blinks. "
        "The blade drives home with the full weight of Spirit Awakening Rank 3 energy. Zhao Bing, the emperor's poison blade, sinks to "
        "his knees. He coughs, offering a look of professional respect: 'Good strike. You found the gap.' Luan tells him he served "
        "his emperor faithfully. Zhao Bing warns him that the emperor will send far more than needles next time, before dying. "
        "The hall goes completely silent. The power level of the emperor's chief assassin was high, but Luan's tactical brilliance "
        "and system-guided strike proved lethal. A twist: as Zhao Bing dies, a small communication talisman on his chest flashes, "
        "transmitting his final moments directly to the emperor's shadow network."
    ),
    19: (
        "Luan withdraws his sword. The thirty imperial guards remain motionless, their purpose shattered. Slowly, the frontier soldiers "
        "drop to one knee, a wave of loyalty spreading through the hall. Wei Bolong is the first, planting his spear and offering his life. "
        "The soldiers roar Luan's name. The imperial guard captain slowly kneels, stating that their message has been declined, and commands "
        "his men to sheathe their weapons. Luan looks at the sea of kneeling men, commands them to rise, and tells them that what comes "
        "next, they face standing. The power gap between a rebel prince and the throne has been bridged by the absolute loyalty of "
        "ten thousand veterans. A twist: the imperial guards decide to join Luan's rebellion, bringing critical intelligence about "
        "the capital's defenses."
    ),
    20: (
        "Wei Bolong calls for a torch and heats a blade. In the ancient frontier tradition, the soldiers seal their oath with fire and "
        "blood, speaking their names into the flame until midnight. Luan listens to every one of the ten thousand voices. Wei Bolong "
        "asks who follows Luan into treason and glory, and the army roars their consent. Luan swears on the graves of their fallen "
        "brothers that he will not waste what they have given him. Wei Bolong asks what they do now, and Luan looks south toward the capital: "
        "'Now? We build something worth fighting for.' The power level of their united rebellion is born. A twist: the blood spilled "
        "on the heated blade triggers an ancient resonance in Luan's dragon bloodline, revealing the first map of the Dragon Emperor's "
        "lost tombs."
    ),
    21: (
        "Dawn breaks, and three frontier scouts arrive at full gallop, their horses foaming. Their news destroys the celebratory mood: "
        "the Northern Coalition has mobilized seventeen banners, numbering over two hundred thousand men. Wei Bolong is shocked by the "
        "scale. Luan realizes someone sent a fast bird north before the gates closed, alerting the coalition to their rebellion. "
        "He commands Wei Bolong to gather the war council. The power level of the coalition represents a continental threat, and the "
        "power gap between Luan's ten thousand men and the coalition's massive host is terrifying. A twist: the scout reports that the "
        "coalition is led by a mysterious general wielding dark spiritual Qi, suggesting imperial collusion."
    ),
    22: (
        "The intelligence is confirmed: the Northern Coalition has mobilized three hundred thousand soldiers, sixty thousand cavalry, "
        "and massive war machines. Lin Qiuyue, a beautiful strategist in grey robes, appears from the shadows of the war room. "
        "She explains that the coalition was waiting for a crack in the empire's attention, and Luan's rebellion gave them the perfect "
        "excuse. Luan asks who she is, and she introduces herself, explaining she predicted this three months ago. She uses Phantom "
        "Step to move unseen. The power level of her intellect matches Luan's tactical mind. A twist: Lin Qiuyue reveals she is actually "
        "the daughter of a disgraced imperial general whom the emperor executed, giving her a shared motive for rebellion."
    ),
    23: (
        "Luan climbs the western watchtower at noon. The northern horizon is dark, filled with a forest of enemy flags moving south "
        "like a tide. Wei Bolong admits he has never seen so many men. Luan recalls holding against a hundred thousand at Iron Pass, "
        "but Wei Bolong reminds him they had imperial reinforcements then. Luan replies they will just have to be better. The power gap "
        "between the two armies is thirty to one. To survive, Luan must utilize the system and the terrain to their absolute limits. "
        "A twist: Luan spots a group of high-level cultivators flying above the coalition vanguard, indicating the enemy has spiritual "
        "experts capable of bypassing Yuno City's physical walls."
    ),
    24: (
        "By evening, the coalition vanguard is close. Lin Qiuyue identifies each banner, detailing their tactics, weaknesses, "
        "and pride. She describes General Kuro Han of the Wushan Kingdom as a cautious commander who favors encirclement, and General "
        "Temur of the Grassland Coalition as an aggressive cavalry specialist who cannot ignore an insult. However, she notes a "
        "mysterious golden banner in the center that wasn't in any intelligence report, causing her concern. The power level of this "
        "unknown commander is a dangerous variable. A twist: Lin Qiuyue deduces that the golden banner belongs to the Crown Prince, "
        "Luan's eldest brother, who has allied with the northern enemies to ensure Luan's destruction."
    ),
    25: (
        "Luan spends the night surveying the terrain with Lin Qiuyue and Wei Bolong. By dawn, he has positioned supply caches and "
        "established three concealed cavalry positions. Lin Qiuyue watches him work in silence before noting that he has already "
        "planned six counterattacks. Luan replies that a plan is just a question, and the battlefield is the answer. Lin Qiuyue "
        "realizes Luan does not fit any of her strategic models. The power level of Luan's military genius begins to close the "
        "power gap against the coalition. A twist: Luan reveals he has discovered an ancient, subterranean defensive tunnel system "
        "beneath the valley, which they can use to ambush the enemy vanguard."
    ),
    26: (
        "The war council debates for three hours. Half want to withdraw south, while the others want a blind strike. Lin Qiuyue lets "
        "them argue, and Luan listens silently before declaring they will force the coalition to fight on their terms at Serpent Throat "
        "Pass. He asks Lin Qiuyue to explain the plan. The pass is a narrow gorge where the coalition's numbers will become a liability. "
        "The power gap will be neutralized by the narrow terrain. A twist: one of Luan's generals is secretly sending messages to the "
        "coalition, but Lin Qiuyue has already intercepted the communication and is using it to feed the enemy false information."
    ),
    27: (
        "Lin Qiuyue's plan is elegant: channel the coalition through the pass and strike their cavalry on the flanks. However, General "
        "Feng objects that the coalition will simply bypass the pass through Redstone Valley. Lin Qiuyue reveals she has already "
        "positioned two thousand cavalry there to create a 'problem' using pine resin and engineers. Luan approves. The power level "
        "of Lin Qiuyue's foresight proves invaluable. A twist: the 'problem' in Redstone Valley involves creating a massive, controlled "
        "landslide that will block the valley and force the coalition vanguard directly into the Serpent Throat Pass trap."
    ),
    28: (
        "At midnight, Luan reviews the system's new missions in his tent. The Heavenly Rebellion System offers major rewards: "
        "Frontier Sword Style Advanced Manual for surviving the siege, a Cultivation Breakthrough for defeating a higher-realm expert, "
        "and a Legendary Weapon for winning against 10:1 odds. Luan notes the odds are 30 to 1, and the system replies it is watching "
        "with interest. The power level of these rewards represents Luan's path to absolute strength. A twist: the system warning "
        "flashes that a high-level assassin from the capital has entered Yuno City, sent to eliminate Luan before the battle begins."
    ),
    29: (
        "Luan trains alone in the moonlit courtyard, practicing the advanced sword forms and pushing his Spirit Awakening cultivation "
        "to its limit. Wei Bolong watches, urging him to rest. Luan replies he has catching up to do after years of holding back. "
        "Wei Bolong lies down in the doorway to act as a sparring partner. The power level of Luan's dedication is clear; he is "
        "closing the power gap through relentless effort. A twist: during his training, Luan's sword Qi accidentally uncovers an "
        "ancient array carved into the courtyard stones, which begins to feed spiritual energy directly into his meridians."
    ),
    30: (
        "During his training, Luan's ancient meridian blockage clears under the pressure of cultivation. His power explodes, "
        "jumping from Spirit Awakening Rank 3 to Rank 5 in a single night. The system reports a 340% increase in combat power. "
        "Wei Bolong is jolted awake by the shockwave, demanding a warning next time. Luan realizes he needs a better sword. "
        "The power gap between Luan and the enemy commanders has shrunk significantly. A twist: the sudden breakthrough wave "
        "involuntarily triggers the ancient courtyard array, activating a defensive barrier around the inner fortress."
    ),
    41: (
        "News of Yuno City's survival against three hundred thousand men spreads across the continent. Foreign kings and war rooms "
        "ask who Luan is and what he wants. A foreign king reads the report in awe, demanding to meet Luan before he becomes an enemy. "
        "The power level of Luan's faction is now recognized globally, changing the geopolitical balance. A twist: the emperor, "
        "furious at the coalition's defeat, announces a massive bounty on Luan's head and mobilizes the imperial shadow network."
    ),
    47: (
        "Lin Qiuyue formally joins Luan's faction as Grand Strategist, demanding no salary but reserving the right to leave if "
        "Luan becomes a tyrant. Luan agrees with a rare smile. The power level of their alliance is solidified, combining Luan's "
        "military force with Lin Qiuyue's unmatched intellect. The power gap between their rebel forces and the imperial court is "
        "now bridged by strategic supremacy. A twist: Lin Qiuyue presents Luan with a secret ledger detailing the corrupt "
        "cultivation resources hidden in the imperial capital."
    ),
    56: (
        "Inside ancient ruins, a jade sarcophagus splits open to reveal the Dragon Emperor Arts scroll, sealed for a thousand years. "
        "An ancient spirit notes that forty-seven predecessors failed to survive the dragon's judgment. Luan kneels, accepting the "
        "inheritance. The power level of this ancient technique will multiply his combat power tenfold, completely erasing the "
        "power gap between Luan and the capital's high-level experts. A twist: the ancient spirit reveals that Luan is the direct "
        "descendant of the First Dragon Emperor, making his rebellion a reclamation of his birthright."
    ),
    68: (
        "The Battle of Ten Thousand Peaks clashes Luan's three hundred thousand soldiers against the empire's one million. "
        "Luan, wielding the Dragon Emperor Arts at Sky Profound Realm, faces Emperor Longwei's forbidden techniques. The emperor "
        "accuses Luan of betrayal, but Luan replies he is returning the favor, ordering his army forward. The power level of the clash "
        "shakes the heavens, with the power gap between the two forces tested in a devastating struggle. A twist: Luan's system "
        "activates a battlefield-wide aura that suppresses the corrupted Qi of the imperial forces, turning the tide of the battle."
    ),
    80: (
        "The gates of the imperial capital are opened from within by the citizens, who trust Luan's promise of no looting or vengeance. "
        "Imperial soldiers weep as the gates swing wide, and Luan enters at the head of his victorious army. The power level of Luan's "
        "moral authority proves stronger than the city's walls. The power gap between the old corrupt empire and Luan's new order has "
        "collapsed. A twist: Luan discovers that the emperor has fled to the inner sanctum, preparing a forbidden ritual to sacrifice "
        "the capital's citizens for a final power surge."
    ),
    83: (
        "Emperor Longwei stands in the imperial throne room, his golden robes trembling. Having burned his lifespan for power, "
        "his cultivation reaches Emperor Realm Rank 4. He unleashes a torrent of dark golden energy, desperate to destroy his son. "
        "The power level of the emperor is immense, creating a massive power gap between him and Luan's regular generals. Luan steps "
        "forward alone, his dragon aura flaring. A twist: the emperor reveals that the system Luan possesses was actually created "
        "by the First Dragon Emperor to find a worthy successor to destroy the corrupt throne."
    ),
    90: (
        "Father and son clash in the final battle of the empire. The throne room is destroyed by the impact of their spiritual techniques. "
        "The emperor uses Dragon Vein Suppression, but Luan's dragon bloodline resists the technique, his blade slicing through the "
        "emperor's defenses. The power level of their duel is legendary, with the power gap closing as Luan's determination outlasts "
        "the emperor's desperate fury. A twist: the emperor's golden throne is revealed to be a suppression seal holding back an "
        "extra-dimensional portal."
    ),
    91: (
        "The emperor's cultivation collapses as his burned lifespan runs out mid-technique. He falls defeated, his golden robes "
        "stained with blood. He looks at Luan, admitting his fear was justified, before turning to dust. The power level of the old "
        "empire is officially extinguished. A twist: the emperor's death automatically triggers the opening of the extra-dimensional "
        "portal hidden beneath the throne, releasing a surge of celestial energy."
    ),
    95: (
        "The court kneels before Luan, offering him the throne. Luan refuses, declaring he will not be a tyrant in a golden cage. "
        "He establishes a council to govern the people, choosing to remain a guardian rather than a ruler. The power level of Luan's "
        "character reaches its peak, demonstrating true leadership by refusing absolute power. A twist: the system rewards his "
        "refusal of the throne by unlocking the ultimate transcendence path."
    ),
    99: (
        "The Heavenly Rebellion System reveals its final purpose: it was a test to find a cultivator strong enough to ascend and "
        "protect the continent from celestial invaders. The extra-dimensional portal opens wide, revealing the celestial realm. "
        "The system prepares Luan for his final ascension. The power level of Luan reaches the transcendent boundary. A twist: "
        "the system reveals that the celestial invaders are led by the ancient ancestors of the imperial family who abandoned the "
        "continent centuries ago."
    ),
    100: (
        "Luan Tianlong, the Dragon Emperor, takes his first step through the glowing celestial portal. His companions, Wei Bolong "
        "and Lin Qiuyue, watch as he ascends to protect their world from the heavens. The portal closes, leaving a peaceful continent "
        "behind. Luan's legacy is sealed. The ultimate power level is achieved. A final twist: the system interface vanishes, leaving "
        "Luan with his own fully realized, transcendent strength as he faces the celestial heavens."
    )
}
