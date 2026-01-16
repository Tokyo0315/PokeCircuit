// Live notifications for P2P sales

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
  const filterAllBtn = document.getElementById("notifFilterAll");

  const bellBtn = document.getElementById("notifBell");
  const dropdown = document.getElementById("notifDropdown");

  let notifications = [];
  let filterMode = "all"; // news | sales | all
  let realtimeChannel = null;
  const buyerCache = new Map();

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
    const category =
      raw.type && raw.type.startsWith("p2p_") ? "sale" : "news";
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
      item.className = "pc-notif-dropdown-item";
      item.innerHTML = `
        <div class="title">${notif.displayName} sold</div>
        <div class="meta">
          ${notif.buyer_name || "Trainer"} - ${notif.shortWallet} - ${
        notif.amountPkchp
      } PKCHP - ${relativeTime(notif.created_at)}
        </div>
      `;
      notifDropdownListEl.appendChild(item);
    });
  };

  const renderHero = () => {
    if (!notifications.length) {
      if (notifHeroSaleEl)
        notifHeroSaleEl.textContent = "Waiting for your first sale...";
      if (notifHeroMetaEl)
        notifHeroMetaEl.textContent = "Stay on this page to get instant alerts.";
      if (notifHeroMeterEl) notifHeroMeterEl.style.width = "0%";
      return;
    }

    const latest = notifications[0];
    const highSale = notifications.reduce(
      (max, n) => Math.max(max, n.amountPkchp || 0),
      0
    );
    const meterWidth = highSale
      ? Math.min(100, Math.max(25, (latest.amountPkchp / highSale) * 100))
      : 100;

    if (notifHeroSaleEl)
      notifHeroSaleEl.textContent = `${latest.displayName} sold for ${formatAmount(
        latest.amountPkchp
      )} PKCHP`;

    if (notifHeroMetaEl)
      notifHeroMetaEl.textContent = `Bought by ${
        latest.buyer_name || "Trainer"
      } (${latest.shortWallet}) - ${relativeTime(latest.created_at)}`;

    if (notifHeroMeterEl) notifHeroMeterEl.style.width = `${meterWidth}%`;
  };

  const renderMetrics = () => {
    const total = notifications.length;
    const latest = notifications[0];
    const highSale = notifications.reduce(
      (max, n) => Math.max(max, n.amountPkchp || 0),
      0
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
      return true;
    });

    if (!filtered.length) {
      notifEmptyEl.classList.remove("d-none");
      return;
    }

    notifEmptyEl.classList.add("d-none");

    filtered.forEach((notif) => {
      const card = document.createElement("div");
      card.className = `notif-card ${notif.isNew ? "new" : ""}`;
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
        notif.amountPkchp
      )} PKCHP</div>
          <div class="notif-meta">
            <span class="time">${relativeTime(notif.created_at)}</span> - P2P sale
          </div>
        </div>
        <div class="notif-chip">${formatAmount(notif.amountPkchp)} PKCHP</div>
      `;

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
          .filter(Boolean)
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
        "Connect your wallet to start receiving live notifications."
      );
      if (loadRetries < 5) {
        loadRetries += 1;
        setTimeout(loadInitial, 1200);
      }
      return;
    }

    try {
      const { data, error } = await supa
        .from("transactions")
        .select("*")
        .eq("user_id", CURRENT_USER_ID)
        .eq("type", "p2p_sell")
        .order("created_at", { ascending: false })
        .limit(60);

      if (error) {
        console.error("Failed to load notifications:", error);
        renderAll();
        return;
      }

      const decorated = (data || []).map((row) => decorateNotification(row, false));
      const withNames = await fetchBuyerNames(decorated);

      notifications = withNames;
      renderAll();
      setConnection("live");
      subscribeRealtime();
    } catch (err) {
      console.error("Notification load error:", err);
    }
  };

  const subscribeRealtime = () => {
    if (!supa || !CURRENT_USER_ID) return;

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
          if (!payload.new || payload.new.type !== "p2p_sell") return;

          const decorated = decorateNotification(payload.new, true);
          const [withName] = await fetchBuyerNames([decorated]);

          notifications.unshift(withName);
          if (notifications.length > 120) notifications.pop();
          renderAll();
        }
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") setConnection("live");
      });
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
    if (
      bellBtn &&
      (bellBtn === e.target || bellBtn.contains(e.target))
    ) {
      return;
    }
    if (!dropdown.contains(e.target)) {
      toggleDropdown(true);
    }
  });

  if (filterAllBtn) {
    const setMode = (mode) => {
      filterMode = mode;
      [filterNewsBtn, filterSalesBtn, filterAllBtn].forEach((btn) => {
        if (!btn) return;
        const active =
          (btn === filterNewsBtn && mode === "news") ||
          (btn === filterSalesBtn && mode === "sales") ||
          (btn === filterAllBtn && mode === "all");
        btn.classList.toggle("active", active);
      });
      renderList();
    };

    if (filterNewsBtn) filterNewsBtn.addEventListener("click", () => setMode("news"));
    if (filterSalesBtn) filterSalesBtn.addEventListener("click", () => setMode("sales"));
    filterAllBtn.addEventListener("click", () => setMode("all"));

    setMode("all");
  }

  await loadInitial();

  window.addEventListener("beforeunload", () => {
    if (realtimeChannel) supa.removeChannel(realtimeChannel);
  });
});






