import { Word, Dictionary } from "./dictionary";
import { AudioSFX } from "./audio";

export interface GameConfig {
  dictionary: Dictionary;
  onFinish: (xpEarned: number, coinsEarned: number, accuracy: number, gameMode: string) => void;
  onHeartLoss?: () => void;
  hasExtraBossHeart?: () => boolean;
  consumeExtraBossHeart?: () => void;
}

export class Games {
  private dictionary: Dictionary;
  private onFinish: (xpEarned: number, coinsEarned: number, accuracy: number, gameMode: string) => void;
  public currentUserClass: string = "Spellslinger";
  
  // Game session states
  private currentMode: string = "";
  private currentQuestions: Word[] = [];
  private currentQIndex: number = 0;
  private correctAnswersCount: number = 0;
  private totalLessonsCount: number = 10;
  
  // Boss state
  private bossHp: number = 100;
  private userHearts: number = 3;
  private maxHearts: number = 3;

  private hasExtraBossHeart?: () => boolean;
  private consumeExtraBossHeart?: () => void;

  // Matching game state
  private matchedTiles: Set<number> = new Set();
  private selectedTiles: { index: number; id: string; type: "de" | "en"; value: string }[] = [];

  constructor(config: GameConfig) {
    this.dictionary = config.dictionary;
    this.onFinish = config.onFinish;
    this.hasExtraBossHeart = config.hasExtraBossHeart;
    this.consumeExtraBossHeart = config.consumeExtraBossHeart;
  }

  // Start any practice mode
  public start(mode: string, questionCount: number = 10) {
    this.currentMode = mode;
    this.currentQIndex = 0;
    this.correctAnswersCount = 0;
    this.totalLessonsCount = questionCount;
    
    const allWords = this.dictionary.getWords();
    if (allWords.length === 0) {
      alert("Quest Book is empty! Force adding starter spells first.");
      return;
    }

    // Assemble questions
    if (mode === "boss") {
      // Prioritize weak words for Boss Battle
      const weak = this.dictionary.getWeakWords();
      if (weak.length >= 3) {
        this.currentQuestions = this.shuffle([...weak]).slice(0, 8);
      } else {
        this.currentQuestions = this.shuffle([...allWords]).slice(0, 8);
      }
      this.totalLessonsCount = this.currentQuestions.length;
      this.bossHp = 100;
      let baseHearts = (this.currentUserClass === "Shield-Bearer") ? 4 : 3;
      if (this.hasExtraBossHeart && this.hasExtraBossHeart()) {
        baseHearts += 1;
        if (this.consumeExtraBossHeart) {
          this.consumeExtraBossHeart();
        }
      }
      this.maxHearts = baseHearts;
      this.userHearts = baseHearts;
    } else if (mode === "gender") {
      const userNouns = allWords.filter(w => /^(der|die|das)\s+/i.test(w.german));
      const needed = questionCount;
      let pool = [...userNouns];
      if (pool.length < needed) {
        // inject from default nouns to ensure there are always standard, high-quality nouns
        const DEF_NOUNS: Word[] = [
          { german: "der Hund", english: "the dog", category: "Basics", difficulty: "Easy", isFavorite: false, accuracyCount: 0, errorCount: 0 },
          { german: "die Katze", english: "the cat", category: "Basics", difficulty: "Easy", isFavorite: false, accuracyCount: 0, errorCount: 0 },
          { german: "das Buch", english: "the book", category: "Basics", difficulty: "Easy", isFavorite: false, accuracyCount: 0, errorCount: 0 },
          { german: "der Apfel", english: "the apple", category: "Basics", difficulty: "Easy", isFavorite: false, accuracyCount: 0, errorCount: 0 },
          { german: "die Sonne", english: "the sun", category: "Basics", difficulty: "Easy", isFavorite: false, accuracyCount: 0, errorCount: 0 },
          { german: "das Auto", english: "the car", category: "Basics", difficulty: "Easy", isFavorite: false, accuracyCount: 0, errorCount: 0 },
          { german: "der Drache", english: "the dragon", category: "Adventure", difficulty: "Medium", isFavorite: false, accuracyCount: 0, errorCount: 0 },
          { german: "die Burg", english: "the castle", category: "Adventure", difficulty: "Easy", isFavorite: false, accuracyCount: 0, errorCount: 0 },
          { german: "das Abenteuer", english: "the adventure", category: "Basics", difficulty: "Easy", isFavorite: false, accuracyCount: 0, errorCount: 0 },
          { german: "der Wald", english: "the forest", category: "Basics", difficulty: "Easy", isFavorite: false, accuracyCount: 0, errorCount: 0 },
          { german: "die Blume", english: "the flower", category: "Basics", difficulty: "Easy", isFavorite: false, accuracyCount: 0, errorCount: 0 },
          { german: "das Haus", english: "the house", category: "Basics", difficulty: "Easy", isFavorite: false, accuracyCount: 0, errorCount: 0 }
        ];
        for (const defNoun of DEF_NOUNS) {
          if (!pool.some(p => p.german.toLowerCase().trim() === defNoun.german.toLowerCase().trim())) {
            pool.push(defNoun);
          }
        }
      }
      this.currentQuestions = this.shuffle(pool).slice(0, needed);
      this.totalLessonsCount = this.currentQuestions.length;
    } else {
      this.currentQuestions = this.shuffle([...allWords]).slice(0, Math.min(questionCount, allWords.length));
      this.totalLessonsCount = this.currentQuestions.length;
    }

    this.renderActiveGame();
  }

  // Build the corresponding game UI
  private renderActiveGame() {
    const parent = document.getElementById("game-sub-viewport");
    const progressHUD = document.getElementById("game-hud-progress");
    const scoreHUD = document.getElementById("game-hud-score");
    const scoresCon = document.getElementById("game-hud-scores-con");
    const bossCon = document.getElementById("game-hud-boss-con");
    const heartsLabel = document.getElementById("game-hud-hearts");

    if (!parent) return;

    // Reset HUDs
    if (progressHUD) progressHUD.innerText = `${this.currentQIndex + 1}/${this.totalLessonsCount}`;
    if (scoreHUD) {
      const accuracy = this.currentQIndex > 0 ? Math.round((this.correctAnswersCount / this.currentQIndex) * 100) : 100;
      scoreHUD.innerText = `${accuracy}%`;
    }

    // Render configuration based on mode
    if (this.currentMode === "boss") {
      if (scoresCon) scoresCon.classList.add("hidden");
      if (bossCon) bossCon.classList.remove("hidden");
      if (heartsLabel) {
        let heartsStr = "";
        const totalMaxHearts = this.maxHearts;
        for (let i = 0; i < totalMaxHearts; i++) heartsStr += i < this.userHearts ? "❤️" : "🖤";
        heartsLabel.innerText = heartsStr;
      }
    } else {
      if (scoresCon) scoresCon.classList.remove("hidden");
      if (bossCon) bossCon.classList.add("hidden");
    }

    parent.innerHTML = ""; // Clear viewport

    // Branch layout
    switch (this.currentMode) {
      case "quiz":
        this.renderQuiz(parent);
        break;
      case "typing":
        this.renderTyping(parent);
        break;
      case "flashcards":
        if (scoresCon) scoresCon.classList.add("hidden"); // Flashcards don't track rating
        this.renderFlashcards(parent);
        break;
      case "matching2": // legacy
      case "matching":
        if (progressHUD) progressHUD.innerText = "Tile Match Battle";
        if (scoresCon) scoresCon.classList.add("hidden");
        this.renderMatching(parent);
        break;
      case "listening":
        this.renderListening(parent);
        break;
      case "speaking":
        this.renderSpeaking(parent);
        break;
      case "boss":
        this.renderBossBattle(parent);
        break;
      case "gender":
        this.renderGenderDefender(parent);
        break;
      case "scrambler":
        this.renderRuneScrambler(parent);
        break;
      case "alchemist":
        this.renderAlchemist(parent);
        break;
    }
  }

  // Helper shuffle array
  private shuffle<T>(arr: T[]): T[] {
    return arr.sort(() => Math.random() - 0.5);
  }

