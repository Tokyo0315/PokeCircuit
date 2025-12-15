// COMMON
const COMMON_POKEMON = [
  { name: "pidgey", gen: 1, rarity: "Common" },
  { name: "rattata", gen: 1, rarity: "Common" },
  { name: "caterpie", gen: 1, rarity: "Common" },
  { name: "weedle", gen: 1, rarity: "Common" },
  { name: "oddish", gen: 1, rarity: "Common" },
  { name: "bellsprout", gen: 1, rarity: "Common" },
  { name: "geodude", gen: 1, rarity: "Common" },
  { name: "zubat", gen: 1, rarity: "Common" },
  { name: "spearow", gen: 1, rarity: "Common" },
  { name: "sandshrew", gen: 1, rarity: "Common" },
  { name: "meowth", gen: 1, rarity: "Common" },
  { name: "psyduck", gen: 1, rarity: "Common" },
  { name: "nidoran-m", gen: 1, rarity: "Common" },
  { name: "nidoran-f", gen: 1, rarity: "Common" },

  // Gen 2
  { name: "hoothoot", gen: 2, rarity: "Common" },
  { name: "sentret", gen: 2, rarity: "Common" },
  { name: "ledyba", gen: 2, rarity: "Common" },
  { name: "spinarak", gen: 2, rarity: "Common" },
  { name: "mareep", gen: 2, rarity: "Common" },
  { name: "wooper", gen: 2, rarity: "Common" },
  { name: "sunkern", gen: 2, rarity: "Common" },
  { name: "slugma", gen: 2, rarity: "Common" },

  // Gen 3
  { name: "zigzagoon", gen: 3, rarity: "Common" },
  { name: "wurmple", gen: 3, rarity: "Common" },
  { name: "taillow", gen: 3, rarity: "Common" },
  { name: "poochyena", gen: 3, rarity: "Common" },
  { name: "wingull", gen: 3, rarity: "Common" },
  { name: "lotad", gen: 3, rarity: "Common" },
  { name: "seedot", gen: 3, rarity: "Common" },
  { name: "meditite", gen: 3, rarity: "Common" },

  // Gen 4
  { name: "starly", gen: 4, rarity: "Common" },
  { name: "bidoof", gen: 4, rarity: "Common" },
  { name: "shinx", gen: 4, rarity: "Common" },
  { name: "burmy", gen: 4, rarity: "Common" },
  { name: "buizel", gen: 4, rarity: "Common" },

  // Gen 5
  { name: "patrat", gen: 5, rarity: "Common" },
  { name: "lillipup", gen: 5, rarity: "Common" },
  { name: "purrloin", gen: 5, rarity: "Common" },
  { name: "roggenrola", gen: 5, rarity: "Common" },

  // Gen 6
  { name: "fletchling", gen: 6, rarity: "Common" },
  { name: "scatterbug", gen: 6, rarity: "Common" },

  // Gen 7–9
  { name: "yungoos", gen: 7, rarity: "Common" },
  { name: "skwovet", gen: 8, rarity: "Common" },
  { name: "lechonk", gen: 9, rarity: "Common" },
];

