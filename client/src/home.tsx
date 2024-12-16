import * as RadioGroup from "@radix-ui/react-radio-group";
import { CircleAlertIcon, LoaderCircleIcon, StarIcon } from "lucide-react";
import { useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "./components/ui/alert";
import { Button } from "./components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./components/ui/tabs";
import {
  useAddFavoriteOutfit,
  useRemoveFavoriteOutfit,
  useWearables,
  type Wearable,
} from "./hooks";

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

  const [topId, setTopId] = useState(tops[0].id);
  const [bottomId, setBottomId] = useState(bottoms[0].id);

  const { mutate: addFavoriteOutfit } = useAddFavoriteOutfit();
  const { mutate: removeFavoriteOutfit } = useRemoveFavoriteOutfit();

  // TODO: get user's favorite outfits
  // TODO: fill icon depending on whether outfit is favorite or not
  // TODO: remove outfit from favorites if it's already a favorite

  return (
    <div className="flex h-screen items-center justify-center gap-16">
      <div className="relative h-full">
        <Button
          variant="ghost"
          size="icon"
          className="absolute right-4 top-4"
          onClick={() => addFavoriteOutfit({ topId, bottomId })}
        >
          <StarIcon />
        </Button>
        <img src={`/images/outfit?top_id=${topId}&bottom_id=${bottomId}`} className="h-full" />
      </div>
      <form className="h-full max-h-[75%]">
        <Tabs defaultValue="tops" className="flex h-full flex-col items-start gap-2">
          <TabsList className="shrink-0">
            <TabsTrigger value="tops">Tops</TabsTrigger>
            <TabsTrigger value="bottoms">Bottoms</TabsTrigger>
          </TabsList>
          <div className="grow overflow-y-auto [scrollbar-gutter:stable]">
            <TabsContent value="tops">
              <WearableList
                value={topId}
                onValueChange={(value) => setTopId(value)}
                wearables={tops}
              />
            </TabsContent>
            <TabsContent value="bottoms">
              <WearableList
                value={bottomId}
                onValueChange={(value) => setBottomId(value)}
                wearables={bottoms}
              />
            </TabsContent>
          </div>
        </Tabs>
      </form>
    </div>
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
      {wearables.map((wearable) => {
        return (
          <RadioGroup.Item
            key={wearable.id}
            value={wearable.id}
            className="overflow-hidden rounded-xl transition-all focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
          >
            <img
              key={wearable.id}
              src={wearable.wearable_image_url}
              className="aspect-3/4 w-48 object-cover"
            />
          </RadioGroup.Item>
        );
      })}
    </RadioGroup.Root>
  );
}
