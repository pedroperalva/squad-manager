"use client";

import type { Player } from "@/engine/types";
import { STAR_ICON } from "@/engine/stars";

interface PlayerNameWithStarProps {
  player: Pick<Player, "name" | "isStar">;
}

export default function PlayerNameWithStar({ player }: PlayerNameWithStarProps) {
  return (
    <>
      {player.name}
      {player.isStar && (
        <span className="ml-1 text-yellow-300" title="Craque">
          {STAR_ICON}
        </span>
      )}
    </>
  );
}
