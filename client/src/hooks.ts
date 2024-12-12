import { useMutation, useQuery } from "@tanstack/react-query";

export interface Wearable {
  id: string;
  category: string;
  description: string;
  wearable_image_url: string;
}

/** Get all wearables. */
export function useWearables() {
  return useQuery<Wearable[]>({
    queryKey: ["wearables"],
    queryFn: () => {
      return fetch("/wearables").then((res) => res.json());
    },
  });
}

/** Add or remove an outfit from favorites. */
function useAddOrRemoveFavoriteOutfit(shouldSetFavorite: boolean) {
  return useMutation({
    mutationFn: async ({ topId, bottomId }: { topId: string; bottomId: string }) => {
      const params = new URLSearchParams();
      params.set("top_id", topId);
      params.set("bottom_id", bottomId);
      await fetch(`/favorite_outfits?${params.toString()}`, {
        method: shouldSetFavorite ? "POST" : "DELETE",
      });
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
