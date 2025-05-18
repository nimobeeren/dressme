import type { Outfit, Wearable } from "@/api";
import { AuthenticatedImage } from "@/components/authenticated-image";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCreateOutfit, useDeleteOutfit, useOutfits, useWearables } from "@/hooks/api";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import * as RadioGroup from "@radix-ui/react-radio-group";
import { CircleAlertIcon, HourglassIcon, LoaderCircleIcon, PlusIcon, StarIcon } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";

export function HomePage() {
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

  // Set active top/bottom to the first completed wearable by default
  const [activeTopId, setActiveTopId] = useState(
    tops.find((top) => top.generation_status === "completed")?.id,
  );
  const [activeBottomId, setActiveBottomId] = useState(
    bottoms.find((bottom) => bottom.generation_status === "completed")?.id,
  );

  // TODO: move to parent component?
  const { data: outfits } = useOutfits();

  const { mutate: createOutfit } = useCreateOutfit();
  const { mutate: deleteOutfit } = useDeleteOutfit();
  const activeOutfit =
    outfits &&
    outfits.find((outfit) => outfit.top.id === activeTopId && outfit.bottom.id === activeBottomId);

  return (
    <div className="flex h-screen items-center justify-center gap-16">
      {/* Outfit preview */}
      <div className="relative h-full shrink-0">
        <Button
          variant="ghost"
          size="icon"
          className="absolute right-4 top-4"
          disabled={!activeTopId || !activeBottomId}
          onClick={() =>
            activeOutfit
              ? deleteOutfit(activeOutfit.id)
              : createOutfit({ topId: activeTopId!, bottomId: activeBottomId! })
          }
        >
          <StarIcon className={cn("!size-6", activeOutfit && "fill-current")} />
        </Button>
        <div className="aspect-3/4 h-full">
          {activeTopId && activeBottomId ? (
            <AuthenticatedImage
              src={`${import.meta.env.VITE_API_BASE_URL}/images/outfit?top_id=${activeTopId}&bottom_id=${activeBottomId}`}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full items-center justify-center px-8">
              <p className="text-center">Select a top and bottom to see your outfit preview.</p>
            </div>
          )}
        </div>
      </div>

      {/* Wearables picker */}
      <form className="h-full max-h-[75%] w-full max-w-96">
        <Tabs defaultValue="tops" className="flex h-full w-full flex-col gap-2">
          <div className="flex justify-between">
            <TabsList className="shrink-0">
              <TabsTrigger value="favorites">
                <StarIcon className="h-4 w-4 fill-current" aria-label="favorites" />
              </TabsTrigger>
              <TabsTrigger value="tops">Tops</TabsTrigger>
              <TabsTrigger value="bottoms">Bottoms</TabsTrigger>
            </TabsList>
            <Button asChild>
              <Link to="/add">
                Add
                <PlusIcon />
              </Link>
            </Button>
          </div>
          <div className="min-h-full w-full grow overflow-y-auto">
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
            <TabsContent value="tops" className="z-100 relative">
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
  outfits?: Outfit[];
  activeOutfit?: Outfit;
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
        if (
          !(
            newOutfit.top.generation_status === "completed" &&
            newOutfit.bottom.generation_status === "completed"
          )
        ) {
          toast({
            title: "Just a sec!",
            description:
              "One or more items in this outfit are still being generated. Check back later!",
          });
          return;
        }
        onOutfitChange?.({ topId: newOutfit.top.id, bottomId: newOutfit.bottom.id });
      }}
      className="grid grid-cols-2 content-start gap-4"
    >
      {outfits.map((outfit) => {
        const isCompleted =
          outfit.top.generation_status === "completed" &&
          outfit.bottom.generation_status === "completed";
        return (
          <RadioGroup.Item
            key={outfit.id}
            value={outfit.id}
            className={cn(
              "relative overflow-hidden rounded-xl outline-none transition-all before:absolute before:inset-0 before:z-20 before:hidden before:rounded-xl before:outline before:outline-2 before:-outline-offset-2 before:outline-ring focus-visible:before:block",
              !isCompleted && "cursor-progress",
            )}
          >
            {!isCompleted && (
              <div className="absolute inset-0 z-20 flex items-center justify-center bg-muted/50">
                <div className="rounded-full bg-muted p-4">
                  <HourglassIcon className="size-12 stroke-foreground" />
                </div>
              </div>
            )}
            <div className="absolute inset-0 z-10 drop-shadow-md">
              <div className="[clip-path:polygon(0%0%,100%0%,0%100%)]">
                <AuthenticatedImage
                  src={new URL(
                    outfit.top.wearable_image_url,
                    import.meta.env.VITE_API_BASE_URL,
                  ).toString()}
                  className="aspect-3/4 translate-x-[-5%] translate-y-[-5%] scale-[120%] object-cover"
                />
              </div>
            </div>
            <div>
              <AuthenticatedImage
                src={new URL(
                  outfit.bottom.wearable_image_url,
                  import.meta.env.VITE_API_BASE_URL,
                ).toString()}
                className="aspect-3/4 translate-x-[5%] translate-y-[5%] scale-[120%] object-cover"
              />
            </div>
          </RadioGroup.Item>
        );
      })}
    </RadioGroup.Root>
  );
}

function WearableList({
  value,
  onValueChange,
  wearables,
}: {
  value?: string;
  onValueChange: (value: string) => void;
  wearables: Wearable[];
}) {
  const { toast } = useToast();
  return (
    <RadioGroup.Root
      value={value}
      onValueChange={onValueChange}
      className="grid grid-cols-2 content-start gap-4 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
    >
      {wearables.map((wearable) => {
        const isCompleted = wearable.generation_status === "completed";
        return (
          <RadioGroup.Item
            key={wearable.id}
            value={wearable.id}
            className={cn(
              "relative overflow-hidden rounded-xl transition-all focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring",
              !isCompleted && "cursor-progress",
            )}
            onClick={(e) => {
              if (!isCompleted) {
                e.preventDefault();
                toast({
                  title: "Just a sec!",
                  description: "This item is still being generated. Check back later!",
                });
              }
            }}
          >
            {!isCompleted && (
              <div className="absolute inset-0 flex items-center justify-center bg-muted/50">
                <div className="rounded-full bg-muted p-4">
                  <HourglassIcon className="size-12 stroke-foreground" />
                </div>
              </div>
            )}
            <AuthenticatedImage
              src={new URL(
                wearable.wearable_image_url,
                import.meta.env.VITE_API_BASE_URL,
              ).toString()}
              className="aspect-3/4 min-w-full object-cover"
            />
          </RadioGroup.Item>
        );
      })}
    </RadioGroup.Root>
  );
}
