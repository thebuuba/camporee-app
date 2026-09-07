import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Camporee",
    short_name: "Camporee",
    description: "Organización sencilla y divertida para tu camporee.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#F3F2EE",
    theme_color: "#315B4A",
    orientation: "portrait",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any maskable" }],
  };
}
