import * as RadioGroup from "@radix-ui/react-radio-group";
import { CircleAlertIcon, LoaderCircleIcon, StarIcon } from "lucide-react";
import { useState } from "react";
import {
  useAddFavoriteOutfit,
  useFavoriteOutfits,
  useRemoveFavoriteOutfit,
  useWearables,
  type FavoriteOutfit,
  type Wearable,
} from "./api";
import { Alert, AlertDescription, AlertTitle } from "./components/ui/alert";
import { Button } from "./components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./components/ui/tabs";
import { cn } from "./lib/utils";

export function Home() {
  const { data: wearables, isPending, error } = useWearables();

  if (isPending) {
    return <LoaderCircleIcon className="h-16 w-16 animate-spin" />;
  }

  if (error) {
    return (
      <Alert variant={"destructive"}>
        <CircleAlertIcon className="h-4 w-4" />
        <AlertTitle>Something went wrong</AlertTitle>
        <AlertDescription>{error.message}</AlertDescription>
      </Alert>
    );
  }

  return <OutfitPicker wearables={wearables} />;
}

function OutfitPicker({ wearables }: { wearables: Wearable[] }) {
  const tops = wearables.filter((wearable) => wearable.category === "upper_body");
  const bottoms = wearables.filter((wearable) => wearable.category === "lower_body");

  const [activeTopId, setActiveTopId] = useState(tops[0].id);
  const [activeBottomId, setActiveBottomId] = useState(bottoms[0].id);

  const { data: favoriteOutfits } = useFavoriteOutfits();
  const { mutate: addFavoriteOutfit } = useAddFavoriteOutfit();
  const { mutate: removeFavoriteOutfit } = useRemoveFavoriteOutfit();
  const isFavoriteOutfit =
    favoriteOutfits &&
    favoriteOutfits.some(
      (outfit) => outfit.top.id === activeTopId && outfit.bottom.id === activeBottomId,
    );

  return (
    <div className="flex h-screen items-center justify-center gap-16">
      <div className="relative h-full shrink-0">
        <Button
          variant="ghost"
          size="icon"
          className="absolute right-4 top-4"
          onClick={() =>
            isFavoriteOutfit
              ? removeFavoriteOutfit({ topId: activeTopId, bottomId: activeBottomId })
              : addFavoriteOutfit({ topId: activeTopId, bottomId: activeBottomId })
          }
        >
          <StarIcon className={cn(isFavoriteOutfit && "fill-current")} />
        </Button>
        <img
          src={`/images/outfit?top_id=${activeTopId}&bottom_id=${activeBottomId}`}
          className="h-full"
        />
      </div>
      <form className="h-full max-h-[75%] w-full max-w-96">
        <Tabs defaultValue="tops" className="flex h-full w-full flex-col items-start gap-2">
          <TabsList className="shrink-0">
            <TabsTrigger value="favorites">
              <StarIcon className="h-4 w-4 fill-current" aria-label="favorites" />
            </TabsTrigger>
            <TabsTrigger value="tops">Tops</TabsTrigger>
            <TabsTrigger value="bottoms">Bottoms</TabsTrigger>
          </TabsList>
          <div className="min-h-full w-full grow overflow-y-auto [scrollbar-gutter:stable]">
            <TabsContent value="favorites" className="h-full">
              <FavoriteOutfitList
                outfits={favoriteOutfits}
                activeTopId={activeTopId}
                activeBottomId={activeBottomId}
                onOutfitChange={({ topId, bottomId }) => {
                  setActiveTopId(topId);
                  setActiveBottomId(bottomId);
                }}
              />
            </TabsContent>
            <TabsContent value="tops">
              <WearableList
                value={activeTopId}
                onValueChange={(value) => setActiveTopId(value)}
                wearables={tops}
              />
            </TabsContent>
            <TabsContent value="bottoms">
              <WearableList
                value={activeBottomId}
                onValueChange={(value) => setActiveBottomId(value)}
                wearables={bottoms}
              />
            </TabsContent>
          </div>
        </Tabs>
      </form>
    </div>
  );
}

function FavoriteOutfitList({
  outfits,
  activeTopId,
  activeBottomId,
  onOutfitChange,
}: {
  outfits?: FavoriteOutfit[];
  activeTopId?: string;
  activeBottomId?: string;
  onOutfitChange?: ({ topId, bottomId }: { topId: string; bottomId: string }) => void;
}) {
  if (!outfits) {
    return (
      <div className="flex h-full items-center justify-center">
        <LoaderCircleIcon className="h-8 w-8 animate-spin" />
      </div>
    );
  }
  if (outfits.length === 0) {
    return (
      <div className="flex min-h-[33%] items-center justify-center px-8">
        <p className="text-center">
          When you <StarIcon className="inline h-4 w-4 fill-current" aria-label="favorite" /> an
          outfit it will show up here.
        </p>
      </div>
    );
  }

  const activeOutfit = outfits.find(
    (outfit) => outfit.top.id === activeTopId && outfit.bottom.id === activeBottomId,
  );

  return (
    <RadioGroup.Root
      // TODO: I don't love having to store two IDs in the value, maybe create a generic Outfit with an ID in the backend after all?
      value={activeOutfit ? `${activeOutfit.top.id}:${activeOutfit.bottom.id}` : undefined}
      onValueChange={(value) => {
        const [topId, bottomId] = value.split(":");
        onOutfitChange?.({ topId, bottomId });
      }}
      className="grid grid-cols-2 content-start gap-4"
    >
      {outfits.map((outfit) => (
        <RadioGroup.Item
          key={`${outfit.top.id}:${outfit.bottom.id}`}
          value={`${outfit.top.id}:${outfit.bottom.id}`}
          className="relative overflow-hidden rounded-xl transition-all focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
        >
          <div className="absolute inset-0 z-10 [clip-path:polygon(0%0%,100%0%,0%100%)]">
            <img
              src={outfit.top.wearableImageUrl}
              className="aspect-3/4 translate-x-[-5%] translate-y-[-5%] scale-[120%] object-cover"
            />
          </div>
          <div>
            <img
              src={outfit.bottom.wearableImageUrl}
              className="aspect-3/4 translate-x-[5%] translate-y-[5%] scale-[120%] object-cover"
            />
          </div>
        </RadioGroup.Item>
      ))}
    </RadioGroup.Root>
  );
}

function WearableList({
  value,
  onValueChange,
  wearables,
}: {
  value: string;
  onValueChange: (value: string) => void;
  wearables: Wearable[];
}) {
  return (
    <RadioGroup.Root
      value={value}
      onValueChange={onValueChange}
      className="grid grid-cols-2 content-start gap-4"
    >
      {wearables.map((wearable) => (
        <RadioGroup.Item
          key={wearable.id}
          value={wearable.id}
          className="overflow-hidden rounded-xl transition-all focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
        >
          <img src={wearable.wearableImageUrl} className="aspect-3/4 object-cover" />
        </RadioGroup.Item>
      ))}
    </RadioGroup.Root>
  );
}
