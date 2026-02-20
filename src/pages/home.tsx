import { type Outfit, type Wearable } from "@/api";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem } from "@/components/ui/form";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCreateOutfit, useDeleteOutfit, useMe, useOutfits, useWearables } from "@/hooks/api";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import * as RadioGroup from "@radix-ui/react-radio-group";
import { CircleAlertIcon, HourglassIcon, LoaderCircleIcon, PlusIcon, StarIcon } from "lucide-react";
import { useForm, useFormContext, useWatch } from "react-hook-form";
import { Link } from "react-router";

export function HomePage() {
  const { data: wearables, isPending: wearablesIsPending, error: wearablesError } = useWearables();
  const { data: outfits, isPending: outfitsIsPending, error: outfitsError } = useOutfits();

  if (wearablesIsPending || outfitsIsPending) {
    return <LoaderCircleIcon className="h-16 w-16 animate-spin" />;
  }

  if (wearablesError || outfitsError) {
    return (
      <Alert variant={"destructive"}>
        <CircleAlertIcon className="h-4 w-4" />
        <AlertTitle>Something went wrong</AlertTitle>
        <AlertDescription>
          {[wearablesError, outfitsError]
            .filter(Boolean)
            .map((error) => error!.message)
            .join("\n\n")}
        </AlertDescription>
      </Alert>
    );
  }

  return <Main wearables={wearables} outfits={outfits} />;
}

type FormFieldValues = {
  topId?: Wearable["id"];
  bottomId?: Wearable["id"];
};

/**
 * Lets the user pick wearables and outfits and shows a generated image of the selected items on the
 * user's avatar.
 */
function Main({ wearables, outfits }: { wearables: Wearable[]; outfits: Outfit[] }) {
  const { data: me } = useMe();
  const tops = wearables.filter((wearable) => wearable.category === "upper_body");
  const bottoms = wearables.filter((wearable) => wearable.category === "lower_body");

  const form = useForm<FormFieldValues>({
    defaultValues: {
      // Default top/bottom to the first completed one, if it exists
      topId: tops.find((top) => top.generation_status === "completed")?.id,
      bottomId: bottoms.find((bottom) => bottom.generation_status === "completed")?.id,
    },
  });

  const activeTopId = useWatch({ control: form.control, name: "topId" });
  const activeBottomId = useWatch({ control: form.control, name: "bottomId" });

  const activeTop = wearables.find((w) => w.id === activeTopId);
  const activeBottom = wearables.find((w) => w.id === activeBottomId);

  // The outfit is not a form value, instead it is derived from the top/bottom form values.
  // This makes it easier to keep them in sync; we only need to set the top/bottom when selecting
  // an outfit, and the outfit is automatically set when top/bottom are selected.
  const activeOutfit = outfits.find(
    (outfit) => outfit.top.id === activeTopId && outfit.bottom.id === activeBottomId,
  );

  return (
    <Form {...form}>
      <form className="flex h-screen items-center justify-center gap-16">
        <Preview
          activeTop={activeTop}
          activeBottom={activeBottom}
          activeOutfitId={activeOutfit?.id}
          avatarImageUrl={me?.avatar_image_url ?? null}
        />
        <Picker tops={tops} bottoms={bottoms} outfits={outfits} activeOutfitId={activeOutfit?.id} />
      </form>
    </Form>
  );
}

