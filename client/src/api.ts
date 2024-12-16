import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { nestedSnakeToCamelCase as camelCase } from "./utils";

export interface Wearable {
  id: string;
  category: string;
  description: string;
  wearableImageUrl: string;
}

export interface FavoriteOutfit {
  topId: string;
  bottomId: string;
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

/** Get all favorite outfits. */
export function useFavoriteOutfits() {
  return useQuery<FavoriteOutfit[]>({
    queryKey: ["favoriteOutfits"],
    queryFn: async () => {
      return await fetch("/favorite_outfits")
        .then((res) => res.json())
        .then((json) => camelCase(json));
    },
  });
}

/** Add or remove an outfit from favorites. */
function useAddOrRemoveFavoriteOutfit(shouldSetFavorite: boolean) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ topId, bottomId }: { topId: string; bottomId: string }) => {
      const params = new URLSearchParams();
      params.set("top_id", topId);
      params.set("bottom_id", bottomId);
      await fetch(`/favorite_outfits?${params.toString()}`, {
        method: shouldSetFavorite ? "POST" : "DELETE",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["favoriteOutfits"] });
    },
  });
}

/** Add an outfit to favorites. */
export function useAddFavoriteOutfit() {
  return useAddOrRemoveFavoriteOutfit(true);
}

/** Remove an outfit from favorites. */
export function useRemoveFavoriteOutfit() {
  return useAddOrRemoveFavoriteOutfit(false);
}
