import {
  classifyWearable,
  createOutfit,
  createWearables,
  deleteOutfit,
  getMe,
  getOutfits,
  getWearables,
  health,
  updateAvatarImage,
} from "@/lib/api-client";
import type { Outfit, User, Wearable } from "@/shared/schemas";
import type { WearableCategory } from "@/shared/wearable-categories";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export { setTokenGetter } from "@/lib/api-client";

export function useMe() {
  return useQuery<User>({
    queryKey: ["me"],
    queryFn: () => getMe(),
    // Poll while selfie is uploaded but avatar not yet generated
    refetchInterval: (query) =>
      query.state.data?.has_selfie_image && !query.state.data?.has_avatar_image ? 3000 : false,
  });
}

export function useHealth() {
  return useQuery({
    queryKey: ["health"],
    queryFn: () => health(),
    retry: false,
    refetchInterval: (query) => (query.state.status === "error" ? 5000 : false),
  });
}

export function useUpdateAvatarImage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (image: Blob) => updateAvatarImage(image),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["me"] });
    },
  });
}

export function useWearables() {
  return useQuery<Wearable[]>({
    queryKey: ["wearables"],
    queryFn: () => getWearables(),
    refetchInterval: (query) => {
      const wearables = query.state.data;
      if (wearables?.some((w) => w.generation_status === "pending")) {
        return 5000;
      }
      return false;
    },
  });
}

type WearablesInput = Array<{
  category: WearableCategory;
  image: Blob | File;
}>;

export function useCreateWearables() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (wearables: WearablesInput) => {
      for (const wearable of wearables) {
        await createWearables([wearable]);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["wearables"] });
    },
  });
}

export function useClassifyWearable(file: File, fieldId: string) {
  return useQuery({
    queryKey: ["classify", fieldId],
    queryFn: ({ signal }) => classifyWearable(file, { signal }),
    retry: false,
    staleTime: Infinity,
    gcTime: 0,
  });
}

export function useOutfits() {
  return useQuery<Outfit[]>({
    queryKey: ["outfits"],
    queryFn: () => getOutfits(),
  });
}

export function useCreateOutfit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ topId, bottomId }: { topId: string; bottomId: string }) =>
      createOutfit({ top_id: topId, bottom_id: bottomId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["outfits"] });
    },
  });
}

export function useDeleteOutfit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteOutfit(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["outfits"] });
    },
  });
}
