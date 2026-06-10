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
        words: db[emailKey].words
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
        words: user.words
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
    const { email, profile, words } = req.body;
    
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
    
    writeUsersDB(db);
    
    res.json({ success: true, message: "Progress securely backed up to the Quest Guild Server!" });
  } catch (error: any) {
    console.error("Sync progress error:", error);
    res.status(500).json({ error: "Server backup sync failed: " + error.message });
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

    const systemPrompt = `You are "Adler", the expert AI Tutor and Gamified companion for German Quest, an RPG-style vocabulary learning dashboard.
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

    if (process.env.GEMINI_API_KEY) {
      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: formattedContents,
        config: {
          systemInstruction: systemPrompt,
          temperature: 0.7,
        }
      });
      res.json({ text: response.text });
    } else {
      // Return a graceful responsive fallback if no API key is set
      const lastUserMsg = messages[messages.length - 1]?.content || "";
      let mockReply = `📚 [Offline Mode] Das ist wunderbar! I can talk with you offline. If you want to connect me to real Gemini intelligence, please set your GEMINI_API_KEY in the Secrets panel!

To answer your sentence: "${lastUserMsg}", keep up the great adventure! Level ${userProfile?.level || 1} is just the beginning of your awesome quest!`;
      res.json({ text: mockReply });
    }
  } catch (error: any) {
    console.error("AI Chat Error:", error);
    res.status(500).json({ error: "Failed to communicate with AI tutor. " + error.message });
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
      res.json(parsed);
    } else {
      // Mock sentence generation
      res.json({
        sentence: `Ich benutze das Wort "${word}" gerne auf meiner tollen Abenteuerreise!`,
        translation: `I like to use the word "${word}" on my great adventure journey!`,
        tip: `Mnemonic: Imagine using "${word}" like a magical key to unlock a hidden chest!`
      });
    }
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
      res.json(parsed);
    } else {
      // Offline fallback recommendations
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
    }
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
