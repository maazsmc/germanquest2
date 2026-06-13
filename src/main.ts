import "./index.css";
import { Dictionary, Word } from "./dictionary";
import { Analytics } from "./analytics";
import { Games } from "./games";
import { getClientOfflineTutorResponse } from "./tutor-offline";
import { AudioSFX, isSFXEnabled, toggleSFX } from "./audio";
import { initLanding3DEffects } from "./landing-3d";

// Global user profile state key
const PROFILE_KEY = "gq_user_profile";

interface UserProfile {
  level: number;
  xp: number;
  xpNeeded: number;
  streak: number;
  brokenStreak?: number;     // Store broken streak to allow gold coin repairs!
  coins: number;
  favoriteCategories: string[];
  weakWords: string[];
  achievements: string[];
  name: string;
  email: string;
  avatar: string;
  lastPracticeDate: string; // YYYY-MM-DD
  customTag?: string;       // Custom shop titles
}

// Default layout profile
const DEFAULT_PROFILE: UserProfile = {
  level: 1,
  xp: 0,
  xpNeeded: 100,
  streak: 0,
  brokenStreak: 0,
  coins: 0,
  favoriteCategories: ["Basics", "Adventure"],
  weakWords: [],
  achievements: [],
  name: "Guest Adventurer",
  email: "notconnect@domain.com",
  avatar: "🛡️",
  lastPracticeDate: ""
};

// Store custom items lists
interface StoreItem {
  id: string;
  name: string;
  description: string;
  price: number;
  icon: string;
  category: "powerup" | "customization" | "shield";
}

const STORE_ITEMS: StoreItem[] = [
  { id: "streak_freeze", name: "Streak Freeze Elixir", description: "Protects your active streak if you fail to train daily.", price: 40, icon: "❄️", category: "shield" },
  { id: "double_xp", name: "Double XP Quest Scroll", description: "Fills study sessions with deep dedication! Gives +50 experience points instantly.", price: 50, icon: "📜", category: "powerup" },
  { id: "health_potion", name: "Rune Potion of Healing", description: "Grants 1 buffer heart in your epic vocab Boss battles.", price: 20, icon: "🧪", category: "powerup" },
  { id: "title_archmage", name: "Title: Word Archmage", description: "Premium title badge drawn alongside your profile rank.", price: 100, icon: "🌌", category: "customization" },
  { id: "title_hero", name: "Title: Teutonic Champion", description: "Unlocks high-level respect badge in Hall of Fame rankings.", price: 80, icon: "🏷️", category: "customization" }
];

export class AppOrchestrator {
  private dictionary = new Dictionary();
  private analytics = new Analytics();
  private games!: Games;
  private profile!: UserProfile;
  
  // Chat memory
  private chatMessages: { role: "user" | "assistant"; content: string }[] = [];

  constructor() {
    this.initProfile();
    this.initDailyQuests();
    this.initModules();
    this.bindEvents();
    this.bindLandingEvents();
    this.initLandingInteractiveDemo();
    this.renderAllViews();
    this.initializeGoogleLogin();
    
    // Sync on boot up if auth is present
    const isGuest = this.profile.email && this.profile.email !== "notconnect@domain.com";
    const hasGoogle = !!localStorage.getItem("gq_google_access_token");
    if (hasGoogle || this.dictionary.getAppsScriptUrl()) {
      this.performManualSync();
    }
    
    // Automatically retrieve AI recommendations on startup
    if (isGuest || hasGoogle) {
      this.fetchSmartAIRecommendations();
    }
  }

  private initProfile() {
    const cached = localStorage.getItem(PROFILE_KEY);
    if (cached) {
      try {
        this.profile = JSON.parse(cached);
        // Verify streak on loading
        this.validateDailyStreak();
      } catch (e) {
        this.profile = { ...DEFAULT_PROFILE };
      }
    } else {
      this.profile = { ...DEFAULT_PROFILE };
      this.saveProfile();
    }
  }

  private initModules() {
    // Instantiate games controller
    this.games = new Games({
      dictionary: this.dictionary,
      onFinish: (xpEarned, coinsEarned, accuracy, gameMode) => {
        // Mark practice done inside daily quests progress tracker
        this.updateDailyQuestsProgress(0, 0, "practice");
        
        // Mage Bonus: +25% Gold Coins in Scrambler and Gender Defender modes!
        let finalCoins = coinsEarned;
        if (this.profile.customTag === "Spellslinger" && (gameMode === "scrambler" || gameMode === "gender")) {
          const classBonus = Math.round(coinsEarned * 0.25);
          finalCoins += classBonus;
          this.displayBannerNotification(`🔮 Spellslinger Perk: +25% Gold earned! (+${classBonus} Gold Dust)`, "amber");
        }

        this.rewardExperience(xpEarned, finalCoins);
        this.analytics.recordSession(accuracy, 10, gameMode);

        // Award 'conqueror' achievement if user vanquishes vocabulary boss
        if (gameMode === "boss" && !this.profile.achievements.includes("conqueror")) {
          this.profile.achievements.push("conqueror");
          this.displayBannerNotification("🏆 ACHIEVEMENT UNLOCKED: Vanquished Vocabulary Overlord!", "amber");
        }
        
        // Return to standard dashboard
        this.switchView("dashboard");
        this.renderAllViews();
        this.fetchSmartAIRecommendations(); // Refresh recommendation based on possible weak words changes
      },
      hasExtraBossHeart: () => {
        return this.profile.achievements.includes("extra_boss_heart");
      },
      consumeExtraBossHeart: () => {
        const heartIdx = this.profile.achievements.indexOf("extra_boss_heart");
        if (heartIdx !== -1) {
          this.profile.achievements.splice(heartIdx, 1);
          this.saveProfile();
        }
      },
      onNotification: (message, theme) => {
        this.displayBannerNotification(message, theme);
      }
    });

    // Seed preset tutor message
    this.chatMessages = [
      { role: "assistant", content: "Grüezi! I am Maaz, your tutor owl. Tap any preset topic below, ask a complex question, or practice talking German with me! Type your message and click 'Cast Spell'." }
    ];
  }

