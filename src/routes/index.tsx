import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "FOXGEN CRM — Commerce workspace" },
      {
        name: "description",
        content:
          "Track bot and manual sales, customers, pricing and profit for your digital products store.",
      },
      { property: "og:title", content: "FOXGEN CRM — Commerce workspace" },
      {
        property: "og:description",
        content:
          "Track bot and manual sales, customers, pricing and profit for your digital products store.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  beforeLoad: () => {
    throw redirect({ to: "/dashboard" });
  },
});
