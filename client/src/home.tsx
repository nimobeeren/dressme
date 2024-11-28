import { Button } from "@/components/ui/button";
import { ChevronLeftIcon, ChevronRightIcon, CircleAlertIcon, LoaderCircleIcon } from "lucide-react";
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
    <div className="flex h-screen justify-center">
      <div className="relative">
        <img
          src={`${import.meta.env.VITE_API_BASE_URL}/images/outfit?top_id=${top.id}&bottom_id=${bottom.id}`}
          width={768}
          height={1024}
        />
        <Button
          onClick={() => setTop(tops[(tops.indexOf(top) + tops.length - 1) % tops.length])}
          variant="ghost"
          className="absolute left-4 top-1/4 h-auto p-2"
        >
          <ChevronLeftIcon className="h-16 w-16" />
        </Button>
        <Button
          onClick={() => setTop(tops[(tops.indexOf(top) + 1) % tops.length])}
          variant="ghost"
          className="absolute right-4 top-1/4 h-auto p-2"
        >
          <ChevronRightIcon className="h-16 w-16" />
        </Button>
        <Button
          onClick={() =>
            setBottom(bottoms[(bottoms.indexOf(bottom) + bottoms.length - 1) % bottoms.length])
          }
          variant="ghost"
          className="absolute left-4 top-1/2 h-auto p-2"
        >
          <ChevronLeftIcon className="h-16 w-16" />
        </Button>
        <Button
          onClick={() => setBottom(bottoms[(bottoms.indexOf(bottom) + 1) % bottoms.length])}
          variant="ghost"
          className="absolute right-4 top-1/2 h-auto p-2"
        >
          <ChevronRightIcon className="h-16 w-16" />
        </Button>
      </div>
    </div>
  );
}
