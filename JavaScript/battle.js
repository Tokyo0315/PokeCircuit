// Battle engine for single-player mode: turn-based combat with leveling

document.addEventListener("DOMContentLoaded", async () => {
  console.log("⚡ Battle loaded");

  if (!window.rarityData) return console.error("rarityData NOT loaded!");
  if (!window.legendaryList) return console.error("legendaryList NOT loaded!");

  // EXP required to level up = level * 100
  function getExpForLevel(level) {
    return level * 100;
  }

  // Calculate new level based on total EXP
  function calculateLevelFromExp(totalExp) {
    let level = 1;
    let expNeeded = getExpForLevel(level);
    let remainingExp = totalExp;

    while (remainingExp >= expNeeded && level < 100) {
      remainingExp -= expNeeded;
      level++;
      expNeeded = getExpForLevel(level);
    }

    return { level, currentExp: remainingExp, expToNext: expNeeded };
  }

  // Total cumulative EXP required to reach a level
  function getTotalExpToLevel(level) {
    let total = 0;
    for (let l = 1; l < level; l++) {
      total += getExpForLevel(l);
    }
    return total;
  }

  // Pokemon with animated sprites available (Gen 1-5)
  const ANIMATED_POKEMON = {
    common: [
      "bulbasaur", "charmander", "squirtle", "caterpie", "weedle", "pidgey",
      "rattata", "spearow", "ekans", "pikachu", "sandshrew", "nidoran-f",
      "nidoran-m", "clefairy", "vulpix", "jigglypuff", "zubat", "oddish",
      "paras", "venonat", "diglett", "meowth", "psyduck", "mankey",
      "growlithe", "poliwag", "abra", "machop", "bellsprout", "tentacool",
      "geodude", "ponyta", "slowpoke", "magnemite", "farfetchd", "doduo",
      "seel", "grimer", "shellder", "gastly", "onix", "drowzee", "krabby",
      "voltorb", "exeggcute", "cubone", "hitmonlee", "hitmonchan", "lickitung",
      "koffing", "rhyhorn", "chansey", "tangela", "kangaskhan", "horsea",
      "goldeen", "staryu", "scyther", "jynx", "electabuzz", "magmar",
      "pinsir", "tauros", "magikarp", "lapras", "ditto", "eevee",
      "porygon", "omanyte", "kabuto", "aerodactyl", "snorlax", "dratini",
      "chikorita", "cyndaquil", "totodile", "sentret", "hoothoot", "ledyba",
      "spinarak", "chinchou", "pichu", "cleffa", "igglybuff", "togepi",
      "natu", "mareep", "marill", "sudowoodo", "hoppip", "aipom", "sunkern",
      "yanma", "wooper", "murkrow", "misdreavus", "wobbuffet", "girafarig",
      "pineco", "dunsparce", "gligar", "snubbull", "qwilfish", "shuckle",
      "heracross", "sneasel", "teddiursa", "slugma", "swinub", "corsola",
      "remoraid", "delibird", "mantine", "skarmory", "houndour", "phanpy",
      "stantler", "smeargle", "tyrogue", "smoochum", "elekid", "magby",
      "miltank", "larvitar", "treecko", "torchic", "mudkip", "poochyena",
      "zigzagoon", "wurmple", "lotad", "seedot", "taillow", "wingull",
      "ralts", "surskit", "shroomish", "slakoth", "nincada", "whismur",
      "makuhita", "azurill", "nosepass", "skitty", "sableye", "mawile",
      "aron", "meditite", "electrike", "plusle", "minun", "volbeat",
      "illumise", "roselia", "gulpin", "carvanha", "wailmer", "numel",
      "torkoal", "spoink", "spinda", "trapinch", "cacnea", "swablu",
      "zangoose", "seviper", "lunatone", "solrock", "barboach", "corphish",
      "baltoy", "lileep", "anorith", "feebas", "castform", "kecleon",
      "shuppet", "duskull", "tropius", "chimecho", "absol", "wynaut",
      "snorunt", "spheal", "clamperl", "relicanth", "luvdisc", "bagon",
      "beldum", "turtwig", "chimchar", "piplup", "starly", "bidoof",
      "kricketot", "shinx", "budew", "cranidos", "shieldon", "burmy",
      "combee", "pachirisu", "buizel", "cherubi", "shellos", "drifloon",
      "buneary", "glameow", "chingling", "stunky", "bronzor", "bonsly",
      "happiny", "chatot", "spiritomb", "gible", "munchlax", "riolu",
      "hippopotas", "skorupi", "croagunk", "carnivine", "finneon", "mantyke",
      "snover", "snivy", "tepig", "oshawott", "patrat", "lillipup",
      "purrloin", "pansage", "pansear", "panpour", "munna", "pidove",
      "blitzle", "roggenrola", "woobat", "drilbur", "audino", "timburr",
      "tympole", "throh", "sawk", "sewaddle", "venipede", "cottonee",
      "petilil", "basculin", "sandile", "darumaka", "maractus", "dwebble",
      "scraggy", "sigilyph", "yamask", "tirtouga", "archen", "trubbish",
      "zorua", "minccino", "gothita", "solosis", "ducklett", "vanillite",
      "deerling", "emolga", "karrablast", "foongus", "frillish", "alomomola",
      "joltik", "ferroseed", "klink", "tynamo", "elgyem", "litwick",
      "axew", "cubchoo", "cryogonal", "shelmet", "stunfisk", "mienfoo",
      "druddigon", "golett", "pawniard", "bouffalant", "rufflet", "vullaby",
      "heatmor", "durant", "deino", "larvesta"
    ],
    rare: [
      "ivysaur", "charmeleon", "wartortle", "metapod", "kakuna", "pidgeotto",
      "raticate", "fearow", "arbok", "raichu", "sandslash", "nidorina",
      "nidorino", "clefable", "ninetales", "wigglytuff", "golbat", "gloom",
      "parasect", "venomoth", "dugtrio", "persian", "golduck", "primeape",
      "arcanine", "poliwhirl", "kadabra", "machoke", "weepinbell", "tentacruel",
      "graveler", "rapidash", "slowbro", "magneton", "dodrio", "dewgong",
      "muk", "cloyster", "haunter", "hypno", "kingler", "electrode",
      "exeggutor", "marowak", "weezing", "rhydon", "seadra", "starmie",
      "gyarados", "vaporeon", "jolteon", "flareon", "omastar", "kabutops",
      "dragonair", "bayleef", "quilava", "croconaw", "furret", "noctowl",
      "ledian", "ariados", "lanturn", "togetic", "xatu", "flaaffy",
      "azumarill", "skiploom", "sunflora", "quagsire", "forretress", "granbull",
      "ursaring", "magcargo", "piloswine", "octillery", "houndoom", "donphan",
      "pupitar", "grovyle", "combusken", "marshtomp", "mightyena", "linoone",
      "silcoon", "cascoon", "lombre", "nuzleaf", "swellow", "pelipper",
      "kirlia", "masquerain", "breloom", "vigoroth", "ninjask", "shedinja",
      "loudred", "hariyama", "delcatty", "lairon", "medicham", "manectric",
      "swalot", "sharpedo", "wailord", "camerupt", "grumpig", "vibrava",
      "cacturne", "altaria", "whiscash", "crawdaunt", "claydol", "cradily",
      "armaldo", "milotic", "banette", "dusclops", "glalie", "sealeo",
      "huntail", "gorebyss", "shelgon", "metang", "grotle", "monferno",
      "prinplup", "staravia", "bibarel", "kricketune", "luxio", "roserade",
      "rampardos", "bastiodon", "wormadam", "mothim", "vespiquen", "floatzel",
      "cherrim", "gastrodon", "drifblim", "lopunny", "purugly", "skuntank",
      "bronzong", "gabite", "lucario", "hippowdon", "drapion", "toxicroak",
      "lumineon", "abomasnow", "servine", "pignite", "dewott", "watchog",
      "herdier", "liepard", "simisage", "simisear", "simipour", "musharna",
      "tranquill", "zebstrika", "boldore", "swoobat", "excadrill", "gurdurr",
      "palpitoad", "leavanny", "whirlipede", "whimsicott", "lilligant",
      "krokorok", "darmanitan", "crustle", "scrafty", "cofagrigus", "carracosta",
      "archeops", "garbodor", "zoroark", "cinccino", "gothorita", "duosion",
      "swanna", "vanillish", "sawsbuck", "escavalier", "amoonguss", "jellicent",
      "galvantula", "ferrothorn", "klang", "eelektrik", "beheeyem", "lampent",
      "fraxure", "beartic", "accelgor", "mienshao", "golurk", "bisharp",
      "braviary", "mandibuzz", "zweilous", "volcarona"
    ],
    epic: [
      "venusaur", "charizard", "blastoise", "butterfree", "beedrill",
      "pidgeot", "nidoqueen", "nidoking", "vileplume", "poliwrath",
      "alakazam", "machamp", "victreebel", "golem", "slowking", "gengar",
      "dragonite", "espeon", "umbreon", "meganium", "typhlosion", "feraligatr",
      "ampharos", "bellossom", "politoed", "jumpluff", "scizor", "kingdra",
      "blissey", "tyranitar", "sceptile", "blaziken", "swampert", "gardevoir",
      "slaking", "exploud", "aggron", "flygon", "salamence", "metagross",
      "torterra", "infernape", "empoleon", "staraptor", "luxray", "garchomp",
      "togekiss", "glaceon", "leafeon", "mamoswine", "gallade", "electivire",
      "magmortar", "rhyperior", "tangrowth", "yanmega", "serperior", "emboar",
      "samurott", "stoutland", "unfezant", "gigalith", "conkeldurr", "seismitoad",
      "scolipede", "krookodile", "reuniclus", "gothitelle", "vanilluxe",
      "klinklang", "eelektross", "chandelure", "haxorus", "hydreigon"
    ],
    legendary: [
      "articuno", "zapdos", "moltres", "mewtwo", "mew", "raikou", "entei",
      "suicune", "lugia", "ho-oh", "celebi", "regirock", "regice", "registeel",
      "latias", "latios", "kyogre", "groudon", "rayquaza", "jirachi", "deoxys",
      "uxie", "mesprit", "azelf", "dialga", "palkia", "heatran", "regigigas",
      "giratina", "cresselia", "phione", "manaphy", "darkrai", "shaymin",
      "arceus", "victini", "cobalion", "terrakion", "virizion", "tornadus",
      "thundurus", "reshiram", "zekrom", "landorus", "kyurem", "keldeo",
      "meloetta", "genesect"
    ]
  };

  // Smart contract addresses
  window.PKCHP_ADDRESS = "0xe53613104B5e271Af4226F6867fBb595c1aE8d26";
  window.BATTLE_REWARDS_ADDRESS = "0x80617C5F2069eF97792F77e1F28A4aD410B80578";

  window.BATTLE_REWARDS_ABI = [
    "function enterBattle(bytes32 sessionId, uint256 entryFee, uint256 potentialReward) external",
    "function endBattleAndClaim(bytes32 sessionId, bool victory) external",
    "function cancelBattle(bytes32 sessionId) external",
    "function getBattleSession(bytes32 sessionId) external view returns (address, uint256, uint256, bool, bool, bool, bool, uint256)",
  ];

  window.PKCHP_ABI = [
    "function balanceOf(address account) external view returns (uint256)",
    "function transfer(address to, uint256 amount) external returns (bool)",
    "function approve(address spender, uint256 amount) external returns (bool)",
    "function transferFrom(address from, address to, uint256 amount) external returns (bool)",
    "function allowance(address owner, address spender) external view returns (uint256)"
  ];

  // Load pending match data
  const saved = localStorage.getItem("PCA_PENDING_MATCH");
  if (!saved) {
    alert("No pending match found!");
    return (window.location.href = "match-setup.html");
  }

  const match = JSON.parse(saved);
  const mode = match.mode;
  const tier = match.tier;

  const sessionId = ethers.id(`${window.CURRENT_USER_ID}_${Date.now()}`);
  console.log("Session ID:", sessionId);

  let currentSessionId = sessionId;

  // Transaction modal elements
  const txModal = document.getElementById("txLoadingModal");
  const txTitle = document.getElementById("txLoadingTitle");
  const txMessage = document.getElementById("txLoadingMessage");
  const txStep1 = document.getElementById("txStep1");
  const txStep2 = document.getElementById("txStep2");
  const txStep3 = document.getElementById("txStep3");

  function showTxModal(title, message) {
    txTitle.textContent = title || "PROCESSING TRANSACTION";
    txMessage.textContent = message || "Please confirm the transaction in your wallet...";
    txStep1.className = "tx-step";
    txStep2.className = "tx-step";
    txStep3.className = "tx-step";
    txModal.classList.add("show");
  }

  function hideTxModal() {
    txModal.classList.remove("show");
  }

  function setTxStep(step) {
    // Reset all steps
    txStep1.className = "tx-step";
    txStep2.className = "tx-step";
    txStep3.className = "tx-step";

    // Mark completed and active
    if (step >= 1) txStep1.className = step === 1 ? "tx-step active" : "tx-step completed";
    if (step >= 2) txStep2.className = step === 2 ? "tx-step active" : "tx-step completed";
    if (step >= 3) txStep3.className = step === 3 ? "tx-step active" : "tx-step completed";
  }

  // Pay entry fee via smart contract
  async function payEntryFee() {
    try {
      if (!window.ethereum) throw new Error("MetaMask not found");

      showTxModal("ENTERING BATTLE ARENA", "Please confirm the transaction in MetaMask...");
      setTxStep(1);

      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();

      const pkchpContract = new ethers.Contract(
        window.PKCHP_ADDRESS,
        window.PKCHP_ABI,
        signer
      );

      const battleContract = new ethers.Contract(
        window.BATTLE_REWARDS_ADDRESS,
        window.BATTLE_REWARDS_ABI,
        signer
      );

      const entryFee = BigInt(match.entryFee) * 10n ** 18n;
      const reward = BigInt(match.chipReward) * 10n ** 18n;

      setTxStep(2);
      txMessage.textContent = "Approving PKCHP transfer... Please confirm in MetaMask.";
      console.log("Approving PKCHP...");
      const approveTx = await pkchpContract.approve(
        window.BATTLE_REWARDS_ADDRESS,
        entryFee
      );
      await approveTx.wait();

      setTxStep(3);
      txMessage.textContent = "Entering battle arena... Almost there!";
      console.log("Entering battle...");
      const enterTx = await battleContract.enterBattle(
        sessionId,
        entryFee,
        reward
      );
      await enterTx.wait();

      console.log("✓ Entry fee paid!");

      if (window.logBattleEntry) {
        await window.logBattleEntry(match.entryFee, match.tier, match.mode);
      }

      hideTxModal();

      return true;
    } catch (err) {
      console.error("Entry fee payment failed:", err);
      hideTxModal();
      alert("Failed to pay entry fee: " + err.message);
      window.location.href = "match-setup.html";
      return false;
    }
  }

  const feePaid = await payEntryFee();
  if (!feePaid) return;

  // Sprite URL helpers
  function getAnimatedSpriteUrl(pokemonName, isBack = false) {
    const name = pokemonName.toLowerCase().replace(/\s+/g, "-");
    const folder = isBack ? "ani-back" : "ani";
    return `https://play.pokemonshowdown.com/sprites/${folder}/${name}.gif`;
  }

  function getStaticSpriteUrl(pokemonId, isBack = false) {
    return `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${isBack ? "back/" : ""}${pokemonId}.png`;
  }

  function setSpriteWithFallback(imgElement, pokemonName, pokemonId, isBack = false) {
    const animatedUrl = getAnimatedSpriteUrl(pokemonName, isBack);
    const staticUrl = getStaticSpriteUrl(pokemonId, isBack);

    imgElement.onerror = function () {
      console.log(`Animated sprite failed for ${pokemonName}, using static fallback`);
      this.onerror = null;
      this.src = staticUrl;
    };

    imgElement.src = animatedUrl;
  }

  // Load existing session or create new one
  async function loadSession() {
    let { data, error } = await supabase
      .from("battle_sessions")
      .select("*")
      .eq("user_id", window.CURRENT_USER_ID)
      .maybeSingle();

    if (data) {
      console.log("✓ Restored session");
      currentSessionId = data.session_id || sessionId;
      return data;
    }

    const aiTeam = await generateAITeam(match.tier, match.mode, match.pokemons);

    const newSession = {
      user_id: window.CURRENT_USER_ID,
      ai_name: generateAITrainerName(),
      ai_id: Math.floor(Math.random() * 1000),
      ai_hp: aiTeam[0].hp,
      player_hp: match.pokemons[0].hp,
      player_pokemon: match.pokemons,
      ai_pokemon: aiTeam,
      ai_moves: [],
      player_moves: [],
      player_name: "Player",
      tier: match.tier,
      session_id: sessionId,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { error: insertError } = await supabase
      .from("battle_sessions")
      .insert(newSession);

    if (insertError) {
      console.error("Session insert error:", insertError);
    }

    console.log("✓ Created new session");
    return newSession;
  }

  function generateAITrainerName() {
    const names = [
      "Trainer Red", "Ace Gary", "Champion Blue", "Elite Cynthia",
      "Leader Brock", "Master Steven", "Ranger May", "Trainer Ethan",
      "Champion Lance", "Elite Bruno", "Leader Misty", "Sage Oak"
    ];
    return names[Math.floor(Math.random() * names.length)];
  }

  const session = await loadSession();

  let playerTeam = session.player_pokemon || [];
  let aiTeam = session.ai_pokemon || [];
  let playerIndex = 0;
  let aiIndex = 0;
  let playerPokemon = playerTeam[playerIndex];
  let aiPokemon = aiTeam[aiIndex];
  let playerHP = session.player_hp || playerPokemon?.hp || 100;
  let aiHP = session.ai_hp || aiPokemon?.hp || 100;
  let battleActive = true;

  if (!playerPokemon || !aiPokemon) {
    console.error("Missing Pokemon data!");
    alert("Battle data error. Returning to setup.");
    await clearBattle();
    window.location.href = "match-setup.html";
    return;
  }

  // DOM Elements
  const aiSpriteEl = document.getElementById("aiPokemon");
  const playerSpriteEl = document.getElementById("playerPokemon");
  const aiCard = document.getElementById("aiCard");
  const playerCard = document.getElementById("playerCard");
  const moveContainer = document.getElementById("movesContainer");
  const battleLog = document.getElementById("battleLog");

  const resultModal = document.getElementById("battleResultModal");
  const resultTitle = document.getElementById("resultTitle");
  const resultMessage = document.getElementById("resultMessage");
  const rewardAmount = document.getElementById("rewardAmount");
  const claimBtn = document.getElementById("claimRewardBtn");
  const noticeModal = document.getElementById("battleNoticeModal");
  const noticeTitle = document.getElementById("noticeTitle");
  const noticeMessage = document.getElementById("noticeMessage");
  const noticeOkBtn = document.getElementById("noticeOkBtn");

  // Type effectiveness chart
  const TYPE_CHART = {
    normal: { rock: 0.5, ghost: 0, steel: 0.5 },
    fire: { fire: 0.5, water: 0.5, grass: 2, ice: 2, bug: 2, rock: 0.5, dragon: 0.5, steel: 2 },
    water: { fire: 2, water: 0.5, grass: 0.5, ground: 2, rock: 2, dragon: 0.5 },
    electric: { water: 2, electric: 0.5, grass: 0.5, ground: 0, flying: 2, dragon: 0.5 },
    grass: { fire: 0.5, water: 2, grass: 0.5, poison: 0.5, ground: 2, flying: 0.5, bug: 0.5, rock: 2, dragon: 0.5, steel: 0.5 },
    ice: { fire: 0.5, water: 0.5, grass: 2, ice: 0.5, ground: 2, flying: 2, dragon: 2, steel: 0.5 },
    fighting: { normal: 2, ice: 2, poison: 0.5, flying: 0.5, psychic: 0.5, bug: 0.5, rock: 2, ghost: 0, dark: 2, steel: 2, fairy: 0.5 },
    poison: { grass: 2, poison: 0.5, ground: 0.5, rock: 0.5, ghost: 0.5, steel: 0, fairy: 2 },
    ground: { fire: 2, electric: 2, grass: 0.5, poison: 2, flying: 0, bug: 0.5, rock: 2, steel: 2 },
    flying: { electric: 0.5, grass: 2, fighting: 2, bug: 2, rock: 0.5, steel: 0.5 },
    psychic: { fighting: 2, poison: 2, psychic: 0.5, dark: 0, steel: 0.5 },
    bug: { fire: 0.5, grass: 2, fighting: 0.5, poison: 0.5, flying: 0.5, psychic: 2, ghost: 0.5, dark: 2, steel: 0.5, fairy: 0.5 },
    rock: { fire: 2, ice: 2, fighting: 0.5, ground: 0.5, flying: 2, bug: 2, steel: 0.5 },
    ghost: { normal: 0, psychic: 2, ghost: 2, dark: 0.5 },
    dragon: { dragon: 2, steel: 0.5, fairy: 0 },
    dark: { fighting: 0.5, psychic: 2, ghost: 2, dark: 0.5, fairy: 0.5 },
    steel: { fire: 0.5, water: 0.5, electric: 0.5, ice: 2, rock: 2, steel: 0.5, fairy: 2 },
    fairy: { fire: 0.5, fighting: 2, poison: 0.5, dragon: 2, dark: 2, steel: 0.5 },
  };

  // Fetch Pokemon data
  try {
    const playerApiData = await fetch(
      `https://pokeapi.co/api/v2/pokemon/${playerPokemon.name.toLowerCase()}`
    ).then((r) => r.json());

    const aiApiData = await fetch(
      `https://pokeapi.co/api/v2/pokemon/${aiPokemon.name.toLowerCase()}`
    ).then((r) => r.json());

    playerPokemon.types = playerApiData.types.map((t) => t.type.name);
    aiPokemon.types = aiApiData.types.map((t) => t.type.name);

    setSpriteWithFallback(aiSpriteEl, aiPokemon.name, aiPokemon.pokemon_id || aiApiData.id, false);
    setSpriteWithFallback(playerSpriteEl, playerPokemon.name, playerPokemon.pokemon_id || playerApiData.id, true);
  } catch (err) {
    console.error("Failed to fetch Pokemon data:", err);
    playerPokemon.types = playerPokemon.types || ["normal"];
    aiPokemon.types = aiPokemon.types || ["normal"];
  }

  // Render Pokemon card with stats
  function renderCard(card, mon, hp) {
    const level = mon.level || 1;
    const maxHp = mon.hp || 100;
    const exp = mon.exp || 0;
    const expData = calculateLevelFromExp(exp);

    card.innerHTML = `
      <h3>${mon.name.toUpperCase()} (Lv.${level})</h3>
      <div>HP: <span class="hp-val">${Math.max(0, hp)}</span> / ${maxHp}</div>
      <div class="hp-bar-container">
        <div class="hp-bar-fill" style="width:${Math.max(0, (hp / maxHp) * 100)}%"></div>
      </div>
      <div style="font-size:0.8rem; margin-top:5px;">
        ATK: ${mon.attack || 50} | DEF: ${mon.defense || 50} | SPD: ${mon.speed || 50}
      </div>
    `;
  }

  renderCard(aiCard, aiPokemon, aiHP);
  renderCard(playerCard, playerPokemon, playerHP);

  // Load moves from PokeAPI
  async function loadMoves(name) {
    try {
      const data = await fetch(
        `https://pokeapi.co/api/v2/pokemon/${name.toLowerCase()}`
      ).then((x) => x.json());

      const moves = data.moves.slice(0, 4);
      const movePromises = moves.map(async (m) => {
        try {
          const moveData = await fetch(m.move.url).then((r) => r.json());
          return {
            name: moveData.name.replace(/-/g, " ").toUpperCase(),
            power: moveData.power || 50,
            type: moveData.type.name,
          };
        } catch {
          return { name: "TACKLE", power: 40, type: "normal" };
        }
      });

      const loadedMoves = await Promise.all(movePromises);
      return loadedMoves.length ? loadedMoves : fallbackMoves();
    } catch {
      return fallbackMoves();
    }
  }

  function fallbackMoves() {
    return [
      { name: "TACKLE", power: 40, type: "normal" },
      { name: "BITE", power: 60, type: "dark" },
      { name: "SCRATCH", power: 45, type: "normal" },
      { name: "QUICK ATTACK", power: 40, type: "normal" },
    ];
  }

  let playerMoves = await loadMoves(playerPokemon.name);

  function renderMoveButtons(moves) {
    moveContainer.innerHTML = "";
    moves.forEach((mv, i) => {
      const btn = document.createElement("button");
      btn.className = "move-btn";
      btn.dataset.index = i;
      btn.textContent = `${mv.name} (${mv.power})`;
      btn.disabled = !battleActive;
      moveContainer.appendChild(btn);
    });
  }

  renderMoveButtons(playerMoves);

  // Add message to battle log
  function log(text, color = "") {
    const p = document.createElement("p");
    p.textContent = text;
    if (color) p.style.color = color;
    battleLog.appendChild(p);
    battleLog.scrollTop = battleLog.scrollHeight;
  }

  function updateHP(card, mon, hp) {
    const hpVal = card.querySelector(".hp-val");
    const hpBar = card.querySelector(".hp-bar-fill");
    if (hpVal) hpVal.textContent = Math.max(0, hp);
    if (hpBar) hpBar.style.width = Math.max(0, (hp / (mon.hp || 100)) * 100) + "%";
  }

  // Calculate type effectiveness multiplier
  function getTypeEffectiveness(attackType, defenderTypes) {
    let multiplier = 1;
    defenderTypes.forEach((defType) => {
      const chart = TYPE_CHART[attackType] || {};
      const eff = chart[defType];
      if (eff !== undefined) multiplier *= eff;
    });
    return multiplier;
  }

  function calculateDamage(attacker, defender, movePower, moveType) {
    const attackerLevel = attacker.level || 1;
    const defenderLevel = defender.level || 1;

    const attackStat = (attacker.attack || 50) * 0.7 + (attacker.speed || 50) * 0.3;
    const baseDmg = (attackStat * movePower) / 80;

    const levelDiff = Math.min(5, Math.max(-5, attackerLevel - defenderLevel));
    const levelMod = 1 + levelDiff * 0.05;

    const typeEff = getTypeEffectiveness(moveType, defender.types || ["normal"]);
    const defMod = 150 / (150 + (defender.defense || 50));
    const randomFactor = 0.85 + Math.random() * 0.15;

    const damage = Math.floor(baseDmg * levelMod * typeEff * defMod * randomFactor);

    if (typeEff > 1) log("It's super effective!", "#4ade80");
    else if (typeEff < 1 && typeEff > 0) log("It's not very effective...", "#fbbf24");
    else if (typeEff === 0) log("It has no effect...", "#9ca3af");

    return Math.max(5, damage);
  }

  // Player attack handler
  async function playerAttack(move) {
    if (!battleActive) return;

    const dmg = calculateDamage(playerPokemon, aiPokemon, move.power, move.type);
    aiHP = Math.max(0, aiHP - dmg);

    log(`⚡ ${playerPokemon.name} used ${move.name}! (${dmg} damage)`);
    updateHP(aiCard, aiPokemon, aiHP);

    aiSpriteEl.classList.add("hit-effect");
    setTimeout(() => aiSpriteEl.classList.remove("hit-effect"), 300);

    await saveSession();

    if (aiHP <= 0) {
      await handleAIFaint();
    }
  }

  // AI attack handler
  async function aiAttack() {
    if (!battleActive) return;

    const aiMoves = await loadMoves(aiPokemon.name);
    const move = aiMoves[Math.floor(Math.random() * aiMoves.length)];

    const dmg = calculateDamage(aiPokemon, playerPokemon, move.power, move.type);
    playerHP = Math.max(0, playerHP - dmg);

    log(`💥 ${aiPokemon.name} used ${move.name}! (${dmg} damage)`, "#ef4444");
    updateHP(playerCard, playerPokemon, playerHP);

    playerSpriteEl.classList.add("hit-effect");
    setTimeout(() => playerSpriteEl.classList.remove("hit-effect"), 300);

    await saveSession();

    if (playerHP <= 0) {
      await handlePlayerFaint();
    }
  }

  // Handle AI Pokemon fainting
  async function handleAIFaint() {
    log(`🎉 ${aiPokemon.name} fainted!`, "#22c55e");
    aiIndex++;

    if (aiIndex < aiTeam.length) {
      aiPokemon = aiTeam[aiIndex];
      aiHP = aiPokemon.hp || 100;

      try {
        const newAiData = await fetch(
          `https://pokeapi.co/api/v2/pokemon/${aiPokemon.name.toLowerCase()}`
        ).then((r) => r.json());

        aiPokemon.types = newAiData.types.map((t) => t.type.name);
        setSpriteWithFallback(aiSpriteEl, aiPokemon.name, aiPokemon.id || newAiData.id, false);
      } catch (err) {
        aiPokemon.types = ["normal"];
      }

      renderCard(aiCard, aiPokemon, aiHP);
      log(`AI sent out ${aiPokemon.name}!`, "#3b82f6");
      await saveSession();
    } else {
      await handleBattleEnd(true);
    }
  }

  // Handle player Pokemon fainting
  async function handlePlayerFaint() {
    log(`💀 ${playerPokemon.name} fainted!`, "#ef4444");
    playerIndex++;

    if (playerIndex < playerTeam.length) {
      playerPokemon = playerTeam[playerIndex];
      playerHP = playerPokemon.hp || 100;

      try {
        const newPlayerData = await fetch(
          `https://pokeapi.co/api/v2/pokemon/${playerPokemon.name.toLowerCase()}`
        ).then((r) => r.json());

        playerPokemon.types = newPlayerData.types.map((t) => t.type.name);
        setSpriteWithFallback(playerSpriteEl, playerPokemon.name, playerPokemon.pokemon_id || newPlayerData.id, true);
      } catch (err) {
        playerPokemon.types = ["normal"];
      }

      renderCard(playerCard, playerPokemon, playerHP);
      log(`Go, ${playerPokemon.name}!`, "#3b82f6");

      playerMoves = await loadMoves(playerPokemon.name);
      renderMoveButtons(playerMoves);
      await saveSession();
    } else {
      await handleBattleEnd(false);
    }
  }

  // Handle battle completion
  async function handleBattleEnd(playerWon) {
    battleActive = false;

    const allBtns = moveContainer.querySelectorAll(".move-btn");
    allBtns.forEach((b) => (b.disabled = true));

    await supabase
      .from("battle_sessions")
      .update({
        player_hp: playerHP,
        ai_hp: aiHP,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", window.CURRENT_USER_ID);

if (playerWon) {
  log("🏆 VICTORY! You won the battle!", "#22c55e");
  await levelUpTeam();

  if (window.logBattleWin) {
    const aiTrainerName = session?.ai_name || "AI Trainer";
    await window.logBattleWin(
      match.chipReward,
      match.expReward,
      match.tier,
      match.mode,
      aiTrainerName,
      playerTeam[0]
    );
  }
    } else {
  log("💀 DEFEAT! Your team was defeated...", "#ef4444");
  await applyLossPenalties();

  if (window.logBattleLoss) {
    const aiTrainerName = session?.ai_name || "AI Trainer";
    await window.logBattleLoss(
      match.entryFee,
      match.tier,
      match.mode,
      aiTrainerName,
      playerTeam[0]
    );
  }
}


    showResultModal(playerWon);
  }

  // Display battle result modal
  function showResultModal(victory) {
    if (victory) {
      resultModal.className = "battle-result-modal victory";
      resultTitle.textContent = "🏆 VICTORY!";
      resultMessage.textContent = "You defeated your opponent and earned rewards!";
      rewardAmount.textContent = `${match.chipReward} PKCHP + ${match.expReward} EXP`;
      claimBtn.textContent = "Claim Rewards";
      claimBtn.dataset.victory = "true";
    } else {
      resultModal.className = "battle-result-modal defeat";
      resultTitle.textContent = "💀 DEFEAT";
      resultMessage.textContent = "Your team was defeated. You lost your entry fee!";
      rewardAmount.textContent = `Lost ${match.entryFee} PKCHP`;
      claimBtn.textContent = "Return Home";
      claimBtn.dataset.victory = "false";
    }

    claimBtn.disabled = false;
    resultModal.classList.add("show");
  }

  function showNoticeModal(title, message, onClose) {
    if (!noticeModal) {
      if (onClose) onClose();
      return;
    }

    noticeTitle.textContent = title || "NOTICE";
    noticeMessage.textContent = message || "";
    noticeModal.classList.add("show");
    noticeOkBtn.disabled = false;
    noticeOkBtn.onclick = () => {
      noticeModal.classList.remove("show");
      if (onClose) onClose();
    };
  }

  // Claim rewards button handler
  claimBtn.addEventListener("click", async () => {
    claimBtn.disabled = true;

    const isVictory = claimBtn.dataset.victory === "true";
    claimBtn.textContent = isVictory ? "Claiming..." : "Returning...";

    showTxModal(
      isVictory ? "CLAIMING REWARDS" : "ENDING BATTLE",
      "Please confirm the transaction in MetaMask..."
    );

    txStep1.querySelector(".tx-step-text").textContent = "Confirming transaction...";
    txStep2.querySelector(".tx-step-text").textContent = isVictory ? "Claiming PKCHP rewards..." : "Processing battle end...";
    txStep3.querySelector(".tx-step-text").textContent = isVictory ? "Finalizing rewards..." : "Returning to lobby...";
    setTxStep(1);

    let noticeTitleText = "BATTLE COMPLETE";
    let noticeMessageText = "Returning to home...";

    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();

      const battleContract = new ethers.Contract(
        window.BATTLE_REWARDS_ADDRESS,
        window.BATTLE_REWARDS_ABI,
        signer
      );

      setTxStep(2);
      txMessage.textContent = isVictory ? "Claiming your PKCHP rewards..." : "Processing battle completion...";
      
      console.log("Ending battle and claiming...");
      const tx = await battleContract.endBattleAndClaim(currentSessionId, isVictory);
      
      setTxStep(3);
      txMessage.textContent = "Waiting for blockchain confirmation...";
      await tx.wait();
      console.log("Transaction complete!");

      hideTxModal();

      if (isVictory) {
        const { data: wallet } = await supabase
          .from("user_wallet")
          .select("pokechip_balance")
          .eq("user_id", window.CURRENT_USER_ID)
          .single();

        if (wallet) {
          await supabase
            .from("user_wallet")
            .update({
              pokechip_balance: wallet.pokechip_balance + match.chipReward,
            })
            .eq("user_id", window.CURRENT_USER_ID);
        }

        noticeTitleText = "REWARDS CLAIMED";
        noticeMessageText = "Rewards claimed successfully!";
      } else {
        noticeTitleText = "BATTLE COMPLETE";
        noticeMessageText = "Better luck next time!";
      }
    } catch (err) {
      console.error("Transaction failed:", err);
      hideTxModal();
      noticeTitleText = "TRANSACTION ISSUE";
      noticeMessageText = "Transaction issue, but continuing... " + err.message;
    }

    showNoticeModal(noticeTitleText, noticeMessageText, async () => {
      await clearBattle();
      window.location.href = "home.html";
    });
  });

  // Level up team after victory
  async function levelUpTeam() {
    const expReward = match.expReward || 100;

    console.log("=== LEVEL UP TEAM ===");
    console.log("Player Team:", playerTeam);
    console.log("EXP Reward:", expReward);

    for (let i = 0; i <= Math.min(playerIndex, playerTeam.length - 1); i++) {
      const mon = playerTeam[i];

      console.log(`Processing Pokemon ${i}:`, mon);

      if (!mon) {
        console.log(`Pokemon ${i} is undefined, skipping`);
        continue;
      }

      const pokemonId = mon.id;

      if (!pokemonId) {
        console.log(`Pokemon ${mon.name} has no ID, skipping`);
        continue;
      }

      const currentLevel = mon.level || 1;
      const currentExp = mon.exp || 0;
      const cumulativeExp = getTotalExpToLevel(currentLevel) + currentExp;
      const newTotalExp = cumulativeExp + expReward;

      const levelData = calculateLevelFromExp(newTotalExp);
      const newLevel = Math.max(currentLevel, levelData.level);
      const expAtLevelStart = getTotalExpToLevel(newLevel);
      const storedExpForLevel = Math.max(0, newTotalExp - expAtLevelStart);
      const levelsGained = Math.max(0, newLevel - currentLevel);
      const statIncrease = levelsGained * 10;

      const updatePayload = {
        level: newLevel,
        exp: storedExpForLevel,
      };

      if (levelsGained > 0) {
        updatePayload.hp = (mon.hp || 100) + statIncrease;
        updatePayload.attack = (mon.attack || 50) + statIncrease;
        updatePayload.defense = (mon.defense || 50) + statIncrease;
        updatePayload.speed = (mon.speed || 50) + statIncrease;
      }

      console.log(`${mon.name}: Level ${currentLevel} -> ${newLevel}, EXP: ${currentExp} + ${expReward} = ${newTotalExp}`);
      
      try {
        const { data, error } = await supabase
          .from("user_pokemon")
          .update(updatePayload)
          .eq("id", pokemonId)
          .select();
        
        if (error) {
          console.error(`Failed to update ${mon.name}:`, error);
          log(`⚠️ Failed to update ${mon.name}`, "#ef4444");
        } else {
          console.log(`✓ Updated ${mon.name}:`, data);
          
          if (newLevel > currentLevel) {
            const statMsg =
              statIncrease > 0
                ? ` (+${statIncrease} to HP/ATK/DEF/SPD)`
                : "";
            log(`🎉 ${mon.name} leveled up to Lv.${newLevel}!${statMsg}`, "#fbbf24");
          } else {
            log(`✨ ${mon.name} gained ${expReward} EXP!`, "#22c55e");
          }
        }
      } catch (err) {
        console.error(`Exception updating ${mon.name}:`, err);
      }
    }
  }

  // Apply penalties for losing a battle
  async function applyLossPenalties() {
    console.log("=== APPLY LOSS PENALTIES ===");

    for (let i = 0; i <= Math.min(playerIndex, playerTeam.length - 1); i++) {
      const mon = playerTeam[i];

      if (!mon) continue;

      const pokemonId = mon.id;
      if (!pokemonId) continue;

      const currentLevel = mon.level || 1;

      try {
        if (currentLevel <= 5) {
          const { error } = await supabase
            .from("user_pokemon")
            .delete()
            .eq("id", pokemonId);

          if (error) {
            console.error(`Failed to delete ${mon.name}:`, error);
          } else {
            log(`💔 ${mon.name} was lost forever...`, "#dc2626");
          }
        } else {
          const newLevel = Math.max(1, currentLevel - 3);

          const { error } = await supabase
            .from("user_pokemon")
            .update({ level: newLevel })
            .eq("id", pokemonId);

          if (error) {
            console.error(`Failed to update ${mon.name}:`, error);
          } else {
            log(`📉 ${mon.name} lost 3 levels (now Lv.${newLevel})`, "#f59e0b");
          }
        }
      } catch (err) {
        console.error(`Exception with ${mon.name}:`, err);
      }
    }
  }

  // Save current battle state to database
  async function saveSession() {
    try {
      await supabase
        .from("battle_sessions")
        .update({
          player_hp: playerHP,
          ai_hp: aiHP,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", window.CURRENT_USER_ID);
    } catch (err) {
      console.error("Save session error:", err);
    }
  }

  async function clearBattle() {
    try {
      await supabase
        .from("battle_sessions")
        .delete()
        .eq("user_id", window.CURRENT_USER_ID);
    } catch (err) {
      console.error("Clear battle error:", err);
    }

    localStorage.removeItem("PCA_PENDING_MATCH");
  }

  // Generate AI opponent team based on tier
  async function generateAITeam(tier, mode, playerTeam) {
    const teamSize = mode === "team" ? 3 : 1;
    const team = [];

    for (let i = 0; i < teamSize; i++) {
      const playerLevel = playerTeam[i] ? playerTeam[i].level || 1 : 1;
      const aiMon = await generateAIfromTier(tier, playerLevel);
      team.push(aiMon);
    }

    return team;
  }

  async function generateAIfromTier(tier, playerLevel) {
    let pool = [];

    if (tier === "low") {
      pool = [...ANIMATED_POKEMON.common];
    } else if (tier === "mid") {
      pool = [...ANIMATED_POKEMON.rare, ...ANIMATED_POKEMON.epic];
    } else if (tier === "high") {
      pool = [...ANIMATED_POKEMON.epic, ...ANIMATED_POKEMON.legendary];
    } else {
      pool = [...ANIMATED_POKEMON.common];
    }

    const chosenName = pool[Math.floor(Math.random() * pool.length)];

    try {
      const data = await fetch(
        `https://pokeapi.co/api/v2/pokemon/${chosenName}`
      ).then((r) => r.json());

      const aiLevel = Math.max(1, playerLevel + Math.floor(Math.random() * 3) - 1);

      return {
        id: data.id,
        name: data.name,
        hp: Math.floor(data.stats[0].base_stat * 2 * (1 + aiLevel * 0.05)),
        attack: Math.floor(data.stats[1].base_stat * (1 + aiLevel * 0.02)),
        defense: Math.floor(data.stats[2].base_stat * (1 + aiLevel * 0.02)),
        speed: Math.floor(data.stats[5].base_stat * (1 + aiLevel * 0.02)),
        level: aiLevel,
        types: data.types.map((t) => t.type.name),
      };
    } catch (err) {
      console.error(`Failed to fetch ${chosenName}, using fallback`);
      return {
        id: 25,
        name: "pikachu",
        hp: 70,
        attack: 55,
        defense: 40,
        speed: 90,
        level: playerLevel,
        types: ["electric"],
      };
    }
  }

  // Handle move button clicks
  moveContainer.addEventListener("click", async (e) => {
    const btn = e.target.closest(".move-btn");
    if (!btn || !battleActive) return;

    const allBtns = moveContainer.querySelectorAll(".move-btn");
    allBtns.forEach((b) => (b.disabled = true));

    const move = playerMoves[btn.dataset.index];

    await playerAttack(move);
    await sleep(600);

    if (aiHP > 0 && battleActive) {
      await aiAttack();
    }

    if (battleActive) {
      allBtns.forEach((b) => (b.disabled = false));
    }
  });

  function sleep(ms) {
    return new Promise((res) => setTimeout(res, ms));
  }

  // Start battle
  log("⚔️ Battle Start!", "#3b82f6");
  log(`${playerPokemon.name} vs ${aiPokemon.name}`, "#6b7280");
});

