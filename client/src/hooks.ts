import { useQuery } from "@tanstack/react-query";

export interface Wearable {
  id: string;
  category: string;
  description: string;
  wearable_image_url: string;
}

export function useWearables() {
  return useQuery<Wearable[]>({
    queryKey: ["wearables"],
    queryFn: () => {
      return fetch("/wearables").then((res) => res.json());
    },
  });
}
