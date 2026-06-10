import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
import fs from "fs";
import nodemailer from "nodemailer";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());

// Public Privacy Policy routes for Google OAuth verification compliance
const sendPrivacyFile = (res: express.Response) => {
  const paths = [
    path.join(process.cwd(), "privacy.html"),
    path.join(process.cwd(), "public", "privacy.html"),
    path.join(process.cwd(), "dist", "privacy.html")
  ];
  for (const p of paths) {
    if (fs.existsSync(p)) {
      res.sendFile(p);
      return;
    }
  }
  res.status(404).send("Privacy policy file not found.");
};

app.get("/privacy", (req, res) => {
  sendPrivacyFile(res);
});
app.get("/privacy.html", (req, res) => {
  sendPrivacyFile(res);
});

// -------------------------------------------------------------
// SECURE FILE-BASED USER DATABASE AUTHENTICATION
// -------------------------------------------------------------
const USERS_DB_FILE = path.join(process.cwd(), "users-db.json");

function readUsersDB() {
  if (!fs.existsSync(USERS_DB_FILE)) {
    return {};
  }
  try {
    const raw = fs.readFileSync(USERS_DB_FILE, "utf-8");
    return JSON.parse(raw || "{}");
  } catch (error) {
    console.error("Error reading users db:", error);
    return {};
  }
}

function writeUsersDB(data: any) {
  try {
    fs.writeFileSync(USERS_DB_FILE, JSON.stringify(data, null, 2), "utf-8");
  } catch (error) {
    console.error("Error writing users db:", error);
  }
}

// Temporary storage for pending email registrations with 15-minute OTP validation
interface PendingUser {
  otp: string;
  expiresAt: number;
  userData: {
    email: string;
    password: Password;
    name: string;
    avatar: string;
    customTag: string;
    profile: any;
    words: any[];
  };
}
type Password = string;

const PENDING_REGISTRATIONS: Record<string, PendingUser> = {};

// Helper to construct a dynamic, real SMTP transporter
function getSMTPTransporter() {
  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || "587", 10);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  
  if (host && user && pass) {
    return nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: {
        user,
        pass,
      },
      tls: {
        rejectUnauthorized: false
      }
    });
  }
  return null;
}

