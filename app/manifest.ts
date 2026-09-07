import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Camporee",
    short_name: "Camporee",
    description: "Organización sencilla y divertida para tu camporee.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#F4E7C9",
    theme_color: "#1D7180",
    orientation: "portrait",
    icons: [
      { src: "/camporee-home-icon-v2.png?v=5", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/camporee-home-icon-v2.png?v=5", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
