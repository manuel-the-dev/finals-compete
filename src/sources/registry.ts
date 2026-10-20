import { discordAdapter } from "./adapters/discord";
import { faceitAdapter } from "./adapters/faceit";
import { liquipediaAdapter } from "./adapters/liquipedia";
import { twitchAdapter } from "./adapters/twitch";
import { xAdapter } from "./adapters/x";
import { youtubeAdapter } from "./adapters/youtube";
import type { SourceAdapter } from "./types";

/** All data sources. Add a new source by writing an adapter and listing it here. */
export const ADAPTERS: SourceAdapter<any>[] = [liquipediaAdapter, faceitAdapter, youtubeAdapter, twitchAdapter, xAdapter, discordAdapter];

export function getAdapter(id: string) {
  const a = ADAPTERS.find((x) => x.id === id);
  if (!a) throw new Error(`Unbekannte Quelle: ${id}. Verfügbar: ${ADAPTERS.map((x) => x.id).join(", ")}`);
  return a;
}