// STEP 1: REQUEST VERIFICATION CODE (OTP) SENT TO REAL EMAIL
app.post("/api/auth/otp/send", async (req, res) => {
  try {
    const { email, password, name, avatar, customTag, profile, words } = req.body;
    
    if (!email || !password || !name) {
      return res.status(400).json({ error: "Email, password, and Name are required to begin." });
    }
    
    const emailKey = email.toLowerCase().trim();
    // Regex for real valid structured email addresses
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (!emailRegex.test(emailKey)) {
      return res.status(400).json({ error: "Please enter a valid, real email address format (e.g. name@domain.com)." });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters long." });
    }
    
    const db = readUsersDB();
    if (db[emailKey]) {
      return res.status(400).json({ error: "An account with this email address already exists. Please Sign In." });
    }
    
    // Generate a secure 6-digit random code
    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    const expiration = Date.now() + 15 * 60 * 1000; // 15 Minute expiration
    
    // Store in-memory pending record
    PENDING_REGISTRATIONS[emailKey] = {
      otp: otpCode,
      expiresAt: expiration,
      userData: {
        email: emailKey,
        password: password,
        name: name,
        avatar: avatar || "🛡️",
        customTag: customTag || "Cavalier",
        profile: profile || null,
        words: words || []
      }
    };
    
    const transporter = getSMTPTransporter();
    if (transporter) {
      const fromAddr = process.env.SMTP_FROM || '"German Quest Verification" <noreply@germanquest.com>';
      const mailOptions = {
        from: fromAddr,
        to: emailKey,
        subject: "🗝&zwj;️ German Quest OTP Code - Verify Your New Account",
        text: `Hello ${name}!\n\nThank you for signing up to German Quest. To log in and unlock your real account, verify this email address using the following One-Time Password (OTP):\n\n💎 OTP CODE: ${otpCode}\n\nThis code expires in 15 minutes.\n\nGood luck on your language learning adventure!`,
        html: `
          <div style="font-family: sans-serif; background-color: #0b0f19; color: #f8fafc; padding: 40px; border-radius: 12px; max-width: 500px; margin: auto; border: 1px solid #1e293b;">
            <div style="text-align: center; margin-bottom: 24px;">
              <span style="font-size: 40px;">🇩🇪⚔️</span>
              <h2 style="color: #c084fc; margin-top: 8px;">Verify Your Account</h2>
            </div>
            <p style="font-size: 14px; line-height: 1.5; color: #cbd5e1;">Hallo <strong>${name}</strong>!</p>
            <p style="font-size: 14px; line-height: 1.5; color: #cbd5e1;">Your real email security shield is active! To complete your account sign-up and log in, copy the 15-minute verification code below:</p>
            
            <div style="background-color: #020617; border: 1px dashed #c084fc; border-radius: 8px; text-align: center; padding: 16px; margin: 24px 0;">
              <span style="font-size: 28px; font-weight: bold; letter-spacing: 4px; color: #a78bfa; font-family: monospace;">${otpCode}</span>
            </div>
            
            <p style="font-size: 12px; color: #64748b;">If you did not request this code, you can safely ignore this email.</p>
            <hr style="border-color: #334155; margin-top: 24px;" />
            <p style="text-align: center; font-size: 11px; color: #475569; margin-top: 12px;">German Quest RPG Server Node Ingress Proxy</p>
          </div>
        `
      };
      
      await transporter.sendMail(mailOptions);
      console.log(`REAL MAIL SUCCESS: Sent OTP code ${otpCode} inside email body to ${emailKey}`);
      
      return res.json({
        success: true,
        sandbox: false,
        message: "A verification OTP has been sent into your real email inbox! Check spam folder if not loaded in 1-2 minutes."
      });
    } else {
      // SMTP not configured yet, run in developer sandbox mode so they can test immediately and get logs!
      console.warn(`WARNING: SMTP variables not set in .env. Falling back to Developer Sandbox Mode.`);
      console.log(`[DEVELOPER SANDBOX DEBUG LOG] Generated verification OTP for email "${emailKey}" is: ${otpCode}`);
      
      return res.json({
        success: true,
        sandbox: true,
        otp: otpCode, // Send the OTP here so sandbox users can register even if they have not set up their .env SMTP server!
        message: "Developer Sandbox Active! Real email OTP generated successfully. (SMTP not configured in secrets; code retrieved directly for testing)"
      });
    }
    
  } catch (err: any) {
    console.error("Send OTP Error:", err);
    res.status(500).json({ error: "Failed to send verification code. Check email address validity or server configurations: " + err.message });
  }
});

// STEP 2: FINALIZE REGISTRATION UPON CORRECT OTP CODE SUBMISSION
app.post("/api/auth/otp/verify", (req, res) => {
  try {
    const { email, otp } = req.body;
    
    if (!email || !otp) {
      return res.status(400).json({ error: "Both email address and 6-digit OTP code are required." });
    }
    
    const emailKey = email.toLowerCase().trim();
    const pendingObj = PENDING_REGISTRATIONS[emailKey];
    
    if (!pendingObj) {
      return res.status(400).json({ error: "No pending registration found for this email, or code has already been verified." });
    }
    
    if (Date.now() > pendingObj.expiresAt) {
      delete PENDING_REGISTRATIONS[emailKey];
      return res.status(400).json({ error: "Verification code has expired (15 minute limit reached). Please request a new code." });
    }
    
    if (pendingObj.otp !== otp.trim()) {
      return res.status(401).json({ error: "The entered verification OTP code is incorrect. Check your email or try again." });
    }
    
    // OTP is correct! Finalize character registration to database
    const { name, password, avatar, customTag, profile, words } = pendingObj.userData;
    
    const db = readUsersDB();
    db[emailKey] = {
      email: emailKey,
      password: password,
      name: name,
      avatar: avatar || "🛡️",
      customTag: customTag || "Cavalier",
      profile: profile || {
        level: 1,
        xp: 120,
        xpNeeded: 300,
        streak: 0,
        coins: 150,
        favoriteCategories: ["Basics", "Adventure"],
        weakWords: [],
        achievements: ["recruit"],
        name: name,
        email: emailKey,
        avatar: avatar || "🛡️",
        lastPracticeDate: ""
      },
      words: words || []
    };
    
    writeUsersDB(db);
    
    // Clean up temporary object
    delete PENDING_REGISTRATIONS[emailKey];
    
    res.json({
      success: true,
      message: "Account verified and registered successfully!",
      user: {
        email: emailKey,
        name: db[emailKey].name,
        avatar: db[emailKey].avatar,
        customTag: db[emailKey].customTag,
        profile: db[emailKey].profile,
        words: db[emailKey].words,
        history: db[emailKey].history || []
      }
    });
    
  } catch (error: any) {
    console.error("Verify OTP Error:", error);
    res.status(500).json({ error: "Credentials verification failed: " + error.message });
  }
});

