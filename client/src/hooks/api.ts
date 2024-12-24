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

client.setConfig({
  baseUrl: import.meta.env.VITE_API_BASE_URL,
  throwOnError: true, // NOTE: `generate-client.ts` needs to be run to generate the correct types
});

export function useWearables() {
  return useQuery<Wearable[]>({
    queryKey: ["wearables"],
    queryFn: async () => {
      const result = await getWearables();
      return result.data;
    },
  });
}

export function useOutfits() {
  return useQuery<Outfit[]>({
    queryKey: ["outfits"],
    queryFn: async () => {
      const result = await getOutfits();
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
      await removeOutfit({ query: { id } });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["outfits"] });
    },
  });
}
