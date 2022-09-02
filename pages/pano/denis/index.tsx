import { useEffect, useState } from "react";
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

export default function Index() {
  const [right, setRight] = useState<string>();
  const [left, setLeft] = useState<string>();
  const [top, setTop] = useState<string>();
  const [bottom, setBottom] = useState<string>();
  const [front, setFront] = useState<string>();
  const [back, setBack] = useState<string>();

  useEffect(() => {
    loadImage("/pano/denis/8k.avif").then((img: any) => {
      const faces = equirectToCubemapFaces(img);
      setRight(faces[0].toDataURL());
      setLeft(faces[1].toDataURL());
      setTop(faces[2].toDataURL());
      setBottom(faces[3].toDataURL());
      setFront(faces[4].toDataURL());
      setBack(faces[5].toDataURL());
    });
  }, []);

  return (
    <picture>
        <img src={right} alt="right" />
        <img src={left} alt="left" />
        <img src={top} alt="top" />
        <img src={bottom} alt="bottom" />
        <img src={front} alt="front" />
        <img src={back} alt="back" />
    </picture>
  );
}
