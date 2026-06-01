/* Phase 1: core game logic only (no name system, no Supabase, no leaderboard) */

(() => {
  const $ = (id) => document.getElementById(id);

  const screenStart = $("screenStart");
  const screenGame = $("screenGame");
  const screenGameOver = $("screenGameOver");
  const screenWin = $("screenWin");

  const btnStart = $("btnStart");
  const btnPlayAgain = $("btnPlayAgain");
  const btnBackToMenu = $("btnBackToMenu");
  const btnWinPlayAgain = $("btnWinPlayAgain");
  const btnWinBackToMenu = $("btnWinBackToMenu");
  const navLogoHome = $("navLogoHome");

  const cardLeft = $("cardLeft");
  const cardRight = $("cardRight");
  const imgLeft = $("imgLeft");
  const imgRight = $("imgRight");
  const hint = $("hint");

  const finalStreakText = $("finalStreakText");
  const winText = $("winText");
  const streakValue = $("streakValue");

  const POSTS = Array.isArray(window.POSTS) ? window.POSTS : [];
  const BEST_STREAK_KEY = "likeoff.bestStreak";

  /** Plain JS variable per spec */
  let streak = 0;
  let bestStreak = 0;

  function loadBestStreak() {
    try {
      const raw = window.localStorage.getItem(BEST_STREAK_KEY);
      const value = Number(raw);
      if (Number.isFinite(value) && value >= 0) return Math.floor(value);
    } catch {
      // localStorage may be unavailable in some contexts; keep best streak in-memory.
    }
    return 0;
  }

  function saveBestStreak(nextBest) {
    try {
      window.localStorage.setItem(BEST_STREAK_KEY, String(nextBest));
    } catch {
      // Best effort only.
    }
  }

  function updateBestStreak() {
    if (streak <= bestStreak) return;
    bestStreak = streak;
    saveBestStreak(bestStreak);
  }

  let remainingIndices = [];
  let currentPair = null; // { leftIdx, rightIdx }
  let acceptingInput = false;
  let revealTimer = null;

  function setActiveScreen(active) {
    const screens = [screenStart, screenGame, screenGameOver, screenWin];
    for (const s of screens) s.classList.remove("screen--active");
    active.classList.add("screen--active");
  }

  function goHome() {
    if (revealTimer) {
      clearTimeout(revealTimer);
      revealTimer = null;
    }
    acceptingInput = false;
    setActiveScreen(screenStart);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function setStreakDisplay() {
    if (streakValue) streakValue.textContent = String(streak);
  }

  function resetRoundUI() {
    hint.textContent = "Which post went more viral?";
    setStreakDisplay();
    clearBadges(cardLeft);
    clearBadges(cardRight);
    cardLeft.classList.remove("card--good", "card--bad");
    cardRight.classList.remove("card--good", "card--bad");
    cardLeft.disabled = false;
    cardRight.disabled = false;
  }

  function clearBadges(cardEl) {
    const badge = cardEl.querySelector(".resultBadge");
    if (badge) badge.remove();
  }

  /** Resolves image paths against the page URL so ./posts/… works from file:// and any server root. */
  function postImageUrl(image) {
    const path = image.includes("/") ? image : `./images/${image}`;
    try {
      return new URL(path, document.baseURI).href;
    } catch {
      return path;
    }
  }

  const maxScreenshotHeightPx = () => Math.min(Math.round(window.innerHeight * 0.85), 1024);

  /** Scale image down so the whole bitmap fits inside its wrapper (same math as object-fit: contain). */
  function fitPostScreenshot(img) {
    const wrap = img && img.parentElement;
    if (!wrap || !img.naturalWidth || !img.naturalHeight) return;
    const maxW = wrap.getBoundingClientRect().width;
    const maxH = maxScreenshotHeightPx();
    if (maxW < 4) {
      requestAnimationFrame(() => fitPostScreenshot(img));
      return;
    }
    const nw = img.naturalWidth;
    const nh = img.naturalHeight;
    const scale = Math.min(1, maxW / nw, maxH / nh);
    const w = Math.max(1, Math.round(nw * scale));
    const h = Math.max(1, Math.round(nh * scale));
    img.style.width = `${w}px`;
    img.style.height = `${h}px`;
  }

  function clearScreenshotLayout(img) {
    if (!img) return;
    img.style.width = "";
    img.style.height = "";
  }

  function setScreenshotSrc(img, url) {
    if (!img) return;
    clearScreenshotLayout(img);
    const onDone = () => requestAnimationFrame(() => fitPostScreenshot(img));
    img.addEventListener("load", onDone, { once: true });
    img.src = url;
    if (img.complete && img.naturalWidth) onDone();
  }

  function setupScreenshotFitObservers() {
    const wraps = [];
    if (imgLeft && imgLeft.parentElement) wraps.push(imgLeft.parentElement);
    if (imgRight && imgRight.parentElement) wraps.push(imgRight.parentElement);
    for (const wrap of wraps) {
      if (!wrap || wrap.dataset.fitObserved) continue;
      wrap.dataset.fitObserved = "1";
      const ro = new ResizeObserver(() => {
        const im = wrap.querySelector("img");
        if (im && im.naturalWidth) fitPostScreenshot(im);
      });
      ro.observe(wrap);
    }
  }

  let resizeFitTimer = 0;
  window.addEventListener("resize", () => {
    clearTimeout(resizeFitTimer);
    resizeFitTimer = setTimeout(() => {
      [imgLeft, imgRight].forEach((im) => {
        if (im && im.naturalWidth) fitPostScreenshot(im);
      });
    }, 80);
  });

  function shuffleInPlace(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  /** One entry per image path so the same file never appears twice in a run. */
  function buildShuffledSessionDeck() {
    const seen = new Set();
    const indices = [];
    for (let i = 0; i < POSTS.length; i++) {
      const path = POSTS[i].image;
      if (seen.has(path)) continue;
      seen.add(path);
      indices.push(i);
    }
    return shuffleInPlace(indices);
  }

  /** Next matchup: two posts never seen this session; order (left/right) is random too. */
  function drawTwoDistinct() {
    if (remainingIndices.length < 2) return null;
    let a = remainingIndices.pop();
    let b = remainingIndices.pop();
    if (Math.random() < 0.5) {
      const t = a;
      a = b;
      b = t;
    }
    return { leftIdx: a, rightIdx: b };
  }

  function showPair(pair) {
    const left = POSTS[pair.leftIdx];
    const right = POSTS[pair.rightIdx];

    setScreenshotSrc(imgLeft, postImageUrl(left.image));
    setScreenshotSrc(imgRight, postImageUrl(right.image));
    imgLeft.alt = left.caption ? left.caption : "LinkedIn post screenshot";
    imgRight.alt = right.caption ? right.caption : "LinkedIn post screenshot";
  }

  function startNewGame() {
    if (revealTimer) {
      clearTimeout(revealTimer);
      revealTimer = null;
    }

    streak = 0;
    setStreakDisplay();
    remainingIndices = buildShuffledSessionDeck();
    currentPair = null;
    acceptingInput = false;

    if (POSTS.length < 2) {
      winText.textContent = "Add at least 2 posts to play.";
      setActiveScreen(screenWin);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    setActiveScreen(screenGame);
    window.scrollTo({ top: 0, behavior: "smooth" });
    nextRound();
  }

  function nextRound() {
    resetRoundUI();
    const pair = drawTwoDistinct();
    if (!pair) {
      // No more posts to show: win
      winText.textContent = "You exhausted all posts.";
      setActiveScreen(screenWin);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    currentPair = pair;
    showPair(pair);
    acceptingInput = true;
  }

  function revealOutcome({ chosenSide }) {
    acceptingInput = false;
    cardLeft.disabled = true;
    cardRight.disabled = true;

    const left = POSTS[currentPair.leftIdx];
    const right = POSTS[currentPair.rightIdx];
    const leftLikes = Number(left.likes) || 0;
    const rightLikes = Number(right.likes) || 0;

    const leftWins = leftLikes >= rightLikes;
    const correctSide = leftWins ? "left" : "right";
    const chosenCorrect = chosenSide === correctSide;

    // Visual reveal
    if (leftWins) {
      cardLeft.classList.add("card--good");
      cardRight.classList.add("card--bad");
    } else {
      cardRight.classList.add("card--good");
      cardLeft.classList.add("card--bad");
    }

    if (chosenCorrect) {
      hint.textContent = "Correct. Next round…";
      streak += 1;
      updateBestStreak();
      setStreakDisplay();
      revealTimer = setTimeout(() => {
        revealTimer = null;
        nextRound();
      }, 950);
    } else {
      hint.textContent = "Wrong. Game over…";
      revealTimer = setTimeout(() => {
        revealTimer = null;
        finalStreakText.textContent = `Your longest streak: ${bestStreak}`;
        setActiveScreen(screenGameOver);
        window.scrollTo({ top: 0, behavior: "smooth" });
      }, 1100);
    }
  }

  // Events
  btnStart.addEventListener("click", startNewGame);
  btnPlayAgain.addEventListener("click", startNewGame);
  btnBackToMenu.addEventListener("click", goHome);
  btnWinPlayAgain.addEventListener("click", startNewGame);
  btnWinBackToMenu.addEventListener("click", goHome);

  if (navLogoHome) navLogoHome.addEventListener("click", goHome);

  cardLeft.addEventListener("click", () => {
    if (!acceptingInput) return;
    revealOutcome({ chosenSide: "left" });
  });
  cardRight.addEventListener("click", () => {
    if (!acceptingInput) return;
    revealOutcome({ chosenSide: "right" });
  });

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function applyRoundedFavicon() {
    const link = document.querySelector('link[rel="icon"]');
    if (!link) return;

    const size = 64;
    const radius = 12;
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      roundRect(ctx, 0, 0, size, size, radius);
      ctx.clip();
      ctx.drawImage(img, 0, 0, size, size);

      link.type = "image/png";
      link.href = canvas.toDataURL("image/png");
    };
    img.src = "./LO.png";
  }

  // Initial screen
  bestStreak = loadBestStreak();
  if (finalStreakText) {
    finalStreakText.textContent = `Your longest streak: ${bestStreak}`;
  }
  setActiveScreen(screenStart);
  setupScreenshotFitObservers();
  applyRoundedFavicon();
})();

