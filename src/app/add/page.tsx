"use client";

import { AddPage } from "@/views/add";
import { withAuthenticationRequired } from "@auth0/auth0-react";

const GuardedAdd = withAuthenticationRequired(AddPage);

export default function Page() {
  return <GuardedAdd />;
}
