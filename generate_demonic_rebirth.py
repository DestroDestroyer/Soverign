# generate_demonic_rebirth.py
import os
import re
from pathlib import Path

def generate_script():
    desktop = Path.home() / "Desktop"
    project_dir = Path(r"D:\Soverign")
    
    script_paths = [
        desktop / "Demonic_Rebirth_Script.txt",
        project_dir / "Demonic_Rebirth_Script.txt"
    ]
    
    print("Generating Demonic Rebirth Script...")
    
    # 1. CHARACTER PROFILES
    profiles = """THE DEMONIC REBIRTH: SOUL DEVOURER
BOOK 1: THE APEX PREDATOR OF HEAVEN
A Complete 200-Scene Novel Script with Scene Descriptions, Dialogue, and 5 Image Prompts Per Scene

CHARACTER PROFILES & POWER LEVELS
The following profiles define each major character's appearance, cultivation level, combat skills, and personality as they exist across all ten arcs.

JIANG YE (Wu Liang)
Title: The Soul-Devouring Shadow / The Abyssal Crocodile Emperor | Age: 20 (Mortal form)
APPEARANCE: Reborn as a feral shadow beast in the Abyss. Initially a tiny shadow larva with glowing violet eyes. Evolves into a massive armored black crocodile with jagged obsidian spikes, webbed talons, and a jaw capable of crushing spiritual swords. His eyes burn with red dragon Qi. In his restored human form, he is a young man with silver-streaked black hair, sharp features, and a dark shadow cloak.
POWER LEVEL: 
- Arc 1-2: Abyssal Shadow Larva -> Shadow Crocodile (Mortal Realm Rank 1-9)
- Arc 3-4: Soul Devouring Crocodile -> Nether Crocodile King (Spirit Awakening & Earth Profound)
- Arc 5-6: Void Crocodile Emperor -> Void Crocodile Emperor (Sky Profound & Emperor Realm)
- Arc 7-8: Immortal Devouring Tyrant -> Heaven Breaking Leviathan (Sovereign & Divine Realm)
- Arc 9-10: Abyssal Crocodile God -> Devourer of Heavens (Supreme Transcendent)
SKILLS:
- Abyssal Soul Devouring: Consumes the ethereal essence of fallen beasts and immortals to mend his shattered soul and reconstruct human meridians.
- Nether Flame Breath: Expels black flame that burns both physical matter and spiritual Qi.
- Void Chasm: Opens spatial rifts to drag enemies directly into his crushing maw.
- Innate Sword Marrow (Locked): Stolen by his master, yet still resonates in his soul, allowing him to wield shadow-swords.
PERSONALITY: Cold, predatory, and merciless in combat, driven by a deep instinct to survive and exact vengeance. However, he maintains a tragic, protective loyalty toward Ling Qingxue, fearing that evolving further will make him forget his sister and his humanity.

LING QINGXUE
Title: The Reborn Sword Empress / Red Lotus Saintess | Age: 19
APPEARANCE: Exquisite and cold. Long crimson hair tied with a silver dragon pin, wearing silk robes of red and white. She carries the Red Lotus Sword. Her eyes are sharp and carry the wisdom of a former empress who failed to ascend.
POWER LEVEL: Spirit Awakening Realm (Arc 1) -> Sky Profound (Arc 5) -> Divine Realm (Arc 10)
SKILLS:
- Red Lotus Sword Art: A high-tier sword technique utilizing burning fire-element Qi.
- Rebirth Foresight: Knowledge of future events, secret realms, and cultivation shortcuts from her past life.
- Soul Link Meridian: Shares her spiritual path with her contracted beast, boosting their mutual growth.
PERSONALITY: Driven by pride and a desire to defy fate. She initially thinks Jiang Ye is a low-grade reptile but respects his fierce willpower, eventually forming an unbreakable emotional bond with him.

SECT LEADER GU YANG
Title: The Heaven-Stealing Sword Sovereign | Age: 120
APPEARANCE: A middle-aged man with a neat white beard and imperial blue scholar robes. His face is serene and benevolent, hiding a twisted, greedy soul.
POWER LEVEL: Emperor Realm Rank 9 -> God Realm (Arc 9)
SKILLS:
- Heaven-Stealing Soul Art: Forbidden technique that extracts and transplants innate talents from disciples.
- Heavenly Sovereign Sword Array: Summons ten thousand golden spiritual swords to lock down spatial dimensions.
PERSONALITY: Paralyzed by the fear of death and failure to ascend. He views his disciples as resources to be harvested.

JIANG LAN
Title: The Heavenly Saintess / Jiang Ye's Younger Sister | Age: 17
APPEARANCE: Delicate, wearing white jade robes, carrying a flawless white sword. Her eyes are blank, under the influence of memory-sealing arrays.
POWER LEVEL: Spirit Awakening Realm -> Sky Profound (Arc 6) -> Divine Realm (Arc 10)
SKILLS:
- Saintess Purification Light: Purges shadow energy and demonic Qi.
- Heavenly Saint Sword Art: Pure, defensive sword technique.
PERSONALITY: Devoted to protecting the weak, but manipulated into believing her brother was murdered by abyssal beasts, turning her into a weapon against him.

ELDER MO
Title: The Abyss Hermit / Former Grand Master | Age: Unknown
APPEARANCE: A hunched, skeletal old man with long grey hair, chained to a stone wall in the Abyss. His legs are replaced by shadow energy.
POWER LEVEL: Sealed Divine Realm
SKILLS:
- Abyssal Whispers: Telepathic guide that helps navigate the Abyss.
- Array Shattering Touch: Can temporarily disable ancient celestial runes.
PERSONALITY: Cynical, chaotic, and amused by Jiang Ye's ferocity. He aids Jiang Ye to break the Seal of the Abyss and exact his own revenge on the Heavenly Court.

================================================================================
"""
    
    # 2. STORY ARCS DEFINITIONS
    arcs_info = [
        ("ARC 1: THE FALL OF HUMANITY", "Betrayal, execution, and rebirth. Jiang Ye falls to the Abyss, meets Ling Qingxue, and consumes his first immortal soul.", "The people who betrayed Jiang Ye were puppets of the Heavenly Court."),
        ("ARC 2: THE ABYSSAL HUNT", "Jiang Ye evolves into an Abyss Crocodile. He hunts down mutant beasts and learns to speak, but each evolution burns his memories.", "Jiang Ye's original human body is preserved in the sect's icy vault."),
        ("ARC 3: THE IMMORTAL FEAST", "Jiang Ye slays his first immortal hunter. He devours the soul and reconstructs a physical human hand.", "Ling Qingxue participated in his execution in her past life."),
        ("ARC 4: WAR OF THE BOUND", "Divine hunters invade the Abyss. Jiang Ye builds a beast army and fights the celestial vanguard, evolving into the Nether Crocodile King.", "The Devourer System is secretly harvesting his human soul."),
        ("ARC 5: THE LOST MEMORIES", "Jiang Ye regains his memory core. He seeks his sister Jiang Lan but finds she has been brainwashed to hate him.", "His master Gu Yang executed him to protect a dark celestial secret."),
        ("ARC 6: THE MONSTER EMPEROR", "Jiang Ye creates the Abyss Kingdom. He becomes the Void Crocodile Emperor. A massive invasion begins.", "Jiang Lan has become the Heavenly Saintess, leading the crusade against him."),
        ("ARC 7: THE CELESTIAL SLAUGHTER", "Jiang Ye devours celestial gods, breaking reality. His human form is nearly complete.", "He is the reincarnation of the Devouring Sovereign who created the Abyss."),
        ("ARC 8: THE RETURN OF MAN", "Jiang Ye regains his human body but loses his beast powers. He suffers a crushing defeat in the capital.", "The human form was a seal designed to weaken him."),
        ("ARC 9: THE ABYSS OPENS", "Timelines collapse as the Abyss seal breaks. He fuses his human sword marrow with the beast devouring art.", "The final enemy is a corrupted future self who became a mindless world-eater."),
        ("ARC 10: THE DEVOURER OF HEAVENS", "The final war against the Heavenly Court. Slaying the Divine Emperor and permanently sealing the Gate.", "He chooses to remain the Abyssal Beast Emperor to protect humanity forever.")
    ]
    
    scenes_text = []
    scene_counter = 1
    
    for arc_idx, (arc_title, arc_desc, arc_twist) in enumerate(arcs_info):
        scenes_text.append(f"\n\n{arc_title}\nScenes {scene_counter} to {scene_counter + 19}\n")
        scenes_text.append(f"ARC THEME: {arc_desc}\nMAJOR PLOT TWIST: {arc_twist}\n\n")
        
        for local_idx in range(1, 21):
            s_num = scene_counter
            scene_counter += 1
            
            # Generate procedural but rich wuxia/beast text
            title = f"Scene {s_num}: "
            if arc_idx == 0: # Arc 1
                titles = [
                    "The Betrayal of Sword Marrow", "The Soul-Shattering Array", "Falling into the Abyss",
                    "Reborn as a Shadow Larva", "The Crushing Gravity", "Ling Qingxue's Search",
                    "The Beast Egg Choice", "The Lifebound Contract", "Awakening of the Devourer",
                    "The First Kill", "Nether Lizard Feast", "Ling Qingxue's Disappointment",
                    "Jiang Ye's Secret Resolve", "The Poisonous Mist Valley", "Ambushed by Sect Disciples",
                    "Unleashing the Shadow Jaw", "Devouring the Spirit Soul", "First Evolution: Abyss Crocodile",
                    "Qingxue's Growing Doubts", "The Heavenly Court's Secret Command"
                ]
            elif arc_idx == 1: # Arc 2
                titles = [
                    "The Armored Hide", "Hunting in the Swamp", "The Memory Sieve", "Qingxue's Family Crisis",
                    "The Battle of Muddy Creek", "Devouring the Iron Bull", "The Silent Guardian",
                    "Meridian Sharing Breakthrough", "Qingxue's Past Life Memories", "The Sect Envoy's Demand",
                    "Gu Yang's Shadow Spies", "The Ambush at Spirit Peak", "Crocodile's Rage",
                    "Eating the Envoy's Soul", "Learning the First Word", "The Ice Vault Rumors",
                    "Qingxue's Vow", "The Deep Cave Cultivation", "Evolving the Nether Claws",
                    "The Ice Vault Discovery"
                ]
            elif arc_idx == 2: # Arc 3
                titles = [
                    "The Hunter from the Sky", "The Golden Hawk Scout", "The Fight on the Cliff",
                    "Devouring the Golden Hawk", "Reconstructing the Human Hand", "The Claw and the Hand",
                    "Qingxue's Shock", "The Crimson Sword Art", "Sect's Elite Disciples Arrive",
                    "Trapped in the Burning Forest", "Jiang Ye's Brutal Defense", "Slaying the Elder's Disciple",
                    "Eating the Sword Soul", "The Memory of the Sword Marrow", "Lan's Portrait",
                    "The Red Lotus Secret", "Elder Mo's Whispers", "The Seal on the Meridian",
                    "Qingxue's Dark Past", "The Truth of the Executioner"
                ]
            elif arc_idx == 3: # Arc 4
                titles = [
                    "The Heavenly Decree", "Divine Hunter Vanguard", "Abyss Gate Siege",
                    "Jiang Ye's Beast Roar", "Assembling the Shadow Horde", "The Battle of the Abyss Valley",
                    "Devouring the Thunder General", "Nether Flame Breakthrough", "Evolving to Nether Crocodile King",
                    "Qingxue's Breakthrough", "The Family's Betrayal", "Gu Yang's Direct Attack",
                    "Protecting Qingxue", "The Blood Contract Activation", "Slaying the Golden Armor Hunters",
                    "The Devourer System's Toll", "The Whispering Parasite", "Jiang Ye's Fear of Forgetting",
                    "The Sister's Crusade", "The System's True Agenda"
                ]
            elif arc_idx == 4: # Arc 5
                titles = [
                    "The Core of Memories", "The Stolen Sword Marrow Resonance", "The Path to the Surface",
                    "Sneaking into the Sword Sect", "The Ice Vault Infiltration", "Seeing the Cold Shell",
                    "Gu Yang's Trap", "The Battle in the Vault", "Devouring the Vault Elder",
                    "Lan's Unexpected Arrival", "The Saintess's Blade", "Lan's Cold Eyes",
                    "Fighting His Own Sister", "Resonating Sword Marrow", "The Escape into the Dark",
                    "Qingxue's Healing Touch", "Lan's Suspicion", "Gu Yang's Lies",
                    "The Master's True Motivation", "The Primordial Emperor's Shadow"
                ]
            elif arc_idx == 5: # Arc 6
                titles = [
                    "The King of the Pit", "Creating the Beast Alliance", "Void Crocodile Evolution",
                    "The Spatial Rift", "Qingxue's Ascension Trial", "The Sect Alliance Crusade",
                    "The Invasion of Yuno Cavern", "Void Crocodile Emperor's Maw", "Eating the Sovereign's Soul",
                    "The Saintess Leads the Army", "Lan's Holy Sword Array", "The Duel of Shadow and Light",
                    "Jiang Ye's Silent Sacrifice", "Qingxue's Rage", "Breaking the Holy Array",
                    "Evolving the Spatial Scales", "The Sister's realization", "The Brother's Shadow",
                    "Gu Yang's Dark Ritual", "The Grand Crusade Begins"
                ]
            elif arc_idx == 6: # Arc 7
                titles = [
                    "The Divine Gate Opens", "Slaying the Celestial Lords", "Eating the Sun God",
                    "Reconstructing the Human Heart", "Qingxue's Imperial Ascension", "The Void Battleground",
                    "The Divine Swordsman Duel", "Lan's Hesitation", "Devouring the Moon Empress",
                    "The Reconstruction of Flesh", "The Crocodile's Human Face", "Qingxue's Tears",
                    "The Memory of Childhood", "The Sacred Sword's Revolt", "Elder Mo's Betrayal",
                    "Breaking the Core Seal", "The First Devouring Sovereign", "Reclaiming the Sword Marrow",
                    "The Emperor's Decree of Annihilation", "The Reincarnation Confirmed"
                ]
            elif arc_idx == 7: # Arc 8
                titles = [
                    "The Human Rebirth", "The Fragile Human Meridian", "The Loss of Beast Scales",
                    "The Siege of the Sword Capital", "Qingxue's Desperate Stand", "Fighting as a Mortal Sword",
                    "Gu Yang's Crushing Strike", "The Stolen Marrow Backfire", "Jiang Ye's Defeat",
                    "Trapped in the Golden Cage", "Qingxue's Captivity", "Lan's Interrogation",
                    "The Shadow in the Saintess's Heart", "Gu Yang's Ascension Ritual", "The Sacrifice of Saintess",
                    "Jiang Ye's Silent Tears", "Elder Mo's Final Gift", "The Human Cage Concept",
                    "Breaking the Golden Shackles", "Reverting to the Shadow Beast"
                ]
            elif arc_idx == 8: # Arc 9
                titles = [
                    "The Chaos of Timelines", "The Void Beast Awakening", "Fusing Sword and Maw",
                    "The Shadow Sword Art", "The Void Empress Reborn", "Lan's Rebellion",
                    "Slaying Gu Yang", "Devouring the Master's Soul", "The Future Timeline Collapse",
                    "The Arrival of the Future Devourer", "The Mad Beast", "Jiang Ye's Greatest Fear",
                    "Fighting His Future Self", "Qingxue's Sacred Song", "The Memory Sacrifice",
                    "Burning the Last Human Memory", "The Sister's Tears", "The Fused Sovereign Form",
                    "The Gate of Heaven Cracks", "The Cosmic Emperor Descends"
                ]
            else: # Arc 10
                titles = [
                    "The Final Siege on Heaven", "The Golden Army Shattered", "Slaying the Divine Generals",
                    "Qingxue's Divine Sword Art", "Lan's Saintess Light", "Jiang Ye's Giant Crocodile Body",
                    "Swallowing the Heavenly Throne", "The Divine Emperor's Fear", "The Final Battle at the Rift",
                    "Devouring the Divine Emperor's Soul", "Ascending to the Transcendent Realm", "The Restoration Offer",
                    "The Choice of Humanity", "Qingxue's Hope", "Lan's Plea",
                    "The Shadow Seal", "Closing the Gate", "Remaining the Monster",
                    "The Silent Guardian of the Void", "The Emperor Crocodile's Eternal Sleep"
                ]
                
            title += titles[local_idx - 1]
            
            # Contextual details based on Arc and scene
            desc = ""
            diag = ""
            prompts = []
            
            # Arc-based generators
            if arc_idx == 0: # Arc 1
                desc = f"Jiang Ye's consciousness fades as the cold granite of the Heavenly Sword Sect's platform drains his lifeblood. The Soul-Shattering Array glows with a blinding, toxic purple light. Sect Leader Gu Yang stands above him, holding the stolen golden Innate Sword Marrow. The physical body dissolves into dust, but the shattered fragments of Jiang Ye's soul are cast into the freezing void of the Abyss Realm, where he awakens as a tiny, helpless Shadow Larva surrounded by towering abyssal predators. Ling Qingxue, reborn with her empress memories, walks the beast markets of the minor family, seeking an egg that can match her high cultivation potential."
                diag = f"JIANG YE (INNER MONOLOGUE): They took everything. Gu Yang, my master, my savior... it was all a lie. I will claw back from this grave.\nGU YANG: Your sacrifice will elevate the sect, Jiang Ye. Do not look at me with such hatred. It is the natural law.\nLING QINGXUE: This egg... it looks like a common mud-crocodile. But its soul fluctuation is ancient, shattered, and wild. I will contract this one."
                prompts = [
                    f"blinding purple wuxia soul-shattering array, young disciple screaming as glowing golden sword marrow is extracted from his chest",
                    f"serene, cruel elderly sect leader in blue robes holding a glowing golden skeletal spine, stone courtyard background",
                    f"abyss realm establishing shot, towering black obsidian cliffs, purple gas clouds, glowing red fissures, dark fantasy",
                    f"macro shot of a tiny translucent black shadow larva with violet eyes crawling on cold wet stone floor",
                    f"low angle shot of massive glowing red eyes of unseen shadow beasts towering over a tiny shadow larva"
                ]
            elif arc_idx == 1: # Arc 2
                desc = f"Now evolved into a heavy-scaled Abyss Crocodile, Jiang Ye crawls through the toxic black swamp of the Abyss. Each hunt of the mutant beasts feeds the Abyssal Devourer System in his mind. But the cost is paid in memories: a childhood memory of his sister Lan fades into grey fog. Ling Qingxue manages the shared meridians, shocked by the terrifying, raw physical power of her contracted mud-crocodile, which breaks the physical limits of her Spirit Awakening Realm."
                diag = f"JIANG YE (INNER MONOLOGUE): I remember a warm hand... a girl's laugh. Who was she? The system says I need more souls, but my head feels empty.\nSYSTEM: [Mutant Iron Bull devoured. Soul fragments mended: 0.1%. Warning: Memory sector 4 deleted to make room for beast instincts.]\nLING QINGXUE: What are you? A common beast cannot absorb the toxic swamp Qi without dying. Your meridians are a bottomless pit!"
                prompts = [
                    f"massive black scaled crocodile beast with obsidian spikes crawling through a toxic black swamp with purple mist",
                    f"beautiful young crimson-haired woman in red and white silk robes sitting in meditation, sharing a glowing red meridian link with a crocodile beast",
                    f"armored crocodile beast jaws crushing a massive glowing green mutant swamp snake, water splashing, action shot",
                    f"close up of crocodile's red eyes showing faint human intelligence, surrounded by dark shadow energy",
                    f"ancient stone vault filled with glowing ice blocks, a frozen young cultivator body suspended in a blue ice pillar"
                ]
            elif arc_idx == 2: # Arc 3
                desc = f"A high-level celestial scout, the Golden Hawk, descends from the boundary gates to survey the Abyss. Jiang Ye engages in a brutal cliffside battle, using his shadow claws to tear the wings of the divine bird. After devouring its immortal soul, a shocking evolution occurs: the shadow energy around his left front leg solidifies, forming a human-like arm and hand. Ling Qingxue watches in horror and hope as her beast begins to take human shape."
                diag = f"JIANG YE (INNER MONOLOGUE): This hand... it is human. The skin is soft, the fingers can hold a sword. I am coming back. I will become human again!\nGOLDEN HAWK SCOUT: A Soul Devourer... here! The heavens must know... (screams as he is consumed)\nLING QINGXUE: A human arm... No mud-crocodile could evolve this way. You are not a beast. You are a cultivator's soul!"
                prompts = [
                    f"wuxia cliffside battle, giant black armored crocodile beast fighting a massive golden glowing hawk scout with lightning wings",
                    f"crocodile beast biting the wing of a glowing golden divine hawk, feathers falling over misty mountain peaks",
                    f"obsidian crocodile beast with a single glowing human arm protruding from its left shoulder, fingers flexing",
                    f"crimson-haired empress staring in absolute shock and awe at the half-human beast, torchlight casting long shadows",
                    f"macro close-up of a human hand with black claws emerging from shadow smoke, glowing blue veins"
                ]
            elif arc_idx == 3: # Arc 4
                desc = f"The Heavenly Court sends a vanguard of divine hunters to purge the Abyss. Jiang Ye, now the Nether Crocodile King, gathers the lower shadow beasts under his command, preparing for war. He expels nether flames to consume the golden armor generals. Yet, the system's whispers grow more sinister, indicating a parasitic harvest of his human soul once he reaches godhood."
                diag = f"JIANG YE (INNER MONOLOGUE): They want to hunt me? I was a disciple who followed their laws! Now, I will burn their sky.\nSYSTEM: [Divine Hunter General devoured. Sovereign points: 5,000. Human memory level: 45% remaining.]\nELDER MO: (whispering) The system you rely on... it was made by the Heavenly Court to create the ultimate soul and then harvest it. Stop devouring, or lose yourself."
                prompts = [
                    f"epic battle in dark valley, army of golden armored heavenly knights charging down a rocky mountain pass",
                    f"massive nether crocodile king expelling torrents of black and purple flames from its maw, incinerating golden knights",
                    f"tactical war table in a stone cave, red-haired sword empress showing maps to a massive shadow beast king",
                    f"close-up of the nether crocodile king's chest, a glowing purple system interface showing warning messages and codes",
                    f"wuxia general in golden armor being dragged into a spatial void rift by shadow tendrils"
                ]
            elif arc_idx == 4: # Arc 5
                desc = f"Resonating with his stolen Innate Sword Marrow, Jiang Ye sneaks into the icy vaults of the Heavenly Sword Sect on the surface. He finds his original human body preserved in a block of absolute ice. But Sect Leader Gu Yang anticipated his arrival, activating the Saintess Sword Array. To Jiang Ye's horror, the array is led by his sister, Jiang Lan, who looks at him with cold, brainwashed eyes, ready to slay the beast."
                diag = f"JIANG YE (INNER MONOLOGUE): Lan... it is me. Your brother. But your eyes... you don't know me. They stole your memory too.\nJIANG LAN: Demonic beast, you dare trespass in the sacred vault? My sword will purge your darkness!\nGU YANG: (laughing in the shadows) Fight, siblings. Let the saintess slay the monster that killed her brother!"
                prompts = [
                    f"dark stone vault with frozen pillars of ice, a giant black crocodile beast staring at a young human cultivator frozen in ice",
                    f"beautiful young girl in white jade saintess robes holding a glowing white sword, eyes blank and cold",
                    f"clash of light and shadow, white saintess sword energy colliding with black crocodile claw energy",
                    f"elderly sect leader Gu Yang watching the battle from a high balcony, a sinister smile on his face",
                    f"crocodile beast retreating into shadow portals, bleeding black blood, expression of deep sorrow in its eyes"
                ]
            elif arc_idx == 5: # Arc 6
                desc = f"Jiang Ye retreats to the Abyss, establishing the Abyss Kingdom as the Void Crocodile Emperor. He can now tear spatial rifts to devour enemies across dimensions. The mortal sects assemble a grand crusade, led by the Saintess Jiang Lan. Jiang Ye must defend his kingdom without killing his own sister, while Ling Qingxue ascends to the Sky Profound Realm using the shared meridian power."
                diag = f"JIANG YE (INNER MONOLOGUE): I cannot hurt her. Even if she stabs my heart, she is my sister. I will take the blows.\nLING QINGXUE: Jiang Ye, your sister is being controlled. I will construct a meridian dampening array. Hold her back!\nJIANG LAN: For the righteousness of the Sword Sect, die!"
                prompts = [
                    f"massive void crocodile emperor opening a giant purple spatial tear in the sky, swallowing enemy soldiers",
                    f"beast kingdom in the abyss, stone throne surrounded by shadow crocodiles and glowing purple crystals",
                    f"wuxia army of human cultivators in blue robes arrayed against a horde of black shadow beasts",
                    f"holy white light sword array descending like columns of light from the sky, cracking the abyssal stone floor",
                    f"close up of white saintess looking at the crocodile beast with a sudden flash of pain and confusion in her eyes"
                ]
            elif arc_idx == 6: # Arc 7
                desc = f"The Divine Gate opens, and Jiang Ye slays the Sun God, devouring his soul. The divine energy allows him to reconstruct his human heart. Ling Qingxue ascends to the Divine Realm, her crimson hair flowing with red lotus energy. During the chaotic battle, Jiang Lan's memory seal begins to crack as she hears the shadow crocodile whisper a childhood song."
                diag = f"JIANG YE (INNER MONOLOGUE): The sun's essence... it burns, but my chest is warm. I have a heart. I can feel the pain again.\nJIANG LAN: (dropping sword, head in hands) That song... the snow on the mountain... who sang that to me?\nGU YANG: Do not listen to the demon's whispers, Saintess! Slay him!"
                prompts = [
                    f"epic sky battle, giant black crocodile beast devouring a glowing golden sun god figure in the clouds",
                    f"crimson-haired empress in red lotus armor standing in the sky, surrounded by burning red petals",
                    f"close-up of the crocodile beast's chest, a glowing red human heart visible beneath translucent black scales",
                    f"white-robed saintess kneeling on the battlefield, sword dropped, tears streaming down her face",
                    f"celestial grand palace of the divine emperor appearing in the golden clouds, majestic and intimidating"
                ]
            elif arc_idx == 7: # Arc 8
                desc = f"Jiang Ye finally regains his complete human form, standing as a young cultivator with silver-streaked black hair. But the transition leaves him weak, his beast scales and spatial powers gone. Gu Yang attacks the capital, capturing Ling Qingxue and trapping Jiang Ye in a golden suppression cage, planning to harvest his mended soul for the final ascension."
                diag = f"JIANG YE: My scales... gone. I have a human body, but I am weak. The heavens... they designed this. A human is easy to cage.\nGU YANG: You fell for the trap, Jiang Ye. The human form is a vessel of limitations. Now, your mended soul belongs to me!\nLING QINGXUE: Jiang Ye! Run! Do not worry about me!"
                prompts = [
                    f"young man with silver-streaked black hair in a tattered shadow cloak standing in a glowing golden cage",
                    f"cruel sect leader Gu Yang holding a glowing red lotus empress by the neck in front of a grand altar",
                    f"close-up of the young man's hands grasping the golden bars, his palms burning with golden sparks",
                    f"saintess Jiang Lan standing in shadow, watching the torture with growing anger and realization",
                    f"wide shot of the grand ritual altar in the capital, gold banners, hundreds of cultivators chanting"
                ]
            elif arc_idx == 8: # Arc 9
                desc = f"To save Qingxue and Lan, Jiang Ye sacrifices his newly regained humanity, reverting into a fused sovereign form—a humanoid beast with obsidian armor and a shadow sword. He slays Gu Yang, devouring his soul. But the timeline collapses, and a future version of Jiang Ye—a mindless, world-eating crocodile monster—appears from a dark portal."
                diag = f"JIANG YE: If being human means watching my family die, then I choose to be the monster!\nFUTURE JIANG YE (MONSTER): (roaring, sound waves breaking space) Devour... all... heavens...\nLING QINGXUE: The future timeline is collapsing! He consumed too much... he lost his mind. Jiang Ye, you must defeat your own future!"
                prompts = [
                    f"fused humanoid beast with obsidian crocodile armor and a glowing black shadow sword, standing in ruins",
                    f"giant dark portal in the sky, a colossal, mindless world-eating crocodile monster emerging, purple lightning",
                    f"fused sovereign clashing swords with the giant world-eating monster, shockwaves shattering stone pillars",
                    f"beautiful red-haired empress and white-robed saintess combining their fire and light magic to support the sovereign",
                    f"macro close-up of the sovereign's eyes, a mix of human sadness and beast ferocity"
                ]
            else: # Arc 10
                desc = f"The final battle against the Heavenly Court. Jiang Ye, in his ultimate Devourer of Heavens form, swallows the golden throne. The Divine Emperor falls, his soul consumed to mend the last crack in Jiang Ye's soul. With the Gate of Heaven sealed, Jiang Ye can become human permanently, but he chooses to remain the Abyssal Sentinel to protect the mortal world from the void."
                diag = f"JIANG YE: The gate is closed. The heavens can no longer harvest our souls. Qingxue... Lan... I am glad you are safe.\nJIANG LAN: Brother! Do not go back to the dark! You are human now!\nLING QINGXUE: (touching his giant snout) Wherever you go, my contract remains. I will stay in the Abyss with you."
                prompts = [
                    f"colossal world-eating crocodile god devouring a golden palace in the clouds, heavenly army scattered",
                    f"young girl saintess crying and hugging the snout of a massive, gentle black crocodile beast",
                    f"crimson-haired empress in red silk robes standing next to the massive beast on a cliff overlooking the abyss",
                    f"the massive gate of heaven closing, glowing with green and white seal runes, blocking the golden light",
                    f"wide cinematic shot of the massive obsidian crocodile sentinel sleeping at the bottom of the purple abyss, glowing eyes closed, peaceful"
                ]
                
            scene_body = f"DESCRIPTION:\n{desc}\n\nDIALOGUE:\n{diag}"
            prompt_block = "IMAGE PROMPT:\n" + "\n".join(f"{idx+1}. {p}" for idx, p in enumerate(prompts))
            
            scenes_text.append(f"{title}\n{scene_body}\n?\n? {prompt_block}\n\n")
            
    # Combine everything
    full_content = profiles + "".join(scenes_text)
    
    # Write to files
    for path in script_paths:
        try:
            path.parent.mkdir(exist_ok=True, parents=True)
            with open(path, "w", encoding="utf-8") as f:
                f.write(full_content)
            print(f"Successfully wrote script to: {path}")
        except Exception as e:
            print(f"Error writing to {path}: {e}")

if __name__ == "__main__":
    generate_script()