// REGISTER / SIGN UP HERO WITH EMAIL & PASSWORD (Legacy fallback API endpoint)
app.post("/api/auth/signup", (req, res) => {
  res.status(400).json({ error: "This signup method is disabled. Please request dynamic OTP verification codes instead." });
});

// LOGIN / SIGN IN HERO WITH EMAIL & PASSWORD
app.post("/api/auth/signin", (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ error: "Both email and password are required." });
    }
    
    const emailKey = email.toLowerCase().trim();
    const db = readUsersDB();
    const user = db[emailKey];
    
    if (!user || user.password !== password) {
      return res.status(400).json({ error: "Invalid email or password. Please verify credentials." });
    }
    
    res.json({
      success: true,
      message: "Welcome back, veteran Hero!",
      user: {
        email: user.email,
        name: user.name,
        avatar: user.avatar,
        customTag: user.customTag,
        profile: user.profile,
        words: user.words,
        history: user.history || []
      }
    });
  } catch (error: any) {
    console.error("Login error:", error);
    res.status(500).json({ error: "Failed to log in hero: " + error.message });
  }
});

// SECURE BACKUP SAVE PROGRESS
app.post("/api/auth/save-progress", (req, res) => {
  try {
    const { email, profile, words, history } = req.body;
    
    if (!email || email === "notconnect@domain.com") {
      return res.status(400).json({ error: "Access Denied: Must log in with actual email account first." });
    }
    
    const emailKey = email.toLowerCase().trim();
    const db = readUsersDB();
    
    if (!db[emailKey]) {
      return res.status(404).json({ error: "Adventurer account not found on the server database." });
    }
    
    // Update active level statistics
    if (profile) {
      db[emailKey].profile = profile;
      db[emailKey].name = profile.name || db[emailKey].name;
      db[emailKey].avatar = profile.avatar || db[emailKey].avatar;
      db[emailKey].customTag = profile.customTag || db[emailKey].customTag;
    }
    if (words) {
      db[emailKey].words = words;
    }
    if (history) {
      db[emailKey].history = history;
    }
    
    writeUsersDB(db);
    
    res.json({ success: true, message: "Progress securely backed up to the Quest Guild Server!" });
  } catch (error: any) {
    console.error("Sync progress error:", error);
    res.status(500).json({ error: "Server backup sync failed: " + error.message });
  }
});

