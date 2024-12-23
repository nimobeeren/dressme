import * as RadioGroup from "@radix-ui/react-radio-group";
import { CircleAlertIcon, LoaderCircleIcon, StarIcon } from "lucide-react";
import { useState } from "react";
import type { APIOutfit, APIWearable } from "./api";
import { Alert, AlertDescription, AlertTitle } from "./components/ui/alert";
import { Button } from "./components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./components/ui/tabs";
import { useAddOutfit, useOutfits, useRemoveOutfit, useWearables } from "./hooks/api";
import { useToast } from "./hooks/use-toast";
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

function OutfitPicker({ wearables }: { wearables: APIWearable[] }) {
  const tops = wearables.filter((wearable) => wearable.category === "upper_body");
  const bottoms = wearables.filter((wearable) => wearable.category === "lower_body");

  const [activeTopId, setActiveTopId] = useState(tops[0].id);
  const [activeBottomId, setActiveBottomId] = useState(bottoms[0].id);

  const { data: outfits } = useOutfits();
  const { mutate: addOutfit } = useAddOutfit();
  const { mutate: removeOutfit } = useRemoveOutfit();
  const activeOutfit =
    outfits &&
    outfits.find((outfit) => outfit.top.id === activeTopId && outfit.bottom.id === activeBottomId);

  return (
    <div className="flex h-screen items-center justify-center gap-16">
      <div className="relative h-full shrink-0">
        <Button
          variant="ghost"
          size="icon"
          className="absolute right-4 top-4"
          onClick={() =>
            activeOutfit
              ? removeOutfit(activeOutfit.id)
              : addOutfit({ topId: activeTopId, bottomId: activeBottomId })
          }
        >
          <StarIcon className={cn(activeOutfit && "fill-current")} />
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
                outfits={outfits}
                activeOutfit={activeOutfit}
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
  activeOutfit,
  onOutfitChange,
}: {
  outfits?: APIOutfit[];
  activeOutfit?: APIOutfit;
  onOutfitChange?: ({ topId, bottomId }: { topId: string; bottomId: string }) => void;
}) {
  const { toast } = useToast();

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

  return (
    <RadioGroup.Root
      value={activeOutfit?.id}
      onValueChange={(value) => {
        const newOutfit = outfits.find((outfit) => outfit.id === value);
        if (!newOutfit) {
          const message = `Couldn't find outfit with ID: ${value}`;
          console.error(message);
          toast({
            title: "Ugh, couldn't select outfit!",
            description: `Computer says: '${message}'`,
            variant: "destructive",
          });
          return;
        }
        onOutfitChange?.({ topId: newOutfit.top.id, bottomId: newOutfit.bottom.id });
      }}
      className="grid grid-cols-2 content-start gap-4"
    >
      {outfits.map((outfit) => (
        <RadioGroup.Item
          key={outfit.id}
          value={outfit.id}
          className="relative overflow-hidden rounded-xl outline-none transition-all before:absolute before:inset-0 before:z-20 before:hidden before:rounded-xl before:outline before:outline-2 before:-outline-offset-2 before:outline-ring focus-visible:before:block"
        >
          <div className="absolute inset-0 z-10 drop-shadow-md">
            <div className="[clip-path:polygon(0%0%,100%0%,0%100%)]">
              <img
                src={outfit.top.wearable_image_url}
                className="aspect-3/4 translate-x-[-5%] translate-y-[-5%] scale-[120%] object-cover"
              />
            </div>
          </div>
          <div>
            <img
              src={outfit.bottom.wearable_image_url}
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
  wearables: APIWearable[];
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
          <img src={wearable.wearable_image_url} className="aspect-3/4 object-cover" />
        </RadioGroup.Item>
      ))}
    </RadioGroup.Root>
  );
}
