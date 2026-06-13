export interface QuizSession {
  date: string; // YYYY-MM-DD
  score: number; // e.g., 80 for 80%
  totalQuestions: number;
  gameMode: string;
}

export class Analytics {
  private history: QuizSession[] = [];

  constructor() {
    this.loadHistory();
  }

  private formatDateLocal(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  public loadHistory() {
    const cached = localStorage.getItem("gq_quiz_history");
    if (cached) {
      try {
        this.history = JSON.parse(cached);
      } catch (e) {
        this.history = [];
      }
    } else {
      // Check if logged in first
      let isRealUser = false;
      const cachedProfile = localStorage.getItem("gq_user_profile");
      if (cachedProfile) {
        try {
          const profile = JSON.parse(cachedProfile);
          isRealUser = profile.email && profile.email !== "notconnect@domain.com" && profile.email !== "guest@domain.com";
        } catch (e) {}
      }

      if (isRealUser) {
        this.history = [];
      } else {
        // Seed some starting historical points to make dashboard charts look incredible from the start!
        const today = new Date();
        const formatOffset = (days: number) => {
          const d = new Date();
          d.setDate(today.getDate() - days);
          return this.formatDateLocal(d);
        };
        
        this.history = [
          { date: formatOffset(5), score: 60, totalQuestions: 10, gameMode: "quiz" },
          { date: formatOffset(4), score: 80, totalQuestions: 10, gameMode: "typing" },
          { date: formatOffset(3), score: 70, totalQuestions: 10, gameMode: "matching" },
          { date: formatOffset(2), score: 90, totalQuestions: 10, gameMode: "quiz" },
          { date: formatOffset(1), score: 100, totalQuestions: 10, gameMode: "boss" }
        ];
        this.saveHistory();
      }
    }
  }

  public getHistory(): QuizSession[] {
    return this.history;
  }

  public saveHistory() {
    localStorage.setItem("gq_quiz_history", JSON.stringify(this.history));
  }

  public recordSession(score: number, totalQuestions: number, gameMode: string) {
    const todayStr = this.formatDateLocal(new Date());
    this.history.push({
      date: todayStr,
      score: score,
      totalQuestions: totalQuestions,
      gameMode: gameMode
    });
    this.saveHistory();
  }

  public getAverageAccuracy(): number {
    if (this.history.length === 0) return 0;
    const sum = this.history.reduce((acc, sess) => acc + sess.score, 0);
    return Math.round(sum / this.history.length);
  }

  // Generates complete animated SVG chart HTML
  public renderSVGChart(targetId: string) {
    const container = document.getElementById(targetId);
    if (!container) return;

    // Get statistics for the last 7 days
    const last7Days: { label: string; count: number; score: number }[] = [];
    const today = new Date();
    
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(today.getDate() - i);
      const dayStr = this.formatDateLocal(d);
      const items = this.history.filter(h => h.date === dayStr);
      
      // Calculate average score for the day or 0
      const avgScore = items.length > 0 
        ? Math.round(items.reduce((sum, it) => sum + it.score, 0) / items.length) 
        : 0;

      // Day initials (e.g. "Mon")
      const dayName = d.toLocaleDateString("en-US", { weekday: "short" });
      
      last7Days.push({
        label: dayName,
        count: items.length,
        score: avgScore
      });
    }

    const width = 280;
    const height = 110;
    const paddingLeft = 20;
    const paddingRight = 10;
    const paddingTop = 15;
    const paddingBottom = 20;

    const chartW = width - paddingLeft - paddingRight;
    const chartH = height - paddingTop - paddingBottom;
    const colCount = last7Days.length;
    const colWidth = chartW / colCount;

    // Find max score or frequency count (use score 0-100 normalization)
    let svgContent = `<svg width="100%" height="100%" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" class="font-mono text-[9px] overflow-visible">`;
    
    // Gradients definitions
    svgContent += `
      <defs>
        <linearGradient id="chartGrad" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color="#8b5cf6" stop-opacity="0.8"/>
          <stop offset="100%" stop-color="#3b82f6" stop-opacity="0.1"/>
        </linearGradient>
        <linearGradient id="glowGrad" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color="#ec4899" stop-opacity="1"/>
          <stop offset="100%" stop-color="#8b5cf6" stop-opacity="0"/>
        </linearGradient>
      </defs>
    `;

    // Horizontal guideline ticks
    for (let i = 0; i <= 2; i++) {
      const y = paddingTop + (chartH / 2) * i;
      const pct = 100 - i * 50;
      svgContent += `
        <line x1="${paddingLeft}" y1="${y}" x2="${width - paddingRight}" y2="${y}" stroke="rgba(255, 255, 255, 0.05)" stroke-width="1" />
        <text x="${paddingLeft - 4}" y="${y + 3}" fill="#64748b" text-anchor="end">${pct}%</text>
      `;
    }

    // Build the SVG path points for spline progress lines
    let points: string[] = [];
    last7Days.forEach((day, index) => {
      const x = paddingLeft + (index * colWidth) + colWidth / 2;
      // Map score 0-100 to chart bottom scale
      const yStr = paddingTop + chartH - (day.score / 100) * chartH;
      points.push(`${x},${yStr}`);
    });

    const dPath = points.length > 0 ? `M ${points.join(" L ")}` : "";
    const fillPath = points.length > 0 ? `${dPath} L ${paddingLeft + (colCount - 1) * colWidth + colWidth/2},${paddingTop + chartH} L ${paddingLeft + colWidth/2},${paddingTop + chartH} Z` : "";

    // Fill area below spline
    if (fillPath) {
      svgContent += `<path d="${fillPath}" fill="url(#chartGrad)" />`;
    }

    // Line Path spline
    if (dPath) {
      svgContent += `<path d="${dPath}" fill="none" stroke="#a78bfa" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />`;
    }

    // Render interactive node dots and labels
    last7Days.forEach((day, index) => {
      const x = paddingLeft + (index * colWidth) + colWidth / 2;
      const y = paddingTop + chartH - (day.score / 100) * chartH;
      
      // Node Dot
      svgContent += `
        <circle cx="${x}" cy="${y}" r="3" fill="#ffffff" stroke="#8b5cf6" stroke-width="1.5" cursor="help">
          <title>${day.label}: Accuracy ${day.score}% (${day.count} practices)</title>
        </circle>
      `;

      // Floating score badge if count > 0
      if (day.score > 0) {
        svgContent += `
          <text x="${x}" y="${y - 6}" fill="#ec4899" text-anchor="middle" font-weight="bold">${day.score}%</text>
        `;
      }

      // X-Axis Day labels
      svgContent += `
        <text x="${x}" y="${paddingTop + chartH + 12}" fill="#94a3b8" text-anchor="middle">${day.label}</text>
      `;
    });

    svgContent += `</svg>`;
    container.innerHTML = svgContent;
  }
}
