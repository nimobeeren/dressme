import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { nestedSnakeToCamelCase as camelCase } from "./utils";

export interface Wearable {
  id: string;
  category: string;
  description: string;
  wearableImageUrl: string;
}

export interface Outfit {
  id: string;
  top: Wearable;
  bottom: Wearable;
}

/** Get all wearables. */
export function useWearables() {
  return useQuery<Wearable[]>({
    queryKey: ["wearables"],
    queryFn: () => {
      return fetch("/wearables")
        .then((res) => res.json())
        .then((json) => camelCase(json));
    },
  });
}

/** Get all outfits. */
export function useOutfits() {
  return useQuery<Outfit[]>({
    queryKey: ["outfits"],
    queryFn: async () => {
      return await fetch("/outfits")
        .then((res) => res.json())
        .then((json) => camelCase(json));
    },
  });
}

function useCreateOrDeleteOutfit(shouldCreate: boolean) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ topId, bottomId }: { topId: string; bottomId: string }) => {
      const params = new URLSearchParams();
      params.set("top_id", topId);
      params.set("bottom_id", bottomId);
      await fetch(`/outfits?${params.toString()}`, {
        method: shouldCreate ? "POST" : "DELETE",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["outfits"] });
    },
  });
}

export function useCreateOutfit() {
  return useCreateOrDeleteOutfit(true);
}

export function useDeleteOutfit() {
  return useCreateOrDeleteOutfit(false);
}
