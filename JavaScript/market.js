// GLOBAL CONSTANTS (localStorage now only used for timers)
const MARKET_TIMER_KEY = "marketTimer";

const REFRESH_INTERVAL = 120; // 2 minutes
const FEATURED_INTERVAL = 300; // 5 minutes

const MARKET_LIMITS = {
  common: 8,
  rare: 4,
  epic: 4,
  legendary: 4,
};

// Supabase globals – must be set in HTML:
//   window.supabase
//   window.CURRENT_USER_ID
const CURRENT_USER_ID = window.CURRENT_USER_ID;

// Treasury wallet (PKCHP goes here when buying)
window.GAME_TREASURY_ADDRESS =
  window.GAME_TREASURY_ADDRESS || "0x9170c20f9C6C83BDE7c5D20C1CB202610c30d445";

// PKCHP CONTRACT CONFIG (SAFE, NON-BREAKING)

const PKCHP_CONFIG = {
  // ERC-20 token contract address (PKCHP)
  address: window.PKCHP_ADDRESS || "",

  // Your game treasury wallet (where PKCHP will go)
  treasury: window.GAME_TREASURY_ADDRESS || "",

  // Token decimals (18 for standard ERC-20)
  decimals: 18,
};

// Minimal ABI we will ALWAYS use for PKCHP
const BASE_PKCHP_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "function decimals() view returns (uint8)",
];

// REAL PKCHP BALANCE (MetaMask) READER
async function loadPkchpRealBalance() {
  try {
    if (!window.ethereum || !window.PKCHP_ADDRESS || !window.PKCHP_ABI) {
      return null;
    }

    // Get wallet from localStorage (set by home.js) or from MetaMask
    let wallet = localStorage.getItem("CURRENT_WALLET_ADDRESS") || null;

    if (!wallet) {
      const accounts = await window.ethereum.request({
        method: "eth_accounts",
      });
      wallet = accounts && accounts.length ? accounts[0] : null;
    }

    if (!wallet) return null;

    const provider = new ethers.BrowserProvider(window.ethereum);
    const contract = new ethers.Contract(
      window.PKCHP_ADDRESS,
      window.PKCHP_ABI,
      provider
    );

    const rawBal = await contract.balanceOf(wallet);
    const decimals = await contract.decimals();

    // Use ethers formatter; game uses WHOLE PokeChip units
    const floatBal = Number(ethers.formatUnits(rawBal, decimals));
    return Math.floor(floatBal); // whole-number PokeChip
  } catch (err) {
    console.warn("PKCHP on-chain load failed, fallback to Supabase:", err);
    return null;
  }
}

// Small helper to check if PKCHP on-chain payment is possible
function canUsePkchpOnChain() {
  return (
    typeof window !== "undefined" &&
    window.ethereum &&
    typeof window.ethers !== "undefined" &&
    PKCHP_CONFIG.address &&
    PKCHP_CONFIG.treasury
  );
}

// Try to pay with PKCHP on-chain (NON-BLOCKING)
// If anything fails, it will throw, but our caller handles it with try/catch
async function payWithPkchpOnChain(costInPokechip) {
  if (!canUsePkchpOnChain()) {
    console.warn("PKCHP on-chain payment not configured. Skipping.");
    return;
  }

  // Convert game "PokeChip" cost → PKCHP smallest unit (assuming 1:1 for now)
  const decimals = BigInt(PKCHP_CONFIG.decimals);
  const amount = BigInt(costInPokechip) * 10n ** decimals;

  // ethers v6 style
  const provider = new ethers.BrowserProvider(window.ethereum);
  const signer = await provider.getSigner();
  const userAddress = await signer.getAddress();

  const pkchpAbi = window.PKCHP_ABI || [
    // Minimal ERC-20 ABI: balanceOf + transfer
    "function balanceOf(address owner) view returns (uint256)",
    "function transfer(address to, uint256 amount) returns (bool)",
  ];

  const contract = new ethers.Contract(PKCHP_CONFIG.address, pkchpAbi, signer);

  // Optional: check balance first
  const balance = await contract.balanceOf(userAddress);
  if (balance < amount) {
    throw new Error("Not enough PKCHP on-chain.");
  }

  // Send PKCHP to treasury
  const tx = await contract.transfer(PKCHP_CONFIG.treasury, amount);
  console.log("PKCHP transfer tx sent:", tx.hash);
  await tx.wait();
  console.log("PKCHP transfer confirmed.");
}