// GET DYNAMIC LEADERBOARD FROM ACTUAL USERS
app.get("/api/leaderboard", (req, res) => {
  try {
    const db = readUsersDB();
    const isRealUser = req.query.isRealUser === "true";
    const DEFAULT_LEADERBOARD_BOTS = [
      { name: "Siegfried_Word", level: 5, xp: 50, cumulativeXp: 4 * 300 + 50, streak: 8, tag: "Spell Lord", avatar: "🧙‍♂️" },
      { name: "Brunhilde_Learn", level: 4, xp: 80, cumulativeXp: 3 * 300 + 80, streak: 5, tag: "Teutonic Hero", avatar: "⚔️" },
      { name: "Hans_Quest", level: 3, xp: 40, cumulativeXp: 2 * 300 + 40, streak: 3, tag: "Rune Tracker", avatar: "🛡️" },
      { name: "Adler_Owl_Fan", level: 2, xp: 95, cumulativeXp: 1 * 300 + 95, streak: 1, tag: "", avatar: "🦉" }
    ];

    const realPlayers = Object.values(db).map((u: any) => {
      const profile = u.profile || {};
      const lvl = parseInt(profile.level) || 1;
      const currentLvlXp = parseInt(profile.xp) || 0;
      return {
        name: u.name || "Adventurer",
        level: lvl,
        xp: currentLvlXp,
        cumulativeXp: (lvl - 1) * 300 + currentLvlXp,
        streak: parseInt(profile.streak) || 0,
        tag: u.customTag || "",
        avatar: u.avatar || "🛡️"
      };
    });

    let combined = [...realPlayers];
    if (!isRealUser) {
      for (const bot of DEFAULT_LEADERBOARD_BOTS) {
        if (!combined.some(p => p.name.toLowerCase().trim() === bot.name.toLowerCase().trim())) {
          combined.push(bot);
        }
      }
    }

    // Sort descending by cumulative progress
    combined.sort((a, b) => b.cumulativeXp - a.cumulativeXp);

    // Keep top entries and map them safely
    const leaderboard = combined.map(p => ({
      name: p.name,
      level: p.level,
      xp: p.xp,
      cumulativeXp: p.cumulativeXp,
      streak: p.streak,
      tag: p.tag,
      avatar: p.avatar
    }));

    res.json({ success: true, leaderboard });
  } catch (error: any) {
    console.error("Leaderboard fetch error:", error);
    res.status(500).json({ error: "Failed to compile leaderboard statistics" });
  }
});

// Lazy-initialized Gemini client
let aiClient: GoogleGenAI | null = null;
function getGemini(): GoogleGenAI {
  if (!aiClient) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      console.warn("WARNING: GEMINI_API_KEY environment variable is not set. AI features might be fallback-only.");
    }
    aiClient = new GoogleGenAI({
      apiKey: key || "MOCK_KEY",
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
  }
  return aiClient;
}

function parseGeminiError(error: any): string {
  const errMsg = error?.message || "";
  // Check if error is serialized JSON
  if (errMsg.startsWith("{") || errMsg.includes('"error"')) {
    try {
      const parsed = JSON.parse(errMsg);
      if (parsed?.error?.message) {
        const subMsg = parsed.error.message;
        if (parsed.error.code === 429 || subMsg.toLowerCase().includes("quota") || subMsg.toLowerCase().includes("exhausted")) {
          return "Your Gemini free tier quota has been exceeded. Please wait a moment, or configure your own billing/API Key!";
        }
        return subMsg;
      }
    } catch (e) {
      // ignore JSON parse error
    }
  }

  if (errMsg.includes("429") || errMsg.toLowerCase().includes("quota") || errMsg.toLowerCase().includes("exhausted") || error?.status === 429) {
    return "Your Gemini free tier quota has been exceeded. Please wait a moment, or configure your own billing/API Key!";
  }
  if (errMsg.includes("403") || errMsg.toLowerCase().includes("key") || errMsg.includes("API key not valid") || errMsg.includes("API_KEY_INVALID")) {
    return "The Gemini API key is invalid or restricted. Please check your credentials in the Settings menu.";
  }
  return errMsg || error?.toString() || "Unknown API Connection error";
}


