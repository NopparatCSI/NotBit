import { demoGames } from "@marketplace/shared";
import carbonSkin from "../../public/marketplace/carbon-skin.webp";
import counterStrikeWide from "../../public/marketplace/counter-strike-2-spotlight.webp";
import counterStrikeMobile from "../../public/marketplace/counter-strike-2-spotlight-mobile.webp";
import dotaWide from "../../public/marketplace/dota-2-spotlight.webp";
import dotaMobile from "../../public/marketplace/dota-2-spotlight-mobile.webp";
import engineerCap from "../../public/marketplace/engineer-cap.webp";
import fieldPack from "../../public/marketplace/field-pack.webp";
import frontierJacket from "../../public/marketplace/frontier-jacket.webp";
import primeChassis from "../../public/marketplace/prime-chassis.webp";
import rustWide from "../../public/marketplace/rust-spotlight.webp";
import rustMobile from "../../public/marketplace/rust-spotlight-mobile.webp";
import silverMantle from "../../public/marketplace/silver-mantle.webp";
import teamFortressWide from "../../public/marketplace/team-fortress-2-spotlight.webp";
import teamFortressMobile from "../../public/marketplace/team-fortress-2-spotlight-mobile.webp";
import unturnedWide from "../../public/marketplace/unturned-spotlight.webp";
import unturnedMobile from "../../public/marketplace/unturned-spotlight-mobile.webp";
import warframeWide from "../../public/marketplace/warframe-spotlight.webp";
import warframeMobile from "../../public/marketplace/warframe-spotlight-mobile.webp";
import { GameCatalog, type CatalogGame } from "@/components/game-catalog";

const gamePresentation = {
  "counter-strike-2": {
    spotlight: { wide: counterStrikeWide, mobile: counterStrikeMobile },
    items: "Weapon skins",
    itemTypes: ["Weapon skins", "Stickers", "Cases"],
    listings: [{ name: "Carbon Weapon Skin", type: "Weapon skins", price: "0.012", artwork: carbonSkin }],
  },
  "team-fortress-2": {
    spotlight: { wide: teamFortressWide, mobile: teamFortressMobile },
    items: "Hats and cosmetics",
    itemTypes: ["Weapons", "Cosmetics", "Taunts", "War Paints"],
    listings: [{ name: "Field Engineer’s Cap", type: "Cosmetics", price: "0.004", artwork: engineerCap }],
  },
  "warframe": {
    spotlight: { wide: warframeWide, mobile: warframeMobile },
    items: "Mods and Prime parts",
    itemTypes: ["Prime parts", "Mods", "Relics", "Arcanes"],
    listings: [{ name: "Prime Chassis", type: "Prime parts", price: "0.008", artwork: primeChassis }],
  },
  "dota-2": {
    spotlight: { wide: dotaWide, mobile: dotaMobile },
    items: "Hero cosmetics and treasures",
    itemTypes: ["Hero cosmetics", "Treasures", "Taunts"],
    listings: [{ name: "Silver Mantle", type: "Hero cosmetics", price: "0.006", artwork: silverMantle }],
  },
  rust: {
    spotlight: { wide: rustWide, mobile: rustMobile },
    items: "Clothing, weapon, and deployable skins",
    itemTypes: ["Clothing skins", "Weapon skins", "Deployable skins"],
    listings: [{ name: "Frontier Jacket", type: "Clothing skins", price: "0.005", artwork: frontierJacket }],
  },
  unturned: {
    spotlight: { wide: unturnedWide, mobile: unturnedMobile },
    items: "Cosmetics and weapon skins",
    itemTypes: ["Clothing", "Backpacks", "Weapon skins"],
    listings: [{ name: "Field Pack", type: "Backpacks", price: "0.003", artwork: fieldPack }],
  },
} as const;

const games: CatalogGame[] = demoGames.map(({ slug, name }) => ({
  slug,
  name,
  ...gamePresentation[slug],
}));

export default function Home() {
  return <GameCatalog games={games} initialGame="warframe" />;
}
