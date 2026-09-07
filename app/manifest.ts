import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return { name:"Camporee", short_name:"Camporee", description:"Organización sencilla y divertida para tu camporee.", start_url:"/", display:"standalone", background_color:"#F6F2E8", theme_color:"#355F4A", orientation:"portrait", icons:[] };
}