  // -------------------------------------------------------------
  // GAME MODE 1: MULTIPLE CHOICE QUIZ
  // -------------------------------------------------------------
  private renderQuiz(container: HTMLElement) {
    const qWord = this.currentQuestions[this.currentQIndex];
    if (!qWord) return;

    // Get 3 random distractor meanings from other dictionary items
    const allWords = this.dictionary.getWords();
    const distractors = allWords
      .filter(w => w.english !== qWord.english)
      .map(w => w.english);

    const shuffledDistractors = this.shuffle(distractors).slice(0, 3);
    const options = this.shuffle([qWord.english, ...shuffledDistractors]);

    const wrapper = document.createElement("div");
    wrapper.className = "flex flex-col items-center gap-6 text-center max-w-md mx-auto py-4";

    wrapper.innerHTML = `
      <div class="px-3 py-1 bg-violet-950/60 border border-violet-500/20 text-violet-300 text-[10px] font-mono rounded-full uppercase tracking-wider">
        Translate to English
      </div>
      <h4 class="text-3xl font-display font-medium text-slate-100 neon-text-blue">${qWord.german}</h4>
      
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full mt-2">
        ${options.map((opt, i) => `
          <button class="quiz-option-btn text-left p-3.5 bg-slate-900 border border-slate-800 hover:border-violet-500 rounded-xl text-xs font-medium text-slate-300 hover:text-white transition-all rpg-btn flex items-center gap-2.5" data-value="${opt}">
            <span class="w-5 h-5 rounded-full bg-slate-800/80 border border-slate-700/50 text-[10px] font-mono font-bold flex items-center justify-center">${i + 1}</span>
            <span>${opt}</span>
          </button>
        `).join("")}
      </div>
      
      <div class="h-8 text-xs font-mono font-medium" id="quiz-feedback"></div>
    `;

    container.appendChild(wrapper);

    // Bind events
    const buttons = wrapper.querySelectorAll(".quiz-option-btn");
    buttons.forEach(btn => {
      btn.addEventListener("click", (e) => {
        const selected = btn.getAttribute("data-value") || "";
        this.verifyQuizAnswer(selected, qWord, btn as HTMLButtonElement, wrapper);
      });
    });
  }

  private verifyQuizAnswer(selected: string, correctWord: Word, clickedBtn: HTMLButtonElement, container: HTMLElement) {
    const feedback = container.querySelector("#quiz-feedback") as HTMLElement;
    const allOptionBtns = container.querySelectorAll(".quiz-option-btn");
    
    // Disable other buttons
    allOptionBtns.forEach(btn => btn.setAttribute("disabled", "true"));

    const isCorrect = selected === correctWord.english;
    this.dictionary.reportQuizResult(correctWord.german, isCorrect);

    if (isCorrect) {
      this.correctAnswersCount++;
      AudioSFX.playCorrect();
      clickedBtn.classList.remove("border-slate-800");
      clickedBtn.classList.add("border-emerald-500", "bg-emerald-950/20", "text-emerald-400");
      if (feedback) {
        feedback.className = "text-emerald-400 font-bold font-mono h-8 animate-float";
        feedback.innerText = "✨ SEHR GUT! Correct answer!";
      }
    } else {
      AudioSFX.playError();
      clickedBtn.classList.remove("border-slate-800");
      clickedBtn.classList.add("border-rose-500", "bg-rose-950/20", "text-rose-400");
      
      // highlight correct
      allOptionBtns.forEach(b => {
        if (b.getAttribute("data-value") === correctWord.english) {
          b.classList.add("border-emerald-500", "bg-emerald-950/10", "text-emerald-400");
        }
      });

      if (feedback) {
        feedback.className = "text-rose-400 font-bold font-mono h-8";
        feedback.innerText = `❌ FALSCH! Correct translation: ${correctWord.english}`;
      }
    }

    // Advance after 2 seconds delay
    setTimeout(() => {
      this.nextQuestion();
    }, 2000);
  }

