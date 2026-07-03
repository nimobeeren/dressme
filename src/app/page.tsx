"use client";

import { HomePage } from "@/views/home";
import { withAuthenticationRequired } from "@auth0/auth0-react";

const GuardedHome = withAuthenticationRequired(HomePage);

export default function Page() {
  return <GuardedHome />;
}
