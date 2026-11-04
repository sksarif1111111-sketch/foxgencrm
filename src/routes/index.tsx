import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Digital Store CRM — Sales ledger" },
      { name: "description", content: "Track bot and manual sales, customers, pricing and profit for your digital products store." },
      { property: "og:title", content: "Digital Store CRM — Sales ledger" },
      { property: "og:description", content: "Track bot and manual sales, customers, pricing and profit for your digital products store." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  beforeLoad: () => {
    throw redirect({ to: "/dashboard" });
  },
});
