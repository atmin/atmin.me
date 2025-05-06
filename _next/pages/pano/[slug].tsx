import fs from "fs/promises";
import path from "path";
import { useEffect, useState } from "react";
import Panorama from "../../components/Panorama";

function Pano() {
  const [resolution, setResolution] = useState<string>("8k");
  useEffect(() => {
    if (window.location.search === "?16") setResolution("16k");
  }, [setResolution]);
  return <Panorama imgUrl={`${resolution}.avif`} />;
}

export async function getStaticPaths() {
  const dir = path.join(__dirname, "../../../../public/pano/");
  const paths = (await fs.readdir(dir))
    .filter((filename) => !filename.startsWith("."))
    .map((filename) => `/pano/${filename}`);
  return { paths, fallback: false };
}

export async function getStaticProps() {
  return { props: {} };
}

export default Pano;
