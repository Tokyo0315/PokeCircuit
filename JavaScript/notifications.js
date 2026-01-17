// Live notifications for P2P sales and bidding

document.addEventListener("DOMContentLoaded", async () => {
  const supa = window.supabase;
  const getCurrentUserId = () =>
    window.CURRENT_USER_ID || localStorage.getItem("CURRENT_USER_ID");
  let CURRENT_USER_ID = getCurrentUserId();

  const notifListEl = document.getElementById("notifList");
  const notifEmptyEl = document.getElementById("notifEmpty");
  const notifCountEl = document.getElementById("notifCount");
  const notifDropdownListEl = document.getElementById("notifDropdownList");
  const notifPingEl = document.getElementById("notifPing");
  const notifHeroCountEl = document.getElementById("notifHeroCount");
  const notifHeroSaleEl = document.getElementById("notifHeroSale");
  const notifHeroMetaEl = document.getElementById("notifHeroMeta");
  const notifHeroMeterEl = document.getElementById("notifHeroMeter");
  const metricTotalEl = document.getElementById("metricTotal");
  const metricBuyerEl = document.getElementById("metricBuyer");
  const metricHighSaleEl = document.getElementById("metricHighSale");
  const connectionEl = document.getElementById("notifConnection");
  const filterNewsBtn = document.getElementById("notifFilterNews");
  const filterSalesBtn = document.getElementById("notifFilterSales");
  const filterBidsBtn = document.getElementById("notifFilterBids");
  const filterAllBtn = document.getElementById("notifFilterAll");

  const bellBtn = document.getElementById("notifBell");
  const dropdown = document.getElementById("notifDropdown");

  let notifications = [];
  let filterMode = "all"; // news | sales | bids | all
  let realtimeChannel = null;
  let bidRealtimeChannel = null;
  const buyerCache = new Map();

  // Bid notification types
  const BID_NOTIFICATION_TYPES = [
    "new_bid",
    "outbid",
    "bid_accepted",
    "bid_refunded",
    "listing_cancelled",
    "listing_sold",
  ];
  const PVP_NOTIFICATION_TYPES = ["pvp_win"];
  const PVP_ESCROW_ADDRESS =
    window.PVP_ESCROW_ADDRESS || "0x420D05bF983a1bC59917b80E81A0cC4d36486A2D";
  const PVP_ESCROW_ABI = [
    {
      inputs: [
        { internalType: "bytes32", name: "roomId", type: "bytes32" },
        { internalType: "address", name: "winner", type: "address" },
      ],
      name: "confirmWinner",
      outputs: [],
      stateMutability: "nonpayable",
      type: "function",
    },
    {
      inputs: [{ internalType: "bytes32", name: "roomId", type: "bytes32" }],
      name: "claimPrize",
      outputs: [],
      stateMutability: "nonpayable",
      type: "function",
    },
    {
      inputs: [{ internalType: "bytes32", name: "roomId", type: "bytes32" }],
      name: "getRoom",
      outputs: [
        { internalType: "address", name: "player1", type: "address" },
        { internalType: "address", name: "player2", type: "address" },
        { internalType: "uint256", name: "betAmount", type: "uint256" },
        { internalType: "uint256", name: "createdAt", type: "uint256" },
        { internalType: "uint256", name: "battleStartedAt", type: "uint256" },
        { internalType: "address", name: "winner", type: "address" },
        { internalType: "uint8", name: "status", type: "uint8" },
      ],
      stateMutability: "view",
      type: "function",
    },
  ];

  // Escrow status constants
  const ESCROW_STATUS = {
    WAITING_FOR_OPPONENT: 0,
    BATTLE_IN_PROGRESS: 1,
    BATTLE_COMPLETE: 2,
    CANCELLED: 3,
    CLAIMED: 4,
  };

  const ESCROW_STATUS_NAMES = {
    0: "WaitingForOpponent",
    1: "BattleInProgress",
    2: "BattleComplete",
    3: "Cancelled",
    4: "Claimed",
  };

  const shortWallet = (addr) => {
    if (!addr) return "No wallet";
    const clean = addr.toString();
    return `${clean.slice(0, 6)}...${clean.slice(-4)}`;
  };

  const formatAmount = (amount) =>
    Number(amount || 0).toLocaleString(undefined, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    });

  const roomCodeToBytes32 = (roomCode) =>
    ethers.keccak256(ethers.toUtf8Bytes(roomCode));

  // Get escrow room status from blockchain
  const getEscrowRoomStatus = async (roomCode) => {
    if (!window.ethereum || !roomCode) {
      return null;
    }

    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const escrowContract = new ethers.Contract(
        PVP_ESCROW_ADDRESS,
        PVP_ESCROW_ABI,
        provider,
      );
      const roomId = roomCodeToBytes32(roomCode);
      const roomData = await escrowContract.getRoom(roomId);

      const player1 = roomData[0];
      const player2 = roomData[1];
      const status = Number(roomData[6]);
      const winner = roomData[5];
      const zeroAddress = "0x0000000000000000000000000000000000000000";

      console.log("[ESCROW STATUS]", {
        roomCode,
        player1,
        player2,
        status,
        statusName: ESCROW_STATUS_NAMES[status] || "Unknown",
        winner,
      });

      return {
        exists: player1 !== zeroAddress,
        player1,
        player2,
        status,
        statusName: ESCROW_STATUS_NAMES[status] || "Unknown",
        winner,
      };
    } catch (err) {
      console.error("Failed to get escrow room status:", err);
      return null;
    }
  };

  // Claim prize - auto-confirms winner if needed
  const claimEscrowPrize = async (roomCode) => {
    if (!window.ethereum || !roomCode) {
      throw new Error("Wallet not connected for escrow claim");
    }

    const escrowStatus = await getEscrowRoomStatus(roomCode);
    const currentWallet = String(
      window.CURRENT_WALLET_ADDRESS || "",
    ).toLowerCase();

    if (!escrowStatus || !escrowStatus.exists) {
      throw new Error(
        "Escrow room not found on blockchain. The room may not have been created or both players did not deposit.",
      );
    }

    // Check status and provide meaningful errors
    if (escrowStatus.status === ESCROW_STATUS.WAITING_FOR_OPPONENT) {
      throw new Error(
        "Opponent never deposited to escrow. Both players must deposit before battle.",
      );
    }

    if (escrowStatus.status === ESCROW_STATUS.CANCELLED) {
      throw new Error("This battle was cancelled.");
    }

    if (escrowStatus.status === ESCROW_STATUS.CLAIMED) {
      throw new Error("Prize has already been claimed.");
    }

    const provider = new ethers.BrowserProvider(window.ethereum);
    const signer = await provider.getSigner();
    const escrowContract = new ethers.Contract(
      PVP_ESCROW_ADDRESS,
      PVP_ESCROW_ABI,
      signer,
    );
    const roomId = roomCodeToBytes32(roomCode);

    // If battle still in progress, confirm winner first
    if (escrowStatus.status === ESCROW_STATUS.BATTLE_IN_PROGRESS) {
      console.log("[ESCROW] Battle in progress, confirming winner first...");
      const confirmTx = await escrowContract.confirmWinner(
        roomId,
        currentWallet,
      );
      await confirmTx.wait();
      console.log("[ESCROW] Winner confirmed!");
    }

    // Now claim the prize
    console.log("[ESCROW] Claiming prize...");
    const tx = await escrowContract.claimPrize(roomId);
    await tx.wait();
    console.log("[ESCROW] Prize claimed!");
  };

  // Confirm winner - checks state first
  const confirmEscrowWinner = async (roomCode, winner) => {
    if (!window.ethereum || !roomCode || !winner) {
      throw new Error("Wallet not connected for escrow confirm");
    }

    const escrowStatus = await getEscrowRoomStatus(roomCode);

    if (!escrowStatus || !escrowStatus.exists) {
      console.warn("[ESCROW] Room not found, skipping confirmation");
      return;
    }

    // Already complete or claimed - no need to confirm
    if (escrowStatus.status === ESCROW_STATUS.BATTLE_COMPLETE) {
      console.log("[ESCROW] Winner already confirmed");
      return;
    }

    if (escrowStatus.status === ESCROW_STATUS.CLAIMED) {
      console.log("[ESCROW] Prize already claimed");
      return;
    }

    if (escrowStatus.status === ESCROW_STATUS.CANCELLED) {
      console.warn("[ESCROW] Battle cancelled, cannot confirm");
      return;
    }

    if (escrowStatus.status === ESCROW_STATUS.WAITING_FOR_OPPONENT) {
      throw new Error("Escrow not ready: opponent never deposited.");
    }

    // Battle in progress - can confirm
    if (escrowStatus.status === ESCROW_STATUS.BATTLE_IN_PROGRESS) {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const escrowContract = new ethers.Contract(
        PVP_ESCROW_ADDRESS,
        PVP_ESCROW_ABI,
        signer,
      );
      const roomId = roomCodeToBytes32(roomCode);

      console.log("[ESCROW] Confirming winner:", winner);
      const tx = await escrowContract.confirmWinner(roomId, winner);
      await tx.wait();
      console.log("[ESCROW] Winner confirmed!");
    }
  };

  const canClaimEscrow = async (roomCode) => {
    if (!window.ethereum || !roomCode) {
      return { ok: false, reason: "Wallet not connected." };
    }

    try {
      const escrowStatus = await getEscrowRoomStatus(roomCode);
      const wallet = String(window.CURRENT_WALLET_ADDRESS || "").toLowerCase();

      if (!escrowStatus || !escrowStatus.exists) {
        return { ok: false, reason: "Escrow room not found on blockchain." };
      }

      if (escrowStatus.status === ESCROW_STATUS.WAITING_FOR_OPPONENT) {
        return { ok: false, reason: "Opponent never deposited to escrow." };
      }

      if (escrowStatus.status === ESCROW_STATUS.CANCELLED) {
        return { ok: false, reason: "Battle was cancelled." };
      }

      if (escrowStatus.status === ESCROW_STATUS.CLAIMED) {
        return { ok: false, reason: "Prize already claimed." };
      }

      // Battle in progress - can claim (will auto-confirm)
      if (escrowStatus.status === ESCROW_STATUS.BATTLE_IN_PROGRESS) {
        const isPlayer =
          escrowStatus.player1.toLowerCase() === wallet ||
          escrowStatus.player2.toLowerCase() === wallet;
        if (!isPlayer) {
          return { ok: false, reason: "You are not a player in this room." };
        }
        return { ok: true, reason: "", needsConfirmation: true };
      }

      // Battle complete - check if user is winner
      if (escrowStatus.status === ESCROW_STATUS.BATTLE_COMPLETE) {
        const winner = String(escrowStatus.winner || "").toLowerCase();
        const zeroAddress = "0x0000000000000000000000000000000000000000";
        if (!winner || winner === zeroAddress || winner !== wallet) {
          return { ok: false, reason: "Only the winner can claim." };
        }
        return { ok: true, reason: "" };
      }

      return { ok: false, reason: "Unknown escrow state." };
    } catch (err) {
      console.warn("Escrow claim check failed:", err);
      return { ok: false, reason: "Unable to verify escrow status." };
    }
  };

  const relativeTime = (iso) => {
    const date = new Date(iso);
    const now = new Date();
    const diff = Math.floor((now - date) / 1000);

    if (diff < 60) return "Just now";
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
    return date.toLocaleDateString();
  };

  const setConnection = (state, copy) => {
    if (!connectionEl) return;
    const dot = connectionEl.querySelector(".dot");
    const title = connectionEl.querySelector(".notif-connection-title");
    const sub = connectionEl.querySelector(".notif-connection-sub");

    connectionEl.classList.remove("warning");
    dot?.classList.remove("warning", "live");

    if (state === "live") {
      dot?.classList.add("live");
      if (title) title.textContent = "Live connection";
      if (sub)
        sub.textContent =
          copy || "Listening for P2P sales tied to your wallet.";
    } else {
      dot?.classList.add("warning");
      if (title) title.textContent = "Wallet not connected";
      if (sub)
        sub.textContent =
          copy || "Connect your wallet to start receiving live alerts.";
    }
  };

  const decorateNotification = (raw, markNew = false) => {
    const name = raw.pokemon_name
      ? raw.pokemon_name.charAt(0).toUpperCase() + raw.pokemon_name.slice(1)
      : "Unknown PokAcmon";
    const category = raw.type && raw.type.startsWith("p2p_") ? "sale" : "news";
    return {
      ...raw,
      displayName: name,
      amountPkchp: Number(raw.amount || 0),
      shortWallet: shortWallet(raw.counterparty_wallet),
      buyer_name: raw.buyer_name || null,
      category,
      isNew: markNew,
    };
  };

  const renderBadge = () => {
    const total = notifications.length;
    const newCount = notifications.filter((n) => n.isNew).length;

    if (notifCountEl) notifCountEl.textContent = total;
    if (notifHeroCountEl)
      notifHeroCountEl.textContent = `${total} alert${total === 1 ? "" : "s"} tracked`;

    if (notifPingEl) {
      notifPingEl.textContent = newCount > 99 ? "99+" : newCount || "";
      notifPingEl.classList.toggle("d-none", newCount === 0);
    }
  };

  const renderDropdown = () => {
    if (!notifDropdownListEl) return;
    notifDropdownListEl.innerHTML = "";

    if (!notifications.length) {
      notifDropdownListEl.innerHTML =
        '<p class="text-muted small mb-0">No notifications yet.</p>';
      return;
    }

    const slice = notifications.slice(0, 5);
    slice.forEach((notif) => {
      const item = document.createElement("div");
      item.className = `pc-notif-dropdown-item ${notif.isBidNotification ? "bid-notif" : ""}`;

      let title, meta;
      if (notif.isBidNotification) {
        title = getBidNotificationTitle(notif);
        meta = `${notif.amountPkchp ? formatAmount(notif.amountPkchp) + " PKCHP - " : ""}${relativeTime(notif.created_at)}`;
      } else if (notif.isPvpNotification) {
        title = "PVP Victory";
        meta = `${notif.amountPkchp ? formatAmount(notif.amountPkchp) + " PKCHP - " : ""}${relativeTime(notif.created_at)}`;
      } else {
        title = `${notif.displayName} sold`;
        meta = `${notif.buyer_name || "Trainer"} - ${notif.shortWallet} - ${formatAmount(notif.amountPkchp)} PKCHP - ${relativeTime(notif.created_at)}`;
      }

      item.innerHTML = `
        <div class="title">${notif.isBidNotification ? getBidNotificationIcon(notif.type) + " " : ""}${title}</div>
        <div class="meta">${meta}</div>
      `;
      notifDropdownListEl.appendChild(item);
    });
  };

  const renderHero = () => {
    if (!notifications.length) {
      if (notifHeroSaleEl)
        notifHeroSaleEl.textContent = "Waiting for your first sale...";
      if (notifHeroMetaEl)
        notifHeroMetaEl.textContent =
          "Stay on this page to get instant alerts.";
      if (notifHeroMeterEl) notifHeroMeterEl.style.width = "0%";
      return;
    }

    const latest = notifications[0];
    const highSale = notifications.reduce(
      (max, n) => Math.max(max, n.amountPkchp || 0),
      0,
    );
    const meterWidth = highSale
      ? Math.min(100, Math.max(25, (latest.amountPkchp / highSale) * 100))
      : 100;

    if (notifHeroSaleEl) {
      if (latest.isPvpNotification) {
        notifHeroSaleEl.textContent = `PVP win claimed for ${formatAmount(
          latest.amountPkchp,
        )} PKCHP`;
      } else {
        notifHeroSaleEl.textContent = `${latest.displayName} sold for ${formatAmount(
          latest.amountPkchp,
        )} PKCHP`;
      }
    }

    if (notifHeroMetaEl)
      notifHeroMetaEl.textContent = latest.isPvpNotification
        ? latest.message || `PVP victory - ${relativeTime(latest.created_at)}`
        : `Bought by ${
            latest.buyer_name || "Trainer"
          } (${latest.shortWallet}) - ${relativeTime(latest.created_at)}`;

    if (notifHeroMeterEl) notifHeroMeterEl.style.width = `${meterWidth}%`;
  };

  const renderMetrics = () => {
    const total = notifications.length;
    const latest = notifications[0];
    const highSale = notifications.reduce(
      (max, n) => Math.max(max, n.amountPkchp || 0),
      0,
    );

    if (metricTotalEl) metricTotalEl.textContent = total;
    if (metricBuyerEl)
      metricBuyerEl.textContent =
        latest?.buyer_name || latest?.shortWallet || "-";
    if (metricHighSaleEl)
      metricHighSaleEl.textContent = `${formatAmount(highSale)} PKCHP`;
  };

  const renderList = () => {
    if (!notifListEl || !notifEmptyEl) return;

    notifListEl.innerHTML = "";
    const filtered = notifications.filter((n) => {
      const category = n.category || "news";
      if (filterMode === "news") return category === "news";
      if (filterMode === "sales") return category === "sale";
      if (filterMode === "bids") return category === "bid";
      return true;
    });

    if (!filtered.length) {
      notifEmptyEl.classList.remove("d-none");
      return;
    }

    notifEmptyEl.classList.add("d-none");

    filtered.forEach((notif) => {
      const card = document.createElement("div");
      card.className = `notif-card ${notif.isNew ? "new" : ""} ${notif.isBidNotification ? "bid-notification" : ""}`;

      if (notif.isBidNotification) {
        // Bid notification card
        const icon = getBidNotificationIcon(notif.type);
        const title = getBidNotificationTitle(notif);
        const typeLabel = notif.type
          .replace(/_/g, " ")
          .replace(/\b\w/g, (l) => l.toUpperCase());

        card.innerHTML = `
          <div class="notif-sprite">
            ${
              notif.pokemon_sprite
                ? `<img src="${notif.pokemon_sprite}" alt="${notif.displayName}" onerror="this.parentElement.innerHTML='<span class=\\'notif-sprite-fallback\\'>${icon}</span>'">`
                : `<span class="notif-sprite-fallback">${icon}</span>`
            }
          </div>
          <div class="notif-body">
            <div class="notif-title-line">${icon} ${title}</div>
            <div class="notif-message">${notif.message || ""}</div>
            <div class="notif-meta">
              <span class="time">${relativeTime(notif.created_at)}</span> - <span class="notif-type-badge ${notif.type}">${typeLabel}</span>
            </div>
          </div>
          ${notif.amountPkchp ? `<div class="notif-chip">${formatAmount(notif.amountPkchp)} PKCHP</div>` : ""}
        `;
      } else if (notif.isPvpNotification) {
        const roomCode = notif.roomCode;
        const isAlreadyClaimed = notif.is_read === true;
        const claimDisabled = isAlreadyClaimed || notif.amountPkchp <= 0;
        card.innerHTML = `
          <div class="notif-sprite">
            ${
              notif.pokemon_sprite
                ? `<img src="${notif.pokemon_sprite}" alt="${notif.displayName}" onerror="this.parentElement.innerHTML='<span class=\\'notif-sprite-fallback\\'>PVP</span>'">`
                : `<span class="notif-sprite-fallback">PVP</span>`
            }
          </div>
          <div class="notif-body">
            <div class="notif-title-line">PVP Victory</div>
            <div class="notif-message">${notif.message || "You win in PVP! Claim your reward."}</div>
            <div class="notif-meta">
              <span class="time">${relativeTime(notif.created_at)}</span> - PVP battle
            </div>
          </div>
          <div class="notif-actions">
            <div class="notif-chip">${formatAmount(notif.amountPkchp)} PKCHP</div>
            <button class="notif-claim-btn pvp-claim-btn ${isAlreadyClaimed ? "claimed" : ""}" data-room-code="${roomCode || ""}" data-notif-id="${notif.id || ""}" ${claimDisabled ? "disabled" : ""}>
              ${isAlreadyClaimed ? "✓ Claimed" : notif.amountPkchp <= 0 ? "No reward" : "Claim"}
            </button>
          </div>
        `;
      } else {
        // Sale notification card (original format)
        card.innerHTML = `
          <div class="notif-sprite">
            ${
              notif.pokemon_sprite
                ? `<img src="${notif.pokemon_sprite}" alt="${notif.displayName}" onerror="this.parentElement.innerHTML='<span class=\\'notif-sprite-fallback\\'>??</span>'">`
                : `<span class="notif-sprite-fallback">${notif.displayName
                    .charAt(0)
                    .toUpperCase()}</span>`
            }
          </div>
          <div class="notif-body">
            <div class="notif-title-line">${notif.displayName} has been bought by ${
              notif.buyer_name || "Trainer"
            } <span class="wallet">(${notif.shortWallet})</span> for ${formatAmount(
              notif.amountPkchp,
            )} PKCHP</div>
            <div class="notif-meta">
              <span class="time">${relativeTime(notif.created_at)}</span> - P2P sale
            </div>
          </div>
          <div class="notif-chip">${formatAmount(notif.amountPkchp)} PKCHP</div>
        `;
      }

      notifListEl.appendChild(card);
    });
  };

  const renderAll = () => {
    renderList();
    renderBadge();
    renderDropdown();
    renderHero();
    renderMetrics();
  };

  const fetchBuyerNames = async (items) => {
    if (!supa) return items;

    const wallets = [
      ...new Set(
        items
          .map((n) => (n.counterparty_wallet || "").toLowerCase())
          .filter(Boolean),
      ),
    ].filter((w) => !buyerCache.has(w));

    if (!wallets.length) return items;

    try {
      const { data, error } = await supa
        .from("users")
        .select("wallet_address, username")
        .in("wallet_address", wallets);

      if (!error && data) {
        data.forEach((row) => {
          if (!row.wallet_address) return;
          buyerCache.set(row.wallet_address.toLowerCase(), row.username);
        });
      }
    } catch (err) {
      console.warn("Buyer lookup failed:", err);
    }

    return items.map((n) => {
      const key = (n.counterparty_wallet || "").toLowerCase();
      if (buyerCache.has(key)) {
        return { ...n, buyer_name: buyerCache.get(key) };
      }
      return n;
    });
  };

  let loadRetries = 0;
  const loadInitial = async () => {
    CURRENT_USER_ID = getCurrentUserId();
    if (!supa || !CURRENT_USER_ID) {
      setConnection(
        "warn",
        "Connect your wallet to start receiving live notifications.",
      );
      if (loadRetries < 5) {
        loadRetries += 1;
        setTimeout(loadInitial, 1200);
      }
      return;
    }

    try {
      // Load sale notifications from transactions
      const { data: saleData, error: saleError } = await supa
        .from("transactions")
        .select("*")
        .eq("user_id", CURRENT_USER_ID)
        .in("type", ["p2p_sell"])
        .order("created_at", { ascending: false })
        .limit(60);

      if (saleError) {
        console.error("Failed to load sale notifications:", saleError);
      }

      const decoratedSales = (saleData || []).map((row) =>
        decorateNotification(row, false),
      );
      const salesWithNames = await fetchBuyerNames(decoratedSales);

      // Load bid notifications
      const bidNotifications = await loadBidNotifications();
      const pvpNotifications = await loadPvpNotifications();
      const pvpTxNotifications = await loadPvpTransactions();

      // Combine and sort by created_at
      const allNotifications = [
        ...salesWithNames,
        ...bidNotifications,
        ...pvpNotifications,
        ...pvpTxNotifications,
      ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

      notifications = allNotifications.slice(0, 120);
      renderAll();
      setConnection("live");
      subscribeRealtime();

      // Request browser notification permission
      if (Notification.permission === "default") {
        Notification.requestPermission();
      }
    } catch (err) {
      console.error("Notification load error:", err);
    }
  };

  // Decorate bid notification from notifications table
  const decorateBidNotification = (raw, markNew = false) => {
    const name = raw.pokemon_name
      ? raw.pokemon_name.charAt(0).toUpperCase() + raw.pokemon_name.slice(1)
      : "Unknown Pokemon";

    return {
      ...raw,
      displayName: name,
      amountPkchp: Number(raw.amount || 0),
      shortWallet: shortWallet(raw.from_wallet),
      category: "bid",
      isNew: markNew,
      isBidNotification: true,
    };
  };

  const decoratePvpNotification = (raw, markNew = false) => {
    const name = raw.pokemon_name
      ? raw.pokemon_name.charAt(0).toUpperCase() + raw.pokemon_name.slice(1)
      : "Trainer";

    // Extract room_code from multiple possible sources
    let roomCode = null;

    // Priority 1: Direct room_code column
    if (raw.room_code) {
      roomCode = raw.room_code;
    }
    // Priority 2: metadata.room_code
    else if (raw.metadata && raw.metadata.room_code) {
      roomCode = raw.metadata.room_code;
    }
    // Priority 3: Try to extract from message (5-character alphanumeric code)
    else if (raw.message) {
      const messageRoomMatch = raw.message.match(/\b[A-Z0-9]{5}\b/);
      if (messageRoomMatch) {
        roomCode = messageRoomMatch[0];
      }
    }

    // Use bet_amount * 2 as fallback if amount is 0 or missing
    let displayAmount = Number(raw.amount || 0);
    if (displayAmount === 0 && raw.metadata && raw.metadata.bet_amount) {
      displayAmount = raw.metadata.bet_amount * 2;
    }

    return {
      ...raw,
      displayName: name,
      amountPkchp: displayAmount,
      shortWallet: shortWallet(raw.from_wallet),
      category: "news",
      isNew: markNew,
      isPvpNotification: true,
      roomCode,
    };
  };

  const decoratePvpTransaction = (raw, markNew = false) => {
    const opponent = raw.opponent_name || "Trainer";
    const roomCode =
      (raw.metadata && raw.metadata.room_code) ||
      (raw.metadata && raw.metadata.roomCode) ||
      null;

    // Use bet_amount * 2 as fallback if amount is 0 or missing
    let displayAmount = Number(raw.amount || 0);
    if (displayAmount === 0 && raw.metadata && raw.metadata.bet_amount) {
      displayAmount = raw.metadata.bet_amount * 2;
    }

    return {
      ...raw,
      displayName: raw.pokemon_name || "Trainer",
      amountPkchp: displayAmount,
      shortWallet: shortWallet(raw.counterparty_wallet || raw.wallet_address),
      category: "news",
      isNew: markNew,
      isPvpNotification: true,
      roomCode,
      message: `You win in PVP vs ${opponent}! Claim your reward.`,
    };
  };

  // Get bid notification title based on type
  const getBidNotificationTitle = (notif) => {
    switch (notif.type) {
      case "new_bid":
        return `New bid on ${notif.displayName}`;
      case "outbid":
        return `You've been outbid on ${notif.displayName}`;
      case "bid_accepted":
        return `Your bid was accepted!`;
      case "bid_refunded":
        return `Bid refunded for ${notif.displayName}`;
      case "listing_cancelled":
        return `Listing cancelled - ${notif.displayName}`;
      case "listing_sold":
        return `${notif.displayName} was sold`;
      default:
        return notif.message || "Notification";
    }
  };

  /*
  // Get bid notification icon based on type
  const getBidNotificationIcon = (type) => {
    switch (type) {
      case "new_bid":
        return "🔔";
      case "outbid":
        return "⚠️";
      case "bid_accepted":
        return "✅";
      case "bid_refunded":
        return "💰";
      case "listing_cancelled":
        return "❌";
      case "listing_sold":
        return "🛒";
      default:
        return "📢";
    }
  };

  */

  // Get bid notification icon based on type
  const getBidNotificationIcon = (type) => {
    switch (type) {
      case "new_bid":
        return "BID";
      case "outbid":
        return "OUT";
      case "bid_accepted":
        return "WIN";
      case "bid_refunded":
        return "REF";
      case "listing_cancelled":
        return "CXL";
      case "listing_sold":
        return "SOLD";
      default:
        return "BID";
    }
  };

  // Load bid notifications from notifications table
  const loadBidNotifications = async () => {
    if (!supa || !CURRENT_USER_ID) return [];

    try {
      const { data, error } = await supa
        .from("notifications")
        .select("*")
        .eq("user_id", CURRENT_USER_ID)
        .in("type", BID_NOTIFICATION_TYPES)
        .order("created_at", { ascending: false })
        .limit(60);

      if (error) {
        console.error("Failed to load bid notifications:", error);
        return [];
      }

      return (data || []).map((row) =>
        decorateBidNotification(row, !row.is_read),
      );
    } catch (err) {
      console.error("Bid notification load error:", err);
      return [];
    }
  };

  const loadPvpNotifications = async () => {
    if (!supa || !CURRENT_USER_ID) return [];

    try {
      const { data, error } = await supa
        .from("notifications")
        .select("*")
        .eq("user_id", CURRENT_USER_ID)
        .in("type", PVP_NOTIFICATION_TYPES)
        .order("created_at", { ascending: false })
        .limit(60);

      if (error) {
        console.error("Failed to load PVP notifications:", error);
        return [];
      }

      return (data || []).map((row) =>
        decoratePvpNotification(row, !row.is_read),
      );
    } catch (err) {
      console.error("PVP notification load error:", err);
      return [];
    }
  };

  const loadPvpTransactions = async () => {
    if (!supa || !CURRENT_USER_ID) return [];

    try {
      const { data, error } = await supa
        .from("transactions")
        .select("*")
        .eq("user_id", CURRENT_USER_ID)
        .eq("type", "pvp_win_pending")
        .order("created_at", { ascending: false })
        .limit(60);

      if (error) {
        console.error("Failed to load PVP transaction notifications:", error);
        return [];
      }

      return (data || []).map((row) => decoratePvpTransaction(row, true));
    } catch (err) {
      console.error("PVP transaction load error:", err);
      return [];
    }
  };

  // Mark bid notifications as read
  const markBidNotificationsAsRead = async () => {
    if (!supa || !CURRENT_USER_ID) return;

    try {
      await supa
        .from("notifications")
        .update({ is_read: true })
        .eq("user_id", CURRENT_USER_ID)
        .eq("is_read", false);
    } catch (err) {
      console.warn("Failed to mark notifications as read:", err);
    }
  };

  const subscribeRealtime = () => {
    if (!supa || !CURRENT_USER_ID) return;

    // Subscribe to transaction notifications (sales)
    realtimeChannel = supa
      .channel(`p2p-sell-${CURRENT_USER_ID}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "transactions",
          filter: `user_id=eq.${CURRENT_USER_ID}`,
        },
        async (payload) => {
          if (!payload.new) return;

          if (payload.new.type === "p2p_sell") {
            const decorated = decorateNotification(payload.new, true);
            const [withName] = await fetchBuyerNames([decorated]);
            notifications.unshift(withName);
          } else if (payload.new.type === "pvp_win_pending") {
            const decorated = decoratePvpTransaction(payload.new, true);
            notifications.unshift(decorated);
          } else {
            return;
          }
          if (notifications.length > 120) notifications.pop();
          renderAll();
        },
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") setConnection("live");
      });

    // Subscribe to bid notifications
    bidRealtimeChannel = supa
      .channel(`bid-notifs-${CURRENT_USER_ID}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${CURRENT_USER_ID}`,
        },
        async (payload) => {
          if (!payload.new) return;

          const isBid = BID_NOTIFICATION_TYPES.includes(payload.new.type);
          const isPvp = PVP_NOTIFICATION_TYPES.includes(payload.new.type);
          if (!isBid && !isPvp) return;

          const decorated = isBid
            ? decorateBidNotification(payload.new, true)
            : decoratePvpNotification(payload.new, true);
          notifications.unshift(decorated);
          if (notifications.length > 120) notifications.pop();
          renderAll();

          // Show browser notification if supported
          if (Notification.permission === "granted") {
            const notifTitle = decorated.isBidNotification
              ? getBidNotificationTitle(decorated)
              : decorated.isPvpNotification
                ? "PVP Victory"
                : "Notification";
            new Notification(notifTitle, {
              body: decorated.message,
              icon: decorated.pokemon_sprite || "/imgs/pokeball-bg.jpg",
            });
          }
        },
      )
      .subscribe();
  };

  const toggleDropdown = (forceClose = false) => {
    if (!dropdown) return;
    if (forceClose) {
      dropdown.classList.add("d-none");
      return;
    }
    dropdown.classList.toggle("d-none");
  };

  if (bellBtn) {
    bellBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleDropdown();
    });
  }

  document.addEventListener("click", (e) => {
    if (!dropdown || dropdown.classList.contains("d-none")) return;
    if (bellBtn && (bellBtn === e.target || bellBtn.contains(e.target))) {
      return;
    }
    if (!dropdown.contains(e.target)) {
      toggleDropdown(true);
    }
  });

  if (filterAllBtn) {
    const setMode = (mode) => {
      filterMode = mode;
      [filterNewsBtn, filterSalesBtn, filterBidsBtn, filterAllBtn].forEach(
        (btn) => {
          if (!btn) return;
          const active =
            (btn === filterNewsBtn && mode === "news") ||
            (btn === filterSalesBtn && mode === "sales") ||
            (btn === filterBidsBtn && mode === "bids") ||
            (btn === filterAllBtn && mode === "all");
          btn.classList.toggle("active", active);
        },
      );
      renderList();
    };

    if (filterNewsBtn)
      filterNewsBtn.addEventListener("click", () => setMode("news"));
    if (filterSalesBtn)
      filterSalesBtn.addEventListener("click", () => setMode("sales"));
    if (filterBidsBtn)
      filterBidsBtn.addEventListener("click", () => setMode("bids"));
    filterAllBtn.addEventListener("click", () => setMode("all"));

    setMode("all");
  }

  await loadInitial();

  // PVP claim handler - claims PKCHP from on-chain escrow contract
  if (notifListEl) {
    notifListEl.addEventListener("click", async (event) => {
      const claimBtn = event.target.closest(".pvp-claim-btn");
      if (!claimBtn) return;

      const notifId = claimBtn.dataset.notifId;
      const roomCode = claimBtn.dataset.roomCode;

      // Check if already claimed
      if (claimBtn.classList.contains("claimed")) {
        return;
      }

      // Validate room code exists
      if (!roomCode) {
        alert("Room code not found. Cannot claim from escrow.");
        return;
      }

      // Check wallet connection
      if (!window.ethereum) {
        alert("Please connect your wallet (MetaMask) to claim rewards.");
        return;
      }

      claimBtn.disabled = true;
      claimBtn.textContent = "Confirming...";

      try {
        // Find the notification to get the amount
        const notif = notifications.find(
          (n) => String(n.id) === String(notifId),
        );
        const prizeAmount = notif?.amountPkchp || 0;

        if (prizeAmount <= 0) {
          throw new Error("Invalid prize amount");
        }

        const currentWallet = window.CURRENT_WALLET_ADDRESS;
        if (!currentWallet) {
          throw new Error("Wallet address not found. Please reconnect wallet.");
        }

        console.log("[PVP CLAIM] Starting on-chain claim...");
        console.log("   Room code:", roomCode);
        console.log("   Winner wallet:", currentWallet);
        console.log("   Prize amount:", prizeAmount, "PKCHP");

        // First check if escrow is claimable
        claimBtn.textContent = "Checking escrow...";
        const claimCheck = await canClaimEscrow(roomCode);

        if (!claimCheck.ok) {
          throw new Error(claimCheck.reason);
        }

        // Claim prize (auto-confirms winner if needed)
        claimBtn.textContent = claimCheck.needsConfirmation
          ? "Confirm in MetaMask..."
          : "Claiming...";
        console.log("[PVP CLAIM] Calling claimPrize on escrow...");

        await claimEscrowPrize(roomCode);
        console.log("[PVP CLAIM] Prize claimed from escrow!");

        // Step 3: Mark notification as claimed in database
        if (notifId && supa) {
          await supa
            .from("notifications")
            .update({ is_read: true })
            .eq("id", notifId);

          if (notif) {
            notif.isNew = false;
            notif.is_read = true;
          }
        }

        // Update button to show claimed
        claimBtn.textContent = "Claimed";
        claimBtn.classList.add("claimed");

        renderAll();

        // Show success message
        setTimeout(() => {
          alert(
            `Reward claimed!\n\n+${formatAmount(prizeAmount)} PKCHP\n\nThe tokens have been sent to your wallet.`,
          );
        }, 300);

        console.log("[PVP CLAIM] Claim successful!");
      } catch (err) {
        console.error("[PVP CLAIM] Claim failed:", err);
        claimBtn.disabled = false;
        claimBtn.textContent = "Claim";

        let errorMsg = err.message || "Please try again.";

        // Provide user-friendly error messages
        if (errorMsg.includes("Only winner can claim")) {
          errorMsg = "Only the winner can claim the prize.";
        } else if (errorMsg.includes("Battle not complete")) {
          errorMsg = "Battle not finalized yet. Please wait.";
        } else if (
          errorMsg.includes("user rejected") ||
          errorMsg.includes("User denied")
        ) {
          errorMsg = "Transaction rejected. Please try again.";
        } else if (errorMsg.includes("not found on blockchain")) {
          errorMsg =
            "Escrow room not found. Both players must have deposited PKCHP before battle.";
        } else if (errorMsg.includes("Opponent never deposited")) {
          errorMsg =
            "Opponent never deposited to escrow. Cannot claim - escrow was not set up properly.";
        } else if (errorMsg.includes("already been claimed")) {
          errorMsg = "Prize has already been claimed.";
        } else if (errorMsg.includes("cancelled")) {
          errorMsg = "This battle was cancelled.";
        }

        alert("Claim failed: " + errorMsg);
      }
    });
  }

  window.addEventListener("beforeunload", () => {
    if (realtimeChannel) supa.removeChannel(realtimeChannel);
  });
});
