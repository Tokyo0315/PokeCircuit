// ============================================================
// POKECIRCUIT ARENA - TRANSACTIONS PAGE
// Updated with PVP Win/Loss support
// ============================================================

document.addEventListener("DOMContentLoaded", async () => {
  if (!window.supabase) {
    console.error("Supabase not loaded");
    return;
  }

  const CURRENT_USER_ID = window.CURRENT_USER_ID;
  if (!CURRENT_USER_ID) {
    console.error("CURRENT_USER_ID missing");
    return;
  }

  // DOM Elements
  const tableBody = document.getElementById("txTableBody");
  const emptyState = document.getElementById("txEmptyState");
  const loadingState = document.getElementById("txLoading");
  const filterBtns = document.querySelectorAll(".tx-filter-btn");
  const clearBtn = document.getElementById("clearHistoryBtn");
  const pagination = document.getElementById("txPagination");
  const prevBtn = document.getElementById("prevPageBtn");
  const nextBtn = document.getElementById("nextPageBtn");
  const currentPageEl = document.getElementById("currentPage");
  const totalPagesEl = document.getElementById("totalPages");

  // Stats
  const totalTxCountEl = document.getElementById("totalTxCount");
  const winCountEl = document.getElementById("winCount");
  const lossCountEl = document.getElementById("lossCount");

  // Modal
  const modal = document.getElementById("txDetailModal");
  const modalBody = document.getElementById("txModalBody");
  const modalClose = document.getElementById("txModalClose");

  // State
  let allTransactions = [];
  let filteredTransactions = [];
  let currentFilter = "all";
  let currentPage = 1;
  const perPage = 15;

  // ============================================================
  // HELPER FUNCTIONS
  // ============================================================

  function getTypeConfig(type) {
    const configs = {
      market_buy: {
        label: "Market Buy",
        icon: "🛒",
        class: "market-buy",
        amountClass: "negative",
      },
      p2p_buy: {
        label: "P2P Buy",
        icon: "🤝",
        class: "p2p-buy",
        amountClass: "negative",
      },
      p2p_sell: {
        label: "P2P Sold",
        icon: "💰",
        class: "p2p-sell",
        amountClass: "positive",
      },
      p2p_list: {
        label: "Listed",
        icon: "📋",
        class: "p2p-list",
        amountClass: "neutral",
      },
      p2p_delist: {
        label: "Delisted",
        icon: "↩️",
        class: "p2p-delist",
        amountClass: "neutral",
      },
      battle_entry: {
        label: "Battle Entry",
        icon: "🎮",
        class: "battle-entry",
        amountClass: "negative",
      },
      battle_win: {
        label: "Victory!",
        icon: "🏆",
        class: "battle-win",
        amountClass: "positive",
      },
      battle_loss: {
        label: "Defeat",
        icon: "💀",
        class: "battle-loss",
        amountClass: "negative",
      },
      battle_reward: {
        label: "Reward",
        icon: "✨",
        class: "battle-win",
        amountClass: "positive",
      },
      // PVP Types
      pvp_win: {
        label: "PVP Victory!",
        icon: "⚔️",
        class: "pvp-win",
        amountClass: "positive",
      },
      pvp_loss: {
        label: "PVP Defeat",
        icon: "💀",
        class: "pvp-loss",
        amountClass: "negative",
      },
      pvp_bet: {
        label: "PVP Bet",
        icon: "🎲",
        class: "pvp-bet",
        amountClass: "negative",
      },
      // Bonus Types
      welcome_bonus: {
        label: "Welcome Bonus!",
        icon: "🎁",
        class: "welcome-bonus",
        amountClass: "positive",
      },
      daily_bonus: {
        label: "Daily Bonus",
        icon: "📅",
        class: "daily-bonus",
        amountClass: "positive",
      },
      referral_bonus: {
        label: "Referral Bonus",
        icon: "👥",
        class: "referral-bonus",
        amountClass: "positive",
      },
    };

    return (
      configs[type] || {
        label: type?.replace(/_/g, " ").toUpperCase() || "Unknown",
        icon: "📝",
        class: "neutral",
        amountClass: "neutral",
      }
    );
  }

  function formatRelativeTime(dateStr) {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = Math.floor((now - date) / 1000);

    if (diff < 60) return "Just now";
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;

    return date.toLocaleDateString();
  }

  function formatAbsoluteTime(dateStr) {
    const date = new Date(dateStr);
    return date.toLocaleString();
  }

  function formatAmount(amount, currency = "PKCHP") {
    if (amount === null || amount === undefined) return "-";

    const num = Number(amount);
    if (currency === "ETH") {
      return num.toFixed(6);
    }
    return num.toLocaleString();
  }

  function shortAddress(addr) {
    if (!addr) return "-";
    return addr.slice(0, 6) + "..." + addr.slice(-4);
  }

  // Get Pokemon sprite URL - tries multiple sources
  function getPokemonSprite(tx) {
    // Direct sprite URL
    if (tx.pokemon_sprite) return tx.pokemon_sprite;

    // Try to build from pokemon name
    if (tx.pokemon_name) {
      const name = tx.pokemon_name.toLowerCase().replace(/[^a-z0-9]/g, "");
      return `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${name}.png`;
    }

    return null;
  }

  // ============================================================
  // LOAD TRANSACTIONS
  // ============================================================

  async function loadTransactions() {
    showLoading(true);

    try {
      const { data, error } = await supabase
        .from("transactions")
        .select("*")
        .eq("user_id", CURRENT_USER_ID)
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Error loading transactions:", error);
        allTransactions = [];
      } else {
        allTransactions = data || [];
      }

      updateStats();
      applyFilter(currentFilter);
    } catch (err) {
      console.error("Exception loading transactions:", err);
      allTransactions = [];
    }

    showLoading(false);
  }

  function updateStats() {
    totalTxCountEl.textContent = allTransactions.length;

    // Count all wins (battle + PVP)
    const wins = allTransactions.filter(
      (tx) => tx.type === "battle_win" || tx.type === "pvp_win"
    ).length;

    // Count all losses (battle + PVP)
    const losses = allTransactions.filter(
      (tx) => tx.type === "battle_loss" || tx.type === "pvp_loss"
    ).length;

    winCountEl.textContent = wins;
    lossCountEl.textContent = losses;
  }

  // ============================================================
  // FILTER & RENDER
  // ============================================================

  function applyFilter(filter) {
    currentFilter = filter;
    currentPage = 1;

    if (filter === "all") {
      filteredTransactions = [...allTransactions];
    } else if (filter === "p2p") {
      filteredTransactions = allTransactions.filter((tx) =>
        tx.type.startsWith("p2p_")
      );
    } else if (filter === "battle") {
      // Include both AI battles and PVP battles
      filteredTransactions = allTransactions.filter(
        (tx) => tx.type.startsWith("battle_") || tx.type.startsWith("pvp_")
      );
    } else if (filter === "success" || filter === "failed") {
      filteredTransactions = allTransactions.filter(
        (tx) => tx.status === filter
      );
    } else {
      filteredTransactions = allTransactions.filter((tx) => tx.type === filter);
    }

    renderTransactions();
    updatePagination();
  }

  function renderTransactions() {
    tableBody.innerHTML = "";

    const start = (currentPage - 1) * perPage;
    const end = start + perPage;
    const pageData = filteredTransactions.slice(start, end);

    if (pageData.length === 0) {
      showEmptyState(true);
      return;
    }

    showEmptyState(false);

    for (const tx of pageData) {
      const row = createTransactionRow(tx);
      tableBody.appendChild(row);
    }
  }

  function createTransactionRow(tx) {
    const config = getTypeConfig(tx.type);
    const row = document.createElement("tr");
    row.dataset.txId = tx.id;

    // Add special class for PVP rows
    if (tx.type === "pvp_win") {
      row.classList.add("pvp-row", "pvp-win-row");
    } else if (tx.type === "pvp_loss") {
      row.classList.add("pvp-row", "pvp-loss-row");
    }

    // Get sprite URL
    const spriteUrl = getPokemonSprite(tx);

    // Build details text
    let detailsMain = "";
    let detailsSub = "";

    if (tx.type === "pvp_win") {
      detailsMain = tx.opponent_name
        ? `vs ${tx.opponent_name}`
        : "PVP Battle Won";
      detailsSub = `PVP Battle`;
      if (tx.exp_gained) {
        detailsSub += ` • +${tx.exp_gained} EXP`;
      }
    } else if (tx.type === "pvp_loss") {
      detailsMain = tx.opponent_name
        ? `vs ${tx.opponent_name}`
        : "PVP Battle Lost";
      detailsSub = `⚠️ Pokemon Lost Forever`;
    } else if (tx.type === "battle_win" || tx.type === "battle_loss") {
      detailsMain = `vs ${tx.opponent_name || "AI Trainer"}`;
      detailsSub = `${tx.battle_mode || "Single"} • ${(
        tx.battle_tier || "low"
      ).toUpperCase()} Tier`;
      if (tx.exp_gained) {
        detailsSub += ` • +${tx.exp_gained} EXP`;
      }
    } else if (tx.type === "battle_entry") {
      detailsMain = `Entered ${(tx.battle_tier || "low").toUpperCase()} Tier`;
      detailsSub = tx.battle_mode || "Single Match";
    } else if (tx.type === "p2p_buy" || tx.type === "p2p_sell") {
      detailsMain =
        tx.type === "p2p_buy" ? "Purchased from player" : "Sold to player";
      detailsSub = shortAddress(tx.counterparty_wallet);
    } else if (tx.type === "p2p_list") {
      detailsMain = `Listed for ${formatAmount(tx.amount)} PKCHP`;
      detailsSub = "Active on P2P Market";
    } else if (tx.type === "p2p_delist") {
      detailsMain = "Removed from P2P Market";
      detailsSub = "Returned to collection";
    } else if (tx.type === "market_buy") {
      detailsMain = "Purchased from marketplace";
      detailsSub = tx.pokemon_rarity || "";
    }

    // Format Pokemon name
    const pokemonName = tx.pokemon_name
      ? tx.pokemon_name.charAt(0).toUpperCase() + tx.pokemon_name.slice(1)
      : "-";

    // Determine if this is a loss (for grayscale effect)
    const isLoss = tx.type === "pvp_loss";

    row.innerHTML = `
      <td>
        <span class="tx-type-badge ${config.class}">
          <span class="tx-type-icon">${config.icon}</span>
          <span class="tx-type-label">${config.label}</span>
        </span>
      </td>
      <td>
        <div class="tx-pokemon-cell">
          ${
            spriteUrl
              ? `
            <div class="tx-pokemon-sprite-wrapper ${
              isLoss ? "lost-pokemon" : ""
            }">
              <img src="${spriteUrl}" class="tx-pokemon-sprite" alt="${pokemonName}" onerror="this.parentElement.innerHTML='<span class=\\'tx-no-sprite\\'>?</span>'">
            </div>
          `
              : '<div class="tx-pokemon-sprite-wrapper"><span class="tx-no-sprite">?</span></div>'
          }
          <div class="tx-pokemon-info">
            <span class="tx-pokemon-name ${
              isLoss ? "lost-name" : ""
            }">${pokemonName}</span>
            ${
              tx.pokemon_rarity
                ? `<span class="tx-pokemon-rarity ${(
                    tx.pokemon_rarity || ""
                  ).toLowerCase()}">${tx.pokemon_rarity}</span>`
                : ""
            }
          </div>
        </div>
      </td>
      <td>
        <span class="tx-amount ${config.amountClass}">
          ${
            tx.amount !== null && tx.amount !== undefined
              ? formatAmount(tx.amount)
              : "-"
          }
          <span class="tx-currency">${
            tx.amount !== null && tx.amount !== undefined
              ? tx.currency || "PKCHP"
              : ""
          }</span>
        </span>
      </td>
      <td class="tx-details">
        <span class="tx-details-main">${detailsMain}</span>
        <span class="tx-details-sub ${
          isLoss ? "loss-warning" : ""
        }">${detailsSub}</span>
      </td>
      <td>
        <span class="tx-status ${tx.status || "success"}">
          ${
            tx.status === "success"
              ? "✓"
              : tx.status === "pending"
              ? "⏳"
              : tx.status === "failed"
              ? "✗"
              : "○"
          }
          ${tx.status || "success"}
        </span>
      </td>
      <td class="tx-time">
        <span class="tx-time-relative">${formatRelativeTime(
          tx.created_at
        )}</span>
        <span class="tx-time-absolute">${formatAbsoluteTime(
          tx.created_at
        )}</span>
      </td>
    `;

    // Click to show details
    row.addEventListener("click", () => showTransactionDetail(tx));

    return row;
  }

  // ============================================================
  // PAGINATION
  // ============================================================

  function updatePagination() {
    const totalPages = Math.ceil(filteredTransactions.length / perPage) || 1;

    currentPageEl.textContent = currentPage;
    totalPagesEl.textContent = totalPages;

    prevBtn.disabled = currentPage <= 1;
    nextBtn.disabled = currentPage >= totalPages;

    pagination.style.display = totalPages > 1 ? "flex" : "none";
  }

  prevBtn.addEventListener("click", () => {
    if (currentPage > 1) {
      currentPage--;
      renderTransactions();
      updatePagination();
    }
  });

  nextBtn.addEventListener("click", () => {
    const totalPages = Math.ceil(filteredTransactions.length / perPage);
    if (currentPage < totalPages) {
      currentPage++;
      renderTransactions();
      updatePagination();
    }
  });

  // ============================================================
  // FILTER BUTTONS
  // ============================================================

  filterBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      filterBtns.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      applyFilter(btn.dataset.filter);
    });
  });

  // ============================================================
  // CLEAR HISTORY
  // ============================================================

  clearBtn.addEventListener("click", async () => {
    if (
      !confirm(
        "Are you sure you want to clear all transaction history? This cannot be undone."
      )
    ) {
      return;
    }

    try {
      const { error } = await supabase
        .from("transactions")
        .delete()
        .eq("user_id", CURRENT_USER_ID);

      if (error) {
        console.error("Error clearing transactions:", error);
        alert("Failed to clear history.");
        return;
      }

      allTransactions = [];
      filteredTransactions = [];
      renderTransactions();
      updateStats();
      updatePagination();
      alert("Transaction history cleared.");
    } catch (err) {
      console.error("Exception clearing transactions:", err);
    }
  });

  // ============================================================
  // TRANSACTION DETAIL MODAL
  // ============================================================

  function showTransactionDetail(tx) {
    const config = getTypeConfig(tx.type);
    const spriteUrl = getPokemonSprite(tx);
    const pokemonName = tx.pokemon_name
      ? tx.pokemon_name.charAt(0).toUpperCase() + tx.pokemon_name.slice(1)
      : null;
    const isLoss = tx.type === "pvp_loss";

    modalBody.innerHTML = `
      ${
        spriteUrl || pokemonName
          ? `
      <div class="tx-modal-pokemon-header ${
        isLoss ? "lost-pokemon-header" : ""
      }">
        <div class="tx-modal-sprite-wrapper ${isLoss ? "lost-pokemon" : ""}">
          ${
            spriteUrl
              ? `<img src="${spriteUrl}" class="tx-modal-sprite" alt="${
                  pokemonName || ""
                }">`
              : '<span class="tx-modal-no-sprite">?</span>'
          }
        </div>
        <div class="tx-modal-pokemon-info">
          <div class="tx-modal-pokemon-name ${isLoss ? "lost-name" : ""}">${
              pokemonName || "-"
            }</div>
          ${
            tx.pokemon_rarity
              ? `<div class="tx-modal-pokemon-rarity ${tx.pokemon_rarity.toLowerCase()}">${
                  tx.pokemon_rarity
                }</div>`
              : ""
          }
          ${
            tx.pokemon_level
              ? `<div class="tx-modal-pokemon-level">Level ${tx.pokemon_level}</div>`
              : ""
          }
          ${
            isLoss
              ? '<div class="tx-modal-lost-badge">⚠️ LOST FOREVER</div>'
              : ""
          }
        </div>
      </div>
      `
          : ""
      }

      <div class="tx-detail-row">
        <span class="tx-detail-label">Transaction Type</span>
        <span class="tx-detail-value">
          <span class="tx-type-badge ${config.class}">${config.icon} ${
      config.label
    }</span>
        </span>
      </div>
      
      ${
        tx.amount !== null && tx.amount !== undefined
          ? `
      <div class="tx-detail-row">
        <span class="tx-detail-label">Amount</span>
        <span class="tx-detail-value tx-amount ${
          config.amountClass
        }">${formatAmount(tx.amount)} ${tx.currency || "PKCHP"}</span>
      </div>
      `
          : ""
      }
      
      ${
        tx.battle_tier
          ? `
      <div class="tx-detail-row">
        <span class="tx-detail-label">Battle Tier</span>
        <span class="tx-detail-value">${tx.battle_tier.toUpperCase()}</span>
      </div>
      `
          : ""
      }
      
      ${
        tx.battle_mode
          ? `
      <div class="tx-detail-row">
        <span class="tx-detail-label">Battle Mode</span>
        <span class="tx-detail-value">${tx.battle_mode}</span>
      </div>
      `
          : ""
      }
      
      ${
        tx.opponent_name
          ? `
      <div class="tx-detail-row">
        <span class="tx-detail-label">Opponent</span>
        <span class="tx-detail-value">${tx.opponent_name}</span>
      </div>
      `
          : ""
      }
      
      ${
        tx.exp_gained
          ? `
      <div class="tx-detail-row">
        <span class="tx-detail-label">EXP Gained</span>
        <span class="tx-detail-value" style="color: #22c55e;">+${tx.exp_gained}</span>
      </div>
      `
          : ""
      }
      
      ${
        tx.counterparty_wallet
          ? `
      <div class="tx-detail-row">
        <span class="tx-detail-label">Counterparty</span>
        <span class="tx-detail-value">${shortAddress(
          tx.counterparty_wallet
        )}</span>
      </div>
      `
          : ""
      }
      
      ${
        tx.tx_hash
          ? `
      <div class="tx-detail-row">
        <span class="tx-detail-label">TX Hash</span>
        <span class="tx-detail-value" style="font-size: 0.75rem;">${shortAddress(
          tx.tx_hash
        )}</span>
      </div>
      `
          : ""
      }
      
      ${
        tx.gas_fee
          ? `
      <div class="tx-detail-row">
        <span class="tx-detail-label">Gas Fee</span>
        <span class="tx-detail-value">${tx.gas_fee} ETH</span>
      </div>
      `
          : ""
      }
      
      <div class="tx-detail-row">
        <span class="tx-detail-label">Status</span>
        <span class="tx-detail-value">
          <span class="tx-status ${tx.status || "success"}">${
      tx.status || "success"
    }</span>
        </span>
      </div>
      
      <div class="tx-detail-row">
        <span class="tx-detail-label">Time</span>
        <span class="tx-detail-value">${formatAbsoluteTime(
          tx.created_at
        )}</span>
      </div>
    `;

    modal.classList.remove("d-none");
  }

  modalClose.addEventListener("click", () => {
    modal.classList.add("d-none");
  });

  modal.addEventListener("click", (e) => {
    if (e.target === modal) {
      modal.classList.add("d-none");
    }
  });

  // ============================================================
  // UI HELPERS
  // ============================================================

  function showLoading(show) {
    loadingState.style.display = show ? "block" : "none";
    if (show) {
      tableBody.innerHTML = "";
      emptyState.classList.add("d-none");
    }
  }

  function showEmptyState(show) {
    if (show) {
      emptyState.classList.remove("d-none");
    } else {
      emptyState.classList.add("d-none");
    }
  }

  // ============================================================
  // INITIALIZE
  // ============================================================

  await loadTransactions();
});

// ============================================================
// GLOBAL TRANSACTION LOGGING FUNCTION
// Call this from other files to log transactions
// ============================================================

window.logTransaction = async function (txData) {
  if (!window.supabase || !window.CURRENT_USER_ID) {
    console.error("Cannot log transaction: Supabase or user not available");
    return null;
  }

  const transaction = {
    user_id: window.CURRENT_USER_ID,
    wallet_address: window.CURRENT_WALLET_ADDRESS,
    status: "success",
    ...txData,
    created_at: new Date().toISOString(),
  };

  try {
    const { data, error } = await supabase
      .from("transactions")
      .insert([transaction])
      .select()
      .single();

    if (error) {
      console.error("Error logging transaction:", error);
      return null;
    }

    console.log("✓ Transaction logged:", txData.type, data.id);
    return data;
  } catch (err) {
    console.error("Exception logging transaction:", err);
    return null;
  }
};
