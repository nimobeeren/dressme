import { redirect } from "next/navigation";
import { getAuth0 } from "@/server/auth0";
import { getMe } from "@/server/queries";
import { AddClient } from "@/views/add";

export default getAuth0().withPageAuthRequired(
  async function Page() {
    const me = await getMe();

    if (!me.has_avatar_image) {
      redirect("/");
    }

    return <AddClient />;
  },
  { returnTo: "/add" },
);

// The actions invoked from this page (createWearables, classifyWearable) do
// image decoding/compression; give them the same headroom the deleted API
// routes had.
export const maxDuration = 300;
