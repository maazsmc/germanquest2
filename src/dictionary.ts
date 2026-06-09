export interface Word {
  german: string;
  english: string;
  category: string;
  difficulty: "Easy" | "Medium" | "Hard";
  isFavorite: boolean;
  accuracyCount: number;
  errorCount: number;
}

// Default starter RPG dictionary
const DEFAULT_WORDS: Word[] = [
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
];

export class Dictionary {
  private words: Word[] = [];
  private appsScriptUrl: string = "";
  private userEmail: string = "guest";

  constructor() {
    this.loadFromCache();
  }

  // Load backend configurations
  public setConfig(url: string, email: string) {
    this.appsScriptUrl = url;
    this.userEmail = email || "guest";
    localStorage.setItem("gq_apps_script_url", url);
  }

  public getAppsScriptUrl(): string {
    return this.appsScriptUrl || localStorage.getItem("gq_apps_script_url") || "";
  }

  public getWords(): Word[] {
    return this.words;
  }

  // Manage Local Storage cache
  private loadFromCache() {
    const cached = localStorage.getItem("gq_vocab_cache");
    const savedUrl = localStorage.getItem("gq_apps_script_url");
    
    if (savedUrl) {
      this.appsScriptUrl = savedUrl;
    }
    
    if (cached) {
      try {
        this.words = JSON.parse(cached);
      } catch (e) {
        this.words = [...DEFAULT_WORDS];
      }
    } else {
      this.words = [...DEFAULT_WORDS];
      this.saveToCache();
    }
  }

  public saveToCache() {
    localStorage.setItem("gq_vocab_cache", JSON.stringify(this.words));
  }

  // Set local state directly
  public setWords(newWords: Word[]) {
    this.words = newWords;
    this.saveToCache();
  }

  // Core Word CRUDS
  public addWord(word: Word): boolean {
    // Check duplicates
    const exists = this.words.some(w => w.german.toLowerCase().trim() === word.german.toLowerCase().trim());
    if (exists) return false;
    
    this.words.unshift(word);
    this.saveToCache();
    return true;
  }

  public updateWord(index: number, updated: Word) {
    if (index >= 0 && index < this.words.length) {
      this.words[index] = updated;
      this.saveToCache();
    }
  }

  public deleteWord(index: number) {
    if (index >= 0 && index < this.words.length) {
      this.words.splice(index, 1);
      this.saveToCache();
    }
  }

  public toggleFavorite(index: number): boolean {
    if (index >= 0 && index < this.words.length) {
      this.words[index].isFavorite = !this.words[index].isFavorite;
      this.saveToCache();
      return this.words[index].isFavorite;
    }
    return false;
  }

  public reportQuizResult(germanWord: string, isCorrect: boolean) {
    const word = this.words.find(w => w.german.toLowerCase().trim() === germanWord.toLowerCase().trim());
    if (word) {
      if (isCorrect) {
        word.accuracyCount = (word.accuracyCount || 0) + 1;
      } else {
        word.errorCount = (word.errorCount || 0) + 1;
      }
      this.saveToCache();
    }
  }

  // Smart analytical calculations
  public getWeakWords(): Word[] {
    // Weak words are those with high error counts or lower accuracy ratio
    return this.words
      .filter(w => (w.errorCount || 0) > 0)
      .sort((a, b) => {
        const ratioA = (a.accuracyCount || 0) / ((a.accuracyCount || 0) + (a.errorCount || 1));
        const ratioB = (b.accuracyCount || 0) / ((b.accuracyCount || 0) + (b.errorCount || 1));
        return ratioA - ratioB; // Lowest accuracy ratio comes first
      });
  }

  // Real-time synchronization with Google Sheets API (supports Direct Google OAuth API and Apps Script Fallback)
  public async syncWithGoogleSheets(): Promise<{ success: boolean; count?: number; message?: string }> {
    const accessToken = localStorage.getItem("gq_google_access_token");
    if (accessToken) {
      return await this.syncDirectlyWithGoogleAPIs(accessToken);
    }

    const apiUrl = this.getAppsScriptUrl();
    if (!apiUrl) {
      return { success: false, message: "Google account is not connected, and no Apps Script URL is set. Go to settings or click Connect!" };
    }

    try {
      // 1. Send our current local array to sync / store
      const syncResponse = await fetch(apiUrl, {
        method: "POST",
        mode: "no-cors", // Necessary for cross-origin redirects from Google Apps Script web apps
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "sync",
          email: this.userEmail,
          words: this.words
        }),
      });

      // Note: with 'no-cors' mode, browser cannot inspect the true response body directly,
      // but we can also perform a quick query to download and synchronize. Let's do a double confirmation.
      // Now, fetch latest synced items from sheet
      try {
        const getResponse = await fetch(apiUrl);
        if (getResponse.ok) {
          const remoteWords: any[] = await getResponse.json();
          if (Array.isArray(remoteWords) && remoteWords.length > 0) {
            // Map JSON to Word interface
            const formatted: Word[] = remoteWords.map(rw => ({
              german: rw.german,
              english: rw.english,
              category: rw.category || "Basics",
              difficulty: (rw.difficulty === "Easy" || rw.difficulty === "Medium" || rw.difficulty === "Hard") ? rw.difficulty : "Medium",
              isFavorite: rw.isFavorite === true,
              accuracyCount: parseInt(rw.accuracyCount) || 0,
              errorCount: parseInt(rw.errorCount) || 0
            }));
            
            this.setWords(formatted);
            return { success: true, count: formatted.length, message: "Successfully synced and downloaded database content!" };
          }
        }
      } catch (getErr) {
        console.warn("GET sync check failed, probably CORS on Script, using write sync:", getErr);
      }

