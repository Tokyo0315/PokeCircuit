// ============================================================
// POKECIRCUIT ARENA - TRANSACTION LOGGER HELPER
// Include this file AFTER db.js in any page that needs logging
// ============================================================

// Global transaction logging function
window.logTransaction = async function (txData) {
  if (!window.supabase) {
    console.error("Cannot log transaction: Supabase not available");
    return null;
  }

  const userId =
    window.CURRENT_USER_ID || localStorage.getItem("CURRENT_USER_ID");
  const walletAddress =
    window.CURRENT_WALLET_ADDRESS ||
    localStorage.getItem("CURRENT_WALLET_ADDRESS");

  if (!userId) {
    console.error("Cannot log transaction: User ID not available");
    return null;
  }

  const transaction = {
    user_id: userId,
    wallet_address: walletAddress,
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
      console.error("Error message:", error.message);
      console.error("Error details:", error.details);
      console.error("Transaction data that failed:", transaction);
      return null;
    }

    console.log("✓ Transaction logged:", txData.type, data.id);
    return data;
  } catch (err) {
    console.error("Exception logging transaction:", err);
    return null;
  }
};

// ============================================================
// MARKETPLACE TRANSACTION HELPERS
// ============================================================

// Log a marketplace purchase
window.logMarketBuy = async function (pokemon, price, txHash = null) {
  return await window.logTransaction({
    type: "market_buy",
    pokemon_name: pokemon.name,
    pokemon_rarity: pokemon.rarity,
    pokemon_sprite: pokemon.sprite,
    pokemon_level: 1,
    amount: price,
    currency: "PKCHP",
    tx_hash: txHash,
  });
};

// ============================================================
// P2P TRANSACTION HELPERS
// ============================================================

// Log a P2P purchase
window.logP2PBuy = async function (
  pokemon,
  price,
  sellerWallet,
  txHash = null,
) {
  return await window.logTransaction({
    type: "p2p_buy",
    pokemon_name: pokemon.name || pokemon.pokemon_name,
    pokemon_rarity: pokemon.rarity,
    pokemon_sprite: pokemon.sprite || pokemon.sprite_url,
    pokemon_level: pokemon.level || 1,
    amount: price,
    currency: "PKCHP",
    counterparty_wallet: sellerWallet,
    tx_hash: txHash,
  });
};

// Log a P2P sale
window.logP2PSell = async function (
  pokemon,
  price,
  buyerWallet,
  txHash = null,
) {
  return await window.logTransaction({
    type: "p2p_sell",
    pokemon_name: pokemon.name || pokemon.pokemon_name,
    pokemon_rarity: pokemon.rarity,
    pokemon_sprite: pokemon.sprite || pokemon.sprite_url,
    pokemon_level: pokemon.level || 1,
    amount: price,
    currency: "PKCHP",
    counterparty_wallet: buyerWallet,
    tx_hash: txHash,
  });
};

// Log listing a Pokemon on P2P
window.logP2PList = async function (pokemon, price) {
  return await window.logTransaction({
    type: "p2p_list",
    pokemon_name: pokemon.name,
    pokemon_rarity: pokemon.rarity,
    pokemon_sprite: pokemon.sprite,
    pokemon_level: pokemon.level || 1,
    amount: price,
    currency: "PKCHP",
  });
};

// Log delisting a Pokemon from P2P
window.logP2PDelist = async function (pokemon) {
  return await window.logTransaction({
    type: "p2p_delist",
    pokemon_name: pokemon.name || pokemon.pokemon_name,
    pokemon_rarity: pokemon.rarity,
    pokemon_sprite: pokemon.sprite || pokemon.sprite_url,
    pokemon_level: pokemon.level || 1,
    amount: null,
    currency: "PKCHP",
  });
};

// ============================================================
// AI BATTLE TRANSACTION HELPERS
// ============================================================

// Log battle entry (paying entry fee)
window.logBattleEntry = async function (entryFee, tier, mode, txHash = null) {
  return await window.logTransaction({
    type: "battle_entry",
    amount: entryFee,
    currency: "PKCHP",
    battle_tier: tier,
    battle_mode: mode,
    tx_hash: txHash,
  });
};

// Log battle victory (AI Battle)
window.logBattleWin = async function (
  reward,
  expGained,
  tier,
  mode,
  opponentName,
  pokemon = null,
) {
  return await window.logTransaction({
    type: "battle_win",
    pokemon_name: pokemon?.name,
    pokemon_rarity: pokemon?.rarity,
    pokemon_sprite: pokemon?.sprite,
    pokemon_level: pokemon?.level,
    amount: reward,
    currency: "PKCHP",
    battle_tier: tier,
    battle_mode: mode,
    opponent_name: opponentName,
    exp_gained: expGained,
  });
};

