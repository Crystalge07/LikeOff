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
  const capLeft = $("capLeft");
  const capRight = $("capRight");
  const hint = $("hint");

  const finalStreakText = $("finalStreakText");
  const winText = $("winText");
  const streakValue = $("streakValue");

  const POSTS = Array.isArray(window.POSTS) ? window.POSTS : [];

  /** Plain JS variable per spec */
  let streak = 0;

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
    hint.textContent = "Which post got more likes?";
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

  function addBadge(cardEl, text) {
    clearBadges(cardEl);
    const badge = document.createElement("div");
    badge.className = "resultBadge";
    badge.textContent = text;
    cardEl.style.position = "relative";
    cardEl.appendChild(badge);
  }

  function randInt(maxExclusive) {
    return Math.floor(Math.random() * maxExclusive);
  }

  function drawTwoDistinct() {
    if (remainingIndices.length < 2) return null;
    const aPos = randInt(remainingIndices.length);
    const a = remainingIndices[aPos];
    remainingIndices.splice(aPos, 1);
    const bPos = randInt(remainingIndices.length);
    const b = remainingIndices[bPos];
    remainingIndices.splice(bPos, 1);
    return { leftIdx: a, rightIdx: b };
  }

  function showPair(pair) {
    const left = POSTS[pair.leftIdx];
    const right = POSTS[pair.rightIdx];

    imgLeft.src = `./images/${left.image}`;
    imgRight.src = `./images/${right.image}`;
    imgLeft.alt = left.caption ? left.caption : "LinkedIn post screenshot";
    imgRight.alt = right.caption ? right.caption : "LinkedIn post screenshot";
    capLeft.textContent = left.caption || "";
    capRight.textContent = right.caption || "";
  }

  function startNewGame() {
    if (revealTimer) {
      clearTimeout(revealTimer);
      revealTimer = null;
    }

    streak = 0;
    setStreakDisplay();
    remainingIndices = POSTS.map((_, i) => i);
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
      winText.textContent = `You exhausted all posts with a streak of ${streak}.`;
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

    addBadge(cardLeft, `${leftLikes.toLocaleString()} likes`);
    addBadge(cardRight, `${rightLikes.toLocaleString()} likes`);

    if (chosenCorrect) {
      hint.textContent = "Correct. Next round…";
      streak += 1;
      setStreakDisplay();
      revealTimer = setTimeout(() => {
        revealTimer = null;
        nextRound();
      }, 950);
    } else {
      hint.textContent = "Wrong. Game over…";
      revealTimer = setTimeout(() => {
        revealTimer = null;
        finalStreakText.textContent = `Your streak: ${streak}`;
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

  // Initial screen
  setActiveScreen(screenStart);
})();