  // -------------------------------------------------------------
  // GAME MODE 2: TYPING CHALLENGE
  // -------------------------------------------------------------
  private renderTyping(container: HTMLElement) {
    const qWord = this.currentQuestions[this.currentQIndex];
    if (!qWord) return;

    const wrapper = document.createElement("div");
    wrapper.className = "flex flex-col items-center gap-5 text-center max-w-sm mx-auto py-4";

    wrapper.innerHTML = `
      <div class="px-3 py-1 bg-purple-950/60 border border-purple-500/20 text-purple-300 text-[10px] font-mono rounded-full uppercase tracking-wider">
        Spell translation in German
      </div>
      <div>
        <h4 class="text-3xl font-display font-medium text-slate-100">${qWord.english}</h4>
        <p class="text-[11px] text-slate-400 font-mono mt-1">Category: ${qWord.category} | Level: ${qWord.difficulty}</p>
      </div>

      <!-- Accent assistance buttons -->
      <div class="flex items-center gap-1.5 mt-1" id="accent-bar">
        <button class="accent-btn px-2.5 py-1 bg-slate-900 border border-slate-800 text-xs text-slate-300 hover:text-white rounded hover:border-purple-500" data-char="ä">ä</button>
        <button class="accent-btn px-2.5 py-1 bg-slate-900 border border-slate-800 text-xs text-slate-300 hover:text-white rounded hover:border-purple-500" data-char="ö">ö</button>
        <button class="accent-btn px-2.5 py-1 bg-slate-900 border border-slate-800 text-xs text-slate-300 hover:text-white rounded hover:border-purple-500" data-char="ü">ü</button>
        <button class="accent-btn px-2.5 py-1 bg-slate-900 border border-slate-800 text-xs text-slate-300 hover:text-white rounded hover:border-purple-500" data-char="ß">ß</button>
        <button class="accent-btn px-2.5 py-1 bg-slate-900 border border-slate-800 text-xs text-slate-300 hover:text-white rounded hover:border-purple-500" data-char="Ä">Ä</button>
        <button class="accent-btn px-2.5 py-1 bg-slate-900 border border-slate-800 text-xs text-slate-300 hover:text-white rounded hover:border-purple-500" data-char="Ö">Ö</button>
        <button class="accent-btn px-2.5 py-1 bg-slate-900 border border-slate-800 text-xs text-slate-300 hover:text-white rounded hover:border-purple-500" data-char="Ü">Ü</button>
      </div>
      
      <div class="w-full relative mt-1 flex flex-col gap-2">
        <input type="text" id="typing-input" class="w-full text-center bg-slate-900 border border-slate-700/60 rounded-xl px-4 py-3 text-xs focus:border-purple-500 focus:outline-none" placeholder="Type German Word..." autocomplete="off">
        <button class="w-full py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-xs font-semibold text-white transition-all rpg-btn mt-2" id="typing-submit">
          Cast Spell! ⚡
        </button>
      </div>
      
      <div class="h-8 text-xs font-mono font-medium" id="typing-feedback"></div>
    `;

    container.appendChild(wrapper);

    // Accent trigger bindings
    const input = wrapper.querySelector("#typing-input") as HTMLInputElement;
    if (input) input.focus();

    wrapper.querySelectorAll(".accent-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        const char = btn.getAttribute("data-char") || "";
        if (input) {
          const start = input.selectionStart || 0;
          const end = input.selectionEnd || 0;
          const val = input.value;
          input.value = val.substring(0, start) + char + val.substring(end);
          input.focus();
          input.setSelectionRange(start + 1, start + 1);
        }
      });
    });

    // Enter Key validation
    const submitBtn = wrapper.querySelector("#typing-submit") as HTMLButtonElement;
    
    const validateAction = () => {
      if (!input || input.getAttribute("disabled")) return;
      const val = input.value.trim().toLowerCase();
      // Compare ignoring leading articles if user forgot (e.g. comparing "der Drache" to "Drache" is accepted)
      const correctClean = qWord.german.trim().toLowerCase();
      const matchWithoutArticle = correctClean.replace(/^(der|die|das)\s+/, "");

      const isCorrect = (val === correctClean || val === matchWithoutArticle);
      this.verifyTypingAnswer(isCorrect, qWord, input, submitBtn, wrapper);
    };

    if (submitBtn) {
      submitBtn.addEventListener("click", validateAction);
    }
    if (input) {
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          validateAction();
        }
      });
    }
  }

  private verifyTypingAnswer(isCorrect: boolean, correctWord: Word, input: HTMLInputElement, submitBtn: HTMLButtonElement, wrapper: HTMLElement) {
    const feedback = wrapper.querySelector("#typing-feedback") as HTMLElement;

    input.setAttribute("disabled", "true");
    submitBtn.setAttribute("disabled", "true");
    
    this.dictionary.reportQuizResult(correctWord.german, isCorrect);

    if (isCorrect) {
      this.correctAnswersCount++;
      input.classList.remove("border-slate-700/60");
      input.classList.add("border-emerald-500", "bg-emerald-950/20", "text-emerald-400");
      if (feedback) {
        feedback.className = "text-emerald-400 font-bold font-mono h-8 animate-float";
        feedback.innerText = "✨ EXZELLENT! Flawless translation!";
      }
    } else {
      input.classList.remove("border-slate-700/60");
      input.classList.add("border-rose-500", "bg-rose-950/20", "text-rose-400");
      if (feedback) {
        feedback.className = "text-rose-400 font-bold font-mono h-8";
        feedback.innerText = `❌ INCORRECT! Exact spelling is: ${correctWord.german}`;
      }
    }

    setTimeout(() => {
      this.nextQuestion();
    }, 2000);
  }

  // -------------------------------------------------------------
  // GAME MODE 3: FLASHCARDS
  // -------------------------------------------------------------
  private renderFlashcards(container: HTMLElement) {
    const qWord = this.currentQuestions[this.currentQIndex];
    if (!qWord) return;

    const wrapper = document.createElement("div");
    wrapper.className = "flex flex-col items-center gap-6 max-w-sm mx-auto py-4";

    wrapper.innerHTML = `
      <div class="px-3 py-1 bg-blue-950/60 border border-blue-500/20 text-blue-300 text-[10px] font-mono rounded-full uppercase tracking-wider">
        Card ${this.currentQIndex + 1} of ${this.totalLessonsCount} | Self Evaluation
      </div>

      <!-- Flippable Card Outer wrapper -->
      <div class="memory-card w-full h-56 cursor-pointer" id="flashcard-card-box">
        <div class="memory-card-inner relative w-full h-full duration-500 transform-style-preserve-3d">
          
          <!-- Front of Card: German -->
          <div class="memory-card-front glass-panel rounded-2xl flex flex-col justify-center items-center p-6 text-center shadow-lg hover:border-blue-500/50 transition-colors border border-slate-800">
            <span class="text-xs text-blue-400 font-mono tracking-widest uppercase mb-1 leading-none">German Word</span>
            <h4 class="text-3xl font-display font-medium text-slate-150 py-3">${qWord.german}</h4>
            <p class="text-[10px] text-slate-500 font-mono mt-3 leading-none">Click/Touch anywhere to reveal translation</p>
          </div>

          <!-- Back of Card: English & Tips -->
          <div class="memory-card-back glass-panel rounded-2xl fill-purple flex flex-col justify-center items-center p-5 text-center shadow-lg border border-violet-500/40">
            <span class="text-xs text-violet-400 font-mono tracking-widest uppercase mb-1 leading-none">English Meaning</span>
            <h4 class="text-2xl font-display font-bold text-slate-100 py-1 capitalize">${qWord.english}</h4>
            <p class="text-[10px] text-slate-400 font-mono px-3 py-0.5 rounded bg-slate-900 border border-slate-800">Category: ${qWord.category}</p>
          </div>

        </div>
      </div>

      <!-- Decision triggers -->
      <div class="flex items-center gap-3 w-full justify-between" id="fc-controls">
        <button class="px-3.5 py-2.5 rounded-xl border border-rose-500/30 bg-rose-950/20 text-rose-400 hover:bg-rose-950/40 text-[11px] font-semibold flex-1 rpg-btn" id="fc-retry-btn">
          ❌ Still Learning
        </button>
        <button class="px-3.5 py-2.5 rounded-xl border border-emerald-500/30 bg-emerald-950/20 text-emerald-400 hover:bg-emerald-950/40 text-[11px] font-semibold flex-1 rpg-btn" id="fc-know-btn">
          🟢 Got it! Easy
        </button>
      </div>
    `;

    container.appendChild(wrapper);

    // Event flips
    const cardBox = wrapper.querySelector("#flashcard-card-box") as HTMLElement;
    const cardInner = wrapper.querySelector(".memory-card-inner") as HTMLElement;
    
    cardBox.addEventListener("click", () => {
      cardBox.classList.toggle("flipped");
      if (cardBox.classList.contains("flipped")) {
        cardInner.style.transform = "rotateY(180deg)";
      } else {
        cardInner.style.transform = "rotateY(0deg)";
      }
    });

    // Score handlers
    const retryBtn = wrapper.querySelector("#fc-retry-btn") as HTMLButtonElement;
    const knowBtn = wrapper.querySelector("#fc-know-btn") as HTMLButtonElement;

    retryBtn.addEventListener("click", () => {
      this.dictionary.reportQuizResult(qWord.german, false);
      this.nextQuestion();
    });

    knowBtn.addEventListener("click", () => {
      this.dictionary.reportQuizResult(qWord.german, true);
      this.correctAnswersCount++;
      this.nextQuestion();
    });
  }

  // -------------------------------------------------------------
  // GAME MODE 4: MEMORY MATCHING
  // -------------------------------------------------------------
  private renderMatching(container: HTMLElement) {
    // Generate exactly 4 pairs (total 8 cards) or up to 6 pairs (total 12 cards) depending on dictionary size
    const allWords = this.dictionary.getWords();
    const pairsToSolve = Math.min(6, allWords.length);
    const selectedWords = this.shuffle([...allWords]).slice(0, pairsToSolve);

    // Create cards both in German and English
    // Let's create unique IDs to verify matching combinations
    const tiles: { id: string; type: "de" | "en"; value: string; pairId: string }[] = [];
    selectedWords.forEach(w => {
      tiles.push({ id: `de-${w.german}`, type: "de", value: w.german, pairId: w.german });
      tiles.push({ id: `en-${w.german}`, type: "en", value: w.english, pairId: w.german });
    });

    // Shuffle tiles
    const shuffledTiles = this.shuffle(tiles);
    this.matchedTiles.clear();
    this.selectedTiles = [];

    const wrapper = document.createElement("div");
    wrapper.className = "flex flex-col gap-5 max-w-xl mx-auto py-2";

    const gridHtml = `
      <div class="px-3 py-1 bg-emerald-950/60 border border-emerald-550/20 text-emerald-400 text-[10px] font-mono rounded-full uppercase tracking-wider text-center self-center w-fit">
        Rune Match: Tap tiles to unify terms
      </div>

      <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 w-full mt-2" id="matching-grid">
        ${shuffledTiles.map((tile, i) => `
          <button class="matching-tile-btn h-20 bg-slate-900 border border-slate-800 hover:border-emerald-500 rounded-xl font-display text-xs flex items-center justify-center p-3 text-center transition-all cursor-pointer rpg-btn overflow-hidden select-none" 
            data-index="${i}" data-pair="${tile.pairId}" data-type="${tile.type}" data-value="${tile.value}">
            <div class="flex flex-col items-center">
              <span class="text-[9px] font-mono opacity-40 uppercase tracking-widest block mb-1">${tile.type === "de" ? "DE" : "EN"}</span>
              <span class="font-medium text-slate-205 leading-tight">${tile.value}</span>
            </div>
          </button>
        `).join("")}
      </div>

      <div class="h-6 text-xs font-mono font-medium text-center text-slate-400" id="match-status-feedback">Cleared 0 of ${pairsToSolve} pairs</div>
    `;

    wrapper.innerHTML = gridHtml;
    container.appendChild(wrapper);

    // Setup events
    const buttons = wrapper.querySelectorAll(".matching-tile-btn");
    buttons.forEach(btn => {
      btn.addEventListener("click", () => {
        const indexStr = btn.getAttribute("data-index") || "";
        const idx = parseInt(indexStr);
        if (this.matchedTiles.has(idx) || this.selectedTiles.some(s => s.index === idx)) return;

        // Visual select state
        btn.classList.add("border-violet-500", "bg-violet-950/30", "scale-[1.03]");
        this.selectedTiles.push({
          index: idx,
          id: btn.getAttribute("data-pair") || "",
          type: btn.getAttribute("data-type") as any,
          value: btn.getAttribute("data-value") || ""
        });

        // Verify if 2 tiles selected
        if (this.selectedTiles.length === 2) {
          this.verifyMemoryMatch(wrapper, buttons, pairsToSolve);
        }
      });
    });
  }

  private verifyMemoryMatch(wrapper: HTMLElement, buttons: NodeListOf<Element>, totalPairs: number) {
    const [t1, t2] = this.selectedTiles;
    const status = wrapper.querySelector("#match-status-feedback") as HTMLElement;

    // Check if correct match - they must refer to the same German word (pair ID) but different types (DE/EN)
    const isCorrect = (t1.id === t2.id && t1.type !== t2.type);

    if (isCorrect) {
      // Complete Match!
      this.matchedTiles.add(t1.index);
      this.matchedTiles.add(t2.index);
      
      const b1 = buttons[t1.index] as HTMLButtonElement;
      const b2 = buttons[t2.index] as HTMLButtonElement;
      
      b1.className = "matching-tile-btn h-20 bg-emerald-950/20 border-emerald-550/60 rounded-xl text-emerald-400 font-display text-xs flex items-center justify-center p-3 text-center transition-all select-none hover:cursor-default";
      b2.className = "matching-tile-btn h-20 bg-emerald-950/20 border-emerald-550/60 rounded-xl text-emerald-400 font-display text-xs flex items-center justify-center p-3 text-center transition-all select-none hover:cursor-default";

      // Report to Dictionary
      this.dictionary.reportQuizResult(t1.id, true);

      this.selectedTiles = [];
      const clearedPairs = this.matchedTiles.size / 2;
      
      if (status) status.innerText = `Cleared ${clearedPairs} of ${totalPairs} pairs`;

      // Check ultimate win
      if (clearedPairs === totalPairs) {
        setTimeout(() => {
          this.onFinish(20, 8, 100, "matching"); // Award high loot but lower coins
        }, 1200);
      }
    } else {
      // Incorrrect matching
      const b1 = buttons[t1.index] as HTMLButtonElement;
      const b2 = buttons[t2.index] as HTMLButtonElement;
      
      b1.classList.remove("border-violet-500", "bg-violet-950/30");
      b1.classList.add("border-rose-500", "bg-rose-950/20");
      
      b2.classList.remove("border-violet-500", "bg-violet-950/30");
      b2.classList.add("border-rose-500", "bg-rose-950/20");

      this.dictionary.reportQuizResult(t1.id, false);

      setTimeout(() => {
        b1.className = "matching-tile-btn h-20 bg-slate-900 border border-slate-800 hover:border-emerald-500 rounded-xl font-display text-xs flex items-center justify-center p-3 text-center transition-all cursor-pointer rpg-btn overflow-hidden select-none";
        b2.className = "matching-tile-btn h-20 bg-slate-900 border border-slate-800 hover:border-emerald-500 rounded-xl font-display text-xs flex items-center justify-center p-3 text-center transition-all cursor-pointer rpg-btn overflow-hidden select-none";
        this.selectedTiles = [];
      }, 1200);
    }
  }

  // -------------------------------------------------------------
  // GAME MODE 5: LISTENING TRIAL
  // -------------------------------------------------------------
  private renderListening(container: HTMLElement) {
    const qWord = this.currentQuestions[this.currentQIndex];
    if (!qWord) return;

    // Distractors
    const allWords = this.dictionary.getWords();
    const distractors = allWords
      .filter(w => w.english !== qWord.english)
      .map(w => w.english);

    const shuffledDistractors = this.shuffle(distractors).slice(0, 3);
    const options = this.shuffle([qWord.english, ...shuffledDistractors]);

    const wrapper = document.createElement("div");
    wrapper.className = "flex flex-col items-center gap-6 text-center max-w-sm mx-auto py-4";

    wrapper.innerHTML = `
      <div class="px-3 py-1 bg-pink-950/60 border border-pink-500/20 text-pink-300 text-[10px] font-mono rounded-full uppercase tracking-wider">
        Listen to spoken audio and select meaning
      </div>

      <!-- Play Audio Button -->
      <button class="w-20 h-20 rounded-full bg-pink-600 hover:bg-pink-500 text-white flex items-center justify-center text-3xl shadow-lg glow-rose hover:scale-105 transition-all rpg-btn mt-2 cursor-pointer" id="listening-play-btn">
        🔊
      </button>

      <p class="text-xs text-slate-400 font-mono italic">Click button to speak German spell</p>

      <div class="grid grid-cols-1 gap-2.5 w-full mt-2">
        ${options.map(opt => `
          <button class="listening-option-btn p-3 bg-slate-900 border border-slate-800 hover:border-pink-500 hover:bg-pink-950/10 rounded-xl text-xs font-semibold text-slate-350 hover:text-white transition-all text-left rpg-btn cursor-pointer" data-value="${opt}">
            <span>${opt}</span>
          </button>
        `).join("")}
      </div>

      <div class="h-8 text-xs font-mono font-medium" id="listening-feedback"></div>
    `;

    container.appendChild(wrapper);

    // Audio synthesizer synthesis routine
    const speakWord = () => {
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        // Remove articles like "der/die/das" to make SpeechSynthesis sound perfectly natural in standard German
        const cleanToSpeak = qWord.german.replace(/^(der|die|das)\s+/, "");
        const utterance = new SpeechSynthesisUtterance(cleanToSpeak);
        utterance.lang = "de-DE";
        utterance.rate = 0.85; // slightly slower for absolute clarity
        
        // Find best German voice if loaded
        const voices = window.speechSynthesis.getVoices();
        const deVoice = voices.find(v => v.lang.startsWith("de"));
        if (deVoice) utterance.voice = deVoice;

        window.speechSynthesis.speak(utterance);
      } else {
        alert("Web Speech synthesis is not supported on this device/frame connection.");
      }
    };

    // Auto-play first time
    speakWord();

    const playBtn = wrapper.querySelector("#listening-play-btn") as HTMLButtonElement;
    if (playBtn) playBtn.addEventListener("click", speakWord);

    // Answer bindings
    const buttons = wrapper.querySelectorAll(".listening-option-btn");
    buttons.forEach(btn => {
      btn.addEventListener("click", () => {
        const selected = btn.getAttribute("data-value") || "";
        this.verifyListeningAnswer(selected, qWord, btn as HTMLButtonElement, wrapper);
      });
    });
  }

  private verifyListeningAnswer(selected: string, correctWord: Word, clickedBtn: HTMLButtonElement, container: HTMLElement) {
    const feedback = container.querySelector("#listening-feedback") as HTMLElement;
    const allOptionBtns = container.querySelectorAll(".listening-option-btn");

    allOptionBtns.forEach(btn => btn.setAttribute("disabled", "true"));

    const isCorrect = (selected === correctWord.english);
    this.dictionary.reportQuizResult(correctWord.german, isCorrect);

    if (isCorrect) {
      this.correctAnswersCount++;
      clickedBtn.classList.remove("border-slate-800");
      clickedBtn.classList.add("border-emerald-500", "bg-emerald-950/20", "text-emerald-400");
      if (feedback) {
        feedback.className = "text-emerald-400 font-bold font-mono h-8 animate-float";
        feedback.innerText = "✨ HERVORRAGEND! Correctly recognized.";
      }
    } else {
      clickedBtn.classList.remove("border-slate-800");
      clickedBtn.classList.add("border-rose-500", "bg-rose-950/20", "text-rose-400");
      if (feedback) {
        feedback.className = "text-rose-400 font-bold font-mono h-8";
        feedback.innerText = `❌ INCORRECT! Spoken word translates as: ${correctWord.english}`;
      }
    }

    setTimeout(() => {
      this.nextQuestion();
    }, 2000);
  }

  // -------------------------------------------------------------
  // GAME MODE 6: SPEAKING TRIAL
  // -------------------------------------------------------------
  private renderSpeaking(container: HTMLElement) {
    const qWord = this.currentQuestions[this.currentQIndex];
    if (!qWord) return;

    // Clean word without details
    const targetSpeak = qWord.german.replace(/^(der|die|das)\s+/, "");

    const wrapper = document.createElement("div");
    wrapper.className = "flex flex-col items-center gap-6 text-center max-w-sm mx-auto py-4";

    wrapper.innerHTML = `
      <div class="px-3 py-1 bg-amber-950/60 border border-amber-500/20 text-amber-305 text-[10px] font-mono rounded-full uppercase tracking-wider">
        Microphone Voice Trial
      </div>
      
      <div>
        <h4 class="text-[10px] font-mono tracking-widest text-slate-500 uppercase">Pronounce this German Word</h4>
        <h3 class="text-3xl font-display font-bold text-slate-100 neon-text-purple mt-2" id="speak-target-word">${qWord.german}</h3>
        <p class="text-xs text-slate-400 font-mono mt-1">Meaning: "${qWord.english}"</p>
      </div>

      <!-- Speak trigger record -->
      <button class="w-20 h-20 rounded-full bg-slate-900 border border-slate-800 hover:border-violet-500 text-slate-400 hover:text-white flex items-center justify-center text-2xl shadow-inner transition-all hover:scale-105 cursor-pointer rpg-btn" id="record-speaking-btn">
        🎙️
      </button>

      <p class="text-xs text-slate-500 font-mono italic" id="speaking-help-instruction">Click microphone and speak loud and clear</p>
      
      <div class="p-3 bg-slate-950/60 border border-slate-900 rounded-xl w-full text-center min-h-[50px] flex items-center justify-center flex-col">
        <span class="text-[9px] font-mono text-slate-500 uppercase tracking-widest leading-none mb-1">We heard:</span>
        <p class="text-sm font-semibold font-mono text-violet-300" id="speech-transcript-log">...</p>
      </div>

      <div class="flex items-center gap-2.5 w-full">
        <!-- Quick skip and force mock recognition in sandbox frameworks -->
        <button class="flex-1 py-1.5 border border-slate-800 hover:border-slate-700 hover:bg-slate-900 text-[10px] font-semibold text-slate-400 rounded-lg rpg-btn" id="speaking-skip-btn">
          Manual verification (Pass)
        </button>
      </div>

      <div class="h-8 text-xs font-mono font-medium" id="speaking-feedback"></div>
    `;

    container.appendChild(wrapper);

    const recordBtn = wrapper.querySelector("#record-speaking-btn") as HTMLButtonElement;
    const statusLabel = wrapper.querySelector("#speaking-help-instruction") as HTMLElement;
    const transcriptLog = wrapper.querySelector("#speech-transcript-log") as HTMLElement;

    // Setup speech recognition
    let recognition: any = null;
    let isWebkit = 'webkitSpeechRecognition' in window;
    let isStandard = 'SpeechRecognition' in window;

    if (isWebkit || isStandard) {
      const SpeechCls = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      recognition = new SpeechCls();
      recognition.lang = "de-DE";
      recognition.continuous = false;
      recognition.interimResults = false;

      recognition.onstart = () => {
        if (recordBtn) recordBtn.className = "w-20 h-20 rounded-full bg-violet-600 animate-pulse text-white flex items-center justify-center text-2xl shadow-lg glow-purple pointer-events-none";
        if (statusLabel) statusLabel.innerText = "Listening now... Speak!";
      };

      recognition.onerror = (e: any) => {
        console.warn("Speech Recognition Error:", e);
        if (recordBtn) recordBtn.className = "w-20 h-20 rounded-full bg-slate-900 border border-slate-800 hover:border-violet-500 text-slate-400 hover:text-white flex items-center justify-center text-2xl shadow-inner cursor-pointer rpg-btn";
        if (statusLabel) statusLabel.innerText = `Error: ${e.error || 'Connection failed'}. Click mic to retry.`;
      };

      recognition.onend = () => {
        if (recordBtn) recordBtn.className = "w-20 h-20 rounded-full bg-slate-900 border border-slate-800 hover:border-violet-500 text-slate-400 hover:text-white flex items-center justify-center text-2xl shadow-inner cursor-pointer rpg-btn";
      };

      recognition.onresult = (event: any) => {
        const text = event.results[0][0].transcript || "";
        if (transcriptLog) transcriptLog.innerText = `"${text}"`;
        
        // Compare spoken words
        const cleanedSpoken = text.trim().toLowerCase().replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g,"");
        const cleanedTarget = targetSpeak.trim().toLowerCase().replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g,"");

        // Simple fuzzy match or startsWith since pronunciation may vary slightly
        const isFuzzyCorrect = (cleanedSpoken.includes(cleanedTarget) || cleanedTarget.includes(cleanedSpoken));
        this.verifySpeakingAnswer(isFuzzyCorrect, qWord, wrapper);
      };
    }

    if (recordBtn) {
      recordBtn.addEventListener("click", () => {
        if (recognition) {
          try {
            recognition.start();
          } catch (e) {
            console.warn("Speech session already speaking");
          }
        } else {
          // If speech API is locked in sandbox frame, auto-prompt fallback manual evaluation
          if (statusLabel) statusLabel.innerText = "Speech Recognition API not supported in nested preview frames! Please click 'Manual Verification' to pass.";
        }
      });
    }

    // Manual pass trigger (always helpful in iframe sandboxes)
    const skipBtn = wrapper.querySelector("#speaking-skip-btn") as HTMLButtonElement;
    if (skipBtn) {
      skipBtn.addEventListener("click", () => {
        if (transcriptLog) transcriptLog.innerText = `"(Spell Certified: ${targetSpeak})"`;
        this.verifySpeakingAnswer(true, qWord, wrapper);
      });
    }
  }

  private verifySpeakingAnswer(isCorrect: boolean, correctWord: Word, wrapper: HTMLElement) {
    const feedback = wrapper.querySelector("#speaking-feedback") as HTMLElement;
    const recordBtn = wrapper.querySelector("#record-speaking-btn") as HTMLButtonElement;
    const skipBtn = wrapper.querySelector("#speaking-skip-btn") as HTMLButtonElement;

    if (recordBtn) recordBtn.setAttribute("disabled", "true");
    if (skipBtn) skipBtn.setAttribute("disabled", "true");

    this.dictionary.reportQuizResult(correctWord.german, isCorrect);

    if (isCorrect) {
      this.correctAnswersCount++;
      if (feedback) {
        feedback.className = "text-emerald-400 font-bold font-mono h-8 animate-float";
        feedback.innerText = "✨ OUTSTANDING! Pronunciation matches spell!";
      }
    } else {
      if (feedback) {
        feedback.className = "text-rose-400 font-bold font-mono h-8";
        feedback.innerText = `❌ WRONG ACCENT! Click skip or try saying: "${correctWord.german}"`;
      }
    }

    setTimeout(() => {
      this.nextQuestion();
    }, 2000);
  }

  // -------------------------------------------------------------
  // GAME MODE 7: EPIC BOSS BATTLE DUEL (VOCABULARY OVERLORD TROLL)
  // -------------------------------------------------------------
  private renderBossBattle(container: HTMLElement) {
    const qWord = this.currentQuestions[this.currentQIndex];
    if (!qWord) return;

    // Distractors
    const allWords = this.dictionary.getWords();
    const distractors = allWords
      .filter(w => w.english !== qWord.english)
      .map(w => w.english);

    const shuffledDistractors = this.shuffle(distractors).slice(0, 3);
    const options = this.shuffle([qWord.english, ...shuffledDistractors]);

    const wrapper = document.createElement("div");
    wrapper.className = "flex flex-col gap-6 max-w-lg mx-auto py-2";

    const html = `
      <!-- Boss State Dashboard -->
      <div class="glass-panel p-4 rounded-xl border border-red-500/20 flex flex-col sm:flex-row items-center justify-between gap-4" id="boss-stats-panel">
        <div class="flex items-center gap-3">
          <span class="text-4xl animate-float">👹</span>
          <div class="text-left">
            <h4 class="text-rose-400 font-display font-extrabold tracking-wider text-sm leading-tight">VOCAB OVERLORD TROLL</h4>
            <p class="text-[9px] text-slate-500 font-mono tracking-widest leading-none">TRAINING BOSS DUEL (Weakness: Spell accurate)</p>
          </div>
        </div>

        <!-- Boss physical HP state bar -->
        <div class="flex flex-col w-full sm:w-48 text-right">
          <div class="flex justify-between items-center text-[10px] font-mono text-rose-400 mb-1 leading-none font-bold">
            <span>MUTANT HP:</span>
            <span id="boss-hp-label">${this.bossHp}%</span>
          </div>
          <div class="h-3 w-full bg-slate-950 rounded-full border border-slate-800 overflow-hidden shadow-inner flex">
            <div class="h-full bg-gradient-to-r from-red-600 via-rose-500 to-amber-500 transition-all duration-300" id="boss-hp-bar" style="width: ${this.bossHp}%"></div>
          </div>
        </div>
      </div>

      <!-- Central Combat Stage Arena -->
      <div class="p-6 bg-radial-gradient from-slate-900 to-slate-950/80 rounded-2xl border border-slate-800 flex flex-col items-center justify-center text-center h-48 relative overflow-hidden" id="boss-combat-arena">
        <div class="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(239,68,68,0.06),transparent)] animate-pulse-slow"></div>
        <p class="text-[10px] uppercase text-violet-400 font-mono tracking-widest">CRITICAL SPELL QUERY</p>
        <h3 class="text-3xl font-display font-black text-slate-100 mt-2 neon-text-blue" id="boss-active-word-prompt">${qWord.german}</h3>
        <p class="text-xs text-slate-400 font-mono mt-1 italic leading-tight">Pick incorrect translation and face immediate hearts loss!</p>
      </div>

      <!-- Multiple spell options -->
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full mt-1">
        ${options.map((opt, i) => `
          <button class="boss-option-btn text-left p-3.5 bg-slate-900 border border-slate-800 hover:border-rose-500 rounded-xl text-xs font-semibold text-slate-350 hover:text-white transition-all transform hover:-translate-y-0.5" data-value="${opt}">
            <span class="w-5 h-5 rounded-full bg-rose-950 text-rose-400 border border-rose-500/10 text-[9px] font-mono flex items-center justify-center float-left mr-2.5">${i + 1}</span>
            <span>${opt}</span>
          </button>
        `).join("")}
      </div>

      <div class="h-8 text-center text-xs font-mono font-bold" id="boss-battle-feedback"></div>
    `;

    wrapper.innerHTML = html;
    container.appendChild(wrapper);

    // Bindings
    const buttons = wrapper.querySelectorAll(".boss-option-btn");
    buttons.forEach(btn => {
      btn.addEventListener("click", () => {
        const val = btn.getAttribute("data-value") || "";
        this.verifyBossAttack(val, qWord, btn as HTMLButtonElement, wrapper);
      });
    });
  }

  private verifyBossAttack(selected: string, correctWord: Word, clickedBtn: HTMLButtonElement, wrapper: HTMLElement) {
    const feedback = wrapper.querySelector("#boss-battle-feedback") as HTMLElement;
    const allBtns = wrapper.querySelectorAll(".boss-option-btn");
    const hpBar = wrapper.querySelector("#boss-hp-bar") as HTMLElement;
    const hpLabel = wrapper.querySelector("#boss-hp-label") as HTMLElement;
    const arena = wrapper.querySelector("#boss-combat-arena") as HTMLElement;
    const heartsLabel = document.getElementById("game-hud-hearts") as HTMLElement;

    allBtns.forEach(b => b.setAttribute("disabled", "true"));

    const isCorrect = (selected === correctWord.english);
    this.dictionary.reportQuizResult(correctWord.german, isCorrect);

    if (isCorrect) {
      // Cast fire spells onto Boss
      const damage = Math.ceil(100 / this.totalLessonsCount);
      this.bossHp = Math.max(0, this.bossHp - damage);
      this.correctAnswersCount++;

      clickedBtn.classList.remove("border-slate-800");
      clickedBtn.classList.add("border-emerald-500", "bg-emerald-950/20", "text-emerald-400");
      
      // Trigger arena damage flashes
      if (arena) {
        arena.classList.add("bg-violet-950/20");
        setTimeout(() => arena.classList.remove("bg-violet-950/20"), 300);
      }

      if (hpBar) hpBar.style.width = `${this.bossHp}%`;
      if (hpLabel) hpLabel.innerText = `${this.bossHp}%`;

      if (feedback) {
        feedback.className = "text-emerald-400 font-extrabold font-mono text-center h-8 animate-float";
        feedback.innerText = `🔥 BOOM! FEUERBALL deals -${damage} HP to Vocabulary Overlord!`;
      }
    } else {
      // Troll hits back
      this.userHearts--;
      
      clickedBtn.classList.remove("border-slate-800");
      clickedBtn.classList.add("border-rose-500", "bg-rose-950/20", "text-rose-450");

      if (arena) {
        arena.classList.add("animate-shake", "bg-rose-950/40");
        setTimeout(() => arena.classList.remove("animate-shake", "bg-rose-950/40"), 400);
      }

      // Highlight correct spelling choice
      allBtns.forEach(b => {
        if (b.getAttribute("data-value") === correctWord.english) {
          b.classList.add("border-emerald-500", "bg-emerald-950/15", "text-emerald-350");
        }
      });

      if (heartsLabel) {
        let heartsStr = "";
        const totalMaxHearts = this.maxHearts;
        for (let i = 0; i < totalMaxHearts; i++) heartsStr += i < this.userHearts ? "❤️" : "🖤";
        heartsLabel.innerText = heartsStr;
      }

      if (feedback) {
        feedback.className = "text-rose-400 font-extrabold font-mono text-center h-8";
        feedback.innerText = `💥 CRASH! Vocabulary Overlord strikes back! You lost 1 heart!`;
      }
    }

    // Evaluate survival / proceed
    setTimeout(() => {
      if (this.userHearts <= 0) {
        // Complete defeat
        this.renderGameOver(false);
      } else if (this.bossHp <= 0) {
        // Ultimate boss battle triumph!
        this.renderGameOver(true);
      } else {
        this.nextQuestion();
      }
    }, 2000);
  }

  // Draw Game Over Screen for Battle modes
  private renderGameOver(isVictory: boolean) {
    const parent = document.getElementById("game-sub-viewport");
    if (!parent) return;

    parent.innerHTML = "";
    const wrapper = document.createElement("div");
    wrapper.className = "flex flex-col items-center gap-5 text-center max-w-md mx-auto py-6 select-none";

    const accuracy = Math.round((this.correctAnswersCount / this.totalLessonsCount) * 100);

    if (isVictory) {
      // Victory screen layout
      wrapper.innerHTML = `
        <span class="text-6xl animate-float">👑</span>
        <h3 class="text-3xl font-display font-black text-amber-400 tracking-wider">BOSS VANQUISHED!</h3>
        <p class="text-slate-300 text-xs px-3 leading-relaxed">
          Amazing! You successfully conquered the <b>Vocabulary Overlord Troll</b> using weak words knowledge and precise spell translations. Maaz celebrates your majestic victory!
        </p>

        <div class="bg-indigo-950/30 border border-indigo-900/40 p-4 rounded-xl w-full flex justify-around text-center mt-2">
          <div>
            <p class="text-[10px] text-slate-400 font-mono">ACCURACY</p>
            <p class="text-xl font-mono font-bold text-emerald-400">${accuracy}%</p>
          </div>
          <div>
            <p class="text-[10px] text-slate-400 font-mono">GOLD AWARD</p>
            <p class="text-xl font-mono font-bold text-amber-400">🪙 +20g</p>
          </div>
          <div>
            <p class="text-[10px] text-slate-400 font-mono">XP AWARD</p>
            <p class="text-xl font-mono font-bold text-violet-400">🔥 +50 XP</p>
          </div>
        </div>

        <button class="w-full py-3 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 font-bold text-xs text-white glow-purple rpg-btn mt-3" id="boss-victory-claim">
          COLLECT HERO LOOT! ⚔️
        </button>
      `;

      parent.appendChild(wrapper);

      wrapper.querySelector("#boss-victory-claim")?.addEventListener("click", () => {
        this.onFinish(50, 20, accuracy, "boss");
      });

    } else {
      // Defeat screen
      wrapper.innerHTML = `
        <span class="text-6xl animate-pulse">💀</span>
        <h3 class="text-3xl font-display font-black text-rose-500 tracking-wider">YOU DIED</h3>
        <p class="text-slate-300 text-xs px-3 leading-relaxed">
          The Vocabulary Overlord defeated you. Spend coins in the <b>Lore Store</b> to restore streaks or buy boosters, protect your trouble words list, and fight him again!
        </p>

        <button class="w-full py-3 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 text-xs font-semibold text-slate-350 rpg-btn mt-3" id="boss-defeat-claim">
          Return to Guild Hall 🛡️
        </button>
      `;

      parent.appendChild(wrapper);

      wrapper.querySelector("#boss-defeat-claim")?.addEventListener("click", () => {
        this.onFinish(10, 1, accuracy, "boss_defeat"); // small pity loot
      });
    }
  }


  // -------------------------------------------------------------
  // LIFE CYCLE FOR SINGLE CHALLENGES
  // -------------------------------------------------------------
  private nextQuestion() {
    this.currentQIndex++;
    if (this.currentQIndex < this.totalLessonsCount) {
      this.renderActiveGame();
    } else {
      // Practice session finished normally! Calculate coins & XP
      let xpEarned = 15;
      let coinsEarned = 5;
      const finalAccuracy = Math.round((this.correctAnswersCount / this.totalLessonsCount) * 100);

      // Scale awards perfectly based on accuracy (lower gold coins, hard mode)
      if (finalAccuracy === 100) {
        xpEarned = 25;
        coinsEarned = 12;
      } else if (finalAccuracy >= 80) {
        xpEarned = 20;
        coinsEarned = 8;
      } else if (finalAccuracy < 50) {
        xpEarned = 10;
        coinsEarned = 2;
      }

      this.renderEndOfStandardSession(xpEarned, coinsEarned, finalAccuracy);
    }
  }

  // Draw Standard summary panel finished quiz
  private renderEndOfStandardSession(xp: number, coins: number, accuracy: number) {
    const parent = document.getElementById("game-sub-viewport");
    if (!parent) return;

    parent.innerHTML = "";
    const wrapper = document.createElement("div");
    wrapper.className = "flex flex-col items-center gap-5 text-center max-w-sm mx-auto py-6 select-none";

    wrapper.innerHTML = `
      <span class="text-6xl bounce-coin">💰</span>
      <h3 class="text-2xl font-display font-bold text-slate-100">Quest Cleared!</h3>
      <p class="text-slate-400 text-xs leading-relaxed">
        Excellent training adventurer! Your vocab spell handbook is growing stronger. Complete more practices to earn legendary ranking statuses.
      </p>

      <div class="bg-slate-900/80 border border-slate-800 p-4 rounded-xl w-full flex justify-around text-center mt-1">
        <div>
          <p class="text-[10px] text-slate-500 font-mono">ACCURACY</p>
          <p class="text-lg font-mono font-bold text-emerald-400 hover:scale-105 transition-transform">${accuracy}%</p>
        </div>
        <div>
          <p class="text-[10px] text-slate-500 font-mono">EARNED GOLD</p>
          <p class="text-lg font-mono font-bold text-amber-400">🪙 +${coins}g</p>
        </div>
        <div>
          <p class="text-[10px] text-slate-500 font-mono">EARNED XP</p>
          <p class="text-lg font-mono font-bold text-violet-400">🔥 +${xp} XP</p>
        </div>
      </div>

      <button class="w-full py-3 rounded-xl bg-violet-600 hover:bg-violet-500 font-bold text-xs text-white shadow-md glow-purple rpg-btn mt-3" id="standard-finish-btn">
        Claim Rewards & Return
      </button>
    `;

    parent.appendChild(wrapper);

    wrapper.querySelector("#standard-finish-btn")?.addEventListener("click", () => {
      this.onFinish(xp, coins, accuracy, this.currentMode);
    });
  }

  // -------------------------------------------------------------
  // GAME MODE 8: GENDER DEFENDER (der / die / das challenge)
  // -------------------------------------------------------------
  private renderGenderDefender(container: HTMLElement) {
    const qWord = this.currentQuestions[this.currentQIndex];
    if (!qWord) return;

    // Extract word without article
    const match = qWord.german.match(/^(der|die|das)\s+(.+)$/i);
    const correctArticle = match ? match[1].toLowerCase() : "der";
    const nounOnly = match ? match[2] : qWord.german;

    const wrapper = document.createElement("div");
    wrapper.className = "flex flex-col items-center gap-6 text-center max-w-md mx-auto py-4";

    wrapper.innerHTML = `
      <div class="px-3 py-1 bg-sky-950/60 border border-sky-500/20 text-sky-400 text-[10px] font-mono rounded-full uppercase tracking-wider">
        Choose correct article: der (masc) | die (fem) | das (neut)
      </div>
      <div>
        <h4 class="text-3xl font-display font-medium text-slate-100 neon-text-blue">${nounOnly}</h4>
        <p class="text-[11px] text-slate-400 font-mono mt-1">Meaning: "${qWord.english}"</p>
      </div>

      <div class="grid grid-cols-3 gap-3 w-full mt-2">
        <button class="gender-btn p-4 rounded-xl border border-sky-500/30 bg-sky-950/20 hover:bg-sky-955/40 text-sky-400 font-display font-bold text-sm tracking-wider cursor-pointer transition-all hover:scale-105 rpg-btn" data-article="der">
          <span class="block text-lg mb-1">🛡️</span>
          <span>der</span>
        </button>
        <button class="gender-btn p-4 rounded-xl border border-rose-500/30 bg-rose-950/20 hover:bg-rose-955/40 text-rose-400 font-display font-bold text-sm tracking-wider cursor-pointer transition-all hover:scale-105 rpg-btn" data-article="die">
          <span class="block text-lg mb-1">⚔️</span>
          <span>die</span>
        </button>
        <button class="gender-btn p-4 rounded-xl border border-emerald-500/30 bg-emerald-950/20 hover:bg-emerald-955/40 text-emerald-400 font-display font-bold text-sm tracking-wider cursor-pointer transition-all hover:scale-105 rpg-btn" data-article="das">
          <span class="block text-lg mb-1">👑</span>
          <span>das</span>
        </button>
      </div>

      <div class="h-8 text-xs font-mono font-medium" id="gender-feedback"></div>
    `;

    container.appendChild(wrapper);

    const buttons = wrapper.querySelectorAll(".gender-btn");
    buttons.forEach(btn => {
      btn.addEventListener("click", () => {
        const chosen = btn.getAttribute("data-article") || "";
        this.verifyGenderDefender(chosen, correctArticle, btn as HTMLButtonElement, wrapper);
      });
    });
  }

  private verifyGenderDefender(chosen: string, correct: string, clickedBtn: HTMLButtonElement, wrapper: HTMLElement) {
    const feedback = wrapper.querySelector("#gender-feedback") as HTMLElement;
    const allBtns = wrapper.querySelectorAll(".gender-btn");

    allBtns.forEach(btn => btn.setAttribute("disabled", "true"));

    const isCorrect = chosen === correct;
    this.dictionary.reportQuizResult(this.currentQuestions[this.currentQIndex].german, isCorrect);

    if (isCorrect) {
      this.correctAnswersCount++;
      AudioSFX.playCorrect();
      clickedBtn.classList.remove("border-sky-500/30", "border-rose-500/30", "border-emerald-500/30", "bg-sky-950/20", "bg-rose-950/20", "bg-emerald-950/20");
      clickedBtn.classList.add("border-emerald-500", "bg-emerald-950/30", "scale-[1.05]");
      if (feedback) {
        feedback.className = "text-emerald-400 font-bold font-mono h-8 animate-float";
        feedback.innerText = `✨ SEHR GUT! Correct article is "${correct}"!`;
      }
    } else {
      AudioSFX.playError();
      clickedBtn.classList.remove("border-sky-500/30", "border-rose-500/30", "border-emerald-500/30", "bg-sky-950/20", "bg-rose-950/20", "bg-emerald-950/20");
      clickedBtn.classList.add("border-rose-500", "bg-rose-950/30");
      
      allBtns.forEach(btn => {
        if (btn.getAttribute("data-article") === correct) {
          btn.classList.remove("border-sky-500/30", "border-rose-500/30", "border-emerald-500/30", "bg-sky-950/20", "bg-rose-950/20", "bg-emerald-950/20");
          btn.classList.add("border-emerald-500", "bg-emerald-950/20", "text-emerald-400");
        }
      });

      if (feedback) {
        feedback.className = "text-rose-400 font-bold font-mono h-8";
        feedback.innerText = `❌ INCORRECT! The correct article is "${correct}".`;
      }
    }

    setTimeout(() => {
      this.nextQuestion();
    }, 2000);
  }

  // -------------------------------------------------------------
  // GAME MODE 9: RUNE SCRAMBLER (letter-unscrambling spell)
  // -------------------------------------------------------------
  private renderRuneScrambler(container: HTMLElement) {
    const qWord = this.currentQuestions[this.currentQIndex];
    if (!qWord) return;

    // Strip article from word if present so we scramble the core word
    const match = qWord.german.match(/^(der|die|das)\s+(.+)$/i);
    const targetWord = match ? match[2] : qWord.german;

    // Scramble letters
    const letters = targetWord.split("");
    const scrambled = this.shuffle([...letters]);

    const wrapper = document.createElement("div");
    wrapper.className = "flex flex-col items-center gap-5 text-center mt-2 w-full max-w-md mx-auto py-2";

    let currentSpelled: string[] = [];

    wrapper.innerHTML = `
      <div class="px-3 py-1 bg-violet-950/60 border border-violet-500/20 text-violet-300 text-[10px] font-mono rounded-full uppercase tracking-wider">
        Spell-weaving: Tap runes in sequence to cast the spell
      </div>
      <div>
        <h4 class="text-md font-mono text-slate-400">Meaning: "${qWord.english}"</h4>
      </div>

      <!-- Live spelling status slots -->
      <div class="flex flex-wrap items-center justify-center gap-1.5 min-h-[50px] w-full" id="spelled-slots-container">
        ${letters.map(() => `
          <div class="w-9 h-11 border-b-2 border-slate-700 bg-slate-900/40 rounded-t-md flex items-center justify-center text-lg font-display font-bold text-violet-300"></div>
        `).join("")}
      </div>

      <!-- Interactive Rune Buttons -->
      <div class="flex flex-wrap items-center justify-center gap-2 mt-2 w-full" id="runes-container">
        ${scrambled.map((char, i) => `
          <button class="rune-stone-btn min-w-[38px] h-12 bg-slate-900 border border-slate-700/60 hover:border-violet-400 rounded-xl font-display text-lg font-bold text-slate-200 cursor-pointer hover:bg-slate-800 hover:text-white transition-all transform hover:-translate-y-0.5 shadow-md flex items-center justify-center select-none p-1" data-index="${i}" data-char="${char}">
            ${char}
          </button>
        `).join("")}
      </div>

      <!-- Action buttons -->
      <div class="flex items-center gap-3 w-full mt-2">
        <button class="flex-1 py-1.5 border border-slate-800 hover:border-slate-700 hover:bg-slate-900 text-[10px] font-semibold text-slate-400 rounded-lg rpg-btn cursor-pointer" id="scrambler-reset-btn">
          🧹 Clear Runes
        </button>
      </div>

      <div class="h-8 text-xs font-mono font-medium" id="scrambler-feedback"></div>
    `;

    container.appendChild(wrapper);

    const slots = wrapper.querySelectorAll("#spelled-slots-container div");
    const runeBtns = wrapper.querySelectorAll(".rune-stone-btn");
    const resetBtn = wrapper.querySelector("#scrambler-reset-btn");
    const feedback = wrapper.querySelector("#scrambler-feedback") as HTMLElement;

    const updateSlots = () => {
      slots.forEach((slot, idx) => {
        if (idx < currentSpelled.length) {
          slot.textContent = currentSpelled[idx];
          slot.className = "w-9 h-11 border-b-2 border-violet-500 bg-violet-950/20 rounded-t-md flex items-center justify-center text-lg font-display font-bold text-violet-350 animate-pulse";
        } else {
          slot.textContent = "";
          slot.className = "w-9 h-11 border-b-2 border-slate-700 bg-slate-900/40 rounded-t-md flex items-center justify-center text-lg font-display font-bold text-violet-350";
        }
      });
    };

    runeBtns.forEach(btn => {
      btn.addEventListener("click", () => {
        if (currentSpelled.length >= targetWord.length) return;

        const char = btn.getAttribute("data-char") || "";
        currentSpelled.push(char);
        
        // Disable and fade button
        btn.setAttribute("disabled", "true");
        btn.classList.add("opacity-20", "pointer-events-none");

        updateSlots();

        // Check completion
        if (currentSpelled.length === targetWord.length) {
          const spelledStr = currentSpelled.join("");
          const isCorrect = (spelledStr === targetWord);
          
          runeBtns.forEach(b => b.setAttribute("disabled", "true"));
          if (resetBtn) resetBtn.setAttribute("disabled", "true");

          this.dictionary.reportQuizResult(qWord.german, isCorrect);

          if (isCorrect) {
            this.correctAnswersCount++;
            AudioSFX.playCorrect();
            slots.forEach(s => {
              s.className = "w-9 h-11 border-b-2 border-emerald-500 bg-emerald-950/20 rounded-t-md flex items-center justify-center text-lg font-display font-bold text-emerald-400";
            });
            if (feedback) {
              feedback.className = "text-emerald-400 font-bold font-mono h-8 animate-float";
              feedback.innerText = "✨ RUNE SPELL BOUND SUCCESS! Flawless assembly!";
            }
          } else {
            AudioSFX.playError();
            slots.forEach(s => {
              s.className = "w-9 h-11 border-b-2 border-rose-500 bg-rose-950/20 rounded-t-md flex items-center justify-center text-lg font-display font-bold text-rose-400";
            });
            if (feedback) {
              feedback.className = "text-rose-400 font-bold font-mono h-8";
              feedback.innerText = `❌ SPELL COLLAPSED! Core word: "${targetWord}"`;
            }
          }

          setTimeout(() => {
            this.nextQuestion();
          }, 2000);
        }
      });
    });

    resetBtn?.addEventListener("click", () => {
      currentSpelled = [];
      updateSlots();
      runeBtns.forEach(btn => {
        btn.removeAttribute("disabled");
        btn.className = "rune-stone-btn min-w-[38px] h-12 bg-slate-900 border border-slate-700/60 hover:border-violet-400 rounded-xl font-display text-lg font-bold text-slate-200 cursor-pointer hover:bg-slate-800 hover:text-white transition-all transform hover:-translate-y-0.5 shadow-md flex items-center justify-center select-none p-1";
      });
    });
  }

  // -------------------------------------------------------------
  // GAME MODE 10: VOCAB ALCHEMIST (Reverse German selection)
  // -------------------------------------------------------------
  private renderAlchemist(container: HTMLElement) {
    const qWord = this.currentQuestions[this.currentQIndex];
    if (!qWord) return;

    // Distractors setup
    const allWords = this.dictionary.getWords();
    const fallbackOptions = [
      "der Hund", "die Katze", "das Buch", "der Apfel", "die Sonne", 
      "das Auto", "der Drache", "die Burg", "das Abenteuer", "der Wald", 
      "die Blume", "das Haus"
    ];

    // Build a set of unique distractors
    const distractorSet = new Set<string>();
    allWords
      .filter(w => w.german !== qWord.german)
      .forEach(w => distractorSet.add(w.german));

    // If we need more distractors, use fallbacks
    for (const fallback of fallbackOptions) {
      if (distractorSet.size >= 3) break;
      if (fallback !== qWord.german) {
        distractorSet.add(fallback);
      }
    }

    const shuffledDistractors = this.shuffle([...distractorSet]).slice(0, 3);
    const options = this.shuffle([qWord.german, ...shuffledDistractors]);

    const wrapper = document.createElement("div");
    wrapper.className = "flex flex-col items-center gap-6 text-center max-w-md mx-auto py-4 animate-fade-in";

    wrapper.innerHTML = `
      <div class="px-3 py-1 bg-amber-950/60 border border-amber-500/20 text-amber-300 text-[10px] font-mono rounded-full uppercase tracking-wider flex items-center gap-1 inline-flex mx-auto">
        🧪 Alchemist's Brew Quest
      </div>
      
      <div class="space-y-1">
        <span class="text-xs text-slate-500 uppercase tracking-widest font-mono">Synthesize the German term:</span>
        <h4 class="text-3xl font-display font-black text-slate-100 italic">"${qWord.english}"</h4>
      </div>
      
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3.5 w-full mt-2">
        ${options.map((opt, i) => `
          <button class="alchemist-option-btn text-left p-4 bg-slate-900 border border-slate-800 hover:border-amber-500 rounded-xl text-xs font-semibold text-slate-300 hover:text-white transition-all transform hover:-translate-y-0.5 shadow-md flex items-center justify-between rpg-btn" data-value="${opt}">
            <div class="flex items-center gap-2.5">
              <span class="w-5.5 h-5.5 rounded-lg bg-amber-950/45 border border-amber-500/30 text-amber-400 text-[10px] font-mono font-black flex items-center justify-center">${i + 1}</span>
              <span class="text-slate-200">${opt}</span>
            </div>
            <span class="text-sm opacity-20">⚗️</span>
          </button>
        `).join("")}
      </div>
      
      <div class="h-8 text-xs font-mono font-medium" id="alchemist-feedback"></div>
    `;

    container.appendChild(wrapper);

    // Bind events
    const buttons = wrapper.querySelectorAll(".alchemist-option-btn");
    buttons.forEach(btn => {
      btn.addEventListener("click", () => {
        const selected = btn.getAttribute("data-value") || "";
        this.verifyAlchemistAnswer(selected, qWord, btn as HTMLButtonElement, wrapper);
      });
    });
  }

  private verifyAlchemistAnswer(selected: string, correctWord: Word, clickedBtn: HTMLButtonElement, container: HTMLElement) {
    const feedback = container.querySelector("#alchemist-feedback") as HTMLElement;
    const allOptionBtns = container.querySelectorAll(".alchemist-option-btn");
    
    allOptionBtns.forEach(btn => btn.setAttribute("disabled", "true"));

    const isCorrect = selected === correctWord.german;
    this.dictionary.reportQuizResult(correctWord.german, isCorrect);

    if (isCorrect) {
      this.correctAnswersCount++;
      AudioSFX.playCorrect();
      clickedBtn.classList.remove("border-slate-800");
      clickedBtn.classList.add("border-amber-500", "bg-amber-950/20", "text-amber-300", "scale-[1.03]");
      if (feedback) {
        feedback.className = "text-amber-400 font-bold font-mono h-8 animate-float";
        feedback.innerText = `🧪 BREW PERFECTED! Perfect chemical fusion: "${correctWord.german}"!`;
      }
    } else {
      AudioSFX.playError();
      clickedBtn.classList.remove("border-slate-800");
      clickedBtn.classList.add("border-rose-500", "bg-rose-950/20", "text-rose-400");
      
      allOptionBtns.forEach(btn => {
        if (btn.getAttribute("data-value") === correctWord.german) {
          btn.classList.add("border-amber-500", "bg-amber-950/15", "text-amber-400");
        }
      });

      if (feedback) {
        feedback.className = "text-rose-400 font-bold font-mono h-8";
        feedback.innerText = `❌ EXPLOSION! Flask blew up! Correct formula is "${correctWord.german}".`;
      }
    }

    setTimeout(() => {
      this.nextQuestion();
    }, 2000);
  }
}
