"use client";

import { ConvexProvider, ConvexReactClient } from "convex/react";
import type { ReactNode } from "react";

const url = process.env.NEXT_PUBLIC_CONVEX_URL;

const client = url ? new ConvexReactClient(url) : null;

export function ConvexClientProvider({ children }: { children: ReactNode }) {
  if (!client || !url) {
    return (
      <div className="flex min-h-svh items-center justify-center bg-[#050505] p-8 text-center text-neutral-300">
        <p className="max-w-md text-sm">
          Set <code className="text-rose-300">NEXT_PUBLIC_CONVEX_URL</code> in{" "}
          <code className="text-neutral-400">.env.local</code>. Run{" "}
          <code className="text-neutral-400">npx convex dev</code> from the{" "}
          <code className="text-neutral-400">client</code> folder to create a
          deployment and print the URL.
        </p>
      </div>
    );
  }
  return <ConvexProvider client={client}>{children}</ConvexProvider>;
}
