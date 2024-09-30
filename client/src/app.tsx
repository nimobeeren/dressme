import { Button } from "@/components/ui/button";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { useState } from "react";

const tops = ["raincoat", "striped_sweater", "sweater", "tshirt", "winter_coat"];

const bottoms = ["gym_shorts", "jeans", "joggers"];

export function App() {
  const [top, setTop] = useState(tops[0]);
  const [bottom, setBottom] = useState(bottoms[0]);

  return (
    <div className="flex h-screen justify-center">
      <div className="relative">
        <img
          src={`http://localhost:8000/outfit.jpg?top=${top}&bottom=${bottom}`}
          width={768}
          height={1024}
        />
        <Button
          onClick={() => setTop(tops[(tops.indexOf(top) + tops.length - 1) % tops.length])}
          variant="ghost"
          className="absolute p-2 left-4 top-1/4 h-auto"
        >
          <ChevronLeftIcon className="h-16 w-16" />
        </Button>
        <Button
          onClick={() => setTop(tops[(tops.indexOf(top) + 1) % tops.length])}
          variant="ghost"
          className="absolute p-2 right-4 top-1/4 h-auto"
        >
          <ChevronRightIcon className="h-16 w-16" />
        </Button>
        <Button
          onClick={() =>
            setBottom(bottoms[(bottoms.indexOf(bottom) + bottoms.length - 1) % bottoms.length])
          }
          variant="ghost"
          className="absolute p-2 left-4 top-1/2 h-auto"
        >
          <ChevronLeftIcon className="h-16 w-16" />
        </Button>
        <Button
          onClick={() => setBottom(bottoms[(bottoms.indexOf(bottom) + 1) % bottoms.length])}
          variant="ghost"
          className="absolute p-2 right-4 top-1/2 h-auto"
        >
          <ChevronRightIcon className="h-16 w-16" />
        </Button>
      </div>
    </div>
  );
}
