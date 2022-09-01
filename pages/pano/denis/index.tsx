import { useEffect } from "react";
import equirectToCubemapFaces from "../../../hooks/useEquirectangularToCubeFaces";

function loadImage(src: string, xo?: string) {
  return new Promise(function (resolve, reject) {
    var i = new Image();
    if (xo) i.crossOrigin = xo;
    i.onload = function () {
      resolve(i);
    };
    i.onerror = reject;
    i.src = src;
  });
}

let loaded = false;

export default function Index() {
  useEffect(() => {
    if (loaded) return;
    loaded = true;

    loadImage("/pano/denis/8k.avif").then((img: any) => {
      const faces = equirectToCubemapFaces(img);
      faces.forEach(function (c) {
        document.body.appendChild(c);
      });
    });
  }, []);

  return (
    <picture>
      {/* <img src="/pano/denis/8k.avif" alt="Denis" /> */}
    </picture>
  );
}
