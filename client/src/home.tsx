import { CircleAlertIcon, LoaderCircleIcon } from "lucide-react";
import { useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "./components/ui/alert";
import { useWearables, type Wearable } from "./hooks";

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

  const [top, setTop] = useState(tops[0]);
  const [bottom, setBottom] = useState(bottoms[0]);

  return (
    <div className="flex h-screen items-center justify-center gap-16">
      <img src={`/images/outfit?top_id=${top.id}&bottom_id=${bottom.id}`} className="h-full" />
      <div className="grid h-[800px] grid-cols-2 gap-2 overflow-y-auto [scrollbar-gutter:stable]">
        {tops.map((top) => {
          return (
            <img
              key={top.id}
              src={top.wearable_image_url}
              onClick={() => setTop(top)}
              className="aspect-3/4 w-64 rounded-xl object-cover"
            />
          );
        })}
      </div>
    </div>
  );
}