// SUPABASE HELPERS

// WALLET
async function getWalletBalance(userId) {
  const { data, error } = await supabase
    .from("user_wallet")
    .select("pokechip_balance")
    .eq("user_id", userId)
    .single();

  if (error) {
    console.warn("No wallet yet, creating default 1000 PokeChip.", error);

    const { data: newRow, error: insertError } = await supabase
      .from("user_wallet")
      .insert([{ user_id: userId, pokechip_balance: 1000 }])
      .select("pokechip_balance")
      .single();

    if (insertError) {
      console.error("Failed to create wallet:", insertError);
      return 0;
    }
    return newRow.pokechip_balance;
  }

  return data.pokechip_balance;
}

async function updateWalletBalance(userId, newAmount) {
  const { error } = await supabase
    .from("user_wallet")
    .update({
      pokechip_balance: newAmount,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId);

  if (error) {
    console.error("Error updating wallet:", error);
    throw error;
  }
}

// COLLECTION 
async function addPokemonToCollectionDB(entry) {
  const { error } = await supabase.from("user_pokemon").insert([
    {
      user_id: CURRENT_USER_ID,
      pokemon_name: entry.name, 
      rarity: entry.rarity,
      sprite_url: entry.sprite,
      hp: entry.hp,
      attack: entry.attack,
      defense: entry.defense,
      speed: entry.speed,
      acquired_at: new Date().toISOString(),
    },
  ]);

  if (error) {
    console.error("Error adding Pokémon:", error);
    throw error;
  }
}

// MARKET POOL (per user) 
function getRandomSubset(arr, count) {
  const pool = [...arr];
  const out = [];
  while (out.length < count && pool.length > 0) {
    const idx = Math.floor(Math.random() * pool.length);
    out.push(pool.splice(idx, 1)[0]);
  }
  return out;
}

async function createNewMarketPool(userId) {
  const pool = [
    ...getRandomSubset(COMMON_POKEMON, MARKET_LIMITS.common).map((p) => ({
      pokemon_name: p.name,
      rarity: "Common",
    })),
    ...getRandomSubset(RARE_POKEMON, MARKET_LIMITS.rare).map((p) => ({
      pokemon_name: p.name,
      rarity: "Rare",
    })),
    ...getRandomSubset(EPIC_POKEMON, MARKET_LIMITS.epic).map((p) => ({
      pokemon_name: p.name,
      rarity: "Epic",
    })),
    ...getRandomSubset(
      legendaryList.map((name) => ({ name })),
      MARKET_LIMITS.legendary
    ).map((p) => ({
      pokemon_name: p.name,
      rarity: "Legendary",
    })),
  ];

  // Clear previous slots for this user
  const { error: deleteError } = await supabase
    .from("market_slots")
    .delete()
    .eq("user_id", userId);

  if (deleteError) {
    console.error("Error clearing old market slots:", deleteError);
    throw deleteError;
  }

  const rows = pool.map((p) => ({
    user_id: userId,
    pokemon_name: p.pokemon_name,
    rarity: p.rarity,
  }));

  const { error: insertError } = await supabase
    .from("market_slots")
    .insert(rows);

  if (insertError) {
    console.error("Error inserting market slots:", insertError);
    throw insertError;
  }

  return pool.map((p) => ({
    name: p.pokemon_name,
    rarity: p.rarity,
  }));
}

async function getMarketPool(userId) {
  const { data, error } = await supabase
    .from("market_slots")
    .select("*")
    .eq("user_id", userId);

  if (error) {
    console.error("Error loading market pool:", error);
    throw error;
  }

  if (!data || data.length === 0) return null;

  return data.map((row) => ({
    name: row.pokemon_name,
    rarity: row.rarity,
  }));
}

// ----- FEATURED Pricing -----
function pickRandomFeaturedFromClient() {
  const pool = [...MYTHICAL_POKEMON, ...DIVINE_POKEMON];
  const chosen = pool[Math.floor(Math.random() * pool.length)];

  let pokechipPrice = 0;

  if (chosen.rarity === "Mythical") {
    pkchpPrice = Math.floor(500 + Math.random() * 300); 
  } else {
    pkchpPrice = Math.floor(1200 + Math.random() * 500); 
  }

  return {
    name: chosen.name,
    rarity: chosen.rarity,
    price: pokechipPrice,     
  };
}


async function getFeaturedPokemonFromDB(userId) {
    const now = new Date();

    // Get existing active featured Pokémon
    const { data: rows, error } = await supabase
        .from("featured_slots")
        .select("*")
        .eq("user_id", userId)
        .order("start_at", { ascending: false })
        .limit(1);

    if (error) {
        console.error("Error fetching featured:", error);
    }

    const existing = rows && rows.length > 0 ? rows[0] : null;


    if (existing && new Date(existing.end_at) > now) {
        console.log(" Using EXISTING featured — price WILL NOT change");
        return {
            name: existing.pokemon_name,
            rarity: existing.rarity,
            price_pkchp: existing.price_pkchp,
            startAt: existing.start_at,
            endAt: existing.end_at,
        };
    }


    const picked = pickRandomFeaturedFromClient();

    // Mythical to Divine Pricing
    let price_pkchp = 0;

    if (picked.rarity === "Mythical") {
        price_pkchp = 500 + Math.floor(Math.random() * 501);
    } else if (picked.rarity === "Divine") {
        price_pkchp = 1000 + Math.floor(Math.random() * 501);
    }

    const startAt = now.toISOString();
    const endAt = new Date(now.getTime() + FEATURED_INTERVAL * 1000).toISOString();

    const { data: inserted, error: insertError } = await supabase
        .from("featured_slots")
        .insert([
            {
                user_id: userId,
                pokemon_name: picked.name,
                rarity: picked.rarity,
                price_pkchp: price_pkchp,
                start_at: startAt,
                end_at: endAt,
            },
        ])
        .select();

    if (insertError) {
        console.error("Featured insert error:", insertError);
        throw insertError;
    }

    const newRow = inserted[0];

    return {
        name: newRow.pokemon_name,
        rarity: newRow.rarity,
        price_pkchp: newRow.price_pkchp,
        startAt: newRow.start_at,
        endAt: newRow.end_at,
    };
}




function secondsUntil(isoEnd) {
  const diffMs = new Date(isoEnd) - new Date();
  return Math.max(0, Math.floor(diffMs / 1000));
}

// MAIN
document.addEventListener("DOMContentLoaded", async () => {
  const grid = document.getElementById("pokemonGrid");
  const filterButtons = document.querySelectorAll(".market-filter-btn");
  const refreshTimerEl = document.getElementById("refreshTimer");

  // FEATURED ELEMENTS
  const featuredSpriteEl = document.getElementById("featuredSprite");
  const featuredNameEl = document.getElementById("featuredName");
  const featuredRarityEl = document.getElementById("featuredRarity");
  const featuredTimerEl = document.getElementById("featuredTimer");
  const featuredBuyBtn = document.getElementById("featuredBuyBtn");
  const featuredPriceValueEl = document.getElementById("featuredPriceValue");
  const featuredPriceLabelEl = document.getElementById("featuredPriceLabel");


  let refreshTimer = REFRESH_INTERVAL;
  let featuredTimer = FEATURED_INTERVAL;

  let currentMarketPool = [];
  let featuredPokemon = null;
  let pokechipBalance = 0;

  if (!window.supabase || !CURRENT_USER_ID) {
    console.error(
      "Supabase or CURRENT_USER_ID not set. Check your HTML script."
    );
    return;
  }

// DATA VALIDATION
  if (
    typeof COMMON_POKEMON === "undefined" ||
    typeof RARE_POKEMON === "undefined" ||
    typeof EPIC_POKEMON === "undefined" ||
    typeof legendaryList === "undefined" ||
    typeof MYTHICAL_POKEMON === "undefined" ||
    typeof DIVINE_POKEMON === "undefined"
  ) {
    console.error("Missing rarityData.js or legendaryList.js");
    return;
  }

// POKECHIP LOGIC (wallet: on-chain PKCHP first, Supabase fallback)
  const updateNavbarPokechip = () => {
    document.querySelectorAll(".pc-pokechip-amount").forEach((el) => {
      el.textContent = pokechipBalance;
    });
  };

  async function loadWallet() {
    // 1) Try to use real PKCHP on-chain (MetaMask)
    const realPkchp = await loadPkchpRealBalance();

    if (realPkchp !== null) {
      pokechipBalance = realPkchp;
    } else {
      // 2) Fallback → Supabase PokeChip
      pokechipBalance = await getWalletBalance(CURRENT_USER_ID);
    }

    updateNavbarPokechip();
  }

  async function savePokechip() {
    try {
      await updateWalletBalance(CURRENT_USER_ID, pokechipBalance);
    } catch (err) {
      console.warn("Supabase balance update skipped (using real PKCHP).");
    }
  }

  await loadWallet();

// PRICE FORMULA FOR POKECHIP POKEMON Common - Legendary
  function computePrice(p, rarity) {
    const total = p.hp + p.attack + p.defense + p.speed;
    
    if (rarity === "Legendary")
      return Math.min(Math.max(105 + Math.floor(total / 25), 80), 120);

    if (rarity === "Epic")
      return Math.min(Math.max(80 + Math.floor(total / 25), 80), 120);

    if (rarity === "Rare")
      return Math.min(Math.max(35 + Math.floor(total / 60), 35), 55);

    return Math.min(Math.max(15 + Math.floor(total / 80), 15), 25);
  }

// FEATURED
  async function renderFeatured() {
    const p = await fetchPokemon(featuredPokemon.name);

    // UI Display
    featuredSpriteEl.src = p.sprite;
    featuredNameEl.textContent = p.name;
    featuredRarityEl.textContent = featuredPokemon.rarity;

    // USE ONLY THE PRICE FROM DATABASE
    featuredPriceValueEl.textContent = featuredPokemon.price_pkchp;
    featuredBuyBtn.textContent = `Buy for ${featuredPokemon.price_pkchp} PKCHP`;

    // Stats for modal
    featuredPokemon.stats = {
        id: p.id,
        sprite: p.sprite,
        types: p.types,
        hp: p.hp,
        attack: p.attack,
        defense: p.defense,
        speed: p.speed,
    };
}


  async function initFeatured() {
    featuredPokemon = await getFeaturedPokemonFromDB(CURRENT_USER_ID);
    await renderFeatured();
    featuredTimer = secondsUntil(
      featuredPokemon.endAt || featuredPokemon.end_at
    );
  }

  await initFeatured();

// MARKET RENDER
  async function renderMarket(filter = "all") {
    grid.innerHTML = "";

    let list =
      filter === "all"
        ? currentMarketPool
        : currentMarketPool.filter((p) => p.rarity.toLowerCase() === filter);

    for (const entry of list) {
      const p = await fetchPokemon(entry.name);

      let priceValue = computePrice(p, entry.rarity);
      let priceLabel = "PokeChip";
      let priceIcon = "◎";

      const card = document.createElement("div");
      card.className = "col-12 col-sm-6 col-md-4 col-lg-3";

      card.innerHTML = `
        <div class="pokemon-card-tcg type-${p.types[0].toLowerCase()}">
          <div class="rarity-badge rarity-${entry.rarity.toLowerCase()}">
            ${entry.rarity}
          </div>

          <div class="level-badge">Lv. 1</div>
          <div class="dex-number">#${p.id}</div>

      <img src="${p.sprite}" class="pokemon-img">

      <h3 class="pokemon-name">${p.name}</h3>
          <p class="pokemon-types">${p.types.join(", ")}</p>

          <div class="stats-box">
            <div class="stat"><span>HP</span> ${p.hp}</div>
            <div class="stat"><span>ATK</span> ${p.attack}</div>
            <div class="stat"><span>DEF</span> ${p.defense}</div>
            <div class="stat"><span>SPD</span> ${p.speed}</div>
          </div>

          <div class="pokemon-price mb-2">${priceIcon} ${priceValue} ${priceLabel}</div>

          <button class="btn btn-sm btn-warning buy-btn"
            data-id="${p.id}"
            data-name="${entry.name}"
            data-rarity="${entry.rarity}"
            data-price="${priceValue}"
            data-sprite="${p.sprite}"
            data-types="${p.types.join("|")}"
            data-hp="${p.hp}"
            data-attack="${p.attack}"
            data-defense="${p.defense}"
            data-speed="${p.speed}">
            Buy for ${priceValue} ${priceLabel}
          </button>
        </div>
      `;

      grid.appendChild(card);
    }
  }

  // BUY MODAL (WORKS FOR FEATURED and NORMAL)
  const buyModalBackdrop = document.getElementById("buyModalBackdrop");
  const buyModalSprite = document.getElementById("buyModalSprite");
  const buyModalName = document.getElementById("buyModalName");
  const buyModalRarity = document.getElementById("buyModalRarity");
  const buyModalPriceValue = document.getElementById("buyModalPriceValue");
  const buyModalPriceLabel = document.getElementById("buyModalPriceLabel");
  const buyModalBalance = document.getElementById("buyModalBalance");
  const buyModalClose = document.getElementById("buyModalClose");
  const buyModalCancel = document.getElementById("buyModalCancel");
  const buyModalConfirm = document.getElementById("buyModalConfirm");
  const processingModalBackdrop = document.getElementById(
    "processingModalBackdrop"
  );
  const processingStatusText = document.getElementById("processingStatusText");
  const processingSubText = document.getElementById("processingSubText");

  let pendingPurchase = null;
  let isProcessingPurchase = false;

  const blockUnload = (e) => {
    e.preventDefault();
    e.returnValue = "";
  };

  async function openBuyModal(data) {
    // Refresh on-chain PKCHP before showing modal
    const realPkchp = await loadPkchpRealBalance();
    if (realPkchp !== null) {
      pokechipBalance = realPkchp;
      updateNavbarPokechip();
    }

    pendingPurchase = data;

    buyModalSprite.src = data.sprite;
    buyModalName.textContent = `${data.name.toUpperCase()} (#${data.id})`;
    buyModalRarity.textContent = data.rarity;

    buyModalPriceValue.textContent = data.price;
    buyModalPriceLabel.textContent = "PokeChip";

    buyModalBalance.textContent = pokechipBalance;

    buyModalBackdrop.classList.remove("d-none");
  }

  function closeBuyModal() {
    if (isProcessingPurchase) return; // keep modal open while processing
    buyModalBackdrop.classList.add("d-none");
    pendingPurchase = null;
  }

  function showProcessingModal(
    status = "Processing your purchase...",
    subText = "Do not close the app until you're redirected to Collection."
  ) {
    isProcessingPurchase = true;
    if (status && processingStatusText) {
      processingStatusText.textContent = status;
    }
    if (subText && processingSubText) {
      processingSubText.textContent = subText;
    }
    processingModalBackdrop.classList.remove("d-none");
    window.addEventListener("beforeunload", blockUnload);
  }

  function updateProcessingText(status, subText) {
    if (status && processingStatusText) {
      processingStatusText.textContent = status;
    }
    if (subText && processingSubText) {
      processingSubText.textContent = subText;
    }
  }

  function hideProcessingModal() {
    processingModalBackdrop.classList.add("d-none");
    window.removeEventListener("beforeunload", blockUnload);
    isProcessingPurchase = false;
  }

  buyModalClose.onclick = closeBuyModal;
  buyModalCancel.onclick = closeBuyModal;

  buyModalBackdrop.addEventListener("click", (e) => {
    if (e.target === buyModalBackdrop) closeBuyModal();
  });

  buyModalConfirm.addEventListener("click", async () => {
    if (!pendingPurchase) return;

    const cost = pendingPurchase.price;

    // Check balance (galing sa MetaMask or Supabase, depende sa loadWallet)
    if (pokechipBalance < cost) {
      alert("Not enough PokeChip!");
      return;
    }

    showProcessingModal(
      "Processing payment...",
      "Keep this tab open. We'll send you to your Collection when done."
    );

    // 1. On-chain PKCHP transfer muna
    try {
      await payWithPkchpOnChain(cost);
    } catch (err) {
      console.error("PKCHP on-chain payment failed:", err);
      hideProcessingModal();
      alert("On-chain PKCHP transfer failed.");
      return; 
    }

    updateProcessingText(
      "Saving your Pokemon to your Collection...",
      "Please wait, this keeps the purchase from getting lost."
    );

    // 2. Update local and Supabase mirror ng wallet
    try {
      pokechipBalance -= cost;
      await savePokechip();
      updateNavbarPokechip();

      // 3. I-save yung nabili sa user_pokemon
      await addPokemonToCollectionDB(pendingPurchase);

      // 4. Log transaction
      if (window.logMarketBuy) {
        await window.logMarketBuy(pendingPurchase, cost);
      }

      hideProcessingModal();
      closeBuyModal();
      window.location.href = "collection.html";
    } catch (err) {
      console.error("Error finalizing market purchase:", err);
      hideProcessingModal();
      alert(
        "We couldn't finish adding this Pokemon to your Collection. Please try again."
      );
    }
  });

  // BUY BUTTON HANDLER (MARKET)
  grid.addEventListener("click", (e) => {
    const btn = e.target.closest(".buy-btn");
    if (!btn) return;

    openBuyModal({
      id: btn.dataset.id,
      name: btn.dataset.name,
      rarity: btn.dataset.rarity,
      price: Number(btn.dataset.price),
      sprite: btn.dataset.sprite,
      types: btn.dataset.types.split("|"),
      hp: Number(btn.dataset.hp),
      attack: Number(btn.dataset.attack),
      defense: Number(btn.dataset.defense),
      speed: Number(btn.dataset.speed),
      currency: "PokeChip",
    });
  });

// FEATURED BUY BUTTON 
  featuredBuyBtn.addEventListener("click", () => {
  if (!featuredPokemon || !featuredPokemon.stats) return;

  openBuyModal({
    id: featuredPokemon.stats.id,
    name: featuredPokemon.name,
    rarity: featuredPokemon.rarity,
    price: featuredPokemon.price_pkchp, 
    sprite: featuredPokemon.stats.sprite,
    types: featuredPokemon.stats.types,
    hp: featuredPokemon.stats.hp,
    attack: featuredPokemon.stats.attack,
    defense: featuredPokemon.stats.defense,
    speed: featuredPokemon.stats.speed,
    currency: "PokeChip", 
  });
});


// FILTER BUTTONS
  filterButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      filterButtons.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      renderMarket(btn.dataset.filter);
    });
  });

