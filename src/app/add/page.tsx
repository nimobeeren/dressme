import { redirect } from "next/navigation";
import { getMe } from "@/server/queries";
import { AddClient } from "@/views/add";

export default async function Page() {
  const me = await getMe();

  if (me.avatar_image_url == null) {
    redirect("/");
  }

  return <AddClient />;
}

// Image-processing server actions need extra execution time.
export const maxDuration = 300;