/** Shows a generated image of the active wearables/outfit on the user's avatar. */
function Preview({
  activeTop,
  activeBottom,
  activeOutfitId,
  avatarImageUrl,
}: {
  activeTop: Wearable | undefined;
  activeBottom: Wearable | undefined;
  activeOutfitId: string | undefined;
  avatarImageUrl: string | null;
}) {
  const { mutate: createOutfit } = useCreateOutfit();
  const { mutate: deleteOutfit } = useDeleteOutfit();

  return (
    <div className="relative h-full shrink-0">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="absolute right-4 top-4"
        disabled={!activeTop || !activeBottom}
        onClick={() =>
          activeOutfitId
            ? deleteOutfit(activeOutfitId)
            : createOutfit({ topId: activeTop!.id, bottomId: activeBottom!.id })
        }
      >
        <StarIcon className={cn("!size-6", activeOutfitId && "fill-current")} />
      </Button>
      <div className="aspect-3/4 h-full">
        {activeTop && activeBottom ? (
          <div className="relative h-full w-full">
            {/*
             * The avatar is intentionally only shown when a wearable is selected.
             * Without a wearable, the avatar may be wearing arbitrary clothes from the
             * original photo, which would be confusing in the outfit builder context.
             */}
            {avatarImageUrl && (
              <img src={avatarImageUrl} className="absolute inset-0 h-full w-full object-cover" />
            )}
            {activeBottom.woa_image_url && activeBottom.woa_mask_url && (
              <img
                src={activeBottom.woa_image_url}
                className="absolute inset-0 h-full w-full object-cover"
                style={{
                  WebkitMaskImage: `url(${activeBottom.woa_mask_url})`,
                  maskImage: `url(${activeBottom.woa_mask_url})`,
                  // @ts-expect-error
                  WebkitMaskMode: "luminance",
                  maskMode: "luminance",
                  WebkitMaskSize: "100% 100%",
                  maskSize: "100% 100%",
                }}
              />
            )}
            {activeTop.woa_image_url && activeTop.woa_mask_url && (
              <img
                src={activeTop.woa_image_url}
                className="absolute inset-0 h-full w-full object-cover"
                style={{
                  WebkitMaskImage: `url(${activeTop.woa_mask_url})`,
                  maskImage: `url(${activeTop.woa_mask_url})`,
                  // @ts-expect-error
                  WebkitMaskMode: "luminance",
                  maskMode: "luminance",
                  WebkitMaskSize: "100% 100%",
                  maskSize: "100% 100%",
                }}
              />
            )}
          </div>
        ) : (
          <div className="flex h-full items-center justify-center px-8">
            <p className="text-center">Select a top and bottom to see your outfit preview.</p>
          </div>
        )}
      </div>
    </div>
  );
}

/** Lets the user pick wearables or an outfit. */
function Picker({
  tops,
  bottoms,
  outfits,
  activeOutfitId,
}: {
  tops: Wearable[];
  bottoms: Wearable[];
  outfits: Outfit[];
  activeOutfitId?: string;
}) {
  return (
    <div className="h-full max-h-[75%] w-full max-w-96">
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
            <OutfitList outfits={outfits} activeOutfitId={activeOutfitId} />
          </TabsContent>
          <TabsContent value="tops" className="z-100 relative">
            <WearableList name="topId" wearables={tops} />
          </TabsContent>
          <TabsContent value="bottoms">
            <WearableList name="bottomId" wearables={bottoms} />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}

/**
 * List of outfits which the user can pick from.
 *
 * This is not a form field, so it does not need a name.
 * */
function OutfitList({ outfits, activeOutfitId }: { outfits: Outfit[]; activeOutfitId?: string }) {
  const form = useFormContext<FormFieldValues>();

  const { toast } = useToast();

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
      value={activeOutfitId}
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

        // Set form values for top/bottom because they need to stay in sync with the active outfit
        form.setValue("topId", newOutfit.top.id);
        form.setValue("bottomId", newOutfit.bottom.id);
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
              "relative overflow-hidden rounded-xl outline-none transition-all before:absolute before:inset-0 before:z-20 before:hidden before:rounded-xl before:outline before:outline-2 before:-outline-offset-2 before:outline-ring data-[state=checked]:before:block",
              !isCompleted && "cursor-progress",
            )}
            onClick={(e) => {
              if (!isCompleted) {
                e.preventDefault();
                toast({
                  title: "Just a sec!",
                  description:
                    "One or more items in this outfit are still being generated. Check back later!",
                });
              }
            }}
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
        );
      })}
    </RadioGroup.Root>
  );
}

/**
 * List of wearables which the user can pick from.
 *
 * This is a form field, so it must be given a name.
 * */
function WearableList({
  name,
  wearables,
}: {
  /** Form field name. */
  name: keyof FormFieldValues;
  wearables: Wearable[];
}) {
  const { toast } = useToast();

  const form = useFormContext<FormFieldValues>();

  return (
    <FormField
      control={form.control}
      name={name}
      render={({ field: { onChange, ...restField } }) => (
        <FormItem>
          <FormControl>
            <RadioGroup.Root
              // Renaming onChange prop because Radix uses different name for the prop
              onValueChange={onChange}
              {...restField}
              className="grid grid-cols-2 content-start gap-4 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
            >
              {wearables.map((wearable) => {
                const isCompleted = wearable.generation_status === "completed";
                return (
                  <RadioGroup.Item
                    key={wearable.id}
                    value={wearable.id}
                    className={cn(
                      "relative overflow-hidden rounded-xl outline-2 -outline-offset-2 focus-visible:outline focus-visible:outline-ring data-[state=checked]:outline",
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
                    {/* Wearable images use signed URLs directly from R2 */}
                    <img
                      src={wearable.wearable_image_url}
                      className="aspect-3/4 min-w-full object-cover"
                    />
                  </RadioGroup.Item>
                );
              })}
            </RadioGroup.Root>
          </FormControl>
        </FormItem>
      )}
    />
  );
}
