import {
  addOutfit,
  getOutfits,
  getWearables,
  removeOutfit,
  type Outfit,
  type Wearable,
} from "@/api";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import * as RadioGroup from "@radix-ui/react-radio-group";
import { CircleAlertIcon, LoaderCircleIcon, PlusIcon, StarIcon } from "lucide-react";
import { useState } from "react";
import { useFetcher } from "react-router";
import type { Route } from "./+types/home";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Virtual Wardrobe" },
    { name: "description", content: "Try on clothes virtually just by uploading pictures." },
  ];
}

export async function clientLoader({}: Route.ClientLoaderArgs) {
  const [wearables, outfits] = await Promise.all([getWearables(), getOutfits()]);
  return { wearables, outfits };
}

export async function clientAction({ request }: Route.ClientActionArgs) {
  const formData = await request.formData();
  if (request.method === "POST") {
    await addOutfit({
      query: {
        top_id: formData.get("topId") as string,
        bottom_id: formData.get("bottomId") as string,
      },
    });
  } else if (request.method === "DELETE") {
    await removeOutfit({
      query: {
        id: formData.get("outfitId") as string,
      },
    });
  }
}

export default function Home({ loaderData }: Route.ComponentProps) {
  const wearables = loaderData.wearables.data;
  const outfits = loaderData.outfits.data;
  const isPending = false;
  const error = null;

  // TODO: figure out what happens during loading
  if (isPending) {
    return <LoaderCircleIcon className="h-16 w-16 animate-spin" />;
  }

  // TODO: error handling
  if (error) {
    return (
      <Alert variant={"destructive"}>
        <CircleAlertIcon className="h-4 w-4" />
        <AlertTitle>Something went wrong</AlertTitle>
        {/* @ts-expect-error */}
        <AlertDescription>{error.message}</AlertDescription>
      </Alert>
    );
  }

  return <OutfitPicker wearables={wearables} outfits={outfits} />;
}

function OutfitPicker({ wearables, outfits }: { wearables: Wearable[]; outfits: Outfit[] }) {
  const tops = wearables.filter((wearable) => wearable.category === "upper_body");
  const bottoms = wearables.filter((wearable) => wearable.category === "lower_body");

  const [activeTopId, setActiveTopId] = useState(tops[0]?.id);
  const [activeBottomId, setActiveBottomId] = useState(bottoms[0]?.id);

  const fetcher = useFetcher();

  const activeOutfit =
    outfits &&
    outfits.find((outfit) => outfit.top.id === activeTopId && outfit.bottom.id === activeBottomId);

  return (
    <div className="flex h-screen items-center justify-center gap-16">
      <div className="relative h-full shrink-0">
        <fetcher.Form method={activeOutfit ? "delete" : "post"}>
          {activeOutfit && <input type="hidden" name="outfitId" value={activeOutfit.id} />}
          <input type="hidden" name="topId" value={activeTopId} />
          <input type="hidden" name="bottomId" value={activeBottomId} />
          <Button type="submit" variant="ghost" size="icon" className="absolute right-4 top-4">
            <StarIcon className={cn("!size-6", activeOutfit && "fill-current")} />
          </Button>
        </fetcher.Form>
        <img
          src={`${import.meta.env.VITE_API_BASE_URL}/images/outfit?top_id=${activeTopId}&bottom_id=${activeBottomId}`}
          className="aspect-3/4 h-full"
        />
      </div>
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
            <Button>
              Add
              <PlusIcon />
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
                src={new URL(
                  outfit.top.wearable_image_url,
                  import.meta.env.VITE_API_BASE_URL,
                ).toString()}
                className="aspect-3/4 translate-x-[-5%] translate-y-[-5%] scale-[120%] object-cover"
              />
            </div>
          </div>
          <div>
            <img
              src={new URL(
                outfit.bottom.wearable_image_url,
                import.meta.env.VITE_API_BASE_URL,
              ).toString()}
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
          <img
            src={new URL(wearable.wearable_image_url, import.meta.env.VITE_API_BASE_URL).toString()}
            className="aspect-3/4 object-cover"
          />
        </RadioGroup.Item>
      ))}
    </RadioGroup.Root>
  );
}
