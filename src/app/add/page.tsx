import { redirect } from "next/navigation";
import { getMe } from "@/server/queries";
import { getSettings } from "@/server/settings";
import { AddClient } from "@/views/add";

export default async function Page() {
  const me = await getMe();

  if (me.avatar_image_url == null) {
    redirect("/");
  }

  return <AddClient maxUploadSize={getSettings().MAX_UPLOAD_SIZE} />;
}

// Image-processing server actions need extra execution time.
export const maxDuration = 300;
