import GameClient from "@/components/GameClient";

export default async function GamePageWrapper({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <GameClient saveId={id} />;
}
