// P2P trading: player listings, purchases, and cancellations

document.addEventListener("DOMContentLoaded", async () => {
  if (!window.supabase) {
    console.error("Supabase not loaded on P2P page.");
    return;
  }

  const CURRENT_USER_ID = window.CURRENT_USER_ID || null;
  const grid = document.getElementById("p2pGrid");

  if (!grid) {
    console.warn("p2pGrid not found on page.");
    return;
  }

  let pkchpBalance = 0;
  let currentListings = [];
  let pendingListing = null;

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

  async function loadPkchpRealBalance() {
    try {
      if (!window.ethereum || !window.PKCHP_ADDRESS || !window.PKCHP_ABI) {
        return null;
      }

      let wallet =
        localStorage.getItem("CURRENT_WALLET_ADDRESS") ||
        (window.ethereum && window.ethereum.selectedAddress) ||
        null;

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
      const floatBal = Number(ethers.formatUnits(rawBal, decimals));

      return Math.floor(floatBal);
    } catch (err) {
      console.warn("PKCHP on-chain load failed (P2P):", err);
      return null;
    }
  }

  function updateNavbarPokechip() {
    document.querySelectorAll(".pc-pokechip-amount").forEach((el) => {
      el.textContent = pkchpBalance;
    });
  }

  async function loadWalletBalance() {
    const real = await loadPkchpRealBalance();

    if (real !== null) {
      pkchpBalance = real;
      updateNavbarPokechip();
      return;
    }

    if (!CURRENT_USER_ID) return;

    const { data, error } = await supabase
      .from("user_wallet")
      .select("pokechip_balance")
      .eq("user_id", CURRENT_USER_ID)
      .single();

    if (error) {
      console.warn("No Supabase wallet found, default 1000 PokeChip.", error);
      pkchpBalance = 1000;
    } else {
      pkchpBalance = data.pokechip_balance;
    }

    updateNavbarPokechip();
  }

  async function loadListings() {
    const { data, error } = await supabase
      .from("p2p_listings")
      .select("*")
      .eq("status", "listed")
      .order("listed_at", { ascending: false });

    if (error) {
      console.error("Error loading P2P listings:", error);
      return;
    }

    currentListings = data || [];
    await renderListings();
  }

  function shortAddress(addr) {
    if (!addr) return "Unknown";
    return addr.slice(0, 6) + "..." + addr.slice(-4);
  }

  async function renderListings() {
    grid.innerHTML = "";

    if (!currentListings.length) {
      grid.innerHTML =
        '<p class="text-center text-muted mt-5">No listings available</p>';
      return;
    }

    for (const listing of currentListings) {
      try {
        const card = document.createElement("div");
        card.className = "col-12 col-sm-6 col-md-4 col-lg-3";

        const p = await fetchPokemon(listing.pokemon_name);

        const rarityClass = `rarity-${(
          listing.rarity || "Common"
        ).toLowerCase()}`;
        const typeClass = `type-${(p.types[0] || "normal").toLowerCase()}`;

        const hp =
          listing.hp !== null && listing.hp !== undefined ? listing.hp : p.hp;
        const attack =
          listing.attack !== null && listing.attack !== undefined
            ? listing.attack
            : p.attack;
        const defense =
          listing.defense !== null && listing.defense !== undefined
            ? listing.defense
            : p.defense;
        const speed =
          listing.speed !== null && listing.speed !== undefined
            ? listing.speed
            : p.speed;
        const level = listing.level || 1;
        const exp = listing.exp || 0;

        const expData = getExpProgress(exp, level);

        card.innerHTML = `
  <div class="pokemon-card-tcg">
    <div class="rarity-badge ${rarityClass}">
      ${listing.rarity}
    </div>

    <div class="pokemon-card-inner ${typeClass}">
      <div class="level-badge">Lv. ${level}</div>
      <div class="dex-number">#${p.id}</div>

      <img
        src="${listing.sprite_url || p.sprite}"
        class="pokemon-img"
        alt="${listing.pokemon_name}"
      >

      <h3 class="pokemon-name">${listing.pokemon_name.toUpperCase()}</h3>

      <p class="pokemon-types">${p.types.join(", ")}</p>

      <div class="stats-box">
        <div class="stat"><span>HP</span> ${hp}</div>
        <div class="stat"><span>ATK</span> ${attack}</div>
        <div class="stat"><span>DEF</span> ${defense}</div>
        <div class="stat"><span>SPD</span> ${speed}</div>
      </div>

      <div class="exp-container">
        <div class="exp-label">EXP: ${expData.current} / ${expData.needed}</div>
        <div class="exp-bar-container">
          <div class="exp-bar-fill" style="width: ${expData.percentage}%"></div>
        </div>
      </div>

      <div class="collection-price">
        ◎ Price: ${listing.price_pkchp} PKCHP
      </div>

      <div class="collection-time">
        Seller: ${shortAddress(listing.seller_wallet)}
      </div>

${
  listing.seller_id !== CURRENT_USER_ID
    ? `
  <button
    class="btn btn-sm btn-warning buy-p2p-btn mt-2"
    data-listing-id="${listing.id}"
    data-price="${listing.price_pkchp}"
  >
    Buy for ${listing.price_pkchp} PKCHP
  </button>
`
    : `
  <button
    class="btn btn-sm btn-danger cancel-p2p-btn mt-2"
    data-listing-id="${listing.id}"
  >
    Cancel Listing
  </button>
`
}

    </div>
  </div>
`;

        grid.appendChild(card);
      } catch (err) {
        console.error("Error rendering listing:", listing.pokemon_name, err);
      }
    }
  }

  // Cancel-listing modal elements
  const messageModalBackdrop = document.getElementById(
    "p2pMessageModalBackdrop"
  );
  const messageModalText = document.getElementById("p2pMessageModalText");
  const messageModalClose = document.getElementById("p2pMessageModalClose");
  const messageModalOk = document.getElementById("p2pMessageModalOk");

  const closeMessageModal = () => {
    messageModalBackdrop?.classList.add("d-none");
  };

  const openMessageModal = (message) => {
    if (messageModalText) messageModalText.textContent = message;
    messageModalBackdrop?.classList.remove("d-none");
  };

  if (messageModalClose) {
    messageModalClose.addEventListener("click", closeMessageModal);
  }
  if (messageModalOk) messageModalOk.addEventListener("click", closeMessageModal);
  if (messageModalBackdrop) {
    messageModalBackdrop.addEventListener("click", (e) => {
      if (e.target === messageModalBackdrop) closeMessageModal();
    });
  }

  grid.addEventListener("click", async (e) => {
    const btn = e.target.closest(".cancel-p2p-btn");
    if (!btn) return;

    const listingId = btn.dataset.listingId;
    const listing = currentListings.find((l) => l.id === listingId);

    if (!listing) {
      alert("Listing not found.");
      return;
    }

    const { error: insertError } = await supabase.from("user_pokemon").insert([
      {
        user_id: listing.seller_id,
        pokemon_name: listing.pokemon_name,
        rarity: listing.rarity,
        sprite_url: listing.sprite_url,
        hp: listing.hp,
        attack: listing.attack,
        defense: listing.defense,
        speed: listing.speed,
        level: listing.level || 1,
        exp: listing.exp || 0,
        acquired_at: new Date().toISOString(),
      },
    ]);

    if (insertError) {
      console.error(insertError);
      alert("Failed to return Pokémon to your collection.");
      return;
    }

    const { error: deleteError } = await supabase
      .from("p2p_listings")
      .delete()
      .eq("id", listingId);

    if (deleteError) {
      console.error(deleteError);
      alert("Failed to cancel listing.");
      return;
    }

    await loadListings();
    if (window.logP2PDelist) {
      await window.logP2PDelist(listing);
    }
    openMessageModal("Your Pokemon is back to your Collection.");
  });

  // Buy modal elements
  const buyModalBackdrop = document.getElementById("p2pBuyModalBackdrop");
  const buyModalSprite = document.getElementById("p2pBuyModalSprite");
  const buyModalName = document.getElementById("p2pBuyModalName");
  const buyModalRarity = document.getElementById("p2pBuyModalRarity");
  const buyModalPriceValue = document.getElementById("p2pBuyModalPriceValue");
  const buyModalBalance = document.getElementById("p2pBuyModalBalance");
  const buyModalSellerWallet = document.getElementById(
    "p2pBuyModalSellerWallet"
  );
  const buyModalClose = document.getElementById("p2pBuyModalClose");
  const buyModalCancel = document.getElementById("p2pBuyModalCancel");
  const buyModalConfirm = document.getElementById("p2pBuyModalConfirm");
  const processingModalBackdrop = document.getElementById(
    "p2pProcessingModalBackdrop"
  );
  const processingStatus = document.getElementById("p2pProcessingStatus");
  const processingSub = document.getElementById("p2pProcessingSub");
  let isProcessingPurchase = false;
  const blockUnload = (e) => {
    e.preventDefault();
    e.returnValue = "";
  };

  function openBuyModal(listing) {
    pendingListing = listing;

    const price =
      listing.price_pkchp != null ? listing.price_pkchp : listing.price || 0;

    buyModalSprite.src = listing.sprite_url;
    buyModalName.textContent = listing.pokemon_name;
    buyModalRarity.textContent = listing.rarity;
    buyModalPriceValue.textContent = price;
    buyModalBalance.textContent = pkchpBalance;
    buyModalSellerWallet.textContent =
      listing.seller_wallet || "(no wallet stored)";

    buyModalBackdrop.classList.remove("d-none");
  }

  function closeBuyModal() {
    if (isProcessingPurchase) return;
    buyModalBackdrop.classList.add("d-none");
  }

  function showProcessing(statusText, subText) {
    isProcessingPurchase = true;
    if (statusText && processingStatus) processingStatus.textContent = statusText;
    if (subText && processingSub) processingSub.textContent = subText;
    processingModalBackdrop?.classList.remove("d-none");
    window.addEventListener("beforeunload", blockUnload);
  }

  function updateProcessing(statusText, subText) {
    if (statusText && processingStatus) processingStatus.textContent = statusText;
    if (subText && processingSub) processingSub.textContent = subText;
  }

  function hideProcessing() {
    processingModalBackdrop?.classList.add("d-none");
    window.removeEventListener("beforeunload", blockUnload);
    isProcessingPurchase = false;
  }

  if (buyModalClose) buyModalClose.onclick = closeBuyModal;
  if (buyModalCancel) buyModalCancel.onclick = closeBuyModal;

  if (buyModalBackdrop) {
    buyModalBackdrop.addEventListener("click", (e) => {
      if (e.target === buyModalBackdrop) closeBuyModal();
    });
  }

  grid.addEventListener("click", (e) => {
    const btn = e.target.closest(".buy-p2p-btn");
    if (!btn) return;

    const listingId = btn.dataset.listingId;
    const listing = currentListings.find((l) => String(l.id) === listingId);
    if (!listing) return;

    openBuyModal(listing);
  });

  async function paySellerOnChain(listing) {
    if (!window.ethereum || !window.PKCHP_ADDRESS || !window.PKCHP_ABI) {
      throw new Error("PKCHP token config not found on P2P page.");
    }

    const price =
      listing.price_pkchp != null ? listing.price_pkchp : listing.price || 0;

    const provider = new ethers.BrowserProvider(window.ethereum);
    const signer = await provider.getSigner();
    const contract = new ethers.Contract(
      window.PKCHP_ADDRESS,
      window.PKCHP_ABI,
      signer
    );

    const decimals = await contract.decimals();
    const amount = BigInt(price) * 10n ** BigInt(decimals);

    const seller = listing.seller_wallet;
    if (!seller) {
      throw new Error("Listing has no seller_wallet.");
    }

    const buyerAddress = await signer.getAddress();
    const rawBal = await contract.balanceOf(buyerAddress);
    if (rawBal < amount) {
      throw new Error("Not enough PKCHP in wallet.");
    }

    const tx = await contract.transfer(seller, amount);
    console.log("P2P PKCHP transfer tx:", tx.hash);
    await tx.wait();
    console.log("P2P PKCHP transfer confirmed.");
  }

  if (buyModalConfirm) {
    buyModalConfirm.addEventListener("click", async () => {
      if (!pendingListing) return;

      const price =
        pendingListing.price_pkchp != null
          ? pendingListing.price_pkchp
          : pendingListing.price || 0;

      if (pkchpBalance < price) {
        alert("Not enough PKCHP.");
        return;
      }

      showProcessing(
        "Processing payment...",
        "Keep this tab open until the trade completes."
      );

      try {
        await paySellerOnChain(pendingListing);

        const newBal = await loadPkchpRealBalance();
        if (newBal !== null) {
          pkchpBalance = newBal;
          updateNavbarPokechip();
        }

        if (!CURRENT_USER_ID) {
          throw new Error("No CURRENT_USER_ID set for buyer.");
        }

        updateProcessing(
          "Adding Pokemon to your Collection...",
          "Saving purchase to your account."
        );

        const { error: insertError } = await supabase
          .from("user_pokemon")
          .insert([
            {
              user_id: CURRENT_USER_ID,
              pokemon_name: pendingListing.pokemon_name,
              rarity: pendingListing.rarity,
              sprite_url: pendingListing.sprite_url,
              hp: pendingListing.hp,
              attack: pendingListing.attack,
              defense: pendingListing.defense,
              speed: pendingListing.speed,
              level: pendingListing.level || 1,
              exp: pendingListing.exp || 0,
              acquired_at: new Date().toISOString(),
            },
          ]);

        if (insertError) {
          console.error("Error inserting into user_pokemon:", insertError);
          throw new Error("Failed to add PokAcmon to your collection.");
        }

        updateProcessing(
          "Finalizing trade...",
          "Cleaning up listing and logging the transaction."
        );

        const buyerWallet =
          window.CURRENT_WALLET_ADDRESS ||
          localStorage.getItem("CURRENT_WALLET_ADDRESS") ||
          null;

        const { error: sellerTxError } = await supabase
          .from("transactions")
          .insert([
            {
              user_id: pendingListing.seller_id,
              wallet_address: pendingListing.seller_wallet,
              status: "success",
              type: "p2p_sell",
              pokemon_name: pendingListing.pokemon_name,
              pokemon_rarity: pendingListing.rarity,
              pokemon_sprite: pendingListing.sprite_url,
              pokemon_level: pendingListing.level || 1,
              amount: price,
              currency: "PKCHP",
              counterparty_wallet: buyerWallet,
              created_at: new Date().toISOString(),
            },
          ]);

        if (sellerTxError) {
          console.warn("Seller transaction log failed:", sellerTxError);
        }

        const { error: deleteError } = await supabase
          .from("p2p_listings")
          .delete()
          .eq("id", pendingListing.id);

        if (deleteError) {
          console.error("Error deleting listing:", deleteError);
          throw new Error("Failed to remove listing after purchase.");
        }

        closeBuyModal();
        await loadListings();
        if (window.logP2PBuy) {
          await window.logP2PBuy(
            pendingListing,
            price,
            pendingListing.seller_wallet
          );
        }
        hideProcessing();
        window.location.href = "collection.html";
      } catch (err) {
        console.error("P2P purchase failed:", err);
        hideProcessing();
        alert("Purchase failed:\n\n" + (err?.message || err || "Unknown error"));
      }
    });
  }

  let refreshTimer = null;

  const scheduleRefresh = () => {
    if (refreshTimer) clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => {
      loadListings();
    }, 400);
  };

  const subscribeListingChanges = () => {
    if (!window.supabase) return;

    supabase
      .channel("p2p-listings-live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "p2p_listings" },
        () => {
          scheduleRefresh();
        }
      )
      .subscribe();
  };

  await loadWalletBalance();
  await loadListings();
  subscribeListingChanges();
});