// RARE
const RARE_POKEMON = [
  // Gen 1
  { name: "growlithe", gen: 1, rarity: "Rare" },
  { name: "vulpix", gen: 1, rarity: "Rare" },
  { name: "machop", gen: 1, rarity: "Rare" },
  { name: "abra", gen: 1, rarity: "Rare" },
  { name: "ponyta", gen: 1, rarity: "Rare" },
  { name: "cubone", gen: 1, rarity: "Rare" },
  { name: "pikachu", gen: 1, rarity: "Rare" },

  // Gen 2
  { name: "misdreavus", gen: 2, rarity: "Rare" },
  { name: "miltank", gen: 2, rarity: "Rare" },
  { name: "gligar", gen: 2, rarity: "Rare" },
  { name: "phanpy", gen: 2, rarity: "Rare" },

  // Gen 3
  { name: "ralts", gen: 3, rarity: "Rare" },
  { name: "sableye", gen: 3, rarity: "Rare" },
  { name: "trapinch", gen: 3, rarity: "Rare" },
  { name: "numel", gen: 3, rarity: "Rare" },

  // Gen 4
  { name: "riolu", gen: 4, rarity: "Rare" },
  { name: "carnivine", gen: 4, rarity: "Rare" },
  { name: "happiny", gen: 4, rarity: "Rare" },
  { name: "spiritomb", gen: 4, rarity: "Rare" },

  // Gen 5
  { name: "axew", gen: 5, rarity: "Rare" },
  { name: "tirtouga", gen: 5, rarity: "Rare" },
  { name: "deerling", gen: 5, rarity: "Rare" },

  // Gen 6
  { name: "honedge", gen: 6, rarity: "Rare" },
  { name: "inkay", gen: 6, rarity: "Rare" },

  // Gen 7–9
  { name: "rockruff", gen: 7, rarity: "Rare" },
];

// EPIC
const EPIC_POKEMON = [
  // Gen 1 (Kanto)
  { name: "arcanine", gen: 1, rarity: "Epic" },
  { name: "ninetales", gen: 1, rarity: "Epic" },
  { name: "gengar", gen: 1, rarity: "Epic" },
  { name: "alakazam", gen: 1, rarity: "Epic" },

  // Gen 2 (Johto)
  { name: "tyranitar", gen: 2, rarity: "Epic" },
  { name: "heracross", gen: 2, rarity: "Epic" },

  // Gen 3 (Hoenn)
  { name: "metagross", gen: 3, rarity: "Epic" },
  { name: "salamence", gen: 3, rarity: "Epic" },
  { name: "milotic", gen: 3, rarity: "Epic" },
  { name: "flygon", gen: 3, rarity: "Epic" },

  // Gen 4 (Sinnoh)
  { name: "lucario", gen: 4, rarity: "Epic" },
  { name: "garchomp", gen: 4, rarity: "Epic" },
  { name: "togekiss", gen: 4, rarity: "Epic" },

  // Gen 5 (Unova)
  { name: "hydreigon", gen: 5, rarity: "Epic" },

  // Gen 6 (Kalos)
  { name: "goodra", gen: 6, rarity: "Epic" },

  // Gen 7–9
  { name: "dragapult", gen: 8, rarity: "Epic" },
];

const MYTHICAL_POKEMON = [
  { name: "mew", rarity: "Mythical" },
  { name: "mewtwo", rarity: "Mythical" },
  { name: "celebi", rarity: "Mythical" },
  { name: "jirachi", rarity: "Mythical" },
  { name: "deoxys-attack", rarity: "Mythical" },
  { name: "phione", rarity: "Mythical" },
  { name: "manaphy", rarity: "Mythical" },
  { name: "darkrai", rarity: "Mythical" },
  { name: "shaymin-sky", rarity: "Mythical" },
  { name: "victini", rarity: "Mythical" },
  { name: "keldeo-resolute", rarity: "Mythical" },
  { name: "meloetta-aria", rarity: "Mythical" },
  { name: "genesect", rarity: "Mythical" },
  { name: "diancie", rarity: "Mythical" },
  { name: "hoopa", rarity: "Mythical" },
  { name: "volcanion", rarity: "Mythical" },
  { name: "magearna", rarity: "Mythical" },
  { name: "marshadow", rarity: "Mythical" },
  { name: "zeraora", rarity: "Mythical" },
  { name: "zarude", rarity: "Mythical" },
];

const DIVINE_POKEMON = [
  { name: "arceus", rarity: "Divine" },
  { name: "eternatus", rarity: "Divine" },
  { name: "necrozma", rarity: "Divine" },
];

// Make rarity groups available globally (for battle.js)
window.rarityData = {
  common: COMMON_POKEMON,
  rare: RARE_POKEMON,
  epic: EPIC_POKEMON,
  mythical: MYTHICAL_POKEMON,
  divine: DIVINE_POKEMON,
};