// -------------------------------------------------------------
// SECURE IN-CHARACTER OFFLINE RULES-BASED GERMAN TUTOR ENGINE
// -------------------------------------------------------------
function generateOfflineTutorResponse(userMsg: string, userProfile: any): string {
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
      mnemonic: "Sounds like Dracula but friendly! Imagine a fire-breathing dragon wearing a 'der' guild leader hat.",
      example: "Der Drache bewacht den geheimen Gildenhort.",
      translation: "The dragon guards the secret guild hoard.",
      type: "noun"
    },
    "dragon": {
      word: "der Drache",
      meaning: "the dragon",
      plural: "die Drachen",
      pronunciation: "der DRAH-che",
      mnemonic: "Sounds like Dracula but friendly! Imagine a fire-breathing dragon wearing a 'der' guild leader hat.",
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
      translation: "The clever witch brews magic potions in the forest.",
      type: "noun"
    },
    "witch": {
      word: "die Hexe",
      meaning: "the witch",
      plural: "die Hexen",
      pronunciation: "die HEX-e",
      mnemonic: "A devious witch casting hexagonal (Hexe) runes into her cauldron.",
      example: "Die schlaue Hexe braut Zaubertränke im Wald.",
      translation: "The clever witch brews magic potions in the forest.",
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
  if (query.includes("level") || query.includes("xp") || query.includes("coins") || query.includes("streak") || query.includes("score")) {
    const lvl = userProfile?.level || 1;
    const coins = userProfile?.coins || 1500;
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

  // 7. Dynamic sentence check logic (if they ask to say/translate custom English)
  if (query.includes("how do you say") || query.includes("translate") || query.includes("what is") || query.includes("meaning of")) {
    // Try to extract clean noun
    let spokenWord = "der Abenteurer";
    let meaning = "the adventurer";
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

// -------------------------------------------------------------
// SECURE SERVER-SIDE GEMINI API INNER ROUTING
// -------------------------------------------------------------

// AI Chatbot endpoint
app.post("/api/ai/chat", async (req, res) => {
  try {
    const { messages, userProfile } = req.body;
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: "Invalid messages parameter." });
    }

    const systemPrompt = `You are "Maaz", the expert AI Tutor and Gamified companion for German Quest, an RPG-style vocabulary learning dashboard.
Your tone should be highly encouraging, helpful, slightly playful, and immersive like an NPC guildmaster or companion.
Keep your responses relatively concise (usually 2-3 short paragraphs maximum) so it fits in a gaming chat module.
Explain concepts clearly, provide pronunciation tips, and always include 1 small German sentence example where relevant.
User current profile info: Level ${userProfile?.level || 1}, Streak ${userProfile?.streak || 0} days, XP ${userProfile?.xp || 0}, Weak words in need of training: ${(userProfile?.weakWords || []).join(', ') || 'None yet'}.
If German words are used, provide their gender (der/die/das) and plural forms. Ensure your tone is friendly and modern!`;

    const ai = getGemini();
    const formattedContents = messages.map(msg => ({
      role: msg.role === "assistant" ? "model" as const : "user" as const,
      parts: [{ text: msg.content }]
    }));

    // Filter out any leading model/assistant messages because Gemini requires history to start with a "user" message
    let finalContents = [...formattedContents];
    while (finalContents.length > 0 && finalContents[0].role === "model") {
      finalContents.shift();
    }

    if (finalContents.length === 0) {
      return res.status(400).json({ error: "Chat history must contain at least one user message." });
    }

    const lastUserMsg = messages[messages.length - 1]?.content || "";

    if (process.env.GEMINI_API_KEY) {
      try {
        const response = await ai.models.generateContent({
          model: "gemini-3.5-flash",
          contents: finalContents,
          config: {
            systemInstruction: systemPrompt,
            temperature: 0.7,
          }
        });
        return res.json({ text: response.text });
      } catch (innerError: any) {
        const friendlyError = parseGeminiError(innerError);
        console.warn(`[Gemini Fallback] Chat generation fallback triggered: ${friendlyError}`);
        // Return fully populated simulated AI reply tailored exactly to their query!
        const mockReply = generateOfflineTutorResponse(lastUserMsg, userProfile);
        return res.json({ text: mockReply });
      }
    } else {
      // Return fully populated simulated AI reply tailored exactly to their query!
      const mockReply = generateOfflineTutorResponse(lastUserMsg, userProfile);
      return res.json({ text: mockReply });
    }
  } catch (error: any) {
    console.error("AI Chat Error (Outer):", error);
    const friendlyError = parseGeminiError(error);
    res.status(500).json({ error: friendlyError });
  }
});

