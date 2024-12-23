import {
  addOutfit,
  client,
  getOutfits,
  getWearables,
  removeOutfit,
  type Outfit,
  type Wearable,
} from "@/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

// TODO: find a way to enable `throwOnError` globally while still correctly inferring that `result.data` is not undefined

client.setConfig({
  // Need to set base URL here because client does not respect HTML <base>
  baseUrl: import.meta.env.VITE_API_BASE_URL,
});

export function useWearables() {
  return useQuery<Wearable[]>({
    queryKey: ["wearables"],
    queryFn: async () => {
      const result = await getWearables({ throwOnError: true });
      return result.data;
    },
  });
}

export function useOutfits() {
  return useQuery<Outfit[]>({
    queryKey: ["outfits"],
    queryFn: async () => {
      const result = await getOutfits({ throwOnError: true });
      return result.data;
    },
  });
}

export function useAddOutfit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ topId, bottomId }: { topId: string; bottomId: string }) => {
      await addOutfit({
        query: {
          top_id: topId,
          bottom_id: bottomId,
        },
        throwOnError: true,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["outfits"] });
    },
  });
}

export function useRemoveOutfit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await removeOutfit({ query: { id }, throwOnError: true });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["outfits"] });
    },
  });
}
