import { getAuth0 } from "@/server/auth";
import { getMe, getOutfits, getWearables } from "@/server/queries";
import { HomeClient } from "@/views/home";

export default getAuth0().withPageAuthRequired(async function Page() {
  const [me, wearables, outfits] = await Promise.all([getMe(), getWearables(), getOutfits()]);

  // The pending flags are derived from the same arrays the client receives, so
  // the poller's lifetime and the data it polls can never disagree.
  const wearablesPending = wearables.some((w) => w.generation_status === "pending");
  const avatarPending = me.has_selfie_image && !me.has_avatar_image;

  return (
    <HomeClient
      me={me}
      wearables={wearables}
      outfits={outfits}
      wearablesPending={wearablesPending}
      avatarPending={avatarPending}
    />
  );
});

// The actions invoked from this page (uploadSelfie) do image
// decoding/compression; give them the same headroom the deleted API route had.
export const maxDuration = 300;