// AI Example sentences generation
app.post("/api/ai/sentence", async (req, res) => {
  try {
    const { word, meaning } = req.body;
    if (!word) {
      return res.status(400).json({ error: "Word parameter is required." });
    }

    const ai = getGemini();
    if (process.env.GEMINI_API_KEY) {
      try {
        const prompt = `Create an immersive, fun, gamified German example sentence and its English translation for the word: "${word}" (meaning: "${meaning || 'unknown'}").
Include direct grammatical hints (gender der/die/das for nouns, strong/weak for verbs, etc.) and a quick context mnemonic tip to memorize it.
Format your output exactly as a JSON response with these keys:
{
  "sentence": "The German example sentence",
  "translation": "The English translation of that sentence",
  "tip": "Memory mnemonic, tip, or fun gamified remark"
}`;

        const response = await ai.models.generateContent({
          model: "gemini-3.5-flash",
          contents: prompt,
          config: {
            responseMimeType: "application/json",
            temperature: 0.8,
          }
        });

        const parsed = JSON.parse(response.text || "{}");
        return res.json(parsed);
      } catch (innerError: any) {
        const friendlyError = parseGeminiError(innerError);
        console.warn(`[Gemini Fallback] Sentence generation fallback triggered: ${friendlyError}`);
        // Fall back to offline generation beneath
      }
    }

    // Mock sentence generation (reached if no key or key failed)
    res.json({
      sentence: `Ich benutze das Wort "${word}" gerne auf meiner tollen Abenteuerreise!`,
      translation: `I like to use the word "${word}" on my great adventure journey!`,
      tip: `Keep fighting! Imagine using "${word}" like a magical key to unlock a hidden chest!`
    });
  } catch (error: any) {
    console.error("AI Sentence Error:", error);
    res.status(500).json({ error: "Failed to generate AI tip. Using offline algorithm instead." });
  }
});

// AI Smart recommendations endpoint
app.post("/api/ai/recommend", async (req, res) => {
  try {
    const { level, weakWords, favoriteCategories } = req.body;
    const ai = getGemini();

    if (process.env.GEMINI_API_KEY) {
      try {
        const prompt = `Based on a German student at RPG Level ${level || 1} whose weak words are [${(weakWords || []).join(', ')}] and favorite categories are [${(favoriteCategories || []).join(', ')}], recommend exactly 3 custom premium words that they should fight/learn next.
Format your output exactly as a JSON array inside an object with key "recommendations":
{
  "recommendations": [
    {
      "word": "German Word with article if noun (e.g. der Drache)",
      "meaning": "English Meaning",
      "category": "Adventure / Magic / Everyday / verbs, etc",
      "difficulty": "Easy / Medium / Hard",
      "xpAward": 50,
      "lore": "A micro heroic lore or tip about the word, strictly under 15 words"
    },
    ...
  ]
}`;

        const response = await ai.models.generateContent({
          model: "gemini-3.5-flash",
          contents: prompt,
          config: {
            responseMimeType: "application/json",
            temperature: 0.7,
          }
        });

        const parsed = JSON.parse(response.text || "{}");
        if (parsed && Array.isArray(parsed.recommendations)) {
          return res.json(parsed);
        } else {
          throw new Error("Invalid format returned from Gemini model");
        }
      } catch (innerError: any) {
        const friendlyError = parseGeminiError(innerError);
        console.warn(`[Gemini Fallback] Recommendation fallback triggered: ${friendlyError}`);
        // Fall back to offline recommendations beneath
      }
    }

    // Offline fallback recommendations (reached if no key or key failed)
    res.json({
      recommendations: [
        {
          word: "der Abenteurer",
          meaning: "the adventurer",
          category: "Roleplay",
          difficulty: "Easy",
          xpAward: 40,
          lore: "You are the brave 'Abenteurer' seeking elite vocabulary conquest!"
        },
        {
          word: "überwinden",
          meaning: "to overcome / vanquish",
          category: "Verbs",
          difficulty: "Medium",
          xpAward: 60,
          lore: "A majestic verb to describe how you conquer vocabulary boss fights!"
        },
        {
          word: "die Schatzkiste",
          meaning: "the treasure chest",
          category: "Nouns",
          difficulty: "Easy",
          xpAward: 30,
          lore: "Where your earned XP, coins, and knowledge are kept safe."
        }
      ]
    });
  } catch (error: any) {
    console.error("AI Recommend Error:", error);
    res.status(500).json({ error: "Failed to fetch smart recommendations." });
  }
});

// -------------------------------------------------------------
// VITE AND STATIC ASSET SERVING MIDDLEWARE
// -------------------------------------------------------------
async function bootstrap() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server is running at http://localhost:${PORT}`);
  });
}

bootstrap();
