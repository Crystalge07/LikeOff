/**
 * Supabase leaderboards, global stats, and one-time display name prompt.
 * See LEADERBOARD_SPEC.md and supabase/schema.sql.
 */
(() => {
  const PLAYER_ID_KEY = "likeoff.playerId";
  const DISPLAY_NAME_KEY = "likeoff.displayName";

  const tabAllTime = document.getElementById("tabAllTime");
  const tabToday = document.getElementById("tabToday");
  const leaderboardList = document.getElementById("leaderboardList");
  const statPostCount = document.getElementById("statPostCount");
  const statPostsJudged = document.getElementById("statPostsJudged");
  const statUniquePlayers = document.getElementById("statUniquePlayers");

  const nameModal = document.getElementById("nameModal");
  const nameForm = document.getElementById("nameForm");
  const nameInput = document.getElementById("nameInput");
  const nameModalError = document.getElementById("nameModalError");

  let supabase = null;
  let activeTab = "all-time";
  let namePromptResolver = null;

  function escapeHtml(text) {
    return String(text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function formatCount(n) {
    const value = Number(n);
    if (!Number.isFinite(value)) return "0";
    return value.toLocaleString("en-US");
  }

  function countUniquePosts() {
    const posts = Array.isArray(window.POSTS) ? window.POSTS : [];
    const seen = new Set();
    for (const p of posts) {
      if (p && p.image) seen.add(p.image);
    }
    return seen.size;
  }

  /** Longest possible streak = unique posts ÷ 2 (one correct guess per pair shown). */
  function maxAchievableStreak() {
    const n = countUniquePosts();
    if (n < 2) return 0;
    return Math.floor(n / 2);
  }

  const PROFANITY_ERROR_SNIPPET = "inappropriate language";

  function clearDisplayName() {
    try {
      localStorage.removeItem(DISPLAY_NAME_KEY);
    } catch {
      // Best effort.
    }
  }

  function isProfanityInsertError(error) {
    return (
      error?.code === "P0001" &&
      String(error.message || "").includes(PROFANITY_ERROR_SNIPPET)
    );
  }

  function getOrCreatePlayerId() {
    try {
      let id = localStorage.getItem(PLAYER_ID_KEY);
      if (id && /^[0-9a-f-]{36}$/i.test(id)) return id;
      id = crypto.randomUUID();
      localStorage.setItem(PLAYER_ID_KEY, id);
      return id;
    } catch {
      return crypto.randomUUID();
    }
  }

  function getDisplayName() {
    try {
      const name = localStorage.getItem(DISPLAY_NAME_KEY);
      return name ? sanitizeDisplayName(name) : "";
    } catch {
      return "";
    }
  }

  function saveDisplayName(name) {
    try {
      localStorage.setItem(DISPLAY_NAME_KEY, name);
    } catch {
      // Best effort.
    }
  }

  function sanitizeDisplayName(raw) {
    const trimmed = String(raw || "")
      .trim()
      .replace(/\s+/g, " ")
      .slice(0, 24);
    return trimmed;
  }

  function getSupabaseKey() {
    return window.SUPABASE_PUBLISHABLE_KEY || "";
  }

  function isConfigured() {
    return Boolean(window.SUPABASE_URL && getSupabaseKey() && supabase);
  }

  function initClient() {
    const url = window.SUPABASE_URL;
    const key = getSupabaseKey();
    if (!url || !key || !window.supabase) return null;
    return window.supabase.createClient(url, key);
  }

  function renderLeaderboard(rows) {
    if (!leaderboardList) return;
    leaderboardList.classList.add("board--fading");

    if (!rows || rows.length === 0) {
      leaderboardList.innerHTML =
        '<li class="board__empty">No scores yet. Be the first to play!</li>';
    } else {
      leaderboardList.innerHTML = rows
        .map(
          (entry, idx) =>
            `<li><span>${idx + 1}</span><b>${escapeHtml(entry.name)}</b><em>${escapeHtml(entry.score)}</em></li>`
        )
        .join("");
    }

    requestAnimationFrame(() => leaderboardList.classList.remove("board--fading"));
  }

  function setActiveTab(which) {
    activeTab = which;
    const isAllTime = which === "all-time";
    if (tabAllTime) tabAllTime.classList.toggle("board__tab--active", isAllTime);
    if (tabToday) tabToday.classList.toggle("board__tab--active", !isAllTime);
    void refreshLeaderboard();
  }

  async function fetchLeaderboard(which) {
    if (!isConfigured()) return [];
    const fn = which === "today" ? "get_leaderboard_today" : "get_leaderboard_all_time";
    const { data, error } = await supabase.rpc(fn);
    if (error) {
      console.warn("Leaderboard fetch failed:", error.message);
      return [];
    }
    return (data || []).map((row) => ({
      name: row.name,
      score: row.score,
    }));
  }

  async function refreshLeaderboard() {
    const rows = await fetchLeaderboard(activeTab);
    renderLeaderboard(rows);
  }

  async function refreshStats() {
    if (statPostCount) statPostCount.textContent = formatCount(countUniquePosts());

    if (!isConfigured()) {
      if (statPostsJudged) statPostsJudged.textContent = "0";
      if (statUniquePlayers) statUniquePlayers.textContent = "0";
      return;
    }

    const { data, error } = await supabase.rpc("get_global_stats");
    if (error) {
      console.warn("Stats fetch failed:", error.message);
      if (statPostsJudged) statPostsJudged.textContent = "0";
      if (statUniquePlayers) statUniquePlayers.textContent = "0";
      return;
    }

    const row = Array.isArray(data) ? data[0] : data;
    if (statPostsJudged) statPostsJudged.textContent = formatCount(row?.posts_judged ?? 0);
    if (statUniquePlayers) statUniquePlayers.textContent = formatCount(row?.unique_players ?? 0);
  }

  async function refreshAll() {
    await Promise.all([refreshLeaderboard(), refreshStats()]);
  }

  function showNameModal() {
    return new Promise((resolve) => {
      if (!nameModal || !nameInput) {
        resolve("");
        return;
      }
      namePromptResolver = resolve;
      nameModalError.textContent = "";
      nameInput.value = "";
      nameModal.hidden = false;
      nameInput.focus();
    });
  }

  function hideNameModal() {
    if (nameModal) nameModal.hidden = true;
  }

  function commitNameFromModal() {
    const name = sanitizeDisplayName(nameInput?.value);
    if (!name) {
      if (nameModalError) nameModalError.textContent = "Enter a name (1–24 characters).";
      return;
    }
    saveDisplayName(name);
    hideNameModal();
    if (namePromptResolver) {
      const resolve = namePromptResolver;
      namePromptResolver = null;
      resolve(name);
    }
  }

  async function ensureDisplayName() {
    const existing = getDisplayName();
    if (existing) return existing;
    return showNameModal();
  }

  async function submitRun({ playerId, displayName, streak }, allowProfanityRetry = true) {
    if (!isConfigured()) return;
    const cap = maxAchievableStreak();
    const safeStreak = Math.min(Math.max(0, Math.floor(streak)), cap);

    const { error } = await supabase.from("score_runs").insert({
      player_id: playerId,
      display_name: displayName,
      streak: safeStreak,
    });

    if (error) {
      if (isProfanityInsertError(error) && allowProfanityRetry) {
        console.warn("Score submit failed:", error.message);
        clearDisplayName();
        if (nameModalError) {
          nameModalError.textContent =
            "That name isn’t allowed on the leaderboard. Please choose another.";
        }
        const newName = await ensureDisplayName();
        if (!newName) return;
        return submitRun({ playerId, displayName: newName, streak }, false);
      }
      console.warn("Score submit failed:", error.message);
    }
  }

  async function onRunFinished(runStreak) {
    if (!isConfigured()) return;

    const playerId = getOrCreatePlayerId();
    const displayName = await ensureDisplayName();
    if (!displayName) return;

    await submitRun({ playerId, displayName, streak: runStreak });
    await refreshAll();
  }

  function wireUi() {
    if (tabAllTime) tabAllTime.addEventListener("click", () => setActiveTab("all-time"));
    if (tabToday) tabToday.addEventListener("click", () => setActiveTab("today"));

    if (nameForm) {
      nameForm.addEventListener("submit", (e) => {
        e.preventDefault();
        commitNameFromModal();
      });
    }

    const leaderboardLink = document.querySelector('a[href="#leaderboard"]');
    const leaderboardSection = document.getElementById("leaderboard");
    if (leaderboardLink && leaderboardSection) {
      leaderboardLink.addEventListener("click", (e) => {
        e.preventDefault();
        const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        leaderboardSection.scrollIntoView({
          behavior: reduce ? "auto" : "smooth",
          block: "start",
        });
      });
    }
  }

  function init() {
    getOrCreatePlayerId();
    supabase = initClient();
    wireUi();

    if (!isConfigured()) {
      console.warn(
        "LikeOff: Copy likeoff/supabase-config.example.js → supabase-config.js and add your Supabase URL + Publishable key."
      );
      renderLeaderboard([]);
      if (statPostCount) statPostCount.textContent = formatCount(countUniquePosts());
      if (statPostsJudged) statPostsJudged.textContent = "0";
      if (statUniquePlayers) statUniquePlayers.textContent = "0";
      return;
    }

    setActiveTab("all-time");
    void refreshAll();
  }

  window.LikeOffLeaderboard = {
    onRunFinished,
    refreshAll,
    isConfigured,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