  private saveProfile() {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(this.profile));
    if (this.profile.email && this.profile.email !== "notconnect@domain.com" && this.profile.email !== "guest@domain.com") {
      const emailLower = this.profile.email.toLowerCase().trim();
      localStorage.setItem(`gq_profile_${emailLower}`, JSON.stringify(this.profile));
      localStorage.setItem(`gq_vocab_${emailLower}`, JSON.stringify(this.dictionary.getWords()));
      localStorage.setItem(`gq_history_${emailLower}`, JSON.stringify(this.analytics.getHistory()));
    }
  }

  // Daily Streak Management logic
  private validateDailyStreak() {
    const todayStr = this.formatDateLocal(new Date());
    if (!this.profile.lastPracticeDate) return;

    // Use noon reference to calculate exact integer day difference safely to avoid DST anomalies
    const lastDate = new Date(this.profile.lastPracticeDate + "T12:00:00");
    const todayDate = new Date(todayStr + "T12:00:00");
    const diffTime = todayDate.getTime() - lastDate.getTime();
    const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays > 1) {
      // Streak broken unless they have a Streak Freeze
      const freezeIndex = this.profile.achievements.indexOf("streak_freeze_active");
      if (freezeIndex !== -1) {
        // Use freeze
        this.profile.achievements.splice(freezeIndex, 1);
        this.displayBannerNotification("❄️ Streak Freeze Elixir Saved Your Active Streak!");
      } else {
        if (this.profile.streak > 0) {
          this.profile.brokenStreak = this.profile.streak;
          this.displayBannerNotification(`💔 Oh no! Your active ${this.profile.streak}-day streak expired. Use your Gold Coins to repair it!`, "indigo");
        }
        this.profile.streak = 0;
      }
      this.saveProfile();
    }
  }

  // Award rewards & check levels
  private rewardExperience(xpGain: number, coinsGain: number) {
    const todayStr = this.formatDateLocal(new Date());
    
    // Day tracker streak triggers
    if (this.profile.lastPracticeDate !== todayStr) {
      this.profile.streak += 1;
      this.profile.lastPracticeDate = todayStr;
      
      // Streak achievements checks
      if (this.profile.streak >= 3 && !this.profile.achievements.includes("streak_3")) {
        this.profile.achievements.push("streak_3");
        this.profile.coins += 50;
        this.displayBannerNotification("🏆 ACHIEVEMENT UNLOCKED: 3 Day Fire Streak!");
      }
    }

    // Shadow-Blade (Rogue) Perk: +15% XP
    let finalXpGain = xpGain;
    if (this.profile.customTag === "Shadow-Blade") {
      finalXpGain = Math.round(xpGain * 1.15);
      this.displayBannerNotification(`🦅 Shadow-Blade Perk Activated: +15% XP earned! (+${finalXpGain - xpGain} XP)`, "emerald");
    }

    this.profile.xp += finalXpGain;
    this.profile.coins += coinsGain;

    // Track for quest completion
    this.updateDailyQuestsProgress(finalXpGain, coinsGain);

    // Play retro game chimes
    if (coinsGain > 0) {
      AudioSFX.playCoin();
    } else if (xpGain > 0) {
      AudioSFX.playCorrect();
    }

    // Check level progression up
    if (this.profile.xp >= this.profile.xpNeeded) {
      this.profile.level += 1;
      this.profile.xp -= this.profile.xpNeeded;
      this.profile.xpNeeded = Math.round(this.profile.xpNeeded * 1.5);
      
      this.profile.coins += 100; // Grand reward
      
      // Levels achievements checks
      if (this.profile.level >= 3 && !this.profile.achievements.includes("level_3")) {
        this.profile.achievements.push("level_3");
        this.displayBannerNotification("🏆 ACHIEVEMENT UNLOCKED: Teutonic Master (Level 3!)");
      }
      
      this.displayBannerNotification(`🎉 CONGRATULATIONS! You advanced to Level ${this.profile.level} - ${this.getLevelTitle(this.profile.level)}!`, "emerald");
      // Epic level up synthesizer fanfare
      AudioSFX.playLevelUp();
    }

    // Update vocabulary targets
    this.profile.weakWords = this.dictionary.getWeakWords().map(w => w.german);

    this.saveProfile();
    this.renderHUD();
    this.performManualSync();
  }

  private getLevelTitle(lvl: number): string {
    if (lvl <= 1) return "Novice Recruit";
    if (lvl === 2) return "Word Gladiator";
    if (lvl === 3) return "Rune Tracker";
    if (lvl <= 5) return "Heroic Fluent";
    return "German Quest Archmage";
  }

  // Renders global top HUD labels
  private renderHUD() {
    const elLevel = document.getElementById("hud-level");
    const elTitle = document.getElementById("hud-rank-title");
    const elXpText = document.getElementById("hud-xp-text");
    const elXpBar = document.getElementById("hud-xp-bar");
    const elStreak = document.getElementById("hud-streak");
    const elCoins = document.getElementById("hud-coins");
    const elSyncLabel = document.getElementById("sync-label");
    const elSyncDot = document.getElementById("sync-status");

    // Profile details
    const elUserName = document.getElementById("user-name");
    const elUserEmail = document.getElementById("user-email-subtitle");

    if (elLevel) elLevel.innerText = `${this.profile.level}`;
    if (elTitle) elTitle.innerText = `${this.getLevelTitle(this.profile.level)}`;
    if (elXpText) elXpText.innerText = `${this.profile.xp} / ${this.profile.xpNeeded} XP`;
    if (elXpBar) {
      const pct = Math.min(100, Math.round((this.profile.xp / this.profile.xpNeeded) * 100));
      elXpBar.style.width = `${pct}%`;
    }
    if (elStreak) elStreak.innerText = `${this.profile.streak} Day${this.profile.streak === 1 ? "" : "s"}`;
    if (elCoins) elCoins.innerText = `${this.profile.coins}`;

    // Update connection labels
    const accessToken = localStorage.getItem("gq_google_access_token");
    const scriptUrl = this.dictionary.getAppsScriptUrl();
    if (elSyncLabel && elSyncDot) {
      if (accessToken) {
        elSyncLabel.innerText = "Google Cloud Active";
        elSyncLabel.className = "text-emerald-400 font-bold";
        elSyncDot.className = "w-2.5 h-2.5 rounded-full bg-emerald-500 status-dot-pulse";
      } else if (scriptUrl) {
        elSyncLabel.innerText = "Synced Sheets";
        elSyncLabel.className = "text-emerald-400 font-bold";
        elSyncDot.className = "w-2.5 h-2.5 rounded-full bg-emerald-500 status-dot-pulse";
      } else {
        elSyncLabel.innerText = "Local Offline";
        elSyncLabel.className = "text-amber-400 font-bold";
        elSyncDot.className = "w-2.5 h-2.5 rounded-full bg-amber-500 status-dot-pulse";
      }
    }

    // Dynamic rendering of Connect button labels
    const loginBtn = document.getElementById("login-trigger-btn");
    if (loginBtn) {
      if (accessToken) {
        loginBtn.innerHTML = "Logout";
        loginBtn.className = "px-3 py-1.5 rounded-lg border border-rose-500/30 hover:bg-rose-950/20 text-xs text-rose-400 hover:text-rose-300 transition-all rpg-btn font-mono font-bold";
      } else if (this.profile.email && this.profile.email !== "notconnect@domain.com") {
        loginBtn.innerHTML = "Logout";
        loginBtn.className = "px-3 py-1.5 rounded-lg border border-rose-500/35 hover:bg-rose-950/20 text-xs text-rose-400 hover:text-rose-300 transition-all rpg-btn font-mono font-bold";
      } else {
        loginBtn.innerHTML = `
          <span class="flex items-center gap-1.5">
            <svg class="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path fill="#EA4335" d="M12.24 10.285V14.4h6.887c-.648 2.41-2.519 4.114-6.887 4.114-4.636 0-8.358-3.722-8.358-8.358s3.722-8.358 8.358-8.358c2.15 0 4.152.822 5.673 2.34l3.056-3.056C18.232 1.346 15.356 0 12.24 0 5.48 0 0 5.48 0 12.24s5.48 12.24 12.24 12.24c6.702 0 12.24-5.388 12.24-12.24 0-.776-.08-1.536-.208-2.28H12.24z"/>
            </svg>
            Sign in with Google
          </span>
        `;
        loginBtn.className = "px-3 py-1.5 rounded-lg border border-violet-500/40 bg-violet-950/20 hover:bg-violet-900/30 text-xs text-violet-300 hover:text-white transition-all rpg-btn font-sans font-bold flex items-center justify-center glow-purple-sm";
      }
    }

    if (elUserName) elUserName.innerText = this.profile.name;
    if (elUserEmail) {
      elUserEmail.innerText = this.profile.email === "notconnect@domain.com" ? "Local Database active" : this.profile.email;
    }
  }

  // Switch Sub-Tab views
  public switchView(tabTarget: string) {
    // Toggle active tab buttons colors
    const tabs = document.querySelectorAll(".nav-tab");
    tabs.forEach(tab => {
      const isMatch = tab.getAttribute("data-target") === tabTarget;
      if (isMatch) {
        tab.className = "nav-tab flex items-center gap-3 w-full text-left px-4 py-3 rounded-xl transition-all font-display font-medium text-sm rpg-btn bg-violet-600/20 border border-violet-500/30 text-white";
      } else {
        tab.className = "nav-tab flex items-center gap-3 w-full text-left px-4 py-3 rounded-xl transition-all font-display font-medium text-sm rpg-btn text-slate-400 hover:text-slate-200 hover:bg-slate-850";
      }
    });

    // Toggle view layout divs
    const screens = document.querySelectorAll(".view-screen");
    screens.forEach(screen => {
      if (screen.id === `view-${tabTarget}`) {
        screen.classList.remove("hidden");
        screen.classList.add("flex");
      } else {
        screen.classList.remove("flex");
        screen.classList.add("hidden");
      }
    });

    // Reset games selections block on moving to practices
    if (tabTarget === "games") {
      const selectArena = document.getElementById("games-selection-screen");
      const activePlayground = document.getElementById("game-playground");
      if (selectArena) selectArena.classList.remove("hidden");
      if (activePlayground) activePlayground.classList.add("hidden");
    }
  }

  // Draw sections
  private renderAllViews() {
    this.renderLandingAndAppToggle();
    this.renderHUD();
    this.renderDashboardStats();
    this.renderDashboardAchievements();
    this.renderDailyQuests();
    this.renderInteractiveStreakWidget();
    this.renderDictionaryGrid();
    this.renderShopShelf();
    this.renderLeaderboardList();
    this.renderAIChatMemory();
    this.renderClassPerks();
  }

  // Renders stats card
  private renderDashboardStats() {
    const totWords = document.getElementById("stats-total-words");
    const avgAccuracy = document.getElementById("stats-accuracy");
    const practsRun = document.getElementById("stats-practices-run");
    const totFavs = document.getElementById("stats-favorites");

    const wordsList = this.dictionary.getWords();
    const weakList = this.dictionary.getWeakWords();

    if (totWords) totWords.innerText = `${wordsList.length}`;
    if (avgAccuracy) avgAccuracy.innerText = `${this.analytics.getAverageAccuracy()}%`;
    if (practsRun) practsRun.innerText = `${this.analytics.getHistory().length}`;
    if (totFavs) totFavs.innerText = `${wordsList.filter(w => w.isFavorite).length}`;

    // Render Weekly Activity SVG Chart
    this.analytics.renderSVGChart("activity-chart-container");

    // Render trouble list
    const troubleBox = document.getElementById("dashboard-weak-words-list");
    if (troubleBox) {
      troubleBox.innerHTML = "";
      if (weakList.length === 0) {
        troubleBox.innerHTML = `
          <div class="text-center py-8 text-slate-500 text-xs">
            ✨ Perfect standing! No trouble words. Learn more vocabulary inside Quest Book!
          </div>
        `;
      } else {
        weakList.slice(0, 4).forEach(word => {
          const row = document.createElement("div");
          row.className = "flex items-center justify-between p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-xs font-mono";
          
          row.innerHTML = `
            <div>
              <span class="text-rose-400 font-bold block">${word.german}</span>
              <span class="text-[10px] text-slate-400 block">${word.english}</span>
            </div>
            <div class="text-right">
              <span class="text-[9px] text-slate-505 block uppercase">Accuracy</span>
              <span class="text-[10px] text-rose-400 font-bold font-mono">-${word.errorCount} Errors</span>
            </div>
          `;
          troubleBox.appendChild(row);
        });
      }
    }
  }

  // Achievements section renderer
  private renderDashboardAchievements() {
    const box = document.getElementById("achievements-container");
    if (!box) return;

    // Static check list matching current project states
    const achievementsList = [
      { id: "recruit", title: "Recruit Forge", desc: "Forge your default handbook", icon: "🛡️" },
      { id: "scholar", title: "Dictionary Scholar", desc: "Curated a deck of 15+ German terms", icon: "📚" },
      { id: "level_3", title: "Teutonic Master", desc: "Unlock level 3 rank", icon: "⚔️" },
      { id: "streak_3", title: "Ethereal Flame", desc: "Maintain a 3-day daily streak", icon: "🔥" },
      { id: "conqueror", title: "Vanquisher Overlord", desc: "Defeated Vocabulary Overlord", icon: "👹" },
      { id: "wealthy", title: "Virtual Tycoon", desc: "Possess 300+ shiny gold coins", icon: "🪙" }
    ];

    box.innerHTML = "";
    achievementsList.forEach(ach => {
      const isUnlocked = this.profile.achievements.includes(ach.id) 
        || (ach.id === "recruit" && this.dictionary.getWords().length > 0)
        || (ach.id === "scholar" && this.dictionary.getWords().length >= 15)
        || (ach.id === "wealthy" && this.profile.coins >= 300);
      
      const card = document.createElement("div");
      card.className = `p-3 rounded-xl flex items-center gap-3 border ${
        isUnlocked 
          ? "bg-amber-950/15 border-amber-500/30 text-amber-300 shadow-inner" 
          : "bg-slate-900/60 border-slate-800/80 text-slate-500 opacity-60"
      }`;

      card.innerHTML = `
        <span class="text-2xl">${ach.icon}</span>
        <div class="text-left">
          <h4 class="font-display font-bold text-xs leading-tight">${ach.title}</h4>
          <p class="text-[9px] text-slate-400 font-sans leading-none mt-0.5">${isUnlocked ? ach.desc : "Locked Quest"}</p>
        </div>
      `;
      box.appendChild(card);
    });
  }

  // Daily Quests system methods
  private dailyQuests: any[] = [];

  private initDailyQuests() {
    const todayStr = this.formatDateLocal(new Date());
    const cachedQuests = localStorage.getItem("gq_daily_quests");
    const cachedDate = localStorage.getItem("gq_daily_quests_date");

    if (cachedQuests && cachedDate === todayStr) {
      try {
        this.dailyQuests = JSON.parse(cachedQuests);
        return;
      } catch (e) {
        // rebuild fallback
      }
    }

    // Generate daily random RPG-flavored quests
    this.dailyQuests = [
      {
        id: "quest_practice",
        title: "Daily Sentry Patrol",
        desc: "Complete any gaming challenge inside the Training Arena",
        icon: "⚔️",
        target: 1,
        current: 0,
        rewardCoins: 30,
        rewardXp: 15,
        claimed: false
      },
      {
        id: "quest_coins",
        title: "Dungeon Loot",
        desc: "Earn at least 50 Gold Coins from your lesson study sessions",
        icon: "🪙",
        target: 50,
        current: 0,
        rewardCoins: 40,
        rewardXp: 20,
        claimed: false
      },
      {
        id: "quest_tutor",
        title: "Wisdom of the Owls",
        desc: "Converse with Companion Maaz in the AI Citadel Tutor",
        icon: "🦉",
        target: 1,
        current: 0,
        rewardCoins: 35,
        rewardXp: 15,
        claimed: false
      }
    ];

    localStorage.setItem("gq_daily_quests", JSON.stringify(this.dailyQuests));
    localStorage.setItem("gq_daily_quests_date", todayStr);
  }

  private saveDailyQuests() {
    localStorage.setItem("gq_daily_quests", JSON.stringify(this.dailyQuests));
  }

  private updateDailyQuestsProgress(xpGain: number, coinsGain: number, type?: "practice" | "tutor") {
    let changed = false;
    this.dailyQuests.forEach(quest => {
      if (quest.claimed) return;

      if (quest.id === "quest_practice" && type === "practice") {
        quest.current = Math.min(quest.target, quest.current + 1);
        changed = true;
      } else if (quest.id === "quest_coins" && coinsGain > 0) {
        quest.current = Math.min(quest.target, quest.current + coinsGain);
        changed = true;
      } else if (quest.id === "quest_tutor" && type === "tutor") {
        quest.current = Math.min(quest.target, quest.current + 1);
        changed = true;
      }
    });

    if (changed) {
      this.saveDailyQuests();
      this.renderDailyQuests();
    }
  }

  private claimQuestReward(id: string) {
    const quest = this.dailyQuests.find(q => q.id === id);
    if (!quest || quest.claimed || quest.current < quest.target) return;

    quest.claimed = true;
    this.saveDailyQuests();

    // Gift rewards
    this.profile.coins += quest.rewardCoins;
    this.profile.xp += quest.rewardXp;

    // Play retro synthetic bells and register chimes
    AudioSFX.playCoin();
    AudioSFX.playVictory();

    this.displayBannerNotification(`🏆 Quest Claimed! Received +${quest.rewardCoins} Gold and +${quest.rewardXp} XP!`, "emerald");

    // Upgrade verification
    if (this.profile.xp >= this.profile.xpNeeded) {
      this.profile.level += 1;
      this.profile.xp -= this.profile.xpNeeded;
      this.profile.xpNeeded = Math.round(this.profile.xpNeeded * 1.5);
      this.profile.coins += 100;
      this.displayBannerNotification(`🎉 HEROIC ASCENSION! You leveled up to Level ${this.profile.level}!`, "emerald");
      AudioSFX.playLevelUp();
    }

    this.saveProfile();
    this.renderHUD();
    this.renderDailyQuests();
    this.renderAllViews();
  }

  private renderDailyQuests() {
    const container = document.getElementById("daily-questboard-container");
    if (!container) return;

    container.innerHTML = "";

    this.dailyQuests.forEach(quest => {
      const isComplete = quest.current >= quest.target;
      const pct = Math.min(100, Math.round((quest.current / quest.target) * 100));

      const card = document.createElement("div");
      card.className = `p-4 rounded-xl border flex flex-col justify-between gap-3 ${
        quest.claimed 
          ? "bg-slate-900/40 border-slate-800/80 text-slate-500 opacity-60" 
          : isComplete 
            ? "bg-violet-950/15 border-violet-500/40 text-slate-150 glow-purple" 
            : "bg-slate-900/60 border-slate-800 text-slate-300"
      }`;

      card.innerHTML = `
        <div class="flex items-start gap-3">
          <span class="text-2xl p-2 bg-slate-950/60 rounded-xl border border-slate-800 shrink-0 select-none">${quest.icon}</span>
          <div class="text-left">
            <h4 class="font-display font-bold text-xs text-slate-200 leading-snug">${quest.title}</h4>
            <p class="text-[10px] text-slate-400 font-sans mt-0.5 leading-relaxed">${quest.desc}</p>
          </div>
        </div>

        <div class="flex flex-col gap-1.5 mt-1">
          <div class="flex justify-between text-[9px] font-mono text-slate-400 leading-none">
            <span>Progress</span>
            <span>${quest.current} / ${quest.target}</span>
          </div>
          <div class="h-1.5 w-full bg-slate-950 rounded-full overflow-hidden border border-slate-850">
            <div class="h-full bg-gradient-to-r from-violet-500 to-indigo-500 transition-all duration-300" style="width: ${pct}%"></div>
          </div>
        </div>

        <div class="flex items-center justify-between border-t border-slate-800/60 pt-2.5 mt-1">
          <div class="flex items-center gap-1.5 text-[9px] font-mono text-slate-400">
            <span>Reward:</span>
            <span class="text-amber-400">🪙 ${quest.rewardCoins}g</span>
            <span>/</span>
            <span class="text-violet-400">✨ ${quest.rewardXp}xp</span>
          </div>

          ${
            quest.claimed 
              ? `<span class="text-[10px] font-mono text-emerald-500 font-bold flex items-center gap-1">🛡️ Claimed</span>` 
              : isComplete
                ? `<button class="claim-quest-btn px-2.5 py-1 text-[10px] font-bold text-white rounded bg-emerald-600 hover:bg-emerald-500 transition-all cursor-pointer animate-pulse shrink-0" data-id="${quest.id}">Claim</button>`
                : `<span class="text-[9px] font-mono text-slate-500">Studying...</span>`
          }
        </div>
      `;

      container.appendChild(card);
    });

    // Attach click events
    container.querySelectorAll(".claim-quest-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-id") || "";
        this.claimQuestReward(id);
      });
    });
  }

  // Helper formats dates correctly to YYYY-MM-DD
  private formatDateLocal(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  // Get date references for Sunday to Saturday of active week
  private getCurrentWeekDates(): Date[] {
    const current = new Date();
    const week: Date[] = [];
    // Get Sunday of the current week
    const sunday = new Date(current);
    const day = current.getDay(); // 0 = Sunday, 1 = Monday ...
    sunday.setDate(current.getDate() - day);
    
    for (let i = 0; i < 7; i++) {
      const nextDay = new Date(sunday);
      nextDay.setDate(sunday.getDate() + i);
      week.push(nextDay);
    }
    return week;
  }

  // Interactive high-fidelity Duolingo-style Streak Widget with Gold Coin repair
  private renderInteractiveStreakWidget() {
    const container = document.getElementById("interactive-streak-widget");
    if (!container) return;

    const streakCount = this.profile.streak;
    const brokenStreak = this.profile.brokenStreak || 0;
    const todayStr = this.formatDateLocal(new Date());
    const weekDates = this.getCurrentWeekDates();

    // Check if practiced today
    const practicedToday = this.analytics.getHistory().some(h => h.date === todayStr) || this.profile.lastPracticeDate === todayStr;

    let widgetContent = "";

    // 1. Title/Header (Flame + bold streak text)
    widgetContent += `
      <div class="flex flex-col items-center gap-1">
        <!-- Giant Duolingo Fire Flame element with overlay streak number -->
        <div class="relative w-28 h-28 flex items-center justify-center select-none select-none animate-float">
          <!-- Flame SVG with glowing effects -->
          <svg class="w-full h-full filter drop-shadow-[0_6px_16px_rgba(249,115,22,0.45)]" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2050/svg">
            <!-- Outer orange gradient fire petal -->
            <path d="M50 8 C50 8 82 38 82 62 C82 78.5 67.5 92 50 92 C32.5 92 18 78.5 18 62 C18 38 50 8 50 8 Z" fill="url(#outerFlameGrad)" />
            <!-- Inner glowing yellow fire petal -->
            <path d="M50 32 C50 32 70 52 70 67 C70 77.5 61 86 50 86 C39 86 30 77.5 30 67 C30 52 50 32 50 32 Z" fill="url(#innerFlameGrad)" />
            <defs>
              <linearGradient id="outerFlameGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stop-color="#f97316" />
                <stop offset="100%" stop-color="#ea580c" />
              </linearGradient>
              <linearGradient id="innerFlameGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stop-color="#eab308" />
                <stop offset="100%" stop-color="#ca8a04" />
              </linearGradient>
            </defs>
          </svg>
          
          <!-- Large White outline-stroke text centered on the bottom half of the Flame -->
          <div class="absolute bottom-4 text-center font-display leading-none tracking-tight text-white select-none pointer-events-none" style="font-size: 32px; font-weight: 900; -webkit-text-stroke: 4px #0f171c; paint-order: stroke fill; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.5));">
            ${streakCount}
          </div>
        </div>
        
        <h3 class="text-orange-400 font-extrabold text-lg tracking-wider uppercase mt-1 leading-none select-none drop-shadow-sm flex items-center gap-1.5">
          <span>🔥</span> ${streakCount} DAY STREAK!
        </h3>
      </div>
    `;

    // 2. Weekly grid panel (Su Mo Tu We Th Fr Sa)
    widgetContent += `
      <div class="flex items-center justify-between w-full max-w-sm mx-auto bg-slate-950/45 p-4 rounded-2xl border border-slate-800/80 mt-1 gap-1 relative z-10 transition-all">
        ${weekDates.map((date, idx) => {
          const dateStr = this.formatDateLocal(date);
          const isPracticed = this.analytics.getHistory().some(h => h.date === dateStr) || this.profile.lastPracticeDate === dateStr;
          const isNextPracticed = idx < 6 && (() => {
            const nextDateStr = this.formatDateLocal(weekDates[idx + 1]);
            return this.analytics.getHistory().some(h => h.date === nextDateStr) || this.profile.lastPracticeDate === nextDateStr;
          })();
          
          const isToday = dateStr === todayStr;
          const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
          const dayNameFull = dayNames[idx];
          const dayNameShort = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"][idx];
          const dayNumber = idx + 1; // 1 to 7 range
          
          return `
            <div class="flex flex-col items-center gap-2 flex-1 relative ${isToday ? 'scale-105 z-20' : ''}">
              <!-- Underneath Connection capsule pill -->
              ${isPracticed && isNextPracticed ? `
                <div class="absolute left-1/2 top-[32px] w-[calc(100%+14px)] h-8 bg-gradient-to-r from-orange-500 to-amber-500 rounded-full -z-10 opacity-95 shadow-inner"></div>
              ` : ""}
              
              <!-- Day label text header (bold if today) -->
              <span class="text-[9.5px] font-mono tracking-wider select-none text-center ${
                isToday 
                  ? 'text-violet-400 font-black border border-violet-500/40 bg-violet-950/70 px-1 py-0.5 rounded shadow-[0_0_8px_rgba(139,92,246,0.4)]' 
                  : isPracticed 
                    ? 'text-orange-400 font-bold' 
                    : 'text-slate-500 font-medium'
              }">
                ${dayNameShort}${isToday ? ' ★' : ''}
              </span>
              
              <!-- Circular graphic slot -->
              <div class="relative z-10 flex items-center justify-center h-9">
                ${isPracticed 
                  ? `
                    <div class="w-8 h-8 rounded-full bg-gradient-to-br from-orange-400 via-amber-400 to-orange-500 text-slate-950 font-black flex items-center justify-center text-sm shadow-[0_0_10px_rgba(249,115,22,0.4)] border-2 border-slate-950 select-none animate-float">
                      ✓
                    </div>
                  ` 
                  : idx === 6 
                    ? `
                      <div class="w-8 h-8 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center text-xs select-none text-slate-500 hover:text-amber-400 cursor-help" title="Weekly Star Finish Goal">
                        ⭐
                      </div>
                    ` 
                    : isToday
                      ? `
                        <div class="w-8.5 h-8.5 rounded-full bg-slate-950 border-2 border-violet-500 ring-4 ring-violet-500/20 flex items-center justify-center select-none shadow-[0_0_12px_rgba(139,92,246,0.5)]">
                          <div class="w-3.5 h-3.5 rounded-full bg-violet-400 animate-ping absolute opacity-75"></div>
                          <div class="relative w-2.5 h-2.5 rounded-full bg-violet-500 animate-pulse"></div>
                        </div>
                      `
                      : `
                        <div class="w-8 h-8 rounded-full bg-slate-900/80 border border-slate-800 flex items-center justify-center select-none">
                          <div class="w-2.5 h-2.5 rounded-full bg-slate-700"></div>
                        </div>
                      `
                }
              </div>

              <!-- Explicit Day Index (D1 - D7) under the bubble, emphasizing Sunday is Day 1 -->
              <span class="text-[8px] font-mono tracking-tighter select-none ${
                isToday 
                  ? 'text-violet-300 font-black' 
                  : isPracticed 
                    ? 'text-orange-400 font-bold' 
                    : 'text-slate-600 font-medium'
              }">
                D${dayNumber}
              </span>
            </div>
          `;
        }).join("")}
      </div>
    `;

    // 3. Informational status bar below the week tracker
    widgetContent += `
      <div class="text-xs text-slate-350 leading-relaxed max-w-sm text-center font-sans mt-0.5">
        ${practicedToday 
          ? `Great start! Keep your <strong class="text-amber-400 font-medium">perfect streak</strong> going tomorrow.` 
          : `Unravel ancient spells! Complete any gaming challenge today to keep your streak burning.`
        }
      </div>
    `;

    // 4. Streak Repaired UI component if a broken streak exists
    if (brokenStreak > 0) {
      widgetContent += `
        <div class="mt-2 w-full max-w-md bg-gradient-to-tr from-rose-950/60 to-slate-950 border border-rose-500/20 p-4 rounded-2xl flex flex-col items-center gap-2.5 shadow-xl animate-float">
          <div class="flex items-center gap-1.5 text-center text-xs font-bold text-rose-300">
            <span>💔</span> STREAK AT RISK: LOST AN ACTIVE ${brokenStreak}-DAY STREAK!
          </div>
          <p class="text-[10.5px] text-slate-400 leading-normal max-w-sm">
            Silence extinguished your campfire, but your dedication can light it once more. Repair your full daily streak now!
          </p>
          <button id="repair-streak-action-btn" class="px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 via-amber-400 to-orange-500 hover:from-amber-400 hover:to-orange-400 font-bold text-xs text-slate-950 shadow-md flex items-center gap-2 cursor-pointer transition-all active:scale-[0.97] hover:scale-[1.03] select-none">
            <span>🔧</span> REPAIR STREAK (🪙 200 Gold Coins)
          </button>
        </div>
      `;
    }

    container.innerHTML = widgetContent;

    // Attach click listener for streak repair
    const repairBtn = container.querySelector("#repair-streak-action-btn");
    if (repairBtn) {
      repairBtn.addEventListener("click", () => {
        if (this.profile.coins >= 200) {
          this.profile.coins -= 200;
          this.profile.streak = brokenStreak;
          this.profile.brokenStreak = 0;
          
          this.saveProfile();
          AudioSFX.playCoin();
          AudioSFX.playVictory();
          
          this.displayBannerNotification(`🔥 STREAK RESTORED! Your legendary ${this.profile.streak}-day streak burns bright!`, "emerald");
          this.renderAllViews();
        } else {
          AudioSFX.playError();
          this.displayBannerNotification("❌ Insufficient Funds! Earn 200 Gold Coins from training games or quests to buy a repair.", "purple");
        }
      });
    }
  }

  private renderClassPerks() {
    const elBadge = document.getElementById("hud-class-badge");
    const elDesc = document.getElementById("hud-class-perk-desc");
    if (!elBadge || !elDesc) return;

    if (!this.profile.customTag || this.profile.customTag === "Cavalier" || this.profile.customTag === "None") {
      this.profile.customTag = "Spellslinger";
    }

    const curClass = this.profile.customTag;
    
    if (curClass === "Spellslinger") {
      elBadge.innerHTML = "🔮 Spellslinger";
      elDesc.innerHTML = `<span class="text-violet-400 font-semibold underline">Mage Perk:</span> Earn <strong class="text-amber-400">+25% Gold Coins</strong> in Rune Scrambler & Gender Defender.`;
    } else if (curClass === "Shield-Bearer") {
      elBadge.innerHTML = "🛡️ Shield-Bearer";
      elDesc.innerHTML = `<span class="text-sky-400 font-semibold underline">Warrior Perk:</span> Start Boss Battles with <strong class="text-rose-400">+1 Extra Heart (Max 4!)</strong>.`;
    } else if (curClass === "Shadow-Blade") {
      elBadge.innerHTML = "🦅 Shadow-Blade";
      elDesc.innerHTML = `<span class="text-emerald-400 font-semibold underline">Rogue Perk:</span> Earn <strong class="text-emerald-400">+15% bonus experience (XP)</strong> from all games.`;
    }

    // Set highlights on selected buttons
    const classButtons = document.querySelectorAll(".class-select-btn");
    classButtons.forEach(btn => {
      const cls = btn.getAttribute("data-class");
      if (cls === curClass) {
        btn.className = "class-select-btn p-1.5 rounded-lg border border-violet-500 bg-violet-950/40 text-[10px] font-bold text-white shadow-md cursor-pointer transition-all text-center";
      } else {
        btn.className = "class-select-btn p-1.5 rounded-lg border border-slate-800 bg-slate-900/60 text-[10px] font-bold text-slate-350 hover:bg-slate-800 hover:text-white cursor-pointer hover:border-violet-500/50 transition-all text-center";
      }
    });
  }

  // Smart AI Recommendations generator
  private async fetchSmartAIRecommendations(force: boolean = false) {
    const isGuest = this.profile.email && this.profile.email !== "notconnect@domain.com";
    const hasGoogle = !!localStorage.getItem("gq_google_access_token");
    if (!(isGuest || hasGoogle)) return;

    const recommContainer = document.getElementById("dashboard-recomm-container");
    if (!recommContainer) return;

    // Read cache first if we are not forcing a refresh
    const cacheKey = "gq_smart_recomms_v1";
    const cachedData = localStorage.getItem(cacheKey);

    if (cachedData && !force) {
      try {
        const parsed = JSON.parse(cachedData);
        if (Array.isArray(parsed) && parsed.length > 0) {
          this.renderRecommendationsUI(parsed);
          return;
        }
      } catch (err) {
        // Fall back to loader
      }
    }

    // Default high-quality fallback presets to avoid making any API requests whatsoever if we are just starting under quota
    const fallbackPresets = [
      {
        word: "der Drache",
        meaning: "the dragon",
        category: "Fantasy",
        difficulty: "Easy",
        xpAward: 30,
        lore: "A fierce fire-breathing guild creature with massive wing spans."
      },
      {
        word: "das Abenteuer",
        meaning: "the adventure",
        category: "Roleplay",
        difficulty: "Medium",
        xpAward: 45,
        lore: "An epic sequence of trials testing your focus state stamina."
      },
      {
        word: "die Burg",
        meaning: "the castle",
        category: "Castle",
        difficulty: "Easy",
        xpAward: 30,
        lore: "A towering stone fortification shielding villagers from the wild woods."
      }
    ];

    if (!force) {
      // Use fallback presets to save quota on load
      localStorage.setItem(cacheKey, JSON.stringify(fallbackPresets));
      this.renderRecommendationsUI(fallbackPresets);
      return;
    }

    try {
      recommContainer.innerHTML = `
        <div class="flex items-center justify-center py-8">
          <div class="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-500"></div>
        </div>
      `;

      // API payload POST only on explicit manual force (button click)
      const response = await fetch("/api/ai/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          level: this.profile.level,
          weakWords: this.profile.weakWords.slice(0, 3),
          favoriteCategories: this.profile.favoriteCategories
        })
      });

      const data = await response.json();
      const list = data.recommendations || [];

      if (list.length > 0) {
        localStorage.setItem(cacheKey, JSON.stringify(list));
        this.renderRecommendationsUI(list);
      } else {
        this.renderRecommendationsUI(fallbackPresets);
      }
    } catch (e) {
      console.error("AI Recommendation failed:", e);
      // Fallback gracefully on rate limits
      this.renderRecommendationsUI(fallbackPresets);
    }
  }

  private renderRecommendationsUI(list: any[]) {
    const recommContainer = document.getElementById("dashboard-recomm-container");
    if (!recommContainer) return;

    recommContainer.innerHTML = "";
    
    list.forEach((w: any) => {
      const item = document.createElement("div");
      item.className = "p-3 rounded-xl bg-slate-900/90 border border-blue-900/20 hover:border-blue-500/30 transition-all text-left font-mono hover:scale-[1.01] flex flex-col justify-center cursor-pointer";
      item.title = "Click to add this recommended word to your local deck!";

      item.innerHTML = `
        <div class="flex justify-between items-center mb-1 leading-none">
          <span class="text-xs font-bold text-blue-400 block">${w.word}</span>
          <span class="text-[8px] px-1.5 py-0.5 bg-blue-950 text-blue-300 rounded uppercase font-bold tracking-wide">${w.difficulty}</span>
        </div>
        <div class="flex justify-between items-center leading-none">
          <span class="text-[10px] text-slate-300 block">${w.meaning}</span>
          <span class="text-[9px] text-amber-500 font-bold">+${w.xpAward || 30}xp</span>
        </div>
        <div class="text-[9px] text-slate-500 italic mt-1.5 font-sans border-t border-slate-800/60 pt-1.5 leading-snug">
           🧙‍♂️ Lore: "${w.lore || 'Excellent study target.'}"
        </div>
      `;

      // Interactive click to instantly learn the recommended word!
      item.addEventListener("click", () => {
        const cleanGerman = w.word.replace(/^(der|die|das)\s+/i, '');
        const hasArticle = w.word.match(/^(der|die|das)\s+/i)?.[0]?.trim() || "";
        const exists = this.dictionary.getWords().some(x => x.german.toLowerCase() === cleanGerman.toLowerCase());

        if (exists) {
          this.displayBannerNotification(`📝 "${w.word}" is already in your Quest Book handbook!`, "purple");
        } else {
          this.dictionary.addWord({
            german: cleanGerman,
            english: w.meaning,
            category: w.category || "General",
            difficulty: (w.difficulty === "Easy" || w.difficulty === "Medium" || w.difficulty === "Hard") ? w.difficulty : "Easy",
            isFavorite: false,
            accuracyCount: 0,
            errorCount: 0
          });
          this.rewardExperience(15, 20); // Bonus rewards
          this.displayBannerNotification(`✨ Added recommended word "${w.word}" to your deck! (+15 XP)`, "emerald");
          this.renderAllViews();
        }
      });

      recommContainer.appendChild(item);
    });
  }

  // Core Word Card drawers
  private renderDictionaryGrid() {
    const listGrid = document.getElementById("vocabulary-grid");
    if (!listGrid) return;

    listGrid.innerHTML = "";
    
    // Read search inputs
    const filterSearchVal = (document.getElementById("vocab-search") as HTMLInputElement)?.value.toLowerCase() || "";
    const filterCatVal = (document.getElementById("vocab-filter-category") as HTMLSelectElement)?.value || "all";
    const filterFavorVal = (document.getElementById("vocab-filter-favor") as HTMLSelectElement)?.value || "all";

    const allWords = this.dictionary.getWords();
    const filtered = allWords.filter(w => {
      // Text search match
      const searchMatch = w.german.toLowerCase().includes(filterSearchVal) || 
                          w.english.toLowerCase().includes(filterSearchVal) || 
                          w.category.toLowerCase().includes(filterSearchVal);
      
      // Category match
      const catMatch = filterCatVal === "all" || w.category === filterCatVal;

      // Dropdown status match
      let statusMatch = true;
      if (filterFavorVal === "favorites") {
        statusMatch = w.isFavorite;
      } else if (filterFavorVal === "weak") {
        statusMatch = (w.errorCount || 0) > 0;
      }

      return searchMatch && catMatch && statusMatch;
    });

    const empty = document.getElementById("empty-search-fallback");
    if (filtered.length === 0) {
      if (empty) empty.classList.remove("hidden");
      return;
    } else {
      if (empty) empty.classList.add("hidden");
    }

    filtered.forEach((word, index) => {
      const card = document.createElement("div");
      card.className = "glass-panel p-4 rounded-2xl flex flex-col justify-between border border-slate-850 hover:border-violet-500/20 transition-all hover:scale-[1.01]";
      
      const accuracyStr = (word.accuracyCount || 0) + (word.errorCount || 0) > 0
        ? `${Math.round((word.accuracyCount / (word.accuracyCount + word.errorCount)) * 100)}%`
        : "Not trained";

      card.innerHTML = `
        <div class="flex items-start justify-between gap-2 mb-2">
          <span class="text-[9px] px-2 py-0.5 rounded-full font-mono bg-slate-900 border border-slate-800 text-slate-400 font-bold uppercase">${word.category}</span>
          <div class="flex gap-1">
            <button class="text-xs hover:scale-115 toggle-fav-btn cursor-pointer" data-index="${index}" title="Favorite toggle">
              ${word.isFavorite ? "⭐" : "☆"}
            </button>
            <button class="text-xs text-rose-400 hover:text-rose-300 hover:scale-115 delete-word-btn cursor-pointer" data-index="${index}" title="Vaporize item">
              🗑️
            </button>
          </div>
        </div>

        <div class="text-left my-2.5">
          <h4 class="text-lg font-display font-bold text-violet-300 leading-tight">${word.german}</h4>
          <p class="text-xs text-slate-400 mt-1 capitalize font-medium">${word.english}</p>
        </div>

        <div class="border-t border-slate-800/80 mt-1.5 pt-2 flex justify-between items-center text-[9px] font-mono leading-none text-slate-500">
          <span class="flex items-center gap-1">
            <span>Accuracy:</span>
            <b class="${accuracyStr.startsWith("1") || accuracyStr.startsWith("8") || accuracyStr.startsWith("9") ? 'text-emerald-400' : 'text-rose-400'}">${accuracyStr}</b>
          </span>
          <span class="px-1.5 py-0.5 rounded capitalize bg-slate-950 font-bold" style="color: ${word.difficulty === "Easy" ? "#10b981" : word.difficulty === "Medium" ? "#f59e0b" : "#ef4444"}">
            ${word.difficulty}
          </span>
        </div>
      `;

      listGrid.appendChild(card);
    });

    // Reattach word card triggers
    listGrid.querySelectorAll(".toggle-fav-btn").forEach(btn => {
      btn.addEventListener("click", (e) => {
        const rawIdx = btn.getAttribute("data-index") || "0";
        this.dictionary.toggleFavorite(allWords.indexOf(filtered[parseInt(rawIdx)]));
        this.renderAllViews();
      });
    });

    listGrid.querySelectorAll(".delete-word-btn").forEach(btn => {
      btn.addEventListener("click", (e) => {
        const rawIdx = btn.getAttribute("data-index") || "0";
        const realIndex = allWords.indexOf(filtered[parseInt(rawIdx)]);
        if (realIndex >= 0 && realIndex < allWords.length) {
          const wordToDelete = allWords[realIndex];
          this.dictionary.deleteWord(realIndex);
          this.renderAllViews();
          if (wordToDelete) {
            this.displayBannerNotification(`🗑️ Vaporized "${wordToDelete.german}" from the Quest Book!`, "blue");
          }
        }
      });
    });
  }

  // Lore Shop drawer
  private renderShopShelf() {
    const shelf = document.getElementById("store-items-shelf");
    if (!shelf) return;

    shelf.innerHTML = "";
    STORE_ITEMS.forEach(item => {
      const alreadyOwned = this.profile.achievements.includes(`owned_${item.id}`);
      const canAfford = this.profile.coins >= item.price;
      
      const card = document.createElement("div");
      card.className = "glass-panel rounded-2xl p-4 flex flex-col justify-between border border-slate-850 hover:border-amber-500/20 hover:-translate-y-0.5 transition-all";

      let buttonClass = "";
      if (alreadyOwned) {
        buttonClass = "bg-slate-950 border border-slate-800 text-slate-600 cursor-not-allowed";
      } else if (canAfford) {
        buttonClass = "bg-amber-500 hover:bg-amber-400 text-slate-950 cursor-pointer shadow-[0_0_12px_rgba(245,158,11,0.25)] hover:shadow-[0_0_18px_rgba(245,158,11,0.45)] transform active:scale-95 transition-all duration-200 font-bold";
      } else {
        buttonClass = "bg-[#201c18] border border-amber-500/15 text-amber-500/50 hover:text-amber-400 hover:border-amber-500/30 cursor-pointer transition-all duration-200";
      }

      card.innerHTML = `
        <div class="flex items-center gap-3">
          <span class="text-3xl p-2.5 bg-slate-900 border border-slate-800 rounded-xl">${item.icon}</span>
          <div class="text-left">
            <h4 class="font-display font-medium text-slate-200 text-sm leading-tight">${item.name}</h4>
            <p class="text-[9px] text-amber-500 uppercase tracking-widest font-mono mt-0.5 leading-none">Trader's Choice</p>
          </div>
        </div>

        <p class="text-xs text-slate-400 text-left my-3 flex-1 leading-relaxed">${item.description}</p>

        <div class="flex items-center justify-between border-t border-slate-850 pt-2.5 mt-2">
          <span class="text-xs text-slate-400 flex items-center font-mono font-bold leading-none">
            <b class="text-amber-400 text-sm mr-1">🪙 ${item.price}</b> gold
          </span>
          <button class="buy-item-btn px-3 py-1.5 rounded-lg text-[10px] uppercase font-mono tracking-wider ${buttonClass}" data-id="${item.id}" ${alreadyOwned ? 'disabled' : ''}>
            ${alreadyOwned ? 'Purchased' : 'Forge Buy'}
          </button>
        </div>
      `;

      shelf.appendChild(card);
    });

    // Buy events
    shelf.querySelectorAll(".buy-item-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        const itemId = btn.getAttribute("data-id") || "";
        this.executeStorePurchase(itemId);
      });
    });
  }

  private executeStorePurchase(itemId: string) {
    const shopItem = STORE_ITEMS.find(s => s.id === itemId);
    if (!shopItem) return;

    if (this.profile.coins < shopItem.price) {
      this.displayBannerNotification("❌ Insolvency! You don't possess enough virtual gold. Complete practices to reap rewards first!", "purple");
      return;
    }

    // Deduct coins
    this.profile.coins -= shopItem.price;

    // Apply item effects
    if (shopItem.id === "streak_freeze") {
      this.profile.achievements.push("streak_freeze_active");
      this.displayBannerNotification(`❄️ Purchased Streak Freeze potion. Your active fire streak is guarded!`, "blue");
    } else if (shopItem.id === "double_xp") {
      this.rewardExperience(50, 0); // Fictional immediate XP
      this.displayBannerNotification(`📜 Fused XP Scroll: Gained +50 immediate experience points!`, "purple");
    } else if (shopItem.id === "health_potion") {
      this.profile.achievements.push("extra_boss_heart");
      this.displayBannerNotification(`🧪 Healing potion stored! Safeguards you for next overlord battles.`, "blue");
    } else {
      // Titles customization
      this.profile.customTag = shopItem.id === "title_archmage" ? "Archmage" : "Teutonic Hero";
      this.profile.achievements.push(`owned_${itemId}`);
      this.displayBannerNotification(`🌌 Unlocked Title Customization: [${this.profile.customTag}] unlocked!`, "emerald");
    }

    this.saveProfile();
    this.renderAllViews();
  }

  // Hall of Fame Leaderboard drawers
  private async renderLeaderboardList() {
    const list = document.getElementById("leaderboard-list");
    if (!list) return;

    const isRealUser = this.profile.email && this.profile.email !== "notconnect@domain.com" && this.profile.email !== "guest@domain.com";
    let combined: any[] = [];
    try {
      const response = await fetch(`/api/leaderboard?isRealUser=${isRealUser}`);
      if (response.ok) {
        const data = await response.json();
        if (data && data.leaderboard) {
          combined = data.leaderboard;
        }
      }
    } catch (e) {
      console.error("Leaderboard live compile failed:", e);
    }

    if (combined.length === 0) {
      // Fallback
      const leaderboardPlayers = isRealUser ? [] : [
        { name: "Siegfried_Word", level: 5, xp: 1450, tag: "Spell Lord", avatar: "🧙‍♂️" },
        { name: "Brunhilde_Learn", level: 4, xp: 950, tag: "Teutonic Hero", avatar: "⚔️" },
        { name: "Hans_Quest", level: 3, xp: 620, tag: "Rune Tracker", avatar: "🛡️" },
        { name: "Adler_Owl_Fan", level: 2, xp: 350, tag: "", avatar: "🦉" }
      ];
      const myEntry = {
        name: this.profile.name,
        level: this.profile.level,
        xp: (this.profile.level - 1) * 300 + this.profile.xp, // Relative progression total
        tag: this.profile.customTag || "",
        avatar: this.profile.avatar || "🏅"
      };
      combined = [...leaderboardPlayers, myEntry].sort((a, b) => b.xp - a.xp);
    }

    list.innerHTML = "";
    combined.forEach((player, i) => {
      const isMe = player.name === this.profile.name;
      const row = document.createElement("div");
      row.className = `p-3 sm:p-4 rounded-xl flex items-center justify-between border ${
        isMe 
          ? 'bg-violet-950/15 border-violet-500/40 text-violet-300 glow-purple' 
          : 'bg-slate-900 border-slate-850/80 text-slate-350'
      }`;

      const avatarStr = player.avatar || "🛡️";
      const isUrl = avatarStr.startsWith("http://") || avatarStr.startsWith("https://") || avatarStr.includes("/");
      const avatarHtml = isUrl 
        ? `<img src="${avatarStr}" referrerpolicy="no-referrer" class="w-8 h-8 rounded-full object-cover border border-violet-500/30" />`
        : `<span class="text-2xl">${avatarStr}</span>`;

      row.innerHTML = `
        <div class="flex items-center gap-3">
          <span class="text-xs font-bold font-mono text-slate-500 w-5 text-center">${i + 1}</span>
          ${avatarHtml}
          <div class="text-left font-mono text-xs">
            <span class="font-bold text-slate-100 ${isMe ? 'neon-text-purple' : ''}">${player.name}</span>
            ${player.tag ? `<span class="ml-2 text-[9px] px-1.5 py-0.5 rounded bg-slate-950 font-bold border border-slate-800 text-amber-500 uppercase">${player.tag}</span>` : ""}
          </div>
        </div>

        <div class="text-right font-mono text-xs">
          <span class="text-[10px] text-slate-500">LEVEL ${player.level}</span>
          <span class="text-xs font-semibold text-slate-300 ml-4">${player.xp} XP</span>
        </div>
      `;

      list.appendChild(row);
    });

    // Update rank card details
    const myRankIdx = combined.findIndex(c => c.name === this.profile.name);
    const hudRankBadge = document.getElementById("leaderboard-my-avatar-rank");
    const hudRankName = document.getElementById("leaderboard-my-name");
    const hudRankLevel = document.getElementById("leaderboard-my-level");
    const hudRankXp = document.getElementById("leaderboard-my-xp");

    if (hudRankBadge) hudRankBadge.innerText = myRankIdx >= 0 ? `#${myRankIdx + 1}` : "N/A";
    if (hudRankName) hudRankName.innerText = this.profile.name;
    if (hudRankLevel) hudRankLevel.innerText = `${this.getLevelTitle(this.profile.level)} (Lvl ${this.profile.level})`;
    if (hudRankXp) {
      const myCombinedXp = (this.profile.level - 1) * 300 + this.profile.xp;
      hudRankXp.innerText = `${myCombinedXp} Total XP`;
    }
  }

  // Renders AI Chat logs memory
  private renderAIChatMemory() {
    const logBox = document.getElementById("ai-chat-logs");
    if (!logBox) return;

    // Helper to safely parse simple markdown styles to clean nested elements
    const parseMarkdown = (raw: string) => {
      if (!raw) return "";
      
      // Let's escape raw HTML entities first to avoid breakages or script injection, except we keep some tags
      let text = raw
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");

      // Replace bold **text** with highlighted spans
      text = text.replace(/\*\*(.*?)\*\*/g, "<strong class='font-bold text-violet-300'>$1</strong>");

      // Replace italic *text* with styled italic text
      text = text.replace(/\*(.*?)\*/g, "<em class='text-slate-200 font-semibold'>$1</em>");

      const lines = text.split(/\r?\n/);
      let htmlLines: string[] = [];
      let inList = false;
      let inTable = false;
      let tableRows: string[] = [];

      // Embedded table rendering helper
      const renderTable = (rows: string[]): string => {
        if (rows.length === 0) return "";
        let html = "<div class='my-2.5 overflow-x-auto rounded-lg border border-slate-800 bg-slate-950/40'><table class='w-full text-left text-[11px] font-sans border-collapse'>";
        let hasHeader = false;
        let parsedRows: string[][] = [];
        
        for (let r = 0; r < rows.length; r++) {
          const row = rows[r];
          const cells = row.split("|").map(c => c.trim());
          if (cells.length > 1) {
            if (cells[0] === "") cells.shift();
            if (cells[cells.length - 1] === "") cells.pop();
            const isSeparator = cells.every(c => c.match(/^:?-+:?$/));
            if (isSeparator) {
              hasHeader = true;
              continue; 
            }
            parsedRows.push(cells);
          }
        }

        if (parsedRows.length === 0) return "";

        if (hasHeader && parsedRows.length > 0) {
          const headers = parsedRows[0];
          html += "<thead class='bg-slate-900 border-b border-slate-800 text-violet-300 font-bold'><tr>";
          headers.forEach(h => {
            html += `<th class='p-2 font-semibold'>${h}</th>`;
          });
          html += "</tr></thead>";
          
          html += "<tbody class='divide-y divide-slate-850/60'>";
          for (let r = 1; r < parsedRows.length; r++) {
            html += "<tr class='hover:bg-slate-900/20 transition-colors'>";
            parsedRows[r].forEach(cell => {
              html += `<td class='p-2 text-slate-300'>${cell}</td>`;
            });
            html += "</tr>";
          }
          html += "</tbody>";
        } else {
          html += "<tbody class='divide-y divide-slate-850/60'>";
          parsedRows.forEach(row => {
            html += "<tr class='hover:bg-slate-900/20 transition-colors'>";
            row.forEach(cell => {
              html += `<td class='p-2 text-slate-300'>${cell}</td>`;
            });
            html += "</tr>";
          });
          html += "</tbody>";
        }

        html += "</table></div>";
        return html;
      };

      for (let i = 0; i < lines.length; i++) {
        let line = lines[i].trim();

        // 1. Horizontal Rules
        if (line === "---" || line === "___" || line === "***" || line === "--- ") {
          if (inTable) { htmlLines.push(renderTable(tableRows)); inTable = false; tableRows = []; }
          if (inList) { htmlLines.push("</ul>"); inList = false; }
          htmlLines.push("<hr class='border-slate-800/80 my-2.5'>");
          continue;
        }

        // 2. Headers (since we escaped '#', matching direct markdown lines)
        const headerMatch = line.match(/^(#{1,6})\s+(.+)$/);
        if (headerMatch) {
          if (inTable) { htmlLines.push(renderTable(tableRows)); inTable = false; tableRows = []; }
          if (inList) { htmlLines.push("</ul>"); inList = false; }
          const depth = headerMatch[1].length;
          const content = headerMatch[2];
          const fontSize = depth === 1 ? "text-base" : depth === 2 ? "text-sm" : "text-xs";
          htmlLines.push(`<div class="${fontSize} font-bold text-violet-300 font-sans tracking-tight mt-2.5 mb-1">${content}</div>`);
          continue;
        }

        // 3. Blockquotes (since we escaped > into &gt;)
        const quoteMatch = line.match(/^&gt;\s*(.+)$/);
        if (quoteMatch) {
          if (inTable) { htmlLines.push(renderTable(tableRows)); inTable = false; tableRows = []; }
          if (inList) { htmlLines.push("</ul>"); inList = false; }
          htmlLines.push(`<div class="pl-3 py-1 my-1 border-l-2 border-violet-500 bg-slate-950/40 text-slate-300 italic">${quoteMatch[1]}</div>`);
          continue;
        }

        // 4. Tables (lines starting and ending with | or containing multiple |)
        const isTableRow = line.startsWith("|") && line.endsWith("|");
        if (isTableRow) {
          if (inList) { htmlLines.push("</ul>"); inList = false; }
          inTable = true;
          tableRows.push(line);
          continue;
        } else {
          if (inTable) {
            htmlLines.push(renderTable(tableRows));
            inTable = false;
            tableRows = [];
          }
        }

        // 5. Lists (lines starting with - or * or bullet points)
        const listMatch = line.match(/^[-*•]\s+(.+)$/);
        if (listMatch) {
          if (!inList) {
            htmlLines.push("<ul class='space-y-1 my-1.5'>");
            inList = true;
          }
          htmlLines.push(`<li class='pl-1.5 py-0.5 text-slate-300 flex items-start gap-1.5'><span>•</span><span>${listMatch[1]}</span></li>`);
          continue;
        } else {
          if (inList && !line) {
            htmlLines.push("</ul>");
            inList = false;
          }
        }

        // 6. Normal lines
        if (line === "") {
          htmlLines.push("<div class='h-1.5'></div>");
        } else {
          htmlLines.push(`<div class='leading-relaxed text-slate-300'>${line}</div>`);
        }
      }

      if (inTable) { htmlLines.push(renderTable(tableRows)); }
      if (inList) { htmlLines.push("</ul>"); }

      return htmlLines.join("\n");
    };

    logBox.innerHTML = "";
    this.chatMessages.forEach(msg => {
      const bubble = document.createElement("div");
      
      if (msg.role === "assistant") {
        bubble.className = "flex items-start gap-2.5 max-w-[85%] self-start text-xs p-3 rounded-xl bg-slate-900 border border-slate-850/60 text-slate-300 leading-relaxed mb-3";
        bubble.innerHTML = `
          <span class="text-sm self-start">🦉</span>
          <div class="w-full overflow-hidden">
            <span class="text-[10px] font-mono font-bold text-violet-400 block mb-1">Companion Maaz (Tutor)</span>
            <div class="space-y-1 w-full">${parseMarkdown(msg.content)}</div>
          </div>
        `;
      } else {
        bubble.className = "flex flex-col items-end gap-1.5 max-w-[80%] self-end text-xs p-3 rounded-xl bg-violet-950/20 border border-violet-800/20 text-violet-200 leading-relaxed mb-3 font-mono";
        bubble.innerHTML = `
          <div class="w-full">
            <span class="text-[10px] text-slate-400 font-bold block mb-1 text-right">You (${this.profile.name})</span>
            <div class="space-y-1 w-full">${parseMarkdown(msg.content)}</div>
          </div>
        `;
      }
      logBox.appendChild(bubble);
    });

    // Auto-scroll mechanics
    logBox.scrollTop = logBox.scrollHeight;
  }

  // Bind key inputs clicks
  private bindEvents() {
    // Interactive Guild Class selectors
    document.querySelectorAll(".class-select-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        const selectedClass = btn.getAttribute("data-class") || "Spellslinger";
        this.profile.customTag = selectedClass;
        this.games.currentUserClass = selectedClass;
        this.saveProfile();
        AudioSFX.playCoin();
        this.displayBannerNotification(`⚔️ Training class synced: ${selectedClass}! Active perk loaded.`, "indigo");
        this.renderAllViews();
      });
    });

    // 1. Dynamic Tab routing
    const tabs = document.querySelectorAll(".nav-tab");
    tabs.forEach(tab => {
      tab.addEventListener("click", () => {
        const target = tab.getAttribute("data-target") || "dashboard";
        this.switchView(target);
      });
    });

    // 2. Open Forge modal
    const triggerForge = document.getElementById("add-word-trigger");
    const wordModal = document.getElementById("word-modal");
    if (triggerForge && wordModal) {
      triggerForge.addEventListener("click", () => {
        wordModal.classList.remove("hidden");
        wordModal.classList.add("flex");
        (document.getElementById("word-modal-title") as HTMLElement).innerText = "Forge New Vocabulary Spell";
        (document.getElementById("word-form") as HTMLFormElement).reset();
        (document.getElementById("word-edit-index") as HTMLInputElement).value = "";
      });
    }

    // Cancel / close word Forge modal
    const closeWordBtn = document.getElementById("close-word-modal-btn");
    const cancelWordBtn = document.getElementById("cancel-word-modal-btn");
    if (wordModal) {
      const hideModal = () => {
        wordModal.classList.remove("flex");
        wordModal.classList.add("hidden");
      };
      closeWordBtn?.addEventListener("click", hideModal);
      cancelWordBtn?.addEventListener("click", hideModal);
    }

    // DAILY STREAK & CAMPFIRE REPAIR MODAL HANDLERS
    const streakTooltip = document.getElementById("streak-tooltip");
    const streakModal = document.getElementById("streak-modal");
    if (streakTooltip && streakModal) {
      streakTooltip.addEventListener("click", () => {
        this.renderInteractiveStreakWidget();
        streakModal.classList.remove("hidden");
        streakModal.classList.add("flex");
      });
    }

    const closeStreakBtn = document.getElementById("close-streak-modal-btn");
    if (streakModal && closeStreakBtn) {
      const hideStreakModal = () => {
        streakModal.classList.remove("flex");
        streakModal.classList.add("hidden");
      };
      closeStreakBtn.addEventListener("click", hideStreakModal);
      streakModal.addEventListener("click", (e) => {
        if (e.target === streakModal) {
          hideStreakModal();
        }
      });
    }

    // Submits new Word Forge form
    const wordForm = document.getElementById("word-form") as HTMLFormElement;
    wordForm?.addEventListener("submit", (e) => {
      e.preventDefault();
      
      const german = (document.getElementById("word-german") as HTMLInputElement).value.trim();
      const english = (document.getElementById("word-english") as HTMLInputElement).value.trim();
      const category = (document.getElementById("word-category") as HTMLSelectElement).value;
      const difficulty = (document.getElementById("word-difficulty") as HTMLSelectElement).value as any;

      if (!german || !english) return;

      const newWord: Word = {
        german,
        english,
        category,
        difficulty,
        isFavorite: false,
        accuracyCount: 0,
        errorCount: 0
      };

      const added = this.dictionary.addWord(newWord);
      if (added) {
        this.displayBannerNotification(`📖 Forged Spell: "${german}" successfully learned!`);
        // Trigger Sheets async write sync in background if GAS URL or Google OAuth is active
        if (localStorage.getItem("gq_google_access_token") || this.dictionary.getAppsScriptUrl()) {
          this.dictionary.syncWithGoogleSheets();
        }
      } else {
        this.displayBannerNotification("❌ Duplicate Word! This German term already exists inside your handbook.", "amber");
      }

      if (wordModal) wordModal.classList.add("hidden");
      this.renderAllViews();
    });

    // 3. Search or filter vocabulary items
    const searchInp = document.getElementById("vocab-search");
    searchInp?.addEventListener("input", () => this.renderDictionaryGrid());

    const filtCat = document.getElementById("vocab-filter-category");
    filtCat?.addEventListener("change", () => this.renderDictionaryGrid());

    const filtFv = document.getElementById("vocab-filter-favor");
    filtFv?.addEventListener("change", () => this.renderDictionaryGrid());

    // Sync button trigger inside Dictionary Quest book tabs
    document.getElementById("trigger-sync-sheet-btn")?.addEventListener("click", () => this.performManualSync());

    // 5. Game practices entrance triggers
    document.getElementById("start-practices-hero")?.addEventListener("click", () => {
      this.switchView("games");
    });

    const gameModeSelectors = document.querySelectorAll("[data-game]");
    gameModeSelectors.forEach(selector => {
      selector.addEventListener("click", () => {
        const mode = selector.getAttribute("data-game") || "quiz";
        
        // Hearts checks for Boss battle
        if (mode === "boss" && this.dictionary.getWords().length < 4) {
          this.displayBannerNotification("👹 High Danger! You must forge at least 4 unique words in your Quest Book before challenging the Vocabulary Overlord!", "purple");
          return;
        }

        const arena = document.getElementById("games-selection-screen");
        const playground = document.getElementById("game-playground");
        
        if (arena) arena.classList.add("hidden");
        if (playground) playground.classList.remove("hidden");

        // Open game playgrounds
        const gameActiveTitle = document.getElementById("game-active-title");
        if (gameActiveTitle) {
          gameActiveTitle.innerText = mode === "quiz" ? "Multiple Choice Quiz" 
                                    : mode === "typing" ? "Word Typing Duel" 
                                    : mode === "flashcards" ? "Dynamic Flashcards" 
                                    : mode === "listening" ? "Listening Challenge"
                                    : mode === "speaking" ? "Speaking Trial"
                                    : mode === "matching" ? "Tile Memory Matching"
                                    : mode === "gender" ? "Gender Defender"
                                    : mode === "scrambler" ? "Rune Spell Scrambler"
                                    : mode === "alchemist" ? "Vocab Alchemist Brew"
                                    : "Vocabulary Overlord Boss Battle";
        }

        // Run game engine
        this.games.currentUserClass = this.profile.customTag || "Spellslinger";
        this.games.start(mode, 10); // 10 Questions standard practices session
      });
    });

    // Quit active practice
    document.getElementById("quit-game-btn")?.addEventListener("click", () => {
      this.switchView("games");
    });

    // 6. AI Interactive Chatbot Tutor trigger commands
    const promptInput = document.getElementById("ai-chat-input") as HTMLInputElement;
    const sendBtn = document.getElementById("ai-chat-send-btn");

    const execAIQuery = async () => {
      const rawPrompt = promptInput?.value.trim();
      if (!rawPrompt) return;

      // Reset text field
      promptInput.value = "";

      // Push memory user message local
      this.chatMessages.push({ role: "user", content: rawPrompt });
      this.renderAIChatMemory();

      // Show typing owl placeholder bubble
      const logBox = document.getElementById("ai-chat-logs");
      const loadingBubble = document.createElement("div");
      loadingBubble.className = "flex items-start gap-2.5 max-w-[85%] self-start text-xs p-3 rounded-xl bg-slate-900 border border-slate-800 text-indigo-350 italic animate-pulse mb-3";
      loadingBubble.innerHTML = `🦉 <span>Owl Maaz is whispering spells... Please wait...</span>`;
      logBox?.appendChild(loadingBubble);
      logBox!.scrollTop = logBox!.scrollHeight;

      try {
        const response = await fetch("/api/ai/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: this.chatMessages,
            userProfile: {
              level: this.profile.level,
              streak: this.profile.streak,
              xp: this.profile.xp,
              weakWords: this.profile.weakWords
            }
          })
        });

        const data = await response.json();
        
        // Remove typing placeholder
        loadingBubble.remove();

        if (data.text) {
          this.chatMessages.push({ role: "assistant", content: data.text });
        } else if (data.error) {
          this.chatMessages.push({ role: "assistant", content: `Forgive me, adventurer, my owl scroll magic encountered an issue: "${data.error}"` });
        } else {
          this.chatMessages.push({ role: "assistant", content: "Forgive me, adventurer, my owl scroll magic has expired or the API endpoint is loaded. Try asking another question!" });
        }
        this.renderAIChatMemory();

      } catch (err) {
        loadingBubble.remove();
        const lastUserMsg = this.chatMessages[this.chatMessages.length - 1]?.content || "";
        const fallbackText = getClientOfflineTutorResponse(lastUserMsg, this.profile);
        this.chatMessages.push({ role: "assistant", content: fallbackText });
        this.renderAIChatMemory();
      }
    };

    sendBtn?.addEventListener("click", execAIQuery);
    promptInput?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") execAIQuery();
    });

    // Presets chatbot query hooks
    document.querySelectorAll(".chat-preset").forEach(preset => {
      preset.addEventListener("click", () => {
        const txt = preset.textContent?.trim() || "";
        if (promptInput) {
          promptInput.value = txt;
          execAIQuery();
        }
      });
    });

    // NPC Companion hover tips routine
    document.getElementById("ask-companion-tip")?.addEventListener("click", async () => {
      const bubble = document.getElementById("companion-bubble");
      if (bubble) {
        bubble.innerText = "🔮 Calling Owl wisdom...";
      }

      // Generate funny small vocabulary tips using Sheets or defaults
      const weak = this.dictionary.getWeakWords();
      const hasWeak = weak.length > 0;
      const targetWord = hasWeak ? weak[0].german : "das Abenteuer";

      try {
        const response = await fetch("/api/ai/sentence", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ word: targetWord })
        });
        const data = await response.json();
        if (bubble) {
          bubble.innerHTML = `🌟 Maaz Tip for memorizing <b>"${targetWord}"</b>:<br><q class="text-[10px] text-violet-300 leading-relaxed italic mt-1 font-mono">"${data.tip || 'Practice spelling!'}"</q>`;
        }
      } catch (e) {
        if (bubble) {
          bubble.innerText = `"Adventure awaits! Click Practicing tabs or forge cards with custom articles (der, die, das)!"`;
        }
      }
    });

    // Clear chat memory
    document.getElementById("clear-ai-chat-btn")?.addEventListener("click", () => {
      this.chatMessages = [
        { role: "assistant", content: "Grüezi! My memory lists are cleared. What would you like to target today?" }
      ];
      this.renderAIChatMemory();
    });

    // Manual Refresh of Smart Recommendations listener
    document.getElementById("refresh-ai-recomm")?.addEventListener("click", () => {
      this.fetchSmartAIRecommendations(true);
    });
  }

  // Secure offline cache save procedure
  private async performManualSync() {
    const btn = document.getElementById("trigger-sync-sheet-btn");
    
    if (btn) {
      btn.setAttribute("disabled", "true");
      btn.innerHTML = `<span>⏳</span> Saving...`;
    }

    // Always ensure local storage cache is persisted
    this.dictionary.saveToCache();
    this.saveProfile();

    const hasGoogleToken = !!localStorage.getItem("gq_google_access_token");
    const hasAppsScriptUrl = !!this.dictionary.getAppsScriptUrl();
    let googleSyncSuccess = false;
    let googleSyncMsg = "";

    if (hasGoogleToken || hasAppsScriptUrl) {
      const result = await this.dictionary.syncWithGoogleSheets();
      googleSyncSuccess = result.success;
      googleSyncMsg = result.message || "";
    }

    const isRealUser = this.profile.email && this.profile.email !== "notconnect@domain.com" && this.profile.email !== "guest@domain.com";
    if (isRealUser) {
      try {
        const response = await fetch("/api/auth/save-progress", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: this.profile.email,
            profile: this.profile,
            words: this.dictionary.getWords(),
            history: this.analytics.getHistory()
          })
        });
        const data = await response.json();
        if (response.ok && data.success) {
          if (hasGoogleToken || hasAppsScriptUrl) {
            if (googleSyncSuccess) {
              this.displayBannerNotification(`🔄 Sheets & Guild backup successful! ${googleSyncMsg}`, "emerald");
            } else {
              this.displayBannerNotification(`⚠️ Guild backup saved, Sheets Sync failed: ${googleSyncMsg}`);
            }
          } else {
            this.displayBannerNotification(`🔄 Guild server backup successful! Levels, gold, and ${this.dictionary.getWords().length} words saved.`, "emerald");
          }
        } else {
          throw new Error(data.error || "Guild server sync offline");
        }
      } catch (err: any) {
        console.error(err);
        if (hasGoogleToken || hasAppsScriptUrl) {
          if (googleSyncSuccess) {
            this.displayBannerNotification(`🔄 Sheets synchronized successfully! Guild backup offline: ${googleSyncMsg}`, "emerald");
          } else {
            this.displayBannerNotification(`💾 Local backup secured! Progress saved to browser. Sheets failed: ${googleSyncMsg}`);
          }
        } else {
          this.displayBannerNotification(`💾 Offline backup secured! Local browser progress is safe.`, "emerald");
        }
      }
    } else {
      if (hasGoogleToken || hasAppsScriptUrl) {
        if (googleSyncSuccess) {
          this.displayBannerNotification(`🔄 Sheets successfully updated! ${googleSyncMsg}`, "emerald");
        } else {
          this.displayBannerNotification(`⚠️ Google Sheets Sync failed: ${googleSyncMsg}`);
        }
      } else {
        // Fast, offline-first feedback loop
        await new Promise(resolve => setTimeout(resolve, 350));
        this.displayBannerNotification(`💾 Local RPG Profile Saved! Progress secured.`, "emerald");
      }
    }

    if (btn) {
      btn.removeAttribute("disabled");
      btn.innerHTML = `<span>💾</span> Save Progress`;
    }

    this.renderAllViews();
  }

  // Display glowing, modern gaming notifications banner
  private displayBannerNotification(message: string, theme: "purple" | "emerald" | "blue" | "amber" | "indigo" = "purple") {
    const notifyDiv = document.createElement("div");
    // Styling colors
    const colorClass = theme === "emerald" 
      ? "from-emerald-950/95 to-emerald-900 border-emerald-500 text-emerald-300 decoration-emerald-400"
      : theme === "blue"
      ? "from-blue-950/95 to-blue-900 border-blue-500 text-blue-300 decoration-blue-400"
      : theme === "amber"
      ? "from-amber-950/95 to-amber-900 border-amber-500 text-amber-300 decoration-amber-400"
      : theme === "indigo"
      ? "from-indigo-950/95 to-indigo-900 border-indigo-500 text-indigo-300 decoration-indigo-400"
      : "from-violet-950/95 to-violet-900 border-violet-500 text-violet-300 decoration-violet-400 font-mono";

    notifyDiv.className = `fixed bottom-4 right-4 z-50 p-4 border rounded-2xl bg-gradient-to-tr ${colorClass} max-w-sm shadow-2xl flex items-center gap-3 transition-all duration-300 animate-float border-l-4 font-mono text-xs select-none`;
    notifyDiv.innerHTML = `<span>📢</span> <span>${message}</span>`;
    
    document.body.appendChild(notifyDiv);

    // Fade and remove after 4.5 seconds
    setTimeout(() => {
      notifyDiv.classList.add("opacity-0", "translate-y-2");
      setTimeout(() => notifyDiv.remove(), 400);
    }, 4500);
  }

  // Direct Google GIS oauth client login connection
  private triggerDirectGoogleLogin() {
    let clientId = localStorage.getItem("gq_google_client_id") || (import.meta as any).env?.VITE_GOOGLE_CLIENT_ID || "737075841800-djomhf1triib859c2igm758knbknb1o8.apps.googleusercontent.com";
    
    localStorage.setItem("gq_google_client_id", clientId);

    if (!(window as any).google) {
      this.displayBannerNotification("⏳ Google Identity services are loading. Please wait half a second and retry!");
      return;
    }

    try {
      const client = (window as any).google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: "https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/userinfo.email",
        callback: async (tokenResponse: any) => {
          if (tokenResponse && tokenResponse.access_token) {
            const token = tokenResponse.access_token;
            localStorage.setItem("gq_google_access_token", token);
            
            // Load active Google profile info
            try {
              const userInfoRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
                headers: { Authorization: `Bearer ${token}` }
              });
              if (userInfoRes.ok) {
                const googleUser = await userInfoRes.json();
                
                // Match or provision isolated user details on the main database backend
                let ssoResOk = false;
                let ssoData: any = null;
                
                try {
                  const ssoRes = await fetch("/api/auth/google-sso", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      email: googleUser.email,
                      name: googleUser.name,
                      avatar: googleUser.picture
                    })
                  });
                  if (ssoRes.ok) {
                    ssoData = await ssoRes.json();
                    ssoResOk = true;
                  }
                } catch (ssoErr) {
                  console.warn("Backend API server offline.");
                }
                
                if (ssoResOk && ssoData) {
                  // Set the profile values exactly loaded from their account (clean 100% 0-based if new!)
                  this.profile = ssoData.user.profile;
                  this.profile.name = ssoData.user.name;
                  this.profile.email = ssoData.user.email;
                  this.profile.avatar = ssoData.user.avatar;
                  this.profile.customTag = ssoData.user.customTag;
                  this.saveProfile();
                  
                  // Set the vocabulary exactly loaded from their account (empty [] if new!)
                  this.dictionary.setWords(ssoData.user.words || []);
                  
                  // Clear any deleted words tracked under prior guest or other sessions
                  localStorage.removeItem("gq_deleted_words");
                  
                  // Set the daily activity history exactly loaded from their account (empty [] if new!)
                  localStorage.setItem("gq_quiz_history", JSON.stringify(ssoData.user.history || []));
                  this.analytics.loadHistory();
                  
                  this.displayBannerNotification(`🔑 Welcome to German Quest, ${this.profile.name}! Your account is safe and isolated.`, "emerald");
                } else {
                  // Frontend-only client-side session fallback (for static hosting environments like Vercel with no custom API)
                  const emailLower = googleUser.email.toLowerCase().trim();
                  const existingCachedProfile = localStorage.getItem(`gq_profile_${emailLower}`);
                  let matched = false;
                  
                  if (existingCachedProfile) {
                    try {
                      const parsed = JSON.parse(existingCachedProfile);
                      if (parsed && parsed.email === googleUser.email) {
                        this.profile = parsed;
                        matched = true;
                      }
                    } catch (e) {}
                  }
                  
                  if (matched) {
                    // Load their local isolated vocabulary list for this email
                    const cachedVocab = localStorage.getItem(`gq_vocab_${emailLower}`);
                    if (cachedVocab) {
                      try {
                        this.dictionary.setWords(JSON.parse(cachedVocab));
                      } catch (e) {
                        this.dictionary.setWords([]);
                      }
                    } else {
                      this.dictionary.setWords([]);
                    }
                    
                    // Load their local isolated activity history for this email
                    const cachedHistory = localStorage.getItem(`gq_history_${emailLower}`);
                    if (cachedHistory) {
                      try {
                        localStorage.setItem("gq_quiz_history", cachedHistory);
                        this.analytics.loadHistory();
                      } catch (e) {
                        localStorage.setItem("gq_quiz_history", JSON.stringify([]));
                        this.analytics.loadHistory();
                      }
                    } else {
                      localStorage.setItem("gq_quiz_history", JSON.stringify([]));
                      this.analytics.loadHistory();
                    }
                  } else {
                    // Start completely clean with zero stats and empty records
                    this.profile = {
                      level: 1,
                      xp: 0,
                      xpNeeded: 100,
                      streak: 0,
                      coins: 0,
                      favoriteCategories: ["Basics", "Adventure"],
                      weakWords: [],
                      achievements: [],
                      name: googleUser.name || "Google Adventurer",
                      email: googleUser.email || "adventurer@gmail.com",
                      avatar: googleUser.picture || "🛡️",
                      customTag: "Adventurer",
                      lastPracticeDate: ""
                    };
                    this.dictionary.setWords([]);
                    localStorage.setItem("gq_quiz_history", JSON.stringify([]));
                    this.analytics.loadHistory();
                  }
                  
                  this.saveProfile();
                  
                  // Clear any deleted words tracked under prior sessions
                  localStorage.removeItem("gq_deleted_words");
                  
                  this.displayBannerNotification(`🔑 Connected via Google OAuth! (Saved locally with isolated stats)`, "emerald");
                }
                
                // Hide modal if open
                const authModal = document.getElementById("auth-modal");
                if (authModal) {
                  authModal.classList.add("hidden");
                  authModal.classList.remove("flex");
                }

                // Trigger primary cloud data synchronizer
                await this.performManualSync();
              }
            } catch (userInfoError) {
              console.error("Failed loading Google profile details:", userInfoError);
              this.displayBannerNotification("🔒 Connected directly to Sheets! (Failed loading user profile picture)");
              const authModal = document.getElementById("auth-modal");
              if (authModal) {
                authModal.classList.add("hidden");
                authModal.classList.remove("flex");
              }
            }
            this.renderAllViews();
          }
        }
      });
      client.requestAccessToken();
    } catch (e: any) {
      console.error("Failed starting Google Auth token client:", e);
      this.displayBannerNotification(`⚠️ Authentication Error: ${e.message || "Invalid Google Client ID."}`);
    }
  }

  // Create immersive local RPG character connection integration
  private initializeGoogleLogin() {
    const loginBtn = document.getElementById("login-trigger-btn");
    const authModal = document.getElementById("auth-modal");
    const closeAuthBtn = document.getElementById("close-auth-modal-btn");
    const signUpBtn = document.getElementById("auth-simulator-connect-btn");
    const signInBtn = document.getElementById("auth-signin-btn");

    const tabSignUpPage = document.getElementById("tab-auth-signup");
    const tabSignInPage = document.getElementById("tab-auth-signin");

    const signUpPanel = document.getElementById("auth-signup-panel");
    const signInPanel = document.getElementById("auth-signin-panel");
    const otpPanel = document.getElementById("auth-otp-panel");

    // Dynamic Tab Switches inside Auth Modal
    if (tabSignUpPage && tabSignInPage && signUpPanel && signInPanel) {
      tabSignUpPage.addEventListener("click", () => {
        signUpPanel.classList.remove("hidden");
        signInPanel.classList.add("hidden");
        if (otpPanel) otpPanel.classList.add("hidden");

        tabSignUpPage.className = "py-1.5 rounded-lg text-xs font-semibold cursor-pointer text-center bg-violet-600/20 text-violet-300 border border-violet-500/25 transition-all";
        tabSignInPage.className = "py-1.5 rounded-lg text-xs font-semibold cursor-pointer text-center text-slate-400 hover:text-slate-200 transition-all font-sans border border-transparent";
      });

      tabSignInPage.addEventListener("click", () => {
        signUpPanel.classList.add("hidden");
        signInPanel.classList.remove("hidden");
        if (otpPanel) otpPanel.classList.add("hidden");

        tabSignUpPage.className = "py-1.5 rounded-lg text-xs font-semibold cursor-pointer text-center text-slate-400 hover:text-slate-200 transition-all font-sans border border-transparent";
        tabSignInPage.className = "py-1.5 rounded-lg text-xs font-semibold cursor-pointer text-center bg-violet-600/20 text-violet-300 border border-violet-500/25 transition-all";
      });
    }

    // Interactive class choice selector
    const classOpts = document.querySelectorAll(".class-opt");
    const selectedAvatarInp = document.getElementById("auth-selected-avatar") as HTMLInputElement;
    const selectedClassInp = document.getElementById("auth-selected-class") as HTMLInputElement;

    classOpts.forEach((opt: any) => {
      opt.addEventListener("click", () => {
        // Clear previous selection
        classOpts.forEach((o: any) => {
          o.classList.remove("border-2", "border-violet-500", "bg-violet-950/20");
          o.classList.add("border", "border-slate-800", "bg-slate-900/40");
        });

        // Toggle selected class on active option
        opt.classList.remove("border", "border-slate-800", "bg-slate-900/40");
        opt.classList.add("border-2", "border-violet-500", "bg-violet-950/20");

        // Save selected attributes
        if (selectedAvatarInp) selectedAvatarInp.value = opt.getAttribute("data-avatar") || "🛡️";
        if (selectedClassInp) selectedClassInp.value = opt.getAttribute("data-class") || "Cavalier";
      });
    });

    if (loginBtn) {
      loginBtn.addEventListener("click", () => {
        const hasGoogleToken = !!localStorage.getItem("gq_google_access_token");
        const hasCustomEmail = this.profile.email && this.profile.email !== "notconnect@domain.com";

        // If logged in under a custom profile or Google, log them out and reset to default guest status
        if (hasGoogleToken || hasCustomEmail) {
          // Reset profile to default
          this.profile = {
            level: 1,
            xp: 0,
            xpNeeded: 100,
            streak: 0,
            coins: 0,
            favoriteCategories: ["Basics", "Adventure"],
            weakWords: [],
            achievements: [],
            name: "Guest Adventurer",
            email: "notconnect@domain.com",
            avatar: "🛡️",
            lastPracticeDate: ""
          };
          this.saveProfile();
          localStorage.removeItem("gq_google_access_token");
          localStorage.removeItem("gq_vocab_cache");
          localStorage.removeItem("gq_quiz_history");
          this.analytics.loadHistory();
          this.dictionary.setWords([
            { german: "der Drache", english: "the dragon", category: "Adventure", difficulty: "Medium", isFavorite: true, accuracyCount: 0, errorCount: 0 },
            { german: "die Burg", english: "the castle", category: "Adventure", difficulty: "Easy", isFavorite: false, accuracyCount: 0, errorCount: 0 },
            { german: "das Abenteuer", english: "the adventure", category: "Basics", difficulty: "Easy", isFavorite: true, accuracyCount: 0, errorCount: 0 },
            { german: "überwinden", english: "to overcome / vanquish", category: "Verbs", difficulty: "Hard", isFavorite: false, accuracyCount: 0, errorCount: 0 },
            { german: "der Trank", english: "the potion", category: "Adventure", difficulty: "Easy", isFavorite: false, accuracyCount: 0, errorCount: 0 },
            { german: "das Schwert", english: "the sword", category: "Adventure", difficulty: "Medium", isFavorite: false, accuracyCount: 0, errorCount: 0 },
            { german: "schnell", english: "fast / swift", category: "Adjectives", difficulty: "Easy", isFavorite: false, accuracyCount: 0, errorCount: 0 },
            { german: "der Wald", english: "the forest", category: "Nouns", difficulty: "Easy", isFavorite: false, accuracyCount: 0, errorCount: 0 },
            { german: "die Hexe", english: "the witch", category: "Adventure", difficulty: "Medium", isFavorite: false, accuracyCount: 0, errorCount: 0 },
            { german: "der Schatz", english: "the treasure", category: "Adventure", difficulty: "Easy", isFavorite: true, accuracyCount: 0, errorCount: 0 },
            { german: "kämpfen", english: "to fight / battle", category: "Verbs", difficulty: "Medium", isFavorite: false, accuracyCount: 0, errorCount: 0 },
            { german: "der Schild", english: "the shield", category: "Adventure", difficulty: "Easy", isFavorite: false, accuracyCount: 0, errorCount: 0 },
            { german: "guten Morgen", english: "good morning", category: "Conversation", difficulty: "Easy", isFavorite: false, accuracyCount: 0, errorCount: 0 },
            { german: "wie geht es dir?", english: "how are you?", category: "Conversation", difficulty: "Easy", isFavorite: false, accuracyCount: 0, errorCount: 0 }
          ]);
          this.renderAllViews();
          this.displayBannerNotification("🚪 Logged out! Resumed offline local guest play.");
          return;
        }

        // Sign in directly with Google Account
        this.triggerDirectGoogleLogin();
      });
    }

    if (closeAuthBtn && authModal) {
      closeAuthBtn.addEventListener("click", () => {
        authModal.classList.add("hidden");
        authModal.classList.remove("flex");
      });
    }

    // NEW MULTI-STEP VERIFICATION SYSTEM: DISPATCH OTP & VERIFY REAL OWNERSHIP
    const otpCodeInput = document.getElementById("auth-otp-code") as HTMLInputElement;
    const otpVerifyBtn = document.getElementById("auth-otp-verify-btn");
    const otpBackBtn = document.getElementById("auth-otp-back-btn");
    const sandboxHint = document.getElementById("auth-otp-sandbox-hint");
    const sandboxValue = document.getElementById("auth-sandbox-otp-value");

    // Setup back button
    if (otpBackBtn && signUpPanel && otpPanel) {
      otpBackBtn.addEventListener("click", () => {
        otpPanel.classList.add("hidden");
        signUpPanel.classList.remove("hidden");
        if (sandboxHint) sandboxHint.classList.add("hidden");
      });
    }

    // HANDLER FOR NEW CHARACTER SIGN UP (Phase 1: Request OTP)
    if (signUpBtn && authModal && signUpPanel && otpPanel) {
      signUpBtn.addEventListener("click", async () => {
        const nameInput = (document.getElementById("auth-simulator-name") as HTMLInputElement)?.value.trim();
        const emailInput = (document.getElementById("auth-signup-email") as HTMLInputElement)?.value.trim();
        const passwordInput = (document.getElementById("auth-signup-password") as HTMLInputElement)?.value.trim();

        if (!nameInput || !emailInput || !passwordInput) {
          this.displayBannerNotification("⚠️ All fields (Name, Email, and Password) are required to create an account.", "amber");
          return;
        }

        // Strict Email format check
        const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
        if (!emailRegex.test(emailInput)) {
          this.displayBannerNotification("⚠️ Please enter a real email address (e.g. yourname@domain.com).", "amber");
          return;
        }

        // Strict Password length check
        if (passwordInput.length < 6) {
          this.displayBannerNotification("⚠️ Password must be at least 6 characters long.", "amber");
          return;
        }

        const chosenAvatar = selectedAvatarInp ? selectedAvatarInp.value : "🛡️";
        const chosenClass = selectedClassInp ? selectedClassInp.value : "Cavalier";

        signUpBtn.setAttribute("disabled", "true");
        signUpBtn.innerText = "⏳ Dispatching OTP Code...";

        try {
          const response = await fetch("/api/auth/otp/send", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              email: emailInput,
              password: passwordInput,
              name: nameInput,
              avatar: chosenAvatar,
              customTag: chosenClass,
              profile: {
                level: 1,
                xp: 0,
                xpNeeded: 100,
                streak: 0,
                coins: 0,
                favoriteCategories: ["Basics", "Adventure"],
                weakWords: [],
                achievements: [],
                name: nameInput,
                email: emailInput.toLowerCase().trim(),
                avatar: chosenAvatar,
                customTag: chosenClass,
                lastPracticeDate: ""
              },
              words: []
            })
          });

          const data = await response.json();
          if (!response.ok) {
            throw new Error(data.error || "Failed to dispatch verification code.");
          }

          this.displayBannerNotification("🗝️ Verification code generated successfully!", "purple");

          // Hide sign up screen & open code entry screen
          signUpPanel.classList.add("hidden");
          otpPanel.classList.remove("hidden");

          if (data.sandbox && data.otp) {
            if (sandboxHint && sandboxValue) {
              sandboxValue.innerText = data.otp;
              sandboxHint.classList.remove("hidden");
            }
          } else {
            if (sandboxHint) sandboxHint.classList.add("hidden");
          }

          if (otpCodeInput) {
            otpCodeInput.value = "";
            otpCodeInput.focus();
          }

        } catch (err: any) {
          console.error(err);
          this.displayBannerNotification(`❌ OTP Failed: ${err.message}`, "purple");
        } finally {
          signUpBtn.removeAttribute("disabled");
          signUpBtn.innerText = "➕ Create Free Account";
        }
      });
    }

    // HANDLER FOR OTP CODE CONFIRMATION (Phase 2: Finalize Sign Up)
    if (otpVerifyBtn && authModal && signUpPanel && otpPanel) {
      otpVerifyBtn.addEventListener("click", async () => {
        const emailInput = (document.getElementById("auth-signup-email") as HTMLInputElement)?.value.trim();
        const codeInput = otpCodeInput?.value.trim();

        if (!codeInput || codeInput.length !== 6) {
          this.displayBannerNotification("⚠️ Please enter the complete 6-digit verification code.", "amber");
          return;
        }

        otpVerifyBtn.setAttribute("disabled", "true");
        otpVerifyBtn.innerText = "⏳ Verifying Credentials...";

        try {
          const response = await fetch("/api/auth/otp/verify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              email: emailInput,
              otp: codeInput
            })
          });

          const data = await response.json();
          if (!response.ok) {
            throw new Error(data.error || "Verification failed");
          }

          // Successfully verified and created! Update current active player context
          this.profile = data.user.profile;
          this.profile.name = data.user.name;
          this.profile.email = data.user.email;
          this.profile.avatar = data.user.avatar;
          this.profile.customTag = data.user.customTag;
          this.saveProfile();

          // Set vocabulary list to the server's list (empty [] for new signups)
          this.dictionary.setWords(data.user.words || []);

          // Clear any deleted words tracked under prior sessions
          localStorage.removeItem("gq_deleted_words");

          // Set history to the server's list (empty [] for new signups)
          localStorage.setItem("gq_quiz_history", JSON.stringify(data.user.history || []));
          this.analytics.loadHistory();

          this.displayBannerNotification(`🔑 Credentials Verified! Welcome back to German Quest, ${this.profile.name}!`, "emerald");

          authModal.classList.add("hidden");
          authModal.classList.remove("flex");
          this.renderAllViews();
          this.fetchSmartAIRecommendations();

        } catch (err: any) {
          console.error(err);
          this.displayBannerNotification(`❌ Verification Failed: ${err.message}`, "purple");
        } finally {
          otpVerifyBtn.removeAttribute("disabled");
          otpVerifyBtn.innerText = "🛡️ Verify Code & Complete Sign Up";
        }
      });
    }

    // HANDLER FOR SIGN IN / LOGIN
    if (signInBtn && authModal) {
      signInBtn.addEventListener("click", async () => {
        const emailInput = (document.getElementById("auth-signin-email") as HTMLInputElement)?.value.trim();
        const passwordInput = (document.getElementById("auth-signin-password") as HTMLInputElement)?.value.trim();

        if (!emailInput || !passwordInput) {
          this.displayBannerNotification("⚠️ Please provide both your email and password.", "amber");
          return;
        }

        signInBtn.setAttribute("disabled", "true");
        signInBtn.innerText = "⏳ Signing In...";

        try {
          const response = await fetch("/api/auth/signin", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              email: emailInput,
              password: passwordInput
            })
          });

          const data = await response.json();
          if (!response.ok) {
            throw new Error(data.error || "SignIn failed");
          }

          // Successfully signed in!
          this.profile = data.user.profile;
          this.profile.name = data.user.name;
          this.profile.email = data.user.email;
          this.profile.avatar = data.user.avatar;
          this.profile.customTag = data.user.customTag;
          this.saveProfile();

          this.dictionary.setWords(data.user.words || []);

          // Clear any deleted words tracked under prior sessions
          localStorage.removeItem("gq_deleted_words");

          localStorage.setItem("gq_quiz_history", JSON.stringify(data.user.history || []));
          this.analytics.loadHistory();

          this.displayBannerNotification(`🔑 Welcome back, ${this.profile.name}! Your progress has been loaded.`, "emerald");

          authModal.classList.add("hidden");
          authModal.classList.remove("flex");

          // Reset sign-in input values
          (document.getElementById("auth-signin-email") as HTMLInputElement).value = "";
          (document.getElementById("auth-signin-password") as HTMLInputElement).value = "";

          this.renderAllViews();
          this.fetchSmartAIRecommendations();

        } catch (err: any) {
          console.error(err);
          this.displayBannerNotification(`❌ Login Failed: ${err.message}`, "purple");
        } finally {
          signInBtn.removeAttribute("disabled");
          signInBtn.innerText = "🔑 Sign In to Account";
        }
      });
    }
  }

  // Token decoding helper
  private decodeJwtToken(token: string): any {
    try {
      const base64Url = token.split('.')[1];
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      const jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
      }).join(''));
      return JSON.parse(jsonPayload);
    } catch (e) {
      return null;
    }
  }

  // Check if authenticated to toggle visibility of Landing welcome vs App Core
  private renderLandingAndAppToggle() {
    const landingContainer = document.getElementById("landing-page-interface");
    const appContainer = document.getElementById("app-core-interface");
    
    // Check if authenticated
    const isGuest = this.profile.email && this.profile.email !== "notconnect@domain.com";
    const hasGoogle = !!localStorage.getItem("gq_google_access_token");
    const isLoggedIn = isGuest || hasGoogle;
    
    if (isLoggedIn) {
      if (landingContainer) {
        landingContainer.classList.add("hidden");
        landingContainer.classList.remove("flex");
      }
      if (appContainer) {
        appContainer.classList.remove("hidden");
        appContainer.classList.add("flex");
      }
    } else {
      if (landingContainer) {
        landingContainer.classList.remove("hidden");
        landingContainer.classList.add("flex");
      }
      if (appContainer) {
        appContainer.classList.add("hidden");
        appContainer.classList.remove("flex");
      }
    }
  }

  private bindLandingEvents() {
    const btnSim = document.getElementById("landing-sim-btn");
    const btnSimHero = document.getElementById("hero-cta-sim");
    const btnQuickGuest = document.getElementById("hero-cta-guest-quick");
    const authModal = document.getElementById("auth-modal");

    const triggerSimAuth = () => {
      this.triggerDirectGoogleLogin();
    };

    btnSim?.addEventListener("click", triggerSimAuth);
    btnSimHero?.addEventListener("click", triggerSimAuth);
    
    // Quick starter guest login sequence
    btnQuickGuest?.addEventListener("click", () => {
      this.profile = {
        level: 1,
        xp: 0,
        xpNeeded: 100,
        streak: 0,
        coins: 0,
        favoriteCategories: ["Basics", "Adventure"],
        weakWords: [],
        achievements: [],
        name: "Guest Adventurer",
        email: "guest@domain.com",
        avatar: "🛡️",
        lastPracticeDate: ""
      };
      this.saveProfile();
      this.dictionary.setWords([
        { german: "der Drache", english: "the dragon", category: "Adventure", difficulty: "Medium", isFavorite: true, accuracyCount: 0, errorCount: 0 },
        { german: "die Burg", english: "the castle", category: "Adventure", difficulty: "Easy", isFavorite: false, accuracyCount: 0, errorCount: 0 },
        { german: "das Abenteuer", english: "the adventure", category: "Basics", difficulty: "Easy", isFavorite: true, accuracyCount: 0, errorCount: 0 },
        { german: "überwinden", english: "to overcome / vanquish", category: "Verbs", difficulty: "Hard", isFavorite: false, accuracyCount: 0, errorCount: 0 },
        { german: "der Trank", english: "the potion", category: "Adventure", difficulty: "Easy", isFavorite: false, accuracyCount: 0, errorCount: 0 },
        { german: "das Schwert", english: "the sword", category: "Adventure", difficulty: "Medium", isFavorite: false, accuracyCount: 0, errorCount: 0 },
        { german: "schnell", english: "fast / swift", category: "Adjectives", difficulty: "Easy", isFavorite: false, accuracyCount: 0, errorCount: 0 },
        { german: "der Wald", english: "the forest", category: "Nouns", difficulty: "Easy", isFavorite: false, accuracyCount: 0, errorCount: 0 },
        { german: "die Hexe", english: "the witch", category: "Adventure", difficulty: "Medium", isFavorite: false, accuracyCount: 0, errorCount: 0 },
        { german: "der Schatz", english: "the treasure", category: "Adventure", difficulty: "Easy", isFavorite: true, accuracyCount: 0, errorCount: 0 },
        { german: "kämpfen", english: "to fight / battle", category: "Verbs", difficulty: "Medium", isFavorite: false, accuracyCount: 0, errorCount: 0 },
        { german: "der Schild", english: "the shield", category: "Adventure", difficulty: "Easy", isFavorite: false, accuracyCount: 0, errorCount: 0 },
        { german: "guten Morgen", english: "good morning", category: "Conversation", difficulty: "Easy", isFavorite: false, accuracyCount: 0, errorCount: 0 },
        { german: "wie geht es dir?", english: "how are you?", category: "Conversation", difficulty: "Easy", isFavorite: false, accuracyCount: 0, errorCount: 0 }
      ]);
      this.renderAllViews();
      this.displayBannerNotification("⚡ Quick Start: Welcomed Guest Adventurer!", "blue");
    });
  }

  private demoWordIndex = 0;

  private initLandingInteractiveDemo() {
    // Start gorgeous 3D particle canvas and card tilt rotation
    initLanding3DEffects("sandbox-card", "landing-3d-canvas");

    const DEMO_WORDS = [
      { german: "die Zauberei", english: "magic" },
      { german: "der Drache", english: "dragon" },
      { german: "die Burg", english: "castle" },
      { german: "das Abenteuer", english: "adventure" },
      { german: "überwinden", english: "overcome" }
    ];

    const forgeBtn = document.getElementById("sandbox-forge-btn");
    const inputEl = document.getElementById("sandbox-input") as HTMLInputElement;
    const germanEl = document.getElementById("sandbox-german-word");
    const feedbackEl = document.getElementById("sandbox-feedback");
    const cardEl = document.getElementById("sandbox-card");

    if (forgeBtn && inputEl && germanEl && feedbackEl && cardEl) {
      // Set initial placeholder and first word dynamically so they are always in sync
      const firstWord = DEMO_WORDS[this.demoWordIndex];
      germanEl.innerText = firstWord.german;
      inputEl.placeholder = `Hint: starts with '${firstWord.english[0]}'...`;

      forgeBtn.addEventListener("click", () => {
        const val = inputEl.value.trim().toLowerCase();
        const targetWord = DEMO_WORDS[this.demoWordIndex];
        
        const isCorrect = val === targetWord.english || 
                          val === targetWord.english.toLowerCase() || 
                          val === `the ${targetWord.english}` || 
                          val === `to ${targetWord.english}`;
        
        if (isCorrect) {
          feedbackEl.innerHTML = `<span class="text-emerald-400 font-bold">✨ SPELL SUCCESSFULLY FORGED! +50 XP!</span>`;
          cardEl.className = "glass-panel rounded-3xl p-6 border border-emerald-500/40 flex flex-col gap-4 shadow-xl select-none glow-emerald animate-float";
          
          this.demoWordIndex = (this.demoWordIndex + 1) % DEMO_WORDS.length;
          
          setTimeout(() => {
            const nextWord = DEMO_WORDS[this.demoWordIndex];
            germanEl.innerText = nextWord.german;
            inputEl.value = "";
            inputEl.placeholder = `Hint: starts with '${nextWord.english[0]}'...`;
            cardEl.className = "glass-panel rounded-3xl p-6 border border-slate-800 flex flex-col gap-4 shadow-xl select-none";
            feedbackEl.innerHTML = `Great job! Now forge the next spell: <b>${nextWord.german}</b>. Hint: starts with '<strong>${nextWord.english[0]}</strong>'.`;
          }, 1600);
        } else {
          feedbackEl.innerHTML = `<span class="text-rose-400 font-bold">❌ Spell Backfired! It actually means: "${targetWord.english}". Try again!</span>`;
          cardEl.className = "glass-panel rounded-3xl p-6 border border-rose-500/45 flex flex-col gap-4 shadow-xl select-none glow-rose animate-shake";
          setTimeout(() => {
            cardEl.className = "glass-panel rounded-3xl p-6 border border-slate-800 flex flex-col gap-4 shadow-xl select-none";
          }, 850);
        }
      });

      // Allow enter key press
      inputEl.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          forgeBtn.click();
        }
      });
    }
  }
}

// Instantiate the app core orchestrator on load or immediately if DOM is already parsed
function initApp() {
  if (!(window as any).GermanQuest) {
    (window as any).GermanQuest = new AppOrchestrator();
  }
}

if (document.readyState === "loading") {
  window.addEventListener("DOMContentLoaded", initApp);
} else {
  initApp();
}
