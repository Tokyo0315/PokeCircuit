// P2P trading: player listings, purchases, bidding (ON-CHAIN via MetaMask), and cancellations

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

  // ============================================
  // CONTRACT CONFIGURATION (ON-CHAIN BIDDING)
  // ============================================

  const P2P_ESCROW_ADDRESS = "0xDc929a5fF3fF20139B3e19668F19b04Abc7E1E96";
  const PKCHP_ADDRESS = "0xe53613104B5e271Af4226F6867fBb595c1aE8d26";

  // P2P Escrow ABI
  const P2P_ESCROW_ABI = [
    {
      inputs: [{ internalType: "bytes32", name: "listingId", type: "bytes32" }],
      name: "getListing",
      outputs: [
        { internalType: "address", name: "seller", type: "address" },
        { internalType: "uint256", name: "startingBid", type: "uint256" },
        { internalType: "uint256", name: "buyNowPrice", type: "uint256" },
        { internalType: "bool", name: "active", type: "bool" },
        { internalType: "address", name: "highestBidder", type: "address" },
        { internalType: "uint256", name: "highestBid", type: "uint256" },
      ],
      stateMutability: "view",
      type: "function",
    },
    {
      inputs: [
        { internalType: "bytes32", name: "listingId", type: "bytes32" },
        { internalType: "address", name: "bidder", type: "address" },
      ],
      name: "getBid",
      outputs: [
        { internalType: "uint256", name: "amount", type: "uint256" },
        { internalType: "bool", name: "active", type: "bool" },
        { internalType: "uint256", name: "timestamp", type: "uint256" },
      ],
      stateMutability: "view",
      type: "function",
    },
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
    {
      inputs: [
        { internalType: "bytes32", name: "listingId", type: "bytes32" },
        { internalType: "uint256", name: "amount", type: "uint256" },
      ],
      name: "placeBid",
      outputs: [],
      stateMutability: "nonpayable",
      type: "function",
    },
    {
      inputs: [{ internalType: "bytes32", name: "listingId", type: "bytes32" }],
      name: "cancelBid",
      outputs: [],
      stateMutability: "nonpayable",
      type: "function",
    },
    {
      inputs: [{ internalType: "bytes32", name: "listingId", type: "bytes32" }],
      name: "acceptBid",
      outputs: [],
      stateMutability: "nonpayable",
      type: "function",
    },
    {
      inputs: [{ internalType: "bytes32", name: "listingId", type: "bytes32" }],
      name: "cancelListing",
      outputs: [],
      stateMutability: "nonpayable",
      type: "function",
    },
    {
      inputs: [{ internalType: "bytes32", name: "listingId", type: "bytes32" }],
      name: "buyNow",
      outputs: [],
      stateMutability: "nonpayable",
      type: "function",
    },
  ];

  // PKCHP Token ABI
  const PKCHP_ABI = [
    {
      inputs: [{ internalType: "address", name: "account", type: "address" }],
      name: "balanceOf",
      outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
      stateMutability: "view",
      type: "function",
    },
    {
      inputs: [],
      name: "decimals",
      outputs: [{ internalType: "uint8", name: "", type: "uint8" }],
      stateMutability: "view",
      type: "function",
    },
    {
      inputs: [
        { internalType: "address", name: "spender", type: "address" },
        { internalType: "uint256", name: "amount", type: "uint256" },
      ],
      name: "approve",
      outputs: [{ internalType: "bool", name: "", type: "bool" }],
      stateMutability: "nonpayable",
      type: "function",
    },
    {
      inputs: [
        { internalType: "address", name: "owner", type: "address" },
        { internalType: "address", name: "spender", type: "address" },
      ],
      name: "allowance",
      outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
      stateMutability: "view",
      type: "function",
    },
    {
      inputs: [
        { internalType: "address", name: "to", type: "address" },
        { internalType: "uint256", name: "amount", type: "uint256" },
      ],
      name: "transfer",
      outputs: [{ internalType: "bool", name: "", type: "bool" }],
      stateMutability: "nonpayable",
      type: "function",
    },
  ];

  window.PKCHP_ADDRESS = PKCHP_ADDRESS;
  window.PKCHP_ABI = PKCHP_ABI;
  window.P2P_ESCROW_ADDRESS = P2P_ESCROW_ADDRESS;
  window.P2P_ESCROW_ABI = P2P_ESCROW_ABI;

  let pkchpBalance = 0;
  let currentListings = [];
  let pendingListing = null;
  let pendingBidListing = null;
  let pendingAcceptBid = null;
  let myActiveBids = [];

  // ============================================
  // UTILITY FUNCTIONS
  // ============================================

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

  function shortAddress(addr) {
    if (!addr) return "Unknown";
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  }

  function relativeTime(iso) {
    const date = new Date(iso);
    const now = new Date();
    const diff = Math.floor((now - date) / 1000);
    if (diff < 60) return "Just now";
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
    return date.toLocaleDateString();
  }

  function uuidToBytes32(uuid) {
    return ethers.keccak256(ethers.toUtf8Bytes(uuid));
  }

  // ============================================
  // CONTRACT HELPERS
  // ============================================

  async function getEscrowContract(withSigner = false) {
    if (!window.ethereum) throw new Error("MetaMask not available");
    const provider = new ethers.BrowserProvider(window.ethereum);
    if (withSigner) {
      const signer = await provider.getSigner();
      return new ethers.Contract(P2P_ESCROW_ADDRESS, P2P_ESCROW_ABI, signer);
    }
    return new ethers.Contract(P2P_ESCROW_ADDRESS, P2P_ESCROW_ABI, provider);
  }

  async function getPkchpContract(withSigner = false) {
    if (!window.ethereum) throw new Error("MetaMask not available");
    const provider = new ethers.BrowserProvider(window.ethereum);
    if (withSigner) {
      const signer = await provider.getSigner();
      return new ethers.Contract(PKCHP_ADDRESS, PKCHP_ABI, signer);
    }
    return new ethers.Contract(PKCHP_ADDRESS, PKCHP_ABI, provider);
  }

  async function ensureAllowance(amount) {
    const pkchp = await getPkchpContract(true);
    const decimals = await pkchp.decimals();
    const amountWei = ethers.parseUnits(String(amount), decimals);
    const signer = await pkchp.runner.provider.getSigner();
    const wallet = await signer.getAddress();
    const currentAllowance = await pkchp.allowance(wallet, P2P_ESCROW_ADDRESS);

    if (currentAllowance < amountWei) {
      console.log("Approving PKCHP for escrow contract...");
      const tx = await pkchp.approve(P2P_ESCROW_ADDRESS, ethers.MaxUint256);
      await tx.wait();
      console.log("Approval confirmed");
    }
  }

  // ============================================
  // BALANCE LOADING
  // ============================================

  async function loadPkchpRealBalance() {
    try {
      if (!window.ethereum) return 0;
      let wallet =
        localStorage.getItem("CURRENT_WALLET_ADDRESS") ||
        window.ethereum.selectedAddress;
      if (!wallet) {
        const accounts = await window.ethereum.request({
          method: "eth_accounts",
        });
        wallet = accounts && accounts.length ? accounts[0] : null;
      }
      if (!wallet) return 0;

      const pkchp = await getPkchpContract();
      const rawBal = await pkchp.balanceOf(wallet);
      const decimals = await pkchp.decimals();
      return Math.floor(Number(ethers.formatUnits(rawBal, decimals)));
    } catch (err) {
      console.warn("PKCHP load failed:", err);
      return 0;
    }
  }

  function updateNavbarPokechip() {
    document.querySelectorAll(".pc-pokechip-amount").forEach((el) => {
      el.textContent = pkchpBalance.toLocaleString();
    });
  }

  async function loadWalletBalance() {
    pkchpBalance = await loadPkchpRealBalance();
    updateNavbarPokechip();
    console.log("[BALANCE] On-chain PKCHP:", pkchpBalance);
  }

  // ============================================
  // LISTINGS LOADING
  // ============================================

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

    if (currentListings.length === 0) {
      grid.innerHTML =
        '<p class="text-center text-muted mt-5">No listings available</p>';
      return;
    }

    grid.innerHTML = "";

    for (const listing of currentListings) {
      try {
        const p = await fetchPokemon(listing.pokemon_name);
        const rarityClass = `rarity-${(listing.rarity || "Common").toLowerCase()}`;
        const hp = listing.hp ?? p.hp;
        const attack = listing.attack ?? p.attack;
        const defense = listing.defense ?? p.defense;
        const speed = listing.speed ?? p.speed;
        const level = listing.level || 1;
        const exp = listing.exp || 0;
        const expData = getExpProgress(exp, level);
        const typeClass = `type-${(p.types[0] || "normal").toLowerCase()}`;
        const isOwner = listing.seller_id === CURRENT_USER_ID;
        const allowBidding = listing.allow_bidding && listing.starting_bid > 0;
        const highestBid = listing.highest_bid || 0;
        const startingBid = listing.starting_bid || 0;

        let buttonsHtml = "";
        if (isOwner) {
          buttonsHtml = `
            <div class="card-btn-group">
              ${allowBidding ? `<button class="btn btn-sm view-bids-btn" data-listing-id="${listing.id}">View Bids ${highestBid > 0 ? `(${highestBid})` : ""}</button>` : ""}
              <button class="btn btn-sm cancel-p2p-btn" data-listing-id="${listing.id}">Cancel</button>
            </div>`;
        } else {
          buttonsHtml = `
            <div class="card-btn-group">
              <button class="btn btn-sm btn-warning buy-p2p-btn" data-listing-id="${listing.id}" data-price="${listing.price_pkchp}">Buy ${listing.price_pkchp} PKCHP</button>
              ${allowBidding ? `<button class="btn btn-sm bid-p2p-btn" data-listing-id="${listing.id}">Bid (MetaMask)</button>` : ""}
            </div>`;
        }

        let bidInfoHtml = "";
        if (allowBidding) {
          bidInfoHtml = `
            <div class="listing-bid-info">
              <div class="d-flex justify-content-between"><span class="bid-label">Starting Bid:</span><span class="bid-amount">${startingBid} PKCHP</span></div>
              ${highestBid > 0 ? `<div class="d-flex justify-content-between mt-1"><span class="bid-label">Highest Bid:</span><span class="bid-amount">${highestBid} PKCHP</span></div>` : ""}
            </div>`;
        }

        const card = document.createElement("div");
        card.className = "col-12 col-sm-6 col-md-4 col-lg-3";
        card.innerHTML = `
          <div class="pokemon-card-tcg">
            <div class="rarity-badge ${rarityClass}">${listing.rarity}</div>
            ${allowBidding ? `<div class="bidding-enabled-badge">On-Chain Bid</div>` : ""}
            ${allowBidding && highestBid > 0 ? `<div class="bid-badge">${highestBid} PKCHP</div>` : ""}
            <div class="pokemon-card-inner ${typeClass}">
              <div class="level-badge">Lv. ${level}</div>
              <div class="dex-number">#${p.id}</div>
              <img src="${listing.sprite_url || p.sprite}" class="pokemon-img" alt="${listing.pokemon_name}">
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
                <div class="exp-bar-container"><div class="exp-bar-fill" style="width: ${expData.percentage}%"></div></div>
              </div>
              <div class="collection-price">◎ Price: ${listing.price_pkchp} PKCHP</div>
              <div class="collection-time">Seller: ${shortAddress(listing.seller_wallet)}</div>
              ${bidInfoHtml}
              ${buttonsHtml}
            </div>
          </div>`;
        grid.appendChild(card);
      } catch (err) {
        console.error("Error rendering listing:", listing.pokemon_name, err);
      }
    }
  }

  // ============================================
  // MY ACTIVE BIDS
  // ============================================

  async function loadMyActiveBids() {
    if (!CURRENT_USER_ID) return [];
    const { data, error } = await supabase
      .from("p2p_bids")
      .select("*, p2p_listings(*)")
      .eq("bidder_id", CURRENT_USER_ID)
      .eq("status", "active")
      .order("created_at", { ascending: false });
    if (error) {
      console.error("Error loading my bids:", error);
      return [];
    }
    return data || [];
  }

  // ============================================
  // MODAL ELEMENTS
  // ============================================

  const buyModalBackdrop = document.getElementById("p2pBuyModalBackdrop");
  const buyModalSprite = document.getElementById("p2pBuyModalSprite");
  const buyModalName = document.getElementById("p2pBuyModalName");
  const buyModalRarity = document.getElementById("p2pBuyModalRarity");
  const buyModalPriceValue = document.getElementById("p2pBuyModalPriceValue");
  const buyModalBalance = document.getElementById("p2pBuyModalBalance");
  const buyModalSellerWallet = document.getElementById(
    "p2pBuyModalSellerWallet",
  );
  const buyModalClose = document.getElementById("p2pBuyModalClose");
  const buyModalCancel = document.getElementById("p2pBuyModalCancel");
  const buyModalConfirm = document.getElementById("p2pBuyModalConfirm");

  const processingBackdrop = document.getElementById(
    "p2pProcessingModalBackdrop",
  );
  const processingStatus = document.getElementById("p2pProcessingStatus");
  const processingSub = document.getElementById("p2pProcessingSub");

  const bidModalBackdrop = document.getElementById("p2pBidModalBackdrop");
  const bidModalSprite = document.getElementById("p2pBidModalSprite");
  const bidModalName = document.getElementById("p2pBidModalName");
  const bidModalRarity = document.getElementById("p2pBidModalRarity");
  const bidModalBuyNowPrice = document.getElementById("p2pBidModalBuyNowPrice");
  const bidModalStartingBid = document.getElementById("p2pBidModalStartingBid");
  const bidModalHighestBid = document.getElementById("p2pBidModalHighestBid");
  const bidModalMinBid = document.getElementById("p2pBidModalMinBid");
  const bidModalAmount = document.getElementById("p2pBidModalAmount");
  const bidModalBalance = document.getElementById("p2pBidModalBalance");
  const bidModalClose = document.getElementById("p2pBidModalClose");
  const bidModalCancel = document.getElementById("p2pBidModalCancel");
  const bidModalConfirm = document.getElementById("p2pBidModalConfirm");

  const bidProcessingBackdrop = document.getElementById(
    "p2pBidProcessingModalBackdrop",
  );
  const bidProcessingStatus = document.getElementById("p2pBidProcessingStatus");
  const bidProcessingSub = document.getElementById("p2pBidProcessingSub");

  const viewBidsModalBackdrop = document.getElementById(
    "p2pViewBidsModalBackdrop",
  );
  const viewBidsModalSprite = document.getElementById("p2pViewBidsModalSprite");
  const viewBidsModalName = document.getElementById("p2pViewBidsModalName");
  const viewBidsModalPrice = document.getElementById("p2pViewBidsModalPrice");
  const viewBidsEmpty = document.getElementById("p2pViewBidsEmpty");
  const viewBidsList = document.getElementById("p2pViewBidsList");
  const viewBidsModalClose = document.getElementById("p2pViewBidsModalClose");
  const viewBidsModalDone = document.getElementById("p2pViewBidsModalDone");

  const myBidsModalBackdrop = document.getElementById("p2pMyBidsModalBackdrop");
  const myBidsEmpty = document.getElementById("p2pMyBidsEmpty");
  const myBidsList = document.getElementById("p2pMyBidsList");
  const myBidsModalClose = document.getElementById("p2pMyBidsModalClose");
  const myBidsModalDone = document.getElementById("p2pMyBidsModalDone");

  const acceptBidModalBackdrop = document.getElementById(
    "p2pAcceptBidModalBackdrop",
  );
  const acceptBidBidder = document.getElementById("p2pAcceptBidBidder");
  const acceptBidAmount = document.getElementById("p2pAcceptBidAmount");
  const acceptBidModalClose = document.getElementById("p2pAcceptBidModalClose");
  const acceptBidModalCancel = document.getElementById(
    "p2pAcceptBidModalCancel",
  );
  const acceptBidModalConfirm = document.getElementById(
    "p2pAcceptBidModalConfirm",
  );

  // Success Modal Elements
  const successModalBackdrop = document.getElementById(
    "p2pSuccessModalBackdrop",
  );
  const successModalTitle = document.getElementById("p2pSuccessModalTitle");
  const successModalSprite = document.getElementById("p2pSuccessModalSprite");
  const successModalSpriteContainer = document.getElementById(
    "p2pSuccessModalSpriteContainer",
  );
  const successModalName = document.getElementById("p2pSuccessModalName");
  const successModalMessage = document.getElementById("p2pSuccessModalMessage");
  const successModalDetails = document.getElementById("p2pSuccessModalDetails");
  const successModalClose = document.getElementById("p2pSuccessModalClose");
  const successModalOk = document.getElementById("p2pSuccessModalOk");

  // ============================================
  // PROCESSING MODAL HELPERS
  // ============================================

  const blockUnload = (e) => {
    e.preventDefault();
    e.returnValue = "";
  };

  function showProcessing(statusText, subText) {
    if (processingStatus) processingStatus.textContent = statusText;
    if (processingSub) processingSub.textContent = subText;
    processingBackdrop?.classList.remove("d-none");
    window.addEventListener("beforeunload", blockUnload);
  }

  function updateProcessing(statusText, subText) {
    if (processingStatus) processingStatus.textContent = statusText;
    if (processingSub) processingSub.textContent = subText;
  }

  function hideProcessing() {
    processingBackdrop?.classList.add("d-none");
    window.removeEventListener("beforeunload", blockUnload);
  }

  function showBidProcessing(statusText, subText) {
    if (bidProcessingStatus) bidProcessingStatus.textContent = statusText;
    if (bidProcessingSub) bidProcessingSub.textContent = subText;
    bidProcessingBackdrop?.classList.remove("d-none");
    window.addEventListener("beforeunload", blockUnload);
  }

  function updateBidProcessing(statusText, subText) {
    if (bidProcessingStatus) bidProcessingStatus.textContent = statusText;
    if (bidProcessingSub) bidProcessingSub.textContent = subText;
  }

  function hideBidProcessing() {
    bidProcessingBackdrop?.classList.add("d-none");
    window.removeEventListener("beforeunload", blockUnload);
  }

  // ============================================
  // SUCCESS MODAL HELPERS
  // ============================================

  let successModalCallback = null;

  function showSuccessModal(options) {
    const {
      title = "Success!",
      pokemonName = "",
      sprite = "",
      message = "",
      details = "",
      onClose = null,
    } = options;

    if (successModalTitle) successModalTitle.textContent = title;
    if (successModalName) successModalName.textContent = pokemonName;
    if (successModalMessage) successModalMessage.textContent = message;
    if (successModalDetails) successModalDetails.textContent = details;

    if (sprite && successModalSprite) {
      successModalSprite.src = sprite;
      successModalSpriteContainer?.classList.remove("d-none");
    } else {
      successModalSpriteContainer?.classList.add("d-none");
    }

    successModalCallback = onClose;
    successModalBackdrop?.classList.remove("d-none");
  }

  function closeSuccessModal() {
    successModalBackdrop?.classList.add("d-none");
    if (successModalCallback) {
      successModalCallback();
      successModalCallback = null;
    }
  }

  successModalClose?.addEventListener("click", closeSuccessModal);
  successModalOk?.addEventListener("click", closeSuccessModal);
  successModalBackdrop?.addEventListener("click", (e) => {
    if (e.target === successModalBackdrop) closeSuccessModal();
  });

  // ============================================
  // BUY MODAL
  // ============================================

  function openBuyModal(listing) {
    pendingListing = listing;
    const price = listing.price_pkchp ?? listing.price ?? 0;
    if (buyModalSprite) buyModalSprite.src = listing.sprite_url;
    if (buyModalName) buyModalName.textContent = listing.pokemon_name;
    if (buyModalRarity) buyModalRarity.textContent = listing.rarity;
    if (buyModalPriceValue) buyModalPriceValue.textContent = price;
    if (buyModalBalance) buyModalBalance.textContent = pkchpBalance;
    if (buyModalSellerWallet)
      buyModalSellerWallet.textContent = listing.seller_wallet || "(no wallet)";
    buyModalBackdrop?.classList.remove("d-none");
  }

  function closeBuyModal() {
    buyModalBackdrop?.classList.add("d-none");
    pendingListing = null;
  }

  buyModalClose?.addEventListener("click", closeBuyModal);
  buyModalCancel?.addEventListener("click", closeBuyModal);
  buyModalBackdrop?.addEventListener("click", (e) => {
    if (e.target === buyModalBackdrop) closeBuyModal();
  });

  // ============================================
  // BID MODAL (ON-CHAIN)
  // ============================================

  function openBidModal(listing) {
    pendingBidListing = listing;
    const price = listing.price_pkchp || 0;
    const startingBid = listing.starting_bid || 0;
    const highestBid = listing.highest_bid || 0;
    const minBid = highestBid > 0 ? highestBid + 1 : startingBid;

    if (bidModalSprite) bidModalSprite.src = listing.sprite_url;
    if (bidModalName) bidModalName.textContent = listing.pokemon_name;
    if (bidModalRarity) bidModalRarity.textContent = listing.rarity;
    if (bidModalBuyNowPrice) bidModalBuyNowPrice.textContent = `${price} PKCHP`;
    if (bidModalStartingBid)
      bidModalStartingBid.textContent = `${startingBid} PKCHP`;
    if (bidModalHighestBid)
      bidModalHighestBid.textContent =
        highestBid > 0 ? `${highestBid} PKCHP` : "No bids yet";
    if (bidModalMinBid) bidModalMinBid.textContent = `${minBid} PKCHP`;
    if (bidModalAmount) {
      bidModalAmount.value = minBid;
      bidModalAmount.min = minBid;
    }
    if (bidModalBalance) bidModalBalance.textContent = pkchpBalance;
    bidModalBackdrop?.classList.remove("d-none");
  }

  function closeBidModal() {
    bidModalBackdrop?.classList.add("d-none");
    pendingBidListing = null;
    if (bidModalAmount) bidModalAmount.value = "";
  }

  bidModalClose?.addEventListener("click", closeBidModal);
  bidModalCancel?.addEventListener("click", closeBidModal);
  bidModalBackdrop?.addEventListener("click", (e) => {
    if (e.target === bidModalBackdrop) closeBidModal();
  });

  // ============================================
  // VIEW BIDS MODAL (FOR SELLERS)
  // ============================================

  function closeViewBidsModal() {
    viewBidsModalBackdrop?.classList.add("d-none");
    pendingListing = null;
  }

  viewBidsModalClose?.addEventListener("click", closeViewBidsModal);
  viewBidsModalDone?.addEventListener("click", closeViewBidsModal);
  viewBidsModalBackdrop?.addEventListener("click", (e) => {
    if (e.target === viewBidsModalBackdrop) closeViewBidsModal();
  });

  async function openViewBidsModal(listing) {
    pendingListing = listing;
    if (viewBidsModalSprite) viewBidsModalSprite.src = listing.sprite_url;
    if (viewBidsModalName)
      viewBidsModalName.textContent = listing.pokemon_name?.toUpperCase();
    if (viewBidsModalPrice)
      viewBidsModalPrice.textContent = `${listing.price_pkchp} PKCHP`;

    // Fetch on-chain highest bid to check for sync issues
    let onChainHighestBid = 0;
    let onChainHighestBidder = null;
    try {
      const escrow = await getEscrowContract();
      const pkchp = await getPkchpContract();
      const decimals = await pkchp.decimals();
      const listingBytes32 = uuidToBytes32(listing.id);
      const onChainListing = await escrow.getListing(listingBytes32);

      const highestBidWei = onChainListing[5];
      onChainHighestBid = Math.floor(
        Number(ethers.formatUnits(highestBidWei, decimals)),
      );
      onChainHighestBidder = onChainListing[4];

      console.log("[VIEW BIDS] On-chain highest bid:", onChainHighestBid);
      console.log("[VIEW BIDS] On-chain highest bidder:", onChainHighestBidder);

      // Sync database if on-chain bid is higher than database
      if (onChainHighestBid > (listing.highest_bid || 0)) {
        console.log("[VIEW BIDS] Syncing database with on-chain data...");
        await supabase
          .from("p2p_listings")
          .update({
            highest_bid: onChainHighestBid,
            highest_bidder_wallet: onChainHighestBidder,
          })
          .eq("id", listing.id);
      }
    } catch (err) {
      console.warn("Could not fetch on-chain bid data:", err);
    }

    // Fetch bids for this listing from database
    const { data: bidsData, error } = await supabase
      .from("p2p_bids")
      .select("*")
      .eq("listing_id", listing.id)
      .eq("status", "active")
      .order("bid_amount", { ascending: false });

    if (error) {
      console.error("Error fetching bids:", error);
    }

    // Determine the highest bid (on-chain or database)
    const dbHighestBid = bidsData?.[0]?.bid_amount || 0;
    const dbHighestBidder = bidsData?.[0];

    // Use on-chain data if it's higher, otherwise use database
    const useOnChain = onChainHighestBid > dbHighestBid;
    const highestBidAmount = useOnChain ? onChainHighestBid : dbHighestBid;
    const highestBidWallet = useOnChain ? onChainHighestBidder : dbHighestBidder?.bidder_wallet;
    const highestBidId = useOnChain ? "on-chain" : dbHighestBidder?.id;
    const highestBidderId = useOnChain ? "" : dbHighestBidder?.bidder_id;
    const highestBidTime = useOnChain ? "Just now" : (dbHighestBidder ? relativeTime(dbHighestBidder.created_at) : "");

    if (highestBidAmount === 0) {
      viewBidsEmpty?.classList.remove("d-none");
      if (viewBidsList) viewBidsList.innerHTML = "";
    } else {
      viewBidsEmpty?.classList.add("d-none");
      if (viewBidsList) {
        viewBidsList.innerHTML = `
          <div class="bid-item highest-bid">
            <div class="bid-info">
              <div class="bid-wallet">${shortAddress(highestBidWallet)}</div>
              <div class="bid-time">${highestBidTime}</div>
            </div>
            <div class="bid-amount">${highestBidAmount} PKCHP</div>
            <button class="btn btn-sm btn-success accept-bid-btn"
              data-bid-id="${highestBidId}"
              data-bid-amount="${highestBidAmount}"
              data-bidder-wallet="${highestBidWallet}"
              data-bidder-id="${highestBidderId}">
              Accept
            </button>
          </div>`;
      }
    }

    viewBidsModalBackdrop?.classList.remove("d-none");
  }

  // ============================================
  // MY BIDS MODAL
  // ============================================

  async function openMyBidsModal() {
    myActiveBids = await loadMyActiveBids();
    if (!myActiveBids || myActiveBids.length === 0) {
      myBidsEmpty?.classList.remove("d-none");
      if (myBidsList) myBidsList.innerHTML = "";
    } else {
      myBidsEmpty?.classList.add("d-none");
      if (myBidsList) {
        myBidsList.innerHTML = myActiveBids
          .map((bid) => {
            const listing = bid.p2p_listings;
            const isHighest = listing && bid.bid_amount === listing.highest_bid;
            return `
            <div class="my-bid-item">
              <img src="${listing?.sprite_url || ""}" class="my-bid-sprite" alt="${listing?.pokemon_name || "Pokemon"}">
              <div class="my-bid-info">
                <div class="my-bid-pokemon">${listing?.pokemon_name?.toUpperCase() || "Unknown"}</div>
                <div class="my-bid-details">Buy Now: ${listing?.price_pkchp || 0} PKCHP</div>
                <div class="my-bid-status ${isHighest ? "highest" : "active"}">${isHighest ? "⭐ Highest bidder!" : "✓ Active"}</div>
              </div>
              <div class="my-bid-amount">${bid.bid_amount} PKCHP</div>
              <button class="btn btn-sm cancel-bid-btn" data-bid-id="${bid.id}" data-listing-id="${listing?.id}">Cancel</button>
            </div>`;
          })
          .join("");
      }
    }
    myBidsModalBackdrop?.classList.remove("d-none");
  }

  function closeMyBidsModal() {
    myBidsModalBackdrop?.classList.add("d-none");
  }

  myBidsModalClose?.addEventListener("click", closeMyBidsModal);
  myBidsModalDone?.addEventListener("click", closeMyBidsModal);
  myBidsModalBackdrop?.addEventListener("click", (e) => {
    if (e.target === myBidsModalBackdrop) closeMyBidsModal();
  });

  // ============================================
  // ACCEPT BID MODAL
  // ============================================

  function openAcceptBidModal(bid) {
    pendingAcceptBid = bid;
    if (acceptBidBidder)
      acceptBidBidder.textContent = shortAddress(bid.bidderWallet);
    if (acceptBidAmount) acceptBidAmount.textContent = bid.bidAmount;
    acceptBidModalBackdrop?.classList.remove("d-none");
  }

  function closeAcceptBidModal() {
    acceptBidModalBackdrop?.classList.add("d-none");
    pendingAcceptBid = null;
  }

  acceptBidModalClose?.addEventListener("click", closeAcceptBidModal);
  acceptBidModalCancel?.addEventListener("click", closeAcceptBidModal);
  acceptBidModalBackdrop?.addEventListener("click", (e) => {
    if (e.target === acceptBidModalBackdrop) closeAcceptBidModal();
  });

  // ============================================
  // GRID EVENT HANDLERS
  // ============================================

  grid.addEventListener("click", async (e) => {
    const buyBtn = e.target.closest(".buy-p2p-btn");
    if (buyBtn) {
      const listingId = buyBtn.dataset.listingId;
      const listing = currentListings.find((l) => String(l.id) === listingId);
      if (listing) openBuyModal(listing);
      return;
    }

    const bidBtn = e.target.closest(".bid-p2p-btn");
    if (bidBtn) {
      const listingId = bidBtn.dataset.listingId;
      const listing = currentListings.find((l) => String(l.id) === listingId);
      if (listing) openBidModal(listing);
      return;
    }

    const viewBidsBtn = e.target.closest(".view-bids-btn");
    if (viewBidsBtn) {
      const listingId = viewBidsBtn.dataset.listingId;
      const listing = currentListings.find((l) => String(l.id) === listingId);
      if (listing) openViewBidsModal(listing);
      return;
    }

    const cancelBtn = e.target.closest(".cancel-p2p-btn");
    if (cancelBtn) {
      const listingId = cancelBtn.dataset.listingId;
      await cancelListing(listingId);
      return;
    }
  });

  viewBidsList?.addEventListener("click", (e) => {
    const acceptBtn = e.target.closest(".accept-bid-btn");
    if (acceptBtn) {
      openAcceptBidModal({
        bidId: acceptBtn.dataset.bidId,
        bidAmount: Number(acceptBtn.dataset.bidAmount),
        bidderWallet: acceptBtn.dataset.bidderWallet,
        bidderId: acceptBtn.dataset.bidderId,
        listing: pendingListing,
      });
    }
  });

  myBidsList?.addEventListener("click", async (e) => {
    const cancelBtn = e.target.closest(".cancel-bid-btn");
    if (cancelBtn) {
      const bidId = cancelBtn.dataset.bidId;
      const listingId = cancelBtn.dataset.listingId;
      await cancelBid(bidId, listingId);
    }
  });

  // ============================================
  // CANCEL LISTING
  // ============================================

  async function cancelListing(listingId) {
    const listing = currentListings.find((l) => String(l.id) === listingId);
    if (!listing) return;
    if (
      !confirm(
        "Cancel this listing? The Pokemon will return to your collection.",
      )
    )
      return;

    showProcessing("Cancelling listing...", "Please wait...");

    try {
      // Cancel on smart contract first (refunds all bidders automatically)
      const escrow = await getEscrowContract(true);
      const listingBytes32 = uuidToBytes32(listingId);

      updateProcessing("Cancelling on blockchain...", "Confirm in MetaMask...");
      const tx = await escrow.cancelListing(listingBytes32);
      await tx.wait();

      updateProcessing("Returning Pokemon...", "Almost done...");

      // Return Pokemon to seller's collection
      await supabase.from("user_pokemon").insert([
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

      // Update all bids to refunded
      await supabase
        .from("p2p_bids")
        .update({ status: "refunded" })
        .eq("listing_id", listingId)
        .eq("status", "active");

      // Delete the listing
      await supabase.from("p2p_listings").delete().eq("id", listingId);

      hideProcessing();
      await loadListings();
      showSuccessModal({
        title: "Listing Cancelled",
        pokemonName: listing.pokemon_name?.toUpperCase(),
        sprite: listing.sprite_url,
        message: `${listing.pokemon_name} has been returned to your collection.`,
        details: "All bidders have been refunded on-chain.",
      });
    } catch (err) {
      console.error("Cancel listing failed:", err);
      hideProcessing();
      alert("Failed to cancel listing: " + (err?.message || "Unknown error"));
    }
  }

  // ============================================
  // PLACE BID (ON-CHAIN)
  // ============================================

  bidModalConfirm?.addEventListener("click", async () => {
    if (!pendingBidListing || !CURRENT_USER_ID) {
      alert("Please select a listing to bid on.");
      return;
    }

    const bidAmount = Number(bidModalAmount.value);
    const buyNowPrice = pendingBidListing.price_pkchp || 0;

    if (!bidAmount || bidAmount <= 0) {
      alert("Please enter a valid bid amount.");
      return;
    }

    if (bidAmount >= buyNowPrice) {
      alert(
        `Your bid cannot be equal to or higher than the Buy Now price (${buyNowPrice} PKCHP). Use the Buy button instead.`,
      );
      return;
    }

    if (bidAmount > pkchpBalance) {
      alert(`Insufficient PKCHP balance. You have ${pkchpBalance} PKCHP.`);
      return;
    }

    const listingToBidOn = { ...pendingBidListing };
    closeBidModal();
    showBidProcessing("Placing your bid...", "Checking on-chain bid status...");

    try {
      // Verify the listing exists on the blockchain and get current highest bid
      const escrow = await getEscrowContract(true);
      const pkchp = await getPkchpContract();
      const decimals = await pkchp.decimals();
      const listingBytes32 = uuidToBytes32(listingToBidOn.id);
      const onChainListing = await escrow.getListing(listingBytes32);

      // Check if listing exists (seller is not zero address) and is active
      const sellerAddress = onChainListing[0];
      const onChainStartingBid = onChainListing[1];
      const isActive = onChainListing[3];
      const onChainHighestBid = onChainListing[5];

      if (
        sellerAddress === "0x0000000000000000000000000000000000000000" ||
        !isActive
      ) {
        hideBidProcessing();
        alert(
          "This listing is not available for on-chain bidding. The seller may need to re-list with bidding enabled.",
        );
        return;
      }

      // Convert on-chain values to readable numbers
      const startingBidNum = Math.floor(
        Number(ethers.formatUnits(onChainStartingBid, decimals)),
      );
      const highestBidNum = Math.floor(
        Number(ethers.formatUnits(onChainHighestBid, decimals)),
      );
      const minBid = highestBidNum > 0 ? highestBidNum + 1 : startingBidNum;

      // Validate bid amount against on-chain data
      if (bidAmount < minBid) {
        hideBidProcessing();
        alert(
          `Your bid must be at least ${minBid} PKCHP. Current highest bid on blockchain: ${highestBidNum} PKCHP`,
        );
        // Sync database with on-chain data
        if (highestBidNum !== (listingToBidOn.highest_bid || 0)) {
          await supabase
            .from("p2p_listings")
            .update({ highest_bid: highestBidNum })
            .eq("id", listingToBidOn.id);
          await loadListings();
        }
        return;
      }

      updateBidProcessing("Approving PKCHP...", "Please wait...");

      // Ensure allowance for escrow contract
      await ensureAllowance(bidAmount);

      updateBidProcessing(
        "Placing bid on blockchain...",
        "Confirm in MetaMask...",
      );

      // Place bid on smart contract
      const amountWei = ethers.parseUnits(String(bidAmount), decimals);

      const tx = await escrow.placeBid(listingBytes32, amountWei);
      const receipt = await tx.wait();

      updateBidProcessing("Updating database...", "Almost done...");

      // Update database
      const walletAddress =
        window.CURRENT_WALLET_ADDRESS ||
        localStorage.getItem("CURRENT_WALLET_ADDRESS");

      // Check if user already has a bid
      const { data: existingBid } = await supabase
        .from("p2p_bids")
        .select("*")
        .eq("listing_id", listingToBidOn.id)
        .eq("bidder_id", CURRENT_USER_ID)
        .eq("status", "active")
        .single();

      if (existingBid) {
        await supabase
          .from("p2p_bids")
          .update({ bid_amount: bidAmount })
          .eq("id", existingBid.id);
      } else {
        await supabase.from("p2p_bids").insert([
          {
            listing_id: listingToBidOn.id,
            seller_id: listingToBidOn.seller_id,
            bidder_id: CURRENT_USER_ID,
            bidder_wallet: walletAddress,
            bid_amount: bidAmount,
            status: "active",
          },
        ]);
      }

      // Update listing with new highest bid
      await supabase
        .from("p2p_listings")
        .update({
          highest_bid: bidAmount,
          highest_bidder_id: CURRENT_USER_ID,
          highest_bidder_wallet: walletAddress,
        })
        .eq("id", listingToBidOn.id);

      // Notify seller
      await supabase.from("notifications").insert([
        {
          user_id: listingToBidOn.seller_id,
          type: "new_bid",
          listing_id: listingToBidOn.id,
          message: `New bid of ${bidAmount} PKCHP on your ${listingToBidOn.pokemon_name}!`,
          pokemon_name: listingToBidOn.pokemon_name,
          pokemon_sprite: listingToBidOn.sprite_url,
          amount: bidAmount,
          from_user_id: CURRENT_USER_ID,
          from_wallet: walletAddress,
          is_read: false,
        },
      ]);

      if (window.logBidPlaced) {
        await window.logBidPlaced(
          {
            name: listingToBidOn.pokemon_name,
            rarity: listingToBidOn.rarity,
            sprite: listingToBidOn.sprite_url,
          },
          bidAmount,
          listingToBidOn.id,
        );
      }

      hideBidProcessing();
      await loadWalletBalance();
      await loadListings();
      showSuccessModal({
        title: "Bid Placed!",
        pokemonName: listingToBidOn.pokemon_name?.toUpperCase(),
        sprite: listingToBidOn.sprite_url,
        message: `Your bid of ${bidAmount} PKCHP has been placed successfully!`,
        details: "PKCHP locked in escrow contract.",
      });
    } catch (err) {
      console.error("Bid placement failed:", err);
      hideBidProcessing();
      alert("Failed to place bid: " + (err?.message || "Unknown error"));
    }
  });

  // ============================================
  // CANCEL BID (ON-CHAIN)
  // ============================================

  async function cancelBid(bidId, listingId) {
    if (
      !confirm(
        "Cancel your bid? Your PKCHP will be refunded from the escrow contract.",
      )
    )
      return;

    showBidProcessing("Cancelling bid...", "Processing refund...");

    try {
      const escrow = await getEscrowContract(true);
      const listingBytes32 = uuidToBytes32(listingId);

      updateBidProcessing(
        "Cancelling on blockchain...",
        "Confirm in MetaMask...",
      );
      const tx = await escrow.cancelBid(listingBytes32);
      await tx.wait();

      updateBidProcessing("Updating database...", "Almost done...");

      // Update bid status in database
      await supabase
        .from("p2p_bids")
        .update({ status: "cancelled" })
        .eq("id", bidId);

      // Check if this was the highest bid and update listing
      const { data: listing } = await supabase
        .from("p2p_listings")
        .select("*")
        .eq("id", listingId)
        .single();

      if (listing && listing.highest_bidder_id === CURRENT_USER_ID) {
        const { data: nextHighest } = await supabase
          .from("p2p_bids")
          .select("*")
          .eq("listing_id", listingId)
          .eq("status", "active")
          .order("bid_amount", { ascending: false })
          .limit(1)
          .single();

        if (nextHighest) {
          await supabase
            .from("p2p_listings")
            .update({
              highest_bid: nextHighest.bid_amount,
              highest_bidder_id: nextHighest.bidder_id,
              highest_bidder_wallet: nextHighest.bidder_wallet,
            })
            .eq("id", listingId);
        } else {
          await supabase
            .from("p2p_listings")
            .update({
              highest_bid: 0,
              highest_bidder_id: null,
              highest_bidder_wallet: null,
            })
            .eq("id", listingId);
        }
      }

      hideBidProcessing();
      closeMyBidsModal();
      await loadWalletBalance();
      await loadListings();
      showSuccessModal({
        title: "Bid Cancelled",
        message: "Your bid has been cancelled successfully.",
        details: "PKCHP has been refunded from escrow contract.",
      });
    } catch (err) {
      console.error("Cancel bid failed:", err);
      hideBidProcessing();
      alert("Failed to cancel bid: " + (err?.message || "Unknown error"));
    }
  }

  // ============================================
  // ACCEPT BID (ON-CHAIN)
  // ============================================

  acceptBidModalConfirm?.addEventListener("click", async () => {
    if (!pendingAcceptBid || !pendingAcceptBid.listing) return;

    let { bidId, bidAmount, bidderWallet, bidderId, listing } =
      pendingAcceptBid;

    // Check if this is an on-chain bid not in the database
    const isOnChainBid = bidId === "on-chain";

    closeAcceptBidModal();
    closeViewBidsModal();
    showProcessing("Accepting bid...", "Transferring on blockchain...");

    try {
      // If on-chain bid, look up the user by wallet address
      if (isOnChainBid && bidderWallet) {
        updateProcessing("Finding bidder...", "Looking up user...");
        const { data: userData } = await supabase
          .from("users")
          .select("id")
          .eq("wallet_address", bidderWallet.toLowerCase())
          .single();

        if (userData) {
          bidderId = userData.id;
        } else {
          hideProcessing();
          alert(
            "Cannot find the bidder's account. The bid exists on blockchain but the user is not registered.",
          );
          return;
        }
      }

      const escrow = await getEscrowContract(true);
      const listingBytes32 = uuidToBytes32(listing.id);

      updateProcessing(
        "Accepting bid on blockchain...",
        "Confirm in MetaMask...",
      );
      const tx = await escrow.acceptBid(listingBytes32);
      await tx.wait();

      updateProcessing("Transferring Pokemon...", "Almost done...");

      // Transfer Pokemon to buyer
      const { error: pokemonError } = await supabase.from("user_pokemon").insert([
        {
          user_id: bidderId,
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

      if (pokemonError) {
        console.error("Failed to transfer Pokemon to buyer:", pokemonError);
        // Don't stop - blockchain transaction succeeded
      }

      // Update bid status in database (skip if on-chain only bid)
      // These are non-critical - blockchain is the source of truth
      try {
        if (!isOnChainBid) {
          await supabase
            .from("p2p_bids")
            .update({ status: "accepted" })
            .eq("id", bidId);
        }

        // Update other bids to refunded (smart contract already refunded them)
        await supabase
          .from("p2p_bids")
          .update({ status: "refunded" })
          .eq("listing_id", listing.id)
          .eq("status", "active");
      } catch (bidUpdateErr) {
        console.warn("Bid status update failed (non-critical):", bidUpdateErr);
      }

      // Notify winning bidder (non-critical)
      try {
        await supabase.from("notifications").insert([
          {
            user_id: bidderId,
            type: "bid_accepted",
            listing_id: listing.id,
            message: `Your bid of ${bidAmount} PKCHP for ${listing.pokemon_name} was accepted!`,
            pokemon_name: listing.pokemon_name,
            pokemon_sprite: listing.sprite_url,
            amount: bidAmount,
            from_user_id: listing.seller_id,
            from_wallet: listing.seller_wallet,
            is_read: false,
          },
        ]);
      } catch (notifErr) {
        console.warn("Notification insert failed (non-critical):", notifErr);
      }

      // Delete the listing
      await supabase.from("p2p_listings").delete().eq("id", listing.id);

      if (window.logBidAccepted) {
        await window.logBidAccepted(
          {
            name: listing.pokemon_name,
            rarity: listing.rarity,
            sprite: listing.sprite_url,
            level: listing.level,
          },
          bidAmount,
          bidderWallet,
        );
      }

      hideProcessing();
      await loadWalletBalance();
      await loadListings();
      showSuccessModal({
        title: "Bid Accepted!",
        pokemonName: listing.pokemon_name?.toUpperCase(),
        sprite: listing.sprite_url,
        message: `${listing.pokemon_name} sold for ${bidAmount} PKCHP.`,
        details: "The Pokemon has been transferred to the buyer.",
      });
    } catch (err) {
      console.error("Accept bid failed:", err);
      hideProcessing();
      alert("Failed to accept bid: " + (err?.message || "Unknown error"));
    }
  });

  // ============================================
  // BUY NOW (ON-CHAIN DIRECT TRANSFER)
  // ============================================

  buyModalConfirm?.addEventListener("click", async () => {
    if (!pendingListing) return;

    const price = pendingListing.price_pkchp ?? pendingListing.price ?? 0;

    if (pkchpBalance < price) {
      alert("Insufficient PKCHP balance.");
      return;
    }

    // Store listing data before closing modal (same fix as bidding)
    const listingToBuy = { ...pendingListing };
    closeBuyModal();
    showProcessing("Initiating payment...", "Please confirm in MetaMask...");

    try {
      // Direct transfer to seller (not using escrow for Buy Now)
      const pkchp = await getPkchpContract(true);
      const decimals = await pkchp.decimals();
      const amount = ethers.parseUnits(String(price), decimals);

      const tx = await pkchp.transfer(listingToBuy.seller_wallet, amount);
      const receipt = await tx.wait();
      const txHash = receipt.hash;

      updateProcessing(
        "Payment confirmed!",
        "Adding Pokemon to your collection...",
      );

      // Add Pokemon to buyer's collection
      await supabase.from("user_pokemon").insert([
        {
          user_id: CURRENT_USER_ID,
          pokemon_name: listingToBuy.pokemon_name,
          rarity: listingToBuy.rarity,
          sprite_url: listingToBuy.sprite_url,
          hp: listingToBuy.hp,
          attack: listingToBuy.attack,
          defense: listingToBuy.defense,
          speed: listingToBuy.speed,
          level: listingToBuy.level || 1,
          exp: listingToBuy.exp || 0,
          acquired_at: new Date().toISOString(),
        },
      ]);

      updateProcessing("Refunding bidders...", "Processing...");

      // Refund all active bids via escrow contract
      const { data: activeBids } = await supabase
        .from("p2p_bids")
        .select("*")
        .eq("listing_id", listingToBuy.id)
        .eq("status", "active");

      if (activeBids && activeBids.length > 0) {
        // Cancel listing on escrow to refund all bidders
        try {
          const escrow = await getEscrowContract(true);
          const listingBytes32 = uuidToBytes32(listingToBuy.id);
          const cancelTx = await escrow.cancelListing(listingBytes32);
          await cancelTx.wait();
        } catch (escrowErr) {
          console.warn(
            "Escrow cancel failed (may not have been created):",
            escrowErr,
          );
        }

        // Update bids in database
        await supabase
          .from("p2p_bids")
          .update({ status: "refunded" })
          .eq("listing_id", listingToBuy.id)
          .eq("status", "active");

        // Notify bidders
        for (const bid of activeBids) {
          await supabase.from("notifications").insert([
            {
              user_id: bid.bidder_id,
              type: "listing_sold",
              listing_id: listingToBuy.id,
              bid_id: bid.id,
              message: `${listingToBuy.pokemon_name} was bought at full price. Your bid of ${bid.bid_amount} PKCHP has been refunded.`,
              pokemon_name: listingToBuy.pokemon_name,
              pokemon_sprite: listingToBuy.sprite_url,
              amount: bid.bid_amount,
              is_read: false,
            },
          ]);
        }
      }

      updateProcessing("Finalizing...", "Cleaning up listing...");

      // Log seller transaction
      const buyerWallet =
        window.CURRENT_WALLET_ADDRESS ||
        localStorage.getItem("CURRENT_WALLET_ADDRESS");
      await supabase.from("transactions").insert([
        {
          user_id: listingToBuy.seller_id,
          wallet_address: listingToBuy.seller_wallet,
          status: "success",
          type: "p2p_sell",
          pokemon_name: listingToBuy.pokemon_name,
          pokemon_rarity: listingToBuy.rarity,
          pokemon_sprite: listingToBuy.sprite_url,
          pokemon_level: listingToBuy.level || 1,
          amount: price,
          currency: "PKCHP",
          counterparty_wallet: buyerWallet,
          tx_hash: txHash,
          created_at: new Date().toISOString(),
        },
      ]);

      // Delete the listing
      await supabase.from("p2p_listings").delete().eq("id", listingToBuy.id);

      if (window.logP2PBuy) {
        await window.logP2PBuy(
          listingToBuy,
          price,
          listingToBuy.seller_wallet,
          txHash,
        );
      }

      hideProcessing();
      await loadWalletBalance();
      await loadListings();
      showSuccessModal({
        title: "Purchase Successful!",
        pokemonName: listingToBuy.pokemon_name?.toUpperCase(),
        sprite: listingToBuy.sprite_url,
        message: `${listingToBuy.pokemon_name} has been added to your collection!`,
        details: `You paid ${price} PKCHP to the seller.`,
        onClose: () => {
          window.location.href = "collection.html";
        },
      });
    } catch (err) {
      console.error("P2P purchase failed:", err);
      hideProcessing();
      alert("Purchase failed: " + (err?.message || "Unknown error"));
    }
  });

  // ============================================
  // REAL-TIME SUBSCRIPTIONS
  // ============================================

  let refreshTimer = null;
  let bidsRefreshTimer = null;

  // Function to refresh bids in the View Bids modal if it's open
  async function refreshViewBidsModal() {
    // Check if modal is open (pendingListing is set and modal is visible)
    if (
      !pendingListing ||
      viewBidsModalBackdrop?.classList.contains("d-none")
    ) {
      return;
    }

    const listing = pendingListing;

    // Fetch on-chain highest bid
    let onChainHighestBid = 0;
    let onChainHighestBidder = null;
    try {
      const escrow = await getEscrowContract();
      const pkchp = await getPkchpContract();
      const decimals = await pkchp.decimals();
      const listingBytes32 = uuidToBytes32(listing.id);
      const onChainListing = await escrow.getListing(listingBytes32);

      const highestBidWei = onChainListing[5];
      onChainHighestBid = Math.floor(
        Number(ethers.formatUnits(highestBidWei, decimals)),
      );
      onChainHighestBidder = onChainListing[4];
    } catch (err) {
      console.warn("Could not fetch on-chain bid data:", err);
    }

    // Fetch updated bids from database
    const { data: bidsData, error } = await supabase
      .from("p2p_bids")
      .select("*")
      .eq("listing_id", listing.id)
      .eq("status", "active")
      .order("bid_amount", { ascending: false });

    if (error) {
      console.error("Error refreshing bids:", error);
      return;
    }

    // Determine the highest bid (on-chain or database)
    const dbHighestBid = bidsData?.[0]?.bid_amount || 0;
    const dbHighestBidder = bidsData?.[0];

    const useOnChain = onChainHighestBid > dbHighestBid;
    const highestBidAmount = useOnChain ? onChainHighestBid : dbHighestBid;
    const highestBidWallet = useOnChain ? onChainHighestBidder : dbHighestBidder?.bidder_wallet;
    const highestBidId = useOnChain ? "on-chain" : dbHighestBidder?.id;
    const highestBidderId = useOnChain ? "" : dbHighestBidder?.bidder_id;
    const highestBidTime = useOnChain ? "Just now" : (dbHighestBidder ? relativeTime(dbHighestBidder.created_at) : "");

    if (highestBidAmount === 0) {
      viewBidsEmpty?.classList.remove("d-none");
      if (viewBidsList) viewBidsList.innerHTML = "";
    } else {
      viewBidsEmpty?.classList.add("d-none");
      if (viewBidsList) {
        viewBidsList.innerHTML = `
          <div class="bid-item highest-bid">
            <div class="bid-info">
              <div class="bid-wallet">${shortAddress(highestBidWallet)}</div>
              <div class="bid-time">${highestBidTime}</div>
            </div>
            <div class="bid-amount">${highestBidAmount} PKCHP</div>
            <button class="btn btn-sm btn-success accept-bid-btn"
              data-bid-id="${highestBidId}"
              data-bid-amount="${highestBidAmount}"
              data-bidder-wallet="${highestBidWallet}"
              data-bidder-id="${highestBidderId}">
              Accept
            </button>
          </div>`;
      }
    }

    console.log("[REAL-TIME] View Bids modal refreshed");
  }

  const scheduleRefresh = () => {
    if (refreshTimer) clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => {
      loadListings();
      loadWalletBalance();
    }, 400);
  };

  const scheduleBidsRefresh = () => {
    if (bidsRefreshTimer) clearTimeout(bidsRefreshTimer);
    bidsRefreshTimer = setTimeout(() => {
      refreshViewBidsModal();
    }, 300);
  };

  const subscribeListingChanges = () => {
    if (!window.supabase) return;

    supabase
      .channel("p2p-listings-live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "p2p_listings" },
        () => scheduleRefresh(),
      )
      .subscribe();

    supabase
      .channel("p2p-bids-live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "p2p_bids" },
        () => {
          scheduleRefresh();
          // Also refresh the View Bids modal if it's open
          scheduleBidsRefresh();
        },
      )
      .subscribe();
  };

  // ============================================
  // INITIALIZATION
  // ============================================

  await loadWalletBalance();
  await loadListings();
  subscribeListingChanges();

  console.log("✓ P2P Market with On-Chain Bidding loaded");
  console.log("  Escrow Contract:", P2P_ESCROW_ADDRESS);
  console.log("  PKCHP Token:", PKCHP_ADDRESS);
});
