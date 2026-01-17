// Collection Page - View and manage owned Pokemon

document.addEventListener("DOMContentLoaded", async () => {
  const grid = document.getElementById("collectionGrid");
  const emptyState = document.getElementById("collectionEmpty");
  const filterButtons = document.querySelectorAll(".collection-filter-btn");
  const collectionCountEl = document.getElementById("collectionCount");

  if (!window.supabase || !window.CURRENT_USER_ID) {
    console.error("Supabase or CURRENT_USER_ID missing.");
    return;
  }

  const CURRENT_USER_ID = window.CURRENT_USER_ID;

  let collection = [];
  let pokechipBalance = 0;

  // EXP needed for each level = level * 100
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
      if (!window.ethereum || !window.PKCHP_ADDRESS || !window.PKCHP_ABI)
        return null;

      let wallet =
        localStorage.getItem("CURRENT_WALLET_ADDRESS") ||
        (await window.ethereum.request({ method: "eth_accounts" }))[0];

      if (!wallet) return null;

      const provider = new ethers.BrowserProvider(window.ethereum);
      const contract = new ethers.Contract(
        window.PKCHP_ADDRESS,
        window.PKCHP_ABI,
        provider,
      );

      const raw = await contract.balanceOf(wallet);
      const decimals = await contract.decimals();

      return Math.floor(Number(ethers.formatUnits(raw, decimals)));
    } catch (err) {
      console.warn("loadPkchpRealBalance failed:", err);
      return null;
    }
  }

  async function loadWalletBalance() {
    let balance = await loadPkchpRealBalance();

    if (balance === null) {
      const { data, error } = await supabase
        .from("user_wallet")
        .select("pokechip_balance")
        .eq("user_id", CURRENT_USER_ID)
        .single();

      if (error) {
        console.warn("Wallet missing - creating new 1000 PokeChip fallback");

        const { data: newRow } = await supabase
          .from("user_wallet")
          .insert([{ user_id: CURRENT_USER_ID, pokechip_balance: 1000 }])
          .select()
          .single();

        balance = newRow.pokechip_balance;
      } else {
        balance = data.pokechip_balance;
      }
    }

    document.querySelectorAll(".pc-pokechip-amount").forEach((el) => {
      el.textContent = balance;
    });

    return balance;
  }

  async function loadCollectionFromDB() {
    const { data, error } = await supabase
      .from("user_pokemon")
      .select("*")
      .eq("user_id", CURRENT_USER_ID)
      .order("acquired_at", { ascending: false });

    if (error) {
      console.error("Failed loading user collection:", error);
      return [];
    }

    return data.map((row) => ({
      id: row.id,
      name: row.pokemon_name,
      rarity: row.rarity,
      sprite: row.sprite_url,
      hp: row.hp,
      attack: row.attack,
      defense: row.defense,
      speed: row.speed,
      level: row.level ?? 1,
      exp: row.exp ?? 0,
      acquiredAt: row.acquired_at,
    }));
  }

  function updateEmptyState(list) {
    if (!emptyState) return;
    if (!list || list.length === 0) emptyState.classList.remove("d-none");
    else emptyState.classList.add("d-none");
  }

  function formatDate(iso) {
    const d = new Date(iso);
    return isNaN(d.getTime()) ? "Unknown" : d.toLocaleString();
  }

  async function renderCollection(filter = "all") {
    grid.innerHTML = "";

    const filtered =
      filter === "all"
        ? collection
        : collection.filter(
            (p) => p.rarity && p.rarity.toLowerCase() === filter.toLowerCase(),
          );

    updateEmptyState(filtered);

    if (filtered.length === 0) return;

    for (const entry of filtered) {
      try {
        const p = await fetchPokemon(entry.name);

        const rarityClass = `rarity-${entry.rarity.toLowerCase()}`;
        const typeClass = `type-${(p.types[0] || "normal").toLowerCase()}`;

        const expData = getExpProgress(entry.exp, entry.level);

        const card = document.createElement("div");
        card.className = "col-12 col-sm-6 col-md-4 col-lg-3";

        card.innerHTML = `
  <div class="pokemon-card-tcg">
    <div class="rarity-badge ${rarityClass}">${entry.rarity}</div>

    <div class="pokemon-card-inner ${typeClass}">
      <div class="level-badge">Lv. ${entry.level}</div>
      <div class="dex-number">#${p.id}</div>

      <img src="${entry.sprite}" class="pokemon-img">

      <h3 class="pokemon-name">${entry.name.toUpperCase()}</h3>
      <p class="pokemon-types">${p.types.join(", ")}</p>

      <div class="stats-box">
        <div class="stat"><span>HP</span> ${entry.hp}</div>
        <div class="stat"><span>ATK</span> ${entry.attack}</div>
        <div class="stat"><span>DEF</span> ${entry.defense}</div>
        <div class="stat"><span>SPD</span> ${entry.speed}</div>
      </div>

      <div class="exp-container">
        <div class="exp-label">EXP: ${expData.current} / ${expData.needed}</div>
        <div class="exp-bar-container">
          <div class="exp-bar-fill" style="width: ${expData.percentage}%"></div>
        </div>
      </div>

      <div class="collection-price">Owned</div>
      <div class="collection-time">Acquired: ${formatDate(
        entry.acquiredAt,
      )}</div>

      <button class="btn btn-sm btn-warning mt-2 sell-btn"
        data-id="${entry.id}"
        data-name="${entry.name}"
        data-rarity="${entry.rarity}"
        data-sprite="${entry.sprite}"
        data-hp="${entry.hp}"
        data-attack="${entry.attack}"
        data-defense="${entry.defense}"
        data-speed="${entry.speed}"
        data-level="${entry.level}"
        data-exp="${entry.exp}">
        Sell
      </button>
    </div>
  </div>
`;

        grid.appendChild(card);
      } catch (err) {
        console.error("Error rendering Pokemon:", entry.name, err);
      }
    }
  }

  filterButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      filterButtons.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");

      renderCollection(btn.dataset.filter);
    });
  });

  async function refreshAll() {
    pokechipBalance = await loadWalletBalance();
    collection = await loadCollectionFromDB();

    if (collectionCountEl) collectionCountEl.textContent = collection.length;

    const activeFilter =
      document.querySelector(".collection-filter-btn.active")?.dataset.filter ||
      "all";

    renderCollection(activeFilter);
  }

  window.addEventListener("focus", refreshAll);

  await refreshAll();

  // Sell modal elements
  const sellModalBackdrop = document.getElementById("sellModalBackdrop");
  const sellModalSprite = document.getElementById("sellModalSprite");
  const sellModalName = document.getElementById("sellModalName");
  const sellModalRarity = document.getElementById("sellModalRarity");
  const sellModalPrice = document.getElementById("sellModalPrice");
  const sellModalStartingBid = document.getElementById("sellModalStartingBid");
  const sellModalClose = document.getElementById("sellModalClose");
  const sellModalCancel = document.getElementById("sellModalCancel");
  const sellModalConfirm = document.getElementById("sellModalConfirm");
  const processingBackdrop = document.getElementById(
    "collectionProcessingModalBackdrop",
  );
  const processingStatus = document.getElementById(
    "collectionProcessingStatus",
  );
  const processingSub = document.getElementById("collectionProcessingSub");

  let selectedPokemonForSale = null;
  let isListingProcessing = false;
  const blockUnload = (e) => {
    e.preventDefault();
    e.returnValue = "";
  };

  const showListingProcessing = (statusText, subText) => {
    isListingProcessing = true;
    if (statusText && processingStatus)
      processingStatus.textContent = statusText;
    if (subText && processingSub) processingSub.textContent = subText;
    processingBackdrop?.classList.remove("d-none");
    window.addEventListener("beforeunload", blockUnload);
  };

  const updateListingProcessing = (statusText, subText) => {
    if (statusText && processingStatus)
      processingStatus.textContent = statusText;
    if (subText && processingSub) processingSub.textContent = subText;
  };

  const hideListingProcessing = () => {
    processingBackdrop?.classList.add("d-none");
    window.removeEventListener("beforeunload", blockUnload);
    isListingProcessing = false;
  };

  grid.addEventListener("click", (e) => {
    const btn = e.target.closest(".sell-btn");
    if (!btn) return;

    selectedPokemonForSale = {
      id: btn.dataset.id,
      name: btn.dataset.name,
      rarity: btn.dataset.rarity,
      sprite: btn.dataset.sprite,
      hp: Number(btn.dataset.hp),
      attack: Number(btn.dataset.attack),
      defense: Number(btn.dataset.defense),
      speed: Number(btn.dataset.speed),
      level: Number(btn.dataset.level || 1),
      exp: Number(btn.dataset.exp || 0),
    };

    sellModalSprite.src = selectedPokemonForSale.sprite;
    sellModalName.textContent = selectedPokemonForSale.name;
    sellModalRarity.textContent = selectedPokemonForSale.rarity;

    // Reset form fields
    if (sellModalPrice) sellModalPrice.value = "";
    if (sellModalStartingBid) sellModalStartingBid.value = "";

    sellModalBackdrop.classList.remove("d-none");
  });

  function closeSellModal() {
    sellModalBackdrop.classList.add("d-none");
    selectedPokemonForSale = null;
    if (sellModalPrice) sellModalPrice.value = "";
    if (sellModalStartingBid) sellModalStartingBid.value = "";
  }

  sellModalClose.onclick = closeSellModal;
  sellModalCancel.onclick = closeSellModal;

  sellModalBackdrop.addEventListener("click", (e) => {
    if (e.target === sellModalBackdrop) closeSellModal();
  });

  // Escrow contract configuration
  const P2P_ESCROW_ADDRESS = "0xDc929a5fF3fF20139B3e19668F19b04Abc7E1E96";
  const P2P_ESCROW_ABI = [
    {
      inputs: [
        { internalType: "bytes32", name: "listingId", type: "bytes32" },
        { internalType: "uint256", name: "startingBid", type: "uint256" },
        { internalType: "uint256", name: "buyNowPrice", type: "uint256" },
      ],
      name: "createListing",
      outputs: [],
      stateMutability: "nonpayable",
      type: "function",
    },
  ];

  const PKCHP_ADDRESS = "0xe53613104B5e271Af4226F6867fBb595c1aE8d26";
  const PKCHP_ABI = [
    {
      inputs: [],
      name: "decimals",
      outputs: [{ internalType: "uint8", name: "", type: "uint8" }],
      stateMutability: "view",
      type: "function",
    },
  ];

  function uuidToBytes32(uuid) {
    return ethers.keccak256(ethers.toUtf8Bytes(uuid));
  }

  async function createEscrowListing(listingId, startingBid, buyNowPrice) {
    if (!window.ethereum) throw new Error("MetaMask not available");

    const provider = new ethers.BrowserProvider(window.ethereum);
    const signer = await provider.getSigner();

    // Get PKCHP decimals
    const pkchp = new ethers.Contract(PKCHP_ADDRESS, PKCHP_ABI, provider);
    const decimals = await pkchp.decimals();

    // Convert to wei
    const startingBidWei = ethers.parseUnits(String(startingBid), decimals);
    const buyNowPriceWei = ethers.parseUnits(String(buyNowPrice), decimals);
    const listingBytes32 = uuidToBytes32(listingId);

    // Create listing on escrow contract
    const escrow = new ethers.Contract(
      P2P_ESCROW_ADDRESS,
      P2P_ESCROW_ABI,
      signer,
    );
    const tx = await escrow.createListing(
      listingBytes32,
      startingBidWei,
      buyNowPriceWei,
    );
    await tx.wait();

    console.log("Escrow listing created on-chain:", listingId);
  }

  sellModalConfirm.addEventListener("click", async () => {
    if (!selectedPokemonForSale) return;

    const price = Number(sellModalPrice.value);

    if (!price || price <= 0) {
      alert("Enter a valid PKCHP price.");
      return;
    }

    // Get starting bid value (0 or empty means no bidding)
    const startingBid = sellModalStartingBid
      ? Number(sellModalStartingBid.value) || 0
      : 0;
    const allowBidding = startingBid > 0;

    // Validate starting bid is less than buy now price
    if (allowBidding && startingBid >= price) {
      alert("Starting bid must be less than the Buy Now price.");
      return;
    }

    showListingProcessing(
      "Posting your listing...",
      "Keep this tab open while we move your Pokemon to P2P.",
    );

    try {
      // First, insert the listing to get the UUID
      const { data: listingData, error: listError } = await supabase
        .from("p2p_listings")
        .insert([
          {
            user_id: CURRENT_USER_ID,
            seller_id: CURRENT_USER_ID,
            seller_wallet: window.CURRENT_WALLET_ADDRESS,
            pokemon_name: selectedPokemonForSale.name,
            rarity: selectedPokemonForSale.rarity,
            sprite_url: selectedPokemonForSale.sprite,
            hp: selectedPokemonForSale.hp,
            attack: selectedPokemonForSale.attack,
            defense: selectedPokemonForSale.defense,
            speed: selectedPokemonForSale.speed,
            level: selectedPokemonForSale.level,
            exp: selectedPokemonForSale.exp,
            price_pkchp: price,
            starting_bid: startingBid,
            highest_bid: 0,
            highest_bidder_id: null,
            highest_bidder_wallet: null,
            allow_bidding: allowBidding,
            status: "listed",
            listed_at: new Date().toISOString(),
          },
        ])
        .select()
        .single();

      if (listError) {
        console.error("Listing failed:", listError);
        throw new Error(listError.message || "Cannot list Pokemon.");
      }

      // If bidding is enabled, create the listing on the escrow contract
      if (allowBidding && listingData) {
        updateListingProcessing(
          "Creating on-chain escrow listing...",
          "Please confirm in MetaMask...",
        );

        try {
          await createEscrowListing(listingData.id, startingBid, price);
        } catch (escrowErr) {
          console.error("Escrow creation failed:", escrowErr);
          // Delete the database listing since escrow failed
          await supabase.from("p2p_listings").delete().eq("id", listingData.id);
          throw new Error(
            "Failed to create on-chain escrow. Listing cancelled.",
          );
        }
      }

      updateListingProcessing(
        "Logging and removing from Collection...",
        "Almost done.",
      );

      if (window.logP2PList) {
        await window.logP2PList(selectedPokemonForSale, price);
      }

      await supabase
        .from("user_pokemon")
        .delete()
        .eq("id", selectedPokemonForSale.id);

      hideListingProcessing();
      closeSellModal();
      window.location.reload();
    } catch (err) {
      console.error("Listing failed:", err);
      hideListingProcessing();
      alert(
        "Cannot list this Pokemon right now.\n\n" +
          (err?.message || "Please try again."),
      );
    }
  });
});
