export function getClientOfflineTutorResponse(userMsg: string, userProfile: any): string {
  const query = userMsg.toLowerCase().trim();

  // Robust, fully-detailed dictionary of German and English terms for direct study translation mapping
  const offlineVocab: Record<string, {
    word: string;
    meaning: string;
    plural?: string;
    pronunciation: string;
    mnemonic: string;
    example: string;
    translation: string;
    type: string;
  }> = {
    "drache": {
      word: "der Drache",
      meaning: "the dragon",
      plural: "die Drachen",
      pronunciation: "der DRAH-che",
      mnemonic: "Imagine a fire-breathing dragon wearing a 'der' guild leader hat.",
      example: "Der Drache bewacht den geheimen Gildenhort.",
      translation: "The dragon guards the secret guild hoard.",
      type: "noun"
    },
    "dragon": {
      word: "der Drache",
      meaning: "the dragon",
      plural: "die Drachen",
      pronunciation: "der DRAH-che",
      mnemonic: "Imagine a fire-breathing dragon wearing a 'der' guild leader hat.",
      example: "Der Drache bewacht den geheimen Gildenhort.",
      translation: "The dragon guards the secret guild hoard.",
      type: "noun"
    },
    "burg": {
      word: "die Burg",
      meaning: "the castle / fortress",
      plural: "die Burgen",
      pronunciation: "die BOORK",
      mnemonic: "A fort where knights eat delicious burgers (Burg) to restore their stamina!",
      example: "Die helle Burg schützt die Dorfbewohner vor Gefahren.",
      translation: "The bright castle protects the villagers from dangers.",
      type: "noun"
    },
    "castle": {
      word: "die Burg",
      meaning: "the castle / fortress",
      plural: "die Burgen",
      pronunciation: "die BOORK",
      mnemonic: "A fort where knights eat delicious burgers (Burg) to restore their stamina!",
      example: "Die helle Burg schützt die Dorfbewohner vor Gefahren.",
      translation: "The bright castle protects the villagers from dangers.",
      type: "noun"
    },
    "abenteuer": {
      word: "das Abenteuer",
      meaning: "the adventure",
      plural: "die Abenteuer",
      pronunciation: "das AH-ben-toy-er",
      mnemonic: "An adventure in the evening (Abend) is like playing with a wonderful toy (teuer - expensive/precious).",
      example: "Ein neues Abenteuer wartet im Düsterwald auf uns.",
      translation: "A new adventure awaits us in the Dark Forest.",
      type: "noun"
    },
    "adventure": {
      word: "das Abenteuer",
      meaning: "the adventure",
      plural: "die Abenteuer",
      pronunciation: "das AH-ben-toy-er",
      mnemonic: "An adventure in the evening (Abend) is like playing with a wonderful toy (teuer - expensive/precious).",
      example: "Ein neues Abenteuer wartet im Düsterwald auf uns.",
      translation: "A new adventure awaits us in the Dark Forest.",
      type: "noun"
    },
    "schwert": {
      word: "das Schwert",
      meaning: "the sword",
      plural: "die Schwerter",
      pronunciation: "das SHVAIRT",
      mnemonic: "Sh-wert is what a clumsy knight says when his sword breaks: 'Sh-wert, I need a new steel one!'",
      example: "Zieh dein Schwert, edler Ritter!",
      translation: "Draw your sword, noble knight!",
      type: "noun"
    },
    "sword": {
      word: "das Schwert",
      meaning: "the sword",
      plural: "die Schwerter",
      pronunciation: "das SHVAIRT",
      mnemonic: "Sh-wert is what a clumsy knight says when his sword breaks: 'Sh-wert, I need a new steel one!'",
      example: "Zieh dein Schwert, edler Ritter!",
      translation: "Draw your sword, noble knight!",
      type: "noun"
    },
    "schild": {
      word: "der Schild",
      meaning: "the shield",
      plural: "die Schilde",
      pronunciation: "der SHILT",
      mnemonic: "Protecting yourself from the chilly (Schild) mountain winds of the dungeon.",
      example: "Mein Schild blockt den Feuerball des Zauberers.",
      translation: "My shield blocks the sorcerer's fireball.",
      type: "noun"
    },
    "shield": {
      word: "der Schild",
      meaning: "the shield",
      plural: "die Schilde",
      pronunciation: "der SHILT",
      mnemonic: "Protecting yourself from the chilly (Schild) mountain winds of the dungeon.",
      example: "Mein Schild blockt den Feuerball des Zauberers.",
      translation: "My shield blocks the sorcerer's fireball.",
      type: "noun"
    },
    "wald": {
      word: "der Wald",
      meaning: "the forest",
      plural: "die Wälder",
      pronunciation: "der VALT",
      mnemonic: "Take a walking (Wald) journey through the peaceful German pine woods.",
      example: "Wir jagen heute Wildschweine im tiefen Wald.",
      translation: "We are hunting wild boars in the deep forest today.",
      type: "noun"
    },
    "forest": {
      word: "der Wald",
      meaning: "the forest",
      plural: "die Wälder",
      pronunciation: "der VALT",
      mnemonic: "Take a walking (Wald) journey through the peaceful German pine woods.",
      example: "Wir jagen heute Wildschweine im tiefen Wald.",
      translation: "We are hunting wild boars in the deep forest today.",
      type: "noun"
    },
    "trank": {
      word: "der Trank",
      meaning: "the potion",
      plural: "die Tränke",
      pronunciation: "der TRANK",
      mnemonic: "A delicious magic drink that you drank (Trank) in a flash to restore high HP.",
      example: "Der Heiler reicht mir einen roten Trank.",
      translation: "The healer hands me a red potion.",
      type: "noun"
    },
    "potion": {
      word: "der Trank",
      meaning: "the potion",
      plural: "die Tränke",
      pronunciation: "der TRANK",
      mnemonic: "A delicious magic drink that you drank (Trank) in a flash to restore high HP.",
      example: "Der Heiler reicht mir einen roten Trank.",
      translation: "The healer hands me a red potion.",
      type: "noun"
    },
    "hexe": {
      word: "die Hexe",
      meaning: "the witch",
      plural: "die Hexen",
      pronunciation: "die HEX-e",
      mnemonic: "A devious witch casting hexagonal (Hexe) runes into her cauldron.",
      example: "Die schlaue Hexe braut Zaubertränke im Wald.",
      translation: "Die clever witch brews magic potions in the forest.",
      type: "noun"
    },
    "witch": {
      word: "die Hexe",
      meaning: "the witch",
      plural: "die Hexen",
      pronunciation: "die HEX-e",
      mnemonic: "A devious witch casting hexagonal (Hexe) runes into her cauldron.",
      example: "Die schlaue Hexe braut Zaubertränke im Wald.",
      translation: "Die clever witch brews magic potions in the forest.",
      type: "noun"
    },
    "schatz": {
      word: "der Schatz",
      meaning: "the treasure / darling",
      plural: "die Schätze",
      pronunciation: "der SHATS",
      mnemonic: "You need safe travel slots (Schatz) to carry all your loot!",
      example: "Der Schatz liegt tief unter der Erde vergraben.",
      translation: "The treasure lies buried deep beneath the earth.",
      type: "noun"
    },
    "treasure": {
      word: "der Schatz",
      meaning: "the treasure / darling",
      plural: "die Schätze",
      pronunciation: "der SHATS",
      mnemonic: "You need safe travel slots (Schatz) to carry all your loot!",
      example: "Der Schatz liegt tief unter der Erde vergraben.",
      translation: "The treasure lies buried deep beneath the earth.",
      type: "noun"
    },
    "gold": {
      word: "das Gold",
      meaning: "the gold",
      plural: "None",
      pronunciation: "das GOLT",
      mnemonic: "Spelled exactly like English 'gold' but always paired with 'das'. End with a sharp T sound.",
      example: "Die Kiste ist voller reiner Goldmünzen.",
      translation: "The chest is full of pure gold coins.",
      type: "noun"
    },
    "ritter": {
      word: "der Ritter",
      meaning: "the knight",
      plural: "die Ritter",
      pronunciation: "der RIT-ter",
      mnemonic: "The armored hero who writes (Ritter) chivalrous oaths.",
      example: "Der tapfere Ritter beschützt die Reisenden.",
      translation: "The brave knight protects the travelers.",
      type: "noun"
    },
    "knight": {
      word: "der Ritter",
      meaning: "the knight",
      plural: "die Ritter",
      pronunciation: "der RIT-ter",
      mnemonic: "The armored hero who writes (Ritter) chivalrous oaths.",
      example: "Der tapfere Ritter beschützt die Reisenden.",
      translation: "The brave knight protects the travelers.",
      type: "noun"
    },
    "zauberer": {
      word: "der Zauberer",
      meaning: "the wizard / sorcerer",
      plural: "die Zauberer",
      pronunciation: "der TSOW-ber-er",
      mnemonic: "Imagine a master magician creating a magic soap bubble (Zauberer) of pure energy.",
      example: "Der weise Zauberer liest Runen.",
      translation: "The wise wizard reads runes.",
      type: "noun"
    },
    "wizard": {
      word: "der Zauberer",
      meaning: "the wizard / sorcerer",
      plural: "die Zauberer",
      pronunciation: "der TSOW-ber-er",
      mnemonic: "Imagine a master magician creating a magic soap bubble (Zauberer) of pure energy.",
      example: "Der weise Zauberer liest Runen.",
      translation: "The wise wizard reads runes.",
      type: "noun"
    },
    "sorcerer": {
      word: "der Zauberer",
      meaning: "the wizard / sorcerer",
      plural: "die Zauberer",
      pronunciation: "der TSOW-ber-er",
      mnemonic: "Imagine a master magician creating a magic soap bubble (Zauberer) of pure energy.",
      example: "Der weise Zauberer liest Runen.",
      translation: "The wise wizard reads runes.",
      type: "noun"
    },
    "freund": {
      word: "der Freund",
      meaning: "the friend / companion",
      plural: "die Freunde",
      pronunciation: "der FROYNT",
      mnemonic: "A loyal friend who joins you in a quest to fight fiends (Freund).",
      example: "Ein treuer Freund reitet mit.",
      translation: "A loyal friend rides along with you.",
      type: "noun"
    },
    "friend": {
      word: "der Freund",
      meaning: "the friend / companion",
      plural: "die Freunde",
      pronunciation: "der FROYNT",
      mnemonic: "A loyal friend who joins you in a quest to fight fiends (Freund).",
      example: "Ein treuer Freund reitet mit.",
      translation: "A loyal friend rides along with you.",
      type: "noun"
    },
    "feind": {
      word: "der Feind",
      meaning: "the enemy / foe",
      plural: "die Feinde",
      pronunciation: "der FYNT",
      mnemonic: "An enemy is a terrible fiend (Feind) plotting against your level progression.",
      example: "Der Feind bewacht das schattige Burgtor.",
      translation: "The enemy guards the shadowy castle gate.",
      type: "noun"
    },
    "enemy": {
      word: "der Feind",
      meaning: "the enemy / foe",
      plural: "die Feinde",
      pronunciation: "der FYNT",
      mnemonic: "An enemy is a terrible fiend (Feind) plotting against your level progression.",
      example: "Der Feind bewacht das schattige Burgtor.",
      translation: "The enemy guards the shadowy castle gate.",
      type: "noun"
    },
    "wasser": {
      word: "das Wasser",
      meaning: "the water",
      plural: "die Wässer",
      pronunciation: "das VAH-ser",
      mnemonic: "Pronounced just like 'water' but written with a cool German 'V' sound (Wasser).",
      example: "Frisches Wasser heilt deine Wunden.",
      translation: "Fresh water heals your wounds.",
      type: "noun"
    },
    "water": {
      word: "das Wasser",
      meaning: "the water",
      plural: "die Wässer",
      pronunciation: "das VAH-ser",
      mnemonic: "Pronounced just like 'water' but written with a cool German 'V' sound (Wasser).",
      example: "Frisches Wasser heilt deine Wunden.",
      translation: "Fresh water heals your wounds.",
      type: "noun"
    },
    "brot": {
      word: "das Brot",
      meaning: "the bread",
      plural: "die Brote",
      pronunciation: "das BROT",
      mnemonic: "Fresh crusty bread brought (Brot) to the adventure banquet.",
      example: "Wir teilen das Brot am Lagerfeuer.",
      translation: "We share the bread at the campfire.",
      type: "noun"
    },
    "bread": {
      word: "das Brot",
      meaning: "the bread",
      plural: "die Brote",
      pronunciation: "das BROT",
      mnemonic: "Fresh crusty bread brought (Brot) to the adventure banquet.",
      example: "Wir teilen das Brot am Lagerfeuer.",
      translation: "We share the bread at the campfire.",
      type: "noun"
    },
    "kämpfen": {
      word: "kämpfen",
      meaning: "to fight / battle",
      pronunciation: "KEMP-fen",
      mnemonic: "Go to training camp (kämpfen) before your major boss fight!",
      example: "Helden kämpfen für Gerechtigkeit.",
      translation: "Heroes fight for justice.",
      type: "verb"
    },
    "fight": {
      word: "kämpfen",
      meaning: "to fight / battle",
      pronunciation: "KEMP-fen",
      mnemonic: "Go to training camp (kämpfen) before your major boss fight!",
      example: "Helden kämpfen für Gerechtigkeit.",
      translation: "Heroes fight for justice.",
      type: "verb"
    },
    "lernen": {
      word: "lernen",
      meaning: "to learn / study",
      pronunciation: "LAIR-nen",
      mnemonic: "Learn and practice German deep inside a dragon's lair (lernen).",
      example: "Wir lernen täglich neue Wörter.",
      translation: "We learn new words every day.",
      type: "verb"
    },
    "learn": {
      word: "lernen",
      meaning: "to learn / study",
      pronunciation: "LAIR-nen",
      mnemonic: "Learn and practice German deep inside a dragon's lair (lernen).",
      example: "Wir lernen täglich neue Wörter.",
      translation: "We learn new words every day.",
      type: "verb"
    },
    "study": {
      word: "lernen",
      meaning: "to learn / study",
      pronunciation: "LAIR-nen",
      mnemonic: "Learn and practice German deep inside a dragon's lair (lernen).",
      example: "Wir lernen täglich neue Wörter.",
      translation: "We learn new words every day.",
      type: "verb"
    },
    "sprechen": {
      word: "sprechen",
      meaning: "to speak",
      pronunciation: "SHPRECH-en",
      mnemonic: "Sprechen rolls off your lips as you speak clearly.",
      example: "Kannst du Deutsch sprechen?",
      translation: "Can you speak German?",
      type: "verb"
    },
    "speak": {
      word: "sprechen",
      meaning: "to speak",
      pronunciation: "SHPRECH-en",
      mnemonic: "Sprechen rolls off your lips as you speak clearly.",
      example: "Kannst du Deutsch sprechen?",
      translation: "Can you speak German?",
      type: "verb"
    }
  };

  // 1. Check greetings
  if (query.match(/\b(hallo|hello|hi|hey|greetings|hallo)\b/)) {
    return `Hello! I am **Maaz**, your German tutor companion. I am fully ready to answer any questions you have about German grammar, vocabulary, or pronunciation.

You can ask me questions like:
- "How do we use German relative pronouns?"
- "What are German adjective endings?"
- "Can you explain the German cases?"
- Or simply ask me about vocabulary words like *Drache* (dragon), *Schwert* (sword), or *Burg* (castle).

How can I assist your German studies today?`;
  }

  // 2. Check Morning and Night greetings
  if (query.includes("guten morgen") || query.includes("morning")) {
    return `Guten Morgen! Let's start today's German practice. 

What would you like to study? You can request a quick lesson on relative pronouns, adjective endings, prepositions, word order, or ask for vocabulary words you'd like to practice.`;
  }

  if (query.includes("guten tag") || query.includes("guten abend") || query.includes("gute nacht")) {
    return `Guten Tag! I am ready to assist you. 

What German word or grammar topic can I explain for you right now? Feel free to ask about cases, relative pronouns, verbs, or any vocabulary term.`;
  }

  // 3. Conversational chit-chat
  if (query.includes("wie geht es") || query.includes("how are you")) {
    return `Mir geht es sehr gut, danke! (I am doing very well, thank you!) 

I am fully charged and ready to explain German grammar or help you practice vocabulary. How is your learning journey going today?`;
  }

  if (query.includes("danke") || query.includes("thank")) {
    return `Gern geschehen! (You are very welcome!) 

It is my pleasure to help you master German. Let me know if you have any other questions or need further clarifications on grammar patterns.`;
  }

  if (query.match(/\b(tschüss|bye|auf wiedersehen|quit|exit)\b/)) {
    return `Auf Wiedersehen! (Goodbye!) 

Keep practicing, and have a beautiful day. See you next time!`;
  }

  // 4. Grammar checks
  if (query.includes("gender") || query.includes("article") || query.includes("der die das")) {
    return `📚 **Maaz's Spellbook: The 3 German Genders (Articles)**

In German, all nouns belong to a guild: **Masculine (der)**, **Feminine (die)**, or **Neuter (das)**. This is not biological gender, but grammatical gender!

- 🛡️ **der** (Masculine) — e.g., **der Drache** (the dragon), **der Schild** (the shield), **der Ritter** (the knight).
- 🌸 **die** (Feminine) — e.g., **die Burg** (the castle), **die Hexe** (the witch).
- 💎 **das** (Neuter) — e.g., **das Schwert** (the sword), **das Abenteuer** (the adventure), **das Gold** (the gold).

**Maaz's Pro Tip:** Always learn a noun and its article as a single unbreakable item! Don't just study "Schwert = sword", study "**das Schwert = the sword**"! Visualize the article as a special glowing shield surrounding the noun itself.`;
  }

  if (query.includes("relative pronoun") || query.includes("relativpronomen") || query.includes("relative clause") || query.includes("relative satz") || query.includes("relativsatz") || query.includes("who") || query.includes("which") || query.includes("whom")) {
    return `**German Relative Pronouns (Relativpronomen) & Relative Clauses**

German relative pronouns connect a main clause to a relative clause (*Relativsatz*) to describe a noun in greater detail without repeating it (similar to *who*, *which*, or *that* in English).

---

### Key Rules:
1. **Gender & Number**: The relative pronoun must match the **gender** (masculine, feminine, neuter) and **number** (singular or plural) of the noun it refers to.
2. **Case**: The relative pronoun's **case** (Nominative, Accusative, Dative, Genitive) is determined solely by its role *inside* the relative clause.
3. **Word Order**: The relative clause is subordinate, which means the conjugated verb is **always kicked to the very end** of the clause.

---

### Relative Pronoun Reference Chart

| Case | Masculine | Feminine | Neuter | Plural |
| :--- | :--- | :--- | :--- | :--- |
| **Nominative** | **der** | **die** | **das** | **die** |
| **Accusative** | **den** | **die** | **das** | **die** |
| **Dative** | **dem** | **der** | **dem** | **denen** |
| **Genitive** | **dessen** | **deren** | **dessen** | **deren** |

---

### Examples in Action

- **Nominative Case** (Subject in the relative clause):
  > *"Der Ritter, **der** den Drachen bekämpft, ist mutig."*
  > (The knight, **who** fights the dragon, is brave.)
  > *Noun referred to: "Ritter" (masculine, singular). Subject in relative clause -> nominative -> **der**.*

- **Accusative Case** (Direct object in the relative clause):
  > *"Der Drache, **den** der Ritter bekämpft, speit Feuer."*
  > (The dragon, **which** the knight is fighting, breathes fire.)
  > *Noun referred to: "Drache" (masculine, singular). Direct object in relative clause -> accusative -> **den**.*

- **Dative Case** (Indirect object or governed by dative verb):
  > *"Die Hexe, **der** der Ritter hilft, ist weise."*
  > (The witch, **whom** the knight is helping, is wise.)
  > *Noun referred to: "Hexe" (feminine, singular). "helfen" requires a dative object -> dative -> **der**.*

---

Let me know if you would like more sentence examples or wish to practice relative clause word order!`;
  }

  if (query.includes("adjective") || query.includes("adjektiv")) {
    return `**German Adjective Endings (Adjektivendungen)**

When an adjective is placed immediately before a noun, it must take an ending suffix. The ending depends on:
1. **The Gender of the noun** (Masculine, Feminine, Neuter, Plural)
2. **The Case of the noun** (Nominative, Accusative, Dative, Genitive)
3. **The Preceding Article** (Definite, Indefinite, or No Article)

---

### The Three Declension Types:

1. **Weak Declension** (After Definite Articles - *der/die/das*):
   Since the definite article already clearly indicates the case and gender, the adjective endings are simple: either **-e** or **-en**.
   - *Example:* "Der **tapfere** Ritter" (The brave knight - Nominative Masculine)
   - *Example:* "Mit dem **tapferen** Ritter" (With the brave knight - Dative Masculine)

2. **Mixed Declension** (After Indefinite Articles - *ein/eine/kein* or possessives like *mein*):
   The adjective must help signal gender in certain places where the indefinite article "ein" is ambiguous.
   - *Example:* "Ein **tapferer** Ritter" (A brave knight - Nominative Masculine)
   - *Example:* "Ein **scharfes** Schwert" (A sharp sword - Nominative Neuter)

3. **Strong Declension** (No Article preceding the noun):
   The adjective ending must fully bear the gender/case markers.
   - *Example:* "Kaltes Wasser" (Cold water - Nominative Neuter)

---

**Tip**: In Dative and Genitive cases, the adjective ending is systematically **-en** across all genders when preceded by an article (such as *dem*, *der*, *einem*, *einer*).`;
  }

  if (query.includes("preposition") || query.includes("präposition")) {
    return `**German Prepositions and Grammatical Cases**

Prepositions in German dictate the case of the noun phrase that follows them.

---

### 1. Prepositions Governing the Accusative Case (Direct Targets)
These prepositions *always* require the Accusative:
- **durch** (through), **für** (for), **gegen** (against), **ohne** (without), **um** (around / at)
- *Example:* "Ich kämpfe **für den** König." (I fight for the king. *den König* is Accusative Masculine)

### 2. Prepositions Governing the Dative Case (Indirect Helpers)
These prepositions *always* require the Dative:
- **aus** (out of), **bei** (at/with), **mit** (with), **nach** (after/to), **seit** (since), **von** (from), **zu** (to)
- *Example:* "Ich reite **mit dem** Drachen." (I ride with the dragon. *dem Drachen* is Dative Masculine)

### 3. Two-Way Prepositions (Wechselpräpositionen)
These 9 prepositions can take **Accusative** (when indicating movement/direction towards a goal) or **Dative** (when indicating stationary location/position):
- **an**, **auf**, **hinter**, **in**, **neben**, **über**, **unter**, **vor**, **zwischen**

- 🏹 **Movement (Where to? $\rightarrow$ Accusative)**:
  > "Ich gehe **in den** Wald." (I am walking *into* the forest - active transition)
- ⛺ **Static/Location (Where? $\rightarrow$ Dative)**:
  > "Ich schlafe **im (in dem)** Wald." (I am sleeping *inside* the forest - static location)`;
  }

  if (query.includes("word order") || query.includes("sentence structure") || query.includes("verb position") || query.includes("syntax")) {
    return `**German Word Order & Sentence Structure**

German syntax is governed by clear and rigid rules regarding verb positioning:

---

### 1. Main Clauses (Verbs in Position 2)
In a standard declarative sentence (*Hauptsatz*), the conjugated verb **always occupies the second position**.
- *Standard structure:* "Der Ritter **reitet** heute in die Burg." (The knight *rides* to the castle today.)
- *Inverted structure:* If any other element (like time or place) starts the sentence, the subject and verb swap so the verb remains in position 2:
  > "Heute **reitet** der Ritter in die Burg." (Today *rides* the knight to the castle.)

### 2. Subordinate Clauses (The Verb-Kick Rule)
In subordinate clauses (introduced by conjunctions like *weil* (because), *dass* (that), *wenn* (if/when), *obwohl* (although), or relative pronouns), the conjugated verb is **pushed to the absolute end** of the clause:
- *Example:* "Ich bleibe in der Burg, **weil** der Wald gefährlich **ist**." (I stay in the castle because the forest *is* dangerous.)`;
  }

  if (query.includes("modal") || query.includes("verb") || query.includes("können") || query.includes("müssen") || query.includes("wollen") || query.includes("sollen") || query.includes("dürfen") || query.includes("mögen")) {
    return `**German Modal Verbs**

German modal verbs modify actions (representing ability, permission, obligation, or desire). When a modal is used, it is conjugated in Position 2, while the main action verb is placed in its infinitive form at the very end of the clause.

### The 6 Modal Verbs:
1. **können** (can / to be able to) — *Ich kann Deutsch sprechen.* (I can speak German.)
2. **müssen** (must / to have to) — *Ich muss heute lernen.* (I have to study today.)
3. **wollen** (to want to) — *Ich will das Schwert finden.* (I want to find the sword.)
4. **sollen** (should / supposed to) — *Du sollst mir helfen.* (You are supposed to help me.)
5. **dürfen** (may / to be allowed to) — *Wir dürfen eintreten.* (We are allowed to enter.)
6. **möchten / mögen** (would like / to like) — *Ich möchte einen Trank trinken.* (I would like to drink a potion.)

### Conjugation Rule:
In singular conjugations (*ich, du, er/sie/es*), the **1st person singular** (ich) and **3rd person singular** (er/sie/es) are **exactly identical** and have no suffix.
- *Example:* "Ich kann" / "Er kann" (instead of *er kannt*).`;
  }

  if (query.includes("case") || query.includes("nominativ") || query.includes("accusative") || query.includes("akkusativ") || query.includes("dativ") || query.includes("dative")) {
    return `**The 4 Grammatical Cases in German**

German uses four cases to indicate the role of a noun, pronoun, or adjective in a sentence:

1. **Nominative (Nominativ)**: Used for the **subject** of the sentence (the person or thing performing the action).
   - *Example:* "**Der Ritter** kämpft." (The knight fights.)

2. **Accusative (Akkusativ)**: Used for the **direct object** (the person or thing directly receiving the action).
   - *Example:* "Ich jage **den Drachen**." (I hunt the dragon. *der Drache* becomes *den Drachen*.)

3. **Dative (Dative)**: Used for the **indirect object** (the receiver of the direct object, or nouns governed by dative prepositions/verbs).
   - *Example:* "Ich bringe **dem Zauberer** das Schwert." (I bring the sword to the wizard.)

4. **Genitive (Genitiv)**: Used to show **possession** or relation (equivalent to "of" or "'s" in English).
   - *Example:* "Das Schwert **des Königs**." (The sword of the king.)`;
  }

  // 5. RPG Stats help
  if (query.includes("stat") || query.includes("level") || query.includes("xp") || query.includes("coin") || query.includes("streak") || query.includes("progress")) {
    const lvl = userProfile?.level || 1;
    const coins = userProfile?.coins || 150;
    const streak = userProfile?.streak || 0;
    return `**Your Study Progress Profile**

Here are your current learning statistics:
- **Level**: Level ${lvl}
- **Gold Coins**: ${coins} Coins
- **Active Streak**: ${streak} Days

**How to boost your progress:**
- Practice spelling on the **Quest Board** flashcards or compete in the **Quiz Arenas**.
- Play the matching game under **Mini Games** to gain bonus XP.
- Study at least one card daily to protect and advance your streak.`;
  }

  // 6. Direct word translation matching
  for (const [key, val] of Object.entries(offlineVocab)) {
    if (query.includes(key)) {
      return `**German Vocabulary Study: ${val.word} (${val.meaning})**

Here is the dictionary entry to help your studies:
- **Type**: ${val.type.toUpperCase()}
- **Pronunciation**: *${val.pronunciation}*
- **Mnemonic Memory Aid**: ${val.mnemonic}
${val.plural ? `- **Plural Form**: *${val.plural}*` : ""}

**Example Sentence:**
> **German**: "${val.example}"
> **English (Translation)**: "${val.translation}"

You can click this card in your Quest suggestions to instantly add it to your daily practice deck!`;
    }
  }

  // 7. Advanced generic dynamic phrase translation matching
  if (query.includes("translate") || query.includes("meaning of") || query.includes("how do you say") || query.includes("what is") || query.includes("was ist")) {
    // Detect candidate search word
    const cleanup = query.replace(/(translate|meaning of|how do you say|what is|was ist|\?|phrase|word)/g, "").trim();
    const spokenWord = cleanup ? cleanup.charAt(0).toUpperCase() + cleanup.slice(1) : "Abenteurer";
    const meaning = cleanup ? `the custom word "${cleanup}"` : "adventurer";
    let sentence = "Der tapfere Abenteurer reist durch die Welt.";
    let trans = "The brave adventurer travels through the world.";
    
    return `**German Translation Aid**

Here is a quick lookup for your query:

- **German Term**: **${spokenWord}** *(meaning: ${meaning})*
- **Pronunciation**: *der AH-ben-toy-rer*
- **Usage Tip**: An adventurer is referred to in German as "Abenteurer", which directly relates to the word "Abenteuer" (adventure).

**Example Sentence:**
> **German**: "${sentence}"
> **English**: "${trans}"`;
  }

  // 8. Catch-all versatile response (No terms matched)
  return `**German Language Tutor Assistant**

I am ready to help you answer any questions regarding German grammar, syntax, or vocabulary. It looks like your query did not match our offline quick-lookup dictionary.

To assist you immediately, here are three essential core principles of German grammar:

1. **Genders**: Every German noun is paired with one of three gendered definite articles: **der** (masculine, e.g., *der Drache*), **die** (feminine, e.g., *die Burg*), or **das** (neuter, e.g., *das Schwert*). Always learn nouns together with their corresponding article.
2. **Word Order (Verb Position (V2))**: In standard declarative main clauses, the conjugated verb must always be in **Position 2** in the sentence.
3. **Four Cases**: Ensure you select the appropriate case structure based on grammatical roles: **Nominative** for subjects, **Accusative** for direct objects, **Dative** for indirect objects, and **Genitive** for possession.

Please let me know if you would like me to explain any particular grammar topics (such as **relative pronouns**, **adjective endings**, **prepositions**, or **modal verbs**) or translate specific terms!`;
}
