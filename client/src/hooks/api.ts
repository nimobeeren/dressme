import {
  client,
  createOutfit,
  createWearables,
  deleteOutfit,
  getOutfits,
  getWearables,
  type BodyCreateWearables,
  type Outfit,
  type Wearable,
} from "@/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

// A function that used to get the auth token
let tokenGetter: (() => Promise<string>) | null = null;

// The token getter needs to be set at runtime because it uses React hooks
export function setTokenGetter(getter: () => Promise<string>) {
  tokenGetter = getter;
}

client.setConfig({
  baseUrl: import.meta.env.VITE_API_BASE_URL,
  auth: async () => {
    if (!tokenGetter) {
      throw new Error("Token getter not initialized");
    }
    return await tokenGetter();
  },
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

export function useCreateOutfit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ topId, bottomId }: { topId: string; bottomId: string }) => {
      await createOutfit({
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

export function useDeleteOutfit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await deleteOutfit({ query: { id } });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["outfits"] });
    },
  });
}

type WearablesInput = Array<{
  category: BodyCreateWearables["category"][0];
  description?: BodyCreateWearables["description"][0];
  image: BodyCreateWearables["image"][0];
}>;

export function useCreateWearables() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (wearables: WearablesInput) => {
      const formData = {
        category: wearables.map((wearable) => wearable.category),
        // Description can't be undefined because of HTTP form data limitations when sending
        // multiple items
        description: wearables.map((wearable) => wearable.description || ""),
        image: wearables.map((wearable) => wearable.image),
      };
      await createWearables({ body: formData });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["wearables"] });
    },
  });
}