// MARKET TIMER (per-user data is in DB)
  let savedTimer = Number(localStorage.getItem(MARKET_TIMER_KEY));
  if (Number.isFinite(savedTimer) && savedTimer > 0) {
    refreshTimer = savedTimer;
  }

  setInterval(async () => {
    refreshTimer--;
    localStorage.setItem(MARKET_TIMER_KEY, refreshTimer);

    const m = String(Math.floor(refreshTimer / 60)).padStart(2, "0");
    const s = String(refreshTimer % 60).padStart(2, "0");
    refreshTimerEl.textContent = `Next refresh in ${m}:${s}`;

    if (refreshTimer <= 0) {
      refreshTimer = REFRESH_INTERVAL;
      localStorage.setItem(MARKET_TIMER_KEY, refreshTimer);

      currentMarketPool = await createNewMarketPool(CURRENT_USER_ID);

      const active =
        document.querySelector(".market-filter-btn.active")?.dataset.filter ||
        "all";

      renderMarket(active);
    }
  }, 1000);

// FEATURED TIMER 
  setInterval(async () => {
    featuredTimer--;

    const m = String(Math.floor(featuredTimer / 60)).padStart(2, "0");
    const s = String(featuredTimer % 60).padStart(2, "0");

    featuredTimerEl.textContent = `${m}:${s}`;

    if (featuredTimer <= 0) {
      featuredPokemon = await getFeaturedPokemonFromDB(CURRENT_USER_ID);
      await renderFeatured();
      featuredTimer = secondsUntil(
        featuredPokemon.endAt || featuredPokemon.end_at
      );
    }
  }, 1000);

// INITIAL MARKET LOAD
  const savedPool = await getMarketPool(CURRENT_USER_ID);
  if (!savedPool || savedPool.length === 0) {
    currentMarketPool = await createNewMarketPool(CURRENT_USER_ID);
  } else {
    currentMarketPool = savedPool;
  }

  renderMarket("all");
});
