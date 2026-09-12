import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Camporee",
    short_name: "Camporee",
    description: "Organización sencilla y divertida para tu camporee.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#F2EFE8",
    theme_color: "#F2EFE8",
    orientation: "portrait",
    icons: [
      { src: "/camporee-logo-v8.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/camporee-logo-v8.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