// Log battle loss (AI Battle)
window.logBattleLoss = async function (
  entryFee,
  tier,
  mode,
  opponentName,
  pokemon = null,
) {
  return await window.logTransaction({
    type: "battle_loss",
    pokemon_name: pokemon?.name,
    pokemon_rarity: pokemon?.rarity,
    pokemon_sprite: pokemon?.sprite,
    pokemon_level: pokemon?.level,
    amount: entryFee,
    currency: "PKCHP",
    battle_tier: tier,
    battle_mode: mode,
    opponent_name: opponentName,
  });
};

// ============================================================
// PVP BATTLE TRANSACTION HELPERS
// ============================================================

// Log PVP victory - Winner gets double bet + Pokemon survives
window.logPVPWin = async function (
  pokemon,
  betAmount,
  expGained,
  opponentName,
) {
  return await window.logTransaction({
    type: "pvp_win",
    pokemon_name: pokemon?.name,
    pokemon_rarity: pokemon?.rarity,
    pokemon_sprite: pokemon?.sprite,
    pokemon_level: pokemon?.level,
    amount: betAmount * 2,
    currency: "PKCHP",
    opponent_name: opponentName,
    exp_gained: expGained,
  });
};

// Log PVP loss - Loser loses bet + Pokemon is deleted forever
window.logPVPLoss = async function (pokemon, betAmount, opponentName) {
  return await window.logTransaction({
    type: "pvp_loss",
    pokemon_name: pokemon?.name,
    pokemon_rarity: pokemon?.rarity,
    pokemon_sprite: pokemon?.sprite,
    pokemon_level: pokemon?.level,
    amount: betAmount,
    currency: "PKCHP",
    opponent_name: opponentName,
  });
};

// Log PVP bet placement (when entering a room/battle)
window.logPVPBet = async function (betAmount, roomId) {
  return await window.logTransaction({
    type: "pvp_bet",
    amount: betAmount,
    currency: "PKCHP",
    battle_mode: "PVP",
    tx_hash: roomId,
  });
};

// ============================================================
// P2P BIDDING TRANSACTION HELPERS
// ============================================================

// Log placing a bid
window.logBidPlaced = async function (listing, bidAmount) {
  return await window.logTransaction({
    type: "bid_placed",
    pokemon_name: listing.pokemon_name,
    pokemon_rarity: listing.rarity,
    pokemon_sprite: listing.sprite_url,
    pokemon_level: listing.level || 1,
    amount: bidAmount,
    currency: "PKCHP",
    counterparty_wallet: listing.seller_wallet,
  });
};

// Log bid refund (when outbid, cancelled, or listing sold)
window.logBidRefunded = async function (listing, bidAmount, reason) {
  return await window.logTransaction({
    type: "bid_refunded",
    pokemon_name: listing.pokemon_name,
    pokemon_rarity: listing.rarity,
    pokemon_sprite: listing.sprite_url,
    pokemon_level: listing.level || 1,
    amount: bidAmount,
    currency: "PKCHP",
    tx_hash: reason, // Store reason in tx_hash field
  });
};

// Log bid accepted (for the winning bidder)
window.logBidAccepted = async function (listing, bidAmount, sellerWallet) {
  return await window.logTransaction({
    type: "bid_accepted",
    pokemon_name: listing.pokemon_name,
    pokemon_rarity: listing.rarity,
    pokemon_sprite: listing.sprite_url,
    pokemon_level: listing.level || 1,
    amount: bidAmount,
    currency: "PKCHP",
    counterparty_wallet: sellerWallet,
  });
};

// Log bid cancelled by bidder
window.logBidCancelled = async function (listing, bidAmount) {
  return await window.logTransaction({
    type: "bid_cancelled",
    pokemon_name: listing.pokemon_name,
    pokemon_rarity: listing.rarity,
    pokemon_sprite: listing.sprite_url,
    pokemon_level: listing.level || 1,
    amount: bidAmount,
    currency: "PKCHP",
  });
};

// Log seller receiving payment from accepted bid
window.logBidSaleReceived = async function (listing, bidAmount, buyerWallet) {
  return await window.logTransaction({
    type: "bid_sale",
    pokemon_name: listing.pokemon_name,
    pokemon_rarity: listing.rarity,
    pokemon_sprite: listing.sprite_url,
    pokemon_level: listing.level || 1,
    amount: bidAmount,
    currency: "PKCHP",
    counterparty_wallet: buyerWallet,
  });
};

console.log("✓ Transaction logger loaded (with PVP and Bidding support)");