      return { success: true, message: "Sync command successfully deployed to Google Sheets!" };
    } catch (error: any) {
      console.error("Sheets sync Error:", error);
      return { success: false, message: error.message || "Failed network connection to Google endpoint." };
    }
  }

  // Synchronize directly with Google Sheets + Drive APIs using OAuth Access Token
  public async syncDirectlyWithGoogleAPIs(accessToken: string): Promise<{ success: boolean; count?: number; message?: string }> {
    try {
      // 1. Search for existing spreadsheet titled "German Quest Vocabulary"
      const searchUrl = `https://www.googleapis.com/drive/v3/files?q=name='German Quest Vocabulary' and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false`;
      const searchRes = await fetch(searchUrl, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      
      if (!searchRes.ok) {
        if (searchRes.status === 401) {
          localStorage.removeItem("gq_google_access_token");
          return { success: false, message: "Google session has expired. Please log in with Google to reconnect!" };
        }
        const errText = await searchRes.text();
        throw new Error(`Drive search failed: ${searchRes.statusText} - ${errText}`);
      }
      
      const searchData = await searchRes.json();
      let spreadsheetId = "";
      
      if (searchData.files && searchData.files.length > 0) {
        spreadsheetId = searchData.files[0].id;
      } else {
        // 2. Create a new Spreadsheet titled "German Quest Vocabulary" with a tab sheet named "Vocabulary"
        const createUrl = "https://sheets.googleapis.com/v4/spreadsheets";
        const createRes = await fetch(createUrl, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            properties: {
              title: "German Quest Vocabulary"
            },
            sheets: [
              {
                properties: {
                  title: "Vocabulary"
                }
              }
            ]
          })
        });
        
        if (!createRes.ok) {
          const errText = await createRes.text();
          throw new Error(`Spreadsheet creation failed: ${createRes.statusText} - ${errText}`);
        }
        
        const createData = await createRes.json();
        spreadsheetId = createData.spreadsheetId;
      }
      
      // 3. Retrieve values from "Vocabulary" sheet inside that spreadsheet
      const readUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Vocabulary!A2:G1000`;
      const readRes = await fetch(readUrl, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      
      let remoteWords: Word[] = [];
      if (readRes.ok) {
        const readData = await readRes.json();
        if (readData.values && Array.isArray(readData.values)) {
          remoteWords = readData.values.map((r: any) => ({
            german: r[0] || "",
            english: r[1] || "",
            category: r[2] || "Basics",
            difficulty: (r[3] === "Easy" || r[3] === "Medium" || r[3] === "Hard") ? r[3] : "Medium",
            isFavorite: r[4] === "TRUE" || r[4] === true,
            accuracyCount: parseInt(r[5]) || 0,
            errorCount: parseInt(r[6]) || 0
          })).filter((w: Word) => w.german.trim() !== "");
        }
      }
      
      // 4. Merge remote words and local words
      const localWords = [...this.words];
      const mergedWordsMap = new Map<string, Word>();
      
      for (const w of localWords) {
        mergedWordsMap.set(w.german.toLowerCase().trim(), w);
      }
      
      for (const rw of remoteWords) {
        const key = rw.german.toLowerCase().trim();
        if (mergedWordsMap.has(key)) {
          const existing = mergedWordsMap.get(key)!;
          mergedWordsMap.set(key, {
            ...existing,
            ...rw,
            accuracyCount: Math.max(existing.accuracyCount, rw.accuracyCount),
            errorCount: Math.max(existing.errorCount, rw.errorCount),
            isFavorite: existing.isFavorite || rw.isFavorite
          });
        } else {
          mergedWordsMap.set(key, rw);
        }
      }
      
      const finalizedWords = Array.from(mergedWordsMap.values());
      this.setWords(finalizedWords);
      
      // 5. Upload finalized words list back to spreadsheet
      const writeUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Vocabulary!A1:G1500?valueInputOption=RAW`;
      const writeRes = await fetch(writeUrl, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          range: "Vocabulary!A1:G1500",
          majorDimension: "ROWS",
          values: [
            ["German", "English", "Category", "Difficulty", "Favorite", "Accuracy Count", "Error Count"],
            ...finalizedWords.map(w => [
              w.german,
              w.english,
              w.category,
              w.difficulty,
              w.isFavorite ? "TRUE" : "FALSE",
              w.accuracyCount.toString(),
              w.errorCount.toString()
            ])
          ]
        })
      });
      
      if (!writeRes.ok) {
        const errText = await writeRes.text();
        throw new Error(`Failed writing database data to Sheet: ${writeRes.statusText} - ${errText}`);
      }
      
      return { 
        success: true, 
        count: finalizedWords.length, 
        message: `Successfully synchronized ${finalizedWords.length} words inside your own Gmail Google Sheet "German Quest Vocabulary"!` 
      };
      
    } catch (error: any) {
      console.error("Direct Google API sync failed:", error);
      return { success: false, message: error.message || "OAuth sheet sync failed." };
    }
  }
}
