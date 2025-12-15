// =========================================================
// MATCH SETUP — UPDATED WITH LOSS PENALTY WARNINGS
// =========================================================

document.addEventListener("DOMContentLoaded", async () => {
  if (!window.supabase) {
    console.error("❌ Supabase not loaded");
    return;
  }
  if (!window.CURRENT_USER_ID) {
    console.error("❌ CURRENT_USER_ID missing");
    return;
  }

  // ======================================================
  // DOM ELEMENTS
  // ======================================================
  const modeBtns = document.querySelectorAll("[data-battle-mode]");
  const tierBtns = document.querySelectorAll("[data-battle-tier]");

  const tierSection = document.getElementById("tierSection");
  const pokemonSection = document.getElementById("pokemonSelectSection");

  const grid = document.getElementById("pokemonGrid");
  const emptyState = document.getElementById("matchEmptyState");

  const countEl = document.getElementById("selectedCountValue");
  const entryFeeEl = document.getElementById("entryFeeValue");
  const chipRewardEl = document.getElementById("chipRewardValue");
  const expRewardEl = document.getElementById("expRewardValue");

  const startBtn = document.getElementById("startMatchBtn");

  // ======================================================
  // STATE
  // ======================================================
  let mode = null;
  let tier = null;
  let balance = 0;
  let collection = [];
  let selectable = [];
  let selected = new Set();

  // ======================================================
  // CONFIG
  // ======================================================
  const ENTRY_FEES = {
    single: { low: 10, mid: 25, high: 50 },
    team: { low: 25, mid: 60, high: 120 },
  };

  const CHIP_REWARDS = {
    single: { low: 15, mid: 40, high: 80 },
    team: { low: 40, mid: 100, high: 200 },
  };

  const EXP_REWARDS = {
    single: { low: 80, mid: 140, high: 220 },
    team: { low: 140, mid: 240, high: 360 },
  };

  // ======================================================
  // UTILITY HELPERS
  // ======================================================

  function maxTeam() {
    return mode === "team" ? 3 : 1;
  }

  function allowedTiers(p) {
    const r = (p.rarity || "").toLowerCase();
    const lvl = p.level ?? 1;
    const arr = [];

    // Base rarity tiers
    if (r === "common" || r === "rare") arr.push("low");
    if (r === "epic" || r === "legendary") arr.push("mid");
    if (r === "mythical" || r === "divine") arr.push("high");

    // Level unlocks
    if (r === "common") {
      if (lvl >= 10) arr.push("mid");
      if (lvl >= 20) arr.push("high");
    }
    if (r === "rare") {
      if (lvl >= 7) arr.push("mid");
      if (lvl >= 15) arr.push("high");
    }
    if (r === "epic" && lvl >= 12) arr.push("high");
    if (r === "legendary" && lvl >= 10) arr.push("high");

    return [...new Set(arr)];
  }

  function canJoinTier(p) {
    return allowedTiers(p).includes(tier);
  }

  function getLossPenaltyText(level) {
    if (level <= 5) {
      return "⚠️ RISK: Level 5 or below - Pokemon will be LOST if defeated!";
    }
    return "⚠️ RISK: Will lose 3 levels if defeated";
  }

  // EXP progress calculation
  function getExpForLevel(level) {
    return level * 100;
  }

  function getExpProgress(currentExp, level) {
    const expNeeded = getExpForLevel(level);
    const expInLevel = currentExp % expNeeded;
    const percentage = (expInLevel / expNeeded) * 100;
    return {
      current: expInLevel,
      needed: expNeeded,
      percentage: Math.min(100, percentage),
    };
  }

  function updateSummaryUI() {
    if (!mode || !tier) return;

    const needed = maxTeam();
    const fee = ENTRY_FEES[mode][tier];

    entryFeeEl.textContent = fee;
    chipRewardEl.textContent = CHIP_REWARDS[mode][tier];
    expRewardEl.textContent = EXP_REWARDS[mode][tier];

    countEl.textContent = `${selected.size}/${needed}`;

    const ready = selected.size === needed && balance >= fee;
    startBtn.disabled = !ready;

    startBtn.textContent = ready
      ? `Start Battle (Cost: ${fee} PKCHP)`
      : `Select ${needed} Pokemon`;
  }

  // ======================================================
  // LOAD BALANCE
  // ======================================================
  async function loadBalance() {
    try {
      const wallet = window.CURRENT_WALLET_ADDRESS;
      if (!wallet) throw new Error();

      const provider = new ethers.BrowserProvider(window.ethereum);
      const contract = new ethers.Contract(
        window.PKCHP_ADDRESS,
        window.PKCHP_ABI,
        provider
      );

      const raw = await contract.balanceOf(wallet);
      const dec = await contract.decimals();
      balance = Math.floor(Number(ethers.formatUnits(raw, dec)));
    } catch {
      balance = 1000;
    }

    document
      .querySelectorAll(".pc-pokechip-amount")
      .forEach((el) => (el.textContent = balance));
  }

  // ======================================================
  // LOAD COLLECTION FROM DB
  // ======================================================
  async function loadCollection() {
    const { data, error } = await supabase
      .from("user_pokemon")
      .select("*")
      .eq("user_id", window.CURRENT_USER_ID);

    if (error) {
      console.error("Collection load error:", error);
      return;
    }

    // IMPORTANT: Keep id as original UUID, don't convert to string!
    collection = data.map((p) => ({
      id: p.id, // Keep as UUID - DO NOT use .toString()
      pokemon_id: p.pokemon_id,
      name: p.pokemon_name,
      rarity: p.rarity,
      sprite: p.sprite_url,
      hp: p.hp,
      attack: p.attack,
      defense: p.defense,
      speed: p.speed,
      level: p.level ?? 1,
      exp: p.exp ?? 0,
    }));

    console.log("Loaded collection:", collection);
  }

  // ======================================================
  // RENDER POKÉMON CARDS
  // ======================================================
  async function renderCards() {
    grid.innerHTML = "";

    if (!mode || !tier) {
      emptyState.classList.remove("d-none");
      return;
    }

    selectable = collection.filter(canJoinTier);

    if (!selectable.length) {
      emptyState.classList.remove("d-none");
      return;
    }

    emptyState.classList.add("d-none");

    for (const mon of selectable) {
      const api = await fetchPokemon(mon.name);

      const picked = selected.has(mon.id);
      const slotIndex = [...selected].indexOf(mon.id) + 1;
      const riskWarning = getLossPenaltyText(mon.level);
      const expData = getExpProgress(mon.exp, mon.level);

      const col = document.createElement("div");
      col.className = "col-12 col-sm-6 col-md-4 col-lg-3";

      col.innerHTML = `
        <div class="select-card ${picked ? "selected-card" : ""}" data-id="${
        mon.id
      }">
          ${picked ? `<div class="slot-label">Slot ${slotIndex}</div>` : ""}
          ${picked ? `<div class="checkmark-overlay">✓</div>` : ""}

          <div class="select-inner type-${api.types[0].toLowerCase()}">
            <div class="rarity-badge rarity-${mon.rarity.toLowerCase()}">${
        mon.rarity
      }</div>
            <div class="level-badge">Lv. ${mon.level}</div>

            <img src="${mon.sprite}" class="pokemon-img">

            <h3 class="pokemon-name">#${api.id} ${mon.name.toUpperCase()}</h3>
            <p class="pokemon-types">${api.types.join(", ")}</p>

            <div class="stats-box">
              <div class="stat"><span>HP</span> ${mon.hp}</div>
              <div class="stat"><span>ATK</span> ${mon.attack}</div>
              <div class="stat"><span>DEF</span> ${mon.defense}</div>
              <div class="stat"><span>SPD</span> ${mon.speed}</div>
            </div>

            <!-- EXP BAR -->
            <div class="exp-container" style="margin-top: 8px;">
              <div class="exp-label" style="font-size: 0.7rem; color: #aaa;">
                EXP: ${expData.current} / ${expData.needed}
              </div>
              <div style="height: 6px; background: #333; border-radius: 3px; overflow: hidden;">
                <div style="height: 100%; width: ${
                  expData.percentage
                }%; background: linear-gradient(90deg, #3b82f6, #60a5fa);"></div>
              </div>
            </div>

            ${
              mon.level <= 5
                ? `<div class="alert alert-danger p-2 mt-2" style="font-size:0.7rem;">
                ${riskWarning}
              </div>`
                : `<div class="alert alert-warning p-2 mt-2" style="font-size:0.7rem;">
                ${riskWarning}
              </div>`
            }

            <button class="select-btn" data-id="${mon.id}">
              ${picked ? "SELECTED" : "SELECT POKEMON"}
            </button>
          </div>
        </div>
      `;

      grid.appendChild(col);
    }

    updateSummaryUI();
  }

  // ======================================================
  // EVENT: SELECTING POKÉMON
  // ======================================================
  grid.addEventListener("click", (e) => {
    const btn = e.target.closest(".select-btn");
    if (!btn) return;

    const id = btn.dataset.id;

    if (selected.has(id)) {
      selected.delete(id);
    } else {
      if (mode === "single") {
        selected.clear();
        selected.add(id);
      } else {
        if (selected.size >= 3) return alert("Max 3 Pokemon for team match.");
        selected.add(id);
      }
    }

    renderCards();
  });

  // ======================================================
  // EVENT: SELECT MODE
  // ======================================================
  modeBtns.forEach((btn) =>
    btn.addEventListener("click", () => {
      modeBtns.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");

      mode = btn.dataset.battleMode;
      selected.clear();

      tierSection.classList.remove("d-none");
      pokemonSection.classList.add("d-none");

      updateSummaryUI();
    })
  );

  // ======================================================
  // EVENT: SELECT TIER
  // ======================================================
  tierBtns.forEach((btn) =>
    btn.addEventListener("click", () => {
      tierBtns.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");

      tier = btn.dataset.battleTier;
      selected.clear();

      pokemonSection.classList.remove("d-none");

      renderCards();
    })
  );

  // ======================================================
  // EVENT: START MATCH
  // ======================================================
  startBtn.addEventListener("click", () => {
    if (selected.size !== maxTeam())
      return alert(`Select ${maxTeam()} Pokemon.`);

    const fee = ENTRY_FEES[mode][tier];
    if (balance < fee) return alert("Not enough PKCHP.");

    const selectedTeam = collection.filter((p) => selected.has(p.id));

    console.log("Selected team for battle:", selectedTeam);

    // Check if any selected Pokémon are at risk
    const lowLevelMons = selectedTeam.filter((p) => p.level <= 5);
    if (lowLevelMons.length > 0) {
      const names = lowLevelMons.map((p) => p.name).join(", ");
      const confirm = window.confirm(
        `WARNING: ${names} ${
          lowLevelMons.length === 1 ? "is" : "are"
        } Level 5 or below and will be PERMANENTLY LOST if defeated!\n\nAre you sure you want to continue?`
      );
      if (!confirm) return;
    }

    const matchData = {
      mode,
      tier,
      entryFee: fee,
      chipReward: CHIP_REWARDS[mode][tier],
      expReward: EXP_REWARDS[mode][tier],
      pokemons: selectedTeam,
      createdAt: new Date().toISOString(),
    };

    localStorage.setItem("PCA_PENDING_MATCH", JSON.stringify(matchData));
    window.location.href = "battle.html";
  });

  // ======================================================
  // INITIAL LOAD
  // ======================================================
  await loadBalance();
  await loadCollection();
  updateSummaryUI();
});
