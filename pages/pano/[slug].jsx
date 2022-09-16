import fs from "fs/promises";
import path from "path";
import Panorama from "../../components/Panorama";

function Pano() {
  return <Panorama imgUrl="8k.avif" />;
}

export async function getStaticPaths() {
  const dir = path.join(__dirname, "../../../../public/pano/");
  const paths = (await fs.readdir(dir))
    .filter((filename) => !filename.startsWith("."))
    .map((filename) => `/pano/${filename}`);
  return { paths, fallback: false };
}

export default Pano;
